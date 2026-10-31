import { afterAll, describe, expect, it } from 'vitest';
import { renderToString } from 'katex';
import { run } from './run';
import { RefCalc, TraceCalc } from './calc';
import { CheckFailed, integer } from './arithmetic';
import { DerivationBuilder, literal, binary, num } from './derivation';
import { checkRadicalPair, radicalValue, rootExpressions, type RadicalPair } from './radicals';
import { validateDerivation } from './derivation-test-helper';
import { symbolicEqual } from './symbolic-test-helper';
import { writeReport } from './report-test-helper';
import { parse } from './parse';

const examples = ['solve x^2-2=0', 'solve 2x^2+3x-1=0', 'solve x^2-6x+4=0'];
const expected = [
	{ p: 0n, q: 1n, m: 2n, d: 1n },
	{ p: -3n, q: 1n, m: 17n, d: 4n },
	{ p: 3n, q: 1n, m: 5n, d: 1n }
];
const reports: Record<string, unknown> = {};
describe.each(['light', 'strong'] as const)('%s exact radicals', (mode) => {
	it('measures and validates the three required answers', async () => {
		const measurements = [];
		for (let i = 0; i < examples.length; i++) {
			const c = new RefCalc(),
				result = await run(examples[i], c, { checkMode: mode });
			expect(result.results[0].status, result.lines.join()).toBe('ok');
			expect(result.results[0].algebra?.radicals).toEqual(expected[i]);
			expect(result.results[0].algebra?.checks).toEqual([{ kind: 'vieta', mode, passed: true }]);
			expect(result.results[0].derivation.lines.at(-1)?.kind).toBe('approximation');
			expect(result.results[0].derivation.lines.some((l) => l.bounds)).toBe(false);
			await validateDerivation(result);
			for (const l of result.results[0].derivation.lines)
				expect(() =>
					renderToString(l.tex, {
						throwOnError: true,
						strict: 'ignore',
						trust: (ctx) => ctx.command === '\\htmlId'
					})
				).not.toThrow();
			const old = new RefCalc();
			await run(examples[i], old, { checkMode: mode, places: 6 });
			expect(c.total.seconds).toBeLessThan(old.total.seconds);
			expect(c.total.seconds).toBeCloseTo(c.total.rows * 0.037 + c.total.calls * 0.065, 10);
			measurements.push({
				source: examples[i],
				...c.total,
				under12: c.total.seconds < 12,
				brackets: old.total,
				answer: result.lines[0],
				lines: result.results[0].derivation.lines.map((l) => ({
					kind: l.kind,
					tex: l.tex.replace(/\\htmlId\{[^}]+\}\{([^}]*)\}/g, '$1'),
					note: l.note
				}))
			});
		}
		reports[mode] = { measurements };
	});
	it.each([
		'solve x^2+2x-2=0',
		'solve 2x^2-x-4=0',
		'solve -x^2+2=0',
		'solve x^2-72=0',
		'solve x^2-5618=0',
		'factor (x-1)(x^2-2)',
		'solve (x-1)(x^2-2)=0',
		'solve (1000000000x-123)^2=2'
	])('proves every line of %s', async (source) => {
		const r = await run(source, new RefCalc(), { checkMode: mode });
		expect(r.results[0].status, r.lines.join()).toBe('ok');
		await validateDerivation(r);
	});
	it('keeps the original six-place bracket path for an explicit request', async () => {
		const typed = await run('solve x^2-2=0 to 6 places', new RefCalc(), { checkMode: mode });
		const option = await run('solve x^2-2=0', new RefCalc(), { checkMode: mode, places: 6 });
		expect(typed.lines).toEqual(option.lines);
		expect(typed.results[0].algebra?.checks.every((c) => c.kind === 'bracket')).toBe(true);
		expect(typed.results[0].algebra?.checks).toHaveLength(2);
		await validateDerivation(typed);
		expect(() => parse('solve x^2=2 to 4 places')).toThrow('6 places');
	});
	it('checks 200 valid pairs and refuses 200 corrupted pairs', async () => {
		let state = 0x44a1;
		const rand = (lo: number, hi: number) => {
			state = (Math.imul(1664525, state) + 1013904223) >>> 0;
			return lo + Math.floor((state / 2 ** 32) * (hi - lo + 1));
		};
		const refusal = { seed: 0x44a1, attempts: 0, caught: 0, missed: 0, details: [] as unknown[] };
		const ms = [2n, 3n, 5n, 6n, 7n, 10n, 11n, 13n, 17n, 19n];
		for (let i = 0; i < 200; i++) {
			const p = BigInt(rand(-9, 9)),
				q = BigInt(rand(1, 9)),
				m = ms[rand(0, ms.length - 1)],
				d = BigInt(rand(1, 9));
			// Independent test oracle constructs a quadratic whose roots are (p±q√m)/d.
			const cs = [p * p - q * q * m, -2n * p * d, d * d].map(literal);
			const original: RadicalPair = { p: literal(p), q: literal(q), m: literal(m), d: literal(d) };
			const b = new DerivationBuilder(new TraceCalc(new RefCalc()), mode);
			expect((await checkRadicalPair(b, cs, original)).passed).toBe(true);
			for (const identity of b.derivation.lines[0].identities)
				expect(await symbolicEqual(identity, new Map())).toBe(true);
			const roots = rootExpressions(b, original);
			for (const root of roots) {
				const expression = binary(
					'+',
					binary(
						'+',
						binary('*', num(d * d), binary('^', root, num(2n))),
						binary('*', num(-2n * p * d), root)
					),
					num(p * p - q * q * m)
				);
				expect(await symbolicEqual({ left: expression, right: num(0n) }, new Map())).toBe(true);
			}
			const member = (['p', 'q', 'm', 'd'] as const)[i % 4],
				bad = { ...original, [member]: literal(original[member].value.n + 1n) };
			refusal.attempts++;
			try {
				await checkRadicalPair(new DerivationBuilder(new TraceCalc(new RefCalc()), mode), cs, bad);
				refusal.missed++;
				refusal.details.push({
					index: i,
					member,
					original: radicalValue(original),
					bad: radicalValue(bad)
				});
			} catch (e) {
				if (!(e instanceof CheckFailed)) throw e;
				refusal.caught++;
			}
		}
		expect(refusal).toMatchObject({ attempts: 200, caught: 200, missed: 0 });
		Object.assign(reports[mode]!, { refusal });
	});
});
it('keeps rational substitution checks and expected rounded displays', async () => {
	for (const mode of ['light', 'strong'] as const) {
		const r = await run('solve x^2-x-6=0', new RefCalc(), { checkMode: mode });
		expect(r.results[0].algebra?.roots).toMatchObject([integer(-2n), integer(3n)]);
		expect(
			r.results[0].algebra?.checks.every(
				(c) => c.kind === (mode === 'light' ? 'horner' : 'substitution')
			)
		).toBe(true);
	}
	const answers = [];
	for (const source of examples) answers.push((await run(source, new RefCalc())).lines[0]);
	expect(answers).toEqual([
		'= x = ± √2 ≈ ± 1.4142',
		'= x = (−3 ± √17)/4 ≈ −1.7808, 0.2808',
		'= x = 3 ± √5 ≈ 0.7639, 5.2361'
	]);
});
afterAll(async () => {
	if (process.env.RADICAL_REPORT) await writeReport('./round5-radicals.json', reports);
});
