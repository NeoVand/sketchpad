import { afterAll, describe, expect, it } from 'vitest';
import { RefCalc, type SheetCost } from './calc';
import { run } from './run';
import { validateDerivation } from './derivation-test-helper';
import { writeReport } from './report-test-helper';

const examples = ['solve x^2-2=0', 'solve 2x^2+3x-1=0', 'solve x^2-6x+4=0'];
const reports: Record<string, unknown> = {};
class MeasuredCalc extends RefCalc {
	beforeApproximation?: SheetCost;
	prefixCalls?: number;
	override async isqrt(n: bigint) {
		if (n >= 10000000000n && !this.beforeApproximation) {
			this.beforeApproximation = { ...this.total };
			this.prefixCalls = this.calls.length;
		}
		return super.isqrt(n);
	}
}
describe.each(['light', 'strong'] as const)('%s exact answer first', (checkMode) => {
	it.each([...examples, 'factor (x-1)(x^2-2)', 'solve (x-1)(x^2-2)=0'])(
		'finishes every result before approximation arithmetic for %s',
		async (source) => {
			const calc = new MeasuredCalc(),
				full = await run(source, calc, { checkMode });
			const exactCalc = new RefCalc(),
				exact = await run(source, exactCalc, { checkMode, approximate: false });
			expect(full.results[0].status, full.lines.join()).toBe('ok');
			expect(exact.results[0].status, exact.lines.join()).toBe('ok');
			const lines = full.results[0].derivation.lines;
			const approximation = lines.find((l) => l.kind === 'approximation')!;
			const results = lines.filter((l) => l.kind === 'result');
			expect(results.length).toBeGreaterThan(0);
			expect(lines.at(-1)).toBe(approximation);
			for (const result of results) {
				expect(lines.indexOf(result)).toBeLessThan(lines.indexOf(approximation));
				expect(result.tex).not.toContain('\\approx');
				expect(Math.max(-1, ...result.calls)).toBeLessThan(Math.min(...approximation.calls));
				expect(result.readyAfterCall).toBeLessThan(calc.prefixCalls!);
			}
			expect(results.at(-1)!.readyAfterCall).toBe(calc.prefixCalls! - 1);
			const pairResult = lines.findIndex((l) => l.kind === 'result');
			expect(lines[pairResult - 1].kind).toBe('check');
			expect(lines[pairResult].readyAfterCall).toBe(lines[pairResult - 1].readyAfterCall);
			expect(approximation.tex.startsWith('x \\approx')).toBe(true);
			expect(approximation.tex).not.toContain('\\sqrt');
			expect(calc.beforeApproximation).toEqual(exactCalc.total);
			expect(exact.trace).toEqual(full.trace.slice(0, calc.prefixCalls));
			expect(exact.results[0].derivation.lines).toEqual(
				lines.slice(0, lines.indexOf(approximation))
			);
			expect(exact.lines[0]).not.toContain('≈');
			expect(exactCalc.calls.some((c) => c.op === 'isqrt' && c.operands[0] >= 10000000000n)).toBe(
				false
			);
			await validateDerivation(full);
			await validateDerivation(exact);
		}
	);
	it('records exact completion and total modeled costs', async () => {
		const measurements = [];
		for (const source of examples) {
			const calc = new MeasuredCalc(),
				result = await run(source, calc, { checkMode });
			expect(result.results[0].status).toBe('ok');
			expect(calc.beforeApproximation).toBeDefined();
			measurements.push({
				source,
				exact: calc.beforeApproximation,
				total: calc.total,
				resultReadyAfterCall: result.results[0].derivation.lines.find((l) => l.kind === 'result')!
					.readyAfterCall,
				approximationFirstOperation: calc.prefixCalls,
				lines: result.results[0].derivation.lines.map((l) => ({
					kind: l.kind,
					tex: l.tex.replace(/\\htmlId\{[^}]+\}\{([^}]*)\}/g, '$1')
				}))
			});
		}
		reports[checkMode] = measurements;
	});
	it('retains an explicit precision request even when the default approximation is disabled', async () => {
		const r = await run('solve x^2-2=0 to 6 places', new RefCalc(), {
			checkMode,
			approximate: false
		});
		expect(r.results[0].status).toBe('ok');
		expect(r.results[0].algebra?.checks.every((c) => c.kind === 'bracket')).toBe(true);
		expect(r.lines[0]).toContain('six-place bounds');
	});
});
it('keeps the finalized exact result if optional approximation fails', async () => {
	class FailedApproximation extends RefCalc {
		override async isqrt(n: bigint) {
			if (n >= 10000000000n) throw new Error('display unavailable');
			return super.isqrt(n);
		}
	}
	const r = await run('solve x^2-2=0', new FailedApproximation());
	expect(r.results[0].status).toBe('ok');
	expect(r.lines).toEqual(['= x = ± √2']);
	expect(r.results[0].algebra?.approximationError).toBe('display unavailable');
	expect(r.results[0].derivation.lines.at(-1)?.kind).toBe('result');
	await validateDerivation(r);
});
afterAll(async () => {
	if (process.env.ORDER_REPORT) await writeReport('./round5.json', reports);
	if (process.env.ORDER_BASELINE)
		await writeReport(
			'./round5-before-trials.json',
			Object.fromEntries(
				Object.entries(reports).map(([mode, rows]) => [
					mode,
					(rows as { source: string; exact: SheetCost; total: SheetCost }[]).map(
						({ source, exact, total }) => ({ source, exact, total })
					)
				])
			)
		);
});
