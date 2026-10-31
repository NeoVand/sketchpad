<script lang="ts">
	/**
	 * Sketchpad's mark (static/logo/sketchpad-mark.svg): the sheet seen through a window of three cells, two the model
	 * reads in ink and the third, which it writes, in rose.
	 */
	let { size = 20 }: { size?: number } = $props();
	const SHEET = [
		[2, 2],
		[12, 2],
		[2, 12],
		[12, 12],
		[2, 22],
		[12, 22]
	];
</script>

<svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
	{#each SHEET as [x, y] (`${x},${y}`)}
		<rect class="sheet" {x} {y} width="8" height="8" rx="1.5" />
	{/each}
	<rect class="ink" x="22" y="2" width="8" height="8" rx="1.5" />
	<rect class="ink" x="22" y="12" width="8" height="8" rx="1.5" />
	<rect class="rose" x="22" y="22" width="8" height="8" rx="1.5" />
</svg>

<style>
	svg {
		display: block;
		flex: none;
	}
	.sheet {
		fill: var(--color-mist);
	}
	.ink {
		fill: var(--color-ink);
	}
	.rose {
		fill: var(--color-rose);
	}
</style>
