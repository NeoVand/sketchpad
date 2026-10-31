import { renderToString } from 'katex';
import { describe, expect, it } from 'vitest';
import { callKey, fill, layout, reveal, type Live } from './derivation-view';
import { RefCalc, run } from './program/index';

/** replay a planned run's calls in order, as the model would make them, and look at the reveal after each */
async function replay(source: string) {
	const plan = await run(source, new RefCalc(), { checkMode: 'light' });
	const lines = layout(plan.results);
	const live: Live = { started: new Map(), done: new Map() };
	const steps = [];
	for (const [i, c] of plan.trace.entries()) {
		const key = callKey(c.op, c.operands);
		live.started.set(key, (live.started.get(key) ?? 0) + 1);
		live.done.set(key, [...(live.done.get(key) ?? []), c.result]);
		steps.push({ i, state: reveal(lines, plan.trace, live) });
	}
	return { lines, steps };
}

describe('the live reveal', () => {
	it.each(['factor x^3-6x^2+11x-6', 'solve x^2-x-6=0', 'expand (x+2)^5'])(
		'%s: a number shows only once its own call has returned',
		async (source) => {
			const { lines, steps } = await replay(source);
			const callOf = new Map(lines.flatMap((l) => l.numbers.map((n) => [n.id, n.call])));
			for (const { i, state } of steps) {
				expect(state.diverged).toBe(false);
				for (const id of state.shown) expect(callOf.get(id)).toBeLessThanOrEqual(i);
			}
			const last = steps.at(-1)!.state;
			expect(last.visible.every(Boolean)).toBe(true);
			expect(last.complete.every(Boolean)).toBe(true);
		}
	);

	it('stops revealing when a call returns a different value', async () => {
		const plan = await run('solve x^2-x-6=0', new RefCalc(), { checkMode: 'light' });
		const lines = layout(plan.results);
		// the first number on show, and its call answering one more
		const n = lines.flatMap((l) => l.numbers)[0];
		const c = plan.trace[n.call];
		const wrong =
			typeof c.result === 'bigint' ? c.result + 1n : { ...c.result, [n.field]: n.value + 1n };
		const live: Live = {
			started: new Map([[callKey(c.op, c.operands), 1]]),
			done: new Map([[callKey(c.op, c.operands), [wrong]]])
		};
		const state = reveal(lines, plan.trace, live);
		expect(state.diverged).toBe(true);
		expect(state.visible.filter((v, i) => v && lines[i].kind !== 'given')).toEqual([]);
	});
});

describe('the page before the model', () => {
	it('shows no computed number until the model has returned it', async () => {
		const plan = await run('factor x^3-6x^2+11x-6', new RefCalc(), { checkMode: 'light' });
		const lines = layout(plan.results);
		const ids = /\\htmlId\{([^}]*)\}\{([^}]*)\}/g;
		for (const l of lines) {
			const cells = 'whole' in l.cells ? [l.cells.whole] : [l.cells.lhs, l.cells.rhs];
			for (const tex of [...cells, l.note ?? ''].map((c) => fill(c, new Set()))) {
				// every computed number is an empty slot: typeset, it has no text at all
				for (const [, , body] of tex.matchAll(ids))
					expect(
						renderToString(body, { strict: 'ignore', output: 'html' }).replace(/<[^>]*>/g, '')
					).toBe('');
			}
		}
		// and once shown, the number is there
		const n = lines.flatMap((l) => l.numbers)[0];
		const line = lines.find((l) => l.numbers.includes(n))!;
		const tex = 'whole' in line.cells ? line.cells.whole : `${line.cells.lhs}=${line.cells.rhs}`;
		expect(fill(tex, new Set([n.id]))).toContain(`\\htmlId{${n.id}}{`);
	});
});
