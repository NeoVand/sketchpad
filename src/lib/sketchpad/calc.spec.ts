import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ADD_DOMAIN } from './adder.ts';
import {
	Run,
	divScale,
	divide,
	referenceAnswer,
	referencePolicy,
	sqrtScale,
	squareRoot,
	subOnce,
	type View
} from './calc-sheet.ts';
import { CALC_DOMAIN, calcIndex, calcRef } from './calc-tables.ts';
import { MUL_DOMAIN } from './multiplier.ts';
import { SheetCalc } from './sheet-calc.ts';

const TABLE = new Set([
	...ADD_DOMAIN.map((v) => 'ADD-FAST' + v.join('')),
	...MUL_DOMAIN.map(([op, v]) => op + v.join('')),
	...CALC_DOMAIN.map(([op, v]) => op + v.join(''))
]);

/** the reference tables in place of the model, recording every view that is not a table row */
function harness() {
	const off = new Set<string>();
	const ops: Record<string, number> = {};
	const policy = (views: View[]) =>
		views.map((v) => {
			const k = v.op + v.cells.join('');
			if (!TABLE.has(k)) off.add(k);
			ops[v.op] = (ops[v.op] ?? 0) + 1;
			return referenceAnswer(v.op, v.cells);
		});
	return { run: new Run(policy), calc: new SheetCalc(policy), off, ops };
}

let seed = 1;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
/** a number of up to `max` digits: mostly random digits, sometimes 0, runs of 9s or 0s, or a power of ten */
function pick(max: number): bigint {
	const u = rand();
	const n = int(1, max);
	if (u < 0.04) return 0n;
	if (u < 0.08) return 10n ** BigInt(n - 1);
	if (u < 0.12) return 10n ** BigInt(n) - 1n;
	if (u < 0.18)
		return BigInt(
			'1' + Array.from({ length: n - 1 }, () => (rand() < 0.7 ? '0' : String(int(0, 9)))).join('')
		);
	return BigInt(
		String(int(1, 9)) + Array.from({ length: n - 1 }, () => String(int(0, 9))).join('')
	);
}
const isqrt = (n: bigint) => {
	if (n < 2n) return n;
	let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
	for (;;) {
		const y = (x + n / x) / 2n;
		if (y >= x) return x;
		x = y;
	}
};

describe('the calculator tables', () => {
	it('are the rows and answers of calc_tables.py, in its order', () => {
		const py = JSON.parse(
			readFileSync(new URL('../../../research/sketch/calc_tables.json', import.meta.url), 'utf8')
		) as { op: string; cells: string[]; out: string[] }[];
		expect(CALC_DOMAIN.length).toBe(651);
		expect(py.length).toBe(651);
		CALC_DOMAIN.forEach(([op, v], i) => {
			expect([op, v]).toEqual([py[i].op, py[i].cells]);
			expect(calcRef(op, v)).toEqual(py[i].out);
			expect(calcIndex(op, v)).toBe(i);
		});
		const by: Record<string, number> = {};
		for (const [op] of CALC_DOMAIN) by[op] = (by[op] ?? 0) + 1;
		expect(by).toEqual({ SUB: 242, EST: 400, DEC: 9 });
	});

	it('scale a divisor to start with 5 or more, and a root to start with 25 to 49', () => {
		for (let d = 1; d <= 9; d++)
			for (const b of [String(d), `${d}9`, `${d}00`, `${d}999`]) {
				const f = divScale(d);
				expect(Number(String(Number(b) * f)[0])).toBeGreaterThanOrEqual(5);
				expect(String(Number(b) * f).length).toBe(b.length);
			}
		// every 1- to 6-digit number: its scaled root starts with 25..49
		for (let a = 1; a < 1_000_000; a++) {
			const c = sqrtScale(String(a));
			const lead = isqrt(BigInt(c * c * a) * 10n ** 12n)
				.toString()
				.slice(0, 2);
			if (!(lead >= '25' && lead < '50'))
				throw new Error(`a = ${a}, c = ${c}, root starts ${lead}`);
		}
	});
});

describe('the calculator with the reference tables', () => {
	it('adds and subtracts 1,000 signed pairs exactly', async () => {
		seed = 11;
		const h = harness();
		const cases: [bigint, bigint][] = [
			[0n, 0n],
			[5n, 5n],
			[-5n, 5n],
			[123n, -123n],
			[1000n, 1n],
			[1n, 1000n],
			[-1n, -999n],
			[10n ** 40n, -1n]
		];
		while (cases.length < 1000) {
			const a = pick(int(1, 3) === 1 ? 40 : 8);
			const b = rand() < 0.08 ? a : pick(int(1, 3) === 1 ? 40 : 8);
			cases.push([rand() < 0.5 ? -a : a, rand() < 0.5 ? -b : b]);
		}
		for (const [i, [a, b]] of cases.entries()) {
			if (i % 2) expect(await h.calc.add(a, b)).toBe(a + b);
			else expect(await h.calc.sub(a, b)).toBe(a - b);
		}
		expect([...h.off]).toEqual([]);
	});

	it('divides 1,000 pairs exactly, with the remainder', async () => {
		seed = 22;
		const h = harness();
		const cases: [bigint, bigint][] = [
			[0n, 1n],
			[0n, 987n],
			[1n, 1n],
			[7n, 7n],
			[5n, 123n],
			[99n, 100n],
			[100n, 99n],
			[10n ** 39n, 3n],
			[10n ** 40n - 1n, 10n ** 20n - 1n],
			[123456789n, 1n],
			[1n, 10n ** 40n - 1n]
		];
		while (cases.length < 1000) {
			const a = pick(int(1, 4) === 1 ? 40 : 14);
			let b = pick(int(1, 4) === 1 ? 40 : 6);
			if (rand() < 0.05) b = a;
			cases.push([a, b === 0n ? 7n : b]);
		}
		for (const [a, b] of cases) expect(await h.calc.divmod(a, b)).toEqual({ q: a / b, r: a % b });
		expect([...h.off]).toEqual([]);
	});

	it('divides 1,000 pairs to the quotient and whether it is exact', async () => {
		seed = 23;
		const h = harness();
		for (let i = 0; i < 1000; i++) {
			const a = pick(8) * 10n ** BigInt(int(0, 12));
			const b = pick(4) || 7n;
			expect(await h.calc.divFloor(a, b)).toEqual({ q: a / b, exact: a % b === 0n });
		}
		expect([...h.off]).toEqual([]);
	});

	it('takes 1,000 integer square roots exactly, with the remainder', async () => {
		seed = 33;
		const h = harness();
		const cases: bigint[] = [
			0n,
			1n,
			2n,
			3n,
			4n,
			99n,
			100n,
			10n ** 40n,
			10n ** 40n - 1n,
			2n * 10n ** 12n
		];
		while (cases.length < 1000) {
			const a = pick(int(1, 4) === 1 ? 40 : 12);
			// a share of perfect squares and their neighbours
			const u = rand();
			cases.push(u < 0.1 ? a * a : u < 0.15 && a > 0n ? a * a - 1n : a);
		}
		for (const a of cases) {
			const r = isqrt(a);
			expect(await h.calc.isqrt(a)).toEqual({ root: r, rem: a - r * r });
		}
		expect([...h.off]).toEqual([]);
	});

	it('takes 1,000 square roots to six places (root and exactness only)', async () => {
		seed = 44;
		const h = harness();
		for (let i = 0; i < 1000; i++) {
			const a = pick(6) * 10n ** 12n;
			const r = isqrt(a);
			expect(await h.calc.sqrtFloor(a)).toEqual({ root: r, exact: r * r === a });
		}
		expect([...h.off]).toEqual([]);
	});

	it('multiplies signed numbers', async () => {
		seed = 55;
		const h = harness();
		for (let i = 0; i < 200; i++) {
			const a = pick(12) * (rand() < 0.5 ? -1n : 1n);
			const b = pick(12) * (rand() < 0.5 ? -1n : 1n);
			expect(await h.calc.mul(a, b)).toBe(a * b);
		}
		expect([...h.off]).toEqual([]);
	});

	it('runs gcd by repeated division', async () => {
		seed = 66;
		const h = harness();
		const gcd = (a: bigint, b: bigint): bigint => (b ? gcd(b, a % b) : a);
		for (let i = 0; i < 100; i++) {
			let a = pick(16);
			let b = pick(16);
			if (b === 0n) b = 12n;
			const want = gcd(a, b);
			while (b) [a, b] = [b, (await h.calc.divmod(a, b)).r];
			expect(a).toBe(want);
		}
	});
});

describe('waves: independent operations sharing decoder calls', () => {
	it('answers exactly as one at a time, in fewer calls, with the ops of different tables in one batch', async () => {
		const jobsOf = (c: SheetCalc): (() => Promise<unknown>)[] =>
			[
				[123456n, 789n],
				[98765n, 4321n],
				[5n, 7n],
				[10n ** 15n, 999n]
			].flatMap(([a, b]) => [
				() => c.divmod(a, b),
				() => c.mul(a, b),
				() => c.isqrt(a),
				() => c.add(a, -b),
				() => c.add(a, b)
			]);
		const solo = new SheetCalc(referencePolicy);
		const one: unknown[] = [];
		for (const j of jobsOf(solo)) one.push(await j());
		const mixed: string[] = [];
		const together = new SheetCalc((views: View[]) => {
			const kinds = new Set(views.map((v) => (v.op === 'ADD-FAST' ? 'SUM' : v.op)));
			if (kinds.size > 1) mixed.push([...kinds].sort().join('+'));
			return referencePolicy(views);
		});
		const all = await together.wave(jobsOf(together));
		expect(all).toEqual(one);
		expect(together.views).toBe(solo.views);
		expect(together.calls).toBeLessThan(solo.calls / 3);
		expect(mixed.some((m) => m.includes('SUM') && m.includes('SUB') && m.includes('MUL'))).toBe(
			true
		);
	});

	it('lets every job of a wave end before it reports a failure', async () => {
		const c = new SheetCalc(referencePolicy);
		let finished = false;
		await expect(
			c.wave<unknown>([
				() => c.divmod(5n, 0n),
				async () => {
					const v = await c.mul(123456n, 789n);
					finished = true;
					return v;
				}
			])
		).rejects.toThrow(/b > 0/);
		expect(finished).toBe(true);
	});

	it('keeps a failing job from holding the others', async () => {
		const c = new SheetCalc(referencePolicy);
		const [x, y] = await Promise.allSettled([c.divmod(5n, 0n), c.mul(12n, 34n)]);
		expect(x.status).toBe('rejected');
		expect(y).toEqual({ status: 'fulfilled', value: 408n });
	});
});

describe('the procedures, step by step', () => {
	it('says which number is larger by the final borrow', async () => {
		const { run } = harness();
		expect(await subOnce(run, '1000', '999')).toEqual({ digits: '1', less: false });
		expect(await subOnce(run, '999', '1000')).toMatchObject({ less: true });
		expect(await subOnce(run, '42', '42')).toEqual({ digits: '0', less: false });
	});

	it('guesses each quotient digit at most 2 too high', async () => {
		seed = 77;
		const { run } = harness();
		let decs = 0;
		let guesses = 0;
		run.onViews = (views) => {
			for (const v of views) {
				if (v.op === 'DEC') decs++;
				if (v.op === 'EST') guesses++;
			}
		};
		let worst = 0;
		for (let i = 0; i < 300; i++) {
			const before = decs;
			const b = pick(8) || 3n;
			await divide(run, (pick(20) * 10n ** 10n).toString(), b.toString());
			worst = Math.max(worst, decs - before);
		}
		expect(guesses).toBeGreaterThan(1000);
		// per run, not per digit; the per-digit bound shows as no digit needing more than two
		expect(decs).toBeLessThan(guesses);
		expect(worst).toBeGreaterThan(0);
	});

	it('takes the first root digit from the scale and never reads an EST view off the table', async () => {
		const { run, off, ops } = harness();
		for (const a of [
			'2',
			'3',
			'5',
			'6',
			'7',
			'8',
			'10',
			'15',
			'16',
			'24',
			'25',
			'26',
			'99',
			'624',
			'625',
			'626'
		])
			expect((await squareRoot(run, a + '000000000000')).root).toBe(
				isqrt(BigInt(a) * 10n ** 12n).toString()
			);
		expect([...off]).toEqual([]);
		expect(ops.EST).toBeGreaterThan(0);
	});
});
