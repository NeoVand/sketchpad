/**
 * The sketchpad from the page's side: the GPU check, which model is loaded, the download, the certificate (fresh or
 * cached for the same files), the live run on the sheet, and the chat. The page owns the sheet, which is the model's
 * only memory; the worker only reads the strips it is sent and answers.
 */
import { ADD_DOMAIN, AddSheet, addCode, addDecode, addRule } from './adder.ts';
import { Grid, type CalcSheet, type Policy, type View } from './calc-sheet.ts';
import {
	describe as describeTask,
	expected,
	parseTask,
	solve,
	type CalcTask
} from './calc-task.ts';
import { CALC_DOMAIN, calcIndex, calcRef, isCalcOp } from './calc-tables.ts';
import { hashText } from './hash.ts';
import {
	CERT_FORMAT,
	DTYPE,
	HF_REPO,
	PUBLISHED,
	FILE_CACHE,
	KINDS,
	MODELS,
	HF_CERT_ROOT,
	HF_ROOT,
	certFiles,
	fileUrl,
	kindOf,
	modelFiles,
	servedPath,
	type Kind
} from './models.ts';
import { SheetCalc } from './sheet-calc.ts';
import { callKey, type Live } from './derivation-view.ts';
import {
	RefCalc,
	type Calc,
	type CalcCall,
	run as runWorkOrder,
	type RunOptions,
	type CheckMode,
	type StatementResult
} from './program/index.ts';
import { MUL_DOMAIN, MulSheet, MulWave, outChars, type MulOut, type Op } from './multiplier.ts';
import { insideMetaOf, type InsideTick } from './inside.ts';
import {
	RECORDING_FORMAT,
	compactInside,
	type RecordedCall,
	type RecordedRound,
	type Recording
} from './recording.ts';
import type { FromWorker, InsideMeta, LoadedInfo, TickOp, ToWorker } from './protocol.ts';
import { B, GLYPHS } from './sprites.ts';

export type Sheet = AddSheet | MulSheet | MulWave | Grid;

/** A table row, as the margin and the failure list show it. */
export function rowLabel(kind: Kind, i: number): string {
	const show = (g: string) => (g === B ? '_' : g);
	if (kind === 'add') {
		const v = ADD_DOMAIN[i];
		const r = addRule(v);
		const said = r === 'H' ? 'halt' : `${r[0]}${r[1] === '1' ? ', carry 1' : ''}`;
		return `ADD ${v.map(show).join(' ')} → ${addCode(r)} (${said})`;
	}
	if (kind === 'calc') {
		const [op, v] = CALC_DOMAIN[i];
		return `${op} ${v.map(show).join(' ')} → ${calcRef(op, v).join(' ')}`;
	}
	const [op, v] = MUL_DOMAIN[i];
	return `${op} ${v.map(show).join(' ')} → ${outChars(op, v).join(' ')}`;
}

const MUL_INDEX = new Map(MUL_DOMAIN.map(([op, v], i) => [op + v.join(''), i]));

/** The table row a view is, or -1 if the view is not in the table. */
export function rowIndex(op: TickOp, cells: readonly string[]): number {
	if (op === 'ADD-FAST') {
		const c = [B, '1'].indexOf(cells[0]);
		const t = GLYPHS.indexOf(cells[1]);
		const b = GLYPHS.indexOf(cells[2]);
		return c < 0 || t < 0 || b < 0 ? -1 : c * 121 + t * 11 + b;
	}
	if (isCalcOp(op)) return calcIndex(op, cells);
	return MUL_INDEX.get(op + cells.join('')) ?? -1;
}

/** A margin as text, with a true minus sign. */
export const fmtMargin = (m: number) =>
	Number.isFinite(m) ? (m < 0 ? `−${(-m).toFixed(2)}` : m.toFixed(2)) : m < 0 ? '−∞' : '–';

export interface Failure {
	index: number;
	label: string;
	got: string | null;
	margin: number;
}

export class Cert {
	readonly kind: Kind;
	readonly rows: number;
	/**
	 * none, running a full check, done (every row checked on this device now), cached (every row checked on this device
	 * earlier), shipped (the table measured on the reference device and shipped with the model; see `spot`)
	 */
	status = $state<'none' | 'running' | 'done' | 'cached' | 'shipped'>('none');
	/** where a shipped certificate was measured */
	shippedFrom = $state<{ device: string; when: string } | null>(null);
	/** the shipped table's weakest rows, checked again on this device */
	spot = $state<{
		rows: number;
		checked: number;
		pass: number;
		min: number;
		running: boolean;
		when: string | null;
	} | null>(null);
	checked = $state(0);
	pass = $state(0);
	minMargin = $state(Infinity);
	seconds = $state(0);
	failures = $state<Failure[]>([]);
	/** when a cached certificate was made */
	when = $state<string | null>(null);
	/** the files, runtime and device this certificate is about (see Pad.keyFor) */
	key = $state<string | null>(null);
	/** bumps whenever `margins` changes (the grid redraws from it) */
	version = $state(0);
	/** NaN until a row is checked */
	margins: Float32Array;
	private t0 = 0;

	constructor(kind: Kind) {
		this.kind = kind;
		this.rows = MODELS[kind].rows;
		this.margins = new Float32Array(this.rows).fill(NaN);
	}

	reset() {
		this.margins.fill(NaN);
		this.checked = 0;
		this.pass = 0;
		this.minMargin = Infinity;
		this.seconds = 0;
		this.failures = [];
		this.when = null;
		this.key = null;
		this.status = 'none';
		this.shippedFrom = null;
		this.spot = null;
		this.version++;
	}

	start() {
		this.reset();
		this.status = 'running';
		this.t0 = performance.now();
	}

	add(start: number, margins: number[], got: (string | null)[]) {
		let pass = 0;
		let min = this.minMargin;
		const fails: Failure[] = [];
		margins.forEach((raw, k) => {
			const i = start + k;
			// a NaN margin is a failed row, never an unchecked one (NaN marks unchecked in `margins`)
			const m = Number.isNaN(raw) ? -Infinity : raw;
			this.margins[i] = m;
			if (m > 0) pass++;
			else fails.push({ index: i, label: rowLabel(this.kind, i), got: got[k], margin: m });
			min = Math.min(min, m);
		});
		this.checked = start + margins.length;
		this.pass += pass;
		this.minMargin = min;
		if (fails.length) this.failures = [...this.failures, ...fails];
		this.seconds = (performance.now() - this.t0) / 1000;
		this.version++;
	}

	/** device margins for some rows of a shipped table (the spot check) */
	addSpot(indices: number[], margins: number[]) {
		const sp = this.spot;
		if (!sp) return;
		let pass = 0;
		let min = sp.min;
		margins.forEach((raw, k) => {
			const m = Number.isNaN(raw) ? -Infinity : raw;
			this.margins[indices[k]] = m;
			if (m > 0) pass++;
			else
				this.failures = [
					...this.failures,
					{ index: indices[k], label: rowLabel(this.kind, indices[k]), got: null, margin: m }
				];
			min = Math.min(min, m);
		});
		this.spot = { ...sp, checked: sp.checked + margins.length, pass: sp.pass + pass, min };
		this.pass = this.margins.reduce((n, m) => n + (m > 0 ? 1 : 0), 0);
		this.minMargin = Math.min(...this.margins);
		this.version++;
	}

	/** every row checked on this device and passed; or the shipped table, with no failure in its spot check here */
	get certified() {
		if (this.status === 'shipped')
			return this.pass === this.rows && !!this.spot && this.spot.pass === this.spot.checked;
		return (this.status === 'done' || this.status === 'cached') && this.pass === this.rows;
	}
}

/**
 * A certificate shipped with a program: every table row measured on a reference device (research/sketch, made with
 * `sketchpad.exportCertificate()` on the dev page), valid wherever the files, prompts, runtime and strips are the same.
 * Margins move a little between GPUs, so a new device checks the shipped table's weakest rows again (`SPOT`).
 */
export interface ShippedCert {
	format: string;
	program: string;
	dtype: Record<string, string>;
	transformers: string;
	sprites: string;
	files: Record<string, string>;
	device: string;
	when: string;
	kinds: Partial<
		Record<Kind, { prompts: Record<string, string>; rows: number; pass: number; margins: number[] }>
	>;
}
/** the share of a shipped table's rows, weakest first, that a new device checks again */
const SPOT = 0.1;

interface Stored {
	key: string;
	pass: number;
	rows: number;
	minMargin: number;
	seconds: number;
	when: string;
	margins: number[];
	failures: Failure[];
}

const storeKey = (k: Kind) => `sketchpad.cert.${k}`;
const spotKey = (k: Kind) => `sketchpad.spot.${k}`;
interface StoredSpot {
	key: string;
	when: string;
	indices: number[];
	margins: number[];
}
function readSpot(k: Kind): StoredSpot | null {
	try {
		const s = localStorage.getItem(spotKey(k));
		return s ? (JSON.parse(s) as StoredSpot) : null;
	} catch {
		return null;
	}
}
function writeSpot(k: Kind, s: StoredSpot) {
	try {
		localStorage.setItem(spotKey(k), JSON.stringify(s));
	} catch {
		/* not remembered: the next visit checks again */
	}
}
function readStore(k: Kind): Stored | null {
	try {
		const s = localStorage.getItem(storeKey(k));
		return s ? (JSON.parse(s) as Stored) : null;
	} catch {
		return null;
	}
}
function writeStore(k: Kind, s: Stored) {
	try {
		localStorage.setItem(storeKey(k), JSON.stringify(s));
	} catch {
		/* private mode or full: the certificate simply is not remembered */
	}
}

export interface TickView {
	op: TickOp;
	cells: string[];
	out: string[];
	margin: number | null;
	strip: Uint8ClampedArray;
	ms: number;
	/** the model's states on this tick: the lens and the path (null when the program has no inside data) */
	inside: InsideTick | null;
}

export interface RunResult {
	ok: boolean;
	got: string;
	want: string;
	operands: [string, string];
	edits: number;
	certified: boolean;
	ticks: number;
	msPerTick: number;
	seconds: number;
	digits: number;
	/** distinct table rows this run read */
	views: number;
	/** of those, rows that did not pass on this device (or were never checked) */
	unchecked: number;
	/** the table rows behind `unchecked`, as the certificate lists them */
	uncheckedLabels: string[];
	/** ticks on which the visitor pushed the model's state */
	pushes: number;
	/** batched steps, when the multiplier's passes ran overlapped (null: one tick at a time) */
	steps: number | null;
	/** the certificate behind `certified`: every row checked here, or the shipped table spot-checked here */
	certSource: 'device' | 'shipped';
}

export interface CalcResult {
	/** the line as the page reads it */
	text: string;
	ok: boolean;
	got: string;
	want: string;
	/** batched steps (decoder calls) and views answered */
	steps: number;
	ticks: number;
	seconds: number;
	/** the M4 cost model's seconds for the same steps (0.065 s per call, 0.037 s per view) */
	model: number;
	/** every table the run read passed in full on this device */
	certified: boolean;
	/** distinct table rows read, and those not passed on this device */
	views: number;
	unchecked: number;
	uncheckedLabels: string[];
}

/**
 * A work order planned on the page's own arithmetic (RefCalc), to lay its derivation out before and while the model
 * works it: `staged` before a run (only its given lines show), else the plan the run's reveal follows.
 */
export interface AlgebraPlan {
	text: string;
	checkMode: CheckMode;
	results: StatementResult[];
	trace: CalcCall[];
	staged: boolean;
}

/**
 * A Calc that says when each call starts and returns (the derivation reveals the model's numbers as they come). On a
 * dev page `lie` corrupts one call's answer (+1), to see a refusal without a faulty model.
 */
class Watched implements Calc {
	private n = 0;
	constructor(
		private inner: Calc,
		private on: {
			start: (key: string) => void;
			done: (key: string, r: CalcCall['result']) => void;
		},
		private lie: number | null
	) {}
	wave<T>(jobs: (() => Promise<T>)[]) {
		return this.inner.wave(jobs);
	}
	private async call<T extends CalcCall['result']>(
		op: CalcCall['op'],
		operands: bigint[],
		work: () => Promise<T>
	) {
		const key = callKey(op, operands);
		const index = this.n++;
		this.on.start(key);
		let r: CalcCall['result'] = await work();
		if (index === this.lie)
			r =
				typeof r === 'bigint'
					? r + 1n
					: 'q' in r
						? { ...r, q: r.q + 1n }
						: { ...r, root: r.root + 1n };
		this.on.done(key, r);
		return r as T;
	}
	add(a: bigint, b: bigint) {
		return this.call('add', [a, b], () => this.inner.add(a, b));
	}
	sub(a: bigint, b: bigint) {
		return this.call('sub', [a, b], () => this.inner.sub(a, b));
	}
	mul(a: bigint, b: bigint) {
		return this.call('mul', [a, b], () => this.inner.mul(a, b));
	}
	divmod(a: bigint, b: bigint) {
		return this.call('divmod', [a, b], () => this.inner.divmod(a, b));
	}
	isqrt(a: bigint) {
		return this.call('isqrt', [a], () => this.inner.isqrt(a));
	}
}

/** One work order run on the sheet (program/run.ts): its lines, checked against the page's own arithmetic. */
export interface AlgebraRun {
	text: string;
	/** the sheet's answer lines, one per statement */
	lines: string[];
	/** the same work order on the page's own BigInt arithmetic (program/calc.ts, RefCalc) */
	want: string[];
	ok: boolean;
	results: StatementResult[];
	checkMode: CheckMode;
	steps: number;
	ticks: number;
	seconds: number;
	/** the M4 cost model's seconds for the same steps */
	model: number;
	certified: boolean;
	views: number;
	unchecked: number;
	uncheckedLabels: string[];
}

export interface ChatTurn {
	q: string;
	/** the reply as the model wrote it, with each sheet block's result lines where they went back into it */
	a: string;
	busy: boolean;
	ms: number | null;
	error: string | null;
	/** 1: the model that opens its sheet (E8); 0: stock Qwen3.5-0.8B, the same weights with the gate shut */
	gate: 0 | 1;
	/** the sheet blocks it opened: the work order, its result lines (null while the sheet works) and the seconds */
	blocks: { source: string; result: string | null; seconds: number | null }[];
	/** a recorded reply, played back (recording.ts) */
	recorded: boolean;
}

interface Pending {
	resolve: (v: unknown) => void;
	reject: (e: Error) => void;
	onMessage?: (m: FromWorker) => void;
	/** what to send again to a new worker after the GPU was lost: the request as it stands now */
	resume: () => ToWorker;
}

export class Cancelled extends Error {
	constructor() {
		super('stopped');
	}
}

const MUL_NEXT = 'MAZFNH';

/** a tick a visitor can push: an adder tick, or a multiply step with a digit of a (not the carry flush) */
const pushable = (op: TickOp, cells: readonly string[]) =>
	op === 'ADD-FAST' || (op === 'MUL' && cells[0] !== B);

class Pad {
	/** null while probing */
	gpuOk = $state<boolean | null>(null);
	gpuReason = $state<string | null>(null);
	/** bytes a load of each operation would take from the network now (what this browser has cached is free) */
	costs = $state<Record<Kind, number | null>>({ add: null, mul: null, calc: null });
	/** whether the server has each operation's files (null until known) */
	available = $state<Record<Kind, boolean | null>>({ add: null, mul: null, calc: null });

	op = $state<Kind>('add');
	/** the program the worker holds, as far as the page knows (null while a load replaces it) */
	loadedId = $state<string | null>(null);
	/** the operation whose load is in flight (the newest one asked for) */
	loading = $state<Kind | null>(null);
	loadStage = $state<'fetch' | 'compile'>('fetch');
	/** bytes of the load in flight: from the network, and read from this browser's cache */
	received = $state(0);
	readFromCache = $state(0);
	/** what the load in flight is expected to download, and which operation it is for */
	expect = $state<number | null>(null);
	progressKind = $state<Kind | null>(null);
	loadError = $state<string | null>(null);
	/** the newest load that read or downloaded something (not one that found the program already loaded) */
	lastLoad = $state.raw<LoadedInfo | null>(null);
	/**
	 * a certificate cannot be cached because a file's fingerprint is missing (plain, not state: `keyFor` writes it, and
	 * `certified` reads `keyFor` from the template, where a state write is an error)
	 */
	cacheNote: string | null = null;

	certs: Record<Kind, Cert> = {
		add: new Cert('add'),
		mul: new Cert('mul'),
		calc: new Cert('calc')
	};

	sheet = $state.raw<Sheet | null>(null);
	/** bumps whenever the sheet changes */
	version = $state(0);
	running = $state(false);
	/** counts the runs started: a new run lets the page's layout go once (ratchet.ts), and only then */
	runs = $state(0);
	last = $state.raw<TickView | null>(null);
	ticks = $state(0);
	computeMs = $state(0);
	wallMs = $state(0);
	result = $state.raw<RunResult | null>(null);
	/** the calculator's last run */
	calcResult = $state.raw<CalcResult | null>(null);
	/** the last work order */
	algebra = $state.raw<AlgebraRun | null>(null);
	/** how work orders check their roots: light (the default) or strong (program/NOTES.md) */
	checkMode = $state<CheckMode>('light');
	/** the work order's derivation as planned on the page's own arithmetic (see AlgebraPlan) */
	algebraPlan = $state.raw<AlgebraPlan | null>(null);
	/** the model's calls in the work order under way; `liveVersion` bumps as they start and return */
	algebraLive: Live = { started: new Map(), done: new Map() };
	liveVersion = $state(0);
	/** dev only: corrupt this call of the next work order (0-based), to see a refusal */
	lie: number | null = null;
	/** the first view of a calculator line laid out but not run (the One view panel shows it before a run) */
	preview = $state.raw<View | null>(null);
	/** one quiet line about GPU resets this session (null: none) */
	gpuNote = $state<string | null>(null);
	/** the model is being loaded again after the GPU was lost; the step in flight waits for it */
	recovering = $state(false);
	runError = $state<string | null>(null);

	chat = $state<ChatTurn[]>([]);

	/** the loaded program's inside data, for the maps (null without one) */
	insideMeta = $state.raw<InsideMeta | null>(null);
	/**
	 * an answer code to push toward, once: the adder's next tick, or the multiplier's next multiply step with a digit of a
	 * (on the leading pass, the one the inside panels follow)
	 */
	push = $state<string | null>(null);
	/** pause between ticks in ms, so the inside can be watched (0: as fast as the GPU goes) */
	pace = $state(0);
	pushes = $state(0);
	/** run the multiplier's passes overlapped, as a wave of batched steps */
	parallel = $state(true);
	/** the table rows this run has read, and the one it read last (-1 before the first tick) */
	walk = $state.raw<{ current: number; visited: Set<number> }>({ current: -1, visited: new Set() });

	private worker: Worker | null = null;
	private rid = 0;
	private lid = 0;
	/** the newest load asked for */
	private latest: { lid: number; kind: Kind; id: string } | null = null;
	/** what each loaded program reported (fingerprints), by program id */
	private infos: Record<string, LoadedInfo> = {};
	private pending = new Map<number, Pending>();
	private certRun: Promise<void> | null = null;
	private certRid: number | null = null;
	/** certificates shipped with programs, by program id */
	private shipped = new Map<string, Promise<ShippedCert | null>>();
	private certKind: Kind | null = null;
	private stopRun = false;
	private runDone: Promise<void> = Promise.resolve();
	private switchToken = 0;
	private root = '';
	private spritesUrl = '';
	/** when the GPU was lost, this minute */
	private lostAt: number[] = [];
	private resets = 0;
	/** every loss this session, with the browser's reason (for the dev console) */
	readonly losses: { at: string; reason: string }[] = [];
	/** loads waiting to finish, by load id (recovery waits on its own) */
	private loadWaiters = new Map<number, (ok: boolean) => void>();
	private sizeOf = new Map<string, Promise<number | null>>();

	get model() {
		return MODELS[this.op];
	}

	get cert() {
		return this.certs[this.op];
	}

	/** the operation's program is loaded and nothing is replacing it */
	get ready() {
		return this.loadedId === MODELS[this.op].id && !this.loading;
	}

	/**
	 * the operation's table passed in full, on this device, for the files loaded now (the calculator reads all three
	 * tables: the adder's, the multiplier's and its own)
	 */
	get certified() {
		// a recording plays without the model: its answers are the recorded run's, made under the shipped certificate
		if (this.replaying) return true;
		return this.ready && this.tablesOf(this.op).every((k) => this.tableCertified(k));
	}

	private tableCertified(k: Kind) {
		const c = this.certs[k];
		return c.certified && c.key !== null && c.key === this.keyFor(k);
	}

	/** the tables an operation's runs read */
	tablesOf(op: Kind): Kind[] {
		return op === 'calc' ? ['calc', 'add', 'mul'] : [op];
	}

	get canRun() {
		return this.certified && !this.running && !!this.sheet;
	}

	get canCalc() {
		return this.op === 'calc' && this.certified && !this.running;
	}

	/** a table the operation reads is being checked (in full, or a shipped table's spot check) */
	get certifying() {
		return this.tablesOf(this.op).some(
			(k) => this.certs[k].status === 'running' || !!this.certs[k].spot?.running
		);
	}

	/** resolves when the checks of every table the operation reads have ended */
	allSettled(): Promise<void> {
		return this.ensuring;
	}

	get chatBusy() {
		return this.chat.some((t) => t.busy);
	}

	get chatReady() {
		return !!this.loadedId && !this.loading;
	}

	/** GPU support and download costs; safe to call more than once */
	async probe(root: string) {
		if (this.root) return;
		this.root = root;
		const gpu = typeof navigator !== 'undefined' ? navigator.gpu : undefined;
		if (!gpu) {
			this.gpuOk = false;
			this.gpuReason =
				'This browser has no WebGPU. Chrome or Edge on a desktop has it, and so does Safari 26.';
		} else {
			const a = await gpu.requestAdapter({ powerPreference: 'high-performance' }).catch(() => null);
			if (!a) {
				this.gpuOk = false;
				this.gpuReason =
					'WebGPU is here but offers no GPU (it may be switched off or blocklisted).';
			} else if (!a.features.has('shader-f16')) {
				this.gpuOk = false;
				this.gpuReason = 'This GPU has no 16-bit floats in shaders, which the vision tower needs.';
			} else this.gpuOk = true;
		}
		await this.refreshCosts();
	}

	/** a served file's size, asked once */
	private size(url: string) {
		let p = this.sizeOf.get(url);
		if (!p) {
			p = fetch(url, { method: 'HEAD', cache: 'no-store' })
				.then((r) => (r.ok ? Number(r.headers.get('Content-Length') ?? 0) : null))
				.catch(() => null);
			this.sizeOf.set(url, p);
		}
		return p;
	}

	/** what loading each operation would download now: its files' sizes, less what this browser has cached */
	async refreshCosts() {
		if (!this.root) return;
		const cache =
			typeof caches !== 'undefined' ? await caches.open(FILE_CACHE).catch(() => null) : null;
		for (const k of KINDS) {
			const m = MODELS[k];
			let cost = 0;
			let ok = true;
			await Promise.all(
				modelFiles().map(async (f) => {
					const url = fileUrl(m, f, this.root);
					const n = await this.size(url);
					if (n === null) ok = false;
					else if (!(cache && (await cache.match(url)))) cost += n;
				})
			);
			this.available[k] = ok;
			this.costs[k] = ok ? cost : null;
		}
	}

	private ensureWorker() {
		if (this.worker) return this.worker;
		const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
		w.onmessage = (e: MessageEvent<FromWorker>) => this.receive(e.data);
		w.onerror = (e) => {
			this.loadError = e.message || 'the worker failed';
			this.loading = null;
			this.loadedId = null;
		};
		this.worker = w;
		return w;
	}

	/**
	 * The GPU under the model was lost (a driver reset, memory pressure, a background tab). Nothing on that device runs
	 * again, so the worker goes, a new one loads the same program (its files come from this browser's cache), and every
	 * request in flight is sent again as it stands: the step under way is redone and a check resumes where it was. The
	 * sheet lives on the page, so nothing else is lost. Three losses in a minute stop it.
	 */
	private async recover(reason: string) {
		const old = this.worker;
		if (!old || this.recovering) return;
		this.worker = null;
		old.onmessage = null;
		old.onerror = null;
		old.terminate();
		const now = performance.now();
		this.lostAt = [...this.lostAt.filter((t) => now - t < 60_000), now];
		const want = this.latest;
		if (this.lostAt.length > 3 || !want) {
			for (const p of this.pending.values()) p.reject(new Error('the GPU was lost'));
			this.pending.clear();
			this.loadedId = null;
			this.loading = null;
			this.loadError = 'The GPU was lost three times in a minute. Reload the page to start again.';
			return;
		}
		this.losses.push({ at: new Date().toISOString(), reason });
		this.recovering = true;
		this.gpuNote = 'GPU reset: loading the model again to redo the step in flight.';
		this.loadedId = null;
		const ok = await new Promise<boolean>((done) => {
			const lid = this.startLoad(want.kind);
			this.loadWaiters.set(lid, done);
		});
		this.recovering = false;
		if (!ok) {
			for (const p of this.pending.values()) p.reject(new Error('the GPU was lost'));
			this.pending.clear();
			return;
		}
		this.resets++;
		const when = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
		this.gpuNote = `GPU reset ${this.resets === 1 ? '' : `${this.resets} times, last `}at ${when}: the model reloaded and redid the step.`;
		for (const p of this.pending.values()) this.send(p.resume());
	}

	/** a check of the recovery (dev page: `sketchpad.loseDevice()`): destroy the GPU device under the model */
	loseDevice() {
		this.worker?.postMessage({ type: 'lose-device' } satisfies ToWorker);
	}

	/**
	 * Dev page, to measure what the inside views cost: `watchSteps` false runs Calculate and Algebra without reading the
	 * states (as before they were read at every pace); `statesVia('cpu')` downloads the whole states output instead of
	 * the places read.
	 */
	watchSteps = true;
	statesVia(via: 'gpu' | 'cpu') {
		this.worker?.postMessage({ type: 'states-via', via } satisfies ToWorker);
	}

	private send(m: ToWorker) {
		this.ensureWorker().postMessage(m);
	}

	private receive(m: FromWorker) {
		if (m.type === 'device-lost') return void this.recover(m.reason);
		if (m.type === 'progress') {
			// an older load may still be running ahead of the newest; its bytes are real, so show them as its own
			if (!this.loading) return;
			this.progressKind = m.kind;
			this.received = m.network;
			this.expect = m.expect;
			this.readFromCache = m.cached;
			this.loadStage = m.stage;
			return;
		}
		if (m.type === 'loaded') return this.onLoaded(m.lid, m.info);
		if (m.type === 'load-skipped') return;
		if (m.type === 'load-error') {
			this.loadWaiters.get(m.lid)?.(false);
			this.loadWaiters.delete(m.lid);
			if (m.lid !== this.latest?.lid) return;
			this.loadError = m.error;
			this.loading = null;
			this.loadedId = null;
			return;
		}
		const p = this.pending.get(m.rid);
		if (!p) return;
		if (m.type === 'failed') {
			this.pending.delete(m.rid);
			p.reject(m.cancelled ? new Cancelled() : new Error(m.error));
		} else if (
			m.type === 'tick' ||
			m.type === 'tick-batch' ||
			m.type === 'cert-done' ||
			m.type === 'done'
		) {
			p.onMessage?.(m);
			this.pending.delete(m.rid);
			p.resolve(m);
		} else p.onMessage?.(m);
	}

	private request<T>(
		m: ToWorker & { rid: number },
		onMessage?: (m: FromWorker) => void,
		resume: () => ToWorker = () => m
	): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			this.pending.set(m.rid, {
				resolve: resolve as (v: unknown) => void,
				reject,
				onMessage,
				resume
			});
			// while the model loads again after a loss, a new request waits to be sent with the ones in flight
			if (!this.recovering) this.send(m);
		});
	}

	/**
	 * Switch the operation. A run in progress is stopped first; the newest switch wins. The other program loads only
	 * when asked for (unless one program serves both operations).
	 */
	async setOp(k: Kind) {
		const token = ++this.switchToken;
		if (this.running) {
			this.stop();
			await this.runDone;
		}
		if (token !== this.switchToken || k === this.op) return;
		this.op = k;
		this.clearRun();
		if (k === 'calc') this.sheet = null;
		if (this.ready) void this.ensureFor(k);
	}

	/** forget the last run's results (a switch between Calculate and Algebra, which read the same tables) */
	clearRun() {
		if (this.running) return;
		this.result = null;
		this.calcResult = null;
		this.algebra = null;
		this.runError = null;
		this.last = null;
		this.preview = null;
		// Calculate and Algebra show the sheets of their own runs only
		if (this.sheet instanceof Grid || this.op === 'calc') this.sheet = null;
		this.version++;
	}

	private stageToken = 0;

	/**
	 * Lay a calculator line out on the first sheet its run would use, without running it: the operands in place and the
	 * eye on the first view. The procedure stops at its first question to the model, so nothing reaches the model.
	 */
	stageCalc(text: string) {
		if (this.running || this.op !== 'calc') return;
		const token = ++this.stageToken;
		this.calcResult = null;
		this.algebra = null;
		this.runError = null;
		this.last = null;
		const task = parseTask(text);
		if (typeof task === 'string') {
			this.sheet = null;
			this.preview = null;
			this.version++;
			return;
		}
		let first: View | null = null;
		let shown: CalcSheet | null = null;
		const staged = new Error('staged');
		const calc = new SheetCalc(
			(views) => {
				first ??= views[0];
				throw staged;
			},
			{
				onShow: (sheet) => {
					shown ??= sheet;
					decorate(sheet, task);
				}
			}
		);
		void solve(calc, task)
			.catch(() => {})
			.finally(() => {
				if (token !== this.stageToken || this.running || this.op !== 'calc') return;
				this.sheet = shown;
				this.preview = first;
				this.version++;
			});
	}

	load(root: string, sprites: string) {
		const k = this.op;
		const id = MODELS[k].id;
		if (this.running) return;
		this.spritesUrl = sprites;
		if (!this.root) this.root = root;
		if (this.loadedId === id && !this.loading) return void this.ensureFor(k);
		if (this.loading && this.latest?.id === id) return;
		this.startLoad(k);
	}

	/** ask the worker for an operation's program; returns the load's id */
	private startLoad(k: Kind) {
		const id = MODELS[k].id;
		const root = this.root;
		const sprites = this.spritesUrl;
		// a certificate of the program being replaced would be cancelled by the worker anyway; say so now
		if (this.certRid !== null && this.certKind && MODELS[this.certKind].id !== id)
			this.send({ type: 'cancel', rid: this.certRid });
		const lid = ++this.lid;
		this.latest = { lid, kind: k, id };
		if (this.loadedId !== id) this.loadedId = null;
		this.loading = k;
		this.received = 0;
		this.readFromCache = 0;
		this.loadStage = 'fetch';
		this.loadError = null;
		this.expect = this.costs[k];
		this.progressKind = k;
		this.send({ type: 'load', lid, kind: k, root, sprites });
		return lid;
	}

	private onLoaded(lid: number, info: LoadedInfo) {
		this.infos[info.id] = info;
		this.loadWaiters.get(lid)?.(true);
		this.loadWaiters.delete(lid);
		// an older load finished; the newest one is still queued behind it and will replace or reuse it
		if (lid !== this.latest?.lid) return;
		this.loadedId = info.id;
		this.loading = null;
		// the maps the page read before the load stay (the same pinned file): nothing on show is redrawn by the load
		if (
			!this.insideMeta ||
			!info.inside ||
			JSON.stringify(info.inside) !== JSON.stringify(this.insideMeta)
		)
			this.insideMeta = info.inside;
		if (!info.reused) this.lastLoad = info;
		void this.refreshCosts();
		void this.ensureFor(this.op);
	}

	/** every table an operation reads, one after another (one check runs at a time) */
	private ensureFor(op: Kind) {
		const token = ++this.ensureToken;
		this.ensuring = (async () => {
			for (const k of this.tablesOf(op)) {
				if (token !== this.ensureToken || this.op !== op) return;
				await this.ensureCert(k);
				await this.certSettled();
			}
		})();
		return this.ensuring;
	}
	private ensureToken = 0;
	private ensuring: Promise<void> = Promise.resolve();

	/**
	 * The certificate's identity: format, operation, prompts, the program's files, sprites, GPU and runtime. Without a
	 * fingerprint for every file it is bound to this load only (and never cached).
	 */
	private keyFor(k: Kind): string | null {
		const m = MODELS[k];
		const info = this.infos[m.id];
		if (!info || this.loadedId !== m.id) return null;
		const need = certFiles();
		const missing = need.filter((f) => !info.prints[f]);
		this.cacheNote = missing.length ? `no fingerprint for ${missing.join(', ')}` : null;
		if (missing.length) return `session:${m.id}:${this.latest?.lid}`;
		return hashText(
			JSON.stringify({
				format: CERT_FORMAT,
				kind: k,
				program: m.id,
				prompts: m.prompts,
				dtype: DTYPE,
				files: need.map((f) => [servedPath(m, f), info.prints[f]]),
				sprites: info.sprites,
				gpu: info.gpu,
				transformers: info.transformers
			})
		);
	}

	/** the certificate shipped with a program, fetched once (null when it has none) */
	private shippedFor(id: string) {
		let p = this.shipped.get(id);
		if (!p) {
			// the published certificate may sit at a later commit than the program (models.ts)
			const root = this.root === HF_ROOT ? HF_CERT_ROOT : this.root;
			p = fetch(`${root}${id}/certificate.json`, { cache: 'no-cache' })
				.then((r) => (r.ok ? (r.json() as Promise<ShippedCert>) : null))
				.catch(() => null);
			this.shipped.set(id, p);
		}
		return p;
	}

	/** the shipped table for this operation, if it was measured on exactly the files, prompts and runtime loaded now */
	private shippedTable(k: Kind, sc: ShippedCert) {
		const m = MODELS[k];
		const info = this.infos[m.id];
		const t = sc.kinds[k];
		if (!info || !t || t.rows !== this.certs[k].rows || t.margins.length !== t.rows) return null;
		const same =
			sc.format === CERT_FORMAT &&
			sc.program === m.id &&
			sc.transformers === info.transformers &&
			sc.sprites === info.sprites &&
			JSON.stringify(sc.dtype) === JSON.stringify(DTYPE) &&
			JSON.stringify(t.prompts) === JSON.stringify(m.prompts) &&
			certFiles().every((f) => !!info.prints[f] && sc.files[f] === info.prints[f]);
		return same ? t : null;
	}

	/** take the shipped table, then check its weakest rows on this device (or recall that check) */
	private useShipped(
		k: Kind,
		sc: ShippedCert,
		t: NonNullable<ShippedCert['kinds'][Kind]>,
		key: string | null
	) {
		const cert = this.certs[k];
		cert.reset();
		t.margins.forEach((x, i) => (cert.margins[i] = x));
		cert.checked = cert.rows;
		cert.pass = t.margins.filter((x) => x > 0).length;
		cert.minMargin = Math.min(...t.margins);
		cert.failures = t.margins.flatMap((x, i) =>
			x > 0 ? [] : [{ index: i, label: rowLabel(k, i), got: null, margin: x }]
		);
		cert.shippedFrom = { device: sc.device, when: sc.when };
		cert.key = key;
		cert.status = 'shipped';
		const order = t.margins.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
		const indices = order.slice(0, Math.ceil(cert.rows * SPOT)).map(([, i]) => i);
		cert.spot = {
			rows: indices.length,
			checked: 0,
			pass: 0,
			min: Infinity,
			running: false,
			when: null
		};
		const kept = key && !key.startsWith('session:') ? readSpot(k) : null;
		if (kept && kept.key === key && kept.indices.length === indices.length) {
			cert.addSpot(kept.indices, kept.margins);
			cert.spot = { ...cert.spot, when: kept.when };
			return;
		}
		cert.version++;
		void this.spotCheck(k, indices, key);
	}

	private async spotCheck(k: Kind, indices: number[], key: string | null) {
		const cert = this.certs[k];
		if (this.certRid !== null) {
			if (this.certKind === k) return;
			this.send({ type: 'cancel', rid: this.certRid });
		}
		const rid = ++this.rid;
		this.certRid = rid;
		this.certKind = k;
		let settle = () => {};
		this.certRun = new Promise((r) => (settle = r));
		if (cert.spot) cert.spot = { ...cert.spot, running: true };
		// the rows answered so far, so a check resumed after a GPU reset asks only for the rest (not page state)
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const answered = new Set<number>();
		try {
			await this.request<{ seconds: number }>(
				{ type: 'certify', rid, kind: k, rows: indices },
				(msg) => {
					if (msg.type !== 'cert-rows' || !msg.indices) return;
					msg.indices.forEach((i) => answered.add(i));
					cert.addSpot(msg.indices, msg.margins);
				},
				() => ({
					type: 'certify',
					rid,
					kind: k,
					rows: indices.filter((i) => !answered.has(i))
				})
			);
			const when = new Date().toISOString();
			if (cert.spot) cert.spot = { ...cert.spot, running: false, when };
			if (key && !key.startsWith('session:'))
				writeSpot(k, {
					key,
					when,
					indices,
					margins: indices.map((i) => Math.round(cert.margins[i] * 1000) / 1000)
				});
		} catch (e) {
			// a spot check that stopped part way proves nothing: the next look at this operation starts it again
			cert.reset();
			if (!(e instanceof Cancelled)) this.loadError = (e as Error).message;
		} finally {
			if (this.certRid === rid) {
				this.certRid = null;
				this.certKind = null;
			}
			settle();
		}
	}

	/**
	 * The certificate to ship with the loaded program: every operation whose table passed in full on this device for
	 * the files loaded now (dev page: `sketchpad.exportCertificate()`, saved as `<program>/certificate.json`).
	 */
	exportCertificate(): ShippedCert | null {
		const id = this.loadedId;
		const info = id ? this.infos[id] : null;
		if (!id || !info) return null;
		const kinds: ShippedCert['kinds'] = {};
		const whens: string[] = [];
		for (const k of KINDS) {
			const c = this.certs[k];
			if (MODELS[k].id !== id || c.key !== this.keyFor(k)) continue;
			if (!(c.status === 'done' || c.status === 'cached') || c.pass !== c.rows) continue;
			whens.push(c.when ?? new Date().toISOString());
			kinds[k] = {
				prompts: { ...MODELS[k].prompts } as Record<string, string>,
				rows: c.rows,
				pass: c.pass,
				margins: Array.from(c.margins, (x) => Math.round(x * 1000) / 1000)
			};
		}
		return {
			format: CERT_FORMAT,
			program: id,
			dtype: { ...DTYPE },
			transformers: info.transformers,
			sprites: info.sprites,
			files: Object.fromEntries(certFiles().map((f) => [f, info.prints[f]])),
			device: info.gpu,
			// the oldest of the checks it ships
			when: whens.sort()[0] ?? new Date().toISOString(),
			kinds
		};
	}

	/**
	 * make sure the operation's certificate is there: kept from this session, checked on this device earlier, shipped
	 * with the model (spot-checked here), or checked in full now
	 */
	private async ensureCert(k: Kind) {
		const m = MODELS[k];
		if (this.loadedId !== m.id) return;
		const key = this.keyFor(k);
		const cert = this.certs[k];
		const settled = ['done', 'cached', 'shipped'].includes(cert.status);
		if (key && cert.key === key && settled) return;
		if (this.certRid !== null && this.certKind === k) return;
		const stored = key && !key.startsWith('session:') ? readStore(k) : null;
		if (stored && stored.key === key && stored.rows === cert.rows) {
			cert.reset();
			stored.margins.forEach((x, i) => (cert.margins[i] = x));
			cert.checked = cert.rows;
			cert.pass = stored.pass;
			cert.minMargin = stored.minMargin;
			cert.seconds = stored.seconds;
			cert.failures = stored.failures;
			cert.when = stored.when;
			cert.key = key;
			cert.status = 'cached';
			cert.version++;
			return;
		}
		const sc = await this.shippedFor(m.id);
		// the program changed, or another call settled this certificate, while the shipped one was fetched
		if (this.loadedId !== m.id || (cert.key === key && cert.status !== 'none')) return;
		if (this.certRid !== null && this.certKind === k) return;
		const t = sc && this.shippedTable(k, sc);
		if (sc && t) return this.useShipped(k, sc, t, key);
		void this.certify(k);
	}

	/** check every row of an operation's table on this device (again, if asked) */
	async certify(k: Kind = this.op) {
		const m = MODELS[k];
		if (this.loadedId !== m.id || this.loading) return;
		if (this.certRid !== null) {
			if (this.certKind === k) return;
			// one table at a time: the other operation's check stops and runs again when it is shown
			this.send({ type: 'cancel', rid: this.certRid });
		}
		const key = this.keyFor(k);
		const cert = this.certs[k];
		const rid = ++this.rid;
		this.certRid = rid;
		this.certKind = k;
		let settle = () => {};
		this.certRun = new Promise((r) => (settle = r));
		cert.start();
		cert.key = key;
		try {
			const done = await this.request<{ seconds: number }>(
				{ type: 'certify', rid, kind: k },
				(msg) => {
					if (msg.type === 'cert-rows') cert.add(msg.start, msg.margins, msg.got);
				},
				// after a GPU reset the check goes on from the first row not yet answered
				() => ({ type: 'certify', rid, kind: k, from: cert.checked })
			);
			cert.seconds = done.seconds;
			cert.status = 'done';
			if (key && !key.startsWith('session:'))
				writeStore(k, {
					key,
					pass: cert.pass,
					rows: cert.rows,
					minMargin: cert.minMargin,
					seconds: cert.seconds,
					when: new Date().toISOString(),
					margins: Array.from(cert.margins, (x) => Math.round(x * 1000) / 1000),
					failures: cert.failures
				});
		} catch (e) {
			// a check that stopped part way certifies nothing
			cert.reset();
			if (!(e instanceof Cancelled)) this.loadError = (e as Error).message;
		} finally {
			if (this.certRid === rid) {
				this.certRid = null;
				this.certKind = null;
			}
			settle();
		}
	}

	/** resolves when the table check under way (if any) ends, passed or not */
	certSettled(): Promise<void> {
		return this.certRun ?? Promise.resolve();
	}

	/** Stamp a problem on the sheet without running it (what the visitor typed). */
	stage(a: string, b: string) {
		if (this.running || this.op === 'calc') return;
		const clean = (s: string) => s.replace(/\D/g, '');
		if (!clean(a) || !clean(b)) {
			this.sheet = null;
			return;
		}
		this.sheet =
			this.op === 'add'
				? new AddSheet(a, b)
				: this.parallel
					? new MulWave(a, b)
					: new MulSheet(a, b);
		this.result = null;
		this.runError = null;
		this.last = null;
		this.ticks = 0;
		this.pushes = 0;
		this.walk = { current: -1, visited: new Set() };
		this.computeMs = 0;
		this.wallMs = 0;
		this.version++;
	}

	private tick(op: TickOp, cells: string[], push: string | null, inside = true) {
		const rid = ++this.rid;
		const asked = { op, cells: [...cells] };
		return this.request<Extract<FromWorker, { type: 'tick' }>>({
			type: 'tick',
			rid,
			op,
			cells,
			push,
			inside
		}).then((r) => {
			this.recorder?.calls.push({
				batch: false,
				items: [asked],
				outs: [r.out],
				margin: r.margin,
				ms: Math.round(r.ms),
				inside: [compactInside(r.inside)]
			});
			return r;
		});
	}

	// ---- recordings (recording.ts): playing one, and (dev page) making one ------------------------------------------
	/** a recording is being answered from: runs read its outputs, not the model's */
	replaying = $state(false);
	/** what the panels show is a recording (until the visitor's own run replaces it) */
	recordedShown = $state.raw<Recording | null>(null);
	/** the run being recorded (scripts/record-demo.mjs through the dev page) */
	private recorder: { calls: RecordedCall[]; rounds: RecordedRound[]; roundT0: number } | null =
		null;

	/** answer the next runs from a recording, its times multiplied by `speed` (0: at once) */
	playRecording(rec: Recording, speed: number, sprites: string) {
		this.replaying = true;
		this.recordedShown = rec;
		this.send({
			type: 'replay',
			calls: rec.calls,
			rounds: rec.chat?.rounds ?? [],
			speed,
			sprites
		});
	}

	/** back to the model: the panels keep the recording on show until a run of the visitor's own */
	stopPlayback() {
		if (!this.replaying) return;
		this.replaying = false;
		this.worker?.postMessage({
			type: 'replay',
			calls: null,
			speed: 0,
			sprites: ''
		} satisfies ToWorker);
	}

	/**
	 * Before the model loads, the certificate panel shows the shipped certificate (the table measured on the reference
	 * device; nothing on this device yet): what the recordings ran under, and what a load checks again here.
	 */
	async showShipped() {
		const sc = (await fetch(`${HF_CERT_ROOT}${PUBLISHED.folder}/certificate.json`)
			.then((r) => (r.ok ? r.json() : null))
			.catch(() => null)) as ShippedCert | null;
		if (!sc) return;
		for (const k of KINDS) {
			const t = sc.kinds[k];
			const c = this.certs[k];
			if (!t || c.status !== 'none' || t.margins.length !== c.rows) continue;
			c.margins.set(t.margins);
			c.checked = t.rows;
			c.pass = t.pass;
			c.minMargin = Math.min(...t.margins);
			c.shippedFrom = { device: sc.device, when: sc.when };
			c.status = 'shipped';
			c.version++;
		}
	}

	/**
	 * Before the model loads, the inside panels draw the recordings' readouts on the program's own maps: its
	 * inside.json (about 100 KB, the file the worker reads with the model, at the same pinned revision).
	 */
	async showInside(root: string) {
		if (this.insideMeta) return;
		const ij = await fetch(`${root}${MODELS.mul.id}/inside.json`)
			.then((r) => (r.ok ? r.json() : null))
			.catch(() => null);
		if (!ij || this.insideMeta) return;
		try {
			this.insideMeta = insideMetaOf(ij);
		} catch {
			// a program without maps: the panels say so, as before
		}
	}

	/** dev page: record the next run */
	startRecording() {
		this.recorder = {
			calls: [],
			rounds: [{ deltas: [], block: null }],
			roundT0: performance.now()
		};
	}

	/** dev page: the run just made, as a recording (scripts/record-demo.mjs writes it to static/recordings/) */
	finishRecording(input: Recording['input']): Recording | null {
		const rec = this.recorder;
		this.recorder = null;
		const info = this.loadedId ? this.infos[this.loadedId] : null;
		if (!rec || !info) return null;
		const tab = input.tab;
		const turn = tab === 'chat' ? this.chat[this.chat.length - 1] : null;
		const alg = tab === 'algebra' || tab === 'chat' ? this.algebra : null;
		const run = tab === 'machine' ? this.result : tab === 'calc' ? this.calcResult : (alg ?? null);
		return {
			format: RECORDING_FORMAT,
			tab,
			input,
			provenance: {
				device: info.gpu,
				date: new Date().toISOString(),
				repo: HF_REPO,
				revision: PUBLISHED.revision,
				baseRevision: PUBLISHED.baseRevision ?? PUBLISHED.revision,
				certificateRevision: PUBLISHED.certificateRevision ?? PUBLISHED.revision,
				program: info.id,
				transformers: info.transformers,
				files: { ...info.prints }
			},
			calls: rec.calls,
			chat: turn ? { rounds: rec.rounds, ms: Math.round(turn.ms ?? 0) } : null,
			result: {
				lines:
					tab === 'machine' && this.result
						? [
								`${this.result.operands.join(this.op === 'add' ? ' + ' : ' × ')} = ${this.result.got}`
							]
						: tab === 'calc' && this.calcResult
							? [`${this.calcResult.text} = ${this.calcResult.got}`]
							: tab === 'chat' && turn
								? [turn.a]
								: (alg?.lines ?? []),
				derivation: alg ? alg.results.flatMap((r) => r.derivation.lines.map((l) => l.tex)) : [],
				views: run?.ticks ?? 0,
				steps: (run && 'steps' in run ? run.steps : null) ?? run?.ticks ?? 0,
				seconds: Math.round((run?.seconds ?? 0) * 10) / 10
			}
		};
	}

	/** wait between ticks; a stop cuts it short */
	private async rest(ms: number) {
		const end = performance.now() + ms;
		while (!this.stopRun && performance.now() < end)
			await new Promise((r) => setTimeout(r, Math.min(50, end - performance.now())));
	}

	/** several multiplier views in one batched generation (the wave schedule; also the dev page's benchmark) */
	tickBatch(
		items: { op: TickOp; cells: string[]; push?: string | null }[],
		inside = true,
		insideRows?: number
	) {
		const rid = ++this.rid;
		const asked = items.map((it) => ({ op: it.op, cells: [...it.cells] }));
		return this.request<Extract<FromWorker, { type: 'tick-batch' }>>({
			type: 'tick-batch',
			rid,
			items,
			inside,
			insideRows
		}).then((r) => {
			this.recorder?.calls.push({
				batch: true,
				items: asked,
				outs: r.outs,
				margin: null,
				ms: Math.round(r.ms),
				inside: r.inside.map((x) => compactInside(x))
			});
			return r;
		});
	}

	/** Change an unread digit; the next ticks read the new one. */
	bump(row: string, x: number, by = 1) {
		const s = this.sheet;
		if (!s || s.done || !this.running || s instanceof Grid) return false;
		const ok =
			s instanceof AddSheet
				? (row === 'top' || row === 'bottom') && s.bump(row, x, by)
				: s.bump(row as 'b', x, by);
		if (ok) this.version++;
		return ok;
	}

	stop() {
		this.stopRun = true;
	}

	/** stop the run under way, and wait until it has stopped */
	async halt() {
		if (!this.running) return;
		this.stop();
		await this.runDone;
	}

	/** a multiplier answer must be glyphs and a step name; anything else stops the run */
	private checkMul(op: TickOp, out: MulOut) {
		const digit = (g: string) => /^\d$/.test(g);
		const stamps =
			op === 'MUL' || op === 'ADD' || op === 'ADZ'
				? [out[0], out[1]]
				: op === 'FLS'
					? [out[0]]
					: [];
		const bad = stamps.find((g) => !digit(g) && !(op === 'FLS' && g === B));
		if (bad !== undefined)
			throw new Error(`the model wrote ${JSON.stringify(bad)}, which is not a glyph`);
		if (!MUL_NEXT.includes(out[2]) || out[2].length !== 1)
			throw new Error(`the model named ${JSON.stringify(out[2])} as its next step`);
	}

	/** one table row read: on the walk, and in the run's record of rows and whether each passed here */
	private noteRead(op: TickOp, cells: string[], read: Record<number, boolean>, cert: Cert) {
		const row = rowIndex(op, cells);
		read[row] = row >= 0 && cert.margins[row] > 0;
		return row;
	}

	/**
	 * The multiplier as a wave: every pass under way takes its step together, in one batch (a slotted program; otherwise
	 * one per step word length, ADD being one token and the other words two, since a generated batch must not pad),
	 * every view is read before any answer is applied, and the inside panels follow the leading pass.
	 */
	private async runWave(w: MulWave, cert: Cert, read: Record<number, boolean>, t0: number) {
		const limit = 6 * w.m + 2 * w.n + 64;
		while (!w.done) {
			if (this.stopRun) throw new Cancelled();
			if (w.steps > limit) throw new Error('the run did not halt');
			const act = w.active();
			const views = act.map((q) => ({ op: q.op as TickOp, cells: w.view(q) }));
			const rows = views.map((v) => this.noteRead(v.op, v.cells, read, cert));
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const visited = new Set(this.walk.visited);
			rows.forEach((r) => r >= 0 && visited.add(r));
			this.walk = { current: rows[0] ?? -1, visited };
			// a push waits for the leading pass's next multiply step with a digit of a
			const push = pushable(views[0].op, views[0].cells) ? this.push : null;
			if (push) this.push = null;
			const outs: MulOut[] = new Array(act.length);
			const strips: Uint8ClampedArray[] = new Array(act.length);
			const seen: (InsideTick | null)[] = new Array(act.length);
			let ms = 0;
			// a slotted program pads every step's prompt to one length: one batch; otherwise one per step word length
			const groups = MODELS.mul.slots ? [null] : [true, false];
			for (const short of groups) {
				const idx = act
					.map((q, i) => i)
					.filter((i) => short === null || (act[i].op === 'ADD') === short);
				if (!idx.length) continue;
				const r = await this.tickBatch(
					idx.map((i) => ({ ...views[i], push: i === 0 ? push : null }))
				);
				idx.forEach((i, k) => {
					outs[i] = r.outs[k] as MulOut;
					strips[i] = r.strips[k];
					seen[i] = r.inside[k];
				});
				ms += r.ms;
			}
			if (seen[0]?.pushed) this.pushes++;
			act.forEach((q, i) => this.checkMul(views[i].op, outs[i]));
			act.forEach((q, i) => w.apply(q, outs[i]));
			w.endStep();
			this.last = {
				op: views[0].op,
				cells: views[0].cells,
				out: outs[0],
				margin: null,
				strip: strips[0],
				ms,
				inside: seen[0]
			};
			this.ticks += act.length;
			this.computeMs += ms;
			this.wallMs = performance.now() - t0;
			this.version++;
			if (!w.done && this.pace > 0) await this.rest(this.pace);
		}
	}

	async run(a: string, b: string) {
		if (this.running || !this.certified) return;
		this.stage(a, b);
		const sheet = this.sheet;
		if (!sheet || sheet instanceof Grid) return;
		const kind = this.op;
		const cert = this.certs[kind];
		let finish = () => {};
		this.runDone = new Promise((r) => (finish = r));
		this.running = true;
		this.runs++;
		if (!this.replaying) this.recordedShown = null;
		this.stopRun = false;
		const t0 = performance.now();
		// every table row this run reads, and whether each passed on this device
		const read: Record<number, boolean> = {};
		try {
			if (sheet instanceof MulWave) await this.runWave(sheet, cert, read, t0);
			else
				for (;;) {
					const limit = sheet instanceof AddSheet ? sheet.n + 1 : 4 * sheet.W * (sheet.m + 1) + 64;
					if (this.stopRun) throw new Cancelled();
					if (sheet.ticks > limit) throw new Error('the run did not halt');
					const op: TickOp = sheet instanceof AddSheet ? 'ADD-FAST' : sheet.op;
					const cells = sheet.view();
					const row = this.noteRead(op, cells, read, cert);
					// the walk is replaced whole on every tick ($state.raw), never changed in place
					// eslint-disable-next-line svelte/prefer-svelte-reactivity
					if (row >= 0) this.walk = { current: row, visited: new Set(this.walk.visited).add(row) };
					const push = pushable(op, cells) ? this.push : null;
					if (push) this.push = null;
					const r = await this.tick(op, cells, push);
					if (r.inside?.pushed) this.pushes++;
					this.last = {
						op,
						cells,
						out: r.out,
						margin: r.margin,
						strip: r.strip,
						ms: r.ms,
						inside: r.inside
					};
					this.ticks++;
					this.computeMs += r.ms;
					this.wallMs = performance.now() - t0;
					let more: boolean;
					if (sheet instanceof AddSheet) {
						const rule = addDecode(r.out[0]);
						if (!rule)
							throw new Error(
								`the model wrote ${JSON.stringify(r.out[0])}, which is not an answer`
							);
						more = sheet.apply(rule);
					} else {
						const out = r.out as MulOut;
						this.checkMul(op, out);
						more = sheet.apply(out);
					}
					this.version++;
					if (!more) break;
					if (this.pace > 0) await this.rest(this.pace);
				}
			const got = sheet.result();
			const want = sheet.expected();
			this.result = {
				ok: got === want,
				got,
				want,
				operands: sheet.operands(),
				edits: sheet.edits,
				certified: cert.certified,
				ticks: sheet.ticks,
				msPerTick: this.computeMs / Math.max(1, this.ticks),
				seconds: (performance.now() - t0) / 1000,
				digits: sheet instanceof AddSheet ? sheet.n - 1 : sheet.n,
				views: Object.keys(read).length,
				unchecked: Object.values(read).filter((ok) => !ok).length,
				uncheckedLabels: Object.entries(read)
					.filter(([, ok]) => !ok)
					.map(([row]) =>
						Number(row) >= 0 ? rowLabel(kind, Number(row)) : 'a view outside the table'
					),
				pushes: this.pushes,
				certSource: cert.status === 'shipped' ? 'shipped' : 'device',
				steps: sheet instanceof MulWave ? sheet.steps : null
			};
		} catch (e) {
			this.runError = e instanceof Cancelled ? 'stopped' : (e as Error).message;
		} finally {
			this.running = false;
			this.wallMs = performance.now() - t0;
			this.version++;
			finish();
		}
	}

	/**
	 * A fresh run on the calculator's sheets: the counters reset, and an arithmetic unit whose every step goes to the
	 * model, the sheet shown being the one the procedure works on. `read` collects every table row the run reads.
	 */
	private sheetCalc(
		read: Record<string, { kind: Kind; row: number; ok: boolean }>,
		t0: number,
		task: CalcTask | null = null
	) {
		this.stageToken++;
		this.preview = null;
		this.running = true;
		this.runs++;
		if (!this.replaying) this.recordedShown = null;
		this.stopRun = false;
		this.result = null;
		this.calcResult = null;
		this.algebra = null;
		this.runError = null;
		this.last = null;
		this.ticks = 0;
		this.pushes = 0;
		this.computeMs = 0;
		this.walk = { current: -1, visited: new Set() };
		const policy: Policy = async (views) => {
			if (this.stopRun) throw new Cancelled();
			// the sheet as the previous step left it, with this step's eyes
			this.version++;
			const rows = views.map((v) => {
				const kind = kindOf(v.op);
				const row = rowIndex(v.op, v.cells);
				read[`${kind}:${row}:${v.op}${v.cells.join('')}`] = {
					kind,
					row,
					ok: row >= 0 && this.certs[kind].margins[row] > 0
				};
				return kind === 'calc' ? row : -1;
			});
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			const visited = new Set(this.walk.visited);
			rows.forEach((r) => r >= 0 && visited.add(r));
			this.walk = { current: rows[0], visited };
			let outs: string[][];
			let ms: number;
			let strip: Uint8ClampedArray;
			let inside: InsideTick | null;
			let margin: number | null = null;
			// the inside panels follow every step: the states of the view on show come back, the rest stay on the GPU
			const watch = this.pace > 0 || this.watchSteps;
			if (views.length === 1 && views[0].op === 'ADD-FAST') {
				const r = await this.tick('ADD-FAST', views[0].cells, null, watch);
				outs = [r.out];
				({ ms, strip, inside, margin } = r);
			} else {
				const r = await this.tickBatch(
					views.map((v) => ({ op: v.op, cells: v.cells })),
					watch,
					1
				);
				outs = r.outs;
				ms = r.ms;
				strip = r.strips[0];
				inside = r.inside[0];
			}
			this.last = { ...views[0], out: outs[0], margin, strip, ms, inside };
			this.ticks += views.length;
			this.computeMs += ms;
			this.wallMs = performance.now() - t0;
			return outs;
		};
		const calc = new SheetCalc(policy, {
			onShow: (sheet: CalcSheet) => {
				if (task) decorate(sheet, task);
				this.sheet = sheet;
				this.version++;
			},
			onStep: async () => {
				if (this.pace > 0) await this.rest(this.pace);
				if (this.stopRun) throw new Cancelled();
			}
		});
		return calc;
	}

	/** the rows a run read that did not pass on this device */
	private unchecked(read: Record<string, { kind: Kind; row: number; ok: boolean }>) {
		const rs = Object.values(read);
		const bad = rs.filter((r) => !r.ok);
		return {
			views: rs.length,
			unchecked: bad.length,
			uncheckedLabels: bad.map((r) =>
				r.row >= 0 ? rowLabel(r.kind, r.row) : 'a view outside the tables'
			)
		};
	}

	/**
	 * Run one calculator line on the sheet (calc-task.ts): every step goes to the model, the sheet shown is the one the
	 * procedure is working on, and the answer is checked against the page's own arithmetic.
	 */
	async runCalc(text: string): Promise<CalcResult | null> {
		if (this.running || this.op !== 'calc') return null;
		const task: CalcTask | string = parseTask(text);
		if (typeof task === 'string') {
			// the line cannot be read: say so in place of the last answer
			this.calcResult = null;
			this.runError = task;
			return null;
		}
		if (!this.certified) return null;
		let finish = () => {};
		this.runDone = new Promise((r) => (finish = r));
		const t0 = performance.now();
		// every table row read, by table, and whether it passed on this device
		const read: Record<string, { kind: Kind; row: number; ok: boolean }> = {};
		const calc = this.sheetCalc(read, t0, task);
		try {
			const got = await solve(calc, task);
			const want = expected(task);
			this.calcResult = {
				text: describeTask(task),
				ok: got === want,
				got,
				want,
				steps: calc.calls,
				ticks: calc.views,
				seconds: (performance.now() - t0) / 1000,
				model: calc.seconds,
				certified: this.certified,
				...this.unchecked(read)
			};
			return this.calcResult;
		} catch (e) {
			this.runError = e instanceof Cancelled ? 'stopped' : (e as Error).message;
			return null;
		} finally {
			if (this.sheet instanceof Grid) this.sheet.done = true;
			this.running = false;
			this.wallMs = performance.now() - t0;
			this.version++;
			finish();
		}
	}

	/**
	 * Run a work order (program/run.ts) on the sheet: the fixed runtime parses it and schedules the arithmetic, and
	 * every digit of that arithmetic is the model's, on the calculator's sheets. The lines are checked against the same
	 * work order on the page's own arithmetic. The work order, the procedure and the layout are not certified.
	 */
	/**
	 * the cost model's seconds for the work order under way, from the plan (its rows and calls only): the chat shows it,
	 * with a Stop, when a block will take long
	 */
	algebraEstimate = $state<number | null>(null);

	/** Run a work order on the sheet; `options` are the runtime's (the chat's blocks: `defaultPlaces`). */
	async runAlgebra(
		text: string,
		options: Pick<RunOptions, 'defaultPlaces'> = {}
	): Promise<AlgebraRun | null> {
		if (this.running || this.op !== 'calc') return null;
		const source = text.trim();
		if (!source || !this.certified) return null;
		const checkMode = this.checkMode;
		let reference: Awaited<ReturnType<typeof runWorkOrder>>;
		const ref = new RefCalc();
		try {
			reference = await runWorkOrder(source, ref, { checkMode, ...options });
			this.algebraEstimate = ref.total.seconds;
		} catch (e) {
			// a work order the parser cannot read never reaches the sheet
			this.clearRun();
			this.algebraPlan = null;
			this.runError = (e as Error).message;
			return null;
		}
		let finish = () => {};
		this.runDone = new Promise((r) => (finish = r));
		const t0 = performance.now();
		const read: Record<string, { kind: Kind; row: number; ok: boolean }> = {};
		const calc = this.sheetCalc(read, t0);
		// the derivation is laid out from the plan and revealed as the model's calls return
		this.algebraPlan = {
			text: source,
			checkMode,
			results: reference.results,
			trace: reference.trace,
			staged: false
		};
		const live: Live = { started: new Map(), done: new Map() };
		this.algebraLive = live;
		this.liveVersion++;
		const watched = new Watched(
			calc,
			{
				start: (key) => {
					live.started.set(key, (live.started.get(key) ?? 0) + 1);
					this.liveVersion++;
				},
				done: (key, r) => {
					const got = live.done.get(key);
					if (got) got.push(r);
					else live.done.set(key, [r]);
					this.liveVersion++;
				}
			},
			import.meta.env?.DEV ? this.lie : null
		);
		try {
			const r = await runWorkOrder(source, watched, { checkMode, ...options });
			const want = reference.lines;
			this.algebra = {
				text: source,
				lines: r.lines,
				want,
				ok: r.lines.length === want.length && r.lines.every((l, i) => l === want[i]),
				results: r.results,
				checkMode,
				steps: calc.calls,
				ticks: calc.views,
				seconds: (performance.now() - t0) / 1000,
				model: calc.seconds,
				certified: this.certified,
				...this.unchecked(read)
			};
			return this.algebra;
		} catch (e) {
			this.runError = e instanceof Cancelled ? 'stopped' : (e as Error).message;
			return null;
		} finally {
			if (this.sheet instanceof Grid) this.sheet.done = true;
			this.running = false;
			this.wallMs = performance.now() - t0;
			this.version++;
			finish();
		}
	}

	/**
	 * Lay a work order out before it runs: its given lines, from a plan on the page's own arithmetic (a few
	 * milliseconds). A line the parser cannot read yet shows nothing.
	 */
	async stageAlgebra(text: string) {
		if (this.running) return;
		const checkMode = this.checkMode;
		const token = ++this.stageToken;
		this.algebra = null;
		this.runError = null;
		try {
			const reference = await runWorkOrder(text.trim(), new RefCalc(), { checkMode });
			if (token !== this.stageToken || this.running) return;
			this.algebraPlan = {
				text: text.trim(),
				checkMode,
				results: reference.results,
				trace: reference.trace,
				staged: true
			};
		} catch {
			if (token === this.stageToken) this.algebraPlan = null;
		}
	}

	/** the model the chat asks: 1, the one that opens its sheet; 0, stock Qwen3.5-0.8B (the comparison) */
	chatGate = $state<0 | 1>(1);
	/** counts the questions asked: a new one lets the chat's layout go once (ratchet.ts) */
	asks = $state(0);

	/**
	 * Ask the chat. At gate 1 the reply may open the sheet: when it closes a sheet block, the block runs here as a work
	 * order on the sheet, exactly as the Algebra tab runs one (every digit by the model, shown live in the sheet panel),
	 * and its result lines go back into the reply, which goes on from them.
	 */
	async ask(question: string) {
		const q = question.trim();
		if (!q || (!this.chatReady && !this.replaying) || this.chatBusy || this.running) return;
		if (!this.replaying) this.recordedShown = null;
		const turn: ChatTurn = {
			q,
			a: '',
			busy: true,
			ms: null,
			error: null,
			gate: this.chatGate,
			blocks: [],
			recorded: this.replaying
		};
		this.asks++;
		this.chat = [...this.chat.slice(-2), turn];
		const live = this.chat[this.chat.length - 1];
		const rid = ++this.rid;
		const ask: ToWorker = { type: 'chat', rid, question: q, maxNew: 320, gate: turn.gate };
		try {
			const done = await this.request<{ ms: number }>(
				ask,
				(m) => {
					const rec = this.recorder;
					if (m.type === 'chat-delta') {
						live.a += m.text;
						rec?.rounds.at(-1)!.deltas.push([Math.round(performance.now() - rec.roundT0), m.text]);
					} else if (m.type === 'chat-block') {
						if (rec) rec.rounds.at(-1)!.block = m.block;
						void this.sheetBlock(live, rid, m.block);
					}
				},
				// after a GPU reset the answer starts again
				() => {
					live.a = '';
					live.blocks = [];
					return ask;
				}
			);
			// a replayed reply's time is the recording's (the page's clock ran at the playback's pace)
			live.ms = this.replaying && this.recordedShown?.chat ? this.recordedShown.chat.ms : done.ms;
		} catch (e) {
			live.error = (e as Error).message;
		} finally {
			live.busy = false;
		}
	}

	/**
	 * the seconds a replayed reply's k-th sheet block took when it was recorded (a recording made before rounds kept
	 * them has its one block's time as the run's; with several blocks and no times, none is shown)
	 */
	private recordedBlockSeconds(k: number) {
		const rec = this.recordedShown;
		const blocks = rec?.chat?.rounds.filter((r) => r.block !== null) ?? [];
		return blocks[k]?.seconds ?? (rec && blocks.length === 1 ? rec.result.seconds : null);
	}

	/** run a reply's sheet block on the sheet, then hand its result lines back to the reply */
	private async sheetBlock(live: ChatTurn, rid: number, source: string) {
		const block = { source, result: null as string | null, seconds: null as number | null };
		live.blocks = [...live.blocks, block];
		const entry = live.blocks[live.blocks.length - 1];
		const t0 = performance.now();
		// a fraction and four places unless the block asks for more (run.ts, defaultPlaces): seconds, not minutes
		const r = await this.runAlgebra(source, { defaultPlaces: 4 }).catch(() => null);
		const seconds = (performance.now() - t0) / 1000;
		entry.seconds = this.replaying ? this.recordedBlockSeconds(live.blocks.length - 1) : seconds;
		// a stop ends the run (the runtime writes the stop as the statement's error line) and the reply with it
		if (this.stopRun) {
			// stopped on the sheet: the reply ends there
			entry.result = 'stopped';
			this.send({ type: 'chat-stop', rid });
			return;
		}
		const result = r
			? r.lines.join('\n')
			: `= error: ${this.runError ?? 'the sheet could not run this'}`;
		entry.result = result;
		live.a += `\n${result}\n`;
		if (this.recorder) {
			this.recorder.rounds.at(-1)!.seconds = Math.round(seconds * 10) / 10;
			this.recorder.rounds.push({ deltas: [], block: null });
			this.recorder.roundT0 = performance.now();
		}
		this.send({ type: 'chat-continue', rid, result });
	}
}

export const pad = new Pad();

/**
 * Display only: the decimal point of a line asked to k places, on the sheet that computes it. A quotient to k places
 * is the integer quotient of the dividend times 10^k, so its units digit is cell k (and the dividend's too); a root to
 * k places is the integer root of the number times 10^2k, whose units digit sits above pair k, cell 2k.
 */
function decorate(sheet: CalcSheet, task: CalcTask) {
	if (!(sheet instanceof Grid)) return;
	if (task.op === '÷' && task.places > 0 && sheet.title === 'a ÷ b')
		sheet.points = { q: task.places, a: task.places };
	if (task.op === '√' && task.places > 0 && sheet.title === '√a')
		sheet.points = { root: 2 * task.places, a: 2 * task.places };
}

/** A step in plain words: the word the model reads before the image, and what that step does. */
export const STEP: Record<TickOp, string> = {
	'ADD-FAST': 'add one column',
	MUL: 'multiply one digit',
	ADD: 'add it to the total',
	ADZ: 'add the last product digit',
	FLS: 'add the last carry',
	NXT: 'move to the next digit',
	SUB: 'subtract one column',
	EST: 'guess the next digit',
	DEC: 'lower the guess'
};

/** What one answer means, in words, for the inset. */
export function explain(op: TickOp, out: string[]): string {
	if (op === 'ADD-FAST') {
		const r = addDecode(out[0]);
		if (!r) return 'not an answer';
		if (r === 'H') return 'halt: the column and the carry are blank';
		return `sum digit ${r[0]}, ${r[1] === '1' ? 'carry 1' : 'no carry'}`;
	}
	const [g1, g2, n] = out;
	const show = (g: string) => (g === B ? 'blank' : g);
	if (op === 'SUB') {
		if (n === 'H') return 'past both numbers, nothing borrowed: halt';
		if (n === 'B') return 'past both numbers, a borrow out: the top was smaller';
		return `difference digit ${g1}, ${g2 === '1' ? 'borrow 1' : 'no borrow'}`;
	}
	if (op === 'EST')
		return n === 'N' ? 'guess 0: nothing to subtract' : `guess ${g1}, then multiply-subtract`;
	if (op === 'DEC') return `lower the guess to ${g1}, then correct the remainder`;
	const next: Record<string, string> = {
		M: 'MUL',
		A: 'ADD',
		Z: 'ADZ',
		F: 'FLS',
		N: 'NXT',
		H: 'halt'
	};
	const op2 = op as Op;
	if (op2 === 'MUL') return `product ${show(g1)}, carry ${g2}, then ${next[n] ?? n}`;
	if (op2 === 'ADD' || op2 === 'ADZ')
		return `result ${show(g1)}, carry ${g2}, then ${next[n] ?? n}`;
	if (op2 === 'FLS') return `last carry ${show(g1)}, then ${next[n] ?? n}`;
	return n === 'H' ? 'no digits left: halt' : 'next multiplier digit';
}
