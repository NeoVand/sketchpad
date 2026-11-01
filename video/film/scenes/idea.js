/**
 * Shot 3, the idea: the sheet of the recorded multiplication 4,821 × 3,967, one view at a time. Every view and every
 * answer is the published model's, from static/recordings/machine.json, replayed through the page's own runtime
 * (video/film/build-data.ts); the strip is drawn from the model's sprite sheet, as the worker draws it.
 */
import { h, svg, ep, prog, E, st, rise, lerp, inout, C, mix, clamp } from '../lib.js';

const NEXT = {
	A: 'add',
	Z: 'add the last carry',
	M: 'multiply',
	F: 'flush',
	N: 'next digit',
	H: 'halt'
};
const sprites = new Image();
sprites.src = '/static/sketchpad/sprites.png';
const GLYPHS = ' 0123456789';

/** the 32 × 96 strip the model reads, drawn from the sprite sheet: cell k is the glyph as drawn at strip row k */
export function drawStrip(canvas, cells) {
	const g = canvas.getContext('2d');
	g.fillStyle = '#fff';
	g.fillRect(0, 0, 32, 96);
	cells.forEach((ch, k) => {
		const i = GLYPHS.indexOf(ch);
		if (i >= 0) g.drawImage(sprites, i * 32, k * 32, 32, 32, 0, k * 32, 32, 32);
	});
}
export const spritesReady = () => (sprites.complete ? Promise.resolve() : sprites.decode());

export default function idea(root, D, ctx, sc) {
	const M = D.mul;
	const T0 = sc.start;
	const W = M.cols;
	// everything is laid out at 1:1 and scaled up as a group, centred in the frame
	root = h(
		'div',
		{
			class: 'abs',
			style: {
				left: '0',
				top: '0',
				width: '1920px',
				height: '1080px',
				transformOrigin: '960px 540px',
				transform: 'translate(54px, -6px) scale(1.08)'
			}
		},
		root
	);
	// ---- the sheet -----------------------------------------------------------------------------------------------
	const P = { left: 120, top: 300, w: 720, h: 420 };
	const panel = h(
		'div',
		{
			class: 'abs',
			style: {
				left: `${P.left}px`,
				top: `${P.top}px`,
				width: `${P.w}px`,
				height: `${P.h}px`,
				background: C.tint,
				borderRadius: '14px'
			}
		},
		root
	);
	const CWs = 48,
		RH = 60;
	const GX = P.left + 210,
		GY = P.top + 32;
	const cellX = (c) => GX + c * CWs;
	const cellY = (r) => GY + r * RH + (r >= 2 ? 10 : 0) + (r >= 5 ? 10 : 0);
	const rowEls = M.rows.map((row, r) => {
		const lab = h(
			'div',
			{
				class: 'abs',
				style: {
					left: `${P.left}px`,
					width: '186px',
					textAlign: 'right',
					top: `${cellY(r)}px`,
					lineHeight: `${RH - 8}px`,
					fontSize: '17px',
					color: C.soft
				}
			},
			root,
			row.label
		);
		let rule = null;
		if (row.rule)
			rule = h(
				'div',
				{
					class: 'abs',
					style: {
						left: `${GX - 6}px`,
						width: `${W * CWs + 12}px`,
						top: `${cellY(r) - 10}px`,
						height: '1.5px',
						background: C.mist,
						transformOrigin: '0 50%'
					}
				},
				root
			);
		return { lab, rule };
	});
	const cells = M.final.map((rowG, r) =>
		rowG.map((_, c) =>
			h(
				'div',
				{
					class: 'abs mono',
					style: {
						left: `${cellX(c)}px`,
						top: `${cellY(r)}px`,
						width: `${CWs}px`,
						height: `${RH - 8}px`,
						lineHeight: `${RH - 8}px`,
						textAlign: 'center',
						fontSize: '34px'
					}
				},
				root,
				''
			)
		)
	);
	const colorOf = (r) => (r <= 1 ? C.ink : r <= 3 ? C.roseL : r === 4 ? '#E5739A' : C.rose);
	const info = h(
		'div',
		{
			class: 'abs',
			style: {
				left: `${P.left}px`,
				top: `${P.top + P.h + 22}px`,
				fontSize: '17px',
				color: C.soft,
				lineHeight: '26px'
			}
		},
		root,
		`4,821 × 3,967 on the published model: its ${M.ticks.length} recorded views, one at a time`
	);
	// the view's three cells on the sheet
	const rings = [0, 1, 2].map(() =>
		h(
			'div',
			{
				class: 'abs',
				style: {
					width: `${CWs - 4}px`,
					height: `${RH - 6}px`,
					border: `2px solid ${C.rose}`,
					borderRadius: '9px',
					opacity: '0'
				}
			},
			root
		)
	);

	// ---- the strip -----------------------------------------------------------------------------------------------
	const SX = 920,
		SY = 306,
		SS = 3;
	const stripLab = h(
		'div',
		{
			class: 'abs',
			style: {
				left: `${SX - 40}px`,
				width: `${32 * SS + 80}px`,
				textAlign: 'center',
				top: `${SY - 44}px`,
				fontSize: '16px',
				color: C.soft,
				lineHeight: '20px'
			}
		},
		root,
		'one view<br>32 × 96 px'
	);
	const strip = h(
		'canvas',
		{
			width: '32',
			height: '96',
			class: 'abs pix',
			style: {
				left: `${SX}px`,
				top: `${SY}px`,
				width: `${32 * SS}px`,
				height: `${96 * SS}px`,
				boxShadow: `0 0 0 1px ${C.mist}`
			}
		},
		root
	);
	let stripCells = null;
	const ghosts = [0, 1, 2].map(() =>
		h(
			'div',
			{
				class: 'abs mono',
				style: {
					width: '48px',
					height: '52px',
					lineHeight: '52px',
					textAlign: 'center',
					fontSize: '34px',
					color: C.ink,
					opacity: '0'
				}
			},
			root,
			''
		)
	);

	// ---- the model -----------------------------------------------------------------------------------------------
	const TX = 1068,
		TY = 300,
		TH = 41;
	const tokens = ['MUL', 'img', 'img', 'img', '=', '·', '·'].map((w, i) =>
		h(
			'div',
			{
				class: 'abs mono',
				style: {
					left: `${TX}px`,
					top: `${TY + i * TH}px`,
					width: '58px',
					textAlign: 'center',
					lineHeight: `${TH}px`,
					fontSize: '17px',
					color: i === 0 ? C.ink : C.soft
				}
			},
			root,
			w
		)
	);
	const wires = svg(
		'svg',
		{ width: '1920', height: '1080', style: 'position:absolute;left:0;top:0;overflow:visible' },
		root
	);
	const wireEls = [];
	for (let k = 0; k < 3; k++)
		wireEls.push(
			svg(
				'path',
				{
					d: `M ${SX + 32 * SS + 4} ${SY + (k + 0.5) * 32 * SS} C ${SX + 32 * SS + 30} ${SY + (k + 0.5) * 32 * SS}, ${TX - 24} ${TY + (k + 1.5) * TH}, ${TX + 4} ${TY + (k + 1.5) * TH}`,
					fill: 'none',
					stroke: C.mist,
					'stroke-width': '1.3'
				},
				wires
			)
		);
	const LX = 1160,
		LY = 300,
		LW = 10,
		LG = 4.2,
		LHt = 7 * TH;
	const layers = Array.from({ length: 24 }, (_, i) =>
		h(
			'div',
			{
				class: 'abs',
				style: {
					left: `${LX + i * (LW + LG)}px`,
					top: `${LY}px`,
					width: `${LW}px`,
					height: `${LHt}px`,
					borderRadius: '2px',
					background: (i + 1) % 4 === 0 ? C.soft : C.bar
				}
			},
			root
		)
	);
	const LR = LX + 24 * (LW + LG) - LG;
	const modelLab = h(
		'div',
		{
			class: 'abs',
			style: {
				left: `${LX}px`,
				top: `${LY - 46}px`,
				fontSize: '17px',
				color: C.ink,
				whiteSpace: 'nowrap',
				lineHeight: '22px'
			}
		},
		root,
		`Qwen3.5-0.8B <span style="color:${C.soft}">· 24 layers, 6 with full attention (dark)</span>`
	);
	const loraLab = h(
		'div',
		{
			class: 'abs',
			style: {
				left: `${LX}px`,
				top: `${LY + LHt + 18}px`,
				fontSize: '17px',
				color: C.rose,
				whiteSpace: 'nowrap',
				lineHeight: '24px'
			}
		},
		root,
		`+ LoRA adapter<br><span style="color:${C.soft}">rank 16 on 150 matrices · 10.2 M parameters, 1.2% of the model</span>`
	);
	const passLab = h(
		'div',
		{
			class: 'abs',
			style: {
				left: `${LX}px`,
				top: `${LY + LHt + 78}px`,
				fontSize: '17px',
				color: C.soft,
				whiteSpace: 'nowrap'
			}
		},
		root,
		'one forward pass per step'
	);
	// ---- the outputs ---------------------------------------------------------------------------------------------
	const OX = LR + 34;
	const outRows = [0, 1, 2].map((k) => {
		const y = TY + (4 + k) * TH;
		const g = h(
			'div',
			{
				class: 'abs mono',
				style: {
					left: `${OX}px`,
					top: `${y - 6}px`,
					width: '34px',
					textAlign: 'center',
					lineHeight: `${TH + 12}px`,
					fontSize: '34px',
					color: C.rose
				}
			},
			root,
			''
		);
		const l = h(
			'div',
			{
				class: 'abs',
				style: {
					left: `${OX + 46}px`,
					top: `${y}px`,
					lineHeight: `${TH}px`,
					fontSize: '17px',
					color: C.soft,
					whiteSpace: 'nowrap'
				}
			},
			root,
			''
		);
		return { g, l, y: y + TH / 2 };
	});
	const outWires = [0, 1, 2].map((k) =>
		svg(
			'path',
			{
				d: `M ${LR + 6} ${TY + (4 + k + 0.5) * TH} L ${OX - 4} ${TY + (4 + k + 0.5) * TH}`,
				stroke: C.rose,
				'stroke-width': '1.3',
				fill: 'none'
			},
			wires
		)
	);
	const flyers = [0, 1].map(() =>
		h(
			'div',
			{
				class: 'abs mono',
				style: {
					width: '48px',
					height: '52px',
					lineHeight: '52px',
					textAlign: 'center',
					fontSize: '34px',
					color: C.rose,
					opacity: '0'
				}
			},
			root,
			''
		)
	);
	const caption = h(
		'div',
		{
			class: 'abs',
			style: {
				left: '0',
				right: '0',
				top: '846px',
				textAlign: 'center',
				fontSize: '25px',
				color: C.ink
			}
		},
		root,
		'The runtime writes the outputs on the sheet and moves the view. <span style="color:' +
			C.rose +
			'">Nothing else passes between steps.</span>'
	);

	// ---- the schedule: the first step slowly, then faster and faster -------------------------------------------
	// tick 0 is worked before 11.2 s; tick k (1 .. N - 1) from starts[k - 1] to starts[k]; after starts[N - 1], done
	const N = M.ticks.length;
	const starts = [11.2];
	const durs = [0];
	for (let k = 1; k < N; k++) {
		durs.push(Math.max(0.1, 1.0 * Math.pow(0.72, k - 1)));
		starts.push(starts[k - 1] + durs[k]);
	}
	const END = starts[N - 1];
	const at = (u) => {
		if (u < starts[0]) return { k: 0, f: -1 };
		for (let k = 1; k < N; k++) if (u < starts[k]) return { k, f: (u - starts[k - 1]) / durs[k] };
		return { k: N, f: 1 };
	};
	const fov = (k, j) => {
		const c = M.ticks[k].fovea[j];
		return c ? [cellX(c.c) + 2, cellY(c.r) - 3] : null;
	};
	const sheetAt = (k, stamped) => {
		if (k >= N) return M.final;
		const tk = M.ticks[k];
		if (!stamped) return tk.before;
		const g = tk.before.map((r) => r.slice());
		for (const ch of tk.changed) g[ch.r][ch.c] = ch.g;
		return g;
	};
	const label = (op, k, ch) => {
		if (k === 2) return ch === ' ' ? 'next step' : `next step: ${NEXT[ch] ?? ch}`;
		if (op === 'NXT') return '(unused)';
		if (op === 'FLS') return k === 0 ? 'writes the last carry' : '(unused)';
		return k === 0 ? 'writes' : 'carry';
	};

	return (t) => {
		const u = t - T0;
		// the sheet comes in
		const inU = ep(u, 0.1, 1.3, E.o3);
		st(panel, 'opacity', inU.toFixed(3));
		st(panel, 'transform', `translateY(${((1 - inU) * 16).toFixed(1)}px)`);
		rowEls.forEach((e, r) => {
			rise(e.lab, ep(u, 0.3 + r * 0.06, 1.2 + r * 0.06, E.o3), 8);
			if (e.rule) st(e.rule, 'transform', `scaleX(${ep(u, 0.6, 1.5, E.io3).toFixed(3)})`);
		});
		rise(info, ep(u, 1.2, 2.0, E.o3), 6);
		// the model comes in
		const mU = ep(u, 2.2, 3.6, E.o3);
		layers.forEach((el, i) => {
			const v = ep(u, 2.2 + i * 0.03, 3.0 + i * 0.03, E.o3);
			st(el, 'opacity', v.toFixed(3));
			st(el, 'transform', `scaleY(${lerp(0.3, 1, v).toFixed(3)})`);
		});
		rise(modelLab, mU, 8);
		rise(loraLab, ep(u, 3.4, 4.4, E.o3), 8);
		rise(passLab, ep(u, 9.0, 9.8, E.o3), 6);
		tokens.forEach((el, i) => rise(el, ep(u, 2.8 + i * 0.05, 3.6 + i * 0.05, E.o3), 6));
		wireEls.forEach((el) => st(el, 'opacity', String(ep(u, 3.4, 4.0))));
		rise(stripLab, ep(u, 5.6, 6.4, E.o3), 6);
		rise(caption, inout(u, 12.0, 19.9, 0.9, E.o3), 10);

		const { k, f } = at(u);
		const done = k >= N;
		const tick = M.ticks[Math.min(k, N - 1)];
		let stamped, fu, pulse, outU, stampU;
		if (k === 0) {
			stamped = u >= 10.9;
			fu = 1;
			pulse = prog(u, 8.0, 9.4);
			outU = ep(u, 9.2, 9.8, E.o3);
			stampU = prog(u, 10.0, 10.9);
		} else if (!done) {
			stamped = f >= 0.85;
			fu = E.io3(clamp(f / 0.3));
			pulse = prog(f, 0.3, 0.62);
			outU = ep(f, 0.55, 0.68, E.o3);
			stampU = prog(f, 0.68, 0.85);
		} else {
			stamped = true;
			fu = 1;
			pulse = 0;
			outU = 1;
			stampU = 1;
		}
		const view = done ? null : tick;
		const fovFrom = k === 0 ? 0 : Math.min(k - 1, N - 1);
		const fovTo = Math.min(k, N - 1);
		const showG = sheetAt(k, stamped);
		for (let r = 0; r < cells.length; r++)
			for (let c = 0; c < cells[r].length; c++) {
				const el = cells[r][c];
				const ch = showG[r][c] === ' ' ? '' : showG[r][c];
				if (el.textContent !== ch) el.textContent = ch;
				st(el, 'color', colorOf(r));
				st(el, 'opacity', String(r <= 1 ? ep(u, 0.5 + c * 0.04, 1.3 + c * 0.04, E.o3) : 1));
			}
		// the view's cells on the sheet
		const ringIn = k === 0 ? ep(u, 5.2, 5.8, E.o5) : !done ? 1 : 1 - ep(u, END, END + 0.5);
		rings.forEach((el, j) => {
			const a = fov(fovFrom, j),
				b = fov(fovTo, j);
			if (!b) {
				st(el, 'opacity', '0');
				return;
			}
			const p = a ? [lerp(a[0], b[0], fu), lerp(a[1], b[1], fu)] : b;
			st(el, 'left', `${p[0].toFixed(2)}px`);
			st(el, 'top', `${p[1].toFixed(2)}px`);
			st(el, 'opacity', String(ringIn * (a ? 1 : fu)));
			st(el, 'transform', k === 0 ? `scale(${lerp(1.5, 1, ringIn).toFixed(3)})` : 'none');
		});
		// the strip: tick 0 lifts its cells out of the sheet; later ticks swap it at the end of the move
		const liftU = k === 0 ? ep(u, 6.4, 7.6, E.io3) : 1;
		const stripView =
			k === 0
				? M.ticks[0].view
				: !done
					? f >= 0.3
						? tick.view
						: M.ticks[k - 1].view
					: M.ticks[N - 1].view;
		const key = stripView.join('');
		if (key !== stripCells) {
			if (sprites.complete && sprites.naturalWidth) {
				drawStrip(strip, stripView);
				stripCells = key;
			} else ctx.wait(sprites);
		}
		st(strip, 'opacity', (k === 0 ? ep(u, 7.3, 7.9) : 1).toFixed(3));
		ghosts.forEach((el, j) => {
			const c = M.ticks[0].fovea[j];
			if (!c || k !== 0 || u < 6.2 || u > 8.0) {
				st(el, 'opacity', '0');
				return;
			}
			el.textContent = M.ticks[0].view[j] === ' ' ? '' : M.ticks[0].view[j];
			const x0 = cellX(c.c),
				y0 = cellY(c.r);
			const x1 = SX + 16 * SS - 24,
				y1 = SY + (j + 0.5) * 32 * SS - 26;
			st(el, 'left', `${lerp(x0, x1, liftU).toFixed(2)}px`);
			st(el, 'top', `${lerp(y0, y1, liftU).toFixed(2)}px`);
			st(el, 'fontSize', `${lerp(34, 58, liftU).toFixed(2)}px`);
			st(el, 'opacity', String(1 - ep(u, 7.4, 8.0)));
		});
		// the op token, the pulse through the layers and the outputs
		if (view && tokens[0].textContent !== view.op) tokens[0].textContent = view.op;
		layers.forEach((el, i) => {
			const base = (i + 1) % 4 === 0 ? C.soft : C.bar;
			const d = pulse * 27 - 1.5 - i;
			const glow = pulse > 0 && pulse < 1 ? Math.exp(-(d * d) / 6) : 0;
			st(
				el,
				'background',
				glow > 0.01 ? mix(base.startsWith('#') ? base : C.bar, C.rose, glow) : base
			);
		});
		const prevTick = k === 0 ? null : M.ticks[Math.min(k - 1, N - 1)];
		outRows.forEach((o, j) => {
			const cur = k === 0 ? tick : done ? M.ticks[N - 1] : outU >= 0.5 ? tick : prevTick;
			const ch = cur.out[j];
			const txt = ch === ' ' ? '–' : ch;
			if (o.g.textContent !== txt) o.g.textContent = txt;
			const lab = label(cur.op, j, ch);
			if (o.l.textContent !== lab) o.l.textContent = lab;
			// later steps: the old outputs dim as the pass runs, the new ones come in
			const v =
				k === 0 ? outU : done ? 1 : outU < 0.5 ? 1 - 0.6 * prog(f, 0.3, 0.55) : 0.4 + 0.6 * outU;
			st(o.g, 'opacity', v.toFixed(3));
			st(o.g, 'color', ch === ' ' ? C.mist : C.rose);
			st(o.l, 'opacity', (k === 0 ? outU : 1).toFixed(3));
		});
		outWires.forEach((w) => st(w, 'opacity', String(k === 0 ? ep(u, 9.0, 9.6) : 1)));
		// the runtime stamps the outputs (shown in full for the first steps, then too fast to follow)
		const fly = !done && k <= 5 ? tick.changed.filter((ch) => ch.g !== ' ') : [];
		flyers.forEach((el, j) => {
			const ch = fly[j];
			const s = stampU;
			if (!ch || s <= 0 || s >= 1) {
				st(el, 'opacity', '0');
				return;
			}
			const fromRow = ch.r === 2 || ch.r === 3 ? 1 : 0;
			el.textContent = ch.g;
			const x0 = OX - 7,
				y0 = outRows[fromRow].y - 26;
			const x1 = cellX(ch.c),
				y1 = cellY(ch.r);
			const e = E.io3(s);
			st(el, 'left', `${lerp(x0, x1, e).toFixed(2)}px`);
			st(el, 'top', `${(lerp(y0, y1, e) - Math.sin(Math.PI * e) * 60).toFixed(2)}px`);
			st(el, 'opacity', String(Math.min(1, s * 6, (1 - s) * 8)));
			st(el, 'color', colorOf(ch.r));
		});
	};
}
