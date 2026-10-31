import { afterAll, describe, expect, it } from 'vitest';
import { writeReport } from './report-test-helper';
import { Arithmetic, CheckFailed, integer } from './arithmetic';
import { checkRoot } from './algebra';
import { LyingCalc, RefCalc, TraceCalc } from './calc';
import { parse } from './parse';
import { run } from './run';
import { DerivationBuilder, literal } from './derivation';
import { checkTextbookRoot } from './textbook';
import { normalizeEquation } from './textbook-poly';
import { validateDerivation } from './derivation-test-helper';

// Independent native-BigInt oracle: never imported by the runtime.
type Q = { n: bigint; d: bigint };
function gcd(a: bigint, b: bigint): bigint {
	a = a < 0n ? -a : a;
	b = b < 0n ? -b : b;
	while (b) [a, b] = [b, a % b];
	return a;
}
function q(n: bigint, d = 1n): Q {
	if (d < 0n) {
		n = -n;
		d = -d;
	}
	const g = gcd(n, d);
	return { n: n / g, d: d / g };
}
const add = (a: Q, b: Q) => q(a.n * b.d + b.n * a.d, a.d * b.d);
const mul = (a: Q, b: Q) => q(a.n * b.n, a.d * b.d);
const div = (a: Q, b: Q) => q(a.n * b.d, a.d * b.n);
const cut = (a: Q, k: number) => q((a.n * 10n ** BigInt(k)) / a.d, 10n ** BigInt(k));
const key = (a: Q) => `${a.n}/${a.d}`;
function seeded(seed: number) {
	let state = seed >>> 0;
	return (lo: number, hi: number) => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0;
		return lo + Math.floor((state / 0x100000000) * (hi - lo + 1));
	};
}
function product(a: bigint[], b: bigint[]): bigint[] {
	const c = Array<bigint>(a.length + b.length - 1).fill(0n);
	for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) c[i + j] += a[i] * b[j];
	return c;
}
function determinant(a: bigint[][]): bigint {
	if (a.length === 1) return a[0][0];
	return a[0].reduce(
		(sum, x, i) =>
			sum +
			(i % 2 ? -1n : 1n) * x * determinant(a.slice(1).map((r) => r.filter((_, j) => j !== i))),
		0n
	);
}
describe.each(['textbook', 'evaluation'] as const)('%s path', (path) => {
	const faultInputs = {
		light: [] as { source: string; target: number }[],
		strong: [] as { source: string; target: number }[]
	};
	const offeredInputs = { light: [] as string[], strong: [] as string[] };
	describe.each(['light', 'strong'] as const)('fixed-seed acceptance populations (%s)', (mode) => {
		const samples: Record<string, number[]> = {};
		const refusal = {
			wrongRoots: { attempts: 0, caught: 0 },
			evaluationFaults: {
				attempts: 0,
				caught: 0,
				missed: 0,
				missesWithWrongAnswer: 0,
				details: [] as { source: string; target: number; status: string; changed: boolean }[]
			}
		};
		function record(name: string, c: RefCalc) {
			(samples[name] ??= []).push(c.total.seconds);
		}
		async function execute(source: string, type: string) {
			const calc = new RefCalc(),
				r = await run(source, calc, { checkMode: mode, path });
			expect(r.results[0].status, `${source}: ${r.results[0].error}`).toBe('ok');
			if (r.results[0].algebra)
				expect(r.results[0].algebra.checks.every((c) => c.passed)).toBe(true);
			if (path === 'textbook') await validateDerivation(r);
			record(type, calc);
			return r.results[0];
		}

		it('1000 integer and decimal expressions against an independent rational oracle', async () => {
			const rand = seeded(0x3a11);
			for (let i = 0; i < 1000; i++) {
				const places = i % 5 === 0 ? rand(0, 8) : undefined;
				function expression(depth: number): { source: string; value: Q } {
					if (depth === 0) {
						const n = rand(-99, 99),
							scale = rand(0, 2),
							s = Math.abs(n)
								.toString()
								.padStart(scale + 1, '0');
						return {
							source: (n < 0 ? '-' : '') + (scale ? s.slice(0, -scale) + '.' + s.slice(-scale) : s),
							value: q(BigInt(n), 10n ** BigInt(scale))
						};
					}
					const a = expression(depth - 1),
						op = rand(0, 5);
					if (op === 4) {
						const e = rand(0, 4);
						return {
							source: `(${a.source})^${e}`,
							value: q(a.value.n ** BigInt(e), a.value.d ** BigInt(e))
						};
					}
					if (op === 5) return { source: `-(${a.source})`, value: q(-a.value.n, a.value.d) };
					const b =
						op === 3 ? { source: String(rand(1, 19)), value: q(1n) } : expression(depth - 1);
					if (op === 3) b.value = q(BigInt(b.source));
					const value =
						op === 0
							? add(a.value, b.value)
							: op === 1
								? add(a.value, q(-b.value.n, b.value.d))
								: op === 2
									? mul(a.value, b.value)
									: cut(div(a.value, b.value), places ?? 12);
					return { source: `(${a.source}${['+', '-', '*', '/'][op]}${b.source})`, value };
				}
				const e = expression(3),
					result = await execute(
						e.source + (places === undefined ? '' : ` to ${places} places`),
						'expressions'
					);
				expect(key(result.value!), e.source).toBe(key(e.value));
			}
		});
		it('200 linear equations with brackets and x on both sides', async () => {
			const rand = seeded(0x31);
			for (let i = 0; i < 200; i++) {
				const a = rand(-20, 20);
				let c = rand(-20, 20);
				while (a === c) c = rand(-20, 20);
				const b = rand(-20, 20),
					d = rand(-20, 20),
					e = rand(-20, 20);
				const expected = q(BigInt(e + a * b - d), BigInt(a - c));
				const r = await execute(`solve ${a}(x-(${b}))+(${d})=${c}x+(${e})`, 'linear');
				expect(r.algebra!.roots.map(key)).toEqual([key(expected)]);
			}
		});
		it('200 quadratics: rational, irrational and no real roots', async () => {
			const rand = seeded(0x32);
			for (let i = 0; i < 200; i++) {
				if (i % 3 === 0) {
					const p = rand(-15, 15),
						r = rand(-15, 15),
						q1 = rand(1, 5),
						q2 = rand(1, 5);
					const result = await execute(`solve (${q1}x-(${p}))(${q2}x-(${r}))+x=x`, 'quadratic');
					expect(result.algebra!.roots.map(key).sort()).toEqual(
						[...new Set([key(q(BigInt(p), BigInt(q1))), key(q(BigInt(r), BigInt(q2)))])].sort()
					);
				} else if (i % 3 === 1) {
					const s = BigInt(rand(1, 100)),
						v = s * s + 1n;
					const result = await execute(`solve x^2=${v}`, 'quadratic');
					expect(result.algebra!.checks).toHaveLength(2);
					for (const check of result.algebra!.checks) {
						const lo = check.lower!,
							hi = check.upper!;
						const f = lo.n * lo.n - v * lo.d * lo.d,
							g = hi.n * hi.n - v * hi.d * hi.d;
						expect(f * g < 0n).toBe(true);
						expect(hi.n * lo.d - lo.n * hi.d > 0n).toBe(true);
						expect(div(add(hi, q(-lo.n, lo.d)), q(1n, 1000000n))).toEqual(q(1n));
					}
				} else {
					const b = rand(-20, 20),
						c = rand(1, 20),
						result = await execute(`solve (x-(${b}))^2+${c}=0`, 'quadratic');
					expect(result.line).toBe('= no real roots');
					expect(result.algebra!.roots).toHaveLength(0);
				}
			}
		});
		for (const n of [2, 3])
			it(`200 ${n} by ${n} systems against independent determinants`, async () => {
				const rand = seeded(0x330 + n);
				for (let t = 0; t < 200; t++) {
					let matrix: bigint[][], det: bigint;
					do {
						matrix = Array.from({ length: n }, () =>
							Array.from({ length: n }, () => BigInt(rand(-9, 9)))
						);
						det = determinant(matrix);
					} while (det === 0n);
					const rhs = Array.from({ length: n }, () => BigInt(rand(-15, 15)));
					const expected = Array.from({ length: n }, (_, j) =>
						q(determinant(matrix.map((row, i) => row.map((v, k) => (k === j ? rhs[i] : v)))), det)
					);
					const equations = matrix
						.map(
							(row, i) => row.map((v, j) => `(${v})${['x', 'y', 'z'][j]}`).join('+') + '=' + rhs[i]
						)
						.join(',');
					const r = await execute(`solve ${equations}`, `system${n}`);
					expect(r.algebra!.roots.map(key)).toEqual(expected.map(key));
					expect(r.algebra!.checks).toHaveLength(n);
				}
			});
		it('200 expansions of powers and products through degree 12', async () => {
			const rand = seeded(0x34);
			for (let i = 0; i < 200; i++) {
				const a = BigInt(rand(-4, 4)),
					b = BigInt(rand(-5, 5)),
					e = rand(0, 12),
					f = i % 2 === 0 ? 0 : rand(0, 12 - e),
					c = BigInt(rand(-4, 4)),
					d = BigInt(rand(-5, 5));
				let expected = [1n];
				for (let j = 0; j < e; j++) expected = product(expected, [b, a]);
				for (let j = 0; j < f; j++) expected = product(expected, [d, c]);
				const r = await execute(`expand (${a}x+(${b}))^${e}*(${c}x+(${d}))^${f}`, 'expand');
				expect(r.algebra!.coefficients!.map((v) => v.n)).toEqual(expected);
				expect(r.algebra!.coefficients!.every((v) => v.d === 1n)).toBe(true);
			}
		});
		it('200 factorizations of known linear factors including multiplicities', async () => {
			const rand = seeded(0x35);
			for (let i = 0; i < 200; i++) {
				const count = rand(2, 6),
					roots: Q[] = [],
					terms: string[] = [];
				for (let j = 0; j < count; j++) {
					const p = BigInt(rand(-8, 8)),
						den = BigInt(rand(1, 3));
					roots.push(q(p, den));
					terms.push(`(${den}x-(${p}))`);
				}
				const r = await execute(`factor ${terms.join('')}`, 'factor');
				expect(r.algebra!.roots.map(key).sort(), terms.join('')).toEqual(roots.map(key).sort());
				expect(r.algebra!.remaining).toHaveLength(1);
				let reconstructed = r.algebra!.remaining!;
				for (const { p, q } of r.algebra!.factors!) reconstructed = product(reconstructed, [-p, q]);
				expect(reconstructed).toEqual(r.algebra!.coefficients!.map((c) => c.n));
				expect(r.algebra!.complete).toBe(false);
			}
		}, 30000);
		it('200 wrong offered roots are refused by the typed-equation check', async () => {
			const rand = seeded(0x36);
			for (let i = 0; i < 200; i++) {
				const root = BigInt(rand(-99, 99)),
					slope = BigInt(rand(1, 20)),
					offset = BigInt(rand(-20, 20));
				const statement = parse(`solve ${slope}x+(${offset})=${slope * root + offset}`)
					.statements[0];
				if (statement.kind !== 'solve') throw new Error();
				offeredInputs[mode].push(
					`${slope}x+(${offset})=${slope * root + offset}; offered ${root + 1n}`
				);
				refusal.wrongRoots.attempts++;
				try {
					if (path === 'textbook')
						await checkTextbookRoot(
							new DerivationBuilder(new TraceCalc(new RefCalc()), mode),
							statement.equations[0],
							literal(root + 1n)
						);
					else
						await checkRoot(
							new Arithmetic(new RefCalc(), mode),
							statement.equations[0],
							integer(root + 1n)
						);
				} catch (error) {
					if (!(error instanceof CheckFailed)) throw error;
					refusal.wrongRoots.caught++;
				}
			}
			expect(refusal.wrongRoots).toEqual({ attempts: 200, caught: 200 });
		});
		it('measures 200 evaluation faults honestly, preserving misses', async () => {
			const rand = seeded(0x37);
			for (let i = 0; i < 200; i++) {
				const a = rand(1, 9),
					b = rand(-9, 9),
					c = rand(1, 9),
					d = rand(-9, 9),
					root = rand(-9, 9);
				// The x-x term intentionally includes arithmetic whose errors can be masked by zero.
				const source =
					i % 2 === 0
						? `solve (${a}x+(${b}))(x-x)+${c}x+(${d})=${c * root + d}`
						: `solve (${a}x+(${b}))(x-(${root}))=0`;
				const stmt = parse(source).statements[0];
				if (stmt.kind !== 'solve') throw new Error();
				const probe = new RefCalc(),
					arithmetic = new Arithmetic(probe, mode),
					env = new Map([['x', integer(0n)]]);
				if (path === 'textbook')
					await normalizeEquation(
						stmt.equations[0],
						new DerivationBuilder(new TraceCalc(probe), mode)
					);
				else {
					const [left, right] = await arithmetic.evaluateMany(
						[stmt.equations[0].left, stmt.equations[0].right],
						env,
						{ exact: true }
					);
					await arithmetic.add(left, right, true);
				}
				const target = rand(0, probe.calls.length - 1),
					lying = new LyingCalc(new RefCalc(), target);
				const baseline = await run(source, new RefCalc(), { checkMode: mode, path }),
					r = await run(source, lying, { checkMode: mode, path }),
					status = r.results[0].status;
				expect(lying.calls.length).toBeGreaterThan(target);
				faultInputs[mode].push({ source, target });
				refusal.evaluationFaults.attempts++;
				if (status === 'refused') refusal.evaluationFaults.caught++;
				else {
					refusal.evaluationFaults.missed++;
					const changed = r.lines[0] !== baseline.lines[0];
					if (changed) refusal.evaluationFaults.missesWithWrongAnswer++;
					refusal.evaluationFaults.details.push({ source, target, status, changed });
				}
			}
			expect(refusal.evaluationFaults.attempts).toBe(200);
			expect(refusal.evaluationFaults.caught + refusal.evaluationFaults.missed).toBe(200);
		});
		afterAll(async () => {
			if (!process.env.PROGRAM_REPORT) return;
			const demos = [];
			for (const [source, dryRunSeconds] of [
				['123456 * 654321', 7],
				['solve 3(x-2)+5=2x+14', 4],
				['solve 7x+13=2026-4x', 8],
				['solve 2x+3y=7,x-y=1', 5],
				['expand (x+2)^5', 23],
				['expand (2x-3)^4', 21],
				['expand (x+1)^10', 118],
				['solve (2x-3)(x+5)=x^2+1-16', 29],
				['solve x^2-x-6=0', 29],
				['solve 2x+3y-z=1, x-y+2z=3, 3x+y+z=8', null],
				['factor x^3-6x^2+11x-6', null]
			] as const) {
				const calc = new RefCalc(),
					result = await run(source, calc, { checkMode: mode, path });
				expect(result.results[0].status, source).toBe('ok');
				demos.push({
					source,
					dryRunSeconds,
					seconds: calc.total.seconds,
					rows: calc.total.rows,
					calls: calc.total.calls,
					rowFloorSeconds: calc.total.rows * 0.037,
					derivation: result.results[0].derivation.lines.map((l) => ({
						kind: l.kind,
						tex: l.tex,
						note: l.note
					})),
					under12: calc.total.seconds < 12
				});
			}
			const costs = Object.fromEntries(
				Object.entries(samples).map(([name, values]) => {
					const sorted = [...values].sort((a, b) => a - b);
					return [
						name,
						{
							count: values.length,
							medianSeconds: (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2,
							p95Seconds: sorted[Math.ceil(sorted.length * 0.95) - 1]
						}
					];
				})
			);
			await writeReport(`./round3-${path}-${mode}.json`, {
				seeds: {
					expressions: 0x3a11,
					linear: 0x31,
					quadratic: 0x32,
					system2: 0x332,
					system3: 0x333,
					expand: 0x34,
					factor: 0x35,
					wrongRoots: 0x36,
					evaluationFaults: 0x37
				},
				costs,
				demos,
				refusal
			});
		});
	});

	afterAll(() => {
		expect(offeredInputs.light).toHaveLength(200);
		expect(offeredInputs.light).toEqual(offeredInputs.strong);
		expect(faultInputs.light).toHaveLength(200);
		expect(faultInputs.light).toEqual(faultInputs.strong);
	});
});
