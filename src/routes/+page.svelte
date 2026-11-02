<script lang="ts">
	import '@fontsource-variable/source-serif-4/opsz.css';
	import { asset, resolve } from '$app/paths';
	import Icon from '#lib/ui/Icon.svelte';
	import { Book, Github, Model, Pdf, Play } from '#lib/ui/icons.ts';

	// the film on YouTube (privacy-enhanced embed). The page shows its own copy of the thumbnail, trimmed of the
	// 1-pixel black edges YouTube adds, and loads the player only when the visitor presses play.
	const FILM =
		'https://www.youtube-nocookie.com/embed/RTVMdf301sg?autoplay=1&rel=0&modestbranding=1';
	let playing = $state(false);
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
		{#if playing}
			<iframe
				src={FILM}
				title="Sketchpad, the film"
				allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
				allowfullscreen
			></iframe>
		{:else}
			<button type="button" class="poster" onclick={() => (playing = true)}>
				<img src={asset('media/film-poster.jpg')} alt="" width="1280" height="720" />
				<span class="play"><Icon icon={Play} size={30} /></span>
				<span class="caption ic">Watch the film <span class="len">4:49</span></span>
			</button>
		{/if}
	</div>

	<nav class="entries" aria-label="Sketchpad">
		<a href={resolve('/paper')}>
			<span class="label ic"><Icon icon={Book} size={26} />Paper</span>
			<span class="what">The method, the proofs and the results</span>
		</a>
		<a href={resolve('/demo')}>
			<span class="label ic"><Icon icon={Play} size={26} />Demo</span>
			<span class="what">Run the model on its sheet, in your browser</span>
		</a>
	</nav>

	<p class="more">
		<a class="ic" href={asset('sketchpad.pdf')}><Icon icon={Pdf} size={16} />PDF</a>
		<span aria-hidden="true">·</span>
		<a class="ic" href="https://github.com/NeoVand/sketchpad"
			><Icon icon={Github} size={16} />Code</a
		>
		<span aria-hidden="true">·</span>
		<a class="ic" href="https://huggingface.co/mohsenvand/sketchpad-0.8b-preview"
			><Icon icon={Model} size={16} />Model</a
		>
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
	iframe,
	.poster {
		display: block;
		width: 100%;
		aspect-ratio: 16 / 9;
		border: 0;
		background: white;
	}
	.poster {
		position: relative;
		padding: 0;
		cursor: pointer;
	}
	.poster img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.play {
		position: absolute;
		left: 50%;
		top: 50%;
		display: grid;
		place-items: center;
		width: 84px;
		height: 84px;
		border-radius: 50%;
		background: var(--color-rose);
		color: white;
		box-shadow: 0 10px 30px rgb(214 51 108 / 0.35);
		transform: translate(-50%, -50%);
		transition: transform 180ms ease;
	}
	.poster:hover .play,
	.poster:focus-visible .play {
		transform: translate(-50%, -50%) scale(1.06);
	}
	.caption {
		position: absolute;
		left: 50%;
		bottom: 18px;
		padding: 6px 12px;
		background: rgb(255 255 255 / 0.92);
		font-size: var(--text-sm);
		color: var(--color-ink);
		transform: translateX(-50%);
	}
	.len {
		color: var(--color-ink-soft);
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
		justify-content: center;
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
