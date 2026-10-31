import {
	Arithmetic,
	CheckFailed,
	flip,
	integer,
	magnitude,
	ten,
	type Environment,
	type Rational
} from './arithmetic';
import { degree, names, type Equation, type Expr } from './parse';
export interface GridRow {
	kind: 'evaluation' | 'confirmation' | 'coefficient';
	label: string;
	point?: Rational[];
	left?: Rational;
	right?: Rational;
	value?: Rational;
	cells: (Rational | { expression: string })[];
}
export interface CoefficientGrid {
	columns: string[];
	rows: GridRow[];
}
export interface RootCheck {
	kind: 'substitution' | 'horner' | 'bracket';
	mode?: 'light' | 'strong';
	passed: boolean;
	root?: Rational;
	lower?: Rational;
	upper?: Rational;
}
export interface AlgebraResult {
	checkMode?: 'light' | 'strong';
	text: string;
	coefficients?: Rational[];
	roots: Rational[];
	checks: RootCheck[];
	grids: CoefficientGrid[];
	remaining?: bigint[];
	factors?: { p: bigint; q: bigint }[];
	guesses?: { root: Rational; label: 'not certified'; accepted: boolean }[];
	complete: boolean;
}
const empty = (): AlgebraResult => ({ text: '', roots: [], checks: [], grids: [], complete: true });
function integerSyntax(e: Expr, env: Environment): boolean {
	if (e.kind === 'number') return !e.text.includes('.');
	if (e.kind === 'name') return e.name === 'x' || env.get(e.name)?.d === 1n;
	if (e.kind === 'unary') return e.op !== 'sqrt' && integerSyntax(e.value, env);
	return (
		e.kind === 'binary' && e.op !== '/' && integerSyntax(e.left, env) && integerSyntax(e.right, env)
	);
}
function assertIntegerPolynomial(e: Expr, env: Environment): void {
	if (!integerSyntax(e, env))
		throw new Error('expand and factor require integer coefficients, with no division');
	for (const name of names(e))
		if (name !== 'x' && !env.has(name)) throw new Error(`Unknown polynomial name ${name}`);
}
function pointEnv(env: Environment, point: readonly Rational[]): Map<string, Rational> {
	const map = new Map(env);
	point.forEach((v, i) => map.set(['x', 'y', 'z'][i], v));
	return map;
}
async function typedSides(
	a: Arithmetic,
	eq: Equation,
	env: Environment,
	point: readonly Rational[]
) {
	const variables = pointEnv(env, point);
	const [left, right] = await a.evaluateMany([eq.left, eq.right], variables, { exact: true });
	if (left.approximate || right.approximate)
		throw new CheckFailed('Approximate named value in an exact equation');
	return { left, right };
}
async function sides(a: Arithmetic, eq: Equation, env: Environment, point: readonly Rational[]) {
	const { left, right } = await typedSides(a, eq, env, point);
	return { left, right, value: await a.add(left, right, true) };
}
/** Integer-only Horner numerator for q^degree * P(p/q). */
export async function integerHorner(
	a: Arithmetic,
	coefficients: bigint[],
	x: Rational
): Promise<bigint> {
	let y = coefficients.at(-1)!,
		qPower = x.d;
	for (let j = coefficients.length - 2; j >= 0; j--) {
		const [term, constant, nextPower] = await a.calc.wave([
			() =>
				j === coefficients.length - 2 && y === 1n
					? Promise.resolve(x.n)
					: j === coefficients.length - 2 && y === -1n
						? Promise.resolve(flip(x.n))
						: a.calc.mul(y, x.n),
			() => (x.d === 1n ? Promise.resolve(coefficients[j]) : a.calc.mul(coefficients[j], qPower)),
			() => (j > 0 && x.d !== 1n ? a.calc.mul(qPower, x.d) : Promise.resolve(qPower))
		]);
		y = await a.calc.add(term, constant);
		qPower = nextPower;
	}
	return y;
}
export async function checkRoot(
	a: Arithmetic,
	eq: Equation,
	root: Rational,
	env: Environment = new Map(),
	coefficients?: bigint[]
): Promise<RootCheck> {
	if (a.checkMode === 'light') {
		const cs =
			coefficients ?? (await clearDenominators(a, (await recover(a, eq, env)).coefficients));
		if ((await integerHorner(a, cs, root)) !== 0n)
			throw new CheckFailed('Root does not satisfy recovered coefficients');
		return { kind: 'horner', mode: 'light', passed: true, root };
	}
	const { left, right } = await typedSides(a, eq, env, [root]);
	if (!(await a.equal(left, right)))
		throw new CheckFailed('Root does not satisfy the typed equation');
	return { kind: 'substitution', mode: 'strong', passed: true, root };
}
async function horner(a: Arithmetic, coefficients: Rational[], x: Rational): Promise<Rational> {
	if (coefficients.every((c) => c.d === 1n) && x.d === 1n)
		return integer(
			await integerHorner(
				a,
				coefficients.map((c) => c.n),
				x
			)
		);
	let y = coefficients.at(-1)!;
	for (let j = coefficients.length - 2; j >= 0; j--)
		y = await a.add(await a.mul(y, x), coefficients[j]);
	return y;
}
function powerCells(x: Rational, d: number): GridRow['cells'] {
	// These are labels for the page, not additional computed answer digits.
	return Array.from({ length: d + 1 }, (_, i) =>
		i === 0 ? integer(1n) : i === 1 ? x : { expression: `(${x.n}/${x.d})^${i}` }
	);
}
/** Small points first. The final point confirms the recovered degree. */
export async function recover(
	a: Arithmetic,
	eq: Equation,
	env: Environment = new Map()
): Promise<{ coefficients: Rational[]; grid: CoefficientGrid }> {
	const d = Math.max(degree(eq.left), degree(eq.right));
	const points = Array.from({ length: d + 2 }, (_, i) =>
		BigInt(i === 0 ? 0 : i === 1 ? 1 : i === 2 ? -1 : i - 1)
	);
	const rows = await a.calc.wave(
		points.map((point, i) => async () => {
			const x = integer(point),
				v = await sides(a, eq, env, [x]);
			return {
				kind: i === d + 1 ? ('confirmation' as const) : ('evaluation' as const),
				label: `x = ${point}`,
				point: [x],
				...v,
				cells: powerCells(x, d)
			};
		})
	);
	const grid: CoefficientGrid = {
		columns: Array.from({ length: d + 1 }, (_, i) => `x^${i}`),
		rows
	};
	const integral = integerSyntax(eq.left, env) && integerSyntax(eq.right, env);
	let coefficients: Rational[];
	if (d === 0) coefficients = [rows[0].value];
	else if (d === 1) coefficients = [rows[0].value, await a.add(rows[1].value, rows[0].value, true)];
	else if (d === 2) {
		const [u, v] = await a.calc.wave([
			() => a.add(rows[1].value, rows[0].value, true),
			() => a.add(rows[2].value, rows[0].value, true)
		]);
		const half = async (n: Rational) =>
			integral ? integer(await a.exact(n.n, 2n)) : a.div(n, integer(2n));
		const [leading, linear] = await a.calc.wave([
			async () => half(await a.add(u, v)),
			async () => half(await a.add(u, v, true))
		]);
		coefficients = [rows[0].value, linear, leading];
	} else {
		// These points are consecutive after reordering, so finite differences apply unchanged.
		let differences = [
			rows[2].value,
			rows[0].value,
			rows[1].value,
			...rows.slice(3, d + 1).map((r) => r.value)
		];
		let basis = [integer(1n)],
			factorial = 1n;
		coefficients = Array.from({ length: d + 1 }, () => integer(0n));
		for (let order = 0; order <= d; order++) {
			if (order > 0) factorial = await a.calc.mul(factorial, BigInt(order));
			const head = differences[0];
			const weight = integral
				? integer(await a.exact(head.n, factorial))
				: await a.div(head, integer(factorial));
			const nextCoefficients = await a.calc.wave(
				basis.map((b, j) => async () => a.add(coefficients[j], await a.mul(weight, b)))
			);
			nextCoefficients.forEach((c, j) => (coefficients[j] = c));
			if (order === d) break;
			differences = await a.calc.wave(
				differences.slice(1).map((v, j) => () => a.add(v, differences[j], true))
			);
			const products = await a.calc.wave(
				basis.map((b) => () => a.mul(b, integer(BigInt(1 - order))))
			);
			const prior = basis;
			basis = await a.calc.wave(
				Array.from(
					{ length: prior.length + 1 },
					(_, j) => () => a.add(products[j] ?? integer(0n), j === 0 ? integer(0n) : prior[j - 1])
				)
			);
		}
	}
	const prediction = await horner(a, coefficients, integer(points.at(-1)!));
	if (!(await a.equal(prediction, rows.at(-1)!.value)))
		throw new CheckFailed('Degree confirmation failed');
	coefficients.forEach((c, i) =>
		grid.rows.push({
			kind: 'coefficient',
			label: `coefficient of x^${i}`,
			value: c,
			cells: coefficients.map((v, j) => (i === j ? v : integer(0n)))
		})
	);
	return { coefficients, grid };
}
async function clearDenominators(a: Arithmetic, cs: Rational[]): Promise<bigint[]> {
	if (cs.every((c) => c.d === 1n)) {
		const integers = cs.map((c) => c.n);
		while (integers.length > 1 && integers.at(-1) === 0n) integers.pop();
		return integers;
	}
	let common = 1n;
	for (const c of cs) {
		common = await a.calc.mul(await a.exact(common, await a.gcd(common, c.d)), c.d);
	}
	const result = await a.calc.wave(
		cs.map((c) => async () => a.calc.mul(c.n, await a.exact(common, c.d)))
	);
	while (result.length > 1 && result.at(-1) === 0n) result.pop();
	return result;
}
async function bracket(
	a: Arithmetic,
	eq: Equation,
	candidate: Rational,
	env: Environment,
	coefficients: bigint[]
): Promise<RootCheck> {
	const scale = ten(6);
	const scaled = await a.calc.mul(magnitude(candidate.n), scale);
	const { q, r } = await a.calc.divmod(scaled, candidate.d);
	let floor = candidate.n < 0n ? flip(q) : q;
	if (candidate.n < 0n && r !== 0n) floor = await a.calc.sub(floor, 1n);
	for (const offset of [0n, -1n, 1n]) {
		const lo = await a.calc.add(floor, offset),
			hi = await a.calc.add(lo, 1n);
		const [lower, upper] = await a.calc.wave([
			() => a.fraction(lo, scale),
			() => a.fraction(hi, scale)
		]);
		const [f, g] = await a.calc.wave(
			[lower, upper].map(
				(point) => async () =>
					a.checkMode === 'light'
						? integerHorner(a, coefficients, point)
						: (await sides(a, eq, env, [point])).value.n
			)
		);
		if (f !== 0n && g !== 0n && f < 0n !== g < 0n)
			return { kind: 'bracket', mode: a.checkMode, passed: true, lower, upper };
	}
	throw new CheckFailed('No opposite-sign bracket at six decimal places');
}
async function lowDegree(
	a: Arithmetic,
	eq: Equation,
	c: bigint[],
	env: Environment
): Promise<AlgebraResult> {
	const result = empty();
	if (c.length === 1) {
		result.text = c[0] === 0n ? 'every x' : 'no solution';
		return result;
	}
	if (c.length === 2) {
		const root = await a.fraction(flip(c[0]), c[1]);
		result.checks.push(await checkRoot(a, eq, root, env, c));
		result.roots.push(root);
		result.text = `x = ${await a.rootText(root)}`;
		return result;
	}
	const [constant, b, leading] = c;
	// A sheet-produced zero constant proves 0 is a candidate; the other root is linear.
	// Both still pass the selected root check. No discriminant digits are needed here.
	if (constant === 0n) {
		const other = await a.fraction(flip(b), leading),
			zero = integer(constant);
		const roots =
			other.n === 0n ? [zero] : other.n < 0n === leading > 0n ? [other, zero] : [zero, other];
		const checked = await a.calc.wave(
			roots.map((root) => async () => ({
				root,
				check: await checkRoot(a, eq, root, env, c),
				text: await a.rootText(root)
			}))
		);
		result.roots = checked.map((v) => v.root);
		result.checks = checked.map((v) => v.check);
		result.text = `x = ${checked.map((v) => v.text).join(', ')}`;
		return result;
	}

	const den = await a.calc.add(leading, leading);
	const [square, product] = await a.calc.wave([
		() => a.calc.mul(b, b),
		async () => a.calc.mul(await a.calc.add(den, den), constant)
	]);
	const disc = await a.calc.sub(square, product);
	if (disc < 0n) {
		result.text = 'no real roots';
		return result;
	}
	const sr = await a.calc.isqrt(disc);
	if (sr.rem === 0n) {
		const answers = await a.calc.wave(
			(sr.root === 0n ? [-1] : [-1, 1]).map((sign) => async () => {
				const num =
					sign < 0 ? await a.calc.sub(flip(b), sr.root) : await a.calc.add(flip(b), sr.root);
				const root = await a.fraction(num, den);
				const check = await checkRoot(a, eq, root, env, c);
				return { root, check, text: await a.rootText(root) };
			})
		);
		result.roots = answers.map((v) => v.root);
		result.checks = answers.map((v) => v.check);
		result.text = `x = ${answers.map((v) => v.text).join(', ')}`;
	} else {
		// Extra square-root digits locate the six-place cell; the typed equation proves the cell.
		const places = 6 + magnitude(den).toString().length + 3,
			scale = ten(places);
		const large = await a.calc.isqrt(await a.calc.mul(disc, ten(2 * places)));
		const [base, divisor] = await a.calc.wave([
			() => a.calc.mul(flip(b), scale),
			() => a.calc.mul(den, scale)
		]);
		const brackets = await a.calc.wave(
			[-1, 1].map((sign) => async () => {
				const num =
					sign < 0 ? await a.calc.sub(base, large.root) : await a.calc.add(base, large.root);
				const check = await bracket(a, eq, await a.fraction(num, divisor), env, c);
				const texts = await a.calc.wave([
					() => a.decimal(check.lower!, 6, true),
					() => a.decimal(check.upper!, 6, true)
				]);
				return { check, text: `[${texts.join(', ')}]` };
			})
		);
		result.checks = brackets.map((v) => v.check);
		const bounds = brackets.map((v) => v.text);
		result.text = `x = (${flip(b)} ± √${disc})/(${den}); six-place bounds ${bounds.join(', ')}`;
	}
	return result;
}
/** Float64 candidates only. Derivative roots split the real line into monotone intervals.
 * This is an uncertified search; no float-derived digit can pass into an accepted answer unchecked.
 */
function floatRoots(c: number[]): number[] {
	while (c.length > 1 && c.at(-1) === 0) c.pop();
	if (c.length < 2 || c.some((v) => !Number.isFinite(v))) return [];
	if (c.length === 2) return [-c[0] / c[1]];
	const evaluate = (x: number) => c.reduceRight((y, v) => y * x + v, 0);
	const bound = 1 + Math.max(...c.slice(0, -1).map((v) => Math.abs(v / c.at(-1)!)));
	const critical = floatRoots(c.slice(1).map((v, i) => v * (i + 1))).filter(
		(v) => Math.abs(v) < bound
	);
	const points = [-bound, ...critical.sort((a, b) => a - b), bound];
	const roots = critical.filter(
		(x) => Math.abs(evaluate(x)) < 1e-6 * Math.max(1, ...c.map(Math.abs))
	);
	for (let i = 0; i < points.length - 1; i++) {
		let lo = points[i],
			hi = points[i + 1],
			left = evaluate(lo);
		if (left < 0 === evaluate(hi) < 0) continue;
		for (let n = 0; n < 100; n++) {
			const mid = (lo + hi) / 2,
				value = evaluate(mid);
			if (left < 0 === value < 0) {
				lo = mid;
				left = value;
			} else hi = mid;
		}
		roots.push((lo + hi) / 2);
	}
	return roots;
}
function candidates(c: bigint[]): Rational[] {
	const found: Rational[] = [];
	const leading = Math.abs(Number(c.at(-1)!));
	const roots = floatRoots(c.map(Number));
	// A bounded search keeps hostile input finite. Exhaustiveness is deliberately never claimed.
	for (const root of roots)
		for (let q = 1; q <= Math.min(leading, 256); q++) {
			if (leading % q !== 0) continue;
			const near = Math.round(root * q);
			for (const p of [near, near - 1, near + 1]) {
				if (!Number.isSafeInteger(p) || !Number.isSafeInteger(q)) continue;
				const r = { n: BigInt(p), d: BigInt(q) };
				if (!found.some((v) => v.n === r.n && v.d === r.d)) found.push(r);
			}
		}
	return found;
}
/** Divide by (q*x-p) with exact divisions on the sheet. Null means an unproved guess. */
async function synthetic(a: Arithmetic, c: bigint[], root: Rational): Promise<bigint[] | null> {
	const out = Array<bigint>(c.length - 1);
	try {
		out[out.length - 1] = await a.exact(c.at(-1)!, root.d);
		for (let i = out.length - 1; i > 0; i--)
			out[i - 1] = await a.exact(await a.calc.add(c[i], await a.calc.mul(root.n, out[i])), root.d);
		const rem = await a.calc.add(c[0], await a.calc.mul(root.n, out[0]));
		return rem === 0n ? out : null;
	} catch (e) {
		if (e instanceof CheckFailed) return null;
		throw e;
	}
}
async function factorCoefficients(
	a: Arithmetic,
	eq: Equation,
	coefficients: bigint[],
	env: Environment
): Promise<AlgebraResult> {
	const result = empty();
	result.complete = false;
	result.guesses = [];
	result.factors = [];
	let remaining = coefficients;
	while (remaining.length > 1) {
		let proved = false;
		for (const guess of candidates(remaining)) {
			const quotient = await synthetic(a, remaining, guess);
			const item = { root: guess, label: 'not certified' as const, accepted: false };
			result.guesses.push(item);
			if (!quotient) continue;
			const root = await a.fraction(guess.n, guess.d);
			result.roots.push(root);
			item.accepted = true;
			result.factors.push({ p: guess.n, q: guess.d });
			remaining = quotient;
			proved = true;
			break;
		}
		if (!proved) break;
	}
	result.remaining = remaining;
	const verified = await a.calc.wave(
		result.roots.map((root) => async () => ({
			check: await checkRoot(a, eq, root, env, coefficients),
			text: await a.rootText(root)
		}))
	);
	result.checks = verified.map((v) => v.check);
	const text = verified.map((v) => v.text);
	const factors = result.factors.map(({ p, q }) => `(${polynomialText([flip(p), q])})`).join('');
	result.text = `proven roots: ${text.join(', ') || 'none'}; factors ${factors || 'none'}; remaining ${polynomialText(remaining)}. Guesses are not certified; checks prove these roots, not that no others exist.`;
	return result;
}
export function polynomialText(c: bigint[]): string {
	const terms: string[] = [];
	for (let i = c.length - 1; i >= 0; i--) {
		if (c[i] === 0n) continue;
		const abs = magnitude(c[i]);
		const variable = i === 0 ? '' : i === 1 ? 'x' : `x^${i}`;
		const body = (abs === 1n && i > 0 ? '' : abs.toString()) + variable;
		terms.push((terms.length ? (c[i] < 0n ? ' - ' : ' + ') : c[i] < 0n ? '-' : '') + body);
	}
	return terms.join('') || '0';
}
export async function solve(
	a: Arithmetic,
	eq: Equation,
	env: Environment = new Map()
): Promise<AlgebraResult> {
	const recovered = await recover(a, eq, env),
		c = await clearDenominators(a, recovered.coefficients);
	const result =
		c.length <= 3 ? await lowDegree(a, eq, c, env) : await factorCoefficients(a, eq, c, env);
	result.coefficients = recovered.coefficients;
	result.grids.push(recovered.grid);
	return result;
}
export async function factor(
	a: Arithmetic,
	value: Expr,
	env: Environment = new Map()
): Promise<AlgebraResult> {
	assertIntegerPolynomial(value, env);
	const eq: Equation = { left: value, right: { kind: 'number', text: '0' } };
	const recovered = await recover(a, eq, env),
		c = await clearDenominators(a, recovered.coefficients);
	const result = await factorCoefficients(a, eq, c, env);
	result.coefficients = recovered.coefficients;
	result.grids.push(recovered.grid);
	return result;
}
/** Base 10^k is a page layout: read groups, and use Calc only for signed carry correction. */
export async function unpack(
	a: Arithmetic,
	packed: bigint,
	k: number,
	terms: number
): Promise<bigint[]> {
	const digits = magnitude(packed).toString(),
		base = ten(k),
		half = BigInt('5' + '0'.repeat(k - 1));
	const coefficients: bigint[] = [];
	let carry = false;
	for (let i = 0; i < terms; i++) {
		const end = digits.length - i * k;
		let group = BigInt(end > 0 ? digits.slice(Math.max(0, end - k), end) : '0');
		if (carry) group = await a.calc.add(group, 1n);
		carry = group > half;
		if (carry) group = await a.calc.sub(group, base);
		coefficients.push(packed < 0n ? flip(group) : group);
	}
	if (carry || /[1-9]/.test(digits.slice(0, Math.max(0, digits.length - terms * k))))
		throw new CheckFailed('Expansion exceeds degree or coefficient bound');
	return coefficients;
}
export async function expand(
	a: Arithmetic,
	value: Expr,
	env: Environment = new Map()
): Promise<AlgebraResult> {
	assertIntegerPolynomial(value, env);
	const d = degree(value),
		result = empty();
	const bound = await a.evaluate(value, pointEnv(env, [integer(1n)]), {
		positive: true,
		exact: true
	});
	const twice = await a.calc.add(bound.n, bound.n),
		k = magnitude(twice).toString().length,
		base = ten(k);
	const v = await a.evaluate(value, pointEnv(env, [integer(base)]), { exact: true });
	if (v.d !== 1n || v.approximate)
		throw new CheckFailed('Expansion needs exact integer coefficients');
	const coefficients = await unpack(a, v.n, k, d + 1);
	if (coefficients.some((c) => magnitude(c) > bound.n))
		throw new CheckFailed('Expansion coefficient exceeds bound');
	const grid: CoefficientGrid = {
		columns: coefficients.map((_, i) => `x^${i}`),
		rows: [
			{
				kind: 'evaluation',
				label: 'positive-coefficient bound at x = 1',
				point: [integer(1n)],
				value: bound,
				cells: powerCells(integer(1n), d)
			},
			{
				kind: 'evaluation',
				label: `packed value at x = ${base}`,
				point: [integer(base)],
				value: v,
				cells: powerCells(integer(base), d)
			}
		]
	};
	const confirmations = await a.calc.wave(
		(a.checkMode === 'light' ? [1n] : [-1n, 0n, 1n, 2n]).map((x) => async () => {
			const [actual, predicted] = await a.calc.wave([
				() => a.evaluate(value, pointEnv(env, [integer(x)]), { exact: true }),
				async () => integer(await integerHorner(a, coefficients, integer(x)))
			]);
			if (!(await a.equal(actual, predicted)))
				throw new CheckFailed('Expansion confirmation failed');
			return {
				kind: 'confirmation' as const,
				label: `x = ${x}`,
				point: [integer(x)],
				left: actual,
				right: integer(0n),
				value: actual,
				cells: powerCells(integer(x), d)
			};
		})
	);
	grid.rows.push(...confirmations);
	coefficients.forEach((c, i) =>
		grid.rows.push({
			kind: 'coefficient',
			label: `coefficient of x^${i}`,
			value: integer(c),
			cells: coefficients.map((v, j) => integer(i === j ? v : 0n))
		})
	);
	result.coefficients = coefficients.map(integer);
	result.grids.push(grid);
	result.text = polynomialText(coefficients);
	return result;
}
async function determinant2(a: Arithmetic, m: bigint[][]): Promise<bigint> {
	const [left, right] = await a.calc.wave([
		() => a.calc.mul(m[0][0], m[1][1]),
		() => a.calc.mul(m[0][1], m[1][0])
	]);
	return a.calc.sub(left, right);
}
async function sum(a: Arithmetic, values: bigint[]): Promise<bigint> {
	let row = values;
	while (row.length > 1)
		row = await a.calc.wave(
			Array.from(
				{ length: Math.ceil(row.length / 2) },
				(_, i) => () =>
					i * 2 + 1 < row.length
						? a.calc.add(row[i * 2], row[i * 2 + 1])
						: Promise.resolve(row[i * 2])
			)
		);
	return row[0] ?? 0n;
}
/** Bareiss elimination: all cells in one stage use the same immutable pivot row. */
async function bareiss(a: Arithmetic, input: bigint[][]): Promise<bigint[][] | null> {
	const m = input.map((r) => [...r]),
		n = m.length;
	let previous = 1n;
	for (let k = 0; k < n - 1; k++) {
		if (m[k][k] === 0n) {
			const row = m.findIndex((r, i) => i > k && r[k] !== 0n);
			if (row < 0) return null;
			[m[k], m[row]] = [m[row], m[k]];
		}
		const pivot = m[k][k],
			jobs: (() => Promise<{ i: number; j: number; value: bigint }>)[] = [];
		for (let i = k + 1; i < n; i++)
			for (let j = k + 1; j <= n; j++)
				jobs.push(async () => {
					const [left, right] = await a.calc.wave([
						() => a.calc.mul(pivot, m[i][j]),
						() => a.calc.mul(m[i][k], m[k][j])
					]);
					return { i, j, value: await a.exact(await a.calc.sub(left, right), previous) };
				});
		const updates = await a.calc.wave(jobs);
		for (const { i, j, value } of updates) m[i][j] = value;
		for (let i = k + 1; i < n; i++) m[i][k] = 0n;
		previous = pivot;
	}
	return m[n - 1][n - 1] === 0n ? null : m;
}
export async function system(
	a: Arithmetic,
	equations: Equation[],
	env: Environment = new Map()
): Promise<AlgebraResult> {
	const n = equations.length,
		result = empty();
	const recovered = await a.calc.wave(
		equations.map((eq) => async () => {
			const points = [
				Array.from({ length: n }, () => integer(0n)),
				...Array.from({ length: n }, (_, i) =>
					Array.from({ length: n }, (_, j) => integer(i === j ? 1n : 0n))
				),
				Array.from({ length: n }, (_, i) => integer(BigInt(i + 2)))
			];
			const rows = await a.calc.wave(
				points.map((p, i) => async () => ({
					kind: i === points.length - 1 ? ('confirmation' as const) : ('evaluation' as const),
					label: `(${p.map((v) => v.n).join(', ')})`,
					point: p,
					...(await sides(a, eq, env, p)),
					cells: [integer(1n), ...p]
				}))
			);
			const grid: CoefficientGrid = { columns: ['constant', ...['x', 'y', 'z'].slice(0, n)], rows };
			const cs = [
				rows[0].value,
				...(await a.calc.wave(
					rows.slice(1, n + 1).map((r) => () => a.add(r.value, rows[0].value, true))
				))
			];
			const terms = await a.calc.wave(cs.slice(1).map((c, i) => () => a.mul(c, points.at(-1)![i])));
			let check = cs[0];
			for (const term of terms) check = await a.add(check, term);
			if (!(await a.equal(check, rows.at(-1)!.value)))
				throw new CheckFailed('System linear-degree confirmation failed');
			cs.forEach((c, i) =>
				grid.rows.push({
					kind: 'coefficient',
					label: grid.columns[i],
					value: c,
					cells: cs.map((v, j) => (i === j ? v : integer(0n)))
				})
			);
			const cleared = await clearDenominators(a, cs);
			while (cleared.length <= n) cleared.push(0n);
			return { grid, row: [...cleared.slice(1), flip(cleared[0])] };
		})
	);
	const matrix = recovered.map((r) => r.row);
	result.grids = recovered.map((r) => r.grid);
	let roots: Rational[];
	if (n === 2) {
		const [[aa, b, e], [c, d, f]] = matrix;
		const [det, x, y] = await a.calc.wave([
			() =>
				determinant2(a, [
					[aa, b],
					[c, d]
				]),
			() =>
				determinant2(a, [
					[e, b],
					[f, d]
				]),
			() =>
				determinant2(a, [
					[aa, e],
					[c, f]
				])
		]);
		if (det === 0n) {
			result.text = 'zero determinant; no unique solution';
			result.complete = false;
			return result;
		}
		roots = await a.calc.wave([() => a.fraction(x, det), () => a.fraction(y, det)]);
	} else {
		const m = await bareiss(a, matrix);
		if (!m) {
			result.text = 'zero determinant; no unique solution';
			result.complete = false;
			return result;
		}
		roots = Array<Rational>(n);
		for (let i = n - 1; i >= 0; i--) {
			const terms = await a.calc.wave(
				m[i].slice(i + 1, n).map((c, j) => () => a.mul(integer(c), roots[i + 1 + j]))
			);
			let rhs = integer(m[i][n]);
			for (const term of terms) rhs = await a.add(rhs, term, true);
			roots[i] = await a.div(rhs, integer(m[i][i]));
		}
	}
	if (a.checkMode === 'strong') {
		result.checks = await a.calc.wave(
			equations.map((eq) => async () => {
				const s = await typedSides(a, eq, env, roots);
				if (!(await a.equal(s.left, s.right))) throw new CheckFailed('System substitution failed');
				return { kind: 'substitution' as const, mode: 'strong' as const, passed: true };
			})
		);
	} else {
		let common = 1n;
		for (const root of roots) if (root.d !== 1n) common = await a.calc.mul(common, root.d);
		const numerators = await a.calc.wave(
			roots.map(
				(root) => async () =>
					common === 1n ? root.n : a.calc.mul(root.n, await a.exact(common, root.d))
			)
		);
		result.checks = await a.calc.wave(
			matrix.map((row) => async () => {
				const [left, right] = await a.calc.wave([
					async () =>
						sum(
							a,
							await a.calc.wave(row.slice(0, n).map((c, i) => () => a.calc.mul(c, numerators[i])))
						),
					() => (common === 1n ? Promise.resolve(row[n]) : a.calc.mul(row[n], common))
				]);
				if (left !== right) throw new CheckFailed('System coefficient check failed');
				return { kind: 'horner' as const, mode: 'light' as const, passed: true };
			})
		);
	}
	result.roots = roots;
	const formatted = await a.calc.wave(
		roots.map((r, i) => async () => `${['x', 'y', 'z'][i]} = ${await a.rootText(r)}`)
	);
	result.text = formatted.join(', ');
	return result;
}
