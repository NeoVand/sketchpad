<svelte:head>
	<title>Sketchpad · demo</title>
</svelte:head>

<main class="demo">
	<h1>Demo</h1>
	<p>
		The live demo moves here once the calculator, algebra and chat work lands. Until then it runs at
		its old address, with the same weights from Hugging Face.
	</p>
	<p>
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external link -->
		<a href="https://neovand.github.io/polyformer/sketchpad/">Open the current demo</a>
	</p>
</main>

<style>
	.demo {
		max-width: 680px;
		margin: 0 auto;
		padding: 56px 16px 96px;
	}
	h1 {
		margin: 0 0 14px;
		font-size: 30px;
		font-weight: 500;
		letter-spacing: -0.02em;
	}
	p {
		font-size: 15px;
		line-height: 1.6;
	}
	p + p {
		margin-top: 12px;
	}
	a {
		color: var(--color-ink);
		text-underline-offset: 3px;
	}
</style>
