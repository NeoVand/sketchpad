import {
	Arithmetic,
	flip,
	integer,
	magnitude,
	type CheckMode,
	type Environment,
	type EvaluationOptions,
	type Rational
} from './arithmetic';
import { TraceCalc, type Calc, type Result, type ScalarOp } from './calc';
import type { Equation, Expr } from './parse';

export type DerivationKind =
	| 'given'
	| 'expand'
	| 'evaluate'
	| 'collect'
	| 'move'
	| 'divide'
	| 'formula'
	| 'check'
	| 'result'
	| 'approximation';
export interface NumberSource {
	call: number;
	field: string;
	value: bigint;
}
export interface Quantity {
	value: Rational;
	n?: NumberSource;
	d?: NumberSource;
}
export interface NumberSpan {
	id: string;
	call: number;
	field: string;
	value: string;
	displayed: string;
	signFlipped: boolean;
	decimalPlaces: number;
	discardedDigits?: number;
}
export interface DerivationLine {
	tex: string;
	kind: DerivationKind;
	/** Global trace index after all work needed to establish this line has completed. */
	readyAfterCall: number;
	note?: string;
	calls: number[];
	numbers: NumberSpan[];
	/** Identities proving the displayed rewrite, not an assertion that a solving equation holds for every x. */
	identities: Equation[];
	equations?: Equation[];
	roots?: { equation: Equation; point: Record<string, Rational> }[];
	bounds?: { equation: Equation; lower: Rational; upper: Rational }[];
	given?: Expr | Equation[];
	candidates?: { constant: Expr; leading: Expr; values: Rational[] };
	radicalApproximation?: { exact: Expr[]; displayed: Expr[] };
	approximation?: { expression: Expr; value: Rational; places?: number };
	conditions?: { expression: Expr; relation: 'zero' | 'nonzero' | 'negative' }[];
}
export interface Derivation {
	lines: DerivationLine[];
	path: 'textbook' | 'evaluation';
	traceOffset: number;
}
export const num = (n: bigint | string): Expr => ({ kind: 'number', text: String(n) });
export const variable = (name: string): Expr => ({ kind: 'name', name });
export const binary = (op: '+' | '-' | '*' | '/' | '^', left: Expr, right: Expr): Expr => ({
	kind: 'binary',
	op,
	left,
	right
});
export const residual = (eq: Equation): Expr => binary('-', eq.left, eq.right);
export const literal = (n: bigint): Quantity => ({ value: integer(n) });
export const negate = (q: Quantity): Quantity => ({
	...q,
	value: { ...q.value, n: flip(q.value.n) }
});
export function fields(result: Result): [string, bigint][] {
	return typeof result === 'bigint' ? [['value', result]] : Object.entries(result);
}
class CapturedCalc implements Calc {
	readonly indices: number[] = [];
	constructor(readonly trace: TraceCalc) {}
	private async call(op: ScalarOp, args: bigint[]) {
		const { index, result } = await this.trace.indexed(op, args);
		this.indices.push(index);
		return result;
	}
	add(a: bigint, b: bigint) {
		return this.call('add', [a, b]) as Promise<bigint>;
	}
	sub(a: bigint, b: bigint) {
		return this.call('sub', [a, b]) as Promise<bigint>;
	}
	mul(a: bigint, b: bigint) {
		return this.call('mul', [a, b]) as Promise<bigint>;
	}
	divmod(a: bigint, b: bigint) {
		return this.call('divmod', [a, b]) as Promise<{ q: bigint; r: bigint }>;
	}
	isqrt(a: bigint) {
		return this.call('isqrt', [a]) as Promise<{ root: bigint; rem: bigint }>;
	}
	wave<T>(jobs: (() => Promise<T>)[]) {
		return this.trace.wave(jobs);
	}
}
export class DerivationBuilder {
	readonly derivation: Derivation;
	/** Run only after the statement's exact solving/factoring work has finished. */
	readonly pendingApproximations: (() => Promise<string>)[] = [];
	private sources = new WeakMap<Expr, NumberSource>();
	private scales = new WeakMap<Expr, number>();
	private discarded = new WeakMap<Expr, number>();
	constructor(
		readonly trace: TraceCalc,
		readonly mode: CheckMode,
		readonly env: Environment = new Map(),
		readonly prefix = 'd0',
		path: 'textbook' | 'evaluation' = 'textbook',
		readonly known: Quantity[] = [],
		readonly places?: number,
		readonly approximate = true
	) {
		this.derivation = { lines: [], path, traceOffset: trace.calls.length };
	}
	inputs(e: Expr): Quantity[] {
		const found: Quantity[] = [];
		const walk = (v: Expr) => {
			const source = this.sources.get(v);
			if (source) found.push({ value: integer(source.value), n: source });
			if (v.kind === 'unary') walk(v.value);
			else if (v.kind === 'binary' || v.kind === 'gcd') {
				walk(v.left);
				walk(v.right);
			}
		};
		walk(e);
		return found;
	}
	from(value: Rational, indices: number[] = [], inputs: Quantity[] = []): Quantity {
		const source = (v: bigint): NumberSource | undefined => {
			for (const i of [...indices].reverse())
				for (const [field, n] of fields(this.trace.calls[i].result))
					if (magnitude(v) === magnitude(n)) return { call: i, field, value: n };
			for (const q of inputs)
				for (const ref of [q.n, q.d]) if (ref && magnitude(v) === magnitude(ref.value)) return ref;
		};
		return { value, n: source(value.n), d: value.d === 1n ? undefined : source(value.d) };
	}
	async compute(
		work: (a: Arithmetic) => Promise<Rational>,
		inputs: Quantity[] = []
	): Promise<Quantity> {
		const c = new CapturedCalc(this.trace),
			value = await work(new Arithmetic(c, this.mode));
		return this.from(value, c.indices, [...inputs, ...this.known]);
	}
	/**
	 * An expression worked the way a textbook writes it. After each level of its evaluation (every operation whose
	 * operands are known: one wave of calls) comes a line `= …` with the computed numbers in place of the operations
	 * they replace, each number from the call that computed it: `47·1186 − 39862`, `= 55742 − 39862`, then the
	 * caller's result line. A level that changes nothing on show (a power's inner step) writes no line, and a cut
	 * (approximate) value ends the chain, so every `=` line is exact. The calls are those of `Arithmetic.evaluate`,
	 * unchanged. Returns the value and the last expression shown (the result line's left side).
	 */
	async evaluate(
		e: Expr,
		options: EvaluationOptions = {}
	): Promise<{ value: Quantity; shown: Expr }> {
		const c = new CapturedCalc(this.trace);
		const computed = (x: Expr) =>
			x.kind === 'binary' || x.kind === 'gcd' || (x.kind === 'unary' && x.op === 'sqrt');
		let shown = e,
			last = this.plain(e),
			exact = true;
		const value = await new Arithmetic(c, this.mode).evaluate(e, this.env, {
			...options,
			onLevel: (level, top, valueOf) => {
				if (level === 0 || level >= top || !exact) return;
				const at = (x: Expr): Expr => {
					const v = computed(x) ? valueOf(x) : undefined;
					if (v && v.level <= level) {
						if (v.value.approximate) exact = false;
						return this.expr(this.from(v.value, c.indices, this.known));
					}
					if (x.kind === 'unary') return { ...x, value: at(x.value) };
					if (x.kind === 'binary' || x.kind === 'gcd')
						return { ...x, left: at(x.left), right: at(x.right) };
					return x;
				};
				const next = at(e),
					text = this.plain(next);
				if (!exact || text === last) return;
				this.identity('evaluate', shown, next);
				shown = next;
				last = text;
			}
		});
		return { value: this.from(value, c.indices, this.known), shown };
	}
	async int(work: (c: Calc) => Promise<bigint>, inputs: Quantity[] = []): Promise<Quantity> {
		return this.compute(async (a) => integer(await work(a.calc)), inputs);
	}
	async add(a: Quantity, b: Quantity, subtract = false) {
		return this.compute((c) => c.add(a.value, b.value, subtract), [a, b]);
	}
	async mul(a: Quantity, b: Quantity) {
		if (a.value.n === 1n && a.value.d === 1n) return b;
		if (b.value.n === 1n && b.value.d === 1n) return a;
		return this.compute((c) => c.mul(a.value, b.value), [a, b]);
	}
	async div(a: Quantity, b: Quantity) {
		return this.compute((c) => c.div(a.value, b.value), [a, b]);
	}
	expr(q: Quantity): Expr {
		const n = num(q.value.n);
		if (q.n) this.sources.set(n, q.n);
		if (q.value.d === 1n) return n;
		const d = num(q.value.d);
		if (q.d) this.sources.set(d, q.d);
		return binary('/', n, d);
	}
	decimalExpr(q: Quantity, places: number, shownPlaces = places): Expr {
		const digits = magnitude(q.value.n)
			.toString()
			.padStart(places + 1, '0');
		const e = num(
			(q.value.n < 0n ? '-' : '') +
				digits.slice(0, -places) +
				'.' +
				digits.slice(-places).slice(0, shownPlaces)
		);
		if (q.n) this.sources.set(e, q.n);
		this.scales.set(e, shownPlaces);
		if (places > shownPlaces) this.discarded.set(e, places - shownPlaces);
		return e;
	}
	private render(e: Expr, spans: NumberSpan[], line: number, parent = 0): string {
		const render = (x: Expr, p = 0) => this.render(x, spans, line, p);
		if (e.kind === 'number') {
			const source = this.sources.get(e);
			if (!source)
				return e.text.startsWith('-') && parent >= 2 ? `\\left(${e.text}\\right)` : e.text;
			const id = `${this.prefix}-l${line}-n${source.call}-${source.field}-${spans.length}`;
			spans.push({
				id,
				call: source.call,
				field: source.field,
				value: String(source.value),
				displayed: e.text,
				signFlipped:
					e.text.startsWith('-') !== source.value < 0n && BigInt(e.text.replace('.', '')) !== 0n,
				...(this.discarded.has(e) ? { discardedDigits: this.discarded.get(e) } : {}),
				decimalPlaces: this.scales.get(e) ?? 0
			});
			const text = `\\htmlId{${id}}{${e.text}}`;
			return e.text.startsWith('-') && parent >= 2 ? `\\left(${text}\\right)` : text;
		}
		if (e.kind === 'name')
			return ['x', 'y', 'z'].includes(e.name)
				? e.name
				: `\\mathrm{${e.name.replaceAll('_', '\\_')}}`;
		if (e.kind === 'gcd') return `\\gcd\\left(${render(e.left)},${render(e.right)}\\right)`;
		if (e.kind === 'unary')
			return e.op === 'sqrt'
				? `\\sqrt{${render(e.value)}}`
				: e.op === '+'
					? render(e.value, parent)
					: `-${render(e.value, 3)}`;
		if (e.op === '/') return `\\frac{${render(e.left)}}{${render(e.right)}}`;
		if (e.op === '^') return `${render(e.left, 4)}^{${render(e.right)}}`;
		const precedence = e.op === '*' ? 2 : 1;
		let right = e.right,
			op: string = e.op;
		if ((op === '+' || op === '-') && right.kind === 'unary' && right.op === '-') {
			right = right.value;
			op = op === '+' ? '-' : '+';
		}
		if ((op === '+' || op === '-') && right.kind === 'number' && right.text.startsWith('-')) {
			const positive = num(right.text.slice(1));
			const source = this.sources.get(right);
			if (source) this.sources.set(positive, source);
			right = positive;
			op = op === '+' ? '-' : '+';
		}
		let text: string;
		if (op === '*') {
			const implicit =
				right.kind === 'name' ||
				(right.kind === 'binary' &&
					((right.op === '^' && right.left.kind === 'name') ||
						right.op === '+' ||
						right.op === '-'));
			text = `${render(e.left, 2)}${implicit ? '' : '\\cdot '}${render(right, 2)}`;
		} else
			text = `${render(e.left, precedence)} ${op} ${render(right, op === '-' ? 2 : precedence)}`;
		return precedence < parent ? `\\left(${text}\\right)` : text;
	}
	line(
		kind: DerivationKind,
		display: (render: (e: Expr) => string) => string,
		data: Partial<
			Omit<DerivationLine, 'tex' | 'kind' | 'note' | 'calls' | 'numbers' | 'readyAfterCall'>
		> = {},
		note?: string | ((render: (e: Expr) => string) => string)
	) {
		const numbers: NumberSpan[] = [],
			line = this.derivation.lines.length,
			render = (e: Expr) => this.render(e, numbers, line);
		const tex = display(render),
			noteText = typeof note === 'function' ? note(render) : note;
		this.derivation.lines.push({
			kind,
			readyAfterCall: this.trace.calls.length - 1,
			tex,
			note: noteText,
			identities: [],
			...data,
			numbers,
			calls: [...new Set(numbers.map((n) => n.call))].sort((a, b) => a - b)
		});
	}
	plain(e: Expr): string {
		return this.render(e, [], 0).replace(/\\htmlId\{[^}]+\}\{([^}]*)\}/g, '$1');
	}
	identity(kind: DerivationKind, left: Expr, right: Expr, note?: string) {
		this.line(kind, (r) => `${r(left)} = ${r(right)}`, { identities: [{ left, right }] }, note);
	}
	equation(
		kind: DerivationKind,
		eq: Equation,
		before?: Equation,
		multiplier: Expr = num(1n),
		note?: string | ((r: (e: Expr) => string) => string)
	) {
		this.line(
			kind,
			(r) => `${r(eq.left)} = ${r(eq.right)}`,
			{
				equations: [eq],
				identities: before
					? [{ left: residual(before), right: binary('*', multiplier, residual(eq)) }]
					: [],
				...(kind === 'given' ? { given: [eq] } : {})
			},
			note
		);
	}
}
