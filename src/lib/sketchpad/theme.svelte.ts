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

/** The certificate grid's tones: unchecked, passed (certified: rose), failed (a hollow ring), and pointed at. */
export const GRID = {
	idle: '#E3E8F1',
	pass: PALETTE.roseLight,
	fail: PALETTE.ink,
	hot: PALETTE.rose
};
