/** Seam 2. Implementations may execute these operations on the model's sheet. */
export interface Calc {
	/** Run independent jobs together; their steps share model forward passes. */
	wave<T>(jobs: (() => Promise<T>)[]): Promise<T[]>;
	add(a: bigint, b: bigint): Promise<bigint>;
	sub(a: bigint, b: bigint): Promise<bigint>;
	mul(a: bigint, b: bigint): Promise<bigint>;
	divmod(a: bigint, b: bigint): Promise<{ q: bigint; r: bigint }>;
	isqrt(a: bigint): Promise<{ root: bigint; rem: bigint }>;
}
export type ScalarOp = Exclude<keyof Calc, 'wave'>;
export type Result = bigint | { q: bigint; r: bigint } | { root: bigint; rem: bigint };
export interface SheetCost {
	rows: number;
	calls: number;
	seconds: number;
}
export interface CalcCall {
	op: ScalarOp;
	operands: bigint[];
	result: Result;
	cost?: SheetCost;
}
const abs = (n: bigint) => (n < 0n ? -n : n);
const width = (n: bigint) => abs(n).toString().length;
function sqrt(n: bigint): bigint {
	if (n < 2n) return n;
	let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
	for (;;) {
		const y = (x + n / x) / 2n;
		if (y >= x) return x;
		x = y;
	}
}
function cost(rows: number, calls = rows): SheetCost {
	return { rows, calls, seconds: 0.065 * calls + 0.037 * rows };
}
/** Port of divide(N,D,0): normalization, EST, pipelined MUL/SUB and corrections. */
export function divisionCost(a: bigint, b: bigint): SheetCost {
	const f = 10n / (BigInt(b.toString()[0]) + 1n);
	let rows = 0,
		calls = 0;
	if (f > 1n) {
		rows += width(a) + width(b) + 2;
		calls += Math.max(width(a), width(b)) + 1;
	}
	const d = b * f,
		m = width(d);
	let r = 0n,
		started = false;
	for (const ch of (a * f).toString()) {
		r = r * 10n + BigInt(ch);
		if (r < d && !started) continue;
		const top = r / 10n ** BigInt(m - 1);
		let q = top / BigInt(d.toString()[0]);
		if (q > 9n) q = 9n;
		rows += 1 + 2 * (m + 1);
		calls += 1 + m + 2;
		while (q * d > r) {
			q--;
			rows += m + 2;
			calls += m + 2;
		}
		r -= q * d;
		started = true;
	}
	return cost(rows, calls);
}
/** Port of sqrt_digits(N,0), including the guard digit and final single-digit division.
 * Python has no normalization choice for zero; zero uses one certified halt row here.
 */
export function squareRootCost(n: bigint): SheetCost {
	if (n === 0n) return cost(1);
	const c = [1n, 2n, 3n, 5n].find((c) => {
		const lead = sqrt(c * c * n * 100n ** 3n)
			.toString()
			.slice(0, 2);
		return lead >= '25' && lead < '50';
	})!;
	let s = (c * c * n * 100n).toString();
	if (s.length % 2) s = '0' + s;
	let p = 0n,
		r = 0n,
		rows = 0,
		calls = 0;
	for (let i = 0; i < s.length; i += 2) {
		r = r * 100n + BigInt(s.slice(i, i + 2));
		let y: bigint;
		rows++;
		calls++;
		if (!p) y = sqrt(r);
		else {
			const dv = 20n * p,
				len = width(dv),
				m = len + 1;
			y = r / 10n ** BigInt(len - 1) / BigInt(dv.toString()[0]);
			if (y > 9n) y = 9n;
			rows += 2 * (m + 1);
			calls += m + 2;
			while ((20n * p + y) * y > r) {
				y--;
				rows += m + 2;
				calls += m + 2;
			}
		}
		r -= (20n * p + y) * y;
		p = 10n * p + y;
	}
	rows += width(p) + 1;
	calls += width(p) + 1;
	return cost(rows, calls);
}
export class RefCalc implements Calc {
	readonly calls: CalcCall[] = [];
	private readonly root = { rows: 0, calls: 0 };
	private active = this.root;
	get total(): SheetCost {
		return cost(this.root.rows, this.root.calls);
	}
	/** Execute reference jobs deterministically in isolation, then compose their schedules.
	 * The real sheet executes them concurrently. Serial reference evaluation avoids depending
	 * on Node-only async context and gives nested waves exact, browser-portable accounting.
	 * Independent work must be submitted as factories, not pre-started promises.
	 */
	async wave<T>(jobs: (() => Promise<T>)[]): Promise<T[]> {
		const parent = this.active;
		const results: T[] = [];
		let rows = 0,
			calls = 0,
			failed = false,
			failure: unknown;
		for (const job of jobs) {
			const frame = { rows: 0, calls: 0 };
			this.active = frame;
			try {
				results.push(await job());
			} catch (error) {
				if (!failed) failure = error;
				failed = true;
			} finally {
				rows += frame.rows;
				calls = Math.max(calls, frame.calls);
				this.active = parent;
			}
		}
		parent.rows += rows;
		parent.calls += calls;
		if (failed) throw failure;
		return results;
	}
	private record<T extends Result>(op: ScalarOp, operands: bigint[], result: T, c: SheetCost): T {
		this.calls.push({ op, operands, result, cost: c });
		this.active.rows += c.rows;
		this.active.calls += c.calls;
		return result;
	}
	async add(a: bigint, b: bigint) {
		const n = Math.max(width(a), width(b));
		const same = a < 0n === b < 0n;
		return this.record('add', [a, b], a + b, cost(same ? n + 1 : n * (abs(a) < abs(b) ? 2 : 1)));
	}
	async sub(a: bigint, b: bigint) {
		const n = Math.max(width(a), width(b));
		const same = a < 0n === b < 0n;
		return this.record('sub', [a, b], a - b, cost(same ? n * (abs(a) < abs(b) ? 2 : 1) : n + 1));
	}
	async mul(a: bigint, b: bigint) {
		const n = Math.max(width(a), width(b)),
			m = Math.min(width(a), width(b));
		return this.record('mul', [a, b], a * b, cost(2 * m * (n + 2), 2 * (n + 2) + 6 * (m - 1)));
	}
	async divmod(a: bigint, b: bigint) {
		if (a < 0n || b <= 0n) throw new Error('divmod needs a >= 0, b > 0');
		return this.record('divmod', [a, b], { q: a / b, r: a % b }, divisionCost(a, b));
	}
	async isqrt(a: bigint) {
		if (a < 0n) throw new Error('isqrt needs a >= 0');
		const root = sqrt(a);
		return this.record('isqrt', [a], { root, rem: a - root * root }, squareRootCost(a));
	}
}
/** Trace any Calc without inspecting or trusting its implementation. */
export class TraceCalc implements Calc {
	protected readonly indices = new WeakMap<Promise<Result>, number>();
	readonly calls: CalcCall[] = [];
	constructor(readonly inner: Calc) {}
	async wave<T>(jobs: (() => Promise<T>)[]): Promise<T[]> {
		const started: Promise<T>[] = [];
		try {
			return await this.inner.wave(
				jobs.map((job) => () => {
					const pending = Promise.resolve().then(job);
					started.push(pending);
					return pending;
				})
			);
		} catch (error) {
			// Even a provider using fail-fast Promise.all must not leak unfinished work into the next line.
			await Promise.allSettled(started);
			throw error;
		}
	}
	protected async record<T extends Result>(
		op: ScalarOp,
		operands: bigint[],
		call: Promise<T>
	): Promise<T> {
		const result = await call;
		this.indices.set(call, this.calls.length);
		this.calls.push({ op, operands, result });
		return result;
	}
	/** Exact trace attribution, including when other jobs complete concurrently. */
	async indexed(op: ScalarOp, operands: bigint[]): Promise<{ result: Result; index: number }> {
		const call =
			op === 'isqrt' ? this.inner.isqrt(operands[0]) : this.inner[op](operands[0], operands[1]);
		const result = await this.record<Result>(op, operands, call);
		return { result, index: this.indices.get(call)! };
	}
	add(a: bigint, b: bigint) {
		return this.record('add', [a, b], this.inner.add(a, b));
	}
	sub(a: bigint, b: bigint) {
		return this.record('sub', [a, b], this.inner.sub(a, b));
	}
	mul(a: bigint, b: bigint) {
		return this.record('mul', [a, b], this.inner.mul(a, b));
	}
	divmod(a: bigint, b: bigint) {
		return this.record('divmod', [a, b], this.inner.divmod(a, b));
	}
	isqrt(a: bigint) {
		return this.record('isqrt', [a], this.inner.isqrt(a));
	}
}
/** Corrupt exactly one zero-based call. Fault arithmetic belongs to this test double only. */
export class LyingCalc extends TraceCalc {
	private invoked = 0;
	constructor(
		inner: Calc,
		readonly target: number,
		readonly corrupt: (r: Result) => Result = (r) =>
			typeof r === 'bigint'
				? r + 1n
				: 'q' in r
					? { ...r, q: r.q + 1n }
					: { ...r, root: r.root + 1n }
	) {
		super(inner);
	}
	protected override async record<T extends Result>(
		op: ScalarOp,
		operands: bigint[],
		call: Promise<T>
	): Promise<T> {
		const index = this.invoked++;
		const answer = await call;
		const result = (index === this.target ? this.corrupt(answer) : answer) as T;
		this.indices.set(call, this.calls.length);
		this.calls.push({ op, operands, result });
		return result;
	}
}
