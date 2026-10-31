<script lang="ts">
	import Inset from './Inset.svelte';
	import type { TickView } from './pad.svelte.ts';
	import type { TickOp } from './protocol.ts';
	import Sheet from './Sheet.svelte';
	import type { SheetSource } from './sources.ts';

	/**
	 * The Algebra tab's "One view" place: the arithmetic under way, beside the line of algebra it feeds. The small
	 * sheet is the one the procedure works on (a column sum, a product, a division), and under it the view the model
	 * reads and what it writes.
	 *
	 * It never moves anything else. Its block has one size, the largest any operation needs (--work-h, which the
	 * derivation keeps as its least height), and it sits out of the flow, so neither its size nor where it sits can
	 * change the height of the row it shares. On a wide screen it follows the line the derivation marks, downward only
	 * within a run; on a phone it is one fixed slot under the derivation.
	 */
	interface Props {
		source: SheetSource | null;
		version: number;
		tickMs: number;
		sprites: string;
		last: TickView | null;
		next: { op: TickOp; cells: string[] } | null;
		/** where the line it feeds sits in the derivation's body (null: no line under way) */
		top: number | null;
		running: boolean;
		/** the run under way: a new one lets the block go back to the top */
		run: number;
	}

	let { source, version, tickMs, sprites, last, next, top, running, run }: Props = $props();

	/** the column's height (the derivation's) and the block's (fixed) */
	let room = $state(0);
	let height = $state(0);
	function measure(el: HTMLElement) {
		const block = el.firstElementChild as HTMLElement;
		const ro = new ResizeObserver(() => {
			room = el.clientHeight;
			height = block.offsetHeight;
		});
		ro.observe(el);
		ro.observe(block);
		return () => ro.disconnect();
	}

	/**
	 * beside the line, a little above it so the sum and the line read together; within a run it only moves down (the
	 * lowest place so far is kept here, outside the reactive graph, and a new run starts again from the top)
	 */
	let held = { run: -1, y: 0 };
	const y = $derived.by(() => {
		if (run !== held.run) held = { run, y: 0 };
		if (top !== null)
			held.y = Math.max(held.y, Math.min(Math.max(0, top - 8), Math.max(0, room - height)));
		return held.y;
	});
	/** the block moves down with a glide; back to the top (a new run) at once, so it is never seen moving up */
	let at = 0;
	function place(el: HTMLElement) {
		const to = y;
		if (to < at) {
			el.style.transition = 'none';
			el.style.transform = `translateY(${to}px)`;
			void el.offsetHeight;
			el.style.transition = '';
		} else el.style.transform = `translateY(${to}px)`;
		at = to;
	}
</script>

<figure class="sp-panel work">
	<figcaption class="sp-cap">
		<span class="sp-title">The digit work</span>
		<span class="sp-sub">the arithmetic under way, beside the line it feeds</span>
	</figcaption>
	<div class="sp-body work-body" {@attach measure}>
		<div class="block" {@attach place}>
			<div class="small" class:quiet={!running}>
				{#if source}
					{#key source}
						<Sheet {source} {version} {tickMs} {sprites} compact small />
					{/key}
				{/if}
			</div>
			<div class="view">
				<Inset {last} {next} {sprites} bare />
			</div>
		</div>
	</div>
	<p class="sp-foot">
		{#if source || last}The strip is the model’s input pixels, read between the step’s word and “=”.{/if}
	</p>
</figure>

<style>
	/* the column: as tall as the derivation beside it; what it holds is out of the flow */
	.work-body {
		position: relative;
		overflow: visible;
	}
	.block {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: var(--work-h);
		display: grid;
		grid-template-rows: var(--work-sheet) var(--work-view);
		row-gap: var(--work-gap);
		transition: transform var(--move) var(--ease);
		/* the sheet's labels and gutter (Sheet.svelte reads these) */
		--margin-w: 0px;
		--gutter: 0px;
	}
	/* each part keeps its one size whatever the operation: a sum, a borrow, ten rows of a product */
	.small,
	.view {
		min-height: 0;
		overflow: hidden;
	}
	.small {
		transition: opacity var(--move) var(--ease);
	}
	.small.quiet {
		opacity: 0.85;
	}
	/* a phone: one fixed slot under the derivation */
	@media (max-width: 719px) {
		.work-body {
			height: var(--work-h);
		}
		.block {
			transform: none !important;
		}
	}
</style>
