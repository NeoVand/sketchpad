<script lang="ts">
	import { asset, resolve } from '$app/paths';
</script>

<svelte:head>
	<title>Sketchpad — the film</title>
	<meta
		name="description"
		content="A 2-minute film about certified exact arithmetic with Qwen3.5-0.8B."
	/>
</svelte:head>

<main>
	<header>
		<h1>Sketchpad, the film</h1>
		<a href={resolve('/demo')}>Run the demo</a>
	</header>
	<video controls playsinline preload="metadata" poster={asset('media/sketchpad-poster.jpg')}>
		<source src={asset('media/sketchpad-film.mp4')} type="video/mp4" />
		<track
			kind="captions"
			src={asset('media/sketchpad-film.vtt')}
			srclang="en"
			label="English"
			default
		/>
	</video>
	<p>
		The model, the sheet, and the finite check behind exact arithmetic. The certificate covers the
		model’s steps; the runtime and the translation of word problems remain outside it. Demo footage
		shows recorded runs of the published 0.8B model.
	</p>
	<p>
		Narration is an AI-generated voice from OpenAI. Music and animation are made in code; the
		figures and results come from the <a href={resolve('/')}>paper</a>.
	</p>
</main>

<style>
	main {
		max-width: 1280px;
		margin: 0 auto;
		padding: 32px 24px 72px;
	}
	header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 20px;
		margin-bottom: 24px;
	}
	h1 {
		font-family: var(--font-serif);
		font-size: clamp(28px, 4vw, 42px);
		font-weight: 500;
		color: var(--color-rose);
	}
	video {
		display: block;
		width: 100%;
		aspect-ratio: 16 / 9;
		background: white;
	}
	p {
		max-width: 80ch;
		margin-top: 20px;
		color: var(--color-ink-soft);
		line-height: 1.6;
	}
	a {
		text-decoration: underline;
		text-underline-offset: 4px;
	}
</style>
