import { Arithmetic, integer, type Rational } from './arithmetic';
import { RefCalc } from './calc';
import type { Expr, Equation } from './parse';

/** Independent exact interpreter in one quadratic field: p + q√m, with rational p,q.
 * Each rational operation uses RefCalc. No floating-point root oracle is involved.
 */
export async function symbolicCompare(eq: Equation, env: Map<string, Rational>): Promise<number> {
	const a = new Arithmetic(new RefCalc());
	type Surd = { p: Rational; q: Rational };
	let basis: Rational | undefined;
	const rational = (p: Rational): Surd => ({ p, q: integer(0n) });
	const add = async (l: Surd, r: Surd, minus = false): Promise<Surd> => ({
		p: await a.add(l.p, r.p, minus),
		q: await a.add(l.q, r.q, minus)
	});
	const mul = async (l: Surd, r: Surd): Promise<Surd> => ({
		p: await a.add(await a.mul(l.p, r.p), await a.mul(await a.mul(l.q, r.q), basis ?? integer(0n))),
		q: await a.add(await a.mul(l.p, r.q), await a.mul(l.q, r.p))
	});
	const evaluate = async (e: Expr): Promise<Surd> => {
		if (e.kind === 'number' || e.kind === 'name')
			return rational(await a.evaluate(e, env, { exact: true }));
		if (e.kind === 'unary') {
			const v = await evaluate(e.value);
			if (e.op === '-') return { p: { ...v.p, n: -v.p.n }, q: { ...v.q, n: -v.q.n } };
			if (e.op === '+') return v;
			if (v.q.n !== 0n) throw new Error('Nested irrational square root in proof');
			const [n, d] = await a.calc.wave([() => a.calc.isqrt(v.p.n), () => a.calc.isqrt(v.p.d)]);
			if (n.rem === 0n && d.rem === 0n) return rational(await a.fraction(n.root, d.root));
			if (!basis) {
				basis = v.p;
				return { p: integer(0n), q: integer(1n) };
			}
			return { p: integer(0n), q: await a.sqrt(await a.div(v.p, basis), undefined, true) };
		}
		const l = await evaluate(e.left);
		if (e.kind === 'binary' && e.op === '^') {
			const exponent = Number((e.right as { text: string }).text);
			let value = rational(integer(1n));
			for (let i = 0; i < exponent; i++) value = await mul(value, l);
			return value;
		}
		const r = await evaluate(e.right);
		if (e.kind === 'gcd') return rational(integer(await a.gcd(l.p.n, r.p.n)));
		if (e.op === '+' || e.op === '-') return add(l, r, e.op === '-');
		if (e.op === '*') return mul(l, r);
		const conjugate = { p: r.p, q: { ...r.q, n: -r.q.n } },
			den = await mul(r, conjugate),
			numerator = await mul(l, conjugate);
		if (den.q.n !== 0n) throw new Error('Non-rational norm');
		return { p: await a.div(numerator.p, den.p), q: await a.div(numerator.q, den.p) };
	};
	const left = await evaluate(eq.left),
		right = await evaluate(eq.right);
	const diff = await add(left, right, true),
		P = diff.p.n,
		Q = diff.q.n;
	if (Q === 0n) return P === 0n ? 0 : P < 0n ? -1 : 1;
	if (P === 0n || P < 0n === Q < 0n) return Q < 0n ? -1 : 1;
	const squareDifference = await a.add(
		await a.mul(diff.p, diff.p),
		await a.mul(await a.mul(diff.q, diff.q), basis!),
		true
	);
	if (squareDifference.n === 0n) return 0;
	return squareDifference.n > 0n ? (P < 0n ? -1 : 1) : Q < 0n ? -1 : 1;
}
export function hasRadical(e: Expr): boolean {
	if (e.kind === 'number' || e.kind === 'name') return false;
	if (e.kind === 'unary') return e.op === 'sqrt' || hasRadical(e.value);
	return hasRadical(e.left) || hasRadical(e.right);
}

export async function symbolicEqual(eq: Equation, env: Map<string, Rational>): Promise<boolean> {
	return (await symbolicCompare(eq, env)) === 0;
}
