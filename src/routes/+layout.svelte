<script lang="ts">
	import './layout.css';
	import favicon from '#lib/assets/favicon.svg';
	import TopBar from '#lib/ui/TopBar.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content="#ffffff" />
</svelte:head>

<TopBar />
{@render children()}
