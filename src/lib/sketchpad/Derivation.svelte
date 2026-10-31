<script lang="ts">
	import type { Snippet } from 'svelte';
	import { layout, reveal, setNote, typeset, type Live, type ViewLine } from './derivation-view.ts';
	import type { AlgebraPlan, AlgebraRun } from './pad.svelte.ts';

	/**
	 * The Algebra tab's sheet: the work order as worked algebra, one step a line, equals signs in one column and the
	 * reason for each step in a quiet margin. While the model works, lines appear as their arithmetic starts and each
	 * number it computes appears in rose when its call returns (derivation-view.ts); numbers typed in the problem stay
	 * ink. When the run ends the page shows the model's own derivation.
	 */
	interface Props {
		plan: AlgebraPlan | null;
		/** the finished run (the model's own derivation), when it is the plan's */
		final: AlgebraRun | null;
		live: Live;
		liveVersion: number;
		running: boolean;
		/** told where the line the arithmetic under way feeds sits, from the top of this panel's body (null: none) */
		onactive?: (top: number | null) => void;
		/** the panel's foot: the verdict and the facts behind it (the page's status lines) */
		foot?: Snippet;
	}

	let { plan, final, live, liveVersion, running, onactive, foot }: Props = $props();

	const done = $derived(!!final && !running && !!plan && final.text === plan.text);
	const results = $derived(done ? final!.results : (plan?.results ?? []));
	const staged = $derived(!done && (!plan || plan.staged));
	/** before a run, only the problem as given */
	const lines = $derived(layout(results).filter((l) => !staged || l.kind === 'given'));
	const state = $derived.by(() => {
		void liveVersion;
		if (done || !plan || staged) return null;
		return reveal(lines, plan.trace, live);
	});
	const visible = (i: number) =>
		done ? true : staged ? lines[i].kind === 'given' : (state?.visible[i] ?? false);
	const refused = $derived(done ? final!.results.filter((r) => r.status !== 'ok') : []);

	/** a cell of TeX, typeset when it is drawn (and again only if its TeX changes) */
	const math = (s: string) => (el: HTMLElement) => typeset(el, s ? `\\displaystyle ${s}` : '');
	const note = (s: string) => (el: HTMLElement) => setNote(el, s);

	/** the numbers' tones: computed (rose), under way, or still to come */
	function tone(box: HTMLElement) {
		void liveVersion;
		void lines;
		const s = state;
		const all = done;
		queueMicrotask(() => {
			for (const l of lines)
				for (const n of l.numbers) {
					const el = box.querySelector<HTMLElement>(`[id="${n.id}"]`);
					if (!el) continue;
					const shown = all || !!s?.shown.has(n.id);
					el.classList.toggle('done', shown);
					el.classList.toggle('working', !shown && !!s?.working.has(n.id));
					el.classList.toggle('pending', !shown && !s?.working.has(n.id));
				}
			const active = s && running ? s.active : -1;
			// a line is display: contents; its gutter cell has a box (offsetTop from this panel's body)
			const row =
				active >= 0 ? box.querySelector<HTMLElement>(`[data-line="${active}"] > .mark`) : null;
			onactive?.(row ? row.offsetTop : null);
		});
	}
	/** a runtime message as a sentence: its first letter raised, no full stop of its own */
	const sentence = (m: string) => (m.charAt(0).toUpperCase() + m.slice(1)).replace(/\.$/, '');
	const isActive = (i: number) => !!state && running && state.active === i;
	const label = (l: ViewLine) => l.kind;
</script>

<figure class="sp-panel derivation">
	<figcaption class="sp-cap">
		<span class="sp-title">The sheet</span>
		<span class="sp-sub"
			>the work as algebra; every number in rose is the model’s, worked on its own sheet</span
		>
	</figcaption>
	<div class="sp-body deriv-body">
		<div class="deriv" {@attach tone}>
			{#each lines as l, i (l.key + (done ? ':final' : ''))}
				<div
					class="line {label(l)}"
					class:hidden={!visible(i)}
					class:incomplete={!done && !staged && !state?.complete[i]}
					class:active={isActive(i)}
					data-line={i}
				>
					<span class="mark" aria-hidden="true"></span>
					{#if 'whole' in l.cells}
						<span class="whole" {@attach math(l.cells.whole)}></span>
					{:else}
						<span class="lhs" {@attach math(l.cells.lhs)}></span>
						<span class="eq" {@attach math(l.cells.eq ? '=' : '')}></span>
						<span class="rhs" {@attach math(l.cells.rhs)}></span>
					{/if}
					<span class="note" {@attach note(l.note ?? '')}></span>
				</div>
			{/each}
		</div>
		{#each refused as r (r.statement)}
			<!-- a refusal: what failed, in plain words and in ink, and the failed substitution when there is one -->
			<div class="refusal">
				<p>
					{#if r.status === 'refused'}
						<strong>Check failed.</strong>
						{sentence(r.error ?? 'a check did not hold')}. The answer is withheld.
					{:else}
						<strong>No answer.</strong> {sentence(r.error ?? 'the work order stopped')}.
					{/if}
				</p>
				{#if r.failedCheck}<p class="failed" {@attach math(r.failedCheck)}></p>{/if}
			</div>
		{/each}
		{#if state?.diverged && running}
			<p class="wait">
				A number came back different from the page’s own arithmetic; the model’s own working shows
				when the run ends.
			</p>
		{:else if !lines.length}
			<p class="wait">Type a problem: an expression, solve …, expand … or factor ….</p>
		{/if}
	</div>
	{@render foot?.()}
</figure>

<style>
	.deriv-body {
		align-content: start;
		overflow: visible;
	}
	/*
	 * One step a line: a mark for the line the arithmetic under way feeds, the left side, the shared equals sign, the
	 * right side, and the reason in a quiet margin. A long line scrolls inside its own cell.
	 */
	.deriv {
		display: grid;
		grid-template-columns: 14px max-content auto fit-content(62%) minmax(10rem, 1fr);
		column-gap: 0;
		row-gap: 7px;
		align-items: baseline;
		font-size: 17px;
		color: var(--color-ink);
	}
	.line {
		display: contents;
	}
	.line > * {
		padding: 0.1em 0;
		transition: opacity var(--hover) ease;
	}
	.line.hidden > * {
		opacity: 0;
		visibility: hidden;
		transition:
			opacity var(--hover) ease,
			visibility 0s linear var(--hover);
	}
	.lhs {
		grid-column: 2;
		text-align: right;
	}
	.eq {
		grid-column: 3;
		padding-inline: 0.45em;
		text-align: center;
	}
	.rhs {
		grid-column: 4;
		min-width: 0;
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: none;
	}
	.whole {
		grid-column: 2 / 5;
		min-width: 0;
		overflow-x: auto;
		overflow-y: hidden;
		scrollbar-width: none;
	}
	.note {
		grid-column: 5;
		padding-left: 36px;
		font-size: var(--text-xs);
		line-height: 1.4;
		color: var(--color-ink-soft);
	}
	.note :global(.katex) {
		font-size: 1em;
		color: var(--color-ink-soft);
	}
	/* the line the arithmetic under way feeds: an ink dot in the gutter */
	.mark {
		grid-column: 1;
		position: relative;
	}
	.line.active .mark::before {
		content: '';
		position: absolute;
		left: 0;
		top: 50%;
		width: 6px;
		height: 6px;
		margin-top: -3px;
		border-radius: 50%;
		background: var(--color-ink);
	}
	/* a check is ticked once its numbers are in */
	.line.incomplete :global(.amsrm) {
		opacity: 0;
	}
	.line :global(.amsrm) {
		transition: opacity var(--hover) ease;
	}
	/* the answer: a little apart, a size up */
	.line.result > * {
		padding-top: 0.55em;
	}
	.line.result .lhs,
	.line.result .rhs,
	.line.result .whole,
	.line.result .eq {
		font-size: 1.12em;
	}
	/* a refusal says so in ink, with the check that failed */
	.refusal {
		display: grid;
		gap: 8px;
		margin-top: 18px;
		padding-left: 14px;
		font-size: var(--text-ui);
		color: var(--color-ink);
	}
	.refusal strong {
		font-weight: 600;
	}
	.refusal .failed {
		font-size: 17px;
	}
	/* a computed number: rose once the model's call returns; a quiet slot until then */
	.deriv :global(.enclosing) {
		transition:
			color var(--hover) ease,
			box-shadow var(--hover) ease;
	}
	.deriv :global(.enclosing.done) {
		color: var(--color-rose);
	}
	.deriv :global(.enclosing.pending) {
		color: transparent;
		box-shadow: inset 0 -1px 0 var(--color-mist);
	}
	.deriv :global(.enclosing.working) {
		color: transparent;
		box-shadow: inset 0 -2px 0 var(--color-rose-light);
	}
	.note :global(.enclosing.done) {
		color: var(--color-rose);
	}
	.wait {
		margin-top: 14px;
		font-size: var(--text-sm);
		color: var(--color-ink-soft);
	}

	/* a phone: one line after another, each scrolling inside its own row; the reason under its line */
	@media (max-width: 719px) {
		.deriv {
			display: block;
			font-size: 16px;
		}
		/* a line wider than the phone scrolls in its row; its right edge fades to say so */
		.line {
			display: block;
			overflow-x: auto;
			overflow-y: hidden;
			scrollbar-width: none;
			white-space: nowrap;
			mask-image: linear-gradient(to right, #000 calc(100% - 20px), transparent);
		}
		.line > * {
			display: inline;
			min-height: 0;
			padding: 0;
		}
		.line.hidden {
			display: none;
		}
		.line .note {
			display: block;
			padding: 0 0 6px;
			white-space: normal;
		}
		.line .whole {
			display: block;
			padding: 4px 0;
		}
		.lhs,
		.rhs {
			padding-block: 4px;
		}
		.mark {
			display: none;
		}
	}
</style>
