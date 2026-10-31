import { describe, expect, it } from 'vitest';
import { Arithmetic, integer } from './arithmetic';
import { checkRoot } from './algebra';
import { LyingCalc, RefCalc } from './calc';
import { parse } from './parse';
import { run as runWork } from './run';

describe.each(['light', 'strong'] as const)('algebra integration (%s)', (mode) => {
	const run = (source: string, calc: RefCalc | LyingCalc) =>
		runWork(source, calc, { checkMode: mode });
	it.each([
		['solve 3(x-2)+5=2x+14', 'x = 15'],
		['solve 7x+13=2026-4x', 'x = 183'],
		['solve x=x', 'every x'],
		['solve x=x+1', 'no solution'],
		['solve x^2-x-6=0', 'x = -2, 3'],
		['solve (x-1)^2=0', 'x = 1'],
		['solve x^2+1=0', 'no real roots'],
		['solve x^2=0', 'x = 0'],
		['solve -2x^2+3x=0', 'x = 3/2 (≈ 1.500000), 0'],
		['solve 0.5x+1=2', 'x = 2'],
		['solve x*(x-1)/2=3', 'x = -2, 3'],
		['solve 2x+3y=7,x-y=1', 'x = 2, y = 1'],
		['solve y=2,x=1,z=3', 'x = 1, y = 2, z = 3'],
		['solve 2x+3y-z=1,x-y+2z=3,3x+y+z=8', 'x = 5, y = -4, z = -3'],
		['solve x+y=2,2x+2y=4', 'zero determinant'],
		['solve x+y+z=1,2x+2y+2z=2,3x+3y+3z=3', 'zero determinant'],
		['expand (x+2)^5', 'x^5 + 10x^4 + 40x^3 + 80x^2 + 80x + 32'],
		['expand -(x-2)^3', '-x^3 + 6x^2 - 12x + 8'],
		['factor (2x-1)(x+3)^2', 'proven roots:'],
		['solve (x-1)(x+2)(x-3)=0', 'proven roots:'],
		['factor x^2+1', 'remaining x^2 + 1']
	])('%s', async (source, expected) => {
		const r = await run(source, new RefCalc());
		expect(r.results[0].status, r.results[0].error).toBe('ok');
		expect(r.lines[0]).toContain(expected);
		expect(r.results[0].algebra?.checks.every((c) => c.passed)).toBe(true);
	});
	it('allows products above total degree twelve and refuses unresolved six-place brackets', async () => {
		const expanded = await run('expand (x+1)^12*(x-1)', new RefCalc());
		expect(expanded.results[0].status).toBe('ok');
		expect(expanded.results[0].algebra!.coefficients!.map((c) => c.n)).toEqual([
			-1n,
			-11n,
			-54n,
			-154n,
			-275n,
			-297n,
			-132n,
			132n,
			297n,
			275n,
			154n,
			54n,
			11n,
			1n
		]);
		const close = await run('solve (1000000000x-123)^2=2', new RefCalc());
		expect(close.results[0].status).toBe('refused');
		expect(close.results[0].error).toContain('six decimal places');
	});
	it('proves distinct irrational brackets on the typed sides', async () => {
		for (const source of ['solve x^2=2', 'solve -x^2+2=0', 'solve 1000000x^2-1=1']) {
			const r = await run(source, new RefCalc()),
				a = r.results[0].algebra;
			expect(r.results[0].status, r.results[0].error).toBe('ok');
			expect(a?.checks).toHaveLength(2);
			expect(a?.checks.every((c) => c.kind === 'bracket' && c.passed)).toBe(true);
		}
	});
	it('refuses a wrong root and an altered evaluation', async () => {
		const s = parse('solve 2x+1=5').statements[0];
		if (s.kind !== 'solve') throw new Error();
		await expect(
			checkRoot(new Arithmetic(new RefCalc(), mode), s.equations[0], integer(3n))
		).rejects.toThrow(mode === 'strong' ? 'typed equation' : 'recovered coefficients');
		const r = await run('solve 2x+1=5', new LyingCalc(new RefCalc(), 0));
		expect(r.lines).toEqual(['= check failed']);
		expect(r.results[0].status).toBe('refused');
	});
	it('handles names, per-line trace, errors and stale assignments', async () => {
		const r = await run('a = 12\na / 5\na = 1 / 0\na', new RefCalc());
		expect(r.lines).toEqual([
			'= 12',
			'= 2.4',
			'= error: Division by zero',
			'= error: Unknown name a'
		]);
		expect(r.results.flatMap((v) => v.trace)).toEqual(r.trace);
	});
	it('rejects approximate constants in exact equations and unsupported expansion', async () => {
		const r = await run('a = 1 / 3\nsolve x=a\nexpand x/2', new RefCalc());
		expect(r.results.map((v) => v.status)).toEqual(['ok', 'refused', 'error']);
	});
});
