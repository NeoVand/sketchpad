<script lang="ts">
	import { onMount } from 'svelte';
	import { MODELS, kindOf } from './models.ts';
	import { explain, type TickView } from './pad.svelte.ts';
	import type { TickOp } from './protocol.ts';
	import { B, CELL, GLYPHS } from './sprites.ts';

	interface Props {
		/** the last tick, or null before the first */
		last: TickView | null;
		/** the view the model will read next (shown before the first tick) */
		next: { op: TickOp; cells: string[] } | null;
		sprites: string;
	}

	let { last, next, sprites }: Props = $props();

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
</script>

<figure class="sp-panel eye">
	<figcaption class="sp-cap">
		<span class="sp-title">One tick</span>
		<span class="sp-sub">what the model sees, and what it writes</span>
	</figcaption>
	<div class="sp-body">
		<div class="tick">
			<div class="sees">
				<!-- the frame is a real border around the strip, inside this panel, so nothing can clip it -->
				<div class="frame">
					<canvas {@attach paint} width={CELL} height={3 * CELL}></canvas>
				</div>
				<code class="prompt">
					{#if last || next}{showOp((last ?? next)!.op)} ▢ ={/if}
				</code>
			</div>
			<div class="writes">
				{#if last}
					<div class="tokens">
						{#each tokens as t, i (i)}<span>{t}</span>{/each}
					</div>
					<p class="means">{explain(last.op, last.out)}</p>
					<p class="meta num">
						{#if last.margin !== null}margin {last.margin.toFixed(2)} ·
						{/if}{last.ms.toFixed(0)} ms
					</p>
				{:else}
					<p class="means idle">Its answer appears here at each tick.</p>
				{/if}
			</div>
		</div>
	</div>
	<p class="sp-foot">
		<span class="sp-dim">The model's input pixels, exactly as it reads them.</span>
	</p>
</figure>

<style>
	.tick {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		column-gap: 18px;
		align-content: start;
	}
	/* a white strip on a white page needs its edge: one hairline, the only frame on the page */
	.frame {
		width: fit-content;
		box-shadow: 0 0 0 1px var(--color-mist);
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
	.prompt {
		display: block;
		margin-top: 6px;
		font-family: var(--font-mono);
		font-size: var(--text-2xs);
		line-height: 16px;
		color: var(--color-blue-grey);
		white-space: nowrap;
	}
	.writes {
		min-width: 0;
	}
	.tokens {
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
		color: var(--color-blue-grey);
	}
	.meta {
		margin-top: 4px;
		font-size: var(--text-2xs);
		line-height: 16px;
		color: var(--color-blue-grey);
	}
	.sp-foot {
		font-size: var(--text-2xs);
	}
</style>
