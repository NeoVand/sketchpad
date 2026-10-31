import { Arithmetic, CheckFailed, flip, magnitude } from './arithmetic';
import { binary, DerivationBuilder, literal, negate, num, type Quantity } from './derivation';
import type { Expr, Equation } from './parse';
import type { RootCheck } from './algebra';

export interface RadicalPair {
	p: Quantity;
	q: Quantity;
	m: Quantity;
	d: Quantity;
}
export interface RadicalValue {
	p: bigint;
	q: bigint;
	m: bigint;
	d: bigint;
}
const sqrt = (value: Expr): Expr => ({ kind: 'unary', op: 'sqrt', value });
const eq = (left: Expr, right: Expr): Equation => ({ left, right });
const primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];
export const radicalValue = (r: RadicalPair): RadicalValue => ({
	p: r.p.value.n,
	q: r.q.value.n,
	m: r.m.value.n,
	d: r.d.value.n
});
export function rootExpressions(b: DerivationBuilder, pair: RadicalPair): Expr[] {
	const { p, q, m, d } = pair;
	const radical = q.value.n === 1n ? sqrt(b.expr(m)) : binary('*', b.expr(q), sqrt(b.expr(m)));
	return [-1, 1].map((sign) => {
		const numerator =
			p.value.n === 0n
				? sign < 0
					? { kind: 'unary' as const, op: '-' as const, value: radical }
					: radical
				: binary(sign < 0 ? '-' : '+', b.expr(p), radical);
		return d.value.n === 1n ? numerator : binary('/', numerator, b.expr(d));
	});
}
function pairTex(b: DerivationBuilder, pair: RadicalPair, r: (e: Expr) => string): string {
	const { p, q, m, d } = pair;
	const term = (q.value.n === 1n ? '' : r(b.expr(q))) + `\\sqrt{${r(b.expr(m))}}`;
	const numerator = (p.value.n === 0n ? '' : r(b.expr(p)) + ' ') + `\\pm ${term}`;
	return d.value.n === 1n ? numerator : `\\frac{${numerator}}{${r(b.expr(d))}}`;
}
function pairText(pair: RadicalPair): string {
	const { p, q, m, d } = radicalValue(pair);
	const inside = (p === 0n ? '' : String(p) + ' ') + `± ${q === 1n ? '' : q}√${m}`;
	return (d === 1n ? inside : `(${inside})/${d}`).replaceAll('-', '−');
}
/** Bound only the trial schedule; all square/division/factor digits come from Calc. */
export async function simplifyRadical(
	b: DerivationBuilder,
	D: Quantity,
	bound: Quantity,
	boundSquare?: Quantity
): Promise<{ s: Quantity; m: Quantity; square: Quantity }> {
	let m = D,
		s = literal(1n);
	const limit = bound;
	let extractedSquare: Quantity | undefined;
	// Preselect the small-D schedule using the integer square root already computed.
	// The prior loop stopped at this same bound: this removes no Calc calls on those inputs.
	const trials = D.value.n < 10000n ? primes.filter((p) => BigInt(p) <= limit.value.n) : primes;
	for (const k of trials) {
		if (BigInt(k) > limit.value.n) break;
		const trial = literal(BigInt(k)),
			square = BigInt(k) === bound.value.n && boundSquare ? boundSquare : await b.mul(trial, trial);
		if (square.value.n > m.value.n) break;
		for (;;) {
			let remainder = 0n;
			const quotient = await b.int(
				async (c) => {
					const result = await c.divmod(m.value.n, square.value.n);
					remainder = result.r;
					return result.q;
				},
				[m, square]
			);
			if (remainder !== 0n) break;
			m = quotient;
			s = await b.mul(s, trial);
			extractedSquare = s.value.n === trial.value.n ? square : undefined;
			if (square.value.n > m.value.n) break;
		}
	}
	const square = extractedSquare ?? (await b.mul(s, s)),
		restored = await b.mul(square, m);
	if (restored.value.n !== D.value.n) throw new CheckFailed('Radical simplification failed');
	const original = sqrt(b.expr(D)),
		extracted = s.value.n === 1n ? sqrt(b.expr(m)) : binary('*', b.expr(s), sqrt(b.expr(m)));
	if (s.value.n !== 1n)
		b.line(
			'formula',
			(r) =>
				`${r(original)} = ${r(sqrt(binary('*', b.expr(square), b.expr(m))))} = ${r(extracted)}`,
			{
				identities: [eq(original, extracted), eq(binary('*', b.expr(square), b.expr(m)), b.expr(D))]
			}
		);
	return { s, m, square };
}
/** Check the actual reduced pair, not merely the unreduced formula that generated it. */
export async function checkRadicalPair(
	b: DerivationBuilder,
	cs: Quantity[],
	pair: RadicalPair
): Promise<RootCheck> {
	const [c, bb, a] = cs,
		{ p, q, m, d } = pair;
	if (
		[...cs, p, q, m, d].some((v) => v.value.d !== 1n) ||
		a.value.n === 0n ||
		d.value.n <= 0n ||
		q.value.n <= 0n ||
		m.value.n <= 0n
	)
		throw new CheckFailed('Invalid radical pair');
	const [twop, p2, q2, d2] = await b.trace.wave([
		() => b.add(p, p),
		() => b.mul(p, p),
		() => b.mul(q, q),
		() => b.mul(d, d)
	]);
	const q2m = await b.mul(q2, m),
		numerator = await b.add(p2, q2m, true);
	const [sumLeft, sumRight, productLeft, productRight] = await b.trace.wave([
		() => b.mul(a, twop),
		() => b.mul(negate(bb), d),
		() => b.mul(a, numerator),
		() => b.mul(c, d2)
	]);
	if (sumLeft.value.n !== sumRight.value.n || productLeft.value.n !== productRight.value.n)
		throw new CheckFailed('Vieta check failed for the proposed radical pair');

	const roots = rootExpressions(b, pair),
		sumExpr = binary('+', roots[0], roots[1]),
		prodExpr = binary('*', roots[0], roots[1]);
	const fraction = (n: Expr, d: Quantity) => (d.value.n === 1n ? n : binary('/', n, b.expr(d)));
	const productFormula = fraction(
		binary(
			'-',
			binary('^', b.expr(p), num(2n)),
			q2.value.n === 1n ? b.expr(m) : binary('*', b.expr(q2), b.expr(m))
		),
		d2
	);
	const expectedSum = fraction(b.expr(negate(bb)), a),
		expectedProduct = fraction(b.expr(c), a);
	b.line(
		'check',
		(r) =>
			`x_1+x_2 = ${r(expectedSum)},\\quad x_1x_2 = ${r(productFormula)} = ${r(expectedProduct)}\\quad\\checkmark`,
		{
			identities: [
				eq(sumExpr, expectedSum),
				eq(prodExpr, productFormula),
				eq(productFormula, expectedProduct)
			]
		},
		'Exact Vieta check of the reduced pair'
	);
	return { kind: 'vieta', mode: b.mode, passed: true };
}
/** Decimal scaling copies digits; rounding and division are Calc operations. No bracket claim. */
async function approximate(
	b: DerivationBuilder,
	pair: RadicalPair
): Promise<{ quantity: Quantity; digits: number }[]> {
	const { p, q, m, d } = pair;
	const digits =
		5 +
		Math.max(
			0,
			magnitude(q.value.n).toString().length -
				magnitude(d.value.n).toString().length +
				(q.value.n > d.value.n ? 1 : 0)
		);
	const scaled = BigInt(m.value.n.toString() + '0'.repeat(2 * digits));
	const sr = await b.int(async (c) => (await c.isqrt(scaled)).root, [m]);
	const offset = await b.mul(q, sr),
		base = literal(BigInt(p.value.n.toString() + '0'.repeat(digits)));
	const rounded = async (n: Quantity): Promise<{ quantity: Quantity; digits: number }> => {
		const quotient =
			d.value.n === 1n
				? n
				: await b.int(
						async (c) => {
							const r = await c.divmod(magnitude(n.value.n), d.value.n);
							return n.value.n < 0n ? flip(r.q) : r.q;
						},
						[n, d]
					);
		const text = magnitude(quotient.value.n)
				.toString()
				.padStart(digits + 1, '0'),
			cut = digits - 4;
		// Dropping decimal digits is layout. The increment for rounding is a Calc addition.
		if (text.at(-cut)! < '5') return { quantity: quotient, digits };
		const whole = BigInt(text.slice(0, -cut));
		const incremented = await b.int((c) => c.add(whole, 1n), [quotient]);
		return { quantity: quotient.value.n < 0n ? negate(incremented) : incremented, digits: 4 };
	};
	if (p.value.n === 0n) {
		const positive = await rounded(offset);
		return [{ ...positive, quantity: negate(positive.quantity) }, positive];
	}

	return b.trace.wave(
		[-1, 1].map((sign) => async () => rounded(await b.add(base, offset, sign < 0)))
	);
}
export async function irrationalRoots(
	b: DerivationBuilder,
	cs: Quantity[],
	D: Quantity,
	den: Quantity,
	bound: Quantity,
	boundSquare?: Quantity
) {
	const { s, m } = await simplifyRadical(b, D, bound, boundSquare),
		bb = cs[1];
	const g =
		s.value.n === 1n
			? literal(1n)
			: await b.int(
					async (calc) => {
						const ar = new Arithmetic(calc);
						return bb.value.n === 0n
							? ar.gcd(s.value.n, den.value.n)
							: ar.gcd(await ar.gcd(bb.value.n, s.value.n), den.value.n);
					},
					[bb, s, den]
				);
	let p = negate(bb),
		q = s,
		d = den;
	if (g.value.n !== 1n)
		[p, q, d] = await b.trace.wave(
			[p, q, d].map(
				(v) => () =>
					v.value.n === 0n
						? Promise.resolve(v)
						: v.value.n === g.value.n
							? Promise.resolve(literal(1n))
							: b.int((c) => new Arithmetic(c).exact(v.value.n, g.value.n), [v, g])
			)
		);

	if (d.value.n < 0n) {
		p = negate(p);
		d = negate(d);
	}
	const pair = { p, q, m, d },
		roots = rootExpressions(b, pair);
	const original = { p: negate(bb), q: s, m, d: den };
	const originals = rootExpressions(b, original);
	b.line(
		'divide',
		(r) =>
			`x = ${pairTex(b, original, r)}${b.plain(originals[0]) === b.plain(roots[0]) ? '' : ` = ${pairTex(b, pair, r)}`}`,
		{ identities: originals.map((v, i) => eq(v, roots[den.value.n < 0n ? 1 - i : i])) }
	);
	const check = await checkRadicalPair(b, cs, pair);
	b.line('result', (r) => `x = ${pairTex(b, pair, r)}`, {
		identities: [
			eq(binary('+', roots[0], roots[1]), binary('/', b.expr(negate(bb)), b.expr(cs[2])))
		]
	});
	if (b.approximate)
		b.pendingApproximations.push(async () => {
			const approximations = await approximate(b, pair);
			const shown = approximations.map((v) => b.decimalExpr(v.quantity, v.digits, 4));
			b.line(
				'approximation',
				(r) => `x \\approx ${p.value.n === 0n ? `\\pm ${r(shown[1])}` : shown.map(r).join(',\\;')}`,
				{
					radicalApproximation: { exact: roots, displayed: shown }
				},
				'Rounded display; the preceding radical answer is exact'
			);
			const display = shown.map((v) => b.plain(v).replaceAll('-', '−'));
			return ` ≈ ${p.value.n === 0n ? '± ' + display[1] : display.join(', ')}`;
		});
	return {
		roots: [],
		checks: [check],
		radicals: radicalValue(pair),
		text: `x = ${pairText(pair)}`
	};
}
