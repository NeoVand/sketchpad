<script lang="ts">
	import { fmtMargin, rowLabel, type Cert } from './pad.svelte.ts';
	import Icon from '#lib/ui/Icon.svelte';
	import { Shield } from '#lib/ui/icons.ts';
	import { GRID } from './theme.svelte.ts';

	interface Props {
		cert: Cert;
		/** the GPU as the browser names it */
		device: string | null;
		oncheck?: () => void;
		/** can the table be checked now (the model is loaded and idle) */
		canCheck: boolean;
		/** the rows a run has read and the one it read last: the run's walk on the table */
		walk?: { current: number; visited: Set<number> } | null;
		/** the other tables this part's runs read, said once under the grid */
		also?: string;
	}

	let { cert, device, oncheck, canCheck, walk = null, also = '' }: Props = $props();

	let canvas: HTMLCanvasElement | null = null;
	/** the room the line under the grid takes (two lines of text and their margin) */
	const LINE = 44;
	/** the room the grid has: its box in the panel, which the canvas never sizes */
	let width = $state(240);
	let height = $state(200);
	let hover = $state<number | null>(null);

	/** The grid: the adder's 242 rows as two 11 x 11 blocks (carry blank, carry 1; top digit down, bottom across);
	 * the multiplier's 1,553 rows in op groups (MUL, ADD, ADZ, then FLS and NXT); the calculator's 651 in SUB, EST
	 * and DEC. */
	const grid = $derived.by(() => {
		const n = cert.rows;
		const x = new Float32Array(n);
		const y = new Float32Array(n);
		if (cert.kind === 'add') {
			// the largest pitch at which both 11 x 11 blocks fit the box
			const pitch = Math.max(5, Math.min(12, Math.floor(Math.min((width - 8) / 22, height / 11))));
			const size = pitch - 2;
			const block = 11 * pitch + 8;
			for (let i = 0; i < n; i++) {
				const c = Math.floor(i / 121);
				x[i] = c * block + (i % 11) * pitch;
				y[i] = Math.floor((i % 121) / 11) * pitch;
			}
			return { x, y, size, w: 2 * block - 8 - (pitch - size), h: 11 * pitch - (pitch - size) };
		}
		const calc = cert.kind === 'calc';
		// the largest pitch at which every row fits the box, in op groups one line apart
		const lines = (cols: number) =>
			calc
				? Math.ceil(242 / cols) + Math.ceil(400 / cols) + Math.ceil(9 / cols)
				: Math.ceil(1100 / cols) + 2 * Math.ceil(220 / cols) + Math.ceil(14 / cols);
		let pitch = 8;
		while (pitch > 3) {
			const cols = Math.floor((width + 1) / pitch);
			if (lines(cols) * pitch + 12 <= height) break;
			pitch--;
		}
		const size = pitch - 1;
		const cols = Math.max(20, Math.floor((width + 1) / pitch));
		const groups: [number, number][] = calc
			? [
					[0, 242],
					[242, 642],
					[642, 651]
				]
			: [
					[0, 1100],
					[1100, 1320],
					[1320, 1540],
					[1540, 1553]
				];
		let top = 0;
		for (const [a, b] of groups) {
			for (let i = a; i < b; i++) {
				// FLS (2 rows) and NXT (11) share the last line, one cell apart
				const k = i - a + (a === 1540 && i >= 1542 ? 1 : 0);
				x[i] = (k % cols) * pitch;
				y[i] = top + Math.floor(k / cols) * pitch;
			}
			const k = b - a + (a === 1540 ? 1 : 0);
			top += Math.ceil(k / cols) * pitch + 4;
		}
		return { x, y, size, w: cols * pitch - 1, h: top - 4 - 1 };
	});

	/** the grid follows its box */
	function measure(box: HTMLDivElement) {
		const ro = new ResizeObserver(() => {
			width = box.clientWidth;
			// the line under the grid sits in the same box, right below it
			height = Math.max(0, box.clientHeight - LINE);
		});
		ro.observe(box);
		return () => ro.disconnect();
	}

	/**
	 * one cell per row: rose when it passes (deeper with a larger margin), hollow when it fails, neutral until checked;
	 * during a run, the rows it has read keep their rose and the rest step back to the neutral
	 */
	/** bumps when the browser gives a canvas back after a GPU reset (it comes back blank) */
	let restored = $state(0);

	function repaintAfterReset(el: HTMLCanvasElement) {
		const again = () => restored++;
		el.addEventListener('contextrestored', again);
		return () => el.removeEventListener('contextrestored', again);
	}

	function paint(el: HTMLCanvasElement) {
		canvas = el;
		void cert.version;
		void restored;
		void walk;
		const g = grid;
		const h = hover;
		const dpr = Math.max(1, globalThis.devicePixelRatio || 1);
		el.width = Math.round(g.w * dpr);
		el.height = Math.round(g.h * dpr);
		el.style.width = `${g.w}px`;
		el.style.height = `${g.h}px`;
		const ctx = el.getContext('2d')!;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, g.w, g.h);
		const s = g.size;
		const tone = GRID;
		// during a run, the rows it has not read step back and the ones it has read stand out
		const w = walk && walk.visited.size ? walk : null;
		for (let i = 0; i < cert.rows; i++) {
			const m = cert.margins[i];
			if (Number.isNaN(m) || (w && m > 0 && !w.visited.has(i))) {
				ctx.fillStyle = tone.idle;
				ctx.fillRect(g.x[i], g.y[i], s, s);
			} else if (m > 0) {
				ctx.fillStyle = w ? tone.read : tone.pass(m);
				ctx.fillRect(g.x[i], g.y[i], s, s);
			} else {
				// a failing row is a hole: hollow, and ringed when pointed at
				ctx.strokeStyle = tone.fail;
				ctx.lineWidth = 1;
				ctx.clearRect(g.x[i] - 0.5, g.y[i] - 0.5, s + 1, s + 1);
				ctx.strokeRect(g.x[i] + 0.5, g.y[i] + 0.5, s - 1, s - 1);
				if (i === h) ctx.strokeRect(g.x[i] - 1.5, g.y[i] - 1.5, s + 3, s + 3);
			}
		}
		// the row read last, and the one pointed at: an ink ring
		ctx.strokeStyle = tone.ring;
		ctx.lineWidth = 1;
		for (const i of [w ? w.current : -1, h ?? -1])
			if (i >= 0 && i < cert.rows) ctx.strokeRect(g.x[i] - 1.5, g.y[i] - 1.5, s + 3, s + 3);
	}

	function onpointermove(e: PointerEvent) {
		if (!canvas) return;
		const r = canvas.getBoundingClientRect();
		const px = e.clientX - r.left;
		const py = e.clientY - r.top;
		const g = grid;
		const pad = (g.size <= 5 ? 1 : 2) / 2;
		let found: number | null = null;
		for (let i = 0; i < cert.rows; i++)
			if (
				px >= g.x[i] - pad &&
				px < g.x[i] + g.size + pad &&
				py >= g.y[i] - pad &&
				py < g.y[i] + g.size + pad
			) {
				found = i;
				break;
			}
		hover = found;
	}

	const fmt = (n: number) => n.toLocaleString('en-US');
	/** the model's answer, spaced like the table's ("33A" -> "3 3 A") */
	const spaced = (g: string | null) => (g ? [...g].join(' ') : '?');
	const when = $derived(
		cert.when
			? new Date(cert.when).toLocaleString('en-GB', {
					day: 'numeric',
					month: 'short',
					hour: '2-digit',
					minute: '2-digit'
				})
			: null
	);
	const stamp = (iso: string) =>
		new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
	const readout = $derived.by(() => {
		if (hover === null) return null;
		const m = cert.margins[hover];
		return {
			label: rowLabel(cert.kind, hover),
			margin: Number.isNaN(m) ? 'not checked yet' : `margin ${fmtMargin(m)}`
		};
	});
</script>

<section class="sp-panel cert" aria-label="Certificate">
	<div class="sp-cap">
		<span class="sp-title"
			>The table
			{#if cert.status === 'running'}
				<span class="state num">checking {fmt(cert.checked)} of {fmt(cert.rows)}</span>
			{:else if cert.status === 'shipped' && cert.spot?.running}
				<span class="state num">spot check {fmt(cert.spot.checked)} of {fmt(cert.spot.rows)}</span>
			{:else if cert.status === 'none'}
				<span class="state">not checked yet</span>
			{/if}</span
		>
		<span class="sp-sub">every view the model can meet, each one checked</span>
	</div>

	<div class="sp-body sp-fig">
		<div class="stack">
			<div class="headline">
				<span
					class="big num"
					class:dim={cert.status !== 'done' &&
						cert.status !== 'cached' &&
						cert.status !== 'shipped'}
				>
					{cert.checked ? fmtMargin(cert.minMargin) : '–'}
				</span>
				<span class="cap"
					><span
						>{cert.status === 'running'
							? 'lowest margin so far'
							: cert.status === 'shipped'
								? 'lowest margin'
								: 'lowest margin on this device'}</span
					><span class="sub">the right answer’s lead over the next, in logits</span></span
				>
			</div>

			<div class="grid" {@attach measure}>
				<canvas
					{@attach paint}
					{@attach repaintAfterReset}
					{onpointermove}
					onpointerleave={() => (hover = null)}
					aria-label="One cell per table row; filled when it passes, hollow when it fails"
				></canvas>
				<p class="line num">
					{#if readout}
						<span class="mono">{readout.label}</span><br /><span class="dim">{readout.margin}</span>
					{:else if walk && walk.visited.size}
						This run has read {fmt(walk.visited.size)} of the {fmt(cert.rows)} views.
					{:else if cert.status === 'none'}
						{fmt(cert.rows)} views, every one this table can show the model.
					{:else}
						{fmt(cert.pass)} of {fmt(cert.status === 'running' ? cert.checked : cert.rows)} pass{#if cert.status !== 'shipped'}
							· {cert.seconds.toFixed(0)} s{/if}
					{/if}
				</p>
			</div>
		</div>
	</div>

	<div class="sp-foot">
		{#if also}<p class="also">{also}</p>{/if}
		{#if cert.status === 'cached' || cert.status === 'done'}
			<p>
				Every view checked on this device{when ? `, ${when}` : ''}{device ? ` (${device})` : ''}.
				{#if oncheck}<button class="link ic" disabled={!canCheck} onclick={oncheck}
						><Icon icon={Shield} size={15} />Check again</button
					>{/if}
			</p>
		{:else if cert.status === 'shipped' && cert.shippedFrom}
			{@const sp = cert.spot}
			<p>
				Shipped with the model, checked on {cert.shippedFrom.device}, {stamp(
					cert.shippedFrom.when
				)}.
				{#if sp && sp.checked}
					Its {fmt(sp.rows)} weakest views {sp.running
						? `are being checked here (${fmt(sp.pass)} of ${fmt(sp.checked)} pass)`
						: sp.pass === sp.checked
							? `pass here too (lowest ${fmtMargin(sp.min)})`
							: `: ${fmt(sp.checked - sp.pass)} fail here`}.
				{/if}
				{#if oncheck}<button class="link ic" disabled={!canCheck} onclick={oncheck}
						><Icon icon={Shield} size={15} />Check every view here</button
					>{/if}
			</p>
		{/if}
		{#if cert.failures.length}
			<div class="fails">
				<p class="k">
					{cert.failures.length} failing {cert.failures.length === 1 ? 'row' : 'rows'}
				</p>
				<ul>
					{#each cert.failures.slice(0, 6) as f (f.index)}
						<li
							class="mono"
							onpointerenter={() => (hover = f.index)}
							onpointerleave={() => (hover = null)}
						>
							{f.label}<span class="dim">, wrote {spaced(f.got)}</span>
						</li>
					{/each}
				</ul>
				{#if cert.failures.length > 6}<p class="dim small">
						and {cert.failures.length - 6} more
					</p>{/if}
			</div>
		{/if}
	</div>
</section>

<style>
	.state {
		margin-left: 8px;
		font-weight: 400;
		color: var(--color-ink-soft);
	}
	.stack {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
	}
	.headline {
		flex: none;
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 12px;
	}
	.big {
		font-size: 28px;
		font-weight: 500;
		letter-spacing: -0.02em;
		line-height: 1;
		color: var(--color-ink);
		transition: color var(--hover) ease;
	}
	/* large text: the blue_grey (3.4:1) is enough for a placeholder dash */
	.big.dim {
		color: var(--color-blue-grey);
	}
	/* what the number is, and in one line what a margin means */
	.cap {
		display: grid;
		min-width: 0;
		font-size: var(--text-xs);
		line-height: 1.35;
		color: var(--color-ink-soft);
	}
	.cap .sub {
		font-size: var(--text-2xs);
	}
	.grid {
		flex: 1 1 0;
		min-height: 0;
		width: 100%;
		overflow: hidden;
	}
	canvas {
		display: block;
	}
	.line {
		flex: none;
		margin-top: 8px;
		min-height: 2.9em;
		font-size: var(--text-xs);
		color: var(--color-ink-soft);
	}
	.mono {
		font-family: var(--font-mono);
		font-size: var(--text-2xs);
		white-space: pre;
	}
	.dim {
		color: var(--color-ink-soft);
	}
	.also {
		margin-bottom: 2px;
	}
	.k {
		color: var(--color-ink-soft);
	}
	.link {
		border: 0;
		padding: 0;
		background: none;
		color: var(--color-ink-soft);
		font: inherit;
		text-decoration: underline;
		text-underline-offset: 3px;
		text-decoration-color: var(--color-mist);
		cursor: pointer;
		transition:
			color var(--hover) ease,
			text-decoration-color var(--hover) ease;
	}
	.link:hover:not(:disabled) {
		color: var(--color-ink);
		text-decoration-color: currentColor;
	}
	.link:disabled {
		color: var(--color-blue-grey);
		text-decoration-color: var(--color-mist);
		cursor: default;
	}
	.fails {
		margin-top: 8px;
	}
	.fails ul {
		margin-top: 4px;
		display: grid;
		gap: 2px;
	}
	.fails li {
		cursor: default;
		transition: color var(--hover) ease;
	}
	.fails li:hover {
		color: var(--color-ink);
	}
	.small {
		font-size: var(--text-2xs);
	}
	/* a phone: the grid needs less height than a figure */
	@media (max-width: 719px) {
		.sp-body.sp-fig {
			height: 270px;
		}
	}
</style>
