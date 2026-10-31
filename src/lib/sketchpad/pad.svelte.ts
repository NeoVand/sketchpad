/**
 * The sketchpad from the page's side: the GPU check, which model is loaded, the download, the certificate (fresh or
 * cached for the same files), the live run on the sheet, and the chat. The page owns the sheet, which is the model's
 * only memory; the worker only reads the strips it is sent and answers.
 */
import { ADD_DOMAIN, AddSheet, addCode, addDecode, addRule } from './adder.ts';
import { Grid, type CalcSheet, type Policy } from './calc-sheet.ts';
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
	FILE_CACHE,
	KINDS,
	MODELS,
	certFiles,
	kindOf,
	modelFiles,
	servedPath,
	type Kind
} from './models.ts';
import { SheetCalc } from './sheet-calc.ts';
import {
	RefCalc,
	run as runWorkOrder,
	type CheckMode,
	type StatementResult
} from './program/index.ts';
import { MUL_DOMAIN, MulSheet, MulWave, outChars, type MulOut, type Op } from './multiplier.ts';
import type { InsideTick } from './inside.ts';
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
	a: string;
	busy: boolean;
	ms: number | null;
	error: string | null;
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
	/** a certificate cannot be cached because a file's fingerprint is missing */
	cacheNote = $state<string | null>(null);

	certs: Record<Kind, Cert> = {
		add: new Cert('add'),
		mul: new Cert('mul'),
		calc: new Cert('calc')
	};

	sheet = $state.raw<Sheet | null>(null);
	/** bumps whenever the sheet changes */
	version = $state(0);
	running = $state(false);
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
					const url = this.root + servedPath(m, f);
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
		if (this.sheet instanceof Grid) this.sheet = null;
		this.version++;
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
			p = fetch(`${this.root}${id}/certificate.json`, { cache: 'no-cache' })
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
		return this.request<Extract<FromWorker, { type: 'tick' }>>({
			type: 'tick',
			rid,
			op,
			cells,
			push,
			inside
		});
	}

	/** wait between ticks; a stop cuts it short */
	private async rest(ms: number) {
		const end = performance.now() + ms;
		while (!this.stopRun && performance.now() < end)
			await new Promise((r) => setTimeout(r, Math.min(50, end - performance.now())));
	}

	/** several multiplier views in one batched generation (the wave schedule; also the dev page's benchmark) */
	tickBatch(items: { op: TickOp; cells: string[]; push?: string | null }[], inside = true) {
		const rid = ++this.rid;
		return this.request<Extract<FromWorker, { type: 'tick-batch' }>>({
			type: 'tick-batch',
			rid,
			items,
			inside
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
	private sheetCalc(read: Record<string, { kind: Kind; row: number; ok: boolean }>, t0: number) {
		this.running = true;
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
			// the inside panels follow a slow run; a fast one leaves the states on the GPU
			const watch = this.pace > 0;
			if (views.length === 1 && views[0].op === 'ADD-FAST') {
				const r = await this.tick('ADD-FAST', views[0].cells, null, watch);
				outs = [r.out];
				({ ms, strip, inside, margin } = r);
			} else {
				const r = await this.tickBatch(
					views.map((v) => ({ op: v.op, cells: v.cells })),
					watch
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
			this.runError = task;
			return null;
		}
		if (!this.certified) return null;
		let finish = () => {};
		this.runDone = new Promise((r) => (finish = r));
		const t0 = performance.now();
		// every table row read, by table, and whether it passed on this device
		const read: Record<string, { kind: Kind; row: number; ok: boolean }> = {};
		const calc = this.sheetCalc(read, t0);
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
	async runAlgebra(text: string): Promise<AlgebraRun | null> {
		if (this.running || this.op !== 'calc') return null;
		const source = text.trim();
		if (!source || !this.certified) return null;
		const checkMode = this.checkMode;
		let reference: Awaited<ReturnType<typeof runWorkOrder>>;
		try {
			reference = await runWorkOrder(source, new RefCalc(), { checkMode });
		} catch (e) {
			// a work order the parser cannot read never reaches the sheet
			this.clearRun();
			this.runError = (e as Error).message;
			return null;
		}
		let finish = () => {};
		this.runDone = new Promise((r) => (finish = r));
		const t0 = performance.now();
		const read: Record<string, { kind: Kind; row: number; ok: boolean }> = {};
		const calc = this.sheetCalc(read, t0);
		try {
			const r = await runWorkOrder(source, calc, { checkMode });
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

	async ask(question: string) {
		const q = question.trim();
		if (!q || !this.chatReady || this.chatBusy) return;
		const turn: ChatTurn = { q, a: '', busy: true, ms: null, error: null };
		this.chat = [...this.chat.slice(-2), turn];
		const live = this.chat[this.chat.length - 1];
		const rid = ++this.rid;
		try {
			const ask: ToWorker = { type: 'chat', rid, question: q, maxNew: 120 };
			const done = await this.request<{ ms: number }>(
				{ type: 'chat', rid, question: q, maxNew: 120 },
				(m) => {
					if (m.type === 'chat-delta') live.a += m.text;
				},
				// after a GPU reset the answer starts again
				() => {
					live.a = '';
					return ask;
				}
			);
			live.ms = done.ms;
		} catch (e) {
			live.error = (e as Error).message;
		} finally {
			live.busy = false;
		}
	}
}

export const pad = new Pad();

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
