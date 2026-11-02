<script lang="ts">
	import { asset, resolve } from '$app/paths';
	import { prefersReducedMotion } from 'svelte/motion';
	import '@fontsource-variable/source-serif-4/index.css';
	let paused = $state(true);
	// the film on YouTube; the silent loop stays as the preview until the visitor asks for the film
	const FILM =
		'https://www.youtube-nocookie.com/embed/RTVMdf301sg?autoplay=1&rel=0&modestbranding=1';
	let watching = $state(false);

	function preview(video: HTMLVideoElement) {
		const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
			.connection;
		if (prefersReducedMotion.current || connection?.saveData) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) void video.play().catch(() => {});
				else video.pause();
			},
			{ threshold: 0.25 }
		);
		observer.observe(video);
		return () => {
			observer.disconnect();
			video.pause();
		};
	}
</script>

<section class="film-hero" aria-labelledby="sketchpad-title">
	<div class="intro">
		<h1 id="sketchpad-title">Sketchpad</h1>
		<p class="statement">Exact arithmetic, three cells at a time.</p>
		<p class="description">
			A fine-tuned Qwen3.5-0.8B reads a sheet and computes every digit. Checking its 2,446 possible
			views certifies its steps at every input length, relative to the runtime.
		</p>
		<nav aria-label="About Sketchpad">
			<button type="button" class="watch" onclick={() => (watching = true)}>
				Watch the film <span>4:49</span>
			</button>
			<a href={resolve('/')}>Paper</a>
			<a href="https://github.com/NeoVand/sketchpad">Code</a>
			<a href="https://huggingface.co/mohsenvand/sketchpad-0.8b-preview">Model</a>
		</nav>
	</div>
	<div class="preview">
		{#if watching}
			<iframe
				src={FILM}
				title="Sketchpad, the film"
				allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
				allowfullscreen
			></iframe>
		{:else}
			<video
				src={asset('media/sketchpad-loop.mp4')}
				poster={asset('media/sketchpad-poster.jpg')}
				{@attach preview}
				bind:paused
				muted
				loop
				playsinline
				preload="none"
				aria-label="Silent preview of the Sketchpad film"
			></video>
			<button type="button" class="play" onclick={() => (watching = true)}
				>Watch the film with sound</button
			>
			<button type="button" onclick={() => (paused = !paused)}>
				{paused ? 'Play preview' : 'Pause preview'}
			</button>
		{/if}
	</div>
</section>

<style>
	.film-hero {
		display: grid;
		grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
		align-items: center;
		gap: 48px;
		padding: 16px 0 30px;
		margin-bottom: 22px;
		border-bottom: 1px solid var(--color-edge);
	}
	h1 {
		font-family: 'Source Serif 4 Variable', var(--font-serif);
		font-size: clamp(40px, 4.5vw, 64px);
		font-weight: 500;
		letter-spacing: -0.035em;
		line-height: 1.1;
		color: var(--color-rose);
	}
	.statement {
		margin-top: 14px;
		font-size: clamp(20px, 2vw, 28px);
		line-height: 1.25;
		letter-spacing: -0.02em;
	}
	.description {
		max-width: 55ch;
		margin-top: 12px;
		color: var(--color-ink-soft);
		font-size: var(--text-ui);
		line-height: 1.6;
	}
	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 12px 24px;
		margin-top: 20px;
		font-size: var(--text-sm);
	}
	a {
		text-decoration: underline;
		text-underline-offset: 4px;
	}
	.watch {
		padding: 0;
		font-size: inherit;
		text-decoration: none;
		color: var(--color-cobalt);
	}
	.watch span {
		margin-left: 6px;
		font-size: var(--text-xs);
		color: var(--color-ink-soft);
	}
	video,
	iframe {
		display: block;
		width: 100%;
		aspect-ratio: 16 / 9;
		border: 0;
		background: white;
	}
	.play {
		margin-right: 16px;
		color: var(--color-cobalt);
	}
	.preview {
		text-align: right;
	}
	button {
		padding: 4px 0;
		border: 0;
		background: none;
		font: inherit;
		font-size: var(--text-xs);
		color: var(--color-ink-soft);
		text-decoration: underline;
		text-underline-offset: 4px;
		cursor: pointer;
	}
	@media (max-width: 719px) {
		.film-hero {
			grid-template-columns: minmax(0, 1fr);
			gap: 24px;
			padding-top: 6px;
		}
	}
</style>
