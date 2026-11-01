/**
 * The film's data, from the repository's own records; nothing in it is typed in by hand.
 *
 *     node video/film/build-data.ts        (from the repository root; writes video/film/data/film.json)
 *
 * - silent: the comparison's problem 71 (paper/baselines/results.json): the two 300-digit operands, GPT-6.1 Sol's
 *   answer and the true sum, and where they differ.
 * - mul: the recorded multiplication of the demo (static/recordings/machine.json, 4,821 × 3,967 on the published
 *   model), replayed one view at a time through the page's own runtime (MulSheet, mulSource): every answer is the
 *   recorded model output for that view; the runtime only paints and moves, as on the page.
 * - cert: the M4 certificate's 2,446 margins (paper/figures/data/certificate_e7.json), laid out as Fig. 1b lays them
 *   (the block reshapes are those of paper/figures/fig1_v2.py).
 * - bars: exact answers per system on the 220 registered problems (results.json), checked against the paper.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MulSheet, type MulOut, type Op } from '../../src/lib/sketchpad/multiplier.ts';
import { mulSource } from '../../src/lib/sketchpad/sources.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const json = (p: string) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'));
const check = (ok: boolean, what: string) => {
	if (!ok) throw new Error(`check failed: ${what}`);
};

// ---- problem 71 --------------------------------------------------------------------------------------------------
type Row = {
	system: string;
	id: number;
	family: string;
	n: number;
	a: string;
	b: string;
	truth: string;
	answer: string;
	exact: boolean;
	tokens: number | null;
	hit_cap: boolean;
};
const results: Row[] = json('paper/baselines/results.json');
const p71 = results.find((r) => r.system === 'gpt high' && r.id === 71)!;
check(!!p71 && !p71.exact && !p71.hit_cap, 'problem 71: a completed wrong answer');
check(p71.answer.length === p71.truth.length, 'same length');
const diffs: number[] = [];
for (let i = 1; i <= p71.truth.length; i++)
	if (p71.answer[p71.answer.length - i] !== p71.truth[p71.truth.length - i]) diffs.push(i);
check(diffs.length === 1, 'exactly one wrong digit');
check((BigInt(p71.a) + BigInt(p71.b)).toString() === p71.truth, 'the truth is a + b');
const silent = {
	a: p71.a,
	b: p71.b,
	answer: p71.answer,
	truth: p71.truth,
	wrongFromRight: diffs[0],
	tokens: p71.tokens,
	budget: 32768,
	n: p71.n
};

// ---- comparison bars ---------------------------------------------------------------------------------------------
const NAMES: [string, string, string][] = [
	['sketchpad', 'Sketchpad', 'Qwen3.5-0.8B on the sheet'],
	['gpt high', 'GPT-6.1 Sol', 'high reasoning'],
	['claude high', 'Claude Opus 5.5', 'high reasoning'],
	['gemini high', 'Gemini 4 Argon', 'high reasoning'],
	['ollama/deepseek-v4-pro:0813 high', 'DeepSeek-V4-Pro', 'high reasoning'],
	['ollama/mistral-large-4 high', 'Mistral-Large-4', 'high reasoning'],
	['ollama/gemma4:31b high', 'Gemma 4 31B', 'high reasoning'],
	['ollama/glm-5.3 high', 'GLM-5.3', 'high reasoning'],
	['ollama/gpt-oss:120b high', 'gpt-oss-120b', 'high reasoning'],
	['27b thinking', 'Qwen3.5-27B', 'thinking'],
	['0.8b nothink', 'Qwen3.5-0.8B', 'no thinking']
];
const bars = NAMES.map(([sys, name, note]) => {
	const rows = results.filter((r) => r.system === sys);
	check(rows.length === 220, `${sys}: 220 problems`);
	return { name, note, exact: rows.filter((r) => r.exact).length };
});
const want = [220, 217, 216, 207, 199, 168, 156, 152, 149, 121, 23];
check(
	bars.every((b, i) => b.exact === want[i]),
	`bars match the paper: ${bars.map((b) => b.exact)}`
);

// ---- the recorded multiplication, one view at a time -------------------------------------------------------------
const rec = json('static/recordings/machine.json');
check(rec.input.op === 'mul', 'the machine recording is a multiplication');
const answers = new Map<string, string[]>();
for (const call of rec.calls)
	call.items.forEach((it: { op: string; cells: string[] }, k: number) => {
		const key = `${it.op}|${it.cells.join('')}`;
		const out = call.outs[k];
		const had = answers.get(key);
		check(!had || had.join('') === out.join(''), `one answer per view (${key})`);
		answers.set(key, out);
	});
const s = new MulSheet(rec.input.a, rec.input.b);
const ORDER = ['a', 'b', 'cM', 'cA', 'p', 'R'];
const snap = () => {
	const src = mulSource(s);
	const glyphs: string[][] = [];
	for (let r = 0; r < src.rows.length; r++) {
		glyphs.push([]);
		for (let c = 0; c < src.cols; c++) glyphs[r].push(src.glyph(r, c));
	}
	return glyphs;
};
const ticks: unknown[] = [];
let fromRecording = 0;
while (!s.done) {
	const view = s.view();
	const key = `${s.op}|${view.join('')}`;
	const out = answers.get(key);
	check(!!out, `the recording answers ${key}`);
	fromRecording++;
	const fovea = mulSource(s)
		.fovea()
		.map((c) => (c ? { r: c.r, c: c.c } : null));
	const before = snap();
	const op = s.op as Op;
	const x = s.x;
	s.apply(out as unknown as MulOut);
	const after = snap();
	// the cells this tick changed, so the film can stamp them
	const changed: { r: number; c: number; g: string }[] = [];
	for (let r = 0; r < after.length; r++)
		for (let c = 0; c < after[r].length; c++)
			if (after[r][c] !== before[r][c]) changed.push({ r, c, g: after[r][c] });
	ticks.push({ op, x, view, out, fovea, changed, before });
}
check(s.result() === s.expected(), 'the recorded answers give the exact product');
const mul = {
	a: rec.input.a,
	b: rec.input.b,
	product: s.result(),
	rows: mulSource(s).rows.map((r) => ({
		label: r.label,
		rule: r.ruleBefore,
		dim: !!r.dim,
		sprite: r.sprite
	})),
	order: ORDER,
	cols: s.W,
	ticks,
	final: snap(),
	provenance: rec.provenance,
	recordedViews: rec.result.views,
	recordedSteps: rec.result.steps
};
check(
	fromRecording === rec.result.views,
	`every view of the single-eye run is a recorded view (${fromRecording})`
);

// ---- the certificate, as Fig. 1b lays it out ---------------------------------------------------------------------
const cert = json('paper/figures/data/certificate_e7.json');
const add: number[] = cert.kinds.add.margins;
const mulM: number[] = cert.kinds.mul.margins;
const calc: number[] = cert.kinds.calc.margins;
check(add.length + mulM.length + calc.length === 2446, '2,446 margins');
const G = 11;
const grid = (rows: number, cols: number, at: (r: number, c: number) => number) =>
	Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => at(r, c)));
// numpy: m.reshape(2, G, G).transpose(2, 0, 1).reshape(G, 2G)  ->  [b][c*G + t] = m[c*G*G + t*G + b]
const sumLike = (m: number[]) =>
	grid(G, 2 * G, (r, col) => m[Math.floor(col / G) * G * G + (col % G) * G + r]);
// m.reshape(G, 10, 10).transpose(2, 0, 1).reshape(10, 110)  ->  [k][i*10 + j] = m[i*100 + j*10 + k]
const mulBlock = grid(10, 110, (r, col) => mulM[Math.floor(col / 10) * 100 + (col % 10) * 10 + r]);
// m.reshape(2, 10, G).transpose(2, 0, 1).reshape(G, 20)  ->  [k][i*10 + j] = m[i*110 + j*G + k]
const addLike = (m: number[]) =>
	grid(G, 20, (r, col) => m[Math.floor(col / 10) * 110 + (col % 10) * G + r]);
const est = calc.slice(242, 642);
const estCols: number[][] = [];
let off = 0;
for (let dd = 5; dd <= 9; dd++) {
	const seg = est.slice(off, off + (dd + 1) * 10);
	off += (dd + 1) * 10;
	for (let q = 0; q <= dd; q++) estCols.push(Array.from({ length: 10 }, (_, r) => seg[q * 10 + r]));
}
const estBlock = grid(10, estCols.length, (r, c) => estCols[c][r]);
const blocks = {
	MUL: mulBlock,
	SUM: sumLike(add),
	ADD: addLike(mulM.slice(1100, 1320)),
	ADZ: addLike(mulM.slice(1320, 1540)),
	SUB: sumLike(calc.slice(0, 242)),
	EST: estBlock,
	NXT: [mulM.slice(1542, 1553)],
	DEC: [calc.slice(642, 651)],
	FLS: [mulM.slice(1540, 1542)]
};
const count = Object.values(blocks).reduce((n, b) => n + b.length * b[0].length, 0);
check(count === 2446, `every view drawn once (${count})`);
const wi = add.indexOf(Math.min(...add));
check(wi === 73 && Math.abs(add[73] - 3.016) < 1e-9, 'the weakest view: SUM row 73, 3.016');
const certOut = {
	device: cert.device,
	when: cert.when,
	dtype: cert.dtype,
	blocks,
	weakest: {
		block: 'SUM',
		r: wi % G,
		c: Math.floor(wi / (G * G)) * G + (Math.floor(wi / G) % G),
		margin: add[wi]
	},
	minima: Object.fromEntries(Object.entries(blocks).map(([k, b]) => [k, Math.min(...b.flat())]))
};

mkdirSync(resolve(HERE, 'data'), { recursive: true });
writeFileSync(
	resolve(HERE, 'data/film.json'),
	JSON.stringify({ silent, bars, mul, cert: certOut })
);
console.log(
	`wrote video/film/data/film.json: problem 71 wrong at ${silent.wrongFromRight} from the right; ` +
		`${ticks.length} recorded views, product ${mul.product}; 2,446 margins, min ${certOut.weakest.margin}`
);
