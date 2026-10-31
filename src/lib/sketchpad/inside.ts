/**
 * The inside of the model, read on every tick. The program's decoder graph has one extra output, `hidden_states`: the
 * residual stream at every depth (index 0 the input embedding, 1..23 the stream entering layers 1..23, 24 the final
 * normed state lm_head reads), and one extra input, `steer`, added to the stream entering layer 20
 * (research/sketch/patch_onnx_inside.py). From the states at the position that writes each answer token this module
 * computes
 *
 *  - the logit lens: each depth's state through the final RMSNorm and the lm_head rows of the op's answer alphabet,
 *    as probabilities, and the depth from which the final answer stays on top;
 *  - the path: each depth's lens state minus the table's mean at that depth, projected on an orthonormal 3D slice of
 *    the state that separates the table's layer-24 answer classes (research/sketch/inside_assets.py). The table's own
 *    rows at layer 24 are the map's background, so a tick lands among the views it shares an answer with.
 *
 * Pure functions: the worker runs them on device states, the tests on synthetic ones.
 */
import type { InsideMeta, TickOp } from './protocol.ts';

export const DEPTH = 25;
export const DIM = 1024;
/** the map's dimensions */
export const MAP_K = 3;
export type Point = [number, number, number];
/** Qwen3.5-0.8B's full-attention layers (the other 18 are Gated DeltaNet); hidden_states[l + 1] is the stream after layer l */
export const FULL_ATTENTION = [3, 7, 11, 15, 19, 23];

/**
 * The maps a program may have: the adder's, the multiplier's two, and the calculator's three tables (E7 on). FLS and
 * NXT have none (NXT's views share one first answer, FLS has two views).
 */
export type Family = 'SUM' | 'MUL' | 'ADD' | 'SUB' | 'EST' | 'DEC';
export const FAMILIES: Family[] = ['SUM', 'MUL', 'ADD', 'SUB', 'EST', 'DEC'];
export const familyOf = (op: TickOp): Family | null =>
	op === 'ADD-FAST'
		? 'SUM'
		: op === 'MUL'
			? 'MUL'
			: op === 'ADD' || op === 'ADZ'
				? 'ADD'
				: op === 'SUB' || op === 'EST' || op === 'DEC'
					? op
					: null;

/** The adder's one answer token, in value order: column sums 0..9 (no carry), 10..19 (carry), halt. */
export const SUM_CODES = '0123456789abcdefghijH';
export const sumValue = (code: string) => {
	const i = SUM_CODES.indexOf(code);
	return i < 0 ? null : i === 20 ? 'halt' : String(i);
};

export interface LensGroup {
	/** what this token is, for the reader */
	name: string;
	/** the answer token it reads (0, 1, 2) */
	token: number;
	alphabet: string;
}

/** The answer tokens worth reading for each op, and the alphabet each is read over (one-character alphabets skipped). */
export function lensGroups(op: TickOp): LensGroup[] {
	const next: LensGroup = { name: 'next step', token: 2, alphabet: 'MAZFNH' };
	if (op === 'ADD-FAST') return [{ name: 'column sum', token: 0, alphabet: SUM_CODES }];
	if (op === 'MUL' || op === 'ADD' || op === 'ADZ')
		return [
			{ name: 'writes', token: 0, alphabet: '0123456789' },
			{ name: 'carries', token: 1, alphabet: '0123456789' },
			next
		];
	if (op === 'FLS') return [{ name: 'writes', token: 0, alphabet: '_0123456789' }, next];
	if (op === 'SUB')
		return [
			{ name: 'writes', token: 0, alphabet: '0123456789' },
			{ name: 'borrows', token: 1, alphabet: '01' },
			{ name: 'next step', token: 2, alphabet: 'SHB' }
		];
	if (op === 'EST')
		return [
			{ name: 'guesses', token: 0, alphabet: '0123456789' },
			{ name: 'next step', token: 2, alphabet: 'MN' }
		];
	if (op === 'DEC') return [{ name: 'writes', token: 0, alphabet: '012345678' }];
	return [next];
}

export interface LensRead {
	group: LensGroup;
	/** DEPTH x alphabet, row-major, probabilities over the alphabet at each depth */
	probs: Float32Array;
	/** the alphabet index on top at the last depth */
	top: number;
	/** the first depth from which `top` stays on top to the end */
	decided: number;
}

export interface InsideTick {
	lens: LensRead[];
	family: Family | null;
	/** DEPTH x MAP_K: the first answer token's state at each depth, on the map */
	path: Float32Array | null;
	/** the answer code the stream entering layer 20 was pushed toward on this tick */
	pushed: string | null;
}

export interface FamilyMap {
	ops: string[];
	/** the table's rows at layer 24 on the map, with their first answer token and their view */
	cloud: Point[];
	cloudLabels: string[];
	cloudViews: string[];
	/** where each answer's class mean sits at layer 24 */
	labels: Record<string, Point>;
	/** mean distance from the centre at each depth */
	radius: number[];
	/** share of the table's views whose nearest class mean on the map is their own answer */
	separation: number;
	basis: Float32Array;
	centre: Float32Array;
}

export interface InsideAssets {
	eps: number;
	normWeight: Float32Array;
	/** lm_head row of each character in `chars` */
	rows: Map<string, Float32Array>;
	/** the maps this program has (a program before E7 has SUM, MUL and ADD only) */
	families: Partial<Record<Family, FamilyMap>>;
	steerLayer: number;
	/** class means of the stream entering `steerLayer`, by first answer code, for the families a visitor can push */
	steer: Partial<Record<Family, Map<string, Float32Array>>>;
}

/** Parse the program's lens.json/lens.bin and inside.json/inside.bin. */
export function parseAssets(
	lensJson: { chars: string; eps: number; dim: number },
	lensBin: ArrayBuffer,
	insideJson: {
		steerLayer: number;
		/** the codes of each pushable family's class means (an older program: the adder's, as a string) */
		steerCodes: string | Partial<Record<Family, string>>;
		families: Partial<Record<Family, Omit<FamilyMap, 'basis' | 'centre'>>>;
		layout: Record<string, { offset: number; shape: number[] }>;
	},
	insideBin: ArrayBuffer
): InsideAssets {
	const lens = new Float32Array(lensBin);
	const D = lensJson.dim;
	const rows = new Map<string, Float32Array>();
	[...lensJson.chars].forEach((c, i) => rows.set(c, lens.subarray(D * (1 + i), D * (2 + i))));
	const bin = new Float32Array(insideBin);
	const arr = (name: string) => {
		const l = insideJson.layout[name];
		if (!l) throw new Error(`inside.bin has no ${name}`);
		return bin.subarray(l.offset, l.offset + l.shape.reduce((a, b) => a * b, 1));
	};
	const families: InsideAssets['families'] = {};
	for (const f of FAMILIES) {
		const m = insideJson.families[f];
		if (m) families[f] = { ...m, basis: arr(`${f}.basis`), centre: arr(`${f}.centre`) };
	}
	const steer: InsideAssets['steer'] = {};
	for (const [f, codes] of Object.entries(steerCodes(insideJson.steerCodes))) {
		const means = arr(`${f}.steer`);
		steer[f as Family] = new Map([...codes].map((c, i) => [c, means.subarray(i * D, (i + 1) * D)]));
	}
	return {
		eps: lensJson.eps,
		normWeight: lens.subarray(0, D),
		rows,
		families,
		steerLayer: insideJson.steerLayer,
		steer
	};
}

/** Each depth's state as the final norm would hand it to lm_head (depth 24 already is). `h` is DEPTH x DIM. */
export function lensStates(a: InsideAssets, h: Float32Array): Float32Array {
	const out = new Float32Array(DEPTH * DIM);
	for (let l = 0; l < DEPTH; l++) {
		const x = h.subarray(l * DIM, (l + 1) * DIM);
		const y = out.subarray(l * DIM, (l + 1) * DIM);
		if (l === DEPTH - 1) {
			y.set(x);
			continue;
		}
		let ss = 0;
		for (let i = 0; i < DIM; i++) ss += x[i] * x[i];
		const r = 1 / Math.sqrt(ss / DIM + a.eps);
		for (let i = 0; i < DIM; i++) y[i] = x[i] * r * a.normWeight[i];
	}
	return out;
}

export function readLens(a: InsideAssets, n: Float32Array, group: LensGroup): LensRead {
	const K = group.alphabet.length;
	const W = [...group.alphabet].map((c) => {
		const r = a.rows.get(c);
		if (!r) throw new Error(`no lm_head row for ${c}`);
		return r;
	});
	const probs = new Float32Array(DEPTH * K);
	const tops = new Int32Array(DEPTH);
	for (let l = 0; l < DEPTH; l++) {
		const x = n.subarray(l * DIM, (l + 1) * DIM);
		let max = -Infinity;
		const z = new Float64Array(K);
		for (let k = 0; k < K; k++) {
			let s = 0;
			const w = W[k];
			for (let i = 0; i < DIM; i++) s += x[i] * w[i];
			z[k] = s;
			if (s > max) {
				max = s;
				tops[l] = k;
			}
		}
		let sum = 0;
		for (let k = 0; k < K; k++) sum += z[k] = Math.exp(z[k] - max);
		for (let k = 0; k < K; k++) probs[l * K + k] = z[k] / sum;
	}
	const top = tops[DEPTH - 1];
	let decided = DEPTH - 1;
	while (decided > 0 && tops[decided - 1] === top) decided--;
	return { group, probs, top, decided };
}

/** The first answer token's state at every depth, on the family's map. */
export function project(m: FamilyMap, n: Float32Array): Float32Array {
	const p = new Float32Array(DEPTH * MAP_K);
	for (let l = 0; l < DEPTH; l++) {
		const off = l * DIM;
		for (let k = 0; k < MAP_K; k++) {
			let s = 0;
			for (let i = 0; i < DIM; i++) s += (n[off + i] - m.centre[off + i]) * m.basis[k * DIM + i];
			p[l * MAP_K + k] = s;
		}
	}
	return p;
}

/** Read one tick: `states[t]` is DEPTH x DIM at the position that writes answer token t (missing tokens skipped). */
export function analyse(
	a: InsideAssets,
	op: TickOp,
	states: (Float32Array | undefined)[],
	pushed: string | null
): InsideTick {
	const normed = states.map((h) => (h ? lensStates(a, h) : undefined));
	// a group whose characters the lens data has no lm_head rows for is not drawn
	const lens = lensGroups(op).flatMap((g) => {
		const n = normed[g.token];
		return n && [...g.alphabet].every((c) => a.rows.has(c)) ? [readLens(a, n, g)] : [];
	});
	const m = familyOf(op);
	const family = m && a.families[m] ? m : null;
	const path = family && normed[0] ? project(a.families[family]!, normed[0]) : null;
	return { lens, family, path, pushed };
}

/** inside.json's pushable families and their codes, from either form */
export const steerCodes = (c: string | Partial<Record<Family, string>>) =>
	typeof c === 'string' ? { SUM: c } : c;

/**
 * What the panels draw from inside.json: each family's map (the table's views at the last layer) and what can be
 * pushed. The worker reads it with the model; the page reads the same pinned file before a load, so a recording's
 * inside readouts are drawn on the maps they were made against.
 */
export function insideMetaOf(ij: {
	steerLayer: number;
	steerCodes: string | Partial<Record<Family, string>>;
	families: Partial<Record<Family, NonNullable<InsideMeta['families']['SUM']>>>;
}): InsideMeta {
	return {
		steerLayer: ij.steerLayer,
		steerCodes: steerCodes(ij.steerCodes),
		families: Object.fromEntries(
			Object.entries(ij.families).map(([k, f]) => [
				k,
				{
					cloud: f!.cloud,
					cloudLabels: f!.cloudLabels,
					cloudViews: f!.cloudViews,
					labels: f!.labels,
					radius: f!.radius,
					separation: f!.separation
				}
			])
		) as InsideMeta['families']
	};
}

/** The push that moves a family's stream entering the steer layer from one answer's class mean to another's. */
export function steerVector(
	a: InsideAssets,
	family: Family,
	from: string,
	to: string
): Float32Array | null {
	const f = a.steer[family]?.get(from);
	const t = a.steer[family]?.get(to);
	if (!f || !t || from === to) return null;
	const v = new Float32Array(DIM);
	for (let i = 0; i < DIM; i++) v[i] = t[i] - f[i];
	return v;
}
