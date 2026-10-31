import { expect, it, describe } from 'vitest';
import { writeReport } from './report-test-helper';
import { renderToString } from 'katex';
import { run } from './run';
import { RefCalc, LyingCalc } from './calc';
import { validateDerivation } from './derivation-test-helper';
const examples = [
	'solve 3(x-2)+5=2x+14',
	'solve x^2-x-6=0',
	'expand (x+2)^5',
	'solve 2x+3y=7,x-y=1',
	'factor x^3-6x^2+11x-6'
];
describe.each(['light', 'strong'] as const)('%s textbook derivations', (checkMode) => {
	it.each([
		...examples,
		'expand (x+1)^12*(x-1)',
		'expand (x^2+x+1)^3',
		'solve 2x^2=0',
		'solve -2x^2+3x=0',
		'solve x^2=2',
		'solve -x^2+2=0',
		'solve x*(x-1)/2=3',
		'solve 0.5x+1=2',
		'solve x=x',
		'solve x=x+1',
		'solve y=2,x=1,z=3',
		'factor (2x-1)(x+3)^2',
		'factor x^2+1',
		'factor x^2-2',
		'factor (x-1)(x^2-2)',
		'solve x^12*(x-1)=0',
		'a=12\na/5',
		'a=12*13\nsolve a*x=312',
		'expand (-3x-2)^0*(-2x+4)^0',
		'1/3 to 6 places'
	])('%s', async (source) => {
		const r = await run(source, new RefCalc(), { checkMode });
		expect(
			r.results.every((v) => v.status === 'ok'),
			r.lines.join('\n')
		).toBe(true);
		await validateDerivation(r);
		for (const result of r.results)
			for (const line of result.derivation.lines)
				expect(() =>
					renderToString(line.tex, {
						throwOnError: true,
						strict: 'ignore',
						trust: (c) => c.command === '\\htmlId'
					})
				).not.toThrow();
	});
	it('keeps stable ids, indexes the complete trace and withholds unchecked steps on failure', async () => {
		const source = '12*13\nsolve x^2-x-6=0';
		const one = await run(source, new RefCalc(), { checkMode }),
			two = await run(source, new RefCalc(), { checkMode });
		expect(one.results.map((r) => r.derivation)).toEqual(two.results.map((r) => r.derivation));
		await validateDerivation(one);
		const bad = await run('solve 2x+1=5', new LyingCalc(new RefCalc(), 0), { checkMode });
		expect(bad.results[0].status).toBe('refused');
		expect(bad.results[0].derivation.lines.every((l) => l.kind === 'given')).toBe(true);
	});
	it('exports the exact demo lines for review', async () => {
		const derivations = [];
		for (const source of examples) {
			const result = await run(source, new RefCalc(), { checkMode });
			expect(result.results[0].status).toBe('ok');
			derivations.push({
				source,
				lines: result.results[0].derivation.lines.map((l) => ({
					kind: l.kind,
					tex: l.tex.replace(/\\htmlId\{[^}]+\}\{([^}]*)\}/g, '$1'),
					note: l.note?.replace(/\\htmlId\{[^}]+\}\{([^}]*)\}/g, '$1')
				}))
			});
		}
		if (process.env.PROGRAM_REPORT)
			await writeReport(`./derivations-${checkMode}.json`, derivations);
	});
});
