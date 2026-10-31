<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import Icon from './Icon.svelte';
	import Mark from './Mark.svelte';
	import { Book, Github, Play } from './icons.ts';

	const nav = [
		{ label: 'Paper', href: resolve('/'), match: (r: string) => r === '/', icon: Book },
		{
			label: 'Demo',
			href: resolve('/demo'),
			match: (r: string) => r.startsWith('/demo'),
			icon: Play
		}
	];
	const route = $derived(page.route.id ?? '/');
</script>

<header class="bar">
	<a class="wordmark" href={resolve('/')}><Mark size={20} />sketchpad</a>
	<nav aria-label="Primary">
		{#each nav as item (item.href)}
			<a
				href={item.href}
				class={{ active: item.match(route) }}
				aria-current={item.match(route) ? 'page' : undefined}
				><Icon icon={item.icon} size={16} />{item.label}</a
			>
		{/each}
	</nav>
	<div class="right">
		<a
			class="gh"
			href="https://github.com/NeoVand/sketchpad"
			title="Source on GitHub"
			aria-label="Source on GitHub"><Icon icon={Github} size={18} /></a
		>
	</div>
</header>

<style>
	.bar {
		position: sticky;
		top: 0;
		z-index: 20;
		height: var(--bar-h);
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		padding: 0 16px 0 32px;
		background: rgb(255 255 255 / 0.92);
		backdrop-filter: blur(8px);
		border-bottom: 1px solid var(--color-edge);
	}
	.wordmark {
		display: flex;
		align-items: center;
		gap: 9px;
		width: fit-content;
		font-size: 17px;
		font-weight: 500;
		letter-spacing: -0.015em;
		color: var(--color-ink);
		text-decoration: none;
	}
	nav {
		display: flex;
		height: 100%;
		gap: 4px;
	}
	nav a {
		position: relative;
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 0 14px;
		color: var(--color-ink-soft);
		text-decoration: none;
		font-size: var(--text-ui);
		transition: color var(--hover) ease;
	}
	nav a:hover,
	nav a.active {
		color: var(--color-ink);
	}
	nav a.active {
		font-weight: 500;
	}
	nav a.active::after {
		content: '';
		position: absolute;
		left: 10px;
		right: 10px;
		bottom: -1px;
		height: 2px;
		background: var(--color-ink);
	}
	.right {
		display: flex;
		justify-content: flex-end;
	}
	.gh {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: var(--radius-ui);
		color: var(--color-ink-soft);
		transition:
			color var(--hover) ease,
			background var(--hover) ease;
	}
	.gh:hover {
		color: var(--color-ink);
		background: var(--color-tint);
	}
	@media (max-width: 560px) {
		.bar {
			grid-template-columns: auto 1fr auto;
			padding: 0 8px 0 16px;
		}
		nav {
			justify-content: center;
		}
		nav a {
			padding: 0 10px;
		}
	}
</style>
