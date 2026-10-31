<script lang="ts">
	import { sumValue, type Family, type InsideTick } from './inside.ts';
	import type { InsideMeta } from './protocol.ts';
	import StateMap from './StateMap.svelte';

	interface Props {
		seen: InsideTick | null;
		wrote: string | null;
		meta: InsideMeta | null;
		kind: 'add' | 'mul';
		runKey: unknown;
		slow: boolean;
		push: string | null;
		canPush: boolean;
		onpush: (code: string | null) => void;
	}

	let { seen, wrote, meta, kind, runKey, slow, push, canPush, onpush }: Props = $props();

	/** the adder has one step; the multiplier two that write digits, each with its own map */
	const maps = $derived<{ family: Family; name: string }[]>(
		kind === 'add'
			? [{ family: 'SUM', name: '' }]
			: [
					{ family: 'MUL', name: 'multiply step' },
					{ family: 'ADD', name: 'add step' }
				]
	);
	const show = (c: string) => (c === 'H' ? 'halt' : sumValue(c)!);
	const note = $derived.by(() => {
		if (seen?.pushed && wrote) {
			const want = show(seen.pushed);
			const got = sumValue(wrote) ?? wrote;
			return want === got
				? `Pushed toward ${want} at layer ${meta?.steerLayer}: it wrote ${got}.`
				: `Pushed toward ${want} at layer ${meta?.steerLayer}: it still wrote ${got}.`;
		}
		if (push)
			return kind === 'add'
				? `The next view is pushed toward ${show(push)} at layer ${meta?.steerLayer}.`
				: `The next multiply step is pushed toward ${push} at layer ${meta?.steerLayer}.`;
		if (kind === 'add' && canPush && meta) return 'Click a number to push the next view toward it.';
		if (kind === 'mul' && canPush && meta)
			return 'Click a digit on the multiply map to push the next multiply step toward it.';
		if (kind === 'mul' && meta)
			return 'Each view lights the map of its step; the other steps (the last carry, the next digit, and the calculator’s subtract, guess and lower) have no map.';
		return '';
	});
</script>

<figure class="sp-panel space">
	<figcaption class="sp-cap">
		<span class="sp-title">State space</span>
		<span class="sp-sub">the state that writes the answer, in a 3D slice · drag to turn</span>
	</figcaption>
	<div class="sp-body" class:sp-fig={!!meta} class:pair={maps.length === 2}>
		{#if meta}
			<div class="maps" style:grid-template-columns="repeat({maps.length}, minmax(0, 1fr))">
				{#each maps as m (m.family)}
					<div class="map" class:named={!!m.name}>
						{#if m.name}<span class="name" class:on={seen?.family === m.family}>{m.name}</span>{/if}
						<StateMap
							family={m.family}
							{seen}
							{wrote}
							{meta}
							{runKey}
							{slow}
							{push}
							{canPush}
							{onpush}
						/>
					</div>
				{/each}
			</div>
		{:else}
			<p class="sp-empty">Load the model to look inside.</p>
		{/if}
	</div>
	<p class="sp-foot">
		{note}
		{#if meta}<span class="sp-dim dots"
				>Dots: the table’s views at the last layer. Line: the last view, from layer 0 at the ring.</span
			>{/if}
	</p>
</figure>

<style>
	.maps {
		position: absolute;
		inset: 0;
		display: grid;
		gap: 16px;
	}
	.map {
		display: grid;
		grid-template-rows: minmax(0, 1fr);
		min-width: 0;
		min-height: 0;
	}
	.map.named {
		grid-template-rows: auto minmax(0, 1fr);
		row-gap: 4px;
	}
	.name {
		font-size: var(--text-2xs);
		color: var(--color-ink-soft);
		text-align: center;
		transition: color var(--hover) ease;
	}
	.name.on {
		color: var(--color-ink);
	}
	.dots {
		display: block;
		font-size: var(--text-2xs);
	}
	/* a phone: two maps side by side are squares half the width wide, so the pair needs less height */
	@media (max-width: 719px) {
		.sp-body.sp-fig.pair {
			height: 200px;
		}
	}
</style>
