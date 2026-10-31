import { describe, expect, it } from 'vitest';
import { Arithmetic, type Rational } from './arithmetic';
import { RefCalc } from './calc';
import { validateDerivation } from './derivation-test-helper';
import { run, type RunOptions } from './run';
import type { Equation } from './parse';
import { splitEquals } from '../derivation-view';

/**
 * An expression with more than one operation is written the way a textbook writes it: one `= …` line per level of
 * its evaluation (`47·1186 − 39862`, `= 55742 − 39862`, `= 15880`), every computed number from the model's calls.
 * Each line is checked here with RefCalc: it equals the line above, and so the given expression.
 */
const plain = (tex: string) => tex.replace(/\\htmlId\{[^}]+\}\{([^}]*)\}/g, '$1');

async function lines(source: string, options: RunOptions = {}) {
	const r = await run(source, new RefCalc(), options);
	expect(
		r.results.every((s) => s.status === 'ok'),
		r.lines.join('\n')
	).toBe(true);
	await validateDerivation(r);
	return r;
}

/** the chain's checks: each `=` line continues the one above, is true by RefCalc, and shows only model numbers */
async function checkChain(source: string, options: RunOptions = {}) {
	const r = await lines(source, options);
	const a = new Arithmetic(new RefCalc());
	const last = r.results.at(-1)!;
	const env = new Map<string, Rational>();
	for (const s of r.results.slice(0, -1))
		if (s.statement.kind === 'assign' && s.value) env.set(s.statement.name, s.value);
	const statement = last.statement;
	if (statement.kind !== 'expression' && statement.kind !== 'assign') return r;
	const value = await a.evaluate(statement.value, env, { exact: true });
	const literals = new Set(source.match(/\d+(?:\.\d+)?/g) ?? []);
	let above = plain(last.derivation.lines[0].tex);
	for (const line of last.derivation.lines.slice(1)) {
		if (line.kind !== 'evaluate' && line.kind !== 'result') continue;
		const parts = splitEquals(line.tex);
		if (!parts) continue; // a ≈ result: checked by its approximation
		const [lhs, rhs] = parts;
		// it continues the line above (the page shows it as `= …`)
		expect(plain(lhs), `${source}: ${line.tex}`).toBe(above);
		above = plain(rhs);
		// it is true: its right side is the given expression's exact value
		const identity: Equation = line.identities[0];
		expect(
			await a.equal(await a.evaluate(identity.right, env, { exact: true }), value),
			`${source}: ${line.tex}`
		).toBe(true);
		// every number on it is the model's (an id ties it to a call) or one the visitor typed
		const unsourced = rhs.replace(/\\htmlId\{[^}]+\}\{[^}]*\}/g, '').match(/\d+(?:\.\d+)?/g) ?? [];
		for (const n of unsourced) expect(literals.has(n), `${source}: ${n} in ${line.tex}`).toBe(true);
	}
	return r;
}

const levels = (r: Awaited<ReturnType<typeof run>>) =>
	r.results.at(-1)!.derivation.lines.map((l) => [l.kind, plain(splitEquals(l.tex)?.[1] ?? l.tex)]);

describe.each(['light', 'strong'] as const)('expressions by level (%s checks)', (checkMode) => {
	it('writes the textbook line between the given expression and its value', async () => {
		const r = await checkChain('47*1186-39862', { checkMode, defaultPlaces: 4 });
		expect(levels(r)).toEqual([
			['given', '47\\cdot 1186 - 39862'],
			['evaluate', '55742 - 39862'],
			['result', '15880']
		]);
	});

	it('writes one line per level, deeper trees too', async () => {
		expect(levels(await checkChain('(12+3)*(7-2)-4*5', { checkMode }))).toEqual([
			['given', '\\left(12 + 3\\right)\\left(7 - 2\\right) - 4\\cdot 5'],
			['evaluate', '15\\cdot 5 - 20'],
			['evaluate', '75 - 20'],
			['result', '55']
		]);
		expect(levels(await checkChain('gcd(12,18)*3+√(16)', { checkMode }))).toEqual([
			['given', '\\gcd\\left(12,18\\right)\\cdot 3 + \\sqrt{16}'],
			['evaluate', '6\\cdot 3 + 4'],
			['evaluate', '18 + 4'],
			['result', '22']
		]);
	});

	it('keeps what the visitor typed until its operation is done, and names as names', async () => {
		expect(levels(await checkChain('2^3*5+1', { checkMode }))).toEqual([
			['given', '2^{3}\\cdot 5 + 1'],
			['evaluate', '8\\cdot 5 + 1'],
			['evaluate', '40 + 1'],
			['result', '41']
		]);
		expect(levels(await checkChain('a=5\n2*a+3', { checkMode })).slice(1)).toEqual([
			['evaluate', '10 + 3'],
			['result', '13']
		]);
		expect(levels(await checkChain('348*86.75+12.5', { checkMode, defaultPlaces: 4 }))[1]).toEqual([
			'evaluate',
			'30189 + 12.5'
		]);
	});

	it('writes no middle line for one operation', async () => {
		const r = await checkChain('12*13', { checkMode });
		expect(levels(r).map(([kind]) => kind)).toEqual(['given', 'result']);
	});

	it('ends the chain at a cut value, so every = line is exact', async () => {
		// 1/3 is cut at 12 places in Algebra: no middle line, the result says ≈
		const third = await checkChain('1/3+1/6*2', { checkMode });
		expect(third.results[0].derivation.lines.map((l) => l.kind)).toEqual(['given', 'result']);
		// the chat's sheet keeps ÷ exact: the fractions are worked level by level
		expect(levels(await checkChain('1/3+1/6*2', { checkMode, defaultPlaces: 4 }))).toEqual([
			['given', '\\frac{1}{3} + \\frac{1}{6}\\cdot 2'],
			['evaluate', '\\frac{1}{3} + \\frac{1}{3}'],
			['result', '\\frac{2}{3}']
		]);
		// an exact middle line, then a cut ÷: the last line is ≈
		const cut = await checkChain('47*1186/7', { checkMode });
		expect(cut.results[0].derivation.lines.map((l) => l.kind)).toEqual([
			'given',
			'evaluate',
			'result'
		]);
		expect(cut.results[0].derivation.lines[2].tex).toContain('\\approx');
	});

	it('200 random expressions: every middle line continues the one above and is true', async () => {
		// mulberry32: a small seeded generator
		let seed = checkMode === 'light' ? 0x51 : 0x52;
		const rand = (lo: number, hi: number) => {
			seed = (seed + 0x6d2b79f5) | 0;
			let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return lo + (((t ^ (t >>> 14)) >>> 0) % (hi - lo + 1));
		};
		const expression = (depth: number): string => {
			if (depth === 0 || rand(0, 3) === 0) return String(rand(1, 99));
			const op = ['+', '-', '*', '/'][rand(0, 3)];
			return `(${expression(depth - 1)}${op}${expression(depth - 1)})`;
		};
		let middle = 0;
		for (let i = 0; i < 200; i++) {
			const r = await checkChain(expression(3), {
				checkMode,
				defaultPlaces: i % 2 ? 4 : undefined
			});
			middle += r.results[0].derivation.lines.filter((l) => l.kind === 'evaluate').length;
		}
		// most of them have middle lines
		expect(middle).toBeGreaterThan(200);
	});
});
