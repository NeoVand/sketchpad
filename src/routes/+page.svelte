<script lang="ts">
	import '@fontsource-variable/source-serif-4/opsz.css';
	import { asset, resolve } from '$app/paths';

	// the film on YouTube (privacy-enhanced embed); nothing plays until the visitor presses play
	const FILM = 'https://www.youtube-nocookie.com/embed/RTVMdf301sg?rel=0&modestbranding=1';
</script>

<svelte:head>
	<title>Sketchpad</title>
	<meta
		name="description"
		content="Sketchpad: certified exact arithmetic with a small vision-language model. The film, the paper and a demo that runs in your browser."
	/>
</svelte:head>

<main class="landing">
	<header>
		<h1>Sketchpad</h1>
		<p class="sub">Certified exact arithmetic with a small vision-language model</p>
		<p class="byline">Mostafa ‘Neo’ Mohsenvand · MIT Media Lab</p>
	</header>

	<div class="film">
		<iframe
			src={FILM}
			title="Sketchpad, the film"
			allow="encrypted-media; picture-in-picture; fullscreen"
			allowfullscreen
		></iframe>
	</div>

	<nav class="entries" aria-label="Sketchpad">
		<a href={resolve('/paper')}>
			<span class="label">Paper</span>
			<span class="what">The method, the proofs and the results</span>
		</a>
		<a href={resolve('/demo')}>
			<span class="label">Demo</span>
			<span class="what">Run the model on its sheet, in your browser</span>
		</a>
	</nav>

	<p class="more">
		<a href={asset('sketchpad.pdf')}>PDF</a>
		<span aria-hidden="true">·</span>
		<a href="https://github.com/NeoVand/sketchpad">Code</a>
		<span aria-hidden="true">·</span>
		<a href="https://huggingface.co/mohsenvand/sketchpad-0.8b-preview">Model</a>
	</p>
</main>

<style>
	.landing {
		max-width: 1040px;
		margin: 0 auto;
		padding: 64px 24px 96px;
		text-align: center;
		color: var(--color-ink);
	}
	h1 {
		font-family: 'Source Serif 4 Variable', Georgia, serif;
		font-size: clamp(44px, 7vw, 76px);
		font-weight: 500;
		line-height: 1.05;
		color: var(--color-rose);
	}
	.sub {
		margin-top: 14px;
		font-family: 'Source Serif 4 Variable', Georgia, serif;
		font-size: clamp(19px, 2.4vw, 25px);
		color: var(--color-ink);
	}
	.byline {
		margin-top: 10px;
		font-size: var(--text-sm);
		color: var(--color-ink-soft);
	}
	.film {
		margin: 40px auto 0;
		box-shadow: 0 18px 50px rgb(31 42 68 / 0.12);
	}
	iframe {
		display: block;
		width: 100%;
		aspect-ratio: 16 / 9;
		border: 0;
		background: white;
	}
	.entries {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 24px;
		max-width: 720px;
		margin: 44px auto 0;
	}
	.entries a {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 18px 12px;
		border-top: 2px solid var(--color-rose);
		transition: color 160ms ease;
	}
	.entries a:last-child {
		border-top-color: var(--color-cobalt);
	}
	.label {
		font-family: 'Source Serif 4 Variable', Georgia, serif;
		font-size: 30px;
		color: var(--color-ink);
	}
	.entries a:first-child:hover .label {
		color: var(--color-rose);
	}
	.entries a:last-child:hover .label {
		color: var(--color-cobalt);
	}
	.what {
		font-size: var(--text-sm);
		color: var(--color-ink-soft);
	}
	.more {
		margin-top: 28px;
		font-size: var(--text-sm);
		color: var(--color-ink-soft);
	}
	.more a {
		text-decoration: underline;
		text-underline-offset: 4px;
	}
	.more span {
		margin: 0 8px;
	}
	@media (max-width: 600px) {
		.landing {
			padding: 36px 16px 64px;
		}
		.entries {
			grid-template-columns: minmax(0, 1fr);
			gap: 8px;
		}
	}
</style>
