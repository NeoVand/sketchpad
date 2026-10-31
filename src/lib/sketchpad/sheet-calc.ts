/**
 * The sheet as an arithmetic unit (SKETCHPAD3 seam 2): every call runs on the sheet, step by step, and the model
 * writes every digit (calc-sheet.ts). Signs are layout: a sum of opposite signs is a difference of magnitudes, whose
 * final borrow says which is larger.
 */
import {
	Mux,
	Run,
	addMagnitudes,
	divide,
	mulMagnitudes,
	squareRoot,
	subMagnitudes,
	type CalcSheet,
	type Policy
} from './calc-sheet.ts';

// The canonical copy of this interface lives in src/lib/sketchpad/program/calc.ts (the PROGRAM stream's branch); it
// is copied here so the two compile apart until they are merged.
export interface Calc {
	add(a: bigint, b: bigint): Promise<bigint>; // signed
	sub(a: bigint, b: bigint): Promise<bigint>; // signed
	mul(a: bigint, b: bigint): Promise<bigint>; // signed
	divmod(a: bigint, b: bigint): Promise<{ q: bigint; r: bigint }>; // a >= 0, b > 0, 0 <= r < b
	isqrt(a: bigint): Promise<{ root: bigint; rem: bigint }>; // a >= 0, root = floor(sqrt(a)), rem = a - root^2
	/** independent jobs (each calling the methods above) whose steps share forward passes */
	wave<T>(jobs: (() => Promise<T>)[]): Promise<T[]>;
}

/** what the page follows of a run: the sheet a procedure shows, and every step */
export interface CalcHooks {
	onShow?: (s: CalcSheet) => void;
	onStep?: () => void | Promise<void>;
}

const mag = (n: bigint) => (n < 0n ? -n : n).toString();
const signed = (digits: string, negative: boolean) => (negative ? -BigInt(digits) : BigInt(digits));

export class SheetCalc implements Calc {
	/** every procedure's steps go through one multiplexer, so procedures running at once share decoder calls */
	readonly mux: Mux;
	private hooks: CalcHooks;

	constructor(policy: Policy, hooks: CalcHooks = {}) {
		this.mux = new Mux(policy);
		this.hooks = hooks;
	}

	/** one procedure, on its own sheet, its steps batched with those of any procedure running at the same time */
	private async lane<T>(fn: (run: Run) => Promise<T>): Promise<T> {
		const run = new Run((views) => this.mux.request(views));
		run.onShow = this.hooks.onShow;
		run.onStep = this.hooks.onStep;
		this.mux.enter();
		try {
			return await fn(run);
		} finally {
			this.mux.leave();
		}
	}

	/** decoder calls and views so far, and the M4 cost model's seconds for them */
	get calls() {
		return this.mux.calls;
	}
	get views() {
		return this.mux.views;
	}
	get seconds() {
		return this.mux.seconds;
	}

	/** every job runs to its end (a failing one never leaves others running into the next line); then the first failure */
	async wave<T>(jobs: (() => Promise<T>)[]): Promise<T[]> {
		const settled = await Promise.allSettled(jobs.map((j) => j()));
		const failed = settled.find((r) => r.status === 'rejected');
		if (failed) throw failed.reason;
		return settled.map((r) => (r as PromiseFulfilledResult<T>).value);
	}

	async add(a: bigint, b: bigint): Promise<bigint> {
		const na = a < 0n;
		const nb = b < 0n;
		if (na === nb) return signed(await this.lane((r) => addMagnitudes(r, mag(a), mag(b))), na);
		const d = await this.lane((r) => subMagnitudes(r, mag(a), mag(b)));
		// |a| - |b| < 0 flips a's sign
		return signed(d.digits, d.negative ? !na : na);
	}

	sub(a: bigint, b: bigint): Promise<bigint> {
		return this.add(a, -b);
	}

	async mul(a: bigint, b: bigint): Promise<bigint> {
		return signed(await this.lane((r) => mulMagnitudes(r, mag(a), mag(b))), a < 0n !== b < 0n);
	}

	async divmod(a: bigint, b: bigint): Promise<{ q: bigint; r: bigint }> {
		if (a < 0n || b <= 0n) throw new RangeError('divmod needs a >= 0 and b > 0');
		const { q, r } = await this.lane((run) => divide(run, a.toString(), b.toString()));
		return { q: BigInt(q), r: BigInt(r) };
	}

	async isqrt(a: bigint): Promise<{ root: bigint; rem: bigint }> {
		if (a < 0n) throw new RangeError('isqrt needs a >= 0');
		const { root, rem } = await this.lane((r) => squareRoot(r, a.toString(), { remainder: true }));
		return { root: BigInt(root), rem: BigInt(rem!) };
	}

	/**
	 * floor(a / b) and whether b divides a, without the remainder's value (a remainder costs one more pass, or a short
	 * division, when the divisor was scaled; a quotient to k places needs only the quotient).
	 */
	async divFloor(a: bigint, b: bigint): Promise<{ q: bigint; exact: boolean }> {
		if (a < 0n || b <= 0n) throw new RangeError('divFloor needs a >= 0 and b > 0');
		const { q, r } = await this.lane((run) =>
			divide(run, a.toString(), b.toString(), { remainder: 'zero' })
		);
		return { q: BigInt(q), exact: r === '0' };
	}

	/**
	 * floor(sqrt(a)) and whether a is a perfect square, without the remainder's value (a remainder costs a few more
	 * passes when a is scaled; a square root to k places needs only the root).
	 */
	async sqrtFloor(a: bigint): Promise<{ root: bigint; exact: boolean }> {
		if (a < 0n) throw new RangeError('sqrtFloor needs a >= 0');
		const { root, exact } = await this.lane((r) => squareRoot(r, a.toString()));
		return { root: BigInt(root), exact };
	}
}
