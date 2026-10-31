import { describe, expect, it } from 'vitest';
import { RefCalc, TraceCalc, LyingCalc } from './calc';
import { Arithmetic, integer } from './arithmetic';
import { checkRoot, integerHorner, unpack } from './algebra';
import { parse } from './parse';
import { run } from './run';

describe('wave accounting and round-two boundaries', () => {
	it('sums rows and takes the longest multi-operation job, including nesting', async () => {
		const job1 = async (c: RefCalc) => c.mul(await c.add(99n, 1n), 321n);
		const job2 = async (c: RefCalc) => {
			const [x, y] = await c.wave([
				() => c.divmod(9999n, 7n).then((r) => r.q),
				() => c.sub(1000n, 1n)
			]);
			return c.add(x, y);
		};
		const one = new RefCalc(),
			two = new RefCalc();
		const expected = [await job1(one), await job2(two)];
		const c = new RefCalc();
		expect(await c.wave([() => job1(c), () => job2(c)])).toEqual(expected);
		expect(c.total.rows).toBe(one.total.rows + two.total.rows);
		expect(c.total.calls).toBe(Math.max(one.total.calls, two.total.calls));
		expect(c.total.seconds).toBe(c.total.calls * 0.065 + c.total.rows * 0.037);
		expect(c.total.rows).toBe(c.calls.reduce((n, r) => n + r.cost!.rows, 0));
		expect(await c.wave([])).toEqual([]);
		const before = c.total;
		await c.add(1n, 1n);
		expect(c.total.calls).toBe(before.calls + 2);
		expect(c.total.rows).toBe(before.rows + 2);
	});
	it('drains a rejected wave and restores the enclosing schedule', async () => {
		const c = new RefCalc();
		await expect(
			c.wave([
				async () => {
					await c.add(1n, 2n);
					throw new Error('stop');
				},
				async () => {
					await c.mul(12n, 34n);
					return 1n;
				}
			])
		).rejects.toThrow('stop');
		const isolated = new RefCalc();
		await isolated.mul(12n, 34n);
		expect(c.total.calls).toBe(isolated.total.calls);
		expect(c.total.rows).toBe(isolated.total.rows + 2);
		await c.sub(5n, 2n);
		expect(c.total.calls).toBe(isolated.total.calls + 1);
	});
	it('keeps wrappers and fault targets inside waves', async () => {
		const base = new RefCalc(),
			liar = new LyingCalc(base, 1),
			trace = new TraceCalc(liar);
		expect(await trace.wave([() => trace.add(1n, 2n), () => trace.mul(3n, 4n)])).toEqual([3n, 13n]);
		expect(trace.calls).toHaveLength(2);
		expect(liar.calls).toHaveLength(2);
		expect(base.total.calls).toBe(6);
		expect(base.total.rows).toBe(8);
	});
	it('shares expressions and powers without omitting their dependencies from costs', async () => {
		const c = new RefCalc(),
			a = new Arithmetic(c);
		const statement = parse('(x+2)^3+(x+2)^2').statements[0];
		if (statement.kind !== 'expression') throw new Error();
		expect(
			await a.evaluate(statement.value, new Map([['x', integer(3n)]]), { exact: true })
		).toMatchObject({ n: 150n, d: 1n });
		expect(c.calls.filter((c) => c.op === 'mul')).toHaveLength(2);
		expect(c.calls.filter((c) => c.op === 'add')).toHaveLength(2);
		// The common (x+2), power 2 and power 3 are ordered prerequisites, not free cross-wave promises.
		expect(c.total.calls).toBe(c.calls.reduce((n, r) => n + r.cost!.calls, 0));
	});
	it('reads positive groups for free and corrects signed carries only on Calc', async () => {
		const c = new RefCalc(),
			a = new Arithmetic(c);
		expect(await unpack(a, 1010040080080032n, 3, 6)).toEqual([32n, 80n, 80n, 40n, 10n, 1n]);
		expect(c.calls).toHaveLength(0);
		expect(await unpack(a, 9901n, 2, 3)).toEqual([1n, -1n, 1n]);
		expect(c.calls.map((c) => c.op)).toEqual(['sub', 'add']);
		expect(await unpack(a, -9901n, 2, 3)).toEqual([-1n, 1n, -1n]);
		expect(await unpack(a, 999999n, 2, 4)).toEqual([-1n, 0n, 0n, 1n]);
		expect(c.calls.every((c) => c.op !== 'divmod')).toBe(true);
	});
	it('checks rational roots with integer cross-multiplication and skips gcd for integral quotients', async () => {
		const c = new RefCalc(),
			a = new Arithmetic(c);
		expect(await a.fraction(12n, 3n)).toMatchObject({ n: 4n, d: 1n });
		expect(c.calls.map((c) => c.op)).toEqual(['divmod']);
		const before = c.calls.length;
		expect(await integerHorner(a, [-1n, 0n, 4n], { n: 1n, d: 2n })).toBe(0n);
		expect(c.calls.slice(before).every((c) => c.op === 'mul' || c.op === 'add')).toBe(true);
	});
	it('makes the selected check mode visible and defaults to light', async () => {
		const light = await run('solve x^2-x-6=0', new RefCalc());
		const strong = await run('solve x^2-x-6=0', new RefCalc(), { checkMode: 'strong' });
		expect(light.lines).toEqual(strong.lines);
		expect(light.results[0].algebra?.checkMode).toBe('light');
		expect(light.results[0].algebra?.checks.every((c) => c.kind === 'horner')).toBe(true);
		expect(strong.results[0].algebra?.checks.every((c) => c.kind === 'substitution')).toBe(true);
	});
	it('also runs correctly on a concurrent provider and drains failing jobs before the next line', async () => {
		class ConcurrentCalc extends RefCalc {
			override async wave<T>(jobs: (() => Promise<T>)[]): Promise<T[]> {
				return Promise.all(jobs.map((job) => job()));
			}
		}
		for (const mode of ['light', 'strong'] as const) {
			const input = 'solve 2x+3y-z=1,x-y+2z=3,3x+y+z=8';
			const concurrent = await run(input, new ConcurrentCalc(), { checkMode: mode });
			const reference = await run(input, new RefCalc(), { checkMode: mode });
			expect(concurrent.lines).toEqual(reference.lines);
			expect(concurrent.results[0].status).toBe('ok');
		}
		const failed = await run('missing + 1.5\n2+3', new ConcurrentCalc());
		expect(failed.results.map((v) => v.status)).toEqual(['error', 'ok']);
		expect(failed.results[0].trace.every((c) => c.op === 'divmod')).toBe(true);
		expect(failed.results[1].trace.map((c) => c.op)).toEqual(['add']);
	});
	it('exposes the weaker light-check premise if a coefficient row is changed after confirmation', async () => {
		const s = parse('solve x=2').statements[0];
		if (s.kind !== 'solve') throw new Error();
		const root = integer(3n),
			wrongRow = [-3n, 1n];
		expect(
			await checkRoot(
				new Arithmetic(new RefCalc(), 'light'),
				s.equations[0],
				root,
				new Map(),
				wrongRow
			)
		).toMatchObject({ passed: true, kind: 'horner' });
		await expect(
			checkRoot(new Arithmetic(new RefCalc(), 'strong'), s.equations[0], root, new Map(), wrongRow)
		).rejects.toThrow('typed equation');
	});
	it('keeps the six selected demo beats below twelve modeled seconds in both modes', async () => {
		for (const mode of ['light', 'strong'] as const)
			for (const source of [
				'123456 * 654321',
				'solve 3(x-2)+5=2x+14',
				'solve 7x+13=2026-4x',
				'solve 2x+3y=7,x-y=1',
				'solve (2x-3)(x+5)=x^2+1-16',
				'solve x^2-x-6=0'
			]) {
				const c = new RefCalc(),
					result = await run(source, c, { checkMode: mode });
				expect(result.results[0].status, source).toBe('ok');
				expect(c.total.seconds, `${mode}: ${source}`).toBeLessThan(12);
			}
	});
});
