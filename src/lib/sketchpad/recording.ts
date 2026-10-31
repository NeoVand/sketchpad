/**
 * Recordings: one real run per tab, made on a reference device with the published model, played back when the page
 * opens so a visitor sees the demo working before loading anything (Neo's rule: open on something visible, with
 * Recorded and Live under one switch, and never ask the visitor to load first).
 *
 * A recording holds every model call of the run as the page made it: the views asked (op and cells), the model's
 * outputs, its timings, and the inside readouts (the layer lens and the state-space path) in a compact form. Played
 * back, the page runs its own runtime exactly as live, and every answer comes from the recording: the numbers on the
 * page are the recorded model outputs, checked by the page's own arithmetic as a live run's are. Nothing is computed
 * by the page that a live run would take from the model. Made with scripts/record-demo.mjs.
 */
import { DEPTH, MAP_K, lensGroups, type Family, type InsideTick } from './inside.ts';
import type { TickOp } from './protocol.ts';

export const RECORDING_FORMAT = 'sketchpad-recording-v1';

export type RecordedTab = 'machine' | 'calc' | 'algebra' | 'chat';

/** one layer-lens group, compactly: per depth, the final answer's share and the depth's own best guess (in %) */
export interface CompactLens {
	token: number;
	top: number;
	decided: number;
	/** per depth: the final answer's probability, ×100 */
	sure: number[];
	/** per depth: the index of that depth's best guess, and its probability ×100 */
	arg: number[];
	argp: number[];
}
export interface CompactInside {
	lens: CompactLens[];
	family: Family | null;
	/** DEPTH × MAP_K, rounded to 0.01 */
	path: number[] | null;
}

/** one model call: a tick (one view) or a batch (several), as asked and as answered */
export interface RecordedCall {
	batch: boolean;
	items: { op: TickOp; cells: string[] }[];
	outs: string[][];
	margin: number | null;
	/** the model's milliseconds for the call, as the worker measured them */
	ms: number;
	inside: (CompactInside | null)[];
}

/** a chat reply: its text as it streamed, round by round (a round ends at a sheet block or at the reply's end) */
export interface RecordedRound {
	deltas: [number, string][];
	block: string | null;
	/** the seconds the round's sheet block took on the sheet */
	seconds?: number;
}

export interface Recording {
	format: typeof RECORDING_FORMAT;
	tab: RecordedTab;
	/** what was run: the machine's operation and operands, the calculator's line, the work order, or the question */
	input:
		| { tab: 'machine'; op: 'add' | 'mul'; a: string; b: string }
		| { tab: 'calc'; line: string }
		| { tab: 'algebra'; order: string; checkMode: 'light' | 'strong' }
		| { tab: 'chat'; question: string; gate: 0 | 1 };
	provenance: {
		/** the computer it was recorded on (its CPU's name, which names the chip) */
		machine?: string;
		/** the GPU as WebGPU names it */
		device: string;
		date: string;
		repo: string;
		revision: string;
		baseRevision: string;
		certificateRevision: string;
		program: string;
		transformers: string;
		/** the fingerprints of the files the model was read from */
		files: Record<string, string>;
	};
	calls: RecordedCall[];
	chat: { rounds: RecordedRound[]; ms: number } | null;
	/** what the run ended with, for the record: its result lines, and the derivation's lines (Algebra and chat) */
	result: { lines: string[]; derivation: string[]; views: number; steps: number; seconds: number };
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/** the inside readouts of one view, small enough to keep */
export function compactInside(t: InsideTick | null): CompactInside | null {
	if (!t) return null;
	return {
		lens: t.lens.map((r) => {
			const K = r.group.alphabet.length;
			const sure: number[] = [];
			const arg: number[] = [];
			const argp: number[] = [];
			for (let l = 0; l < DEPTH; l++) {
				let a = 0;
				for (let k = 1; k < K; k++) if (r.probs[l * K + k] > r.probs[l * K + a]) a = k;
				sure.push(Math.round(r.probs[l * K + r.top] * 100));
				arg.push(a);
				argp.push(Math.round(r.probs[l * K + a] * 100));
			}
			return { token: r.group.token, top: r.top, decided: r.decided, sure, arg, argp };
		}),
		family: t.family,
		path: t.path ? Array.from(t.path, r2) : null
	};
}

/** the inside readouts as the panels read them (what they draw is the same: each depth's share and best guess) */
export function expandInside(c: CompactInside | null, op: TickOp): InsideTick | null {
	if (!c) return null;
	const groups = lensGroups(op);
	return {
		lens: c.lens.flatMap((g) => {
			const group = groups.find((x) => x.token === g.token);
			if (!group) return [];
			const K = group.alphabet.length;
			const probs = new Float32Array(DEPTH * K);
			for (let l = 0; l < DEPTH; l++) {
				probs[l * K + g.arg[l]] = g.argp[l] / 100;
				probs[l * K + g.top] = Math.max(probs[l * K + g.top], g.sure[l] / 100);
			}
			return [{ group, probs, top: g.top, decided: g.decided }];
		}),
		family: c.family,
		path: c.path && c.path.length === DEPTH * MAP_K ? Float32Array.from(c.path) : null,
		pushed: null
	};
}
