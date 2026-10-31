/**
 * The calculator's three new digit tables (research/sketch/calc_tables.py, SKETCHPAD3 seam 1), read like the
 * multiplier's steps: an op word, a view of three cells, and three answers from one forward pass (two glyphs and the
 * next step).
 *
 *   SUB [borrow, top, bottom] -> digit, borrow (0/1), S; both blank: -, -, H (no borrow out) or B (borrow out)
 *   EST [r_hi, r_lo, d_hi]    -> min(9, (10 r_hi + r_lo) / d_hi), -, M (multiply-subtract) or N (the guess is 0)
 *                                with d_hi 5-9 (a normalised divisor) and r_hi <= d_hi
 *   DEC [q, _, _]             -> q - 1, -, C (correct the remainder)
 */
import { B, GLYPHS } from './sprites.ts';

export type CalcOp = 'SUB' | 'EST' | 'DEC';
export const CALC_OPS: CalcOp[] = ['SUB', 'EST', 'DEC'];
export const isCalcOp = (op: string): op is CalcOp => (CALC_OPS as string[]).includes(op);

const num = (g: string) => (g === B ? 0 : Number(g));

/** The true answer of a view, as the characters the model writes (`-` for an unused glyph). */
export function calcRef(op: CalcOp, [a, b, c]: readonly string[]): [string, string, string] {
	if (op === 'SUB') {
		if (b === B && c === B) return ['-', '-', a === B ? 'H' : 'B'];
		const d = num(b) - num(c) - num(a);
		return [String((d + 10) % 10), d < 0 ? '1' : '0', 'S'];
	}
	if (op === 'EST') {
		const q = Math.min(9, Math.floor((10 * num(a) + num(b)) / num(c)));
		return [String(q), '-', q ? 'M' : 'N'];
	}
	return [String(num(a) - 1), '-', 'C'];
}

/** All 651 rows, in the order of calc_tables.py (the certificate's order). */
export const CALC_DOMAIN: [CalcOp, string[]][] = [];
for (const w of [B, '1'])
	for (const t of GLYPHS) for (const b of GLYPHS) CALC_DOMAIN.push(['SUB', [w, t, b]]);
for (let d = 5; d <= 9; d++)
	for (let rh = 0; rh <= d; rh++)
		for (let rl = 0; rl <= 9; rl++) CALC_DOMAIN.push(['EST', [String(rh), String(rl), String(d)]]);
for (let q = 1; q <= 9; q++) CALC_DOMAIN.push(['DEC', [String(q), B, B]]);

const INDEX = new Map(CALC_DOMAIN.map(([op, v], i) => [op + v.join(''), i]));

/** The row a view is, or -1 when the view is not in the table. */
export const calcIndex = (op: string, cells: readonly string[]) =>
	INDEX.get(op + cells.join('')) ?? -1;
