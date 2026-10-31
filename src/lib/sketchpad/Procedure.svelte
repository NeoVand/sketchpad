<script lang="ts">
	import { AddSheet, addDecode } from './adder.ts';
	import { Grid, type Phase, type View } from './calc-sheet.ts';
	import { parseTask } from './calc-task.ts';
	import { MulWave } from './multiplier.ts';
	import type { Sheet, TickView } from './pad.svelte.ts';
	import type { TickOp } from './protocol.ts';

	/**
	 * Calculate's third panel: the procedure on the sheet now, step by step, with the step the model is on marked. Each
	 * step names the words the model reads for it (its prompts), so it ties to the One view panel.
	 */
	interface Props {
		sheet: Sheet | null;
		/** bumps whenever the sheet changes (a grid's phase is not reactive) */
		version: number;
		last: TickView | null;
		/** the first view of a line laid out but not run */
		preview: View | null;
		/** the line typed, for the procedure before its sheet exists, and for gcd and signs */
		line: string;
	}

	let { sheet, version, last, preview, line }: Props = $props();

	type Proc = 'add' | 'sub' | 'mul' | 'div' | 'root' | 'times';
	interface Step {
		text: string;
		/** the words the model reads for this step */
		ops: string;
		/** the step is under way: by the grid's phase, or by the last view's op and answer */
		on: (p: Phase | null, op: TickOp | null, out: string[] | null) => boolean;
	}

	const PROCS: Record<Proc, { name: string; steps: Step[]; note: string }> = {
		add: {
			name: 'column addition',
			steps: [
				{
					text: 'Add a column, its two digits and the carry; write the digit, carry the ten',
					ops: 'SUM',
					on: (p, op, out) => op === 'ADD-FAST' && !!out && addDecode(out[0]) !== 'H'
				},
				{
					text: 'Past both numbers with no carry left: halt',
					ops: 'SUM',
					on: (p, op, out) => op === 'ADD-FAST' && !!out && addDecode(out[0]) === 'H'
				}
			],
			note: 'One view per column, right to left.'
		},
		sub: {
			name: 'column subtraction',
			steps: [
				{
					text: 'Subtract a column and the borrow; borrow a ten when the top digit is smaller',
					ops: 'SUB',
					on: (p, op, out) => p === 'sub' && (!out || out[2] === 'S')
				},
				{
					text: 'Past both numbers: halt, or borrow out, when the top number was the smaller one',
					ops: 'SUB',
					on: (p, op, out) => p === 'sub' && !!out && out[2] !== 'S'
				}
			],
			note: 'A borrow out runs the subtraction the other way round, and the answer is negative.'
		},
		mul: {
			name: 'long multiplication',
			steps: [
				{
					text: 'Multiply a digit of the top number by one of the bottom number, plus the carry',
					ops: 'MUL',
					on: (p, op) => op === 'MUL'
				},
				{
					text: 'Add the product digit into the total',
					ops: 'ADD',
					on: (p, op) => op === 'ADD'
				},
				{
					text: 'Past the top number: add the last product digit, then the last carry',
					ops: 'ADZ · FLS',
					on: (p, op) => op === 'ADZ' || op === 'FLS'
				},
				{
					text: 'Move to the next digit of the bottom number, or halt',
					ops: 'NXT',
					on: (p, op) => op === 'NXT'
				}
			],
			note: 'One pass per digit of the bottom number; the passes overlap two columns apart.'
		},
		div: {
			name: 'long division (Knuth’s Algorithm D)',
			steps: [
				{
					text: 'Scale both numbers so the divisor starts with 5 or more',
					ops: 'MUL',
					on: (p) => p === 'scale'
				},
				{
					text: 'Bring the next digit down; guess the quotient digit',
					ops: 'EST',
					on: (p) => p === 'guess'
				},
				{
					text: 'Multiply the divisor by the guess and subtract it',
					ops: 'MUL · SUB',
					on: (p) => p === 'mulsub'
				},
				{
					text: 'If that borrowed, the guess was high: lower it',
					ops: 'DEC',
					on: (p) => p === 'lower'
				},
				{
					text: 'and add the divisor back',
					ops: 'SUM',
					on: (p) => p === 'addback'
				}
			],
			note: 'A guess is never too low, and at most two too high.'
		},
		root: {
			name: 'square root, digit by digit',
			steps: [
				{
					text: 'Scale the number so its root starts with 25 to 49',
					ops: 'MUL',
					on: (p) => p === 'scale'
				},
				{
					text: 'Bring the next pair down; guess the next digit (the first two are fixed by the scale)',
					ops: 'EST',
					on: (p) => p === 'guess'
				},
				{
					text: 'Multiply the trial divisor by the digit and subtract it',
					ops: 'MUL · SUB',
					on: (p) => p === 'mulsub'
				},
				{
					text: 'If that borrowed, lower the digit and try again',
					ops: 'DEC',
					on: (p) => p === 'lower'
				},
				{
					text: 'Extend the trial divisor: twice the root so far',
					ops: 'ADD',
					on: (p) => p === 'extend'
				}
			],
			note: 'The root of the scaled number is the root times the scale; a last multiplication undoes it.'
		},
		times: {
			name: 'multiplication by one digit',
			steps: [
				{
					text: 'Multiply each digit by the one digit, plus the carry',
					ops: 'MUL',
					on: (p) => p === 'times'
				}
			],
			note: ''
		}
	};

	const task = $derived.by(() => {
		const t = parseTask(line);
		return typeof t === 'string' ? null : t;
	});

	/** the procedure on view: the sheet's, or before any sheet, the one the line will start with */
	const proc = $derived.by((): Proc | null => {
		const s = sheet;
		if (s instanceof AddSheet) return 'add';
		if (s instanceof MulWave) return 'mul';
		if (s instanceof Grid)
			return s.title === 'a − b'
				? 'sub'
				: s.title === 'a ÷ b'
					? 'div'
					: s.title === '√a'
						? 'root'
						: 'times';
		const t = task;
		if (!t) return null;
		if (t.op === '+' || t.op === '−') {
			const b = t.op === '+' ? t.b : -t.b;
			return t.a < 0n === b < 0n ? 'add' : 'sub';
		}
		return t.op === '×' ? 'mul' : t.op === '√' ? 'root' : 'div';
	});

	/** the step under way: the last view answered, or before a run the first view laid out */
	const active = $derived.by(() => {
		void version;
		const p = proc ? PROCS[proc] : null;
		if (!p) return -1;
		// a finished calculator sheet has no step under way
		if (sheet instanceof Grid && sheet.done) return -1;
		const phase = sheet instanceof Grid ? sheet.phase : null;
		const op = last?.op ?? preview?.op ?? null;
		const out = last?.out ?? null;
		if (!op && !phase) return -1;
		return p.steps.findIndex((s) => s.on(phase, op, out));
	});

	/** what the line asks for around the procedure: gcd's loop, a sum of opposite signs */
	const outer = $derived.by(() => {
		const t = task;
		if (!t) return '';
		if (t.op === 'gcd')
			return 'Euclid: divide, then divide the divisor by the remainder, until the remainder is 0.';
		if ((t.op === '+' || t.op === '−') && proc === 'sub')
			return 'Signs are layout: a sum of opposite signs is a difference.';
		if (t.op === '×' && t.a < 0n !== t.b < 0n) return 'Signs are layout: the product is negative.';
		return '';
	});
	const title = $derived(
		proc === 'times' && sheet instanceof Grid
			? `multiplication by one digit: ${sheet.title.includes('× 10 /') ? `undoing the scale, ${sheet.title}` : sheet.title}`
			: proc
				? PROCS[proc].name
				: 'type a line to see its procedure'
	);
</script>

<figure class="sp-panel procedure">
	<figcaption class="sp-cap">
		<span class="sp-title">The procedure</span>
		<span class="sp-sub">{title}</span>
	</figcaption>
	<div class="sp-body">
		{#if proc}
			<ol class="steps">
				{#each PROCS[proc].steps as s, i (s.text)}
					<li class:on={i === active}>
						<span class="mark num" aria-hidden="true">{i === active ? '' : i + 1}</span>
						<span class="text">{s.text}</span>
						<code class="ops">{s.ops}</code>
					</li>
				{/each}
			</ol>
		{/if}
	</div>
	<p class="sp-foot">
		{outer || (proc ? PROCS[proc].note : '')}
		<span class="sp-dim key">Right: the word the model reads before the view at each step.</span>
	</p>
</figure>

<style>
	.steps {
		display: grid;
		align-content: start;
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	li {
		display: grid;
		grid-template-columns: 14px minmax(0, 1fr) auto;
		column-gap: 10px;
		align-items: baseline;
		font-size: var(--text-sm);
		line-height: 1.35;
		color: var(--color-ink-soft);
		transition: color var(--hover) ease;
	}
	li.on {
		color: var(--color-ink);
	}
	.mark {
		position: relative;
		font-size: var(--text-2xs);
	}
	/* the step under way: an ink dot where its number was */
	li.on .mark::before {
		content: '';
		position: absolute;
		left: 1px;
		top: -7px;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--color-ink);
	}
	.ops {
		font-family: var(--font-mono);
		font-size: var(--text-2xs);
		color: var(--color-ink-soft);
		white-space: nowrap;
	}
	li.on .ops {
		color: var(--color-ink);
	}
	.key {
		display: block;
		font-size: var(--text-2xs);
	}
</style>
