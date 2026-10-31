import { hasRadical, symbolicEqual, symbolicCompare } from './symbolic-test-helper';
import { expect } from 'vitest';
import { Arithmetic, integer, type Rational } from './arithmetic';
import { fields, binary, num } from './derivation';
import { RefCalc } from './calc';
import type { Expr, Equation } from './parse';
import type { RunResult } from './run';

// Independent interpretation of proof expressions. Arithmetic is exclusively RefCalc;
// the input parser's per-power limit does not apply to generated powers such as x^13.
function powers(e: Expr): number[] {
	if (e.kind === 'number') return [0, 0, 0];
	if (e.kind === 'name') return ['x', 'y', 'z'].map((n) => Number(e.name === n));
	if (e.kind === 'unary') return powers(e.value);
	if (e.kind === 'binary' && e.op === '^')
		return powers(e.left).map((d) => d * Number((e.right as { text: string }).text));
	const l = powers(e.left),
		r = powers(e.right);
	return l.map((d, i) => (e.kind === 'binary' && e.op === '*' ? d + r[i] : Math.max(d, r[i])));
}
export async function validateDerivation(result: RunResult): Promise<void> {
	const a = new Arithmetic(new RefCalc());
	const evaluate = async (e: Expr, env: Map<string, Rational>): Promise<Rational> => {
		if (e.kind === 'number' || e.kind === 'name') return a.evaluate(e, env, { exact: true });
		if (e.kind === 'unary') {
			const v = await evaluate(e.value, env);
			return e.op === 'sqrt' ? a.sqrt(v, undefined, true) : e.op === '-' ? { ...v, n: -v.n } : v;
		}
		const l = await evaluate(e.left, env);
		if (e.kind === 'binary' && e.op === '^')
			return a.pow(l, Number((e.right as { text: string }).text));
		const r = await evaluate(e.right, env);
		if (e.kind === 'gcd') return integer(await a.gcd(l.n, r.n));
		return e.op === '+' || e.op === '-'
			? a.add(l, r, e.op === '-')
			: e.op === '*'
				? a.mul(l, r)
				: a.div(l, r);
	};
	const same = async (eq: Equation, env: Map<string, Rational>, label: string) => {
		if (hasRadical(eq.left) || hasRadical(eq.right)) {
			expect(await symbolicEqual(eq, env), label).toBe(true);
			return;
		}
		const l = await evaluate(eq.left, env),
			r = await evaluate(eq.right, env);
		expect(await a.equal(l, r), label).toBe(true);
	};
	const ids = new Set<string>();
	const env = new Map<string, Rational>();
	for (const statement of result.results) {
		for (const line of statement.derivation.lines) {
			const label = `${line.kind}: ${line.tex}`;
			expect(line.calls).toEqual(
				[...new Set(line.numbers.map((n) => n.call))].sort((a, b) => a - b)
			);
			for (const span of line.numbers) {
				expect(ids.has(span.id), span.id).toBe(false);
				ids.add(span.id);
				expect(line.tex + (line.note ?? '')).toContain(`\\htmlId{${span.id}}{${span.displayed}}`);
				expect(span.call).toBeGreaterThanOrEqual(0);
				expect(span.call).toBeLessThan(statement.derivation.traceOffset + statement.trace.length);
				const value = fields(result.trace[span.call].result).find(
					([key]) => key === span.field
				)?.[1];
				expect(String(value)).toBe(span.value);
				const shown = BigInt(span.displayed.replace('.', ''));
				const sourceDigits = value! / 10n ** BigInt(span.discardedDigits ?? 0);
				expect(shown === sourceDigits || shown === -sourceDigits, span.id).toBe(true);
				expect(span.signFlipped).toBe(shown !== 0n && shown < 0n !== value! < 0n);
				expect(span.displayed.includes('.') ? span.displayed.split('.')[1].length : 0).toBe(
					span.decimalPlaces
				);
			}
			for (const eq of line.identities) {
				const degree = powers(eq.left).map((n, i) => Math.max(n, powers(eq.right)[i]));
				// d+1 exact evaluations in each variable certify a polynomial identity of degree d.
				for (let x = 0; x <= degree[0]; x++)
					for (let y = 0; y <= degree[1]; y++)
						for (let z = 0; z <= degree[2]; z++) {
							const point = new Map(env);
							[x, y, z].forEach((v, i) => point.set(['x', 'y', 'z'][i], integer(BigInt(v))));
							await same(eq, point, label);
						}
			}
			for (const root of line.roots ?? [])
				await same(root.equation, new Map([...env, ...Object.entries(root.point)]), label);
			for (const bound of line.bounds ?? []) {
				const values = [];
				for (const x of [bound.lower, bound.upper]) {
					const at = new Map(env);
					at.set('x', x);
					values.push(
						await a.add(
							await evaluate(bound.equation.left, at),
							await evaluate(bound.equation.right, at),
							true
						)
					);
				}
				expect(
					values[0].n !== 0n && values[1].n !== 0n && values[0].n < 0n !== values[1].n < 0n,
					label
				).toBe(true);
				const width = await a.add(bound.upper, bound.lower, true);
				expect(await a.equal(width, { n: 1n, d: 1000000n }), label).toBe(true);
			}
			for (const condition of line.conditions ?? []) {
				const v = await evaluate(condition.expression, env);
				expect(
					condition.relation === 'zero'
						? v.n === 0n
						: condition.relation === 'negative'
							? v.n < 0n
							: v.n !== 0n,
					label
				).toBe(true);
			}
			if (line.candidates) {
				const c = await evaluate(line.candidates.constant, env),
					leading = await evaluate(line.candidates.leading, env);
				for (const v of line.candidates.values) {
					expect((await a.calc.divmod(c.n < 0n ? -c.n : c.n, v.n < 0n ? -v.n : v.n)).r, label).toBe(
						0n
					);
					expect((await a.calc.divmod(leading.n < 0n ? -leading.n : leading.n, v.d)).r, label).toBe(
						0n
					);
				}
			}
			if (line.radicalApproximation)
				for (let i = 0; i < line.radicalApproximation.exact.length; i++) {
					const exact = line.radicalApproximation.exact[i],
						display = line.radicalApproximation.displayed[i];
					expect(
						await symbolicCompare({ left: exact, right: binary('-', display, num('0.0001')) }, env),
						label
					).toBeGreaterThanOrEqual(0);
					expect(
						await symbolicCompare({ left: exact, right: binary('+', display, num('0.0001')) }, env),
						label
					).toBeLessThanOrEqual(0);
				}

			if (line.approximation) {
				const v = await a.evaluate(line.approximation.expression, env, {
					places: line.approximation.places
				});
				expect(v).toEqual(line.approximation.value);
			}
			expect(
				line.kind === 'given' ||
					line.identities.length > 0 ||
					(line.roots?.length ?? 0) > 0 ||
					(line.bounds?.length ?? 0) > 0 ||
					(line.conditions?.length ?? 0) > 0 ||
					!!line.candidates ||
					!!line.approximation ||
					!!line.radicalApproximation ||
					(line.equations?.length ?? 0) > 1,
				label
			).toBe(true);
		}
		if (statement.statement.kind === 'assign' && statement.value)
			env.set(statement.statement.name, statement.value);
	}
}
