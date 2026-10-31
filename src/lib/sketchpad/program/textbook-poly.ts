import { Arithmetic, CheckFailed, integer, type Environment } from './arithmetic';
import { degree, exponent, type Equation, type Expr } from './parse';
import {
	binary,
	DerivationBuilder,
	literal,
	negate,
	num,
	variable,
	type Quantity
} from './derivation';
export interface Term {
	coefficient: Quantity;
	powers: number[];
}
interface Plan {
	factors: Expr[];
	powers: number[];
	negative: boolean;
}
export interface Normalized {
	expanded: Expr;
	evaluated: Expr;
	collected: Expr;
	terms: Term[];
	products: Equation[];
	sums: Equation[];
}
const zeros = () => [0, 0, 0];
const key = (p: number[]) => p.join(',');
export const monomial = (powers: number[]): Expr | undefined => {
	let expression: Expr | undefined;
	powers.forEach((p, i) => {
		if (p) {
			const v =
				p === 1
					? variable(['x', 'y', 'z'][i])
					: binary('^', variable(['x', 'y', 'z'][i]), num(String(p)));
			expression = expression ? binary('*', expression, v) : v;
		}
	});
	return expression;
};
export function termExpr(b: DerivationBuilder, t: Term): Expr {
	const v = monomial(t.powers),
		c = t.coefficient;
	if (!v) return b.expr(c);
	if (c.value.d === 1n && c.value.n === 1n) return v;
	if (c.value.d === 1n && c.value.n === -1n) return { kind: 'unary', op: '-', value: v };
	return binary('*', b.expr(c), v);
}
export function polynomial(b: DerivationBuilder, terms: Term[]): Expr {
	const present = terms.filter((t) => t.coefficient.value.n !== 0n);
	if (!present.length)
		return b.expr(terms.find((t) => t.coefficient.value.n === 0n)?.coefficient ?? literal(0n));
	let expression = termExpr(b, present[0]);
	for (const t of present.slice(1))
		expression =
			t.coefficient.value.n < 0n
				? binary('-', expression, termExpr(b, { ...t, coefficient: negate(t.coefficient) }))
				: binary('+', expression, termExpr(b, t));
	return expression;
}
export function coefficient(terms: Term[], powers: number[]): Quantity {
	return terms.find((t) => key(t.powers) === key(powers))?.coefficient ?? literal(0n);
}
export function row(terms: Term[], d: number): Quantity[] {
	return Array.from({ length: d + 1 }, (_, i) => coefficient(terms, [i, 0, 0]));
}
async function collect(
	b: DerivationBuilder,
	terms: Term[]
): Promise<{ terms: Term[]; sums: Equation[] }> {
	const groups = new Map<string, Term[]>();
	for (const t of terms) {
		const k = key(t.powers);
		groups.set(k, [...(groups.get(k) ?? []), t]);
	}
	const collected = await b.trace.wave(
		[...groups.values()].map((group) => async () => {
			let q = group[0].coefficient;
			const sums: Equation[] = [];
			for (const t of group.slice(1)) {
				const old = q;
				q = await b.add(q, t.coefficient);
				sums.push({ left: binary('+', b.expr(old), b.expr(t.coefficient)), right: b.expr(q) });
			}
			return { term: { coefficient: q, powers: group[0].powers }, sums };
		})
	);
	const result = collected
		.map((v) => v.term)
		.sort((a, c) => {
			for (let i = 0; i < 3; i++) if (a.powers[i] !== c.powers[i]) return c.powers[i] - a.powers[i];
			return 0;
		});
	return { terms: result, sums: collected.flatMap((v) => v.sums) };
}
function planCoefficient(p: Plan): Expr {
	const expr = p.factors.length ? p.factors.reduce((a, c) => binary('*', a, c)) : num(1n);
	return p.negative ? { kind: 'unary', op: '-', value: expr } : expr;
}
function planExpr(p: Plan): Expr {
	const c = planCoefficient(p),
		v = monomial(p.powers);
	if (!v) return c;
	if (
		!p.factors.length ||
		(p.factors.length === 1 && p.factors[0].kind === 'number' && p.factors[0].text === '1')
	)
		return p.negative ? { kind: 'unary', op: '-', value: v } : v;
	const product = binary('*', p.negative ? planCoefficient({ ...p, negative: false }) : c, v);
	return p.negative ? { kind: 'unary', op: '-', value: product } : product;
}
const sumExpr = (terms: Expr[]) =>
	terms.length ? terms.reduce((a, c) => binary('+', a, c)) : num(0n);
function multiplyPlans(a: Plan[], c: Plan[]): Plan[] {
	return a.flatMap((t) =>
		c.map((u) => ({
			factors: [...t.factors, ...u.factors],
			powers: t.powers.map((v, i) => v + u.powers[i]),
			negative: t.negative !== u.negative
		}))
	);
}
async function pascal(b: DerivationBuilder, n: number): Promise<Quantity[]> {
	let values = [literal(1n)];
	for (let i = 1; i <= n; i++)
		values = [
			literal(1n),
			...(await b.trace.wave(values.slice(1).map((v, j) => () => b.add(values[j], v)))),
			literal(1n)
		];
	return values;
}
async function powers(b: DerivationBuilder, q: Quantity, n: number): Promise<Quantity[]> {
	const values = [literal(1n)];
	if (n) values.push(q);
	for (let i = 2; i <= n; i++) values.push(await b.mul(values.at(-1)!, q));
	return values;
}
async function binomial(
	b: DerivationBuilder,
	e: Extract<Expr, { kind: 'binary' }>,
	env: Environment
): Promise<Term[]> {
	const base = await normalize(e.left, b, env),
		n = exponent(e.right),
		aa = coefficient(base.terms, [1, 0, 0]),
		bb = coefficient(base.terms, zeros());
	// The measured Pascal implementation uses fewer rows for every permitted exponent (0..12).
	const choose = await pascal(b, n);
	const symbolic = Array.from({ length: n + 1 }, (_, j) => {
		const i = n - j,
			parts: Expr[] = [];
		if (choose[j].value.n !== 1n) parts.push(b.expr(choose[j]));
		if (i && aa.value.n !== 1n)
			parts.push(i === 1 ? b.expr(aa) : binary('^', b.expr(aa), num(String(i))));
		if (j && !(bb.value.n === 1n && bb.value.d === 1n))
			parts.push(j === 1 ? b.expr(bb) : binary('^', b.expr(bb), num(String(j))));
		const variablePart = monomial([i, 0, 0]);
		if (variablePart) parts.push(variablePart);
		return parts.length ? parts.reduce((a, c) => binary('*', a, c)) : num(1n);
	});
	const theorem = sumExpr(symbolic);
	b.identity('expand', e, theorem, "Binomial theorem; coefficients from Pascal's additions");
	const [ap, bp] = await b.trace.wave([() => powers(b, aa, n), () => powers(b, bb, n)]);
	const productExpressions = Array.from({ length: n + 1 }, (_, j) => {
		const i = n - j,
			qs = [choose[j], ap[i], bp[j]].filter((q) => q.value.n !== 1n || q.value.d !== 1n);
		const m = monomial([i, 0, 0]),
			parts = qs.map((q) => b.expr(q));
		if (m) parts.push(m);
		return parts.length ? parts.reduce((a, c) => binary('*', a, c)) : num(1n);
	});
	const evaluated = sumExpr(productExpressions);
	if (b.plain(theorem) !== b.plain(evaluated))
		b.identity('evaluate', theorem, evaluated, 'Evaluate the powers');
	const terms = await b.trace.wave(
		Array.from({ length: n + 1 }, (_, j) => async () => ({
			coefficient: await b.mul(await b.mul(choose[j], ap[n - j]), bp[j]),
			powers: [n - j, 0, 0]
		}))
	);
	const final = polynomial(b, terms);
	if (b.plain(evaluated) !== b.plain(final))
		b.identity('evaluate', evaluated, final, 'Multiply the coefficients');
	return terms;
}
async function plans(e: Expr, b: DerivationBuilder, env: Environment): Promise<Plan[]> {
	if (e.kind === 'binary' && e.op === '^' && exponent(e.right) === 0)
		return [{ factors: [num(1n)], powers: zeros(), negative: false }];
	if (e.kind === 'name' && ['x', 'y', 'z'].includes(e.name)) {
		const p = zeros();
		p[['x', 'y', 'z'].indexOf(e.name)] = 1;
		return [{ factors: [], powers: p, negative: false }];
	}
	if (degree(e, ['x', 'y', 'z']) === 0) return [{ factors: [e], powers: zeros(), negative: false }];
	if (e.kind === 'unary') {
		const inner = await plans(e.value, b, env);
		return e.op === '-' ? inner.map((t) => ({ ...t, negative: !t.negative })) : inner;
	}
	if (e.kind !== 'binary') throw new Error('Unsupported polynomial structure');
	if (e.op === '^') {
		const n = exponent(e.right);
		if (n === 0) return [{ factors: [num(1n)], powers: zeros(), negative: false }];
		if (n === 1) return plans(e.left, b, env);
		if (e.left.kind === 'name' && ['x', 'y', 'z'].includes(e.left.name)) {
			const p = zeros();
			p[['x', 'y', 'z'].indexOf(e.left.name)] = n;
			return [{ factors: [], powers: p, negative: false }];
		}
		if (degree(e.left) === 1 && !containsOtherUnknown(e.left)) {
			return (await binomial(b, e, env))
				.filter((t) => t.coefficient.value.n !== 0n)
				.map((t) => ({
					factors: [b.expr(t.coefficient)],
					powers: t.powers,
					negative: false
				}));
		}
		// Collect between products so a general power does not create an exponential term list.
		const base = await normalize(e.left, b, env);
		let result = base.terms;
		for (let i = 1; i < n; i++) {
			const products = await b.trace.wave(
				result.flatMap((t) =>
					base.terms.map((u) => async () => ({
						coefficient: await b.mul(t.coefficient, u.coefficient),
						powers: t.powers.map((v, j) => v + u.powers[j])
					}))
				)
			);
			const before = binary('*', polynomial(b, result), base.collected),
				collected = await collect(b, products);
			b.identity('expand', before, polynomial(b, products), 'Distribute each term');
			b.identity(
				'collect',
				polynomial(b, products),
				polynomial(b, collected.terms),
				'Collect like powers'
			);
			result = collected.terms;
		}
		return result.map((t) => ({
			factors: [b.expr(t.coefficient)],
			powers: t.powers,
			negative: false
		}));
	}
	if (e.op === '/') {
		const left = await plans(e.left, b, env);
		return left.map((t) => ({
			...t,
			factors: [binary('/', planCoefficient({ ...t, negative: false }), e.right)]
		}));
	}
	const [left, right] = await b.trace.wave([
		() => plans(e.left, b, env),
		() => plans(e.right, b, env)
	]);
	if (e.op === '*') return multiplyPlans(left, right);
	return [...left, ...right.map((t) => (e.op === '-' ? { ...t, negative: !t.negative } : t))];
}
function containsOtherUnknown(e: Expr): boolean {
	if (e.kind === 'name') return e.name === 'y' || e.name === 'z';
	if (e.kind === 'number') return false;
	if (e.kind === 'unary') return containsOtherUnknown(e.value);
	return containsOtherUnknown(e.left) || containsOtherUnknown(e.right);
}
function copyZeroPowers(e: Expr): Expr {
	if (e.kind === 'number' || e.kind === 'name') return e;
	if (e.kind === 'unary') return { ...e, value: copyZeroPowers(e.value) };
	if (e.kind === 'binary' && e.op === '^' && exponent(e.right) === 0) return num(1n);
	return { ...e, left: copyZeroPowers(e.left), right: copyZeroPowers(e.right) };
}
export async function normalize(
	e: Expr,
	b: DerivationBuilder,
	env: Environment = b.env
): Promise<Normalized> {
	const structure = await plans(copyZeroPowers(e), b, env),
		expanded = sumExpr(structure.map(planExpr));
	const evaluated = await b.trace.wave(
		structure.map((p) => async () => {
			const expr = planCoefficient(p);
			const coefficient = await b.compute(
				(a) => a.evaluate(expr, env, { exact: true }),
				b.inputs(expr)
			);
			if (coefficient.value.approximate)
				throw new CheckFailed('Approximate named value in an exact equation');
			return {
				term: { coefficient, powers: p.powers },
				product: { left: expr, right: b.expr(coefficient) }
			};
		})
	);
	const terms = evaluated.map((v) => v.term),
		collected = await collect(b, terms);
	return {
		expanded,
		evaluated: polynomial(b, terms),
		collected: polynomial(b, collected.terms),
		terms: collected.terms,
		products: evaluated
			.map((v) => v.product)
			.filter((eq) => b.plain(eq.left) !== b.plain(eq.right)),
		sums: collected.sums
	};
}
export async function normalizeEquation(
	eq: Equation,
	b: DerivationBuilder
): Promise<{ left: Normalized; right: Normalized; equation: Equation }> {
	b.equation('given', eq);
	const [left, right] = await b.trace.wave([
		() => normalize(eq.left, b),
		() => normalize(eq.right, b)
	]);
	let previous = eq;
	for (const phase of ['expanded', 'evaluated', 'collected'] as const) {
		const next = { left: left[phase], right: right[phase] };
		const notes =
			phase === 'evaluated'
				? [...left.products, ...right.products]
				: phase === 'collected'
					? [...left.sums, ...right.sums]
					: [];
		if (
			b.plain(next.left) !== b.plain(previous.left) ||
			b.plain(next.right) !== b.plain(previous.right)
		) {
			b.equation(
				phase === 'expanded' ? 'expand' : phase === 'evaluated' ? 'evaluate' : 'collect',
				next,
				previous,
				num(1n),
				notes.length
					? (r) => notes.map((eq) => `${r(eq.left)} = ${r(eq.right)}`).join(',\\quad ')
					: undefined
			);
			// Notes are numeric identities too, and are checked independently.
			b.derivation.lines.at(-1)!.identities.push(...notes);
		}
		previous = next;
	}
	// An independent substitution guards collection before the light root check trusts it.
	// This is a guard, not a new solving step; it preserves the previous recovery confirmation.
	const env = new Map(b.env);
	for (const name of ['x', 'y', 'z']) env.set(name, integer(1n));
	const a = new Arithmetic(b.trace);
	const atOnes = async (terms: Term[]) => {
		let value = terms[0]?.coefficient.value ?? integer(0n);
		for (const term of terms.slice(1)) value = await a.add(value, term.coefficient.value);
		return value;
	};
	const values = await b.trace.wave([
		() => a.evaluate(eq.left, env, { exact: true }),
		() => a.evaluate(eq.right, env, { exact: true }),
		() => atOnes(left.terms),
		() => atOnes(right.terms)
	]);
	if (!(await a.equal(values[0], values[2])) || !(await a.equal(values[1], values[3])))
		throw new CheckFailed('Collected equation does not match the typed equation');
	return { left, right, equation: previous };
}
