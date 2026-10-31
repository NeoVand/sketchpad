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
	}

	let { seen, kind, ready, slow }: Props = $props();

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
	const RH = 10;
	const AXIS = 26;
	const GLYPH = 22;
	const GAP = 16;
	const W = 300;
	const colW = $derived((W - AXIS - (COLS.length - 1) * GAP) / COLS.length);
	const barW = $derived(colW - GLYPH);
	const H = DEPTH * RH;
	const HEAD = 30;
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
	<div class="sp-body">
		{#if ready}
			<svg
				viewBox="0 0 {W} {HEAD + H + 4}"
				role="img"
				aria-label="How sure each layer is of the answer"
			>
				{#each COLS as col, ci (col.name)}
					{@const r = reads[ci]}
					{@const x0 = AXIS + ci * (colW + GAP)}
					<text class="name" x={x0} y="10">{col.name}</text>
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
			<p class="sp-empty">Load the model to look inside.</p>
		{/if}
	</div>
	<p class="sp-foot">
		{#if decided !== null}The answer leads for good from layer {decided} (dashed).{:else}&nbsp;{/if}
		<span class="sp-dim key"
			>Bar: the layer's confidence in the final answer; glyph: its own best guess. <i></i>after a
			full-attention layer.</span
		>
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
		fill: var(--color-blue-grey);
	}
	.final {
		font-family: var(--font-mono);
		font-size: 12px;
		fill: var(--color-rose);
	}
	.track {
		fill: var(--color-tint);
	}
	/* a layer's confidence in the final answer: mist until the answer leads for good, then rose (the model's answer) */
	.bar {
		fill: var(--color-mist);
		transition:
			width 320ms var(--ease),
			fill 320ms ease;
	}
	.bar.won {
		fill: var(--color-rose);
	}
	.guess {
		font-family: var(--font-mono);
		font-size: 8.5px;
		fill: var(--color-blue-grey);
	}
	.guess.on {
		fill: var(--color-ink);
	}
	.ylab {
		font-family: var(--font-mono);
		font-size: 8.5px;
		fill: var(--color-blue-grey);
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
