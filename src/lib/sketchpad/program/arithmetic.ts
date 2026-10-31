import type { Calc } from './calc';
import { exponent, type Expr } from './parse';
export interface Rational {
	n: bigint;
	d: bigint;
	approximate?: boolean;
}
export type Environment = ReadonlyMap<string, Rational>;
export class CheckFailed extends Error {
	/** the failed check as TeX (e.g. a substitution that does not give 0), when the check can say it */
	readonly check?: string;
	constructor(message: string, check?: string) {
		super(message);
		this.name = 'CheckFailed';
		this.check = check;
	}
}
// Sign and decimal placement are layout. No arithmetic answer digits are computed here.
export const magnitude = (n: bigint): bigint => BigInt(n.toString().replace('-', ''));
export const flip = (n: bigint): bigint =>
	n === 0n ? 0n : BigInt(n < 0n ? n.toString().slice(1) : '-' + n.toString());
export const ten = (places: number): bigint => BigInt('1' + '0'.repeat(places));
export const integer = (n: bigint): Rational => ({ n, d: 1n });
export type CheckMode = 'light' | 'strong';
export interface EvaluationOptions {
	/** every ÷ and √ cut at this many places (a statement's `to k places`) */
	places?: number;
	exact?: boolean;
	positive?: boolean;
	/**
	 * with no `places`: keep ÷ exact (a fraction, never cut) and cut an irrational √ at `cut` places; without this, ÷
	 * and √ are cut at 12 places, as Calculate and Algebra show them
	 */
	rational?: boolean;
	cut?: number;
}
export class Arithmetic {
	constructor(
		readonly calc: Calc,
		readonly checkMode: CheckMode = 'light'
	) {}
	async gcd(a: bigint, b: bigint): Promise<bigint> {
		a = magnitude(a);
		b = magnitude(b);
		while (b !== 0n) {
			const { r } = await this.calc.divmod(a, b);
			if (r < 0n || r >= b) throw new CheckFailed('Invalid division remainder');
			a = b;
			b = r;
		}
		return a;
	}
	async exact(a: bigint, b: bigint): Promise<bigint> {
		if (b === 0n) throw new CheckFailed('Exact division by zero');
		if (b === 1n) return a;
		if (b === -1n) return flip(a);
		const { q, r } = await this.calc.divmod(magnitude(a), magnitude(b));
		if (r !== 0n) throw new CheckFailed('Exact division left a remainder');
		return a < 0n !== b < 0n ? flip(q) : q;
	}
	async fraction(n: bigint, d: bigint, approximate = false): Promise<Rational> {
		if (d === 0n) throw new Error('Division by zero');
		if (d < 0n) {
			n = flip(n);
			d = flip(d);
		}
		if (d === 1n) return { n, d, approximate };
		const { q, r } = await this.calc.divmod(magnitude(n), d);
		if (r === 0n) return { n: n < 0n ? flip(q) : q, d: 1n, approximate };
		const g = await this.gcd(d, r);
		if (g === 1n) return { n, d, approximate };
		const [num, den] = await this.calc.wave([() => this.exact(n, g), () => this.exact(d, g)]);
		return { n: num, d: den, approximate };
	}
	async add(a: Rational, b: Rational, subtract = false): Promise<Rational> {
		const op = subtract ? this.calc.sub.bind(this.calc) : this.calc.add.bind(this.calc);
		const approximate = !!(a.approximate || b.approximate);
		if (a.d === b.d) return this.fraction(await op(a.n, b.n), a.d, approximate);
		const [left, right, den] = await this.calc.wave([
			() => this.calc.mul(a.n, b.d),
			() => this.calc.mul(b.n, a.d),
			() => this.calc.mul(a.d, b.d)
		]);
		return this.fraction(await op(left, right), den, approximate);
	}
	async mul(a: Rational, b: Rational): Promise<Rational> {
		const [n, d] = await this.calc.wave([
			() => this.calc.mul(a.n, b.n),
			() => (a.d === 1n && b.d === 1n ? Promise.resolve(1n) : this.calc.mul(a.d, b.d))
		]);
		return this.fraction(n, d, !!(a.approximate || b.approximate));
	}
	async div(a: Rational, b: Rational): Promise<Rational> {
		const [n, d] = await this.calc.wave([
			() => (b.d === 1n ? Promise.resolve(a.n) : this.calc.mul(a.n, b.d)),
			() => (a.d === 1n ? Promise.resolve(b.n) : this.calc.mul(a.d, b.n))
		]);
		return this.fraction(n, d, !!(a.approximate || b.approximate));
	}
	async pow(a: Rational, e: number): Promise<Rational> {
		if (e === 0) return integer(1n);
		let out = a;
		for (let i = 1; i < Math.abs(e); i++) out = await this.mul(out, a);
		return e < 0 ? this.div(integer(1n), out) : out;
	}
	async quantize(a: Rational, places: number): Promise<Rational> {
		if (a.d === 1n) return a;
		const scale = ten(places);
		const { q, r } = await this.calc.divmod(await this.calc.mul(magnitude(a.n), scale), a.d);
		return this.fraction(a.n < 0n ? flip(q) : q, scale, !!a.approximate || r !== 0n);
	}
	async sqrt(a: Rational, places?: number, exact = false): Promise<Rational> {
		if (a.n < 0n) throw new Error('Square root has no real value');
		const [nr, dr] = await this.calc.wave([
			() => this.calc.isqrt(a.n),
			() => (a.d === 1n ? Promise.resolve({ root: 1n, rem: 0n }) : this.calc.isqrt(a.d))
		]);
		if (nr.rem === 0n && dr.rem === 0n) {
			const root = await this.fraction(nr.root, dr.root, !!a.approximate);
			if (exact) return root;
			const cut = await this.quantize(root, places ?? 12);
			return places !== undefined || cut.approximate ? cut : root;
		}
		if (exact) throw new Error('Irrational value is not allowed in exact evaluation');
		const k = places ?? 12,
			scale = ten(k);
		const scaled = await this.calc.mul(a.n, ten(2 * k));
		const { q } = await this.calc.divmod(scaled, a.d);
		const { root } = await this.calc.isqrt(q);
		return this.fraction(root, scale, true);
	}
	/** Evaluate a point as a dependency graph. A shared node is finished before any
	 * wave that consumes it; merely sharing a pending promise across jobs would undercount
	 * its dependent job's critical path in the reference max-job cost model.
	 */
	async evaluate(
		expr: Expr,
		env: Environment = new Map(),
		options: EvaluationOptions = {}
	): Promise<Rational> {
		return (await this.evaluateMany([expr], env, options))[0];
	}
	async evaluateMany(
		expressions: Expr[],
		env: Environment = new Map(),
		options: EvaluationOptions = {}
	): Promise<Rational[]> {
		interface Node {
			key: string;
			depth: number;
			work: () => Promise<Rational>;
		}
		const nodes = new Map<string, Node>(),
			values = new Map<string, Rational>();
		const register = (key: string, deps: string[], work: () => Promise<Rational>): string => {
			if (!nodes.has(key))
				nodes.set(key, {
					key,
					depth: deps.length ? 1 + Math.max(...deps.map((k) => nodes.get(k)!.depth)) : 0,
					work
				});
			return key;
		};
		const value = (key: string) => values.get(key)!;
		const power = (base: string, n: number): string => {
			if (n === 1) return base;
			const key = `power:${base}:${n}`;
			if (nodes.has(key)) return key;
			if (n === 0) return register(key, [base], async () => integer(1n));
			const prev = power(base, n - 1);
			return register(key, [prev, base], () => this.mul(value(prev), value(base)));
		};
		const build = (e: Expr): string => {
			const key = JSON.stringify(e);
			if (nodes.has(key)) return key;
			if (e.kind === 'number')
				return register(key, [], () => {
					const [whole, frac = ''] = e.text.split('.');
					return this.fraction(BigInt((whole || '0') + frac), ten(frac.length));
				});
			if (e.kind === 'name')
				return register(key, [], async () => {
					const n = env.get(e.name);
					if (!n) throw new Error(`Unknown name ${e.name}`);
					return options.positive ? { ...n, n: magnitude(n.n) } : n;
				});
			if (e.kind === 'unary') {
				const child = build(e.value);
				return register(key, [child], async () => {
					const v = value(child);
					if (e.op === 'sqrt')
						return this.sqrt(
							v,
							options.places ?? (options.rational ? options.cut : undefined),
							options.exact
						);
					return e.op === '-' && !options.positive ? { ...v, n: flip(v.n) } : v;
				});
			}
			const left = build(e.left);
			if (e.kind === 'binary' && e.op === '^') {
				const exp = exponent(e.right),
					p = power(left, Math.abs(exp));
				// A positive power already names the computed node. An alias must not
				// insert a scheduling barrier that delays independent consumers.
				if (exp >= 0) return p;
				return register(key, [p], () => this.div(integer(1n), value(p)));
			}
			const right = build(e.right);
			return register(key, [left, right], async () => {
				const a = value(left),
					b = value(right);
				if (e.kind === 'gcd') {
					if (a.d !== 1n || b.d !== 1n) throw new Error('gcd needs integer arguments');
					return integer(await this.gcd(a.n, b.n));
				}
				if (e.op === '+') return this.add(a, b);
				if (e.op === '-') return this.add(a, b, !options.positive);
				if (e.op === '*') return this.mul(a, b);
				const q = await this.div(a, b);
				if (options.exact || (options.rational && options.places === undefined)) return q;
				const cut = await this.quantize(q, options.places ?? 12);
				return options.places !== undefined || cut.approximate ? cut : q;
			});
		};
		const roots = expressions.map(build);
		const levels: Node[][] = [];
		for (const node of nodes.values()) (levels[node.depth] ??= []).push(node);
		for (const level of levels)
			if (level)
				await this.calc.wave(
					level.map((node) => async () => {
						values.set(node.key, await node.work());
					})
				);
		return roots.map(value);
	}
	async equal(a: Rational, b: Rational): Promise<boolean> {
		if (a.d === b.d) return a.n === b.n;
		const [left, right] = await this.calc.wave([
			() => this.calc.mul(a.n, b.d),
			() => this.calc.mul(b.n, a.d)
		]);
		return left === right;
	}
	async decimal(a: Rational, places = 12, fixed = false): Promise<string> {
		// An integer is already a sheet-produced digit row. Padding its decimal point is layout.
		if (a.d === 1n)
			return (
				a.n.toString() +
				(fixed && places ? '.' + '0'.repeat(places) : '') +
				(a.approximate ? '…' : '')
			);
		const { q, r } = await this.calc.divmod(await this.calc.mul(magnitude(a.n), ten(places)), a.d);
		const digits = q.toString().padStart(places + 1, '0');
		let result = places ? digits.slice(0, -places) + '.' + digits.slice(-places) : digits;
		if (!fixed && places) result = result.replace(/0+$/, '').replace(/\.$/, '');
		if (a.n < 0n && q !== 0n) result = '-' + result;
		return result + (r !== 0n || a.approximate ? '…' : '');
	}
	async rootText(a: Rational): Promise<string> {
		return a.d === 1n ? a.n.toString() : `${a.n}/${a.d} (≈ ${await this.decimal(a, 6, true)})`;
	}
}
