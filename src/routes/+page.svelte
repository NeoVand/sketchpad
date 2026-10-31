<script lang="ts">
	import { resolve } from '$app/paths';
	import { SECTIONS, TITLE } from '#lib/paper/outline.ts';

	/** the title's two halves: the name, then what it is */
	const [name, rest] = TITLE.split(': ');
</script>

<svelte:head>
	<title>Sketchpad</title>
	<meta
		name="description"
		content="A small vision-language model that computes exactly on its own sheet: the paper and the live demo."
	/>
</svelte:head>

<!-- a text column with a margin column: section numbers and what each section waits on sit in the margin -->
<main class="paper">
	<header class="front">
		<p class="margin kicker num">Skeleton, 30 Oct 2026</p>
		<div class="text">
			<h1><span class="name">{name}:</span> {rest}</h1>
			<p class="note">
				The text is being written. Each section below says what it will hold, and which result it
				waits on where that result has not passed yet. The model runs today in the
				<a href={resolve('/demo')}>demo</a>.
			</p>
		</div>
	</header>

	<section class="row abstract" aria-labelledby="abstract">
		<h2 id="abstract" class="margin label">Abstract</h2>
		<div class="text">
			<p>
				Language models still get long arithmetic wrong, and the usual fix hands the work to a tool
				outside the model. Here we teach Qwen3.5-0.8B, through one small adapter, to do the work
				itself on a sheet it reads with its own eyes, three cells at a time: every digit comes from
				one forward pass, and the sheet is its only memory. It adds, subtracts, multiplies and
				divides signed whole numbers of any length, takes square roots and finds greatest common
				divisors, all exactly. We certify every one of the 2,446 views it can ever meet, and each
				visitor’s GPU checks the weakest of them again before a run.
			</p>
			<p class="waits">
				Waiting on: the published model’s 200 on-device runs (under way); algebra by evaluation
				within 12 s on device; one gated model that chats like stock Qwen and opens its sheet by
				itself.
			</p>
		</div>
	</section>

	<ol class="sections">
		{#each SECTIONS as s, i (s.id)}
			<li id={s.id} class="row">
				<div class="margin">
					<span class="n num">{i + 1}</span>
					{#if s.waits}<p class="waits side">Waiting on {s.waits}.</p>{/if}
				</div>
				<div class="text">
					<h2>{s.title}</h2>
					<p>{s.holds}</p>
					{#if s.waits}<p class="waits inline">Waiting on {s.waits}.</p>{/if}
				</div>
			</li>
		{/each}
	</ol>
</main>

<style>
	.paper {
		--margin: 180px;
		--text: 640px;
		--gap: 40px;
		max-width: calc(var(--margin) + var(--gap) + var(--text) + var(--margin) + var(--gap));
		margin: 0 auto;
		padding: 64px 32px 120px;
	}
	.front,
	.row {
		display: grid;
		grid-template-columns: var(--margin) minmax(0, var(--text));
		column-gap: var(--gap);
	}
	.margin {
		text-align: right;
	}
	.kicker {
		padding-top: 12px;
		font-size: var(--text-xs);
		line-height: 1.5;
		color: var(--color-ink-soft);
	}
	h1 {
		font-family: var(--font-serif);
		font-size: 36px;
		font-weight: 400;
		line-height: 1.2;
		letter-spacing: -0.005em;
		color: var(--color-ink);
	}
	h1 .name {
		color: var(--color-rose);
	}
	.note {
		margin-top: 16px;
		font-size: var(--text-ui);
		line-height: 1.6;
		color: var(--color-ink-soft);
	}
	.abstract {
		margin-top: 56px;
	}
	.label {
		padding-top: 3px;
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--color-ink-soft);
	}
	h2 {
		margin: 0 0 8px;
		font-size: var(--text-lg);
		font-weight: 500;
		color: var(--color-ink);
	}
	p {
		font-size: 15px;
		line-height: 1.65;
		color: var(--color-ink);
	}
	.abstract .text p + p {
		margin-top: 12px;
	}
	.waits {
		font-size: var(--text-xs);
		line-height: 1.5;
		color: var(--color-ink-soft);
	}
	.waits.inline {
		display: none;
		margin-top: 8px;
	}
	.sections {
		list-style: none;
		margin: 40px 0 0;
		padding: 0;
	}
	.sections li {
		padding: 22px 0;
	}
	.n {
		display: block;
		padding-top: 1px;
		font-size: var(--text-lg);
		font-weight: 500;
		color: var(--color-ink-soft);
	}
	.side {
		margin-top: 6px;
		margin-left: auto;
		max-width: 22ch;
	}

	@media (max-width: 880px) {
		.paper {
			padding: 40px 16px 96px;
		}
		.front,
		.row {
			grid-template-columns: minmax(0, 1fr);
		}
		.margin {
			text-align: left;
		}
		.kicker {
			padding: 0 0 10px;
		}
		h1 {
			font-size: 32px;
		}
		.label {
			padding: 0 0 6px;
		}
		.n {
			font-size: var(--text-sm);
		}
		.side {
			display: none;
		}
		.waits.inline {
			display: block;
		}
	}
</style>
