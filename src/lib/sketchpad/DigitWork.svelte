<script lang="ts">
	import Inset from './Inset.svelte';
	import type { TickView } from './pad.svelte.ts';
	import type { TickOp } from './protocol.ts';
	import Sheet from './Sheet.svelte';
	import type { SheetSource } from './sources.ts';

	/**
	 * The Algebra tab's "One view" place: the arithmetic under way, beside the line of algebra it feeds. The small
	 * sheet is the one the procedure works on (a column sum, a product, a division), and under it the view the model
	 * reads and what it writes. On a wide screen it follows the line the derivation marks.
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
	}

	let { source, version, tickMs, sprites, last, next, top, running }: Props = $props();

	let room = $state(0);
	let height = $state(0);
	function measure(el: HTMLDivElement) {
		const ro = new ResizeObserver(() => {
			room = el.parentElement?.clientHeight ?? 0;
			height = el.offsetHeight;
		});
		ro.observe(el);
		if (el.parentElement) ro.observe(el.parentElement);
		return () => ro.disconnect();
	}
	/** beside the line, a little above it so the sum and the line read together; never past the panel's end */
	const y = $derived(top === null ? 0 : Math.max(0, Math.min(top - 8, room - height)));
</script>

<figure class="sp-panel work">
	<figcaption class="sp-cap">
		<span class="sp-title">The digit work</span>
		<span class="sp-sub">the arithmetic under way, beside the line it feeds</span>
	</figcaption>
	<div class="sp-body work-body">
		<div class="block" style:transform="translateY({y}px)" {@attach measure}>
			{#if source}
				<div class="small" class:quiet={!running}>
					<Sheet {source} {version} {tickMs} {sprites} compact small />
				</div>
			{/if}
			<Inset {last} {next} {sprites} bare />
		</div>
	</div>
	<p class="sp-foot">
		{#if source || last}The strip is the model’s input pixels, read between the step’s word and “=”.{/if}
	</p>
</figure>

<style>
	.work-body {
		overflow: visible;
		align-content: start;
	}
	.block {
		/* as tall as what it holds, so it can move along the derivation */
		align-self: start;
		display: grid;
		gap: 14px;
		align-content: start;
		transition: transform var(--move) var(--ease);
		/* the sheet's labels and gutter (Sheet.svelte reads these) */
		--margin-w: 0px;
		--gutter: 0px;
	}
	.small {
		transition: opacity var(--move) var(--ease);
	}
	.small.quiet {
		opacity: 0.85;
	}
	/* a phone: under the derivation, where it is */
	@media (max-width: 719px) {
		.block {
			transform: none !important;
		}
	}
</style>
