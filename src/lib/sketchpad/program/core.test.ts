import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RefCalc } from './calc';
import { Arithmetic } from './arithmetic';
import { degree, parse } from './parse';

describe('contract and reference cost port', () => {
	it('matches Python reference costs and answers', async () => {
		const vectors = JSON.parse(
			readFileSync(new URL('./cost-fixtures.json', import.meta.url), 'utf8')
		) as {
			op: 'add' | 'sub' | 'mul' | 'divmod' | 'isqrt';
			a: string;
			b?: string;
			value: string;
			rows: number;
			calls: number;
		}[];
		for (const v of vectors) {
			const c = new RefCalc();
			const a = BigInt(v.a),
				b = BigInt(v.b ?? 0);
			const answer = v.op === 'isqrt' ? await c.isqrt(a) : await c[v.op](a, b);
			expect(
				typeof answer === 'bigint'
					? String(answer)
					: 'q' in answer
						? String(answer.q)
						: String(answer.root)
			).toBe(v.value);
			expect(c.total.rows).toBe(v.rows);
			expect(c.total.calls).toBe(v.calls);
		}
	});
	it('handles signed arithmetic and boundary domains', async () => {
		const c = new RefCalc();
		expect(await c.add(-2n, 3n)).toBe(1n);
		expect(await c.sub(-2n, -3n)).toBe(1n);
		expect(await c.isqrt(0n)).toEqual({ root: 0n, rem: 0n });
		await expect(c.divmod(-1n, 2n)).rejects.toThrow();
		await expect(c.divmod(1n, 0n)).rejects.toThrow();
		await expect(c.isqrt(-1n)).rejects.toThrow();
	});
	it('parses all work-order forms, spellings and implicit multiplication', () => {
		const w = parse(
			'```sheet\na = 2 × 3 − 1\na / 7 to 6 places\n√(4) + sqrt(9) + gcd(18,12)\nsolve 3(x-2)+5=2x+14\nsolve 2x+3y=7, x-y=1\nsolve x=1,y=2,z=3\nexpand (x+2)^5\nfactor (x-1)*(x+2)\n```'
		);
		expect(w.statements.map((s) => s.kind)).toEqual([
			'assign',
			'expression',
			'expression',
			'solve',
			'solve',
			'solve',
			'expand',
			'factor'
		]);
		const p = parse('expand (x+2)^5').statements[0];
		expect(p.kind === 'expand' && degree(p.value)).toBe(5);
		expect(parse('2 ÷ 1 * 3').statements).toHaveLength(1);
	});
	it.each([
		'2 @ 3',
		'1 + )',
		'1 +',
		'sqrt 4',
		'solve x^2+y=0,x=1',
		'x = 2',
		'expand x^13',
		'solve 1/x=2',
		'2 to -1 places',
		'a=',
		'2 3',
		'```sheet\n1'
	])('names an offending token: %s', (source) => {
		expect(() => parse(source)).toThrow(/token/);
	});
	it('identifies the invalid exponent token', () => {
		expect(() => parse('2^13')).toThrow('token "13"');
	});
	it('preserves precedence, literal decimals, exact fractions and truncation', async () => {
		const a = new Arithmetic(new RefCalc());
		for (const [source, expected] of [
			['-2^2', '-4'],
			['(-2)^2', '4'],
			['1.2+0.03', '1.23'],
			['2^-2', '0.25'],
			['2/3 to 2 places', '0.66…'],
			['sqrt(2) to 6 places', '1.414213…'],
			['sqrt(2.25)*2 to 0 places', '2…'],
			['sqrt(0.000000000000000000000000000001)*1000000000000000', '0…'],
			['(2/3)*3 to 2 places', '1.98…'],
			['gcd(-18,12)', '6']
		]) {
			const s = parse(source).statements[0];
			if (s.kind !== 'expression') throw new Error();
			expect(
				await a.decimal(await a.evaluate(s.value, new Map(), { places: s.places }), s.places ?? 12)
			).toBe(expected);
		}
	});
});
