<script lang="ts">
	import type { AlgebraRun } from './pad.svelte.ts';
	import type { Rational } from './program/index.ts';

	/**
	 * A work order beside the sheet: the line the fixed runtime runs, what came back, and the evaluations it was read
	 * from (algebra by evaluation: both typed sides at a few points, then the coefficients). Every number in the table
	 * came off the sheet; the work order and the procedure around them are not certified.
	 */
	interface Props {
		/** the line as typed */
		order: string;
		result: AlgebraRun | null;
		running: boolean;
		/** the procedure under way (the title of the sheet it works on) */
		working: string | null;
	}

	let { order, result, running, working }: Props = $props();

	const show = (r: Rational) => {
		const s = r.d === 1n ? `${r.n < 0n ? -r.n : r.n}` : `${r.n < 0n ? -r.n : r.n}/${r.d}`;
		return (r.n < 0n ? '−' : '') + s;
	};
	const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
	const tidy = (line: string) => line.replace(/^= /, '').replace(/-/g, '−');

	const first = $derived(result?.results[0] ?? null);
	const answer = $derived(first ? tidy(first.line) : null);
	/** the first evaluation grid, as rows of a small table */
	const rows = $derived.by(() => {
		const g = first?.algebra?.grids[0];
		if (!g) return [];
		return g.rows
			.filter((r) => r.left !== undefined || r.value !== undefined)
			.slice(0, 9)
			.map((r) => ({
				label: r.label
					.replace(/^coefficient of /, '')
					.replace(/\^(\d+)/g, (_, d: string) => [...d].map((c) => SUP[Number(c)]).join(''))
					.replace(/-/g, '−'),
				kind: r.kind,
				left: r.left ? show(r.left) : r.value ? show(r.value) : '',
				right: r.right ? show(r.right) : ''
			}));
	});
	const checks = $derived.by(() => {
		const a = first?.algebra;
		if (!a) return '';
		const passed = a.checks.filter((c) => c.passed).length;
		const how = a.checkMode === 'strong' ? 'in the typed equation' : 'in the recovered equation';
		const guessed = a.guesses?.length ? ' Its guesses are not certified.' : '';
		return a.checks.length
			? `${passed} of ${a.checks.length} ${a.checks.length === 1 ? 'check' : 'checks'} passed ${how} (${a.checkMode ?? 'light'}).${guessed}`
			: guessed.trim();
	});
</script>

<figure class="sp-panel order">
	<figcaption class="sp-cap">
		<span class="sp-title">The work order</span>
		<span class="sp-sub">the runtime's plan; every digit in it is the model's</span>
	</figcaption>
	<div class="sp-body">
		<div class="stack">
			<code class="line">{order || '–'}</code>
			<p class="answer num" class:wait={!result}>
				{#if result && answer !== null}{answer}{:else if running}{working ??
						'working'}…{:else}&nbsp;{/if}
			</p>
			{#if rows.length}
				<table class="num">
					<thead>
						<tr><th></th><th>left</th><th>right</th></tr>
					</thead>
					<tbody>
						{#each rows as r, i (i)}
							<tr class:coef={r.kind === 'coefficient'} class:confirm={r.kind === 'confirmation'}>
								<td>{r.label}</td>
								<td>{r.left}</td>
								<td>{r.right}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>
	</div>
	<p class="sp-foot">
		{#if checks}{checks}{:else}<span class="sp-dim"
				>Both sides are evaluated at a few points, and the polynomial is read off the values.</span
			>{/if}
	</p>
</figure>

<style>
	.stack {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.line {
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		color: var(--color-ink);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.answer {
		margin-top: 6px;
		font-family: var(--font-mono);
		font-size: 18px;
		line-height: 24px;
		color: var(--color-rose);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		transition: color var(--hover) ease;
	}
	.answer.wait {
		font-family: var(--font-sans);
		font-size: var(--text-xs);
		color: var(--color-blue-grey);
	}
	/* booktabs: a rule above and below the head, one below the body, no verticals */
	table {
		margin-top: 12px;
		border-collapse: collapse;
		font-size: var(--text-2xs);
		font-family: var(--font-mono);
		color: var(--color-ink-soft);
	}
	th {
		padding: 3px 10px 3px 0;
		font-family: var(--font-sans);
		font-weight: 400;
		text-align: right;
		color: var(--color-blue-grey);
		border-top: 1px solid var(--color-ink);
		border-bottom: 1px solid var(--color-mist);
	}
	td {
		padding: 1px 10px 1px 0;
		text-align: right;
		white-space: nowrap;
	}
	th:first-child,
	td:first-child {
		text-align: left;
		padding-right: 14px;
	}
	tbody tr:last-child td {
		padding-bottom: 3px;
		border-bottom: 1px solid var(--color-ink);
	}
	tr.confirm td {
		color: var(--color-blue-grey);
	}
	tr.coef td {
		color: var(--color-rose);
	}
	tr.coef td:first-child {
		color: var(--color-ink-soft);
	}
</style>
