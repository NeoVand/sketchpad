/**
 * The sheets in the figures, from the runtime itself: node runs src/lib/sketchpad/*.ts (type stripping, no build) with
 * the reference tables as the policy, and writes paper/figures/data/sheets.json:
 *
 * - every sheet's layout as the page draws it (SheetSource: rows, labels, sprite rows, rules, scratch rows, glyphs, who
 *   wrote each glyph, the fovea);
 * - every view as the model receives it: assembleStrip() from sprites.ts on static/sketchpad/sprites.png, the 32 x 96
 *   grey strip the worker sends to the vision tower (black on white, the training pixels).
 *
 *     node paper/figures/sheets.ts
 *
 * The figure scripts draw sheet glyphs with the same rule as sheet-view.ts (each sprite pixel is the ink colour at
 * alpha 255 - grey, nearest-neighbour), so a figure's sheet is the page's sheet and a figure's strip is the model's input.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ADD_DOMAIN, AddSheet, add, addRule } from '../../src/lib/sketchpad/adder.ts';
import { MulSheet, reference, type Op } from '../../src/lib/sketchpad/multiplier.ts';
import { assembleStrip, B, type SpriteSheet } from '../../src/lib/sketchpad/sprites.ts';
import { mulSource, gridSource, type SheetSource } from '../../src/lib/sketchpad/sources.ts';
import {
	Grid,
	Mux,
	Run,
	divide,
	mulMagnitudes,
	referenceAnswer,
	referencePolicy,
	squareRoot,
	subMagnitudes,
	type View
} from '../../src/lib/sketchpad/calc-sheet.ts';
import type { TickOp } from '../../src/lib/sketchpad/protocol.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');

/** static/sketchpad/sprites.png (8-bit RGB or RGBA, not interlaced) decoded with zlib: the sheet the worker reads */
function readPng(path: string): SpriteSheet {
	const buf = readFileSync(path);
	let p = 8;
	let width = 0;
	let height = 0;
	let channels = 0;
	const idat: Buffer[] = [];
	while (p < buf.length) {
		const len = buf.readUInt32BE(p);
		const type = buf.toString('latin1', p + 4, p + 8);
		const body = buf.subarray(p + 8, p + 8 + len);
		if (type === 'IHDR') {
			width = body.readUInt32BE(0);
			height = body.readUInt32BE(4);
			const [depth, color, , , interlace] = [body[8], body[9], body[10], body[11], body[12]];
			if (depth !== 8 || interlace !== 0 || (color !== 2 && color !== 6 && color !== 0))
				throw new Error('unexpected PNG format');
			channels = color === 2 ? 3 : color === 6 ? 4 : 1;
		} else if (type === 'IDAT') idat.push(body);
		p += 12 + len;
	}
	const raw = inflateSync(Buffer.concat(idat));
	const stride = width * channels;
	const px = new Uint8Array(height * stride);
	for (let y = 0; y < height; y++) {
		const f = raw[y * (stride + 1)];
		const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
		for (let i = 0; i < stride; i++) {
			const a = i >= channels ? px[y * stride + i - channels] : 0;
			const b = y > 0 ? px[(y - 1) * stride + i] : 0;
			const c = i >= channels && y > 0 ? px[(y - 1) * stride + i - channels] : 0;
			let v = line[i];
			if (f === 1) v += a;
			else if (f === 2) v += b;
			else if (f === 3) v += (a + b) >> 1;
			else if (f === 4) {
				const pp = a + b - c;
				const pa = Math.abs(pp - a);
				const pb = Math.abs(pp - b);
				const pc = Math.abs(pp - c);
				v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
			}
			px[y * stride + i] = v & 255;
		}
	}
	const data = new Uint8ClampedArray(width * height * 4);
	for (let i = 0; i < width * height; i++) {
		const g = channels === 1 ? [px[i], px[i], px[i]] : [px[i * channels], px[i * channels + 1], px[i * channels + 2]];
		data.set([...g, channels === 4 ? px[i * 4 + 3] : 255], i * 4);
	}
	return { width, height, data };
}

const SPRITES = readPng(resolve(ROOT, 'static/sketchpad/sprites.png'));

/** the strip the model reads for three cells, as rows of grey levels (R of RGBA; the sprites are pure grey) */
function strip(cells: readonly string[]): number[][] {
	const rgba = assembleStrip(SPRITES, cells);
	const rows: number[][] = [];
	for (let y = 0; y < 96; y++) {
		const row: number[] = [];
		for (let x = 0; x < 32; x++) row.push(rgba[(y * 32 + x) * 4]);
		rows.push(row);
	}
	return rows;
}

/** a sheet as the page draws it */
function snapshot(src: SheetSource) {
	const glyphs: string[][] = [];
	const wrote: number[][] = [];
	for (let r = 0; r < src.rows.length; r++) {
		glyphs.push([]);
		wrote.push([]);
		for (let c = 0; c < src.cols; c++) {
			const g = src.glyph(r, c);
			glyphs[r].push(g);
			wrote[r].push(g !== B && src.mine ? (src.mine(r, c) ? 1 : 0) : 0);
		}
	}
	return {
		rows: src.rows.map((r) => ({ label: r.label, sprite: r.sprite, rule: r.ruleBefore, dim: !!r.dim })),
		cols: src.cols,
		glyphs,
		wrote,
		fovea: src.fovea().map((c) => (c ? { r: c.r, c: c.c } : null)),
		points: src.points?.() ?? []
	};
}

const out: Record<string, unknown> = {};

// ---- figure 1a/b: a long multiplication, one eye (MulSheet), stopped just before a tick ---------------------------
{
	const [A, Bn] = ['74829', '6153'];
	const s = new MulSheet(A, Bn);
	const operand = (r: string, x: number) =>
		(r === 'a' && x < A.length) || (r === 'b' && x < Bn.length);
	const STOP = 32; // ticks before the snapshot: a MUL tick of the third pass, with digits of the product written
	const ops: string[] = [];
	while (!s.done) {
		if (s.ticks === STOP) break;
		ops.push(s.op);
		s.apply(reference(s.op as Op, s.view()));
	}
	const src = mulSource(s);
	const snap = snapshot(src);
	// the multiplier's sheet has no mine(): everything that is not an operand was written by the model
	const ORDER = ['a', 'b', 'cM', 'cA', 'p', 'R'];
	snap.wrote = snap.glyphs.map((row, r) =>
		row.map((g, c) => (g !== B && !operand(ORDER[r], s.W - 1 - c) ? 1 : 0))
	);
	const view = s.view();
	const answer = reference(s.op as Op, view);
	// where the tick stamps its glyphs (MUL: product digit at x, carry at x + 1)
	const at = (row: string, x: number) => ({ r: ORDER.indexOf(row), c: s.W - 1 - x });
	const stamps =
		s.op === 'MUL'
			? [at('p', s.x), at('cM', s.x + 1)]
			: s.op === 'ADD' || s.op === 'ADZ'
				? [at('R', s.x), at('cA', s.x + 1)]
				: [];
	// the whole run, for the tick count
	const full = new MulSheet(A, Bn);
	while (!full.done) full.apply(reference(full.op as Op, full.view()));
	out.mul = {
		a: A,
		b: Bn,
		product: full.result(),
		expected: full.expected(),
		ticks_total: full.ticks,
		tick: s.ticks,
		op: s.op,
		pass: s.j,
		view,
		answer,
		stamps,
		strip: strip(view),
		ops_before: ops,
		sheet: snap
	};
}

// ---- figure 2a: one real view of each of the five tables, and its answer -------------------------------------------
{
	const pick: [TickOp, string[], string][] = [
		['ADD-FAST', ['1', '7', '8'], 'add'],
		['MUL', ['7', '6', '4'], 'multiply'],
		['SUB', ['1', '3', '8'], 'subtract'],
		['EST', ['4', '7', '6'], 'estimate a quotient digit'],
		['DEC', ['7', B, B], 'lower the guess']
	];
	out.tables = pick.map(([op, cells, name]) => ({
		op,
		name,
		cells,
		answer: referenceAnswer(op, cells),
		strip: strip(cells)
	}));
}

// ---- figure 2b: Knuth's Algorithm D and the digit-by-digit root, every call's ops ----------------------------------
async function trace(fn: (run: Run) => Promise<unknown>, title: string, snaps = false) {
	const calls: {
		ops: string[];
		cells: string[][];
		outs: string[][];
		phase: string | null;
		snap?: ReturnType<typeof snapshot>;
	}[] = [];
	const sheets: { title: string; snap: ReturnType<typeof snapshot> }[] = [];
	const run = new Run(referencePolicy);
	run.onViews = (views, outs) => {
		const g = run.sheet instanceof Grid ? run.sheet : null;
		calls.push({
			ops: views.map((v) => v.op),
			cells: views.map((v) => [...v.cells]),
			outs: outs.map((o) => [...o]),
			phase: g?.phase ?? null,
			// the sheet as the model reads it in this call (its answers not yet written)
			snap: g && snaps ? snapshot(gridSource(g)) : undefined
		});
	};
	let last: Grid | null = null;
	run.onShow = (s) => {
		if (last) sheets.push({ title: last.title, snap: snapshot(gridSource(last)) });
		last = s instanceof Grid ? s : null;
	};
	const result = await fn(run);
	if (last) sheets.push({ title: (last as Grid).title, snap: snapshot(gridSource(last as Grid)) });
	return { title, result, calls, sheets, steps: run.steps, views: run.ticks, seconds: run.seconds };
}

// a division whose first guess is too high (a DEC and an add-back), with a scale factor
let divCase: { a: string; b: string } | null = null;
for (const [a, b] of [
	['4100', '59'],
	['70000', '149'],
	['31415', '271'],
	['9000', '199']
]) {
	const t = await trace((run) => divide(run, a, b), `${a} ÷ ${b}`, true);
	const ops = new Set(t.calls.flatMap((c) => c.ops));
	if (ops.has('DEC') && ops.has('EST')) {
		divCase = { a, b };
		out.div = { a, b, ...t };
		break;
	}
}
if (!divCase) {
	// search a small range for a case that lowers a guess
	search: for (let b = 13; b < 400; b++)
		for (let a = 1000; a < 9999; a += 97) {
			const t = await trace((run) => divide(run, String(a), String(b)), `${a} ÷ ${b}`);
			const ops = new Set(t.calls.flatMap((c) => c.ops));
			if (ops.has('DEC') && t.calls.length < 40) {
				out.div = { a: String(a), b: String(b), ...t };
				break search;
			}
		}
}
out.sqrt = { a: '2000000', ...(await trace((run) => squareRoot(run, '2000000'), '√2000000')) };

// ---- figure 2c: a wave of independent jobs sharing forward passes --------------------------------------------------
{
	const jobs: [string, (run: Run) => Promise<unknown>][] = [
		['8051 ÷ 97', (run) => divide(run, '8051', '97')],
		['√ 52441', (run) => squareRoot(run, '52441')],
		['4813 × 276', (run) => mulMagnitudes(run, '4813', '276')],
		['90210 − 31337', (run) => subMagnitudes(run, '90210', '31337')]
	];
	// alone: each job on its own
	const alone = [];
	for (const [name, fn] of jobs) {
		const run = new Run(referencePolicy);
		await fn(run);
		alone.push({ name, calls: run.steps, views: run.ticks, seconds: run.seconds });
	}
	// together: one multiplexer, every view tagged with its job (SheetCalc.lane, with a tag)
	const calls: { job: number; op: string }[][] = [];
	const mux = new Mux((views: View[]) => {
		calls.push(views.map((v) => ({ job: (v as View & { job: number }).job, op: v.op })));
		return referencePolicy(views);
	});
	await Promise.all(
		jobs.map(async ([, fn], j) => {
			const run = new Run((views) => {
				views.forEach((v) => ((v as View & { job: number }).job = j));
				return mux.request(views);
			});
			mux.enter();
			try {
				await fn(run);
			} finally {
				mux.leave();
			}
		})
	);
	out.wave = {
		jobs: jobs.map(([n]) => n),
		alone,
		calls,
		together: { calls: mux.calls, views: mux.views, seconds: mux.seconds }
	};
}

// ---- figure 3a: sums of growing length, every tick's view as its row of the add table (ADD_DOMAIN order) ---------
{
	const index = new Map(ADD_DOMAIN.map((v, i) => [v.join(''), i]));
	// a fixed, seeded stream of digits (mulberry32), so the figure is the same on every run
	let seed = 20261031;
	const rand = () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const digits = (n: number) =>
		String(1 + Math.floor(rand() * 9)) +
		Array.from({ length: n - 1 }, () => String(Math.floor(rand() * 10))).join('');
	const runs = [];
	for (const n of [4, 8, 16, 32, 64, 128, 256, 512, 1024]) {
		const [a, b] = [digits(n), digits(n)];
		const s = await add(a, b, addRule);
		if (s.result() !== s.expected()) throw new Error('reference adder disagrees');
		// replay to collect the views in order
		const views: number[] = [];
		const t = new AddSheet(a, b);
		do views.push(index.get(t.view().join('')) ?? -1);
		while (t.apply(addRule(t.view())));
		if (views.includes(-1)) throw new Error('a view outside the table');
		runs.push({ digits: n, ticks: views.length, views });
	}
	out.addRuns = { table: ADD_DOMAIN.length, runs };
}

writeFileSync(resolve(HERE, 'data/sheets.json'), JSON.stringify(out));
const d = out.div as { a: string; b: string; calls: unknown[]; result: unknown };
const w = out.wave as { together: { calls: number }; alone: { calls: number }[] };
console.log(
	'mul',
	(out.mul as { product: string; expected: string }).product,
	'div',
	d.a,
	d.b,
	d.calls.length,
	JSON.stringify(d.result),
	'wave',
	w.together.calls,
	w.alone.map((a) => a.calls)
);
