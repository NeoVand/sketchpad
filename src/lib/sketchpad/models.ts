/**
 * What the sketchpad loads. Both operations run on one base, Qwen3.5-0.8B exported to ONNX (embedding q4, vision tower
 * fp16, decoder fp16). An operation is a *program* on that base: a small adapter whose weights are initializers inside its
 * own decoder graph (`onnx/decoder_model_merged_fp16.onnx`, about 21 MB). Everything else (the decoder's external data,
 * the embedding, the vision tower, the configs and the tokenizer) is the base and is served from one folder, so the
 * browser downloads it once and a switch between operations costs one graph.
 *
 * Layout: `<BASE_ID>/` holds the base files; `<program id>/` holds at least the program's own files. When one adapter
 * learns both operations, both kinds name the same program id: a switch then reloads nothing, and only the prompts below
 * differ. A build loads the published copy on Hugging Face (HF_ROOT); `pnpm dev` serves the same layout from
 * static/sketchpad/models/, which is never committed.
 */
import type { TickOp } from './protocol.ts';

export type Kind = 'add' | 'mul' | 'calc';
export const KINDS: Kind[] = ['add', 'mul', 'calc'];

export const BASE_ID = 'base';

/** A program as published: its folder on the Hugging Face repo, the commit it is pinned at, and its tables. */
export interface Program {
	folder: string;
	/** a commit of the Hugging Face repo (40 hex digits) */
	revision: string;
	/** it has learned the calculator's three tables (SUB, EST, DEC: E7 and later); Calculate and Algebra need them */
	calculator: boolean;
	/**
	 * a later commit whose only change is the inside data (`inside.json`, `inside.bin`: the maps of the calculator's
	 * steps came after the model); the page reads those two files there and every other file at `revision`, where they
	 * are byte for byte the same, so a visitor's cached model stays good
	 */
	insideRevision?: string;
}

/**
 * The program this page runs, and the commits it is pinned at, in one place; everything else follows from it.
 */
export const PUBLISHED: Program = {
	folder: 'arithmetic',
	// the model, the lens and the certificate
	revision: '2df871728a9d24d1e102a327d1f1475457c53962',
	// the six state-space maps (SUM, MUL, ADD, SUB, EST, DEC); its parent is the commit above
	insideRevision: '97d606b832f60afe60c149216d5d100c02bd1055',
	calculator: true
};

/**
 * `pnpm dev` only: a program not yet published, served from static/sketchpad/models/<folder>/ beside a `base/` folder
 * (both never committed), named by VITE_LOCAL_PROGRAM in .env.local. A local program is taken to have the calculator.
 */
const LOCAL = import.meta.env?.DEV
	? (import.meta.env.VITE_LOCAL_PROGRAM as string | undefined)
	: undefined;
export const PROGRAM: Program & { local: boolean } = LOCAL
	? { folder: LOCAL, revision: 'local', calculator: true, local: true }
	: { ...PUBLISHED, local: false };

/** The published copy, pinned by commit (the browser caches files by URL, so a new revision never mixes with an old). */
export const HF_REPO = 'mohsenvand/sketchpad-0.8b-preview';
export const HF_REVISION = PUBLISHED.revision;
export const HF_ROOT = `https://huggingface.co/${HF_REPO}/resolve/${HF_REVISION}/`;
/** where the published program's inside data is read (HF_ROOT when it has not moved on) */
export const HF_INSIDE_ROOT = `https://huggingface.co/${HF_REPO}/resolve/${PUBLISHED.insideRevision ?? HF_REVISION}/`;
export const HF_CARD = `https://huggingface.co/${HF_REPO}`;

/** Files under a pinned revision never change, so their cached copies need no check against the server. */
export const pinned = (root: string) => /\/resolve\/[0-9a-f]{40}\/$/.test(root);

/** the ONNX precision of each session, shared by every program on the base */
export const DTYPE = {
	embed_tokens: 'q4',
	vision_encoder: 'fp16',
	// fp16, not q4: the q4 decoder flips a cluster of the union adapter's ADD rows (device min margin -8.9 against +9.4 on
	// the server); fp16 reproduces the server certificate (1,553/1,553, min margin 4.66 on an M4)
	decoder_model_merged: 'fp16'
} as const;

export interface SketchModel {
	kind: Kind;
	/** the program's folder */
	id: string;
	/** what the visitor reads */
	name: string;
	/** table rows the certificate checks */
	rows: number;
	/** files that come from the program's own folder; every other file comes from the base */
	own: string[];
	/** the word before the image for each runtime op (the prompt is `<word><image>=`) */
	prompts: Partial<Record<TickOp, string>>;
	/**
	 * Placeholder slots (`?`) after the multiplier's prompt: with 2, a step's three answers are read at `=` and the two
	 * slots of one forward pass (research/sketch/e6_slots.py); without, they are generated one token at a time. A
	 * slotted prompt is padded with more `?`s to the longest step word's length, so a wave step is one batch.
	 */
	slots?: number;
	/**
	 * The adder's prompt in the slotted form too (`SUM<image>=` then `?`s to the slotted prompts' length; its one answer
	 * still read at `=`), so any mix of steps is one batch (calculator waves, CALC3.md). Every layer is causal, so the
	 * padding cannot change the answer; the certificate checks the rows in exactly this form.
	 */
	padded?: boolean;
}

const GRAPH = 'onnx/decoder_model_merged_fp16.onnx';

/**
 * One adapter for both operations (E6, seed 3; Modal, 30 Oct): 1,795/1,795 table rows on the server, min margin 3.35,
 * perplexity x1.007. Addition is its SUM opcode; multiplication its five ops. A switch reloads nothing. It is the E5
 * union adapter (recipe v2) trained on to answer a multiplier step in one forward pass: the prompt ends `=??` and the
 * three answers are read at `=` and the two slots (research/sketch/e6_slots.py).
 * Its graph has a window into itself (research/sketch/patch_onnx_inside.py): an extra `hidden_states` output and a
 * `steer` input that is zero unless a visitor pushes; the folder also holds the lens and map data (inside.ts).
 * Built by research/sketch/build_program.sh (as qwen35-union-e6-s3-inside); published as `arithmetic/`.
 *
 * E7 (research/sketch/CALC3.md) is E6 trained on with the calculator's three tables as well (SUB, EST, DEC: 651 rows,
 * read like the multiplier's steps). Calculate and Algebra run on a program that has them (PROGRAM.calculator), and
 * its adder prompt is padded to the slotted length, so any mix of steps is one batch.
 */
export const HAS_CALC = PROGRAM.calculator;
const UNION = PROGRAM.folder;

export const MODELS: Record<Kind, SketchModel> = {
	add: {
		kind: 'add',
		id: UNION,
		name: 'the model',
		rows: 242,
		own: [GRAPH],
		prompts: { 'ADD-FAST': 'SUM' },
		padded: HAS_CALC
	},
	mul: {
		kind: 'mul',
		id: UNION,
		name: 'the model',
		rows: 1553,
		own: [GRAPH],
		prompts: { MUL: 'MUL', ADD: 'ADD', ADZ: 'ADZ', FLS: 'FLS', NXT: 'NXT' },
		slots: 2
	},
	calc: {
		kind: 'calc',
		id: UNION,
		name: 'the model',
		rows: 651,
		own: [GRAPH],
		prompts: { SUB: 'SUB', EST: 'EST', DEC: 'DEC' },
		slots: 2
	}
};

/** Which operation a runtime op belongs to. */
export const kindOf = (op: TickOp): Kind =>
	op === 'ADD-FAST' ? 'add' : op === 'SUB' || op === 'EST' || op === 'DEC' ? 'calc' : 'mul';

/** The prompt for one tick: the op's word, the image, then `=` (raw, no chat template). */
export function promptFor(op: TickOp): string {
	const word = MODELS[kindOf(op)].prompts[op];
	if (!word) throw new Error(`no prompt for ${op}`);
	return `${word}<|vision_start|><|image_pad|><|vision_end|>=`;
}

/**
 * Every file transformers.js fetches for a program, relative to the program's folder (the same for every program).
 * processor_config.json and chat_template.jinja sit in the folders too but are never fetched: the processor reads
 * preprocessor_config.json and the tokenizer its own config, so they are left out of sizes, caching and certificates.
 */
export function modelFiles(): string[] {
	const onnx = Object.entries(DTYPE).flatMap(([name, d]) => [
		`onnx/${name}_${d}.onnx`,
		`onnx/${name}_${d}.onnx_data`
	]);
	return [
		'config.json',
		'generation_config.json',
		'preprocessor_config.json',
		'tokenizer.json',
		'tokenizer_config.json',
		...onnx
	];
}

/** Where a file is really served from, below the models folder: the program's own folder or the base. */
export const servedPath = (m: SketchModel, file: string) =>
	`${m.own.includes(file) ? m.id : BASE_ID}/${file}`;

/**
 * The URL to fetch (and the cache key) for a URL transformers.js asks for. It asks for `<root><program id>/<file>`;
 * base files are routed to `<root><BASE_ID>/<file>`. Null for anything outside the models folder.
 */
export function route(url: string, root: string): string | null {
	if (!url.startsWith(root)) return null;
	const rest = url.slice(root.length).split(/[?#]/)[0];
	const cut = rest.indexOf('/');
	if (cut < 0) return null;
	const id = rest.slice(0, cut);
	if (id === BASE_ID) return root + rest;
	const m = Object.values(MODELS).find((x) => x.id === id);
	return m ? root + servedPath(m, rest.slice(cut + 1)) : null;
}

/** The files a certificate depends on: all of them (weights, configs, tokenizer). */
export const certFiles = () => modelFiles();

/**
 * The format the certificate certifies. Any change to tables, scoring or strip assembly must change this string, so a
 * cached certificate never outlives the format it checked. (The prompts are part of the cache key on their own.)
 */
export const CERT_FORMAT = `sketchpad-cert-v1;add=${MODELS.add.padded ? 'padded-' : ''}fast-242;mul=${
	MODELS.mul.slots ? `slots${MODELS.mul.slots}-padded-kept` : '3tok'
}-1553;${HAS_CALC ? 'calc=slots2-padded-kept-651;' : ''}strip=sprites-rowk-32x96`;

/** The browser cache that holds model files, keyed by the URL they are served from. */
export const FILE_CACHE = 'sketchpad-models-v1';
