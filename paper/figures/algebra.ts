/**
 * Figure 4a's data, from the runtime: the algebra program (src/lib/sketchpad/program) factors x^3 - 6x^2 + 11x - 6
 * on the sheet calculator (SheetCalc) with the reference tables as the policy, textbook path, light check. Writes
 * paper/figures/data/algebra.json: the derivation's lines (TeX, with each computed number's call), the trace of Calc
 * calls, and for every call a derivation number comes from, the sheet that call is worked on (run again alone, the
 * same procedure and digits), as the page draws it.
 *
 *     node --import ./paper/figures/ts-resolve.mjs paper/figures/algebra.ts
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { run } from '../../src/lib/sketchpad/program/index.ts';
import { SheetCalc } from '../../src/lib/sketchpad/sheet-calc.ts';
import { Grid, referencePolicy, type CalcSheet } from '../../src/lib/sketchpad/calc-sheet.ts';
import { AddSheet } from '../../src/lib/sketchpad/adder.ts';
import { MulWave } from '../../src/lib/sketchpad/multiplier.ts';
import { addSource, gridSource, waveSource, type SheetSource } from '../../src/lib/sketchpad/sources.ts';
import { B } from '../../src/lib/sketchpad/sprites.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const big = (_k: string, v: unknown) => (typeof v === 'bigint' ? v.toString() : v);

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
		fovea: [],
		points: src.points?.() ?? []
	};
}

function sourceOf(s: CalcSheet): SheetSource {
	if (s instanceof Grid) return gridSource(s);
	if (s instanceof AddSheet) return addSource(s);
	if (s instanceof MulWave) return waveSource(s);
	throw new Error('unknown sheet');
}

const SOURCE = 'factor x^3-6x^2+11x-6';
const calc = new SheetCalc(referencePolicy);
const result = await run(SOURCE, calc as never);
const st = result.results[0];
if (st.status !== 'ok') throw new Error(st.status);

const used = [...new Set(st.derivation.lines.flatMap((l) => l.numbers.map((n) => n.call)))].sort((a, b) => a - b);
const receipts: Record<number, unknown> = {};
for (const i of used) {
	const call = result.trace[i];
	const sheets: CalcSheet[] = [];
	const alone = new SheetCalc(referencePolicy, { onShow: (s) => sheets.push(s) });
	const [a, b] = call.operands;
	const got =
		call.op === 'isqrt' ? await alone.isqrt(a) : await (alone[call.op] as (x: bigint, y: bigint) => Promise<unknown>)(a, b);
	if (JSON.stringify(got, big) !== JSON.stringify(call.result, big)) throw new Error(`call ${i} differs alone`);
	// the sheet that holds the answer: the last one shown (a scaled division's remainder sheet comes after its grid)
	const main = sheets.filter((s) => s instanceof Grid || s instanceof AddSheet || s instanceof MulWave);
	receipts[i] = {
		op: call.op,
		operands: call.operands.map(String),
		result: JSON.parse(JSON.stringify(call.result, big)),
		calls: alone.calls,
		views: alone.views,
		sheets: main.map((s) => ({ title: s instanceof Grid ? s.title : s instanceof AddSheet ? 'a + b' : 'a × b', snap: snapshot(sourceOf(s)) }))
	};
}

const out = {
	source: SOURCE,
	path: st.derivation.path,
	lines: st.derivation.lines.map((l) => ({ kind: l.kind, tex: l.tex, note: l.note ?? null, numbers: l.numbers })),
	trace: result.trace.map((c) => ({ op: c.op, operands: c.operands.map(String), result: JSON.parse(JSON.stringify(c.result, big)) })),
	receipts,
	cost: { calls: calc.calls, views: calc.views, seconds: calc.seconds }
};
writeFileSync(resolve(HERE, 'data/algebra.json'), JSON.stringify(out, big));
console.log(SOURCE, st.status, 'lines', out.lines.length, 'trace', out.trace.length, 'receipts', used.length, out.cost);
