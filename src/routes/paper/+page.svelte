<script lang="ts">
	import '@fontsource-variable/source-serif-4/opsz.css';
	import '@fontsource-variable/source-serif-4/opsz-italic.css';
	import { asset, resolve } from '$app/paths';
	import Icon from '#lib/ui/Icon.svelte';
	import { Model, Pdf, Play } from '#lib/ui/icons.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	/** the title's two halves: the name, then what it is */
	const parts = $derived(data.meta.title.split(': '));
	/** a hyphenated compound in the title never breaks across lines */
	const rest = $derived(parts.slice(1).join(': ').replaceAll('-', '\u2011'));
</script>

<svelte:head>
	<title>Sketchpad</title>
	<meta
		name="description"
		content="A small vision-language model that computes exactly on its own sheet: every step certified, checked again on your GPU."
	/>
</svelte:head>

<!-- three columns on wide screens: labels in the left margin, the text, and room on the right that figures use -->
<main class="paper">
	<header class="front">
		<p class="kicker">{data.meta.date}</p>
		<h1><span class="name">{parts[0]}:</span> {rest}</h1>
		<p class="byline">
			{data.meta.authors}{#if data.meta.affiliation}<span class="affil"
					>, {data.meta.affiliation}</span
				>{/if}
		</p>
		<p class="links">
			<a class="ic" href={resolve('/demo')}><Icon icon={Play} size={16} />Run it in your browser</a>
			<span aria-hidden="true">·</span>
			<a class="ic" href={asset('sketchpad.pdf')}><Icon icon={Pdf} size={16} />PDF</a>
			<span aria-hidden="true">·</span>
			<a class="ic" href="https://huggingface.co/mohsenvand/sketchpad-0.8b-preview"
				><Icon icon={Model} size={16} />The model</a
			>
		</p>
	</header>

	<article class="body">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- built at prerender time from paper/paper.md -->
		{@html data.html}
	</article>
</main>

<style>
	.paper {
		--left: 200px;
		--text: 680px;
		--right: 200px;
		--gap: 40px;
		--serif: 'Source Serif 4 Variable', 'KaTeX_Main', Georgia, serif;
		max-width: calc(var(--left) + var(--text) + var(--right) + 2 * var(--gap) + 64px);
		margin: 0 auto;
		padding: 72px 32px 140px;
		color: var(--color-ink);
	}

	/* ---- front matter ------------------------------------------------------------------------------------------ */
	.front {
		max-width: calc(var(--text) + 2 * var(--gap));
		margin: 0 auto;
		text-align: center;
	}
	.front h1 {
		margin-left: auto;
		margin-right: auto;
	}
	.front .links {
		justify-content: center;
	}
	.kicker {
		font-size: var(--text-xs);
		letter-spacing: 0.02em;
		color: var(--color-ink-soft);
	}
	h1 {
		margin-top: 14px;
		font-family: var(--serif);
		font-size: 40px;
		font-weight: 400;
		line-height: 1.15;
		letter-spacing: -0.012em;
		max-width: 24ch;
		text-wrap: balance;
	}
	h1 .name {
		color: var(--color-rose);
		font-weight: 500;
	}
	.byline {
		margin-top: 18px;
		font-size: var(--text-ui);
		color: var(--color-ink-soft);
	}
	.links {
		margin-top: 6px;
		display: flex;
		gap: 10px;
		font-size: var(--text-ui);
		color: var(--color-ink-soft);
	}
	.links a {
		color: var(--color-ink);
	}

	/* ---- the grid: every block sits in the text column unless it asks for more ---------------------------------- */
	.body {
		display: grid;
		grid-template-columns:
			[left-start] var(--left) [left-end] var(--gap) [text-start] minmax(0, var(--text))
			[text-end] var(--gap) [right-start] var(--right) [right-end];
		margin-top: 48px;
		font-family: var(--serif);
		font-size: 18px;
		line-height: 1.62;
		font-optical-sizing: auto;
		font-feature-settings:
			'kern',
			'liga',
			'onum' 0;
	}
	.body > :global(*) {
		grid-column: text;
	}
	.body :global(p) {
		margin: 0 0 1em;
		hyphens: auto;
	}
	.body :global(strong) {
		font-weight: 600;
	}
	.body :global(code) {
		font-family: var(--font-mono);
		font-size: 0.8em;
		color: var(--color-ink-soft);
	}
	.body :global(a) {
		text-decoration-color: var(--color-mist);
	}
	.body :global(ol),
	.body :global(ul) {
		margin: 0 0 1em;
		padding-left: 1.3em;
		list-style: decimal;
	}
	.body :global(ul) {
		list-style: disc;
	}
	.body :global(li) {
		margin-bottom: 0.45em;
	}
	.body :global(li::marker) {
		font-family: var(--font-sans);
		font-size: 0.8em;
		color: var(--color-ink-soft);
	}
	.body :global(.dmath) {
		margin: 0.4em 0 1.2em;
		overflow-x: auto;
		overflow-y: hidden;
	}

	/* abstract: its label in the margin */
	.body :global(.abstract) {
		display: grid;
		grid-column: left-start / text-end;
		grid-template-columns: var(--left) minmax(0, var(--text));
		column-gap: var(--gap);
		margin-bottom: 8px;
	}
	.body :global(.abs-h) {
		margin: 6px 0 0;
		text-align: right;
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--color-ink-soft);
	}
	.body :global(.abstract p) {
		grid-column: 2;
		font-size: 17px;
		line-height: 1.6;
	}

	/* section heads: the number in the left margin */
	.body :global(h2.sec) {
		display: grid;
		grid-column: left-start / text-end;
		grid-template-columns: var(--left) minmax(0, var(--text));
		column-gap: var(--gap);
		align-items: baseline;
		margin: 56px 0 14px;
		font-family: var(--serif);
		font-size: 25px;
		font-weight: 500;
		line-height: 1.25;
		letter-spacing: -0.005em;
	}
	.body :global(.sec-n) {
		text-align: right;
		font-family: var(--font-sans);
		font-size: 15px;
		font-weight: 500;
		color: var(--color-rose);
	}
	.body :global(h3) {
		margin: 30px 0 8px;
		font-family: var(--font-sans);
		font-size: 15px;
		font-weight: 600;
		letter-spacing: 0.005em;
	}

	/* citations and cross-references */
	.body :global(sup.cite) {
		white-space: nowrap;
		font-family: var(--font-sans);
		font-size: 0.62em;
		line-height: 0;
		margin-left: 1px;
	}
	.body :global(sup.cite a),
	.body :global(a.xref) {
		color: var(--color-cobalt);
		text-decoration: none;
	}
	.body :global(sup.cite a:hover),
	.body :global(a.xref:hover) {
		color: var(--color-rose);
	}

	/* theorems: the label in the margin, the statement in italic, the Lean names quiet beneath */
	.body :global(.thm) {
		display: grid;
		grid-column: left-start / text-end;
		grid-template-columns: var(--left) minmax(0, var(--text));
		column-gap: var(--gap);
		margin: 10px 0 18px;
	}
	.body :global(.thm > *) {
		grid-column: 2;
	}
	.body :global(.thm-head) {
		grid-column: 1;
		grid-row: 1 / span 3;
		margin: 3px 0 0;
		text-align: right;
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		line-height: 1.4;
	}
	.body :global(.thm-label) {
		display: block;
		font-weight: 600;
		color: var(--color-rose);
	}
	.body :global(.thm-name) {
		display: block;
		color: var(--color-ink-soft);
	}
	.body :global(.thm p:not(.thm-head):not(.lean)) {
		font-style: italic;
		margin-bottom: 0.5em;
	}
	.body :global(.lean) {
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		line-height: 1.5;
		color: var(--color-ink-soft);
	}
	.body :global(.lean code) {
		font-size: 11.5px;
	}
	.body :global(.lean-k) {
		font-weight: 600;
		margin-right: 4px;
	}
	.body :global(.proof) {
		margin: 0 0 22px;
		font-size: 16px;
		line-height: 1.6;
		color: var(--color-ink-soft);
	}
	.body :global(.proof-head) {
		display: inline;
		font-style: italic;
		margin-right: 0.4em;
	}
	.body :global(.proof-head + p) {
		display: inline;
	}

	/* what is still waiting: a quiet note with its label in the margin */
	.body :global(.status) {
		display: grid;
		grid-column: left-start / text-end;
		grid-template-columns: var(--left) minmax(0, var(--text));
		column-gap: var(--gap);
		margin: 4px 0 22px;
	}
	.body :global(.status-k) {
		padding-top: 4px;
		text-align: right;
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--color-violet);
	}
	.body :global(.status p) {
		grid-column: 2;
		padding-left: 16px;
		background: linear-gradient(var(--color-violet), var(--color-violet)) left / 2px 100% no-repeat;
		font-size: 16.5px;
		color: var(--color-ink-soft);
	}

	/* figures: centred across both margins; captions centred under them at the text width */
	.body :global(figure.fig) {
		grid-column: left-start / right-end;
		margin: 24px 0 36px;
	}
	.body :global(figure.fig img) {
		max-width: 960px;
		margin-left: auto;
		margin-right: auto;
	}
	.body :global(figure.fig figcaption) {
		max-width: var(--text);
		margin-left: auto;
		margin-right: auto;
	}
	.body :global(figure.fig img) {
		display: block;
		width: 100%;
		height: auto;
	}
	.body :global(.fig-missing) {
		display: grid;
		place-items: center;
		height: 220px;
		background: var(--color-tint);
		font-family: var(--font-sans);
		font-size: var(--text-sm);
		color: var(--color-ink-soft);
	}
	.body :global(figcaption),
	.body :global(.tbl-cap) {
		max-width: var(--text);
		margin-top: 14px;
		font-family: var(--font-sans);
		font-size: 13.5px;
		line-height: 1.55;
		color: var(--color-ink-soft);
	}
	.body :global(figcaption strong),
	.body :global(.tbl-cap strong) {
		color: var(--color-ink);
	}
	.body :global(.fig-label) {
		font-weight: 600;
		color: var(--color-ink);
	}
	.body :global(figcaption .katex),
	.body :global(.tbl-cap .katex) {
		font-size: 1.02em;
	}

	/* tables: three rules, tabular figures */
	.body :global(.tbl) {
		grid-column: left-start / right-end;
		justify-self: center;
		max-width: 100%;
		margin: 18px 0 32px;
	}
	.body :global(.tbl-cap) {
		margin: 0 0 10px;
	}
	.body :global(.tbl-wrap) {
		overflow-x: auto;
	}
	.body :global(table) {
		width: 100%;
		border-collapse: collapse;
		font-family: var(--font-sans);
		font-size: 13px;
		line-height: 1.4;
		font-variant-numeric: tabular-nums;
		border-top: 1px solid var(--color-ink);
		border-bottom: 1px solid var(--color-ink);
	}
	.body :global(th) {
		padding: 8px 10px 6px 0;
		text-align: left;
		font-weight: 600;
		border-bottom: 1px solid var(--color-mist);
		vertical-align: bottom;
	}
	.body :global(td) {
		padding: 6px 10px 6px 0;
		vertical-align: top;
		border-bottom: 1px solid var(--color-tint);
	}
	.body :global(th.r),
	.body :global(td.r) {
		text-align: right;
	}
	.body :global(th.c),
	.body :global(td.c) {
		text-align: center;
	}
	.body :global(table code) {
		font-size: 12px;
	}

	/* references */
	.body :global(ol.refs) {
		grid-column: text;
		padding-left: 2.2em;
		font-family: var(--font-sans);
		font-size: 13px;
		line-height: 1.5;
		color: var(--color-ink-soft);
	}
	.body :global(ol.refs li) {
		margin-bottom: 0.5em;
		scroll-margin-top: 80px;
	}
	.body :global(ol.refs li:target) {
		color: var(--color-ink);
		background: var(--color-tint);
	}
	.body :global(.ref-link) {
		word-break: break-all;
		color: var(--color-blue-grey);
	}
	.body :global(h2[id]),
	.body :global(figure[id]),
	.body :global(.tbl[id]),
	.body :global(.thm[id]) {
		scroll-margin-top: 72px;
	}

	/* ---- narrow screens: one column, labels above what they label ------------------------------------------- */
	@media (max-width: 1080px) {
		.paper {
			--left: 0px;
			--right: 0px;
			--gap: 0px;
			max-width: 720px;
			padding: 40px 16px 96px;
		}
		.front {
			margin: 0 auto;
		}
		h1 {
			font-size: 32px;
		}
		.body {
			display: block;
			font-size: 17px;
		}
		.body :global(.abstract),
		.body :global(h2.sec),
		.body :global(.thm),
		.body :global(.status) {
			display: block;
		}
		.body :global(.abs-h),
		.body :global(.thm-head),
		.body :global(.status-k) {
			text-align: left;
			margin-bottom: 6px;
		}
		.body :global(.sec-n) {
			margin-right: 10px;
		}
		.body :global(.thm-label),
		.body :global(.thm-name) {
			display: inline;
		}
		.body :global(.thm-name) {
			margin-left: 4px;
		}
		.body :global(.status-k) {
			display: block;
		}
		.body :global(h2.sec) {
			font-size: 22px;
			margin-top: 44px;
		}
		.body :global(ol.refs) {
			padding-left: 1.8em;
		}
	}
</style>
