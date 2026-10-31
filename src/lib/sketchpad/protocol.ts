/** Messages between the page and the worker that holds the sketchpad model (worker.ts, pad.svelte.ts). */
import type { Family, InsideTick, Point } from './inside.ts';
import type { Kind } from './models.ts';
import type { Op } from './multiplier.ts';
import type { CalcOp } from './calc-tables.ts';

/** `ADD-FAST` is the adder's one-token step; the multiplier's five ops and the calculator's three have their own prompts. */
export type TickOp = 'ADD-FAST' | Op | CalcOp;

export interface LoadedInfo {
	/** the program now loaded (both kinds may share one) */
	id: string;
	kind: Kind;
	seconds: number;
	/** fingerprint of every file the program uses, by file name (from the download, or kept with the cached copy) */
	prints: Record<string, string>;
	sprites: string;
	gpu: string;
	transformers: string;
	/** bytes this load took from the network, counted as they streamed, and per served path */
	network: number;
	networkFiles: Record<string, number>;
	/** the browser's own count of the same requests (Resource Timing transferSize; headers included) */
	transferSize: number;
	/** bytes read from this browser's model cache instead */
	cached: number;
	/** the program was already loaded: nothing was read or compiled */
	reused: boolean;
	/** what the page needs to draw the inside of this program (null when its graph has no window into itself) */
	inside: InsideMeta | null;
}

/** The maps' backgrounds and the push's alphabet (inside.json without the arrays the worker keeps). */
export interface InsideMeta {
	steerLayer: number;
	/** the answer codes a visitor can push each pushable family toward */
	steerCodes: Partial<Record<Family, string>>;
	families: Partial<
		Record<
			Family,
			{
				cloud: Point[];
				cloudLabels: string[];
				cloudViews: string[];
				labels: Record<string, Point>;
				radius: number[];
				separation: number;
			}
		>
	>;
}

export type ToWorker =
	| { type: 'load'; lid: number; kind: Kind; root: string; sprites: string }
	/**
	 * `rows`: check only these table rows (a spot check); all of them when absent, from row `from` on (a check resumed
	 * after the GPU was reset)
	 */
	| { type: 'certify'; rid: number; kind: Kind; rows?: number[]; from?: number }
	/**
	 * `push`: an answer code to push the stream entering the steer layer toward, on this tick only (an adder tick, or a
	 * multiply step with a digit of a)
	 */
	| {
			type: 'tick';
			rid: number;
			op: TickOp;
			cells: string[];
			push: string | null;
			/** false: leave the layer states on the GPU (no lens or path for this tick; a step costs less) */
			inside?: boolean;
	  }
	/** several multiplier views at once (independent rows of one batched generation); a push applies to its own row */
	| {
			type: 'tick-batch';
			rid: number;
			items: { op: TickOp; cells: string[]; push?: string | null }[];
			/** false: leave the layer states on the GPU */
			inside?: boolean;
			/** read the states of the first rows only (the page shows one view a step); default every row */
			insideRows?: number;
	  }
	/** a chat reply, at gate 1 (the model that opens its sheet) or 0 (stock Qwen3.5-0.8B) */
	| { type: 'chat'; rid: number; question: string; maxNew: number; gate: 0 | 1 }
	/** the result lines of the sheet block a reply stopped at; the reply goes on from them */
	| { type: 'chat-continue'; rid: number; result: string }
	/** the visitor stopped a reply's sheet block: the reply ends there */
	| { type: 'chat-stop'; rid: number }
	| { type: 'cancel'; rid: number }
	/** how a tick's states come back: only the places it reads (gpu), or the whole output (cpu; the dev page compares) */
	| { type: 'states-via'; via: 'gpu' | 'cpu' }
	/** a check of device-loss recovery (dev page only): destroy the GPU device under the loaded model */
	| { type: 'lose-device' };

export type FromWorker =
	| {
			type: 'progress';
			lid: number;
			kind: Kind;
			/** bytes from the network so far, of `expect` (what was not cached when the load began) */
			network: number;
			expect: number;
			cached: number;
			stage: 'fetch' | 'compile';
	  }
	| { type: 'loaded'; lid: number; info: LoadedInfo }
	/** a newer load was asked for before this one started */
	| { type: 'load-skipped'; lid: number }
	| { type: 'load-error'; lid: number; kind: Kind; error: string }
	/**
	 * certificate rows: a run from `start`, or the rows in `indices` when given; `got` is the model's own answer where a
	 * row failed
	 */
	| {
			type: 'cert-rows';
			rid: number;
			start: number;
			indices?: number[];
			margins: number[];
			got: (string | null)[];
	  }
	| { type: 'cert-done'; rid: number; seconds: number }
	| {
			type: 'tick';
			rid: number;
			/** the answer tokens as text */
			out: string[];
			/** argmax margin of the adder's single token (the multiplier decodes greedily: null) */
			margin: number | null;
			ms: number;
			/** the 32 x 96 RGBA strip the model read */
			strip: Uint8ClampedArray;
			/** the lens and the path of this tick's states (null when the program has no inside data) */
			inside: InsideTick | null;
	  }
	| {
			type: 'tick-batch';
			rid: number;
			/** per row: glyph, glyph, next-op */
			outs: string[][];
			strips: Uint8ClampedArray[];
			inside: (InsideTick | null)[];
			ms: number;
	  }
	| { type: 'chat-delta'; rid: number; text: string }
	/** a reply closed a sheet block (its `index`-th, from 1): run it, then send `chat-continue` with its result lines */
	| { type: 'chat-block'; rid: number; block: string; index: number }
	/** the WebGPU device under the model was lost (driver reset, memory, or destroyed): nothing on it runs again */
	| { type: 'device-lost'; reason: string; message: string }
	| { type: 'done'; rid: number; ms: number }
	| { type: 'failed'; rid: number; error: string; cancelled: boolean };
