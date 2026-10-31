<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { DEPTH, MAP_K, sumValue, type Family, type InsideTick, type Point } from './inside.ts';
	import type { InsideMeta } from './protocol.ts';

	/**
	 * One family's state space: the table's views at layer 24 in a 3D slice of the state at the answer position, and
	 * the path of the last tick of this family through the layers. A map whose family did not run the last tick stays
	 * dim, with its last landing ringed.
	 */
	interface Props {
		family: Family;
		seen: InsideTick | null;
		/** the answer the last tick wrote (its first token) */
		wrote: string | null;
		meta: InsideMeta | null;
		/** the run this view belongs to; a new run clears the trail */
		runKey: unknown;
		slow: boolean;
		push: string | null;
		canPush: boolean;
		onpush: (code: string | null) => void;
	}

	let { family, seen, wrote, meta, runKey, slow, push, canPush, onpush }: Props = $props();

	let canvas = $state<HTMLCanvasElement>();
	let grabbing = $state(false);
	let size = $state(320);
	let hover = $state<string | null>(null);

	const fam = $derived(meta ? meta.families[family] : null);
	/** the last tick was this family's */
	const live = $derived(seen?.family === family);
	const pushable = $derived(canPush && !!meta?.steerCodes[family]);
	/** the map's scale: most of the table within the frame */
	const reach = $derived.by(() => {
		if (!fam) return 1;
		const r = fam.cloud.map(([x, y, z]) => Math.hypot(x, y, z)).sort((a, b) => a - b);
		return r[Math.floor(r.length * 0.9)] || 1;
	});
	const labelText = (c: string) =>
		family === 'SUM' ? (c === 'H' ? 'halt' : sumValue(c)!) : c === '_' ? '·' : c;

	/** where this family's earlier ticks of this run landed, and the path of its last tick */
	let trail: Point[] = [];
	let trailKey: unknown = null;
	let path: Float32Array | null = null;
	/** the path being drawn: when it started and how long it takes to reach the last layer */
	let anim = { start: 0, dur: 160 };
	$effect(() => {
		const p = seen?.family === family ? seen.path : null;
		const s = slow;
		const key = runKey;
		untrack(() => {
			if (key !== trailKey) {
				trailKey = key;
				trail = [];
				path = null;
			}
			if (!p) return;
			path = p;
			anim = { start: performance.now(), dur: s ? 760 : 140 };
			const o = (DEPTH - 1) * MAP_K;
			trail = [...trail.slice(-500), [p[o], p[o + 1], p[o + 2]]];
		});
	});

	// the camera; dragging takes over from the slow turn for a moment
	let yaw = 0.7;
	let pitch = 0.38;
	let lastTouch = -1e9;
	let drag: { x: number; y: number; id: number; moved: number } | null = null;
	/** labels as last drawn, for pointing */
	let drawn: { c: string; x: number; y: number }[] = [];

	function tones(el: HTMLCanvasElement) {
		const cs = getComputedStyle(el);
		const v = (k: string, d: string) => cs.getPropertyValue(k).trim() || d;
		return {
			cloud: v('--cloud', '#7d8ba8'),
			hot: v('--hot', '#d6336c'),
			trail: v('--trail', '#4c5b78'),
			ink: v('--color-ink', '#1f2a44'),
			ink2: v('--color-ink-soft', '#4c5b78'),
			ink3: v('--color-ink-soft', '#4c5b78'),
			rose: v('--color-rose', '#d6336c'),
			push: v('--color-cobalt', '#2557a7'),
			halo: v('--color-paper', '#fff')
		};
	}
	let tone: ReturnType<typeof tones> | null = null;

	function draw(now: number) {
		const el = canvas;
		const ctx = el?.getContext('2d');
		if (!el || !ctx) return;
		const S = size;
		const dpr = devicePixelRatio || 1;
		if (el.width !== Math.round(S * dpr)) {
			el.width = Math.round(S * dpr);
			el.height = Math.round(S * dpr);
		}
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, S, S);
		const f = fam;
		if (!f) return;
		tone ??= tones(el);
		const t = tone;
		const R = S * 0.42;
		const k = 1 / reach;
		const cy = Math.cos(yaw),
			sy = Math.sin(yaw),
			cp = Math.cos(pitch),
			sp = Math.sin(pitch);
		const proj = (x: number, y: number, z: number) => {
			x *= k;
			y *= k;
			z *= k;
			const x1 = x * cy + z * sy;
			const z1 = -x * sy + z * cy;
			const y1 = y * cp - z1 * sp;
			const z2 = y * sp + z1 * cp;
			const p = 3.2 / (3.2 - z2);
			return { x: S / 2 + x1 * p * R, y: S / 2 - y1 * p * R, z: z2, p };
		};

		// the table at layer 24, nearer views darker (a white-ended ramp); the views that share this tick's answer in rose
		const here = live ? wrote : null;
		for (let i = 0; i < f.cloud.length; i++) {
			const [x, y, z] = f.cloud[i];
			const q = proj(x, y, z);
			const same = here !== null && f.cloudLabels[i] === here;
			ctx.globalAlpha = Math.max(0.3, Math.min(0.85, 0.55 + q.z * 0.3));
			ctx.fillStyle = same ? t.hot : t.cloud;
			ctx.beginPath();
			ctx.arc(q.x, q.y, (same ? 2.2 : 1.8) * q.p, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.globalAlpha = 1;
		// earlier landings in this run
		ctx.fillStyle = t.trail;
		for (const [x, y, z] of trail) {
			const q = proj(x, y, z);
			ctx.beginPath();
			ctx.arc(q.x, q.y, 1.6 * q.p, 0, Math.PI * 2);
			ctx.fill();
		}
		// the centre: where every tick starts
		const o = proj(0, 0, 0);
		ctx.strokeStyle = t.ink3;
		ctx.lineWidth = 1;
		ctx.beginPath();
		ctx.arc(o.x, o.y, 3, 0, Math.PI * 2);
		ctx.stroke();

		// this tick, layer by layer, drawn out over `anim.dur`
		const p = path;
		if (p && live) {
			const u = Math.min(1, (now - anim.start) / anim.dur);
			const e = 1 - Math.pow(1 - u, 3);
			const upto = e * (DEPTH - 1);
			const pts = Array.from({ length: DEPTH }, (_, l) =>
				proj(p[l * MAP_K], p[l * MAP_K + 1], p[l * MAP_K + 2])
			);
			ctx.strokeStyle = t.ink;
			ctx.lineWidth = 1.5;
			ctx.lineJoin = 'round';
			ctx.beginPath();
			ctx.moveTo(pts[0].x, pts[0].y);
			let end = pts[0];
			for (let l = 1; l < DEPTH && l - 1 < upto; l++) {
				const a = Math.min(1, upto - (l - 1));
				end = {
					...pts[l],
					x: pts[l - 1].x + (pts[l].x - pts[l - 1].x) * a,
					y: pts[l - 1].y + (pts[l].y - pts[l - 1].y) * a
				};
				ctx.lineTo(end.x, end.y);
			}
			ctx.stroke();
			// where the tick lands: the state that writes the model's answer
			ctx.fillStyle = t.rose;
			ctx.beginPath();
			ctx.arc(end.x, end.y, u >= 1 ? 4.5 : 3, 0, Math.PI * 2);
			ctx.fill();
			if (u >= 1) {
				ctx.strokeStyle = t.rose;
				ctx.lineWidth = 1;
				ctx.globalAlpha = 0.5;
				ctx.beginPath();
				ctx.arc(end.x, end.y, 9, 0, Math.PI * 2);
				ctx.stroke();
				ctx.globalAlpha = 1;
			}
		}

		// a map that did not run the last tick: its last landing, ringed
		if (p && !live) {
			const o2 = (DEPTH - 1) * MAP_K;
			const q = proj(p[o2], p[o2 + 1], p[o2 + 2]);
			ctx.strokeStyle = t.ink2;
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.arc(q.x, q.y, 4, 0, Math.PI * 2);
			ctx.stroke();
		}

		// the answers, at their class means
		drawn = [];
		ctx.font = '11px "Geist Mono Variable", ui-monospace, monospace';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		for (const [c, [x, y, z]] of Object.entries(f.labels)) {
			const q = proj(x, y, z);
			const text = labelText(c);
			const armed = pushable && push === c;
			const lit = armed || hover === c || c === here;
			ctx.lineWidth = 3;
			ctx.strokeStyle = t.halo;
			ctx.strokeText(text, q.x, q.y - 9);
			ctx.fillStyle = lit ? t.ink : t.ink2;
			ctx.fillText(text, q.x, q.y - 9);
			if (armed) {
				// a push toward another answer: the alternative, in cobalt
				ctx.strokeStyle = t.push;
				ctx.lineWidth = 1;
				ctx.beginPath();
				ctx.arc(q.x, q.y - 9, 10, 0, Math.PI * 2);
				ctx.stroke();
			}
			drawn.push({ c, x: q.x, y: q.y - 9 });
		}
	}

	/** the canvas is the largest square the box allows; it is positioned inside the box, so it never sizes it */
	function fit(box: HTMLDivElement) {
		const ro = new ResizeObserver(() => {
			const side = Math.floor(Math.min(box.clientWidth, box.clientHeight));
			if (side > 0) size = side;
		});
		ro.observe(box);
		return () => ro.disconnect();
	}

	/** the canvas, for drawing and pointing */
	function hold(el: HTMLCanvasElement) {
		canvas = el;
		return () => {
			if (canvas === el) canvas = undefined;
		};
	}

	onMount(() => {
		let raf = 0;
		let prev = performance.now();
		const frame = (now: number) => {
			const dt = Math.min(0.1, (now - prev) / 1000);
			prev = now;
			if (!drag && now - lastTouch > 2500) yaw += dt * 0.09;
			draw(now);
			raf = requestAnimationFrame(frame);
		};
		raf = requestAnimationFrame(frame);
		return () => cancelAnimationFrame(raf);
	});

	function labelAt(e: PointerEvent) {
		if (!canvas) return null;
		const r = canvas.getBoundingClientRect();
		const x = e.clientX - r.left;
		const y = e.clientY - r.top;
		let best: string | null = null;
		let bd = 13;
		for (const d of drawn) {
			const dd = Math.hypot(d.x - x, d.y - y);
			if (dd < bd) {
				bd = dd;
				best = d.c;
			}
		}
		return best;
	}

	function onpointerdown(e: PointerEvent) {
		drag = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: 0 };
		grabbing = true;
		canvas?.setPointerCapture(e.pointerId);
	}
	function onpointermove(e: PointerEvent) {
		if (drag && drag.id === e.pointerId) {
			const dx = e.clientX - drag.x;
			const dy = e.clientY - drag.y;
			drag.moved += Math.abs(dx) + Math.abs(dy);
			yaw += dx * 0.01;
			pitch = Math.max(-1.3, Math.min(1.3, pitch + dy * 0.01));
			drag.x = e.clientX;
			drag.y = e.clientY;
			lastTouch = performance.now();
			return;
		}
		hover = pushable ? labelAt(e) : null;
		// the map holds still while the pointer is over it, so a label can be aimed at
		lastTouch = performance.now();
	}
	function onpointerup(e: PointerEvent) {
		if (!drag || drag.id !== e.pointerId) return;
		const click = drag.moved < 5;
		drag = null;
		grabbing = false;
		lastTouch = performance.now();
		if (click && pushable) {
			const c = labelAt(e);
			if (c) onpush(push === c ? null : c);
		}
	}
</script>

<div class="box" class:dim={!live} {@attach fit}>
	{#if fam}
		<canvas
			{@attach hold}
			style:width="{size}px"
			style:height="{size}px"
			style:cursor={hover ? 'pointer' : grabbing ? 'grabbing' : 'grab'}
			{onpointerdown}
			{onpointermove}
			{onpointerup}
			onpointercancel={() => {
				drag = null;
				grabbing = false;
			}}
			onpointerleave={() => (hover = null)}
			aria-label="The model's state at the answer position, in 3D: the table's views at the last layer, and the last tick's path through the layers"
		></canvas>
	{/if}
</div>

<style>
	.box {
		position: relative;
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
		--cloud: var(--color-blue-grey);
		--hot: var(--color-rose);
		--trail: var(--color-ink-soft);
		transition: opacity var(--move) var(--ease);
	}
	.box.dim {
		opacity: 0.55;
	}
	canvas {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		display: block;
		touch-action: none;
	}
</style>
