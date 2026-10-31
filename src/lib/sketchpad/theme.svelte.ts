/**
 * The site's one palette, Cobalt and Rose (polyformer research/figstyle/palette.json at 3185c95b), shared by the paper,
 * the demo and the figures. The site is light only. layout.css holds the same colours as CSS tokens; this module holds
 * them for the canvases, which cannot read CSS.
 *
 * Only what the page draws uses them. The strips fed to the model are always the training pixels, black on white
 * (worker.ts assembles them from the sprites; nothing here reaches the model).
 */
export const PALETTE = {
	paper: '#FFFFFF',
	tint: '#F2F5FB',
	ink: '#1F2A44',
	inkSoft: '#4C5B78',
	blueGrey: '#7D8BA8',
	mist: '#BAC5D9',
	/** ours: the model's writing on the sheet, certified */
	rose: '#D6336C',
	roseLight: '#F1A3BC',
	/** the alternative, or stock Qwen */
	cobalt: '#2557A7',
	cobaltLight: '#9DB8E0',
	/** references and theory only */
	violet: '#7A5BA8'
} as const;

/** How the display sheet is drawn. */
export interface SheetPalette {
	paper: string;
	/** glyph colour of what was on the sheet before the run (the operands); each glyph pixel is this ink at alpha
	 * (255 - its grey level), so black on white gives back the training pixels */
	ink: string;
	/** glyph colour of what the model wrote during the run */
	wrote: string;
	rule: string;
	/** behind a digit the pointer can change */
	tint: string;
	fovea: string;
	/** under a digit a visitor changed */
	mark: string;
}

/** The sheet: a quiet tint for the paper, the page's ink for the operands, rose for the model's writing. */
export const SHEET: SheetPalette = {
	paper: PALETTE.tint,
	ink: PALETTE.ink,
	wrote: PALETTE.rose,
	rule: PALETTE.mist,
	tint: PALETTE.paper,
	fovea: PALETTE.ink,
	mark: PALETTE.blueGrey
};

/**
 * The certificate grid's tones. A passing row is rose on a white-ended ramp by its margin (a larger margin, a deeper
 * rose; `pass(m)`); a row not checked yet, or one a run has not read, is a quiet neutral; a failing row is a hollow ink
 * square; the row read last, or pointed at, is ringed in ink.
 */
export const GRID = {
	idle: '#E6EAF2',
	fail: PALETTE.ink,
	ring: PALETTE.ink,
	read: PALETTE.rose,
	/** the margin at which the ramp reaches full rose */
	full: 12,
	pass(m: number) {
		const t = 0.3 + 0.7 * Math.max(0, Math.min(1, m / GRID.full));
		const mix = (c: number) => Math.round(255 + (c - 255) * t);
		const [r, g, b] = [0xd6, 0x33, 0x6c].map(mix);
		return `rgb(${r} ${g} ${b})`;
	}
};
