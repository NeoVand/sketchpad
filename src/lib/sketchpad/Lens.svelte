<script lang="ts">
	import {
		DEPTH,
		FULL_ATTENTION,
		SUM_CODES,
		sumValue,
		type InsideTick,
		type LensRead
	} from './inside.ts';

	interface Props {
		seen: InsideTick | null;
		kind: 'add' | 'mul';
		/** the program has inside data */
		ready: boolean;
		/** ticks are paced: let each tick rise through the layers */
		slow: boolean;
		/** a view was answered without its states (a run at full speed leaves them on the GPU) */
		unseen?: boolean;
	}

	let { seen, kind, ready, slow, unseen = false }: Props = $props();

	/**
	 * The figure in the box's own pixels: as wide as the box (up to a reading width) and a row per layer as tall as the
	 * box allows, so text keeps its size whatever room the panel has.
	 */
	let W = $state(300);
	let RH = $state(10);
	function measure(box: HTMLDivElement) {
		const ro = new ResizeObserver(() => {
			const w = box.clientWidth;
			const h = box.clientHeight;
			if (w <= 0 || h <= 0) return;
			W = Math.max(240, Math.min(520, w));
			RH = Math.max(7, Math.min(12, (h - HEAD - 4) / DEPTH));
		});
		ro.observe(box);
		return () => ro.disconnect();
	}

	/**
	 * One column per answer token, fixed for the operation, so the figure keeps its shape from tick to tick (a step that
	 * has no such token leaves its column empty). Each layer is a row: the bar is how sure that layer is of the final
	 * answer (the logit lens), the glyph is that layer's own best guess.
	 */
	const COLS = $derived(
		kind === 'add'
			? [{ name: 'column sum', token: 0 }]
			: [
					{ name: 'writes', token: 0 },
					{ name: 'carries', token: 1 },
					{ name: 'next step', token: 2 }
				]
	);
	const AXIS = 26;
	const GLYPH = 22;
	const GAP = 18;
	const colW = $derived((W - AXIS - (COLS.length - 1) * GAP) / COLS.length);
	const barW = $derived(colW - GLYPH);
	const H = $derived(DEPTH * RH);
	const HEAD = 24;
	/** depth 0 (the input) at the bottom, the output at the top */
	const y = (l: number) => HEAD + (DEPTH - 1 - l) * RH;
	const LAYERS = Array.from({ length: DEPTH }, (_, l) => l);

	const reads = $derived(
		COLS.map((c) => seen?.lens.find((r) => r.group.token === c.token) ?? null)
	);
	const show = (r: LensRead, k: number) => {
		const c = r.group.alphabet[k];
		return r.group.alphabet === SUM_CODES ? (c === 'H' ? 'H' : sumValue(c)!) : c === '_' ? '·' : c;
	};
	const argmax = (r: LensRead, l: number) => {
		const K = r.group.alphabet.length;
		let a = 0;
		for (let k = 1; k < K; k++) if (r.probs[l * K + k] > r.probs[l * K + a]) a = k;
		return a;
	};
	const sure = (r: LensRead, l: number) => r.probs[l * r.group.alphabet.length + r.top];
	const decided = $derived(seen?.lens[0]?.decided ?? null);
</script>

<figure class="sp-panel lens">
	<figcaption class="sp-cap">
		<span class="sp-title">Layer by layer</span>
		<span class="sp-sub">how sure each of the 24 layers is of the answer</span>
	</figcaption>
	<div class="sp-body" class:sp-fig={ready && !!seen} {@attach measure}>
		{#if ready && seen}
			<svg
				viewBox="0 0 {W} {HEAD + H + 4}"
				role="img"
				aria-label="How sure each layer is of the answer"
			>
				{#each COLS as col, ci (col.name)}
					{@const r = reads[ci]}
					{@const x0 = AXIS + ci * (colW + GAP)}
					<!-- the token's own name for this step (a subtraction's second token borrows, a multiplication's carries) -->
					<text class="name" x={x0} y="10">{r?.group.name ?? col.name}</text>
					<text class="final" x={x0 + colW} y="11" text-anchor="end">{r ? show(r, r.top) : ''}</text
					>
					{#each LAYERS as l (l)}
						<rect class="track" x={x0} y={y(l) + 1} width={barW} height={RH - 3} />
						{#if r}
							{@const g = argmax(r, l)}
							<rect
								class="bar"
								class:won={l >= r.decided}
								x={x0}
								y={y(l) + 1}
								width={barW * sure(r, l)}
								height={RH - 3}
								style:transition-delay="{slow ? l * 22 : 0}ms"
							/>
							<text
								class="guess"
								class:on={g === r.top}
								style:font-size="{Math.min(9, RH + 0.5)}px"
								x={x0 + barW + GLYPH / 2}
								y={y(l) + RH - 2}
								text-anchor="middle">{show(r, g)}</text
							>
						{/if}
					{/each}
				{/each}
				{#each [0, 8, 16, 24] as l (l)}
					<text class="ylab" x={AXIS - 9} y={y(l) + RH - 2} text-anchor="end">{l}</text>
				{/each}
				{#each FULL_ATTENTION as l (l)}
					<rect class="fa" x={AXIS - 6} y={y(l + 1) + 1} width="3" height={RH - 3} />
				{/each}
				{#if decided !== null}
					<line
						class="dec"
						x1={AXIS - 6}
						x2={W}
						y1={y(decided) + RH - 1}
						y2={y(decided) + RH - 1}
					/>
				{/if}
			</svg>
		{:else}
			<p class="sp-empty">
				{!ready
					? 'Load the model to look inside.'
					: unseen
						? 'At the fast pace the states stay on the GPU; choose slow to watch the layers.'
						: 'Run it to see each layer’s answer.'}
			</p>
		{/if}
	</div>
	<p class="sp-foot">
		{#if decided !== null}The answer leads for good from layer {decided} (dashed).{:else}&nbsp;{/if}
		{#if ready && seen}<span class="sp-dim key"
				>Bar: the layer’s confidence in the final answer; glyph: its own best guess. <i></i>after a
				full-attention layer.</span
			>{/if}
	</p>
</figure>

<style>
	svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}
	.name {
		font-size: 10px;
		fill: var(--color-ink-soft);
	}
	.final {
		font-family: var(--font-mono);
		font-size: 12px;
		fill: var(--color-rose);
	}
	.track {
		fill: var(--color-tint);
	}
	/* a layer's confidence in the final answer: a quiet ink until the answer leads for good, then rose (the model's) */
	.bar {
		fill: var(--color-blue-grey);
		transition:
			width 320ms var(--ease),
			fill 320ms ease;
	}
	.bar.won {
		fill: var(--color-rose);
	}
	.guess {
		font-family: var(--font-mono);
		font-size: 9px;
		fill: var(--color-ink-soft);
	}
	.guess.on {
		fill: var(--color-ink);
	}
	.ylab {
		font-family: var(--font-mono);
		font-size: 9px;
		fill: var(--color-ink-soft);
	}
	.fa {
		fill: var(--color-ink-soft);
	}
	.dec {
		stroke: var(--color-ink-soft);
		stroke-width: 0.75;
		stroke-dasharray: 2 2;
	}
	.key {
		display: block;
		font-size: var(--text-2xs);
	}
	.key i {
		display: inline-block;
		vertical-align: middle;
		width: 3px;
		height: 8px;
		margin: 0 4px 0 2px;
		background: var(--color-ink-soft);
	}
</style>
