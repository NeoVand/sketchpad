/**
 * Draws the sheet: the paper, the training sprites scaled with nearest-neighbour sampling (the operands in ink, what the
 * model writes in rose), the fovea (the three
 * cells being read) gliding between positions, newly written glyphs fading in, and a camera that follows the eye
 * on sheets wider than the view. Plain canvas code driven by requestAnimationFrame; the page calls sync() after each
 * tick and setSource() for a new problem.
 */
import type { SheetSource } from './sources.ts';
import { CELL, GLYPHS } from './sprites.ts';
import { SHEET, type SheetPalette } from './theme.svelte.ts';

const FOCUS_MS = 850;
const HOVER_MS = 250;
/** the ink of a scratch row (carries), relative to the numbers */
const DIM_INK = 0.45;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

interface Frame {
	fx: number;
	fy: number;
	tx: number;
	ty: number;
	/** visibility from and to */
	fa: number;
	ta: number;
	t0: number;
	dur: number;
}

export interface Metrics {
	cs: number;
	padX: number;
	/** the whole problem fits the paper (no panning); `left` is then where its first column starts, in CSS px */
	fits: boolean;
	left: number;
	padY: number;
	ruleGap: number;
	rowY: number[];
	height: number;
}

export class SheetView {
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private sprites: HTMLImageElement | null = null;
	private src: SheetSource | null = null;
	private dpr = 1;
	private cssW = 0;
	cs = 32;
	padX = 20;
	padY = 18;
	ruleGap = 14;

	private shown: string[][] = [];
	/** per cell: the model wrote the glyph shown during this run (drawn in the palette's `wrote` ink) */
	private wrote: Uint8Array[] = [];
	private prev: string[][] = [];
	private changedAt: Float64Array[] = [];
	private fadeMs = 220;
	private glideMs = 160;

	private cam = 0;
	private camTarget = 0;
	private tween: { from: number; to: number; t0: number } | null = null;
	private manualUntil = 0;
	private lastFrame = 0;

	/** the eye's frames, by key (a strip cell's place, and its pass when several passes run) */
	private frames = new Map<string, Frame>();
	private hover: { r: number; c: number; t0: number } | null = null;
	private hoverOut: { r: number; c: number; t0: number } | null = null;
	private edited = new Set<string>();
	private raf = 0;
	private animatingUntil = 0;
	onMetrics?: (m: Metrics) => void;
	/** 0..1 visible window over the whole sheet, for the position rail */
	onWindow?: (from: number, to: number) => void;

	constructor(canvas: HTMLCanvasElement) {
		this.canvas = canvas;
		this.ctx = canvas.getContext('2d')!;
		// a GPU reset wipes canvases: the browser restores this one blank, and the ink sheets are made again
		canvas.addEventListener('contextrestored', this.restored);
	}

	private restored = () => {
		this.inks.clear();
		this.kick();
	};

	private palette: SheetPalette = SHEET;
	/** the sprites as ink, by colour: each pixel the colour at alpha (255 - grey), so any paper shows through */
	private inks = new Map<string, HTMLCanvasElement>();

	setSprites(img: HTMLImageElement) {
		this.sprites = img;
		this.inks.clear();
		this.kick();
	}

	setPalette(p: SheetPalette) {
		this.palette = p;
		this.inks.clear();
		this.kick();
	}

	/**
	 * Recolour the sprite sheet. The sprites are pure grey (black ink on white), so alpha = 255 - grey is exact: black
	 * ink over white paper gives back the training pixels, and light ink over a dark sheet gives their negative.
	 */
	private inkSheet(color = this.palette.ink): HTMLCanvasElement | null {
		const have = this.inks.get(color);
		if (have || !this.sprites) return have ?? null;
		const img = this.sprites;
		const c = document.createElement('canvas');
		c.width = img.naturalWidth;
		c.height = img.naturalHeight;
		const x = c.getContext('2d', { willReadFrequently: true })!;
		x.drawImage(img, 0, 0);
		const d = x.getImageData(0, 0, c.width, c.height);
		const n = parseInt(color.slice(1), 16);
		const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
		for (let i = 0; i < d.data.length; i += 4) {
			const a = 255 - d.data[i];
			d.data[i] = r;
			d.data[i + 1] = g;
			d.data[i + 2] = b;
			d.data[i + 3] = a;
		}
		x.putImageData(d, 0, 0);
		this.inks.set(color, c);
		return c;
	}

	/** a smaller sheet (24 px cells, down to 18 to fit a problem whole), so the inside of the model fits beside it */
	compact = false;
	/** room kept inside the paper, left of the problem, for the row labels (compact sheets) */
	reserve = 0;
	/** the largest cell size for this screen; compact sheets go smaller only to fit a problem whole */
	private csMax = 32;

	/** lay out for a CSS width; the cell size follows the width and the screen's pixel ratio */
	resize(cssW: number) {
		this.dpr = Math.max(1, Math.round((globalThis.devicePixelRatio || 1) * 4) / 4);
		const narrow = cssW < 520 || this.compact;
		// whole device pixels per sprite pixel where possible, so the glyphs stay crisp
		this.csMax = narrow ? (this.dpr >= 2.5 ? 64 / this.dpr : 24) : 32;
		this.padX = narrow ? 12 : 20;
		this.padY = narrow ? (this.compact ? 8 : 12) : 18;
		this.ruleGap = narrow ? (this.compact ? 6 : 10) : 14;
		this.cssW = Math.max(120, Math.floor(cssW));
		this.pickCs();
		this.layout();
		this.cam = this.camTarget = this.targetCam();
		this.tween = null;
		this.kick();
	}

	/**
	 * The cell size: the largest of csMax, 22, 20, 18 at which a compact sheet shows its whole problem (so it never
	 * scrolls when it could fit); csMax when none does, and the sheet pans.
	 */
	private pickCs() {
		this.cs = this.csMax;
		if (!this.compact || !this.src) return;
		const room = this.cssW - 2 * this.padX - this.reserve;
		for (const cs of [this.csMax, 22, 20, 18])
			if (cs <= this.csMax && this.src.cols * cs <= room) {
				this.cs = cs;
				return;
			}
	}

	/** where the problem's area starts: after the padding and the labels' room */
	private get offX() {
		return this.padX + this.reserve;
	}
	private get viewW() {
		return this.cssW - this.offX - this.padX;
	}
	private get contentW() {
		return (this.src?.cols ?? 0) * this.cs;
	}

	metrics(): Metrics {
		const rows = this.src?.rows ?? [];
		const rowY: number[] = [];
		let y = this.padY;
		rows.forEach((row, r) => {
			if (row.ruleBefore && r > 0) y += this.ruleGap;
			rowY.push(y);
			y += this.cs;
		});
		const room = this.viewW - this.contentW;
		return {
			cs: this.cs,
			padX: this.padX,
			fits: room >= 0,
			left: this.offX + Math.max(0, this.compact ? room / 2 : room),
			padY: this.padY,
			ruleGap: this.ruleGap,
			rowY,
			height: y + this.padY
		};
	}

	private layout() {
		const m = this.metrics();
		const h = Math.max(m.height, 60);
		this.canvas.width = Math.round(this.cssW * this.dpr);
		this.canvas.height = Math.round(h * this.dpr);
		this.canvas.style.width = `${this.cssW}px`;
		this.canvas.style.height = `${h}px`;
		this.onMetrics?.(m);
	}

	/** a new problem: the sheet fades in where it changed, the camera and the eye jump to the start */
	setSource(src: SheetSource | null, now = performance.now()) {
		const old = this.src;
		const sameShape = old && src && old.cols === src.cols && old.rows === src.rows;
		this.src = src;
		this.edited.clear();
		this.hover = this.hoverOut = null;
		const R = src?.rows.length ?? 0;
		const C = src?.cols ?? 0;
		const prevShown = sameShape ? this.shown : null;
		this.shown = [];
		this.prev = [];
		this.changedAt = [];
		this.wrote = Array.from({ length: R }, () => new Uint8Array(C));
		for (let r = 0; r < R; r++) {
			const row: string[] = [];
			const prow: string[] = [];
			const t = new Float64Array(C);
			for (let c = 0; c < C; c++) {
				const g = src!.glyph(r, c);
				const p = prevShown ? prevShown[r][c] : ' ';
				row.push(g);
				prow.push(p);
				t[c] = g === p ? -1e9 : now;
				// a sheet that says who wrote each cell (a calculator sheet shown part way through a run)
				if (src!.mine && g !== ' ') this.wrote[r][c] = src!.mine(r, c) ? 1 : 0;
			}
			this.shown.push(row);
			this.prev.push(prow);
			this.changedAt.push(t);
		}
		this.pickCs();
		this.layout();
		this.cam = this.camTarget = this.targetCam();
		this.tween = null;
		this.frames.clear();
		this.placeFovea(now, true);
		this.animatingUntil = Math.max(this.animatingUntil, now + this.fadeMs + 50);
		this.kick();
	}

	/** after a tick: fade what changed, glide the eye, follow it. `tickMs` paces the motion. */
	sync(tickMs: number, now = performance.now()) {
		const src = this.src;
		if (!src) return;
		this.glideMs = clamp(tickMs * 0.8, 70, 420);
		this.fadeMs = clamp(tickMs * 1.2, 90, 260);
		for (let r = 0; r < src.rows.length; r++)
			for (let c = 0; c < src.cols; c++) {
				const g = src.glyph(r, c);
				if (g !== this.shown[r][c]) {
					this.prev[r][c] = this.shown[r][c];
					this.shown[r][c] = g;
					this.changedAt[r][c] = now;
					// a glyph that appears during the run is the model's, unless a visitor just changed it
					if (!src.mine) this.wrote[r][c] = g !== ' ' && !this.edited.has(`${r},${c}`) ? 1 : 0;
				}
				// a sheet that says who wrote each cell: the layout can move the model's digits, and lay its own
				if (src.mine) this.wrote[r][c] = g !== ' ' && src.mine(r, c) ? 1 : 0;
			}
		this.placeFovea(now, false);
		this.follow(now);
		this.animatingUntil = Math.max(
			this.animatingUntil,
			now + Math.max(this.fadeMs, this.glideMs) + 50
		);
		this.kick();
	}

	markEdited(r: number, c: number) {
		this.edited.add(`${r},${c}`);
		if (this.wrote[r]) this.wrote[r][c] = 0;
	}

	private placeFovea(now: number, jump: boolean) {
		const cells = this.src?.fovea() ?? [];
		const m = this.metrics();
		const live = new Set<string>();
		cells.forEach((cell, k) => {
			if (!cell) return;
			const key = cell.key ?? String(k);
			live.add(key);
			const cur = this.frames.get(key);
			const at = cur ? this.frameAt(cur, now) : null;
			const tx = cell.c * this.cs;
			const ty = m.rowY[cell.r];
			if (!cur || jump || at!.a === 0)
				this.frames.set(key, {
					fx: tx,
					fy: ty,
					tx,
					ty,
					fa: jump ? 1 : 0,
					ta: 1,
					t0: now,
					dur: jump ? 0 : 250
				});
			else
				this.frames.set(key, {
					fx: at!.x,
					fy: at!.y,
					tx,
					ty,
					fa: at!.a,
					ta: 1,
					t0: now,
					dur: this.glideMs
				});
		});
		// an eye no longer in use fades where it is, then goes
		for (const [key, cur] of this.frames) {
			if (live.has(key)) continue;
			const at = this.frameAt(cur, now);
			if (at.a <= 0.01 && cur.ta === 0) {
				this.frames.delete(key);
				continue;
			}
			if (cur.ta !== 0)
				this.frames.set(key, {
					...cur,
					fx: at.x,
					fy: at.y,
					tx: at.x,
					ty: at.y,
					fa: at.a,
					ta: 0,
					t0: now,
					dur: 300
				});
		}
		// keep drawing until every frame has finished gliding or fading
		for (const f of this.frames.values())
			this.animatingUntil = Math.max(this.animatingUntil, f.t0 + f.dur + 50);
	}

	private frameAt(f: Frame, now: number) {
		const t = f.dur <= 0 ? 1 : clamp((now - f.t0) / f.dur, 0, 1);
		const e = easeInOut(t);
		return {
			x: f.fx + (f.tx - f.fx) * e,
			y: f.fy + (f.ty - f.fy) * e,
			a: f.fa + (f.ta - f.fa) * e
		};
	}

	/** where the camera wants to be: the eye about 60% across, so more of what comes next shows */
	private targetCam() {
		const over = this.contentW - this.viewW;
		// a problem that fits sits right-aligned like a written sum, or centred on a compact sheet
		if (over <= 0) return this.compact ? over / 2 : over;
		const cells = (this.src?.fovea() ?? []).filter((c): c is { r: number; c: number } => !!c);
		// no eye (the run is over): finish the move already under way
		if (!cells.length) return clamp(this.camTarget, 0, over);
		const lo = Math.min(...cells.map((c) => c.c)) * this.cs;
		const hi = (Math.max(...cells.map((c) => c.c)) + 1) * this.cs;
		const center = (lo + hi) / 2;
		let cam = center - 0.6 * this.viewW;
		// keep the whole strip in view when it spans wide
		cam = Math.min(cam, lo - this.cs);
		cam = Math.max(cam, hi + this.cs - this.viewW);
		return clamp(cam, 0, over);
	}

	private follow(now: number) {
		if (now < this.manualUntil) return;
		const t = this.targetCam();
		if (Math.abs(t - this.cam) > 0.45 * this.viewW) this.tween = { from: this.cam, to: t, t0: now };
		this.camTarget = t;
	}

	/** manual panning (wheel or drag); the camera follows the eye again a moment later */
	panBy(dx: number, now = performance.now()) {
		const over = this.contentW - this.viewW;
		if (over <= 0) return;
		this.cam = clamp(this.cam + dx, 0, over);
		this.camTarget = this.cam;
		this.tween = null;
		this.manualUntil = now + 2500;
		this.kick();
	}

	get canPan() {
		return this.contentW > this.viewW;
	}

	/** the cell under a point in CSS px, if any */
	cellAt(px: number, py: number): { r: number; c: number } | null {
		if (!this.src) return null;
		const m = this.metrics();
		const c = Math.floor((px - this.offX + this.cam) / this.cs);
		if (c < 0 || c >= this.src.cols) return null;
		const r = m.rowY.findIndex((y) => py >= y && py < y + this.cs);
		return r < 0 ? null : { r, c };
	}

	setHover(cell: { r: number; c: number } | null, now = performance.now()) {
		const same = (a: { r: number; c: number } | null, b: { r: number; c: number } | null) =>
			a?.r === b?.r && a?.c === b?.c;
		if (same(cell, this.hover)) return;
		if (this.hover) this.hoverOut = { ...this.hover, t0: now };
		this.hover = cell ? { ...cell, t0: now } : null;
		this.animatingUntil = Math.max(this.animatingUntil, now + HOVER_MS + 30);
		this.kick();
	}

	private kick() {
		if (this.raf) return;
		this.raf = requestAnimationFrame((t) => this.frame(t));
	}

	destroy() {
		this.canvas.removeEventListener('contextrestored', this.restored);
		cancelAnimationFrame(this.raf);
		this.raf = 0;
	}

	private frame(now: number) {
		this.raf = 0;
		const dt = this.lastFrame ? Math.min(64, now - this.lastFrame) : 16;
		this.lastFrame = now;
		let moving = false;
		if (this.tween) {
			const t = clamp((now - this.tween.t0) / FOCUS_MS, 0, 1);
			this.cam = this.tween.from + (this.tween.to - this.tween.from) * easeInOut(t);
			if (t >= 1) this.tween = null;
			moving = true;
		} else if (Math.abs(this.camTarget - this.cam) > 0.05) {
			this.cam += (this.camTarget - this.cam) * (1 - Math.exp(-dt / 200));
			moving = true;
		} else this.cam = this.camTarget;
		this.draw(now);
		if (moving || now < this.animatingUntil) this.kick();
		else this.lastFrame = 0;
	}

	private draw(now: number) {
		const { ctx, src } = this;
		const W = this.cssW;
		const m = this.metrics();
		ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		// whole device pixels per sprite pixel stay sharp; other scales are smoothed
		ctx.imageSmoothingEnabled = (this.cs * this.dpr) % CELL !== 0;
		ctx.globalAlpha = 1;
		// no problem yet: no paper either (an empty tint would read as a box)
		ctx.clearRect(0, 0, W, Math.max(m.height, 60));
		if (!src) return;
		ctx.fillStyle = this.palette.paper;
		ctx.fillRect(0, 0, W, m.height);
		if (!this.inkSheet()) return;
		const cs = this.cs;
		const x0 = this.offX - this.cam;
		const c0 = clamp(Math.floor((this.cam - this.offX) / cs), 0, src.cols);
		const c1 = clamp(Math.ceil((this.cam + W) / cs), 0, src.cols);

		// hover tint on a cell that can be changed
		const tint = (h: { r: number; c: number; t0: number } | null, inn: boolean) => {
			if (!h || h.r >= m.rowY.length) return;
			const t = clamp((now - h.t0) / HOVER_MS, 0, 1);
			const a = inn ? easeInOut(t) : 1 - easeInOut(t);
			if (a <= 0) return;
			ctx.globalAlpha = a;
			ctx.fillStyle = this.palette.tint;
			roundRect(ctx, x0 + h.c * cs + 1, m.rowY[h.r] + 1, cs - 2, cs - 2, 3);
			ctx.fill();
			ctx.globalAlpha = 1;
		};
		tint(this.hoverOut, false);
		tint(this.hover, true);

		// glyphs
		for (let r = 0; r < src.rows.length; r++) {
			const sy = src.rows[r].sprite * CELL;
			const y = m.rowY[r];
			// carries are scratch: drawn at half ink, so they never read as the numbers
			const ink = src.rows[r].dim ? DIM_INK : 1;
			for (let c = c0; c < c1; c++) {
				const x = x0 + c * cs;
				const g = this.shown[r][c];
				const p = this.prev[r][c];
				const t = clamp((now - this.changedAt[r][c]) / this.fadeMs, 0, 1);
				const color = this.wrote[r]?.[c] ? this.palette.wrote : this.palette.ink;
				if (t < 1 && p !== ' ') {
					ctx.globalAlpha = ink * (1 - easeInOut(t));
					this.glyph(p, sy, x, y, color);
				}
				if (g !== ' ') {
					ctx.globalAlpha = ink * (t < 1 ? easeInOut(t) : 1);
					this.glyph(g, sy, x, y, color);
				}
			}
		}
		ctx.globalAlpha = 1;

		// decimal points: layout, in ink, on the line between the units digit and the first decimal
		ctx.fillStyle = this.palette.ink;
		for (const p of src.points?.() ?? []) {
			if (p.c < c0 - 1 || p.c >= c1 || p.r >= m.rowY.length) continue;
			ctx.globalAlpha = src.rows[p.r].dim ? DIM_INK : 1;
			ctx.beginPath();
			ctx.arc(
				x0 + (p.c + 1) * cs,
				m.rowY[p.r] + cs * 0.8,
				Math.max(1.4, cs * 0.065),
				0,
				Math.PI * 2
			);
			ctx.fill();
		}
		ctx.globalAlpha = 1;

		// a pencil mark under each digit a visitor changed
		ctx.fillStyle = this.palette.mark;
		for (const key of this.edited) {
			const [r, c] = key.split(',').map(Number);
			if (c < c0 || c >= c1) continue;
			ctx.fillRect(x0 + c * cs + cs * 0.3, m.rowY[r] + cs - 3, cs * 0.4, 1.5);
		}

		// ruled lines
		ctx.fillStyle = this.palette.rule;
		src.rows.forEach((row, r) => {
			if (!row.ruleBefore || r === 0) return;
			const y = Math.round((m.rowY[r] - this.ruleGap / 2) * this.dpr) / this.dpr;
			const a = Math.max(x0, this.offX - 8);
			const b = Math.min(x0 + src.cols * cs, W - this.padX + 8);
			if (b > a) ctx.fillRect(a, y, b - a, 1);
		});

		// the fovea
		ctx.strokeStyle = this.palette.fovea;
		ctx.lineWidth = 1.5;
		for (const f of this.frames.values()) {
			const at = this.frameAt(f, now);
			if (at.a <= 0.01) continue;
			ctx.globalAlpha = at.a * 0.9;
			roundRect(ctx, x0 + at.x + 1.25, at.y + 1.25, cs - 2.5, cs - 2.5, 4);
			ctx.stroke();
		}
		ctx.globalAlpha = 1;

		// soft paper edges where the sheet runs on beyond the view
		const over = this.contentW - this.viewW;
		if (over > 0) {
			const fade = (from: number, to: number, show: boolean) => {
				if (!show) return;
				const g = ctx.createLinearGradient(from, 0, to, 0);
				g.addColorStop(0, this.palette.paper);
				g.addColorStop(1, this.palette.paper + '00');
				ctx.fillStyle = g;
				ctx.fillRect(Math.min(from, to), 0, Math.abs(to - from), m.height);
			};
			// a panned compact sheet keeps its labels' room as plain paper
			if (this.reserve && this.cam > 1) {
				ctx.fillStyle = this.palette.paper;
				ctx.fillRect(0, 0, this.offX - 4, m.height);
				fade(this.offX - 4, this.offX + 24, true);
			} else fade(0, this.padX + 28, this.cam > 1);
			fade(W, W - this.padX - 28, this.cam < over - 1);
			this.onWindow?.(this.cam / this.contentW, (this.cam + this.viewW) / this.contentW);
		} else this.onWindow?.(0, 1);
	}

	private glyph(g: string, sy: number, x: number, y: number, color = this.palette.ink) {
		const gi = GLYPHS.indexOf(g);
		if (gi < 0) return;
		const sheet = this.inkSheet(color);
		if (sheet) this.ctx.drawImage(sheet, gi * CELL, sy, CELL, CELL, x, y, this.cs, this.cs);
	}
}

function roundRect(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	r: number
) {
	ctx.beginPath();
	ctx.roundRect(x, y, w, h, r);
}
