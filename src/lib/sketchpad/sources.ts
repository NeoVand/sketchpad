/**
 * The sheet as the page draws it: rows top to bottom, columns left to right, the cells the model is reading, and the
 * cells a visitor may change. Both runtimes map onto this, so one renderer draws either.
 */
import { AddSheet } from './adder.ts';
import { Grid } from './calc-sheet.ts';
import { MulSheet, MulWave, type Row } from './multiplier.ts';

export interface SheetRow {
	key: string;
	label: string;
	/** which sprite row draws this row: the strip position the model reads it at */
	sprite: 0 | 1 | 2;
	/** a ruled line above this row */
	ruleBefore: boolean;
	/** scratch (a carry row): drawn in a lighter ink than the numbers */
	dim?: boolean;
}

export interface SheetSource {
	rows: SheetRow[];
	cols: number;
	glyph(r: number, c: number): string;
	/**
	 * the cells being read, in strip order; null where the strip cell is always blank. Several strips (overlapped passes)
	 * come one after another, each cell keyed by its pass and place, so each eye glides on its own.
	 */
	fovea(): ({ r: number; c: number; key?: string } | null)[];
	editable(r: number, c: number): boolean;
	/** the runtime's own name and index for a cell (for pad.bump) */
	address(r: number, c: number): [string, number];
}

const ADD_ROWS: SheetRow[] = [
	{ key: 'carry', label: 'carry', sprite: 0, ruleBefore: false, dim: true },
	{ key: 'top', label: 'a', sprite: 1, ruleBefore: false },
	{ key: 'bottom', label: 'b', sprite: 2, ruleBefore: false },
	{ key: 'sum', label: 'a + b', sprite: 1, ruleBefore: true }
];

export function addSource(s: AddSheet): SheetSource {
	const data = [s.carry, s.top, s.bottom, s.sum];
	return {
		rows: ADD_ROWS,
		cols: s.n,
		glyph: (r, c) => data[r][c],
		fovea: () => (s.done || s.pointer < 0 ? [] : [0, 1, 2].map((r) => ({ r, c: s.pointer }))),
		editable: (r, c) => (r === 1 || r === 2) && s.editable(r === 1 ? 'top' : 'bottom', c),
		address: (r, c) => [ADD_ROWS[r].key, c]
	};
}

const MUL_ORDER: Row[] = ['a', 'b', 'cM', 'cA', 'p', 'R'];
const MUL_ROWS: SheetRow[] = [
	{ key: 'a', label: 'a', sprite: 0, ruleBefore: false },
	{ key: 'b', label: '× b', sprite: 1, ruleBefore: false },
	{ key: 'cM', label: 'carry ×', sprite: 2, ruleBefore: true, dim: true },
	{ key: 'cA', label: 'carry +', sprite: 0, ruleBefore: false, dim: true },
	{ key: 'p', label: 'product', sprite: 1, ruleBefore: false },
	{ key: 'R', label: 'a × b', sprite: 2, ruleBefore: true }
];

export function mulSource(s: MulSheet): SheetSource {
	const x = (c: number) => s.W - 1 - c;
	return {
		rows: MUL_ROWS,
		cols: s.W,
		glyph: (r, c) => s.rows[MUL_ORDER[r]][x(c)],
		fovea: () =>
			s
				.fovea()
				.map((cell) => (cell ? { r: MUL_ORDER.indexOf(cell[0]), c: s.W - 1 - cell[1] } : null)),
		editable: (r, c) => s.editable(MUL_ORDER[r], x(c)),
		address: (r, c) => [MUL_ORDER[r], x(c)]
	};
}

/** The overlapped multiplier: the same sheet, with an eye for every pass under way. */
export function waveSource(s: MulWave): SheetSource {
	const x = (c: number) => s.W - 1 - c;
	return {
		rows: MUL_ROWS,
		cols: s.W,
		glyph: (r, c) => s.rows[MUL_ORDER[r]][x(c)],
		fovea: () =>
			s.done
				? []
				: s
						.active()
						.flatMap((q) =>
							s
								.foveaOf(q)
								.map((cell, k) =>
									cell
										? { r: MUL_ORDER.indexOf(cell[0]), c: s.W - 1 - cell[1], key: `${q.j}.${k}` }
										: null
								)
						),
		editable: (r, c) => s.editable(MUL_ORDER[r], x(c)),
		address: (r, c) => [MUL_ORDER[r], x(c)]
	};
}

/** A calculator sheet (calc-sheet.ts): its rows as laid out, an eye for every view of the step under way. */
export function gridSource(g: Grid): SheetSource {
	const rows: SheetRow[] = g.specs.map((s, i) => ({
		key: s.key,
		label: s.label,
		sprite: (i % 3) as 0 | 1 | 2,
		ruleBefore: !!s.rule,
		dim: s.dim
	}));
	const index = new Map(g.specs.map((s, i) => [s.key, i]));
	const x = (c: number) => g.W - 1 - c;
	return {
		rows,
		cols: g.W,
		glyph: (r, c) => g.rows[g.specs[r].key][x(c)],
		fovea: () =>
			g.done
				? []
				: g.fovea.flatMap((cells, v) =>
						cells.map((cell, k) =>
							cell ? { r: index.get(cell[0])!, c: x(cell[1]), key: `${v}.${k}` } : null
						)
					),
		editable: () => false,
		address: (r, c) => [g.specs[r].key, x(c)]
	};
}

export const sourceOf = (s: AddSheet | MulSheet | MulWave | Grid) =>
	s instanceof AddSheet
		? addSource(s)
		: s instanceof MulWave
			? waveSource(s)
			: s instanceof Grid
				? gridSource(s)
				: mulSource(s);
