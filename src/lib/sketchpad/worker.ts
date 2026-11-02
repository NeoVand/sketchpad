/// <reference lib="webworker" />
/**
 * The worker that holds the sketchpad model. The page owns the sheet (the model's only memory); the worker owns the
 * model's eyes and hands: it assembles each strip from the training sprites, runs one forward (or three greedy tokens),
 * and posts the answer back. It also checks the whole table for the certificate and answers chat questions. One GPU
 * job runs at a time; loads, certificate rows, ticks and chat take turns.
 *
 * Files: every program asks for `<root><program>/<file>`; base files are routed to one shared folder and kept in the
 * browser's Cache API under the URL they came from, so the base downloads once and a switch fetches only the program's
 * own graph. Each cached copy carries the fingerprint of the bytes that were downloaded, for the certificate cache.
 */
import { ADD_DOMAIN, addCode, addRule } from './adder.ts';
import { StreamHash, hashBytes } from './hash.ts';
import {
	DTYPE,
	FILE_CACHE,
	baseRootFor,
	fileUrl,
	servedName,
	MODELS,
	kindOf,
	modelFiles,
	pinned,
	promptFor,
	route,
	servedPath,
	type Kind,
	type SketchModel
} from './models.ts';
import {
	analyse,
	DEPTH,
	insideMetaOf,
	parseAssets,
	steerVector,
	type InsideAssets
} from './inside.ts';
import { expandInside, type RecordedCall, type RecordedRound } from './recording.ts';
import { CALC_DOMAIN, CALC_OPS, calcRef, isCalcOp, type CalcOp } from './calc-tables.ts';
import { MUL_DOMAIN, outChars, reference, type Op } from './multiplier.ts';
import type { FromWorker, InsideMeta, LoadedInfo, TickOp, ToWorker } from './protocol.ts';
import { B, CELL, assembleStrip, type SpriteSheet } from './sprites.ts';

declare const self: DedicatedWorkerGlobalScope;

/**
 * transformers.js 4.2.0, pinned for this page (package alias `transformers-420`). The rest of the site runs 4.3.1;
 * 4.3.1 bundles ONNX Runtime Web 1.31 instead of 1.26, whose kernels move the logits slightly (the adder's lowest
 * margin 1.46 instead of 1.40), so the page keeps the runtime its tables were verified on.
 */
type Tjs = typeof import('transformers-420');

interface TTensor {
	type: string;
	dims: number[];
	data: ArrayLike<number | bigint> & Iterable<number | bigint>;
}
type Inputs = Record<string, TTensor | unknown>;
interface Tok {
	encode(s: string, o?: { add_special_tokens?: boolean }): number[];
	decode(ids: number[], o?: { skip_special_tokens?: boolean }): string;
}
interface Processor {
	(text: string | string[], images?: unknown[]): Promise<Inputs>;
	tokenizer: Tok;
	apply_chat_template(messages: unknown[], o: Record<string, unknown>): string;
}
interface Model {
	(inputs: Inputs): Promise<{ logits: TTensor }>;
	generate(o: Record<string, unknown>): Promise<TTensor>;
	dispose(): Promise<unknown>;
}

const post = (m: FromWorker, transfer: Transferable[] = []) => self.postMessage(m, transfer);
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

class Cancelled extends Error {
	constructor() {
		super('cancelled');
	}
}

let tjs: Tjs | null = null;
let processor: Processor | null = null;
let model: Model | null = null;
let tok: Tok | null = null;
/** the loaded program's inside data (null for a program whose graph has no hidden_states output) */
let inside: InsideAssets | null = null;
let insideMeta: InsideMeta | null = null;
/** while on, every decoder call's states at its last position are kept, one entry per call */
let capturing = false;
/** per decoder call, per batch row, the states at its last `captureLast` positions */
let captured: Float32Array[][][] = [];
let captureLast = 1;
/** the batch rows whose states a tick reads (the page shows one view a step: the first) */
let captureRows = Infinity;
/**
 * how the states come back: 'gpu' keeps the whole `hidden_states` output on the GPU and copies back only the rows and
 * places a tick reads; 'cpu' downloads the whole output (the fallback, and the dev page's comparison)
 */
let statesVia: 'gpu' | 'cpu' = 'gpu';
/** logits the next decoder calls compute, counted from the end (0: every place); see slottedForward */
let keepLogits = 0;
/**
 * a push for the next decoder call that reads a whole prompt (the tick's first call): added to batch row `row` at the
 * place `back` from the end, the place that writes the first answer
 */
let steerNext: { row: number; back: number; vec: Float32Array } | null = null;
/**
 * the program's gate, for a graph that has one (`lora_gate`, research/sketch/patch_onnx_lora.py): 1 runs the adapter,
 * 0 runs stock Qwen bit for bit; chat runs at 0
 */
let gate = 1;
/** the program loaded now, and a counter that moves whenever the loaded model changes */
let loadedId: string | null = null;
let generation = 0;
/** the newest load the page asked for; an older one still queued is skipped */
let wanted = 0;
let sprites: SpriteSheet | null = null;
let spritesPrint = '';
let gpu = '';
/** fingerprints of model files, by served path below the models folder */
const prints = new Map<string, string>();
const cancelled = new Set<number>();
/** bytes of the current load: from the network (by served path) and from the cache */
let network: Record<string, number> = {};
let cachedBytes = 0;
let onBytes: () => void = () => {};
const PRINT_HEADER = 'x-sketchpad-print';

/** one GPU job at a time */
let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
	const run = chain.then(fn, fn);
	chain = run.catch(() => {});
	return run;
}

const urlOf = (input: RequestInfo | URL) =>
	typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

/**
 * fetch for transformers.js: routes base files to the shared folder, and fingerprints and counts every whole-file
 * download as it streams past
 */
function routedFetch(root: string) {
	return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
		const url = route(urlOf(input), root);
		if (!url) return fetch(input, init);
		const res = await fetch(url, init);
		const ranged = new Headers(init?.headers).has('Range');
		if (res.status !== 200 || ranged || !res.body) return res;
		const name = servedName(url, root)!;
		const h = new StreamHash();
		network[name] = 0;
		const body = res.body.pipeThrough(
			new TransformStream<Uint8Array, Uint8Array>({
				transform(chunk, ctl) {
					h.update(chunk);
					network[name] += chunk.length;
					onBytes();
					ctl.enqueue(chunk);
				},
				flush() {
					prints.set(name, h.digest());
				}
			})
		);
		return new Response(body, {
			status: res.status,
			statusText: res.statusText,
			headers: res.headers
		});
	};
}

/**
 * transformers.js's custom cache: the Cache API under the served URL, so every program shares the base's copy. A hit
 * restores the fingerprint stored with it.
 */
function fileCache(root: string) {
	const open = () => caches.open(FILE_CACHE);
	return {
		async match(key: RequestInfo | URL) {
			const url = route(urlOf(key), root);
			if (!url) return undefined;
			const hit = await (await open()).match(url);
			if (!hit) return undefined;
			const print = hit.headers.get(PRINT_HEADER);
			if (print) prints.set(servedName(url, root)!, print);
			cachedBytes += Number(hit.headers.get('content-length') ?? 0);
			onBytes();
			return hit;
		},
		async put(key: RequestInfo | URL, response: Response) {
			const url = route(urlOf(key), root);
			if (!url) return;
			const headers = new Headers(response.headers);
			const print = prints.get(servedName(url, root)!);
			if (print) headers.set(PRINT_HEADER, print);
			await (await open()).put(url, new Response(response.body, { status: 200, headers }));
		}
	};
}

/**
 * Drop cached files the server has since replaced (a new export under the same name): compare length, Last-Modified
 * and ETag with a HEAD. Offline, the cached copies stand.
 */
async function dropStale(m: SketchModel, root: string) {
	const cache = await caches.open(FILE_CACHE);
	await Promise.all(
		modelFiles().map(async (f) => {
			const url = fileUrl(m, f, root);
			const hit = await cache.match(url);
			if (!hit) return;
			const head = await fetch(url, { method: 'HEAD', cache: 'no-store' }).catch(() => null);
			if (!head?.ok) return;
			const same = (k: string) => {
				const a = head.headers.get(k);
				return !a || a === hit.headers.get(k);
			};
			if (!same('content-length') || !same('last-modified') || !same('etag'))
				await cache.delete(url);
		})
	);
}

/**
 * A pinned page keeps one revision: cached files of the same repository at another commit (an older program this
 * browser loaded before) are removed, so a visitor never carries two copies of the base.
 */
async function dropOtherRevisions(root: string) {
	const repo = root.replace(/[0-9a-f]{40}\/$/, '');
	const base = baseRootFor(root);
	const cache = await caches.open(FILE_CACHE);
	for (const req of await cache.keys())
		if (req.url.startsWith(repo) && !req.url.startsWith(root) && !req.url.startsWith(base))
			await cache.delete(req);
}

async function loadSprites(url: string) {
	const blob = await (await fetch(url)).blob();
	spritesPrint = hashBytes(new Uint8Array(await blob.arrayBuffer()));
	const bmp = await createImageBitmap(blob, {
		colorSpaceConversion: 'none',
		premultiplyAlpha: 'none'
	});
	const c = new OffscreenCanvas(bmp.width, bmp.height);
	const ctx = c.getContext('2d', { willReadFrequently: true })!;
	ctx.fillStyle = '#fff';
	ctx.fillRect(0, 0, c.width, c.height);
	ctx.drawImage(bmp, 0, 0);
	sprites = {
		width: c.width,
		height: c.height,
		data: ctx.getImageData(0, 0, c.width, c.height).data
	};
}

async function gpuName() {
	const a = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' });
	const i = a?.info;
	if (!i) return 'this browser’s GPU';
	const vendor = i.vendor ? i.vendor[0].toUpperCase() + i.vendor.slice(1) : '';
	return [vendor, i.architecture, i.description].filter(Boolean).join(' ') || 'this browser’s GPU';
}

function stripImage(cells: string[]) {
	const strip = assembleStrip(sprites!, cells);
	// the model gets its own copy; `strip` goes back to the page for the inset
	return { strip, image: new tjs!.RawImage(strip.slice(), CELL, 3 * CELL, 4) };
}

/** float16 bits to float32 */
const F16 = (() => {
	const t = new Float32Array(65536);
	for (let h = 0; h < 65536; h++) {
		const s = h & 0x8000 ? -1 : 1;
		const e = (h >> 10) & 0x1f;
		const f = h & 0x3ff;
		t[h] =
			e === 0
				? s * 2 ** -14 * (f / 1024)
				: e === 31
					? f
						? NaN
						: s * Infinity
					: s * 2 ** (e - 15) * (1 + f / 1024);
	}
	return t;
})();

/**
 * Logits at position `pos` as float32. An fp16 decoder's logits arrive as a Float16Array where the browser has one
 * (values), and as a Uint16Array of raw half-precision bits where it does not.
 */
function logitsAt(t: TTensor, pos: number): Float32Array {
	const V = t.dims[2];
	const data = t.data as unknown as ArrayLike<number> & { subarray?: unknown };
	if (t.type === 'float32') return (data as Float32Array).subarray(pos * V, (pos + 1) * V);
	if (t.type === 'float16') {
		const out = new Float32Array(V);
		if (data instanceof Uint16Array) for (let i = 0; i < V; i++) out[i] = F16[data[pos * V + i]];
		else for (let i = 0; i < V; i++) out[i] = data[pos * V + i];
		return out;
	}
	throw new Error(`logits of type ${t.type}`);
}

/** margin of token `t` (its logit minus the best other) and the best other token */
function margin(row: Float32Array, t: number) {
	let best = -Infinity;
	let arg = -1;
	for (let v = 0; v < row.length; v++)
		if (v !== t && row[v] > best) {
			best = row[v];
			arg = v;
		}
	return { m: row[t] - best, arg };
}

function argmax(row: Float32Array) {
	let a = 0;
	for (let v = 1; v < row.length; v++) if (row[v] > row[a]) a = v;
	return a;
}

const tokenOf = (c: string) => tok!.encode(c, { add_special_tokens: false })[0];

// ---- the inside: the decoder session's extra output and input ---------------------------------------------------
interface OrtTensor {
	type: string;
	dims: readonly number[];
	data: unknown;
}
interface OrtSession {
	inputNames: readonly string[];
	outputNames: readonly string[];
	run(
		feeds: Record<string, OrtTensor>,
		fetches?: unknown,
		opts?: unknown
	): Promise<Record<string, OrtTensor>>;
}

/** Row `b`'s states at position `pos` of a `hidden_states` output [DEPTH, batch, seq, DIM], as DEPTH x DIM. */
function statesAt(t: OrtTensor, b: number, pos: number): Float32Array {
	const [L, Bn, S, D] = t.dims;
	const data = t.data as ArrayLike<number>;
	const bits = data instanceof Uint16Array;
	const out = new Float32Array(L * D);
	for (let l = 0; l < L; l++) {
		const off = ((l * Bn + b) * S + pos) * D;
		for (let i = 0; i < D; i++) out[l * D + i] = bits ? F16[data[off + i]] : data[off + i];
	}
	return out;
}

/** the token ids of the embedding session's last call: the next decoder call's (E8's graph reads them) */
let lastIds: OrtTensor | null = null;

/** per batch row of a slotted call, the `?`s after its slots (padFor) */
let rowPads: number[] = [];

/**
 * The states that wrote each answer token of batch row b: one per call (generated), or for a slotted call the places
 * of `=` and the slots, which sit before the row's padding at the end.
 */
function tokenStates(b: number) {
	if (captureLast === 1 || !captured.length) return captured.map((c) => c[b][0]);
	const last = captured[0][b];
	const pad = rowPads[b] ?? 0;
	return last.slice(last.length - 1 - slots() - pad, last.length - pad);
}

/** the program's placeholder slots after the multiplier's prompt (0: answers generated token by token) */
const slots = () => MODELS.mul.slots ?? 0;

/** the ops read in one forward of a slotted prompt: the multiplier's five and the calculator's three */
type SlotOp = Op | CalcOp;
/** any step in the slotted prompt form: the slotted ops, and the adder when its program pads it (models.ts) */
type BatchOp = SlotOp | 'ADD-FAST';
const MUL_OPS: SlotOp[] = ['MUL', 'ADD', 'ADZ', 'FLS', 'NXT', ...CALC_OPS];
/** the adder's prompt is padded like the slotted ones */
const padSum = () => !!MODELS.add.padded && slots() > 0;
const promptLength = new Map<BatchOp, number>();
/**
 * `?`s after a step's slots, so that every slotted step's prompt has the length of the longest (the step words are
 * one or two tokens): a wave step is then one batch. A token after the answer places cannot change them (every layer
 * is causal), and the certificate checks each view in exactly this padded form.
 */
function padFor(op: BatchOp) {
	if (!promptLength.size)
		for (const o of [...MUL_OPS, 'ADD-FAST' as const])
			promptLength.set(o, tok!.encode(promptFor(o), { add_special_tokens: false }).length);
	return Math.max(...promptLength.values()) - promptLength.get(op)!;
}

// ---- the states on the GPU: one output buffer per size, and a small buffer the read places are copied into ----------
/** WebGPU's buffer usage flags (GPUBufferUsage; GPUMapMode.READ is 1 too), which this worker's types do not declare */
const USE = { MAP_READ: 0x1, COPY_SRC: 0x4, COPY_DST: 0x8, STORAGE: 0x80 } as const;
const statesBuffers = new Map<number, { buffer: GPUBuffer; tensor: Map<string, OrtTensor> }>();
let staging: GPUBuffer | null = null;
/** float16 or float32, as the graph declares `hidden_states` (null: unknown, so the states come back whole) */
let statesType: 'float16' | 'float32' | null | undefined;
/**
 * ONNX Runtime Web's Tensor class, taken from a tensor the session returned: a bound output must be one of its own (its
 * bundle carries its own copy of onnxruntime-common, so transformers.js's tensors are a different class)
 */
let ortTensor: {
	fromGpuBuffer(b: GPUBuffer, o: { dataType: string; dims: number[] }): OrtTensor;
} | null = null;

/**
 * Where a capturing call's `hidden_states` [DEPTH, batch, seq, DIM] goes: a GPU buffer of this page's, bound as the
 * output, so ONNX Runtime writes the states there and nothing is downloaded. Null when that is not possible here.
 */
function statesTarget(s: OrtSession, dims: number[]) {
	if (!device || deviceLost || !ortTensor) return null;
	if (statesType === undefined) {
		const meta = (s as unknown as { outputMetadata?: { name: string; type?: string }[] })
			.outputMetadata;
		const t = meta?.find((m) => m.name === 'hidden_states')?.type;
		statesType = t === 'float16' || t === 'float32' ? t : null;
	}
	if (!statesType) return null;
	const [Bn, S, D] = dims;
	const shape = [DEPTH, Bn, S, D];
	const bytes = DEPTH * Bn * S * D * (statesType === 'float16' ? 2 : 4);
	let slot = statesBuffers.get(bytes);
	if (!slot) {
		slot = {
			buffer: device.createBuffer({
				size: bytes,
				usage: USE.STORAGE | USE.COPY_SRC | USE.COPY_DST
			}),
			tensor: new Map()
		};
		statesBuffers.set(bytes, slot);
	}
	const key = shape.join('x');
	let tensor = slot.tensor.get(key);
	if (!tensor) {
		tensor = ortTensor.fromGpuBuffer(slot.buffer, { dataType: statesType, dims: shape });
		slot.tensor.set(key, tensor);
	}
	return { buffer: slot.buffer, tensor };
}

/**
 * Copy back only what a tick reads: for each row it reads, the last `captureLast` places at every depth (each one run
 * of DIM values per depth, since the places are consecutive), and return them as `captured` keeps them.
 */
async function readStates(buffer: GPUBuffer, dims: number[]) {
	const [Bn, S, D] = dims;
	const rows = Math.min(Bn, captureRows);
	const k = Math.min(captureLast, S);
	const w = statesType === 'float16' ? 2 : 4;
	const run = k * D * w;
	const size = rows * DEPTH * run;
	if (!staging || staging.size < size) {
		staging?.destroy();
		staging = device!.createBuffer({
			size,
			usage: USE.MAP_READ | USE.COPY_DST
		});
	}
	const enc = device!.createCommandEncoder();
	for (let b = 0; b < rows; b++)
		for (let l = 0; l < DEPTH; l++)
			enc.copyBufferToBuffer(
				buffer,
				((l * Bn + b) * S + (S - k)) * D * w,
				staging,
				(b * DEPTH + l) * run,
				run
			);
	device!.queue.submit([enc.finish()]);
	await staging.mapAsync(USE.MAP_READ, 0, size);
	const raw = staging.getMappedRange(0, size).slice(0);
	staging.unmap();
	const data = w === 2 ? new Uint16Array(raw) : new Float32Array(raw);
	return Array.from({ length: rows }, (_, b) =>
		Array.from({ length: k }, (_, i) => {
			const out = new Float32Array(DEPTH * D);
			for (let l = 0; l < DEPTH; l++) {
				const off = ((b * DEPTH + l) * k + i) * D;
				for (let j = 0; j < D; j++) out[l * D + j] = w === 2 ? F16[data[off + j]] : data[off + j];
			}
			return out;
		})
	);
}

/**
 * Hook the decoder session: hide `steer` and `lora_gate` from transformers.js (which feeds only the inputs it knows)
 * and feed them here: `steer` zeros except for an armed push (steerNext), `lora_gate` the current gate; keep
 * `hidden_states` while a tick is capturing.
 */
function wrapDecoder(m: Model) {
	const sessions = (m as unknown as { sessions: Record<string, OrtSession> }).sessions;
	const s = sessions?.decoder_model_merged;
	if (!s || !s.inputNames.includes('steer')) return false;
	const gated = s.inputNames.includes('lora_gate');
	// E8's graph looks the text rows up itself from the token ids (16-bit); transformers.js feeds only the embeddings,
	// so the ids are taken from the embedding session's call just before each decoder call and fed here
	const byIds = s.inputNames.includes('input_ids');
	const embed = sessions.embed_tokens;
	if (byIds) {
		if (!embed) return false;
		const runEmbed = embed.run.bind(embed);
		embed.run = async (feeds, opts) => {
			lastIds = feeds.input_ids;
			return runEmbed(feeds, opts);
		};
	}
	const names = s.inputNames.filter(
		(n) => n !== 'steer' && n !== 'lora_gate' && !(byIds && n === 'input_ids')
	);
	const others = s.outputNames.filter((n) => n !== 'hidden_states');
	Object.defineProperty(s, 'inputNames', { value: names, configurable: true });
	const run = s.run.bind(s);
	s.run = async (feeds, opts) => {
		const dims = feeds.inputs_embeds.dims as number[];
		const data = new Float32Array(dims[0] * dims[1] * dims[2]);
		if (steerNext && dims[1] > 1 && steerNext.row < dims[0]) {
			const { row, back, vec } = steerNext;
			data.set(vec, (row * dims[1] + dims[1] - back) * dims[2]);
			steerNext = null;
		}
		const ort = (t: unknown) => (t as { ort_tensor: OrtTensor }).ort_tensor;
		const steer = ort(new tjs!.Tensor('float32', data, dims));
		const keep: Record<string, OrtTensor> = keepLogits
			? { num_logits_to_keep: ort(new tjs!.Tensor('int64', [BigInt(keepLogits)], [])) }
			: {};
		if (byIds) {
			const ids = lastIds;
			if (!ids || ids.dims[0] !== dims[0] || ids.dims[1] !== dims[1])
				throw new Error('the token ids do not match this decoder call');
			keep.input_ids = ids;
		}
		// float16 bits: 0x3c00 is 1, 0 is 0
		if (gated)
			keep.lora_gate = ort(new tjs!.Tensor('float16', new Uint16Array([gate ? 0x3c00 : 0]), [1]));
		// the states of every layer leave the GPU only for a tick that reads them, and then only the places it reads
		const onGpu = capturing && statesVia === 'gpu' ? statesTarget(s, dims) : null;
		const out = onGpu
			? await run(
					{ ...feeds, steer, ...keep },
					{ ...Object.fromEntries(others.map((n) => [n, null])), hidden_states: onGpu.tensor },
					opts
				)
			: capturing
				? await run({ ...feeds, steer, ...keep }, opts)
				: await run({ ...feeds, steer, ...keep }, others, opts);
		ortTensor ??= (out.logits as unknown as { constructor: NonNullable<typeof ortTensor> })
			?.constructor;
		if (onGpu) {
			// the bound output comes back as given; anything else means this runtime did not write into it
			const bound = out.hidden_states === onGpu.tensor;
			delete out.hidden_states;
			if (bound) captured.push(await readStates(onGpu.buffer, dims));
			else statesType = null;
			return out;
		}
		const hs = out.hidden_states;
		if (capturing && hs) {
			const S = hs.dims[2];
			const k = Math.min(captureLast, S);
			captured.push(
				Array.from({ length: Math.min(hs.dims[1], captureRows) }, (_, b) =>
					Array.from({ length: k }, (_, i) => statesAt(hs, b, S - k + i))
				)
			);
		}
		return out;
	};
	return true;
}

/** The program's inside data, beside its graph; null when the program has none. */
async function loadInside(spec: SketchModel, root: string) {
	const get = async (f: string) => {
		const r = await fetch(`${root}${spec.id}/${f}`);
		if (!r.ok) throw new Error(`${f}: ${r.status}`);
		return r;
	};
	const [lj, lb, ij, ib] = await Promise.all([
		get('onnx/lens.json').then((r) => r.json()),
		get('onnx/lens.bin').then((r) => r.arrayBuffer()),
		get('inside.json').then((r) => r.json()),
		get('inside.bin').then((r) => r.arrayBuffer())
	]);
	inside = parseAssets(lj, lb, ij, ib);
	insideMeta = insideMetaOf(ij);
}

/**
 * Arm a push for batch row `row` of the next whole-prompt call: it moves the stream entering the steer layer, at the
 * place that writes the first answer, from the class mean of the true answer to the asked one. An adder tick and a
 * multiply step with a digit of a can be pushed. Returns the code pushed toward, or null when nothing was armed.
 */
function armPush(op: TickOp, cells: string[], push: string | null, row: number) {
	if (!inside || !push) return null;
	const from =
		op === 'ADD-FAST'
			? addCode(addRule(cells))
			: op === 'MUL' && cells[0] !== B
				? reference('MUL', cells)[0]
				: null;
	const vec = from && steerVector(inside, op === 'ADD-FAST' ? 'SUM' : 'MUL', from, push);
	if (!vec) return null;
	const back = !slots() || (op === 'ADD-FAST' && !padSum()) ? 1 : 1 + slots() + padFor(op);
	steerNext = { row, back, vec };
	return push;
}

/** run `fn` with every decoder call's states kept, and read them */
async function withInside<T>(
	op: TickOp,
	cells: string[],
	push: string | null,
	fn: () => Promise<T>,
	want = true
) {
	captured = [];
	capturing = !!inside && want;
	captureRows = 1;
	const slotted = (op !== 'ADD-FAST' || padSum()) && slots();
	captureLast = slotted ? 1 + slots() + padFor(op) : 1;
	rowPads = slotted ? [padFor(op)] : [];
	steerNext = null;
	const pushed = armPush(op, cells, push, 0);
	try {
		const r = await fn();
		const read = inside && captured.length ? analyse(inside, op, tokenStates(0), pushed) : null;
		return { r, inside: read };
	} finally {
		capturing = false;
		captured = [];
		captureRows = Infinity;
		steerNext = null;
	}
}

// ---- the adder: one forward over "ADD<image>=", the last position's logits give the one answer token -------------
async function addForward(cells: string[]) {
	const { strip, image } = stripImage(cells);
	if (padSum()) {
		const { inp } = await slotted('ADD-FAST', image);
		const out = await slottedForward(inp);
		return { row: logitsAt(out.logits, answerAt(out.logits, 'ADD-FAST', 0)), strip };
	}
	const out = await forward(await processor!(promptFor('ADD-FAST'), [image]));
	const S = out.logits.dims[1];
	return { row: logitsAt(out.logits, S - 1), strip };
}

async function addScore(cells: string[]) {
	const want = addCode(addRule(cells));
	const { row } = await addForward(cells);
	const { m, arg } = margin(row, tokenOf(want));
	return { m, got: m > 0 ? null : tok!.decode([arg]) };
}

// ---- the multiplier: "<OP><image>=" then three tokens (glyph, glyph, next-op) ------------------------------------
function extend(t: TTensor, vals: number[]): TTensor {
	const { Tensor } = tjs!;
	const data =
		t.type === 'int64'
			? BigInt64Array.from([...(t.data as Iterable<bigint>), ...vals.map(BigInt)])
			: Float32Array.from([...(t.data as Iterable<number>), ...vals]);
	return new Tensor(t.type as 'int64', data, [1, t.dims[1] + vals.length]) as unknown as TTensor;
}

/** append token ids to a one-row prompt's per-token tensors (attention 1, modality 0 for the new places) */
function appendTokens(inp: Inputs, ids: number[]) {
	const L = (inp.input_ids as TTensor).dims[1];
	for (const k of Object.keys(inp)) {
		const t = inp[k] as TTensor | undefined;
		if (t?.dims?.length === 2 && t.dims[0] === 1 && t.dims[1] === L)
			inp[k] = extend(t, k === 'input_ids' ? ids : ids.map(() => (k === 'attention_mask' ? 1 : 0)));
	}
	return L;
}

/**
 * A multiplier prompt with its placeholder slots and padding (padFor), for the one forward pass that reads all three
 * answers; L is the prompt's own length, so the answers sit at L - 1, L and L + 1.
 */
async function slotted(op: BatchOp, image: unknown) {
	const inp = await processor!(promptFor(op), [image]);
	const L = appendTokens(inp, Array(slots() + padFor(op)).fill(tokenOf('?')));
	return { inp, L };
}

/**
 * One forward of slotted prompts that computes logits only at the last places (`=`, the slots, the longest padding):
 * the output head is a third of the model's work per token. transformers.js's image-text forward drops
 * num_logits_to_keep, so the decoder session's wrapper sets it.
 */
async function slottedForward(inp: Inputs) {
	keepLogits = 1 + slots() + Math.max(...MUL_OPS.map((o) => padFor(o)));
	try {
		return await forward(inp);
	} finally {
		keepLogits = 0;
	}
}

/**
 * One forward of the decoder, for its logits. A forward also returns the decoder's cache (`present…`: the attention
 * layers' keys and values and the DeltaNet layers' conv and recurrent states), on the GPU; nothing here reads it, and
 * a GPU tensor is only freed when it is disposed, so it is let go at once. Kept, they took the GPU process from
 * 3.3 GB to 22 GB in a dozen runs.
 */
async function forward(inp: Inputs) {
	const out = (await model!(inp)) as unknown as Record<
		string,
		TTensor & { location?: string; dispose(): void }
	>;
	for (const [name, t] of Object.entries(out))
		if (name !== 'logits' && t?.location === 'gpu-buffer') t.dispose();
	return { logits: out.logits as TTensor };
}

/** where an op's j-th answer sits in a slotted row's logits, counted from the row's end (kept or not) */
const answerAt = (logits: TTensor, op: BatchOp, j: number) =>
	logits.dims[1] - 1 - slots() - padFor(op) + j;

/**
 * Check one table row: every answer token must be the argmax at its place. Generated programs are scored teacher-
 * forced (the answer appended one token id per character, as in training: tokenising "_-N" jointly would merge
 * pieces); slotted programs read their three answers
 * at `=` and the slots, exactly as a tick does.
 */
/** the characters a slotted step's view is answered with (`_` for the multiplier's blank glyph) */
const answerChars = (op: SlotOp, v: string[]) => (isCalcOp(op) ? calcRef(op, v) : outChars(op, v));

async function mulScore(op: SlotOp, v: string[]) {
	const ans = answerChars(op, v);
	const ids = ans.map(tokenOf);
	const { image } = stripImage(v);
	let inp: Inputs;
	let L: number;
	if (slots()) ({ inp, L } = await slotted(op, image));
	else {
		inp = await processor!(promptFor(op), [image]);
		L = appendTokens(inp, ids);
	}
	const out = slots() ? await slottedForward(inp) : await forward(inp);
	let worst = Infinity;
	let got = '';
	ids.forEach((t, j) => {
		const at = slots() ? answerAt(out.logits, op, j) : L - 1 + j;
		const { m, arg } = margin(logitsAt(out.logits, at), t);
		worst = Math.min(worst, m);
		got += m > 0 ? ans[j] : tok!.decode([arg]);
	});
	return { m: worst, got: worst > 0 ? null : got };
}

/** three answers from one forward of a slotted prompt, for batch row `row` */
function readSlots(logits: TTensor, row: number, op: BatchOp) {
	const K = logits.dims[1];
	return [0, 1, 2].map((j) =>
		tok!.decode([argmax(logitsAt(logits, row * K + answerAt(logits, op, j)))])
	);
}

async function mulTick(op: SlotOp, cells: string[]) {
	const { strip, image } = stripImage(cells);
	if (slots()) {
		const { inp } = await slotted(op, image);
		const ch = readSlots((await slottedForward(inp)).logits, 0, op);
		return { out: [ch[0] === '_' ? B : ch[0], ch[1], ch[2]], strip };
	}
	const inputs = await processor!(promptFor(op), [image]);
	const L = (inputs.input_ids as TTensor).dims[1];
	const out = await model!.generate({ ...inputs, do_sample: false, max_new_tokens: 3 });
	const ids = Array.from(out.data)
		.slice(L)
		.map((x) => Number(x));
	const ch = ids.map((i) => tok!.decode([i]));
	return { out: [ch[0] === '_' ? B : ch[0], ch[1], ch[2]], strip };
}

/**
 * Several multiplier ticks in one batch, one strip and prompt per row. A slotted program reads each row's three answers
 * from one forward pass (padFor gives every step's prompt one length); a generated one takes three greedy tokens, and
 * its rows must share a step word length (the wave batches by it). The rows are independent views; batching only
 * shares the GPU calls.
 */
async function mulBatch(items: { op: BatchOp; cells: string[] }[]) {
	if (items.some((it) => it.op === 'ADD-FAST') && !padSum())
		throw new Error('this program reads an adder step on its own');
	const strips = items.map((it) => stripImage(it.cells));
	// transformers.js's Qwen image processor reads a list of images as the frames of one video, so each row is
	// prepared on its own and the rows are stacked: token rows (equal lengths), patches, and one grid row per image
	const parts = await Promise.all(
		items.map(async (it, b) =>
			slots()
				? (await slotted(it.op, strips[b].image)).inp
				: processor!(promptFor(it.op as TickOp), [strips[b].image])
		)
	);
	const inputs: Inputs = {};
	for (const k of Object.keys(parts[0])) {
		const ts = parts.map((x) => x[k] as TTensor);
		if (!ts[0]?.dims?.length) continue;
		inputs[k] = tjs!.cat(ts as never, 0) as unknown as TTensor;
	}
	const L = (inputs.input_ids as TTensor).dims[1];
	if (parts.some((x) => (x.input_ids as TTensor).dims[1] !== L))
		throw new Error('batched prompts differ in length');
	if (slots()) {
		// one forward: row b's answers sit at `=` and its slots
		const logits = (await slottedForward(inputs)).logits;
		return items.map((_, b) => {
			const ch = readSlots(logits, b, items[b].op);
			// the adder's one answer is its code at `=`
			const out = items[b].op === 'ADD-FAST' ? [ch[0]] : [ch[0] === '_' ? B : ch[0], ch[1], ch[2]];
			return { out, strip: strips[b].strip };
		});
	}
	const out = await model!.generate({ ...inputs, do_sample: false, max_new_tokens: 3 });
	const W = out.dims[1];
	const data = Array.from(out.data, (x) => Number(x));
	return items.map((_, b) => {
		const ch = data.slice(b * W + L, b * W + W).map((i) => tok!.decode([i]));
		return { out: [ch[0] === '_' ? B : ch[0], ch[1], ch[2]], strip: strips[b].strip };
	});
}

async function tickBatch(m: Extract<ToWorker, { type: 'tick-batch' }>) {
	if (replay) return replayBatch(m);
	const r = await exclusive(async () => {
		const items = m.items as { op: BatchOp; cells: string[]; push?: string | null }[];
		const off = items.find((it) => !serves(kindOf(it.op)));
		if (off) throw new Error(`${MODELS[kindOf(off.op)].name} is not loaded`);
		const t = performance.now();
		captured = [];
		capturing = !!inside && m.inside !== false;
		captureRows = m.insideRows ?? Infinity;
		rowPads = slots() ? items.map((it) => padFor(it.op)) : [];
		captureLast = slots() ? 1 + slots() + Math.max(...rowPads) : 1;
		steerNext = null;
		// one push at most: the first row that asks for one
		const p = items.findIndex((it) => it.push);
		const pushed = p < 0 ? null : armPush(items[p].op, items[p].cells, items[p].push!, p);
		try {
			const rows = await mulBatch(items);
			const seen = rows.map((_, b) =>
				inside && captured.length && b < captureRows
					? analyse(inside, items[b].op, tokenStates(b), b === p ? pushed : null)
					: null
			);
			return { rows, seen, ms: performance.now() - t };
		} finally {
			capturing = false;
			captured = [];
			captureRows = Infinity;
			steerNext = null;
		}
	});
	post(
		{
			type: 'tick-batch',
			rid: m.rid,
			outs: r.rows.map((x) => x.out),
			strips: r.rows.map((x) => x.strip),
			inside: r.seen,
			ms: r.ms
		},
		r.rows.map((x) => x.strip.buffer)
	);
}

// ---- jobs -----------------------------------------------------------------------------------------------------
async function setup(m: Extract<ToWorker, { type: 'load' }>) {
	tjs ??= await import('transformers-420');
	const { env } = tjs;
	// a built page serves ONNX Runtime's WASM itself; the dev server keeps the CDN its pre-bundling needs
	if (import.meta.env?.PROD && env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = undefined;
	env.allowLocalModels = false;
	env.allowRemoteModels = true;
	env.useBrowserCache = false;
	env.remoteHost = m.root;
	env.remotePathTemplate = '{model}/';
	env.fetch = routedFetch(m.root);
	// private windows may have no Cache API: then every load downloads, nothing else changes
	const canCache =
		typeof caches !== 'undefined' &&
		(await caches.open(FILE_CACHE).then(
			() => true,
			() => false
		));
	env.useCustomCache = canCache;
	env.customCache = canCache ? fileCache(m.root) : null;
	if (!sprites) await loadSprites(m.sprites);
	gpu ||= await gpuName().catch(() => 'this browser’s GPU');
	return canCache;
}

async function load(m: Extract<ToWorker, { type: 'load' }>) {
	wanted = m.lid;
	await exclusive(async () => {
		if (m.lid !== wanted) return post({ type: 'load-skipped', lid: m.lid });
		const spec = MODELS[m.kind];
		const t0 = performance.now();
		try {
			if (model && loadedId === spec.id)
				return post({ type: 'loaded', lid: m.lid, info: info(spec, m.root, 0, true) });
			if (model) {
				// the old program goes first: its sessions free their GPU memory before the new ones are made
				const old = model;
				model = null;
				processor = null;
				loadedId = null;
				generation++;
				await old.dispose().catch(() => {});
			}
			const canCache = await setup(m);
			if (canCache && !pinned(m.root)) await dropStale(spec, m.root);
			if (canCache && pinned(m.root)) await dropOtherRevisions(m.root);
			const expect = await uncachedBytes(spec, m.root, canCache);
			network = {};
			cachedBytes = 0;
			performance.clearResourceTimings();
			performance.setResourceTimingBufferSize(2000);
			let last = -Infinity;
			onBytes = () => {
				const now = performance.now();
				if (now - last < 120) return;
				last = now;
				post({
					type: 'progress',
					lid: m.lid,
					kind: m.kind,
					network: sum(network),
					expect,
					cached: cachedBytes,
					stage: 'fetch'
				});
			};
			onBytes();
			const [proc, mdl] = await Promise.all([
				tjs!.AutoProcessor.from_pretrained(spec.id),
				tjs!.Qwen3_5ForConditionalGeneration.from_pretrained(spec.id, {
					dtype: DTYPE,
					device: 'webgpu'
				})
			]);
			onBytes = () => {};
			processor = proc as unknown as Processor;
			model = mdl as unknown as Model;
			tok = processor.tokenizer;
			inside = null;
			insideMeta = null;
			if (wrapDecoder(model))
				await loadInside(spec, m.root).catch((e) => {
					inside = null;
					insideMeta = null;
					console.warn('sketchpad: no inside data', e);
				});
			post({
				type: 'progress',
				lid: m.lid,
				kind: m.kind,
				network: sum(network),
				expect,
				cached: cachedBytes,
				stage: 'compile'
			});
			// one forward compiles the GPU kernels before the certificate starts its clock
			await addForward([B, B, B]);
			await watchDevice();
			loadedId = spec.id;
			generation++;
			post({
				type: 'loaded',
				lid: m.lid,
				info: info(spec, m.root, (performance.now() - t0) / 1000, false)
			});
		} catch (e) {
			onBytes = () => {};
			post({ type: 'load-error', lid: m.lid, kind: m.kind, error: message(e) });
		}
	});
}

/**
 * The GPU device ONNX Runtime made for the model (it sets env.webgpu.device when its WebGPU backend starts). A lost
 * device never runs again: the page then replaces this worker, loads the model from the browser's cache into a new
 * session and redoes the step that was in flight (pad.svelte.ts, recover).
 */
let device: GPUDevice | null = null;
let deviceLost = false;
async function watchDevice() {
	// ONNX Runtime sets the device itself, or (in some versions) a promise of it
	const webgpu = (tjs?.env.backends.onnx as { webgpu?: { device?: unknown } } | undefined)?.webgpu;
	const d = (await Promise.resolve(webgpu?.device).catch(() => null)) as GPUDevice | null;
	if (!d || d === device || typeof d.lost?.then !== 'function') return;
	device = d;
	deviceLost = false;
	void d.lost.then((info) => {
		deviceLost = true;
		post({ type: 'device-lost', reason: info.reason ?? 'unknown', message: info.message ?? '' });
	});
}

/** what a call on a lost device fails with in Chrome (measured on the reference device) */
const GPU_GONE = /external Instance reference|device (is |was )?lost|GPUDevice/i;

/**
 * transformers.js logs a failed model run (and its inputs) before it throws. On a lost device that failure is expected
 * and handled (the page reloads the model and redoes the step), so it is noted once, quietly, instead of as an error;
 * any other failure is logged as it was.
 */
const consoleError = console.error.bind(console);
const RUN_FAILED = /An error occurred during model execution|Inputs given to model/;
let quietUntil = 0;
console.error = (...args: unknown[]) => {
	const text = args.map((a) => String(a)).join(' ');
	if (!device || !RUN_FAILED.test(text)) return consoleError(...args);
	void Promise.race([
		device.lost.then(() => true),
		new Promise<boolean>((r) => setTimeout(() => r(deviceLost), 800))
	]).then((gone) => {
		if (!gone) return consoleError(...args);
		if (performance.now() < quietUntil) return;
		quietUntil = performance.now() + 5000;
		console.info(
			'sketchpad: a model run stopped because the GPU was lost; the page reloads the model and redoes it'
		);
	});
};

/**
 * A job failed because the device went: it is lost, or goes within a moment (a failed GPU call can come just before
 * the loss is reported), or the error is the one Chrome gives on a lost device.
 */
const lost = async (e: unknown) =>
	!!device &&
	(deviceLost ||
		GPU_GONE.test(message(e)) ||
		(await Promise.race([
			device.lost.then(() => true),
			new Promise<boolean>((r) => setTimeout(() => r(false), 500))
		])));

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

/** what this load will take from the network: the sizes of the files not in this browser's cache */
async function uncachedBytes(m: SketchModel, root: string, canCache: boolean) {
	const cache = canCache ? await caches.open(FILE_CACHE) : null;
	const sizes = await Promise.all(
		modelFiles().map(async (f) => {
			const url = fileUrl(m, f, root);
			if (cache && (await cache.match(url))) return 0;
			const head = await fetch(url, { method: 'HEAD', cache: 'no-store' }).catch(() => null);
			return Number(head?.headers.get('content-length') ?? 0);
		})
	);
	return sizes.reduce((a, b) => a + b, 0);
}

function info(spec: SketchModel, root: string, seconds: number, reused: boolean): LoadedInfo {
	const files = modelFiles();
	const transferSize = (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
		.filter((e) => e.name.startsWith(root) || e.name.startsWith(baseRootFor(root)))
		.reduce((a, e) => a + e.transferSize, 0);
	return {
		id: spec.id,
		kind: spec.kind,
		seconds,
		prints: Object.fromEntries(
			files.flatMap((f) => {
				const p = prints.get(servedPath(spec, f));
				return p ? [[f, p]] : [];
			})
		),
		sprites: spritesPrint,
		gpu,
		transformers: tjs?.env.version ?? '',
		network: reused ? 0 : sum(network),
		networkFiles: reused ? {} : { ...network },
		transferSize: reused ? 0 : transferSize,
		cached: reused ? 0 : cachedBytes,
		reused,
		inside: insideMeta
	};
}

/** the loaded program serves this kind */
const serves = (k: Kind) => !!model && loadedId === MODELS[k].id;

/** the answer-place logits of slotted rows, from one forward with the rows as one batch (as a wave step runs them) */
async function answerLogits(items: { op: BatchOp; cells: string[]; ids: number[] }[]) {
	const parts = await Promise.all(
		items.map(async (it) => (await slotted(it.op, stripImage(it.cells).image)).inp)
	);
	const inputs: Inputs = {};
	for (const k of Object.keys(parts[0])) {
		const ts = parts.map((x) => x[k] as TTensor);
		if (!ts[0]?.dims?.length) continue;
		inputs[k] = tjs!.cat(ts as never, 0) as unknown as TTensor;
	}
	const L = (inputs.input_ids as TTensor).dims[1];
	if (parts.some((x) => (x.input_ids as TTensor).dims[1] !== L))
		throw new Error('batched prompts differ in length');
	const logits = (await slottedForward(inputs)).logits;
	const K = logits.dims[1];
	return items.map((it, b) =>
		it.ids.map((_, j) => Float32Array.from(logitsAt(logits, b * K + answerAt(logits, it.op, j))))
	);
}

/**
 * Development only (the paper's τ): every table row of the loaded program scored alone and inside a batch of `size`
 * random other rows, as a wave step batches them, with the largest change of any logit and of the row's margin.
 */
async function batchCheck(rid: number, sizes: number[], seed: number) {
	if (!slots() || !padSum()) throw new Error('this program does not batch every table');
	const rows = [
		...ADD_DOMAIN.map((cells) => ({
			op: 'ADD-FAST' as BatchOp,
			cells,
			ans: [addCode(addRule(cells))]
		})),
		...[...MUL_DOMAIN, ...CALC_DOMAIN].map(([op, v]) => ({
			op: op as BatchOp,
			cells: v,
			ans: answerChars(op as SlotOp, v)
		}))
	].map((r) => ({ op: r.op, cells: r.cells, ids: r.ans.map(tokenOf) }));
	let s = seed >>> 0 || 1;
	const rand = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
	const worst = (ls: Float32Array[], ids: number[]) =>
		Math.min(...ids.map((t, j) => margin(ls[j], t).m));
	for (const size of sizes) {
		const t0 = performance.now();
		const order = rows.map((_, i) => i);
		for (let i = order.length - 1; i > 0; i--) {
			const j = Math.floor(rand() * (i + 1));
			[order[i], order[j]] = [order[j], order[i]];
		}
		const r = {
			views: 0,
			maxLogit: 0,
			maxMargin: 0,
			minAlone: Infinity,
			minBatch: Infinity,
			fails: 0,
			seconds: 0
		};
		for (let at = 0; at < order.length; at += size) {
			if (cancelled.has(rid)) throw new Cancelled();
			const items = order.slice(at, at + size).map((i) => rows[i]);
			const together = await exclusive(() => answerLogits(items));
			for (let b = 0; b < items.length; b++) {
				const alone = (await exclusive(() => answerLogits([items[b]])))[0];
				for (let j = 0; j < alone.length; j++)
					for (let v = 0; v < alone[j].length; v++)
						r.maxLogit = Math.max(r.maxLogit, Math.abs(together[b][j][v] - alone[j][v]));
				const mA = worst(alone, items[b].ids);
				const mB = worst(together[b], items[b].ids);
				r.maxMargin = Math.max(r.maxMargin, Math.abs(mB - mA));
				r.minAlone = Math.min(r.minAlone, mA);
				r.minBatch = Math.min(r.minBatch, mB);
				if (mB <= 0) r.fails++;
				r.views++;
			}
			r.seconds = (performance.now() - t0) / 1000;
			post({ type: 'batch-check', rid, size, done: r.views, result: { ...r } });
		}
	}
	post({ type: 'done', rid, ms: 0 });
}

async function certify(rid: number, k: Kind, only?: number[], from = 0) {
	if (!serves(k)) throw new Error(`${MODELS[k].name} is not loaded`);
	const born = generation;
	let compute = 0;
	let start = only ? 0 : from;
	let margins: number[] = [];
	let got: (string | null)[] = [];
	let indices: number[] = [];
	let sent = performance.now();
	const flush = () => {
		post({ type: 'cert-rows', rid, start, margins, got, ...(only ? { indices } : {}) });
		start += margins.length;
		margins = [];
		got = [];
		indices = [];
		sent = performance.now();
	};
	const n = k === 'add' ? ADD_DOMAIN.length : k === 'mul' ? MUL_DOMAIN.length : CALC_DOMAIN.length;
	const order = only ?? Array.from({ length: n - from }, (_, i) => from + i);
	for (let j = 0; j < order.length; j++) {
		const i = order[j];
		if (cancelled.has(rid)) throw new Cancelled();
		const r = await exclusive(async () => {
			// a load got in between: these rows would no longer be about this model
			if (generation !== born || !serves(k)) throw new Cancelled();
			const t = performance.now();
			const res =
				k === 'add'
					? await addScore(ADD_DOMAIN[i])
					: k === 'mul'
						? await mulScore(...MUL_DOMAIN[i])
						: await mulScore(...CALC_DOMAIN[i]);
			compute += performance.now() - t;
			return res;
		});
		margins.push(r.m);
		got.push(r.got);
		indices.push(i);
		if (performance.now() - sent > 60 || j === order.length - 1) flush();
	}
	post({ type: 'cert-done', rid, seconds: compute / 1000 });
}

// ---- replay: a recorded run answered from its recording, without the model ----------------------------------------
/**
 * While a recording plays, every view the page asks is answered with the recorded model's output for that view, after
 * the recorded time (times `speed`), with the strip assembled from the cells as for a live tick and the recorded
 * inside readouts. A view the recording does not have is an error: the page stops the playback.
 */
let replay: {
	calls: RecordedCall[];
	next: number;
	speed: number;
	rounds: RecordedRound[];
	round: number;
} | null = null;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** the sprites a replayed strip is drawn from (the first ticks may come before they are in) */
let replaySprites: Promise<void> = Promise.resolve();

function startReplay(m: Extract<ToWorker, { type: 'replay' }>) {
	if (!m.calls) {
		replay = null;
		return;
	}
	// set at once: the page's first tick may follow this message before the sprites are read
	replay = { calls: m.calls, next: 0, speed: m.speed, rounds: m.rounds ?? [], round: 0 };
	if (!sprites) replaySprites = loadSprites(m.sprites);
}

function recordedCall(items: { op: TickOp; cells: string[] }[], batch: boolean) {
	const r = replay!;
	const same = (c: RecordedCall) =>
		c.batch === batch &&
		c.items.length === items.length &&
		c.items.every(
			(it, i) => it.op === items[i].op && it.cells.join('') === items[i].cells.join('')
		);
	for (let i = r.next; i < r.calls.length; i++)
		if (same(r.calls[i])) {
			r.next = i + 1;
			return r.calls[i];
		}
	throw new Error('the recording has no such view');
}

async function replayTick(m: Extract<ToWorker, { type: 'tick' }>) {
	const c = recordedCall([{ op: m.op, cells: m.cells }], false);
	await pause(c.ms * replay!.speed);
	await replaySprites;
	const strip = assembleStrip(sprites!, m.cells);
	post(
		{
			type: 'tick',
			rid: m.rid,
			out: c.outs[0],
			margin: c.margin,
			ms: c.ms,
			strip,
			inside: expandInside(c.inside[0] ?? null, m.op)
		},
		[strip.buffer]
	);
}

async function replayBatch(m: Extract<ToWorker, { type: 'tick-batch' }>) {
	const c = recordedCall(m.items, true);
	await pause(c.ms * replay!.speed);
	await replaySprites;
	const strips = m.items.map((it) => assembleStrip(sprites!, it.cells));
	post(
		{
			type: 'tick-batch',
			rid: m.rid,
			outs: c.outs,
			strips,
			inside: m.items.map((it, b) => expandInside(c.inside[b] ?? null, it.op)),
			ms: c.ms
		},
		strips.map((s) => s.buffer)
	);
}

/** a recorded reply's next round: its text as it streamed, then its sheet block or its end */
async function replayRound(rid: number) {
	const r = replay!;
	const round = r.rounds[r.round++];
	if (!round) throw new Error('the recording has no more of this reply');
	let at = 0;
	for (const [t, text] of round.deltas) {
		await pause(Math.max(0, t - at) * r.speed);
		at = t;
		post({ type: 'chat-delta', rid, text });
	}
	if (round.block !== null) post({ type: 'chat-block', rid, block: round.block, index: r.round });
	else post({ type: 'done', rid, ms: at });
}

async function tick(m: Extract<ToWorker, { type: 'tick' }>) {
	if (replay) return replayTick(m);
	const r = await exclusive(async () => {
		if (!serves(kindOf(m.op))) throw new Error(`${MODELS[kindOf(m.op)].name} is not loaded`);
		const t = performance.now();
		if (m.op === 'ADD-FAST') {
			const { r: f, inside: seen } = await withInside(
				m.op,
				m.cells,
				m.push,
				() => addForward(m.cells),
				m.inside !== false
			);
			const a = argmax(f.row);
			const { m: mg } = margin(f.row, a);
			const text = tok!.decode([a]);
			return { out: [text], margin: mg, strip: f.strip, ms: performance.now() - t, inside: seen };
		}
		const { r: f, inside: seen } = await withInside(
			m.op,
			m.cells,
			m.push,
			() => mulTick(m.op as SlotOp, m.cells),
			m.inside !== false
		);
		return { out: f.out, margin: null, strip: f.strip, ms: performance.now() - t, inside: seen };
	});
	post(
		{
			type: 'tick',
			rid: m.rid,
			out: r.out,
			margin: r.margin,
			ms: r.ms,
			strip: r.strip,
			inside: r.inside
		},
		[r.strip.buffer]
	);
}

/**
 * A chat reply under way. At gate 1 the model may open its sheet: it writes a ```sheet block (a work order) and
 * closes it; the reply then stops there, the page runs the block on the sheet (every digit by the model, in ticks),
 * and the result lines come back as tokens (`\n` + lines + `\n`) for the reply to go on from: the protocol E8 was
 * trained and evaluated with (the paper, Methods), at most two blocks a reply, rounds of up
 * to `maxNew` tokens, greedy. The token ids are kept here between rounds, so the reply goes on from exactly the tokens
 * it wrote.
 */
let reply: {
	rid: number;
	ids: bigint[];
	/** where the reply's own tokens start */
	start: number;
	blocks: number;
	gate: 0 | 1;
	maxNew: number;
	t0: number;
} | null = null;
const MAX_BLOCKS = 2;
/** the sheet blocks a reply has closed so far, and what each holds */
const closedBlocks = (text: string) =>
	[...text.matchAll(/```sheet[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1].trim());

async function chat(m: Extract<ToWorker, { type: 'chat' }>) {
	if (replay) return replayRound(m.rid);
	await exclusive(async () => {
		if (!model || !processor || !tjs || !tok) throw new Error('no model is loaded');
		const text = processor.apply_chat_template(
			[{ role: 'user', content: [{ type: 'text', text: m.question }] }],
			{ add_generation_prompt: true, tokenizer_kwargs: { enable_thinking: false } }
		);
		const ids = tok.encode(text, { add_special_tokens: false }).map((x) => BigInt(x));
		reply = {
			rid: m.rid,
			ids,
			start: ids.length,
			blocks: 0,
			gate: m.gate,
			maxNew: m.maxNew,
			t0: performance.now()
		};
		await chatRound(m.rid);
	});
}

/** the result lines of the block the reply stopped at: append them and go on */
async function chatContinue(m: Extract<ToWorker, { type: 'chat-continue' }>) {
	if (replay) return replayRound(m.rid);
	await exclusive(async () => {
		if (!reply || reply.rid !== m.rid) throw new Error('no reply is waiting for its sheet');
		const add = tok!.encode(`\n${m.result}\n`, { add_special_tokens: false });
		reply.ids = [...reply.ids, ...add.map((x) => BigInt(x))];
		await chatRound(m.rid);
	});
}

async function chatRound(rid: number) {
	const r = reply!;
	const decode = (ids: (number | bigint)[]) =>
		tok!.decode(ids.slice(r.start).map(Number), { skip_special_tokens: true });
	// stop at the fence that closes a new sheet block (while the reply may still open one)
	class Fence extends tjs!.StoppingCriteria {
		_call(input_ids: (number | bigint)[][]) {
			return input_ids.map(
				(row) => r.blocks < MAX_BLOCKS && closedBlocks(decode(row)).length > r.blocks
			);
		}
	}
	const streamer = new tjs!.TextStreamer(tok as never, {
		skip_prompt: true,
		skip_special_tokens: true,
		callback_function: (s: string) => post({ type: 'chat-delta', rid, text: s })
	});
	const n = r.ids.length;
	const input_ids = new tjs!.Tensor('int64', BigInt64Array.from(r.ids), [1, n]);
	const attention_mask = new tjs!.Tensor('int64', new BigInt64Array(n).fill(1n), [1, n]);
	gate = r.gate;
	let out: TTensor;
	try {
		out = await model!.generate({
			input_ids,
			attention_mask,
			do_sample: false,
			max_new_tokens: r.maxNew,
			// stock Qwen at gate 0 restates itself word for word under plain greedy; blocking repeated 5-grams stops that.
			// E8 (gate 1) is run as it was evaluated, plain greedy: it copies the sheet's result digits, which a 5-gram
			// block would break.
			...(r.gate === 0 ? { no_repeat_ngram_size: 5 } : {}),
			stopping_criteria: [new Fence()],
			streamer
		});
	} finally {
		gate = 1;
	}
	r.ids = Array.from(out.data as ArrayLike<bigint>, (x) => BigInt(x));
	const blocks = closedBlocks(decode(r.ids));
	if (r.blocks < MAX_BLOCKS && blocks.length > r.blocks) {
		r.blocks = blocks.length;
		post({ type: 'chat-block', rid, block: blocks[blocks.length - 1], index: r.blocks });
		return;
	}
	reply = null;
	post({ type: 'done', rid, ms: performance.now() - r.t0 });
}

self.onmessage = async (ev: MessageEvent<ToWorker>) => {
	const m = ev.data;
	if (m.type === 'load') return load(m);
	if (m.type === 'cancel') return void cancelled.add(m.rid);
	if (m.type === 'lose-device') return void device?.destroy();
	if (m.type === 'states-via') return void (statesVia = m.via);
	if (m.type === 'replay') return void startReplay(m);
	try {
		if (m.type === 'certify') await certify(m.rid, m.kind, m.rows, m.from);
		else if (m.type === 'batch-check') await batchCheck(m.rid, m.sizes, m.seed);
		else if (m.type === 'tick') await tick(m);
		else if (m.type === 'tick-batch') await tickBatch(m);
		else if (m.type === 'chat') await chat(m);
		else if (m.type === 'chat-continue') await chatContinue(m);
		else if (m.type === 'chat-stop') {
			const r = reply;
			if (r && r.rid === m.rid) {
				reply = null;
				post({ type: 'done', rid: m.rid, ms: performance.now() - r.t0 });
			}
		}
	} catch (e) {
		// a job that failed because the device went is not a failure: the page redoes it in a new worker
		if (!(e instanceof Cancelled) && (await lost(e))) {
			// the page hears of the loss once (it ignores a worker it has already replaced)
			if (!deviceLost) {
				deviceLost = true;
				post({ type: 'device-lost', reason: 'unknown', message: message(e) });
			}
			return;
		}
		post({ type: 'failed', rid: m.rid, error: message(e), cancelled: e instanceof Cancelled });
	} finally {
		cancelled.delete(m.rid);
	}
};
