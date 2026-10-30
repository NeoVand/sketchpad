<script lang="ts">
	import { SECTIONS, TITLE } from '#lib/paper/outline.ts';
</script>

<svelte:head>
	<title>Sketchpad</title>
	<meta
		name="description"
		content="A small vision-language model that computes exactly on its own sheet: the paper and the live demo."
	/>
</svelte:head>

<main class="paper">
	<header>
		<p class="kicker">Paper · skeleton of 30 Oct 2026</p>
		<h1>{TITLE}</h1>
		<p class="note">
			The text is being written. Each section below says what it will hold, and which result it
			waits on where that result has not passed yet.
		</p>
	</header>

	<section class="abstract" aria-labelledby="abstract">
		<h2 id="abstract">Abstract</h2>
		<p>
			Language models still get long arithmetic wrong, and the usual fix hands the work to a tool
			outside the model. Here we teach Qwen3.5-0.8B, through one small adapter, to do the work
			itself on a sheet it reads with its own eyes, three cells at a time: every digit comes from
			one forward pass, and the sheet is its only memory. It adds and multiplies numbers of any
			length exactly. We certify every one of the 1,795 views it can ever meet, and each visitor’s
			GPU checks the weakest of them again before a run.
		</p>
		<p class="waits">
			Waiting on: subtraction, long division and square root; algebra by evaluation; one gated model
			that chats like stock Qwen and opens its sheet by itself.
		</p>
	</section>

	<ol class="sections">
		{#each SECTIONS as s, i (s.id)}
			<li id={s.id}>
				<h2><span class="n num">{i + 1}</span>{s.title}</h2>
				<p>{s.holds}</p>
				{#if s.waits}<p class="waits">Waiting on: {s.waits}.</p>{/if}
			</li>
		{/each}
	</ol>
</main>

<style>
	.paper {
		max-width: 680px;
		margin: 0 auto;
		padding: 56px 16px 96px;
	}
	.kicker {
		font-size: var(--text-xs);
		color: var(--color-ink-3);
		letter-spacing: 0.02em;
	}
	h1 {
		margin: 10px 0 14px;
		font-size: 30px;
		line-height: 1.2;
		font-weight: 500;
		letter-spacing: -0.02em;
	}
	.note {
		color: var(--color-ink-2);
	}
	h2 {
		display: flex;
		gap: 12px;
		align-items: baseline;
		margin: 0 0 8px;
		font-size: var(--text-lg);
		font-weight: 500;
	}
	.n {
		min-width: 1.2em;
		color: var(--color-ink-3);
		font-weight: 400;
	}
	p {
		font-size: 15px;
		line-height: 1.6;
		color: var(--color-ink);
	}
	.abstract {
		margin: 40px 0 8px;
		padding-top: 24px;
		border-top: 1px solid var(--color-edge);
	}
	.abstract p + p {
		margin-top: 10px;
	}
	.waits {
		font-size: var(--text-sm);
		color: var(--color-ink-3);
	}
	.sections {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.sections li {
		padding: 24px 0;
		border-top: 1px solid var(--color-edge);
	}
	.sections li p {
		padding-left: calc(1.2em + 12px);
	}
	.sections li p + p {
		margin-top: 8px;
	}
</style>
