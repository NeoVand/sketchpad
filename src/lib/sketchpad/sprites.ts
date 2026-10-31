/**
 * The glyph pixels the model was trained on (static/sketchpad/sprites.png). Every image the model reads is assembled
 * from this sheet and nothing else: a cell is 32 x 32 px, the glyphs are " 0123456789" left to right, and the sheet's
 * row k is the glyph as drawn at strip position k. A strip is 32 x 96 px, three cells stacked top to bottom.
 */
export const CELL = 32;
export const GLYPHS = ' 0123456789';
/** the blank glyph */
export const B = ' ';

export interface SpriteSheet {
	width: number;
	height: number;
	/** RGBA, row-major, as getImageData returns it */
	data: Uint8ClampedArray;
}

/** Index of a glyph in the sheet; throws on anything the model was never shown. */
export function glyphIndex(g: string): number {
	const i = GLYPHS.indexOf(g);
	if (i < 0 || g.length !== 1) throw new Error(`no sprite for ${JSON.stringify(g)}`);
	return i;
}

/**
 * The strip the model reads: cell k is copied from the sheet's row k. The sprite is opaque, so copying its pixels is
 * exactly what drawing it at an integer offset on a white canvas gives (the reference pages do that).
 */
export function assembleStrip(sheet: SpriteSheet, cells: readonly string[]): Uint8ClampedArray {
	if (cells.length !== 3) throw new Error('a strip has three cells');
	const out = new Uint8ClampedArray(CELL * 3 * CELL * 4);
	const row = CELL * 4;
	cells.forEach((g, k) => {
		const gi = glyphIndex(g);
		for (let y = 0; y < CELL; y++) {
			const src = ((k * CELL + y) * sheet.width + gi * CELL) * 4;
			out.set(sheet.data.subarray(src, src + row), (k * CELL + y) * row);
		}
	});
	return out;
}
