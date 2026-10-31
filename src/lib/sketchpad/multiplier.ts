/**
 * The canvas runtime for long multiplication (TypeScript port of research/sketch/e3_browser/canvas_runtime.js, itself a
 * port of e4_mul.py). It holds no arithmetic and no loop knowledge: each tick it gathers a 3-cell view for the current
 * op, asks the policy (the model, or the reference table in tests) for (glyph, glyph, next-op), stamps the glyphs,
 * consumes the carry and product cells it read, and moves as the next-op says.
 */
import { B } from './sprites.ts';

export type Op = 'MUL' | 'ADD' | 'ADZ' | 'FLS' | 'NXT';
export const OPS: Op[] = ['MUL', 'ADD', 'ADZ', 'FLS', 'NXT'];
export type Row = 'a' | 'b' | 'cM' | 'p' | 'cA' | 'R';
export const ROWS: Row[] = ['a', 'b', 'cM', 'p', 'cA', 'R'];
/** one tick's answer: glyph, glyph, next-op letter (M A Z F N H) */
export type MulOut = [g1: string, g2: string, next: string];

export function reference(op: Op, v: readonly string[]): MulOut {
	if (op === 'MUL') {
		const [a, b, c] = v;
		if (a === B) return [c !== B ? c : '0', '0', 'Z'];
		const s = Number(a) * Number(b) + (c !== B ? Number(c) : 0);
		return [String(s % 10), String(Math.floor(s / 10)), 'A'];
	}
	if (op === 'ADD' || op === 'ADZ' || op === 'FLS') {
		const s = v.filter((g) => g !== B).reduce((x, g) => x + Number(g), 0);
		const nxt = ({ ADD: 'M', ADZ: 'F', FLS: 'N' } as const)[op];
		if (op === 'FLS') return [s ? String(s) : B, '-', nxt];
		return [String(s % 10), String(Math.floor(s / 10)), nxt];
	}
	if (op === 'NXT') return ['-', '-', v[0] === B ? 'H' : 'M'];
	throw new Error(op);
}

/** The answer as the characters the model writes: a blank glyph is `_`, an unused glyph `-`. */
export const outChars = (op: Op, v: readonly string[]): string[] => {
	const [g1, g2, n] = reference(op, v);
	return [g1 === B ? '_' : g1, g2, n];
};

/** All 1,553 table rows, in the order of the reference page (mul.html). */
export const MUL_DOMAIN: [Op, string[]][] = [];
for (const a of B + '0123456789')
	for (const b of '0123456789')
		for (const c of B + '012345678') MUL_DOMAIN.push(['MUL', [a, b, c]]);
for (const op of ['ADD', 'ADZ'] as const)
	for (const c of B + '1')
		for (const p of '0123456789')
			for (const r of B + '0123456789') MUL_DOMAIN.push([op, [c, p, r]]);
for (const c of B + '1') MUL_DOMAIN.push(['FLS', [c, B, B]]);
for (const b of B + '0123456789') MUL_DOMAIN.push(['NXT', [b, B, B]]);

const r2s = (row: string[]) =>
	[...row]
		.reverse()
		.join('')
		.trim()
		.replace(/^0+(?=\d)/, '') || '0';

const clean = (s: string) => s.replace(/\D/g, '');

export class MulSheet {
	readonly n: number;
	readonly m: number;
	readonly W: number;
	readonly rows: Record<Row, string[]>;
	op: Op = 'MUL';
	/** the column (power of ten) being worked */
	x = 0;
	/** the multiplier digit (pass) being worked */
	j = 0;
	ticks = 0;
	done = false;
	edits = 0;

	constructor(a: string, b: string) {
		a = clean(a);
		b = clean(b);
		this.n = a.length;
		this.m = b.length;
		this.W = this.n + this.m + 2;
		this.rows = Object.fromEntries(ROWS.map((k) => [k, Array(this.W).fill(B)])) as Record<
			Row,
			string[]
		>;
		[...a].reverse().forEach((d, i) => (this.rows.a[i] = d));
		[...b].reverse().forEach((d, i) => (this.rows.b[i] = d));
	}

	get(row: Row, x: number) {
		return x >= 0 && x < this.W ? this.rows[row][x] : B;
	}

	view(): string[] {
		const { op, x, j } = this;
		if (op === 'MUL') return [this.get('a', x - j), this.get('b', j), this.get('cM', x)];
		if (op === 'NXT') return [this.get('b', j + 1), B, B];
		return [this.get('cA', x), this.get('p', x), this.get('R', x)];
	}

	/** The sheet cells the current view reads, in strip order; null for a strip cell that is always blank. */
	fovea(): ([Row, number] | null)[] {
		const { op, x, j } = this;
		if (this.done) return [];
		if (op === 'MUL')
			return [
				['a', x - j],
				['b', j],
				['cM', x]
			];
		if (op === 'NXT') return [['b', j + 1], null, null];
		return [
			['cA', x],
			['p', x],
			['R', x]
		];
	}

	/** apply one policy output; returns false when halted */
	apply([g1, g2, nxt]: MulOut): boolean {
		const r = this.rows;
		const x = this.x;
		this.ticks++;
		if (this.op === 'MUL') {
			r.cM[x] = B;
			r.p[x] = g1;
			if (x + 1 < this.W) r.cM[x + 1] = g2;
			this.op = nxt === 'A' ? 'ADD' : 'ADZ';
		} else if (this.op === 'ADD' || this.op === 'ADZ') {
			r.cA[x] = B;
			r.p[x] = B;
			r.R[x] = g1;
			if (x + 1 < this.W) r.cA[x + 1] = g2 === '1' ? '1' : B;
			this.op = nxt === 'M' ? 'MUL' : 'FLS';
			this.x = x + 1;
		} else if (this.op === 'FLS') {
			r.cA[x] = B;
			if (g1 !== B) r.R[x] = g1;
			this.op = 'NXT';
		} else {
			// the scratch rows are cleared at every pass boundary, the last one included, so no stale carry stays drawn
			for (const k of ['cM', 'p', 'cA'] as const) r[k].fill(B);
			if (nxt === 'H') {
				this.done = true;
				return false;
			}
			this.j++;
			this.op = 'MUL';
			this.x = this.j;
		}
		return true;
	}

	/** A multiplier digit of a later pass can be changed. */
	editable(row: Row, x: number) {
		return !this.done && row === 'b' && x > this.j && x < this.m;
	}

	bump(row: Row, x: number, by = 1): boolean {
		if (!this.editable(row, x)) return false;
		this.rows.b[x] = String((Number(this.rows.b[x]) + 10 + by) % 10);
		this.edits++;
		return true;
	}

	operands(): [string, string] {
		return [r2s(this.rows.a), r2s(this.rows.b)];
	}

	result() {
		return r2s(this.rows.R);
	}

	expected() {
		const [a, b] = this.operands();
		return (BigInt(a) * BigInt(b)).toString();
	}
}

/** A pass of the multiplier: the digit of b it multiplies by (j), its column (x) and its step. */
export interface Pass {
	j: number;
	x: number;
	op: Op;
	done: boolean;
}

/**
 * Long multiplication with its passes overlapped, as a wave. Pass j + 1 starts LAG ticks after pass j: two columns
 * behind it, which is when the running result it reads is ready, and far enough that the passes never share a scratch
 * cell (one column is not). All passes take a tick together, so a step is one batch of independent views; each view
 * is one of the 1,553 the certificate checks, and each answer is applied by the same rules as one pass at a time. The
 * runtime starts the passes (one per digit of b); the model still takes every step inside a pass, and its next-step
 * answer at the end of each pass (another pass, or halt) must agree with the schedule.
 */
export class MulWave {
	static readonly LAG = 6;
	readonly n: number;
	readonly m: number;
	readonly W: number;
	readonly rows: Record<Row, string[]>;
	readonly passes: Pass[] = [];
	/** batched steps taken, and ticks (views answered) */
	steps = 0;
	ticks = 0;
	done = false;
	edits = 0;

	constructor(a: string, b: string) {
		a = clean(a);
		b = clean(b);
		this.n = a.length;
		this.m = b.length;
		this.W = this.n + this.m + 2;
		this.rows = Object.fromEntries(ROWS.map((k) => [k, Array(this.W).fill(B)])) as Record<
			Row,
			string[]
		>;
		[...a].reverse().forEach((d, i) => (this.rows.a[i] = d));
		[...b].reverse().forEach((d, i) => (this.rows.b[i] = d));
		this.startDue();
	}

	get(row: Row, x: number) {
		return x >= 0 && x < this.W ? this.rows[row][x] : B;
	}

	private startDue() {
		while (this.passes.length < this.m && this.steps >= this.passes.length * MulWave.LAG) {
			const j = this.passes.length;
			this.passes.push({ j, x: j, op: 'MUL', done: false });
		}
	}

	/** the passes that take the next step */
	active(): Pass[] {
		return this.passes.filter((q) => !q.done);
	}

	view(q: Pass): string[] {
		const { op, x, j } = q;
		if (op === 'MUL') return [this.get('a', x - j), this.get('b', j), this.get('cM', x)];
		if (op === 'NXT') return [this.get('b', j + 1), B, B];
		return [this.get('cA', x), this.get('p', x), this.get('R', x)];
	}

	/** the cells a pass reads now, in strip order (null for a strip cell that is always blank) */
	foveaOf(q: Pass): ([Row, number] | null)[] {
		const { op, x, j } = q;
		if (op === 'MUL')
			return [
				['a', x - j],
				['b', j],
				['cM', x]
			];
		if (op === 'NXT') return [['b', j + 1], null, null];
		return [
			['cA', x],
			['p', x],
			['R', x]
		];
	}

	/** apply one pass's answer (the views of a step are all read before any answer is applied) */
	apply(q: Pass, [g1, g2, nxt]: MulOut) {
		const r = this.rows;
		const x = q.x;
		const set = (row: Row, at: number, g: string) => {
			if (at >= 0 && at < this.W) r[row][at] = g;
		};
		this.ticks++;
		if (q.op === 'MUL') {
			set('cM', x, B);
			set('p', x, g1);
			set('cM', x + 1, g2);
			q.op = nxt === 'A' ? 'ADD' : 'ADZ';
		} else if (q.op === 'ADD' || q.op === 'ADZ') {
			set('cA', x, B);
			set('p', x, B);
			set('R', x, g1);
			set('cA', x + 1, g2 === '1' ? '1' : B);
			q.op = nxt === 'M' ? 'MUL' : 'FLS';
			q.x = x + 1;
		} else if (q.op === 'FLS') {
			set('cA', x, B);
			if (g1 !== B) set('R', x, g1);
			q.op = 'NXT';
		} else {
			// the pass is over: its last multiply left a zero carry one column on; another pass or halt is the schedule's
			set('cM', x, B);
			const last = q.j === this.m - 1;
			if ((nxt === 'H') !== last)
				throw new Error(
					`pass ${q.j + 1} of ${this.m} ended with ${nxt === 'H' ? 'halt' : 'another pass'}, the schedule says otherwise`
				);
			q.done = true;
		}
	}

	/** after every active pass has applied its answer: the next step, and the passes due by then */
	endStep() {
		this.steps++;
		this.startDue();
		this.done = this.passes.length === this.m && this.passes.every((q) => q.done);
	}

	/** a digit of b whose pass has not started can be changed */
	editable(row: Row, x: number) {
		return !this.done && row === 'b' && x >= this.passes.length && x < this.m;
	}

	bump(row: Row, x: number, by = 1): boolean {
		if (!this.editable(row, x)) return false;
		this.rows.b[x] = String((Number(this.rows.b[x]) + 10 + by) % 10);
		this.edits++;
		return true;
	}

	operands(): [string, string] {
		return [r2s(this.rows.a), r2s(this.rows.b)];
	}

	result() {
		return r2s(this.rows.R);
	}

	expected() {
		const [a, b] = this.operands();
		return (BigInt(a) * BigInt(b)).toString();
	}
}

/** The wave run to the end, with a batch policy (the model, or the reference table in tests). */
export async function multiplyWave(
	a: string,
	b: string,
	policy: (items: { op: Op; cells: string[] }[]) => Promise<MulOut[]> | MulOut[]
): Promise<MulWave> {
	const w = new MulWave(a, b);
	while (!w.done) {
		const act = w.active();
		const outs = await policy(act.map((q) => ({ op: q.op, cells: w.view(q) })));
		act.forEach((q, i) => w.apply(q, outs[i]));
		w.endStep();
	}
	return w;
}

export async function multiply(
	a: string,
	b: string,
	policy: (op: Op, v: string[]) => Promise<MulOut> | MulOut,
	onTick?: (cv: MulSheet, out: MulOut) => Promise<void> | void
): Promise<MulSheet> {
	const cv = new MulSheet(a, b);
	for (;;) {
		const out = await policy(cv.op, cv.view());
		if (onTick) await onTick(cv, out);
		if (!cv.apply(out)) break;
	}
	return cv;
}
