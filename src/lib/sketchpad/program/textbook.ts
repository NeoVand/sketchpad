import { irrationalRoots, type RadicalValue } from './radicals';
import { Arithmetic, CheckFailed, flip, integer, magnitude } from './arithmetic';
import {
	assertIntegerPolynomial,
	bracket,
	integerHorner,
	polynomialText,
	type AlgebraResult,
	type RootCheck
} from './algebra';
import {
	binary,
	DerivationBuilder,
	literal,
	negate,
	num,
	residual,
	variable,
	type Quantity
} from './derivation';
import { degree, type Equation, type Expr } from './parse';
import {
	coefficient,
	normalize,
	normalizeEquation,
	polynomial,
	row,
	type Term
} from './textbook-poly';
const empty = (): AlgebraResult => ({ text: '', roots: [], checks: [], grids: [], complete: true });
const qEq = (left: Expr, right: Expr): Equation => ({ left, right });
function substitute(e: Expr, values: Record<string, Expr>): Expr {
	if (e.kind === 'name') return values[e.name] ?? e;
	if (e.kind === 'number') return e;
	if (e.kind === 'unary') return { ...e, value: substitute(e.value, values) };
	return { ...e, left: substitute(e.left, values), right: substitute(e.right, values) };
}
export function coefficientExpr(b: DerivationBuilder, cs: Quantity[]): Expr {
	return polynomial(b, cs.map((coefficient, i) => ({ coefficient, powers: [i, 0, 0] })).reverse());
}
export async function integerCoefficients(
	b: DerivationBuilder,
	cs: Quantity[]
): Promise<{ coefficients: Quantity[]; scale: Quantity }> {
	let scale = literal(1n);
	for (const c of cs)
		if (c.value.d !== 1n) scale = await b.mul(scale, { value: integer(c.value.d), n: c.d });
	const coefficients = await b.trace.wave(
		cs.map((c) => async () => {
			if (scale.value.n === 1n) return c;
			const factor = await b.int(
				(calc) => new Arithmetic(calc).exact(scale.value.n, c.value.d),
				[scale, c]
			);
			return b.int((calc) => calc.mul(c.value.n, factor.value.n), [c, factor]);
		})
	);
	return { coefficients, scale };
}
export async function verifyRoot(
	b: DerivationBuilder,
	eq: Equation,
	cs: Quantity[],
	root: Quantity
): Promise<RootCheck> {
	const point = { x: root.value },
		replace = { x: b.expr(root) };
	if (b.mode === 'light') {
		const value = await b.int(
			(calc) =>
				integerHorner(
					new Arithmetic(calc),
					cs.map((c) => c.value.n),
					root.value
				),
			[...cs, root]
		);
		const expression = coefficientExpr(b, cs),
			at = substitute(expression, replace);
		if (value.value.n !== 0n)
			throw new CheckFailed(
				'Root does not satisfy collected coefficients',
				`${b.plain(at)} = ${b.plain(b.expr(value))} \\neq 0`
			);
		b.line(
			'check',
			(r) => `${r(at)} = ${r(b.expr(value))}\\quad\\checkmark`,
			{
				identities: [qEq(at, b.expr(value))],
				roots: [{ equation: qEq(expression, num(0n)), point }]
			},
			'Substitute into the collected equation'
		);
		return { kind: 'horner', mode: 'light', passed: true, root: root.value };
	}
	const env = new Map(b.env);
	env.set('x', root.value);
	const [left, right] = await b.trace.wave([
		() => b.compute((a) => a.evaluate(eq.left, env, { exact: true }), [root]),
		() => b.compute((a) => a.evaluate(eq.right, env, { exact: true }), [root])
	]);
	const lhs = substitute(eq.left, replace),
		rhs = substitute(eq.right, replace);
	if (!(await new Arithmetic(b.trace).equal(left.value, right.value)))
		throw new CheckFailed(
			'Root does not satisfy the typed equation',
			`${b.plain(lhs)} = ${b.plain(b.expr(left))} \\neq ${b.plain(b.expr(right))} = ${b.plain(rhs)}`
		);
	b.line(
		'check',
		(r) =>
			`${r(lhs)} = ${r(b.expr(left))}${b.plain(rhs) === b.plain(b.expr(left)) ? '' : ` = ${r(rhs)}`}\\quad\\checkmark`,
		{
			identities: [qEq(lhs, b.expr(left)), qEq(b.expr(left), rhs)],
			roots: [{ equation: eq, point }]
		},
		'Substitute into both typed sides'
	);
	return { kind: 'substitution', mode: 'strong', passed: true, root: root.value };
}
async function resultRoots(
	b: DerivationBuilder,
	eq: Equation,
	cs: Quantity[],
	roots: Quantity[]
): Promise<AlgebraResult> {
	const result = empty();
	// Keep root/check lines in mathematical order; independent arithmetic inside each check still waves.
	for (const root of roots) result.checks.push(await verifyRoot(b, eq, cs, root));
	result.roots = roots.map((r) => r.value);
	const text = await b.trace.wave(
		roots.map((root) => () => new Arithmetic(b.trace).rootText(root.value))
	);
	result.text = `x = ${text.join(', ')}`;
	b.line('result', (r) => `x = ${roots.map((root) => r(b.expr(root))).join(',\\;')}`, {
		roots: roots.map((root) => ({
			equation: qEq(coefficientExpr(b, cs), num(0n)),
			point: { x: root.value }
		}))
	});
	return result;
}
/** Shared numerical formula on a collected integer polynomial. */
export async function formulaRoots(
	b: DerivationBuilder,
	cs: Quantity[],
	eq: Equation,
	showLinear = true,
	checkCoefficients = cs
): Promise<{ roots: Quantity[]; checks: RootCheck[]; text?: string; radicals?: RadicalValue }> {
	while (cs.length > 1 && cs.at(-1)!.value.n === 0n) cs = cs.slice(0, -1);
	if (cs.length === 1) {
		const text = cs[0].value.n === 0n ? 'every x' : 'no solution';
		b.line('result', () => `\\text{${text}}`, {
			conditions: [
				{ expression: b.expr(cs[0]), relation: cs[0].value.n === 0n ? 'zero' : 'nonzero' }
			]
		});
		return { roots: [], checks: [], text };
	}
	if (cs.length === 2) {
		const root = await b.div(negate(cs[0]), cs[1]);
		if (showLinear)
			b.equation(
				'divide',
				qEq(variable('x'), b.expr(root)),
				qEq(coefficientExpr(b, cs), num(0n)),
				b.expr(cs[1])
			);
		return { roots: [root], checks: [] };
	}
	const [c, bb, a] = cs;
	if (!a) return { roots: [], checks: [] };
	if (c.value.n === 0n) {
		const factor = binary(
			'*',
			variable('x'),
			binary('+', binary('*', b.expr(a), variable('x')), b.expr(bb))
		);
		b.identity('expand', coefficientExpr(b, cs), factor, 'Factor out x');
		const other = await b.div(negate(bb), a),
			zero = c;
		const roots =
			other.value.n === 0n
				? [zero]
				: other.value.n < 0n === a.value.n > 0n
					? [other, zero]
					: [zero, other];
		b.line(
			'divide',
			(r) =>
				`x = ${r(b.expr(zero))}\\quad\\text{or}\\quad x = ${r(binary('/', b.expr(negate(bb)), b.expr(a)))} = ${r(b.expr(other))}`,
			{
				roots: roots.map((root) => ({
					equation: qEq(coefficientExpr(b, cs), num(0n)),
					point: { x: root.value }
				}))
			}
		);
		return { roots, checks: [] };
	}
	const [square, fourac, den] = await b.trace.wave([
		() => b.mul(bb, bb),
		async () => b.mul(await b.mul(literal(4n), a), c),
		() => b.mul(literal(2n), a)
	]);
	const disc = await b.add(square, fourac, true);
	const discExpr = binary(
		'-',
		binary('^', b.expr(bb), num(2n)),
		binary('*', binary('*', num(4n), b.expr(a)), b.expr(c))
	);
	b.identity('formula', discExpr, b.expr(disc), 'Discriminant: b² − 4ac');
	if (disc.value.n < 0n) {
		b.line('result', () => '\\text{No real roots}', {
			conditions: [{ expression: b.expr(disc), relation: 'negative' }]
		});
		return { roots: [], checks: [], text: 'no real roots' };
	}
	const sqrt = await b.compute(
		async (a) => {
			const r = await a.calc.isqrt(disc.value.n);
			return integer(r.root);
		},
		[disc]
	);
	// Determine exactness through the defining square, not native arithmetic or a hidden oracle.
	const squared = await b.mul(sqrt, sqrt);
	const exact = squared.value.n === disc.value.n;
	if (exact) {
		b.identity('formula', { kind: 'unary', op: 'sqrt', value: b.expr(disc) }, b.expr(sqrt));
		const roots: Quantity[] = [];
		for (const sign of sqrt.value.n === 0n ? [-1] : [-1, 1]) {
			const numerator = await b.add(negate(bb), sqrt, sign < 0),
				root = await b.div(numerator, den);
			const expr = binary(
				'/',
				binary(sign < 0 ? '-' : '+', b.expr(negate(bb)), b.expr(sqrt)),
				binary('*', num(2n), b.expr(a))
			);
			b.line('divide', (r) => `x = ${r(expr)} = ${r(b.expr(root))}`, {
				identities: [qEq(expr, b.expr(root))],
				roots: [{ equation: qEq(coefficientExpr(b, cs), num(0n)), point: { x: root.value } }]
			});
			roots.push(root);
		}
		return { roots, checks: [] };
	}
	if (b.places === undefined) return irrationalRoots(b, cs, disc, den, sqrt, squared);
	const checks: RootCheck[] = [],
		bounds: string[] = [];
	const ar = new Arithmetic(b.trace, b.mode);
	// Same guarded bracket algorithm as the retained evaluation path.
	const places = 6 + magnitude(den.value.n).toString().length + 3;
	const scale = BigInt('1' + '0'.repeat(places));
	const large = await b.compute(async (a) =>
		integer(
			(await a.calc.isqrt(await a.calc.mul(disc.value.n, BigInt('1' + '0'.repeat(2 * places)))))
				.root
		)
	);
	const [base, divisor] = await b.trace.wave([
		() => b.mul(negate(bb), literal(scale)),
		() => b.mul(den, literal(scale))
	]);
	for (const sign of [-1, 1]) {
		const numerator = await b.add(base, large, sign < 0),
			candidate = await b.div(numerator, divisor);
		const check = await bracket(
			ar,
			eq,
			candidate.value,
			b.env,
			checkCoefficients.map((c) => c.value.n)
		);
		checks.push(check);
		const [lowerScaled, upperScaled] = await b.trace.wave(
			[check.lower!, check.upper!].map(
				(v) => () => b.int(async (c) => new Arithmetic(c).exact(await c.mul(v.n, 1000000n), v.d))
			)
		);
		const lowerExpr = b.decimalExpr(lowerScaled, 6),
			upperExpr = b.decimalExpr(upperScaled, 6);
		const lower = b.plain(lowerExpr),
			upper = b.plain(upperExpr);
		bounds.push(`[${lower}, ${upper}]`);
		const formula = binary(
			'/',
			binary(sign < 0 ? '-' : '+', b.expr(negate(bb)), {
				kind: 'unary',
				op: 'sqrt',
				value: b.expr(disc)
			}),
			b.expr(den)
		);
		b.line(
			'formula',
			(r) => `x = ${r(formula)}\\;\\approx\\;[${r(lowerExpr)},${r(upperExpr)}]`,
			{
				bounds: [
					{
						equation:
							b.mode === 'strong' ? eq : qEq(coefficientExpr(b, checkCoefficients), num(0n)),
						lower: check.lower!,
						upper: check.upper!
					}
				]
			},
			'Opposite signs at the two six-place bounds'
		);
	}
	return {
		roots: [],
		checks,
		text: `x = (${flip(bb.value.n)} ± √${disc.value.n})/(${den.value.n}); six-place bounds ${bounds.join(', ')}`
	};
}
export async function textbookSolve(b: DerivationBuilder, eq: Equation): Promise<AlgebraResult> {
	const normalized = await normalizeEquation(eq, b),
		d = Math.max(degree(eq.left), degree(eq.right));
	if (d > 2) return textbookFactor(b, binary('-', eq.left, eq.right), eq, normalized);
	const l = row(normalized.left.terms, d),
		r = row(normalized.right.terms, d);
	if (d <= 1) {
		const la = l[1] ?? literal(0n),
			ra = r[1] ?? literal(0n);
		// a side with nothing to move keeps its one term (no "− 0x", no "− 0"); the arithmetic below is unchanged
		const xTerm = (q: Quantity) => binary('*', b.expr(q), variable('x'));
		const move = qEq(
			ra.value.n === 0n ? xTerm(la) : binary('-', xTerm(la), xTerm(ra)),
			l[0].value.n === 0n ? b.expr(r[0]) : binary('-', b.expr(r[0]), b.expr(l[0]))
		);
		b.equation('move', move, normalized.equation);
		const [aa, bb] = await b.trace.wave([() => b.add(la, ra, true), () => b.add(r[0], l[0], true)]);
		const collected = qEq(
			aa.value.n === 1n && aa.value.d === 1n
				? variable('x')
				: binary('*', b.expr(aa), variable('x')),
			b.expr(bb)
		);
		const arithmetic = [
			qEq(binary('-', b.expr(la), b.expr(ra)), b.expr(aa)),
			qEq(binary('-', b.expr(r[0]), b.expr(l[0])), b.expr(bb))
		];
		b.equation('collect', collected, move, num(1n), (render) =>
			arithmetic.map((e) => `${render(e.left)} = ${render(e.right)}`).join(',\\quad ')
		);
		b.derivation.lines.at(-1)!.identities.push(...arithmetic);
		if (aa.value.n === 0n) {
			const result = empty();
			result.text = bb.value.n === 0n ? 'every x' : 'no solution';
			b.line('result', () => `\\text{${result.text}}`, {
				conditions: [{ expression: b.expr(bb), relation: bb.value.n === 0n ? 'zero' : 'nonzero' }]
			});
			return result;
		}
		const root = await b.div(bb, aa),
			integerRow = await integerCoefficients(b, [negate(bb), aa]);
		if (aa.value.n !== 1n || aa.value.d !== 1n)
			b.equation(
				'divide',
				qEq(variable('x'), b.expr(root)),
				collected,
				b.expr(aa),
				'Divide both sides by the coefficient of x'
			);
		const result = await resultRoots(b, eq, integerRow.coefficients, [root]);
		result.coefficients = [negate(bb).value, aa.value];
		return result;
	}
	const cs = await b.trace.wave(l.map((v, i) => () => b.add(v, r[i], true)));
	const zero = qEq(coefficientExpr(b, cs), num(0n));
	if (
		b.plain(zero.left) !== b.plain(normalized.equation.left) ||
		b.plain(zero.right) !== b.plain(normalized.equation.right)
	)
		b.equation('move', zero, normalized.equation, num(1n), 'Move all terms to the left');
	const cleared = await integerCoefficients(b, cs);
	if (cleared.scale.value.n !== 1n)
		b.equation(
			'evaluate',
			qEq(coefficientExpr(b, cleared.coefficients), num(0n)),
			zero,
			binary('/', num(1n), b.expr(cleared.scale)),
			'Clear denominators'
		);
	const numeric = await formulaRoots(b, cleared.coefficients, eq);
	if (numeric.text) {
		const result = empty();
		result.text = numeric.text;
		result.radicals = numeric.radicals;
		result.checks = numeric.checks;
		result.coefficients = cs.map((c) => c.value);
		return result;
	}
	const result = await resultRoots(b, eq, cleared.coefficients, numeric.roots);
	result.coefficients = cs.map((c) => c.value);
	return result;
}
// Factoring and systems are below; their arithmetic uses the same Quantity provenance.
async function divisors(b: DerivationBuilder, n: Quantity): Promise<Quantity[]> {
	const abs = magnitude(n.value.n);
	if (abs === 0n) return [literal(0n)];
	const limit = await b.int(async (c) => (await c.isqrt(abs)).root, [n]);
	// A declared finite candidate search, never an unstated completeness claim.
	if (limit.value.n > 10000n) throw new Error('Rational-root divisor search exceeds 10000 trials');
	const found = new Map<string, Quantity>();
	for (let i = 1; i <= Number(limit.value.n); i++) {
		const trial = literal(BigInt(i));
		let remainder = 0n;
		const quotient = await b.compute(
			async (a) => {
				const { q, r } = await a.calc.divmod(abs, trial.value.n);
				remainder = r;
				return integer(q);
			},
			[n, trial]
		);
		if (remainder === 0n) {
			found.set(String(i), trial);
			found.set(String(quotient.value.n), quotient);
		}
	}
	return [...found.values()].sort((a, c) =>
		a.value.n < c.value.n ? -1 : a.value.n > c.value.n ? 1 : 0
	);
}
async function rationalCandidates(b: DerivationBuilder, cs: Quantity[]): Promise<Quantity[]> {
	if (cs[0].value.n === 0n) return [cs[0]];
	const [ps, qs] = await b.trace.wave([() => divisors(b, cs[0]), () => divisors(b, cs.at(-1)!)]);
	const roots = ps.flatMap((p) =>
		qs.flatMap((q) => [
			{ value: { n: p.value.n, d: q.value.n }, n: p.n, d: q.n },
			{ value: { n: flip(p.value.n), d: q.value.n }, n: p.n, d: q.n }
		])
	);
	b.line(
		'formula',
		(r) => `\\text{Candidates: } ${roots.map((v) => r(b.expr(v))).join(',\\;')}`,
		{
			candidates: {
				constant: b.expr(cs[0]),
				leading: b.expr(cs.at(-1)!),
				values: roots.map((r) => r.value)
			}
		},
		'Rational root theorem: numerator divides the constant, denominator divides the leading coefficient'
	);
	return roots;
}
async function synthetic(
	b: DerivationBuilder,
	cs: Quantity[],
	root: Quantity
): Promise<Quantity[]> {
	const p = { ...root, value: integer(root.value.n) },
		q = { value: integer(root.value.d), n: root.d };
	const out: Quantity[] = Array(cs.length - 1),
		products: Quantity[] = Array(cs.length - 1);
	out[out.length - 1] = await b.div(cs.at(-1)!, q);
	for (let i = out.length - 1; i > 0; i--) {
		products[i] = await b.mul(p, out[i]);
		out[i - 1] = await b.div(await b.add(cs[i], products[i]), q);
	}
	products[0] = await b.mul(p, out[0]);
	const remainder = await b.add(cs[0], products[0]);
	if (remainder.value.n !== 0n || out.some((c) => c.value.d !== 1n))
		throw new CheckFailed('Synthetic division did not give an exact integer quotient');
	const tableOut = q.value.n === 1n ? out : await b.trace.wave(out.map((v) => () => b.mul(v, q)));
	const factor = binary(
		'-',
		q.value.n === 1n ? variable('x') : binary('*', b.expr(q), variable('x')),
		b.expr(p)
	);
	const identity = qEq(
		coefficientExpr(b, cs),
		binary('+', binary('*', factor, coefficientExpr(b, out)), b.expr(remainder))
	);
	if (cs.length > 2)
		b.line(
			'divide',
			(r) =>
				`\\begin{array}{r|${'r'.repeat(cs.length)}}${r(b.expr(root))}&${[...cs]
					.reverse()
					.map((c) => r(b.expr(c)))
					.join('&')}\\\\ & &${[...products]
					.reverse()
					.map((c) => r(b.expr(c)))
					.join('&')}\\\\\\hline &${[...tableOut]
					.reverse()
					.map((c) => r(b.expr(c)))
					.join('&')}&${r(b.expr(remainder))}\\end{array}`,
			{
				identities: [
					identity,
					...out.map((v, i) => qEq(binary('*', b.expr(v), b.expr(q)), b.expr(tableOut[i]))),
					qEq(binary('/', b.expr(cs.at(-1)!), b.expr(q)), b.expr(out.at(-1)!)),
					...products.map((v, i) => qEq(binary('*', b.expr(p), b.expr(out[i])), b.expr(v))),
					...out
						.slice(0, -1)
						.map((v, i) =>
							qEq(
								binary('/', binary('+', b.expr(cs[i + 1]), b.expr(products[i + 1])), b.expr(q)),
								b.expr(v)
							)
						),
					qEq(binary('+', b.expr(cs[0]), b.expr(products[0])), b.expr(remainder))
				]
			},
			q.value.n === 1n
				? 'Synthetic division'
				: (render) =>
						`Divide the displayed quotient by ${render(b.expr(q))} to obtain the quotient for ${render(factor)}`
		);
	if (cs.length > 2)
		b.identity(
			'divide',
			coefficientExpr(b, cs),
			out.length === 1 && out[0].value.n === 1n
				? factor
				: binary('*', factor, coefficientExpr(b, out)),
			'Zero remainder proves the factor'
		);
	return out;
}
export async function textbookFactor(
	b: DerivationBuilder,
	value: Expr,
	original?: Equation,
	ready?: Awaited<ReturnType<typeof normalizeEquation>>
): Promise<AlgebraResult> {
	if (!original) assertIntegerPolynomial(value, b.env);
	const eq = original ?? qEq(value, num(0n));
	let terms: Term[];
	if (ready) {
		const d = Math.max(degree(eq.left), degree(eq.right)),
			l = row(ready.left.terms, d),
			r = row(ready.right.terms, d);
		const cs = await b.trace.wave(l.map((c, i) => () => b.add(c, r[i], true)));
		terms = cs.map((coefficient, i) => ({ coefficient, powers: [i, 0, 0] })).reverse();
		b.equation('move', qEq(polynomial(b, terms), num(0n)), ready.equation);
	} else {
		b.line('given', (r) => r(value), { given: value });
		const normalized = await normalize(value, b);
		terms = normalized.terms;
		if (b.plain(value) !== b.plain(normalized.collected))
			b.identity('collect', value, normalized.collected);
	}
	let cs = (await integerCoefficients(b, row(terms, degree(value)))).coefficients;
	while (cs.length > 1 && cs.at(-1)!.value.n === 0n) cs.pop();
	const originalCoefficients = cs,
		result = empty();
	result.complete = false;
	result.factors = [];
	result.guesses = [];
	let radicalText: string | undefined;
	const rootQuantities: Quantity[] = [];
	while (cs.length > 1) {
		let root: Quantity | undefined;
		if (cs.length <= 3 && !(cs.length === 3 && rootQuantities.length === 0 && !original)) {
			const formula = await formulaRoots(
				b,
				cs,
				eq,
				rootQuantities.length === 0,
				originalCoefficients
			);
			if (!formula.roots.length) {
				radicalText = formula.text;
				result.radicals = formula.radicals;
				result.checks.push(...formula.checks);
				break;
			}
			root = formula.roots[0];
		} else {
			for (const candidate of await rationalCandidates(b, cs)) {
				const remainder = await b.int(
					(calc) =>
						integerHorner(
							new Arithmetic(calc),
							cs.map((c) => c.value.n),
							candidate.value
						),
					[...cs, candidate]
				);
				const at = substitute(coefficientExpr(b, cs), { x: b.expr(candidate) });
				// Horner computes a numerator scaled by q^degree; show the actual fraction value when q != 1.
				let shown = remainder;
				if (candidate.value.d !== 1n) {
					const scale = await b.compute((a) => a.pow(integer(candidate.value.d), cs.length - 1));
					shown = await b.div(remainder, scale);
				}
				b.identity(
					'evaluate',
					at,
					b.expr(shown),
					remainder.value.n === 0n ? 'A root: continue with synthetic division' : 'Not a root'
				);
				result.guesses.push({
					root: candidate.value,
					label: 'not certified',
					accepted: remainder.value.n === 0n
				});
				if (remainder.value.n === 0n) {
					root = await b.compute(
						(a) => a.fraction(candidate.value.n, candidate.value.d),
						[candidate]
					);
					break;
				}
			}
		}
		if (!root) {
			if (cs.length === 3) {
				const formula = await formulaRoots(
					b,
					cs,
					eq,
					rootQuantities.length === 0,
					originalCoefficients
				);
				radicalText = formula.text;
				result.radicals = formula.radicals;
				result.checks.push(...formula.checks);
			}
			break;
		}
		const quotient = await synthetic(b, cs, root);
		result.checks.push(await verifyRoot(b, eq, originalCoefficients, root));
		result.roots.push(root.value);
		rootQuantities.push(root);
		result.factors.push({ p: root.value.n, q: root.value.d });
		cs = quotient;
	}
	result.remaining = cs.map((c) => c.value.n);
	result.coefficients = originalCoefficients.map((c) => c.value);
	const factors = result.factors.map(({ p, q }) => `(${polynomialText([flip(p), q])})`).join('');
	const roots = await b.trace.wave(
		result.roots.map((root) => () => new Arithmetic(b.trace).rootText(root))
	);
	result.text = `proven roots: ${roots.join(', ') || 'none'}; factors ${factors || 'none'}; remaining ${polynomialText(result.remaining)}. Checks prove these roots, not that no others exist.${radicalText ? ' ' + radicalText : ''}`;
	const factorExpressions = rootQuantities.map((root) =>
		binary(
			'-',
			root.value.d === 1n
				? variable('x')
				: binary('*', b.expr({ value: integer(root.value.d), n: root.d }), variable('x')),
			b.expr({ value: integer(root.value.n), n: root.n })
		)
	);
	if (!(cs.length === 1 && cs[0].value.n === 1n)) factorExpressions.push(coefficientExpr(b, cs));
	const factored = factorExpressions.length
		? factorExpressions.reduce((a, c) => binary('*', a, c))
		: num(1n);
	b.identity(
		'result',
		coefficientExpr(b, originalCoefficients),
		factored,
		result.remaining.length > 1 ? 'The remaining factor stays visible' : undefined
	);
	return result;
}
export async function textbookExpand(b: DerivationBuilder, value: Expr): Promise<AlgebraResult> {
	assertIntegerPolynomial(value, b.env);
	b.line('given', (r) => r(value), { given: value });
	const normalized = await normalize(value, b),
		cs = row(normalized.terms, degree(value));
	let previous = b.derivation.lines
		.at(-1)
		?.identities.some((eq) => b.plain(eq.right) === b.plain(normalized.collected))
		? normalized.collected
		: value;
	for (const [kind, next] of [
		['expand', normalized.expanded],
		['evaluate', normalized.evaluated],
		['collect', normalized.collected]
	] as const) {
		if (b.plain(previous) === b.plain(normalized.collected)) break;
		if (b.plain(previous) !== b.plain(next)) b.identity(kind, previous, next);
		previous = next;
	}
	const a = new Arithmetic(b.trace),
		points = b.mode === 'light' ? [1n] : [-1n, 0n, 1n, 2n];
	for (const x of points) {
		const env = new Map(b.env);
		env.set('x', integer(x));
		const [original, collected] = await b.trace.wave([
			() => b.compute((a) => a.evaluate(value, env, { exact: true })),
			() =>
				b.int(
					(c) =>
						integerHorner(
							new Arithmetic(c),
							cs.map((v) => v.value.n),
							integer(x)
						),
					cs
				)
		]);
		if (!(await a.equal(original.value, collected.value)))
			throw new CheckFailed('Expansion substitution failed');
		const left = substitute(value, { x: num(x) }),
			right = substitute(normalized.collected, { x: num(x) });
		b.line(
			'check',
			(r) => `${r(left)} = ${r(b.expr(original))} = ${r(right)}\\quad\\checkmark`,
			{ identities: [qEq(left, b.expr(original)), qEq(b.expr(original), right)] },
			`Check at x = ${x}`
		);
	}
	b.identity('result', value, normalized.collected);
	return {
		...empty(),
		text: polynomialText(cs.map((c) => c.value.n)),
		coefficients: cs.map((c) => c.value)
	};
}
function rowEquation(b: DerivationBuilder, coefficients: Quantity[]): Equation {
	const n = coefficients.length - 1,
		terms = coefficients.slice(0, n).map((coefficient, i) => ({
			coefficient,
			powers: [0, 0, 0].map((_, j) => (i === j ? 1 : 0))
		}));
	return qEq(polynomial(b, terms), b.expr(coefficients[n]));
}
export async function textbookSystem(
	b: DerivationBuilder,
	equations: Equation[]
): Promise<AlgebraResult> {
	const n = equations.length,
		originalRows: Quantity[][] = [];
	for (const eq of equations) {
		const normalized = await normalizeEquation(eq, b),
			indices = Array.from({ length: n }, (_, i) => [0, 0, 0].map((_, j) => (i === j ? 1 : 0)));
		const coefficients = await b.trace.wave(
			indices.map(
				(p) => () =>
					b.add(coefficient(normalized.left.terms, p), coefficient(normalized.right.terms, p), true)
			)
		);
		coefficients.push(
			await b.add(
				coefficient(normalized.right.terms, [0, 0, 0]),
				coefficient(normalized.left.terms, [0, 0, 0]),
				true
			)
		);
		const collected = rowEquation(b, coefficients);
		if (
			b.plain(collected.left) !== b.plain(normalized.equation.left) ||
			b.plain(collected.right) !== b.plain(normalized.equation.right)
		)
			b.equation('move', collected, normalized.equation);
		const cleared = await integerCoefficients(b, coefficients);
		originalRows.push(cleared.coefficients);
		if (cleared.scale.value.n !== 1n)
			b.equation(
				'evaluate',
				rowEquation(b, cleared.coefficients),
				collected,
				binary('/', num(1n), b.expr(cleared.scale)),
				'Clear denominators'
			);
	}
	const matrix = originalRows.map((r) => [...r]);
	for (let k = 0; k < n; k++) {
		if (matrix[k][k].value.n === 0n) {
			const swap = matrix.findIndex((r, i) => i > k && r[k].value.n !== 0n);
			if (swap < 0) {
				const result = empty();
				result.text = 'zero determinant; no unique solution';
				result.complete = false;
				b.line('result', () => '\\text{Zero determinant: no unique solution}', {
					conditions: [{ expression: b.expr(matrix[k][k]), relation: 'zero' }]
				});
				return result;
			}
			[matrix[k], matrix[swap]] = [matrix[swap], matrix[k]];
			b.line(
				'move',
				(r) =>
					`\\begin{aligned}${matrix
						.map((row) => {
							const eq = rowEquation(b, row);
							return `${r(eq.left)}&=${r(eq.right)}`;
						})
						.join('\\\\')}\\end{aligned}`,
				{ equations: matrix.map((row) => rowEquation(b, row)) },
				`Exchange equations ${k + 1} and ${swap + 1}`
			);
		}
		for (let i = k + 1; i < n; i++) {
			if (matrix[i][k].value.n === 0n) continue;
			const pivot = matrix[k][k],
				target = matrix[i][k],
				gcd = await b.int(
					(c) => new Arithmetic(c).gcd(pivot.value.n, target.value.n),
					[pivot, target]
				);
			const [s, t] = await b.trace.wave([() => b.div(pivot, gcd), () => b.div(target, gcd)]);
			const [scaledTarget, scaledPivot] = await b.trace.wave([
				() => b.trace.wave(matrix[i].map((v) => () => b.mul(v, s))),
				() => b.trace.wave(matrix[k].map((v) => () => b.mul(v, t)))
			]);
			if (s.value.n !== 1n)
				b.equation(
					'evaluate',
					rowEquation(b, scaledTarget),
					rowEquation(b, matrix[i]),
					binary('/', num(1n), b.expr(s)),
					(r) => `Multiply equation ${i + 1} by ${r(b.expr(s))}`
				);
			if (t.value.n !== 1n)
				b.equation(
					'evaluate',
					rowEquation(b, scaledPivot),
					rowEquation(b, matrix[k]),
					binary('/', num(1n), b.expr(t)),
					(r) => `Multiply equation ${k + 1} by ${r(b.expr(t))}`
				);
			let updated = await b.trace.wave(
				scaledTarget.map((v, j) => () => b.add(v, scaledPivot[j], true))
			);
			let first = rowEquation(b, scaledTarget),
				second = rowEquation(b, scaledPivot),
				note = `Subtract the scaled equation ${k + 1} from the scaled equation ${i + 1}`;
			const leading = updated.slice(k + 1, n).find((c) => c.value.n !== 0n);
			if (leading && leading.value.n < 0n) {
				updated = updated.map(negate);
				[first, second] = [second, first];
				note = `Subtract the scaled equation ${i + 1} from the scaled equation ${k + 1}`;
			}
			const combination = qEq(
				binary('-', first.left, second.left),
				binary('-', first.right, second.right)
			);
			b.line(
				'move',
				(r) => `${r(combination.left)} = ${r(combination.right)}`,
				{
					equations: [combination],
					identities: [qEq(residual(combination), binary('-', residual(first), residual(second)))]
				},
				note
			);
			b.equation('collect', rowEquation(b, updated), combination);
			matrix[i] = updated;
		}
	}
	const roots: Quantity[] = Array(n);
	for (let i = n - 1; i >= 0; i--) {
		const known = Object.fromEntries(
			roots.flatMap((root, j) => (root ? [[['x', 'y', 'z'][j], b.expr(root)]] : []))
		);
		const before = rowEquation(b, matrix[i]),
			at = qEq(substitute(before.left, known), before.right);
		if (i < n - 1)
			b.line(
				'evaluate',
				(r) => `${r(at.left)} = ${r(at.right)}`,
				{ equations: [at], identities: [qEq(residual(at), substitute(residual(before), known))] },
				'Back-substitute the known values'
			);
		const terms = await b.trace.wave(
			matrix[i].slice(i + 1, n).map((c, j) => () => b.mul(c, roots[i + j + 1]))
		);
		let rhs = matrix[i][n],
			rhsExpr = b.expr(rhs);
		for (const term of terms) {
			rhsExpr = binary('-', rhsExpr, b.expr(term));
			rhs = await b.add(rhs, term, true);
		}
		const isolated = qEq(
			binary('*', b.expr(matrix[i][i]), variable(['x', 'y', 'z'][i])),
			b.expr(rhs)
		);
		if (terms.length) {
			b.equation('move', qEq(isolated.left, rhsExpr), at);
			b.equation('evaluate', isolated, qEq(isolated.left, rhsExpr));
		}
		roots[i] = await b.div(rhs, matrix[i][i]);
		b.equation(
			'divide',
			qEq(variable(['x', 'y', 'z'][i]), b.expr(roots[i])),
			isolated,
			b.expr(matrix[i][i])
		);
	}
	const result = empty(),
		point = Object.fromEntries(roots.map((v, i) => [['x', 'y', 'z'][i], v.value])),
		replacements = Object.fromEntries(roots.map((v, i) => [['x', 'y', 'z'][i], b.expr(v)]));
	const env = new Map(b.env);
	for (const [name, value] of Object.entries(point)) env.set(name, value);
	for (let i = 0; i < n; i++) {
		const eq = b.mode === 'strong' ? equations[i] : rowEquation(b, originalRows[i]);
		const [left, right] = await b.trace.wave([
			() => b.compute((a) => a.evaluate(eq.left, env, { exact: true }), roots),
			() => b.compute((a) => a.evaluate(eq.right, env, { exact: true }), roots)
		]);
		if (!(await new Arithmetic(b.trace).equal(left.value, right.value)))
			throw new CheckFailed('System substitution failed');
		const lhs = substitute(eq.left, replacements),
			rhs = substitute(eq.right, replacements);
		b.line(
			'check',
			(r) =>
				`${r(lhs)} = ${r(b.expr(left))}${b.plain(rhs) === b.plain(b.expr(left)) ? '' : ` = ${r(rhs)}`}\\quad\\checkmark`,
			{
				identities: [qEq(lhs, b.expr(left)), qEq(b.expr(left), rhs)],
				roots: [{ equation: eq, point }]
			}
		);
		result.checks.push({
			kind: b.mode === 'light' ? 'horner' : 'substitution',
			mode: b.mode,
			passed: true
		});
	}
	result.roots = roots.map((q) => q.value);
	const texts = await b.trace.wave(
		roots.map(
			(root, i) => async () =>
				`${['x', 'y', 'z'][i]} = ${await new Arithmetic(b.trace).rootText(root.value)}`
		)
	);
	result.text = texts.join(', ');
	b.line(
		'result',
		(r) => roots.map((q, i) => `${['x', 'y', 'z'][i]} = ${r(b.expr(q))}`).join(',\\quad '),
		{ roots: equations.map((equation) => ({ equation, point })) }
	);
	return result;
}

/** Offered-root entry point uses the same collected coefficients and selected check as the solver. */
export async function checkTextbookRoot(
	b: DerivationBuilder,
	eq: Equation,
	root: Quantity
): Promise<RootCheck> {
	const normalized = await normalizeEquation(eq, b),
		d = Math.max(degree(eq.left), degree(eq.right));
	const l = row(normalized.left.terms, d),
		r = row(normalized.right.terms, d);
	const cs = await b.trace.wave(l.map((v, i) => () => b.add(v, r[i], true)));
	return verifyRoot(b, eq, (await integerCoefficients(b, cs)).coefficients, root);
}
