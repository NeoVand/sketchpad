<script lang="ts">
	import { onMount } from 'svelte';
	import { SheetView, type Metrics } from './sheet-view.ts';
	import type { SheetSource } from './sources.ts';

	interface Props {
		source: SheetSource | null;
		/** bumps after every change to the sheet */
		version: number;
		/** recent model time per tick; paces the glide and the fades */
		tickMs: number;
		/** URL of the training sprites */
		sprites: string;
		/** change an unread digit; return whether it changed */
		onedit?: (r: number, c: number, by: number) => boolean;
		/** smaller cells, for a page that shows the inside of the model beside the sheet */
		compact?: boolean;
	}

	let { source, version, tickMs, sprites, onedit, compact = false }: Props = $props();

	let canvas: HTMLCanvasElement;
	let paper: HTMLDivElement;
	let view = $state.raw<SheetView | null>(null);
	let metrics = $state.raw<Metrics | null>(null);
	let win = $state.raw({ from: 0, to: 1 });
	let cursor = $state('default');
	/** a compact sheet keeps its row labels inside the paper, beside the problem (LABEL_ROOM is kept for them) */
	const LABEL_ROOM = 64;
	const inline = $derived(compact && !!metrics);
	let drag: { x: number; id: number } | null = null;

	onMount(() => {
		const v = new SheetView(canvas);
		v.compact = compact;
		v.reserve = compact ? LABEL_ROOM : 0;
		v.onMetrics = (m) => (metrics = m);
		v.onWindow = (from, to) => {
			if (Math.abs(from - win.from) > 1e-4 || Math.abs(to - win.to) > 1e-4) win = { from, to };
		};
		const img = new Image();
		img.onload = () => v.setSprites(img);
		img.src = sprites;
		v.resize(paper.clientWidth);
		const ro = new ResizeObserver(() => v.resize(paper.clientWidth));
		ro.observe(paper);
		// horizontal wheel pans a long sheet; vertical scrolling stays with the page
		const wheel = (e: WheelEvent) => {
			const dx = e.shiftKey ? e.deltaY : e.deltaX;
			if (!v.canPan || Math.abs(dx) < Math.abs(e.shiftKey ? 0 : e.deltaY)) return;
			e.preventDefault();
			v.panBy(dx);
		};
		canvas.addEventListener('wheel', wheel, { passive: false });
		view = v;
		return () => {
			ro.disconnect();
			canvas.removeEventListener('wheel', wheel);
			v.destroy();
		};
	});

	$effect(() => {
		view?.setSource(source);
	});

	$effect(() => {
		void version;
		view?.sync(tickMs);
	});

	function point(e: PointerEvent | MouseEvent) {
		const r = canvas.getBoundingClientRect();
		return { x: e.clientX - r.left, y: e.clientY - r.top };
	}

	function editableAt(e: PointerEvent | MouseEvent) {
		if (!view || !source) return null;
		const p = point(e);
		const cell = view.cellAt(p.x, p.y);
		return cell && source.editable(cell.r, cell.c) ? cell : null;
	}

	function onpointermove(e: PointerEvent) {
		if (!view) return;
		if (drag && drag.id === e.pointerId) {
			view.panBy(drag.x - e.clientX);
			drag.x = e.clientX;
			return;
		}
		const cell = editableAt(e);
		view.setHover(cell);
		cursor = cell ? 'pointer' : view.canPan ? 'grab' : 'default';
	}

	function onpointerdown(e: PointerEvent) {
		if (!view?.canPan || editableAt(e)) return;
		drag = { x: e.clientX, id: e.pointerId };
		canvas.setPointerCapture(e.pointerId);
		cursor = 'grabbing';
	}

	function onpointerup(e: PointerEvent) {
		if (drag?.id === e.pointerId) {
			drag = null;
			cursor = view?.canPan ? 'grab' : 'default';
		}
	}

	function onclick(e: MouseEvent) {
		const cell = editableAt(e);
		if (!cell || !onedit) return;
		if (onedit(cell.r, cell.c, e.shiftKey ? -1 : 1)) view?.markEdited(cell.r, cell.c);
	}
</script>

<!-- a compact sheet writes its row labels inside the paper, beside the problem; a full sheet keeps them in the margin -->
<div class="sheet" class:inline>
	<div class="labels" aria-hidden="true">
		{#if metrics && source && !inline}
			{#each source.rows as row, r (row.key)}
				<span style:top="{metrics.rowY[r] + metrics.cs / 2}px">{row.label}</span>
			{/each}
		{/if}
	</div>
	<div class="sheet-paper" bind:this={paper}>
		{#if metrics && source && inline}
			<div class="labels in" aria-hidden="true" style:left="{metrics.left - 12}px">
				{#each source.rows as row, r (row.key)}
					<span style:top="{metrics.rowY[r] + metrics.cs / 2}px">{row.label}</span>
				{/each}
			</div>
		{/if}
		<canvas
			bind:this={canvas}
			style:cursor
			aria-label="The sheet: the model's only working memory. Click an unread digit to change it."
			{onpointermove}
			onpointerleave={() => view?.setHover(null)}
			{onpointerdown}
			{onpointerup}
			onpointercancel={onpointerup}
			{onclick}
		></canvas>
		<div class="rail" class:on={win.to - win.from < 0.999} aria-hidden="true">
			<i style:left="{win.from * 100}%" style:width="{(win.to - win.from) * 100}%"></i>
		</div>
	</div>
</div>

<style>
	.sheet {
		max-width: 100%;
		display: grid;
		grid-template-columns: var(--margin-w) minmax(0, 1fr);
		column-gap: var(--gutter);
	}
	.sheet.inline {
		grid-template-columns: 0 minmax(0, 1fr);
		column-gap: 0;
	}
	.labels.in {
		position: absolute;
		top: 0;
		width: 0;
		z-index: 1;
		pointer-events: none;
	}
	.labels {
		position: relative;
	}
	.labels span {
		position: absolute;
		right: 0;
		transform: translateY(-50%);
		font-size: var(--text-xs);
		color: var(--color-blue-grey);
		white-space: nowrap;
		transition: top var(--move) var(--ease);
	}
	.sheet-paper {
		position: relative;
		min-width: 0;
	}
	canvas {
		display: block;
		border-radius: 3px;
		touch-action: pan-y;
		image-rendering: pixelated;
	}
	.rail {
		position: relative;
		height: 2px;
		margin-top: 10px;
		background: var(--track);
		opacity: 0;
		transition: opacity var(--hover) ease;
	}
	.rail.on {
		opacity: 1;
	}
	.rail i {
		position: absolute;
		top: 0;
		bottom: 0;
		background: var(--track-on);
	}
</style>
