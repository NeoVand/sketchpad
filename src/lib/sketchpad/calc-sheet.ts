/**
 * The calculator on the sheet: signed sums and differences, Knuth's long division (Algorithm D) and the digit-by-digit
 * square root, each a schedule of steps in which the model reads three cells and answers (research/sketch/
 * calc_dryrun.py has the same procedures in Python, CALC3.md the design). The runtime here holds no arithmetic: it lays
 * digits out, moves its window, copies digits it has already read (bringing a digit down, sliding the divisor), and
 * follows the model's answers. Every digit of a result is written by the model, every branch (a borrow out, a guess
 * of zero, an add-back that crosses zero) is the model's next-step answer, and every view is a row of a certified
 * table (ADD_DOMAIN, MUL_DOMAIN, CALC_DOMAIN).
 *
 * The runtime does choose a few things from the digits it lays out: the scale of a division (f, so that the divisor
 * starts with 5 or more) and of a square root (c, so that the root starts with 25 to 49), and the starting guess of a
 * root's first two digits. None of these can change a digit of an answer: every guess is at least the true digit
 * (EST is never too low, and the starting guesses are the largest the scale allows), each is checked by a certified
 * multiply-subtract, and only a certified DEC lowers it. A wrong choice could only cost steps, or read a view outside
 * the table, which the page reports as uncertified.
 */
import { AddSheet, addCode, addDecode, addRule } from './adder.ts';
import { calcRef, isCalcOp } from './calc-tables.ts';
import { MulWave, reference, type Op } from './multiplier.ts';
import type { TickOp } from './protocol.ts';
import { B } from './sprites.ts';

/** One view the model answers: an op and three glyphs. */
export interface View {
	op: TickOp;
	cells: string[];
}

/** The answers to a batch of views: ADD-FAST one token, every other op three characters. */
export type Policy = (views: View[]) => Promise<string[][]> | string[][];

/** The true answer of any view (the reference tables in place of the model). */
export function referenceAnswer(op: TickOp, cells: readonly string[]): string[] {
	if (op === 'ADD-FAST') return [addCode(addRule(cells))];
	if (isCalcOp(op)) return calcRef(op, cells);
	return reference(op as Op, cells);
}

export const referencePolicy: Policy = (views) => views.map((v) => referenceAnswer(v.op, v.cells));

/** A step the model answered that the procedure cannot follow (a non-digit, a step against the schedule). */
export class SheetError extends Error {}

export class Stopped extends Error {
	constructor() {
		super('stopped');
	}
}

export interface GridRowSpec {
	key: string;
	label: string;
	/** scratch (carries, borrows): drawn lighter */
	dim?: boolean;
	/** a ruled line above this row */
	rule?: boolean;
}

/** A sheet of named rows. Cell x of a row is the digit of 10^x; the page draws column W - 1 - x. */
export class Grid {
	readonly title: string;
	readonly W: number;
	readonly specs: GridRowSpec[];
	readonly rows: Record<string, string[]> = {};
	/** the cells the current step reads, per view (null: a strip cell that is always blank) */
	fovea: ([string, number] | null)[][] = [];
	done = false;

	constructor(title: string, W: number, specs: GridRowSpec[]) {
		this.title = title;
		this.W = W;
		this.specs = specs;
		for (const s of specs) this.rows[s.key] = Array(W).fill(B);
	}

	get(row: string, x: number) {
		return x >= 0 && x < this.W ? this.rows[row][x] : B;
	}

	set(row: string, x: number, g: string) {
		if (x >= 0 && x < this.W) this.rows[row][x] = g;
	}

	/** write a number (most significant digit first) so that its last digit sits at x0 */
	put(row: string, digits: string, x0 = 0) {
		[...digits].reverse().forEach((d, i) => this.set(row, x0 + i, d));
	}

	clear(row: string) {
		this.rows[row].fill(B);
	}

	/** the digits of cells x0 .. x1 - 1, most significant first (blanks as they are) */
	read(row: string, x0: number, x1: number) {
		let s = '';
		for (let x = x1 - 1; x >= x0; x--) s += this.get(row, x);
		return s;
	}
}

/** what the page shows: the sheet in use (the adder's and the multiplier's own sheets, or a grid) */
export type CalcSheet = Grid | AddSheet | MulWave;

/** A run of the calculator: the policy, the steps taken, and the sheet on view. */
export class Run {
	readonly policy: Policy;
	/** batched calls (decoder forwards) and views answered */
	steps = 0;
	ticks = 0;
	sheet: CalcSheet | null = null;
	/** every view answered, for the certificate's record of rows read */
	onViews?: (views: View[], outs: string[][]) => void;
	/** after every step (the page redraws, paces, and may stop the run by throwing) */
	onStep?: () => void | Promise<void>;
	/** sheets shown in order (for a page that keeps the history) */
	onShow?: (s: CalcSheet) => void;

	constructor(policy: Policy) {
		this.policy = policy;
	}

	show(s: CalcSheet) {
		this.sheet = s;
		this.onShow?.(s);
	}

	async step(views: View[], fovea: ([string, number] | null)[][] = []): Promise<string[][]> {
		if (this.sheet instanceof Grid) this.sheet.fovea = fovea;
		const outs = await this.policy(views);
		if (outs.length !== views.length)
			throw new SheetError('the model answered the wrong number of views');
		outs.forEach((o, i) => {
			const want = views[i].op === 'ADD-FAST' ? 1 : 3;
			if (o.length !== want || o.some((c) => typeof c !== 'string' || c.length !== 1))
				throw new SheetError(`the model's answer ${JSON.stringify(o)} is not ${want} characters`);
		});
		this.steps++;
		this.ticks += views.length;
		this.onViews?.(views, outs);
		await this.onStep?.();
		return outs;
	}

	/** the M4's cost model (CALC3.md): 0.065 s per call and 0.037 s per view, inside view off */
	get seconds() {
		return 0.065 * this.steps + 0.037 * this.ticks;
	}
}

/**
 * Several procedures at once, one decoder call per step of all of them: each procedure's step waits until every
 * procedure under way has asked for its next step (or ended), then all their views go to the model in one batch, which
 * needs every view in the one prompt form (models.ts: the adder's prompt padded like the slotted ones). Procedures that
 * run one after another simply take turns; batching changes how many calls there are, never an answer.
 */
export class Mux {
	readonly policy: Policy;
	/** decoder calls and views answered */
	calls = 0;
	views = 0;
	private active = 0;
	private waiting: {
		views: View[];
		resolve: (o: string[][]) => void;
		reject: (e: unknown) => void;
	}[] = [];
	private checking = false;

	constructor(policy: Policy) {
		this.policy = policy;
	}

	enter() {
		this.active++;
	}

	leave() {
		this.active--;
		void this.check();
	}

	request(views: View[]): Promise<string[][]> {
		return new Promise((resolve, reject) => {
			this.waiting.push({ views, resolve, reject });
			void this.check();
		});
	}

	private async check() {
		if (this.checking) return;
		this.checking = true;
		// a few turns of the microtask queue, so a procedure that has just answered or ended can ask again first
		for (let i = 0; i < 16; i++) await null;
		this.checking = false;
		if (!this.waiting.length || this.waiting.length < this.active) return;
		const batch = this.waiting.splice(0);
		const views = batch.flatMap((b) => b.views);
		this.calls++;
		this.views += views.length;
		try {
			const outs = await this.policy(views);
			let k = 0;
			for (const b of batch) {
				b.resolve(outs.slice(k, k + b.views.length));
				k += b.views.length;
			}
		} catch (e) {
			for (const b of batch) b.reject(e);
		}
	}

	/** the M4's cost model for the calls made so far */
	get seconds() {
		return 0.065 * this.calls + 0.037 * this.views;
	}
}

const isDigit = (g: string) => /^\d$/.test(g);

function digit(g: string, what: string) {
	if (!isDigit(g)) throw new SheetError(`the model wrote ${JSON.stringify(g)} as ${what}`);
	return g;
}

function next(n: string, allowed: string, what: string) {
	if (n.length !== 1 || !allowed.includes(n))
		throw new SheetError(`the model named ${JSON.stringify(n)} as the next step of ${what}`);
	return n;
}

/** leading zeros off (an empty number is 0) */
export const trim = (s: string) => s.replace(/^[0 ]+(?=\d)/, '').replace(/^ +/, '') || '0';

// ---- addition: the adder's own sheet (one token per column) --------------------------------------------------------

export async function addMagnitudes(run: Run, a: string, b: string): Promise<string> {
	const s = new AddSheet(a, b);
	run.show(s);
	for (;;) {
		if (s.ticks > s.n + 1) throw new SheetError('the addition did not halt');
		const [[t]] = await run.step([{ op: 'ADD-FAST', cells: s.view() }]);
		const rule = addDecode(t);
		if (!rule)
			throw new SheetError(`the model wrote ${JSON.stringify(t)}, which is not an adder answer`);
		if (!s.apply(rule)) break;
	}
	return trim(s.result());
}

// ---- multiplication: the multiplier's wave of overlapped passes ----------------------------------------------------

export async function mulMagnitudes(run: Run, a: string, b: string): Promise<string> {
	// the shorter number is the multiplier: one pass per digit of it
	if (b.length > a.length) [a, b] = [b, a];
	const w = new MulWave(a, b);
	run.show(w);
	const limit = 6 * w.m + 2 * w.n + 64;
	while (!w.done) {
		if (w.steps > limit) throw new SheetError('the multiplication did not halt');
		const act = w.active();
		const outs = await run.step(act.map((q) => ({ op: q.op, cells: w.view(q) })));
		act.forEach((q, i) => {
			const [g1, g2, n] = outs[i];
			if (q.op !== 'NXT') {
				const stamps = q.op === 'FLS' ? [] : [g1, g2];
				stamps.forEach((g) => digit(g, `a ${q.op} answer`));
				if (q.op === 'FLS' && g1 !== B && !isDigit(g1))
					throw new SheetError(`the model wrote ${JSON.stringify(g1)} as a carry`);
			}
			next(n, 'MAZFNH', q.op);
			w.apply(q, [g1, g2, n]);
		});
		w.endStep();
	}
	return trim(w.result());
}

/**
 * Single-digit multiplication passes, run side by side (one batch per column): each multiplies the digits of one row
 * from x0 (most significant at x0 + n - 1) by the digit in cell `by`, in place, with its own carry row. MUL answers
 * A on a digit and Z on the blank past the number (the carry flush), which writes the top digit.
 */
async function mulPasses(
	run: Run,
	g: Grid,
	passes: { row: string; x0: number; n: number; by: [string, number]; carry: string }[]
) {
	const T = Math.max(...passes.map((p) => p.n));
	for (let t = 0; t <= T; t++) {
		const live = passes.filter((p) => t <= p.n);
		const views = live.map((p) => ({
			op: 'MUL' as TickOp,
			cells: [t < p.n ? g.get(p.row, p.x0 + t) : B, g.get(...p.by), g.get(p.carry, p.x0 + t)]
		}));
		const outs = await run.step(
			views,
			live.map((p) => [[p.row, p.x0 + t], p.by, [p.carry, p.x0 + t]])
		);
		live.forEach((p, i) => {
			const [d, c, n] = outs[i];
			next(n, t < p.n ? 'A' : 'Z', 'a multiply pass');
			g.set(p.row, p.x0 + t, digit(d, 'a product digit'));
			g.set(p.carry, p.x0 + t, B);
			if (t < p.n) g.set(p.carry, p.x0 + t + 1, digit(c, 'a carry'));
			else if (c !== '0')
				throw new SheetError(`the model carried ${JSON.stringify(c)} past the top`);
		});
	}
}

/** a × d for a single digit d, on its own small sheet */
async function mulByDigit(run: Run, a: string, d: string, title: string): Promise<string> {
	const g = new Grid(title, a.length + 2, [
		{ key: 'a', label: 'a' },
		{ key: 'by', label: '× d' },
		{ key: 'c', label: 'carry', dim: true, rule: true }
	]);
	g.put('a', a);
	g.set('by', 0, d);
	run.show(g);
	await mulPasses(run, g, [{ row: 'a', x0: 0, n: a.length, by: ['by', 0], carry: 'c' }]);
	g.done = true;
	return trim(g.read('a', 0, a.length + 1));
}

/** a × b, by passes for a one-digit factor and by the multiplier's wave otherwise */
const mulAny = (run: Run, a: string, b: string, title: string) =>
	b.length === 1
		? mulByDigit(run, a, b, title)
		: a.length === 1
			? mulByDigit(run, b, a, title)
			: mulMagnitudes(run, a, b);

// ---- subtraction ---------------------------------------------------------------------------------------------------

/**
 * a - b, column by column with a borrow, on its own sheet. The column past both numbers is the halt: H when nothing
 * is borrowed out (a >= b, and the digits are the difference), B when a borrow comes out (a < b).
 */
export async function subOnce(
	run: Run,
	a: string,
	b: string
): Promise<{ digits: string; less: boolean }> {
	const n = Math.max(a.length, b.length);
	const g = new Grid('a − b', n + 2, [
		{ key: 'w', label: 'borrow', dim: true },
		{ key: 'a', label: 'a' },
		{ key: 'b', label: '− b' },
		{ key: 'd', label: 'a − b', rule: true }
	]);
	g.put('a', a);
	g.put('b', b);
	run.show(g);
	for (let x = 0; x <= n; x++) {
		const cells = [g.get('w', x), g.get('a', x), g.get('b', x)];
		const [[d, w, nx]] = await run.step(
			[{ op: 'SUB', cells }],
			[
				[
					['w', x],
					['a', x],
					['b', x]
				]
			]
		);
		g.set('w', x, B);
		if (x === n) {
			next(nx, 'HB', 'the last column of a subtraction');
			g.done = true;
			return { digits: trim(g.read('d', 0, n)), less: nx === 'B' };
		}
		next(nx, 'S', 'a subtraction column');
		g.set('d', x, digit(d, 'a difference digit'));
		if (digit(w, 'a borrow') === '1') g.set('w', x + 1, '1');
		else if (w !== '0') throw new SheetError(`the model borrowed ${JSON.stringify(w)}`);
	}
	throw new SheetError('unreachable');
}

/** |a| - |b| with its sign: when a borrow comes out, the same subtraction the other way round */
export async function subMagnitudes(
	run: Run,
	a: string,
	b: string
): Promise<{ digits: string; negative: boolean }> {
	const first = await subOnce(run, a, b);
	if (!first.less) return { digits: first.digits, negative: false };
	const back = await subOnce(run, b, a);
	if (back.less) throw new SheetError('both subtractions borrowed out');
	return { digits: back.digits, negative: back.digits !== '0' };
}

// ---- long division: Knuth's algorithm D ----------------------------------------------------------------------------

/** f such that f × (a divisor starting with d) starts with 5 or more: Knuth's 10 / (d + 1) */
export const divScale = (d: number) => (d >= 5 ? 1 : Math.floor(10 / (d + 1)));

/** one view, read alone */
const one = async (run: Run, op: TickOp, cells: ([string, number] | null)[], g: Grid) =>
	(await run.step([{ op, cells: cells.map((c) => (c ? g.get(...c) : B)) }], [cells]))[0];

/**
 * a ÷ b (b > 0): the quotient, and the remainder. With `remainder: false` the remainder must be zero (the call throws
 * otherwise); with `remainder: 'zero'` only whether it is zero is wanted (the scaled remainder is zero exactly when the
 * true one is), and the remainder comes back as '0' or '1'. The sheet is the schoolbook layout: the quotient above the dividend, the
 * divisor sliding under the digits it divides, the remainder below with the digit just brought down.
 *
 * 1. Scale both numbers by f (one multiply pass each, side by side) so the divisor starts with 5 or more.
 * 2. For each digit brought down: EST guesses the quotient digit from the remainder's top two digits and the divisor's
 *    first; N (a guess of 0) moves on. Otherwise one pass multiplies the divisor by the guess (MUL) and subtracts it
 *    from the remainder (SUB) a column behind, two views per call. The borrow the model writes out of the top column
 *    is the branch: none, the guess holds; one, it was too high: DEC lowers it and the adder adds the divisor back,
 *    and the carry it writes out of the top column says whether the sum crossed zero again (else lower it again).
 * 3. The remainder of the scaled numbers is f times the true one: times 10 / f and the last digit dropped (f = 2, 5),
 *    or divided by 3 (f = 3).
 */
export async function divide(
	run: Run,
	a: string,
	b: string,
	opts: { remainder?: boolean | 'zero' } = {}
): Promise<{ q: string; r: string }> {
	a = trim(a);
	b = trim(b);
	if (b === '0') throw new SheetError('division by zero');
	const f = divScale(Number(b[0]));
	// the dividend's trailing zeros stay zeros when scaled: the multiply pass skips them
	const tz = a === '0' ? 0 : a.length - a.replace(/0+$/, '').length;
	const n0 = Math.max(a.length, b.length) + 1;
	const W = n0 + 2;
	const g = new Grid('a ÷ b', W, [
		{ key: 'q', label: 'quotient' },
		{ key: 'a', label: 'a', rule: true },
		{ key: 'cA', label: 'carry', dim: true },
		{ key: 'b', label: 'b' },
		{ key: 'cB', label: 'carry ×', dim: true },
		{ key: 'by', label: '× f', dim: true },
		{ key: 'p', label: 'guess × b' },
		{ key: 'w', label: 'borrow', dim: true },
		{ key: 'r', label: 'remainder', rule: true }
	]);
	g.put('a', a);
	g.put('b', b);
	run.show(g);
	if (f > 1) {
		g.set('by', 0, String(f));
		await mulPasses(run, g, [
			{ row: 'a', x0: tz, n: a.length - tz, by: ['by', 0], carry: 'cA' },
			{ row: 'b', x0: 0, n: b.length, by: ['by', 0], carry: 'cB' }
		]);
		g.clear('by');
	}
	const A = trim(g.read('a', 0, W));
	const D = trim(g.read('b', 0, W));
	const m = D.length;
	if (m !== b.length || Number(D[0]) < 5)
		throw new SheetError('the scaled divisor does not start with 5 or more');
	// the dividend at least as long as the divisor, so there is a quotient digit to find
	const U = A.padStart(m, '0');
	const n = U.length;
	g.clear('a');
	g.clear('b');
	g.put('a', U);
	// the first m - 1 digits come down at once (fewer digits than the divisor: the quotient there is 0)
	g.put('r', '0' + U.slice(0, m - 1), n - m + 1);
	for (let j = m - 1; j < n; j++) {
		const x = n - 1 - j;
		// bring the next digit down; the remainder's old top cell (a 0) leaves the window; the divisor slides along
		g.set('r', x, g.get('a', x));
		if (g.get('r', x + m + 1) !== B && g.get('r', x + m + 1) !== '0')
			throw new SheetError('the remainder was not below the divisor');
		g.set('r', x + m + 1, B);
		if (g.get('r', x + m) === B) g.set('r', x + m, '0');
		g.clear('b');
		g.put('b', D, x);
		const [guess, , nx] = await one(
			run,
			'EST',
			[
				['r', x + m],
				['r', x + m - 1],
				['b', x + m - 1]
			],
			g
		);
		next(nx, 'MN', 'a quotient guess');
		g.set('q', x, digit(guess, 'a quotient digit'));
		if ((nx === 'N') !== (guess === '0'))
			throw new SheetError('the guess and its next step disagree');
		if (nx === 'N') continue;
		let borrow = await mulSub(run, g, x, m, { by: ['q', x], from: 'r', into: 'r' });
		while (borrow) {
			const [lower, , c] = await one(run, 'DEC', [['q', x], null, null], g);
			next(c, 'C', 'a lowered guess');
			g.set('q', x, digit(lower, 'a quotient digit'));
			borrow = !(await addBack(run, g, x, m));
		}
	}
	const q = trim(g.read('q', 0, n));
	const rn = trim(g.read('r', 0, m + 1));
	g.done = true;
	if (opts.remainder === false) {
		if (rn !== '0') throw new SheetError('the division was meant to be exact');
		return { q, r: '0' };
	}
	if (opts.remainder === 'zero') return { q, r: rn === '0' ? '0' : '1' };
	if (f === 1 || rn === '0') return { q, r: rn };
	if (f === 3) return { q, r: (await divide(run, rn, '3', { remainder: false })).q };
	// f = 2 or 5: r = rn × (10 / f) with its last digit (a zero) dropped
	const y = await mulByDigit(run, rn, String(10 / f), 'remainder × 10 / f');
	if (!y.endsWith('0')) throw new SheetError('the scaled remainder did not divide by its scale');
	return { q, r: trim(y.slice(0, -1)) };
}

/**
 * views a procedure rides along with another step's first call (independent of it): built when that call is made,
 * their answers applied right after it
 */
type Extra = () => {
	views: View[];
	fovea: ([string, number] | null)[][];
	apply: (outs: string[][]) => void;
};

/**
 * One multiply-subtract pass: the divisor row (or trial row) at x .. x + m - 1 times the digit in cell `by`, taken
 * from the remainder row `from` and written to `into`, columns x .. x + m, MUL a column ahead of SUB in each call
 * (m + 2 calls), with `pre` riding in the first call. Returns whether the model wrote a borrow out of the top column
 * (the guess was too high).
 */
async function mulSub(
	run: Run,
	g: Grid,
	x: number,
	m: number,
	o: { by: [string, number]; from: string; into: string; div?: string },
	pre?: Extra
): Promise<boolean> {
	const div = o.div ?? 'b';
	for (let t = 0; t <= m + 1; t++) {
		const views: View[] = [];
		const fov: ([string, number] | null)[][] = [];
		const mi = t <= m ? t : -1;
		const si = t >= 1 ? t - 1 : -1;
		if (mi >= 0) {
			views.push({ op: 'MUL', cells: [g.get(div, x + mi), g.get(...o.by), g.get('cB', x + mi)] });
			fov.push([[div, x + mi], o.by, ['cB', x + mi]]);
		}
		if (si >= 0) {
			views.push({
				op: 'SUB',
				cells: [g.get('w', x + si), g.get(o.from, x + si), g.get('p', x + si)]
			});
			fov.push([
				['w', x + si],
				[o.from, x + si],
				['p', x + si]
			]);
		}
		const own = views.length;
		const ride = t === 0 ? pre?.() : undefined;
		if (ride) {
			views.push(...ride.views);
			fov.push(...ride.fovea);
		}
		const outs = await run.step(views, fov);
		ride?.apply(outs.slice(own));
		if (mi >= 0) {
			const [d, c, n] = outs[0];
			next(n, mi < m ? 'A' : 'Z', 'a multiply-subtract');
			g.set('cB', x + mi, B);
			g.set('p', x + mi, digit(d, 'a product digit'));
			if (mi < m) g.set('cB', x + mi + 1, digit(c, 'a carry'));
			else if (c !== '0')
				throw new SheetError(`the model carried ${JSON.stringify(c)} past the top`);
		}
		if (si >= 0) {
			const [d, w, n] = outs[mi >= 0 ? 1 : 0];
			next(n, 'S', 'a subtraction column');
			g.set('w', x + si, B);
			g.set('p', x + si, B);
			g.set(o.into, x + si, digit(d, 'a remainder digit'));
			if (w !== '0' && w !== '1') throw new SheetError(`the model borrowed ${JSON.stringify(w)}`);
			// the borrow out of the top column is the branch, not a cell
			if (si === m) return w === '1';
			if (w === '1') g.set('w', x + si + 1, '1');
		}
	}
	throw new SheetError('unreachable');
}

/**
 * The divisor added back to a remainder that went below zero (columns x .. x + m), with the adder; the carry the
 * model writes out of the top column says whether the sum crossed zero again (it cancels the borrow). Returns crossed.
 */
async function addBack(run: Run, g: Grid, x: number, m: number): Promise<boolean> {
	for (let i = 0; i <= m; i++) {
		const [t] = await one(
			run,
			'ADD-FAST',
			[
				['w', x + i],
				['r', x + i],
				['b', x + i]
			],
			g
		);
		const rule = addDecode(t);
		if (!rule || rule === 'H')
			throw new SheetError(`the model wrote ${JSON.stringify(t)} inside the remainder`);
		g.set('w', x + i, B);
		g.set('r', x + i, rule[0]);
		if (i === m) return rule[1] === '1';
		if (rule[1] === '1') g.set('w', x + i + 1, '1');
	}
	throw new SheetError('unreachable');
}

// ---- square root, digit by digit -----------------------------------------------------------------------------------

/**
 * c in {1, 2, 4, 5} such that c^2 a has a root starting with 25 to 49 (so twice the root so far starts with 5 or more,
 * and each guess is at most 2 too high, as in division). Chosen from a's leading digits in pairs: with a = A × 100^k,
 * 1 <= A < 100, c = 4 for A < 1.5625, 2 for A < 6.25, 1 for A < 25, else 5. (CALC.md asks for c in {1, 2, 3, 5}; 4
 * covers 3's range, and makes dividing the root by c a multiplication by 10 / c or 100 / c.)
 */
export function sqrtScale(a: string): number {
	const s = (a.length % 2 ? '0' : '') + a;
	const X = Number(s.slice(0, 6).padEnd(6, '0'));
	return X < 15625 ? 4 : X < 62500 ? 2 : X < 250000 ? 1 : 5;
}

/**
 * The integer square root of a (> 0): root = floor(sqrt(a)), and whether a is a perfect square; with `remainder`,
 * also rem = a - root^2.
 *
 * 1. Scale: c^2 a by one or two multiply passes (c from sqrtScale).
 * 2. Digit by digit over the pairs of c^2 a: bring the pair down; guess the digit y (the first is 4, which the scale
 *    makes the largest possible; the second is 9 when the trial divisor starts with 4; every later one from EST on
 *    the remainder and twice the root so far); multiply the trial divisor T = (twice the root so far, then y) by y and
 *    subtract it from the remainder into a new row; no borrow out of the top keeps y, a borrow lowers it (DEC) and
 *    tries again from the old remainder. The next trial divisor is T + y (the multiplier's ADD on its last digit, and
 *    on the one before when that carries), read in the same call as the next guess.
 * 3. root = R / c: R times 10 / c (or 100 / c) with the last one or two digits dropped. a is a perfect square exactly
 *    when the scaled remainder is 0. rem from the scaled remainder rs: with c' = 10^k / c and the dropped digits e,
 *    10^(2k) rem = c'^2 rs + e (2 root 10^k + e).
 */
export async function squareRoot(
	run: Run,
	a: string,
	opts: { remainder?: boolean } = {}
): Promise<{ root: string; exact: boolean; rem: string | null }> {
	a = trim(a);
	if (a === '0') return { root: '0', exact: true, rem: '0' };
	const c = sqrtScale(a);
	const tz = a.length - a.replace(/0+$/, '').length;
	const W0 = a.length + 3;
	const g = new Grid('√a', W0 + 2, [
		{ key: 'root', label: 'root' },
		{ key: 'a', label: 'a', rule: true },
		{ key: 'cA', label: 'carry', dim: true },
		{ key: 'by', label: '× c²', dim: true },
		{ key: 'T', label: 'trial' },
		{ key: 'cB', label: 'carry ×', dim: true },
		{ key: 'p', label: 'y × trial' },
		{ key: 'w', label: 'borrow', dim: true },
		{ key: 'r', label: 'remainder', rule: true },
		{ key: 'r2', label: 'new remainder' }
	]);
	g.put('a', a);
	run.show(g);
	// c^2 is 4, 16 or 25: one pass of 4, two of 4, two of 5
	const factors = c === 1 ? [] : c === 2 ? ['4'] : c === 4 ? ['4', '4'] : ['5', '5'];
	for (const fct of factors) {
		const len = trim(g.read('a', 0, g.W)).length;
		g.set('by', 0, fct);
		await mulPasses(run, g, [{ row: 'a', x0: tz, n: len - tz, by: ['by', 0], carry: 'cA' }]);
		g.clear('by');
		const s = trim(g.read('a', 0, g.W));
		g.clear('a');
		g.put('a', s);
	}
	let M = trim(g.read('a', 0, g.W));
	if (M.length % 2) M = '0' + M;
	const pairs = M.length / 2;
	g.put('a', M);
	let m = 1; // the trial divisor's length
	/** the next digit's guess, read beside the last step of the trial divisor */
	let guessed: string[] | null = null;
	/** a carry of the trial divisor's last step still to be added to the digit before (its column) */
	let tens: number | null = null;
	/** the guess's view in the window at x with a trial divisor of mm digits */
	const guessCells = (x: number, mm: number): [string, number][] => [
		['r', x + mm],
		['r', x + mm - 1],
		['T', x + mm - 1]
	];
	/** the carry of the trial divisor's last step, added to the digit before it */
	const tensStep = (col: number) => ({
		views: [{ op: 'ADD' as TickOp, cells: [g.get('w', col), g.get('T', col), B] }],
		fovea: [[['w', col], ['T', col], null] as ([string, number] | null)[]],
		apply: ([[t1, c2, n2]]: string[][]) => {
			next(n2, 'M', 'a trial-divisor step');
			if (c2 !== '0') throw new SheetError('twice the root carried past its last digit');
			g.set('w', col, B);
			g.set('T', col, digit(t1, 'a trial digit'));
			tens = null;
		}
	});
	const tensAlone = async (col: number) => {
		const v = tensStep(col);
		v.apply(await run.step(v.views, v.fovea));
	};
	for (let k = 0; k < pairs; k++) {
		const x = 2 * (pairs - 1 - k);
		// bring the pair down; the remainder's cells above the new window are zeros and leave it
		g.set('r', x + 1, g.get('a', x + 1));
		g.set('r', x, g.get('a', x));
		for (let i = x + m + 1; i < g.W; i++) {
			if (g.get('r', i) !== B && g.get('r', i) !== '0')
				throw new SheetError('the remainder was larger than the root allows');
			g.set('r', i, B);
		}
		for (let i = x + 2; i <= x + m; i++) if (g.get('r', i) === B) g.set('r', i, '0');
		let y: string;
		if (k === 0) y = '4';
		else if (Number(g.get('T', x + m - 1)) < 5) y = '9';
		else {
			const [guess, , nx] = guessed ?? (await one(run, 'EST', guessCells(x, m), g));
			next(nx, 'MN', 'a root-digit guess');
			if ((nx === 'N') !== (guess === '0'))
				throw new SheetError('the guess and its next step disagree');
			y = digit(guess, 'a root digit');
		}
		guessed = null;
		g.set('root', x, y);
		g.set('T', x, y);
		if (y !== '0') {
			for (;;) {
				const col = tens;
				const borrow = await mulSub(
					run,
					g,
					x,
					m,
					{ by: ['root', x], from: 'r', into: 'r2', div: 'T' },
					col === null ? undefined : () => tensStep(col)
				);
				if (!borrow) break;
				const [lower, , cc] = await one(run, 'DEC', [['root', x], null, null], g);
				next(cc, 'C', 'a lowered root digit');
				g.set('root', x, digit(lower, 'a root digit'));
				g.set('T', x, lower);
				g.clear('r2');
			}
			// the new remainder replaces the old
			for (let i = x; i <= x + m; i++) g.set('r', i, g.get('r2', i));
			g.clear('r2');
		} else if (tens !== null) await tensAlone(tens);
		if (k === pairs - 1) break;
		// the next trial divisor is T + y, shifted one column (its last digit is the next guess's place); once T has
		// three digits its first is not touched by the step, so the next guess is read in the same call
		y = g.get('root', x);
		const nx = x - 2;
		const m2 = m + 1;
		const twice = g.read('T', x, x + m);
		g.clear('T');
		g.put('T', twice, x - 1);
		if (y !== '0') {
			const unit: View = { op: 'ADD', cells: [B, g.get('T', x - 1), y] };
			const views = [unit];
			const fovea: ([string, number] | null)[][] = [[null, ['T', x - 1], ['root', x]]];
			const withGuess = m >= 3;
			if (withGuess) {
				const cells = guessCells(nx, m2);
				views.push({ op: 'EST', cells: cells.map((c) => g.get(...c)) });
				fovea.push(cells);
			}
			const outs = await run.step(views, fovea);
			const [u, carry, n1] = outs[0];
			next(n1, 'M', 'a trial-divisor step');
			g.set('T', x - 1, digit(u, 'a trial digit'));
			if (digit(carry, 'a carry') === '1') {
				if (m < 2) throw new SheetError('the first trial divisor carried');
				g.set('w', x, '1');
				tens = x;
			} else if (carry !== '0') throw new SheetError(`the model carried ${JSON.stringify(carry)}`);
			if (withGuess) guessed = outs[1];
			// with no guess read alongside, the carry goes in before the guess reads the trial divisor's first digit
			else if (tens !== null) await tensAlone(tens);
		}
		m = m2;
	}
	g.done = true;
	let R = '';
	for (let k = 0; k < pairs; k++) R += g.get('root', 2 * (pairs - 1 - k));
	R = trim(R);
	const rs = trim(g.read('r', 0, m + 1));
	const exact = rs === '0';
	if (c === 1) return { root: R, exact, rem: rs };
	// root = R / c: times 10 / c (or twice 5 for c = 4) and the last k digits dropped
	const k = c === 4 ? 2 : 1;
	let Y = R;
	for (const fct of c === 2 ? ['5'] : c === 4 ? ['5', '5'] : ['2'])
		Y = await mulByDigit(run, Y, fct, 'root × 10 / c');
	Y = Y.padStart(k + 1, '0');
	const root = trim(Y.slice(0, -k));
	const e = Y.slice(-k);
	if (!opts.remainder) return { root, exact, rem: null };
	// 10^(2k) rem = c'^2 rs + e (2 root 10^k + e)
	const cc = c === 2 ? '25' : c === 4 ? '625' : '4';
	let S = rs === '0' ? '0' : await mulAny(run, rs, cc, "scaled remainder × c'²");
	if (trim(e) !== '0') {
		const twice = await mulByDigit(run, root, '2', 'twice the root');
		const P = await mulAny(run, twice + e, trim(e), 'the dropped digits × (2 root, then them)');
		S = await addMagnitudes(run, S, P);
	}
	S = S.padStart(2 * k + 1, '0');
	if (!/^0+$/.test(S.slice(-2 * k)))
		throw new SheetError('the remainder did not divide by its scale');
	return { root, exact, rem: trim(S.slice(0, -2 * k)) };
}
