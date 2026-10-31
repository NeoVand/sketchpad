<script lang="ts">
	import { onMount } from 'svelte';
	import { MODELS, kindOf } from './models.ts';
	import { STEP, explain, type TickView } from './pad.svelte.ts';
	import type { TickOp } from './protocol.ts';
	import { B, CELL, GLYPHS } from './sprites.ts';

	interface Props {
		/** the last tick, or null before the first */
		last: TickView | null;
		/** the view the model will read next (shown before the first tick) */
		next: { op: TickOp; cells: string[] } | null;
		sprites: string;
		/** only the strip and the answer, for a panel that has its own caption (the Algebra tab's digit work) */
		bare?: boolean;
	}

	let { last, next, sprites, bare = false }: Props = $props();

	let img = $state.raw<HTMLImageElement | null>(null);

	onMount(() => {
		const i = new Image();
		i.onload = () => (img = i);
		i.src = sprites;
	});

	// the word the model actually reads before the image, from the loaded program's prompts
	const showOp = (op: TickOp) => MODELS[kindOf(op)].prompts[op] ?? op;

	/**
	 * The strip: the pixels the worker fed the model, or the next view assembled from the same sprites, shown exactly as
	 * the model reads them (black ink on white).
	 */
	function paint(canvas: HTMLCanvasElement) {
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		if (!ctx) return;
		draw(ctx);
		// a GPU reset wipes the canvas: paint it again when the browser gives it back
		const again = () => draw(ctx);
		canvas.addEventListener('contextrestored', again);
		return () => canvas.removeEventListener('contextrestored', again);
	}

	function draw(ctx: CanvasRenderingContext2D) {
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, CELL, 3 * CELL);
		if (last) {
			ctx.putImageData(new ImageData(new Uint8ClampedArray(last.strip), CELL, 3 * CELL), 0, 0);
		} else if (next && img) {
			const sheet = img;
			next.cells.forEach((g, k) => {
				const gi = GLYPHS.indexOf(g);
				if (gi >= 0) ctx.drawImage(sheet, gi * CELL, k * CELL, CELL, CELL, 0, k * CELL, CELL, CELL);
			});
		}
	}

	const tokens = $derived(last ? last.out.map((t) => (t === B ? '_' : t)) : []);
	/** the view on show: the last one answered, or the next one before a run */
	const shown = $derived(last ?? next);
</script>

{#snippet view()}
	{#if shown}
		<div class="tick" class:bare>
			<!-- the strip on white needs its edge: one hairline, inside the panel so nothing clips it -->
			<div class="frame">
				<canvas {@attach paint} width={CELL} height={3 * CELL}></canvas>
			</div>
			<div class="writes">
				<p class="asked">
					<code>{showOp(shown.op)}</code><span>{STEP[shown.op]}</span>
				</p>
				{#if last}
					<div class="tokens" aria-label="The model's answer">
						{#each tokens as t, i (i)}<span>{t}</span>{/each}
					</div>
					<p class="means">{explain(last.op, last.out)}</p>
					<p class="meta num">
						{last.margin !== null ? `margin ${last.margin.toFixed(2)} · ` : ''}{last.ms.toFixed(0)} ms
					</p>
				{:else}
					<p class="means idle">Its answer appears here when it runs.</p>
				{/if}
			</div>
		</div>
	{:else}
		<p class="empty">The view the model reads appears here.</p>
	{/if}
{/snippet}

{#if bare}
	{@render view()}
{:else}
	<figure class="sp-panel eye">
		<figcaption class="sp-cap">
			<span class="sp-title">One view</span>
			<span class="sp-sub">what the model reads, and what it writes</span>
		</figcaption>
		<div class="sp-body">{@render view()}</div>
		<p class="sp-foot">
			{#if shown}Left: the model’s input pixels, exactly as it reads them, between the step’s word
				and “=”.{/if}
		</p>
	</figure>
{/if}

<style>
	.tick {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		column-gap: 18px;
		align-content: start;
		align-items: start;
	}
	/* a white strip on a white page needs its edge: one hairline, the only frame on the page */
	.frame {
		width: fit-content;
		border: 1px solid var(--color-mist);
		border-radius: 2px;
		overflow: hidden;
		line-height: 0;
	}
	canvas {
		display: block;
		width: 48px;
		height: 144px;
		image-rendering: pixelated;
	}
	.writes {
		min-width: 0;
	}
	/* beside other work: the strip at its own pixel size, the answer a size down */
	.tick.bare {
		column-gap: 14px;
	}
	.tick.bare canvas {
		width: 32px;
		height: 96px;
	}
	.tick.bare .tokens {
		margin-top: 6px;
		height: 22px;
		font-size: 18px;
		line-height: 22px;
	}
	.tick.bare .means {
		height: auto;
		max-height: 2.6em;
	}
	/* the step: the word the model reads, then what it means */
	.asked {
		display: flex;
		align-items: baseline;
		gap: 8px;
		min-width: 0;
		font-size: var(--text-xs);
		line-height: 16px;
		color: var(--color-ink-soft);
	}
	.asked code {
		font-family: var(--font-mono);
		font-size: var(--text-xs);
		color: var(--color-ink);
	}
	.asked span {
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.tokens {
		margin-top: 8px;
		height: 28px;
		display: flex;
		gap: 10px;
		font-family: var(--font-mono);
		font-size: 22px;
		line-height: 28px;
		/* what the model wrote: rose */
		color: var(--color-rose);
	}
	.means {
		margin-top: 6px;
		height: 3.9em;
		overflow: hidden;
		font-size: var(--text-sm);
		line-height: 1.3;
		color: var(--color-ink-soft);
		transition: color var(--hover) ease;
	}
	.means.idle {
		margin-top: 8px;
	}
	.meta {
		margin-top: 4px;
		font-size: var(--text-2xs);
		line-height: 16px;
		color: var(--color-ink-soft);
	}
	.empty {
		font-size: var(--text-xs);
		color: var(--color-ink-soft);
	}
	.sp-foot {
		font-size: var(--text-2xs);
	}
</style>
