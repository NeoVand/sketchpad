/**
 * The Algebra tab's sheet: a derivation (program/derivation.ts) laid out as worked algebra, and revealed as the model
 * computes it. Pure functions; Derivation.svelte draws them.
 *
 * A run is planned first on the page's own arithmetic (RefCalc): the same work order gives the same lines, and every
 * computed number on them names the call that produced it. While the model works, a line shows when its first own
 * call starts, and each number shows when the model's call with the same operation and operands has returned that
 * same value. So a number on screen is always the model's. If a call returns anything else the plan no longer
 * describes the run: the page stops revealing it and shows the model's own derivation when the run ends.
 */
import katex from 'katex';
import type { CalcCall, DerivationLine, StatementResult } from './program/index.ts';

/** the key of a call: what it computed from what, independent of when it ran */
export const callKey = (op: string, operands: readonly bigint[]) => `${op}:${operands.join(',')}`;

/** which field of a call's result a number shows */
function field(result: CalcCall['result'], name: string): bigint | null {
	if (typeof result === 'bigint') return name === 'value' ? result : null;
	const v = (result as Record<string, bigint>)[name];
	return typeof v === 'bigint' ? v : null;
}

const KATEX = {
	throwOnError: false,
	strict: 'ignore' as const,
	trust: (c: { command: string }) => c.command === '\\htmlId',
	output: 'html' as const
};
/** typeset TeX into an element (KaTeX builds the nodes; nothing is parsed as HTML) */
export const typeset = (el: HTMLElement, s: string) => katex.render(s, el, KATEX);

/**
 * Split a line at its first `=` outside any group, \left…\right or environment, so the equals signs of a derivation
 * can share a column. Null when the line has no such `=` (an expression, a table, a sentence).
 */
export function splitEquals(s: string): [string, string] | null {
	let depth = 0;
	for (let i = 0; i < s.length; i++) {
		const c = s[i];
		if (c === '\\') {
			const m = /^\\(left|right|begin|end)\b/.exec(s.slice(i));
			if (m) depth += m[1] === 'left' || m[1] === 'begin' ? 1 : -1;
			const word = /^\\[a-zA-Z]+/.exec(s.slice(i));
			i += word ? word[0].length - 1 : 1;
			continue;
		}
		if (c === '{') depth++;
		else if (c === '}') depth--;
		else if (c === '=' && depth === 0) return [s.slice(0, i).trim(), s.slice(i + 1).trim()];
	}
	return null;
}

/**
 * A line's TeX as the page may show it now: each computed number the model has returned, and in place of each one it
 * has not, an empty slot one digit wide. A number the model has not computed never reaches the page, not even hidden.
 */
/** an empty slot one digit wide (a digit is half an em): a space, with no digit of any kind */
export const SLOT = '\\kern0.5em';
export const fill = (tex: string, shown: ReadonlySet<string> | 'all') =>
	shown === 'all'
		? tex
		: tex.replace(/\\htmlId\{([^}]*)\}\{([^}]*)\}/g, (m, id: string) =>
				shown.has(id) ? m : `\\htmlId{${id}}{${SLOT}}`
			);

let mathFonts: Promise<void> | null = null;
/**
 * The KaTeX faces a derivation uses, loaded before any line needs them: a face that arrives in the middle of a run
 * (the check mark's, the larger brackets') changes the metrics of the lines already drawn, and they shift by a pixel.
 * Resolves when every face is in (or failed); a recording that draws a derivation waits for it before it plays.
 */
export function loadMathFonts(): Promise<void> {
	if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
	return (mathFonts ??= Promise.all(
		[
			'16px KaTeX_Main',
			'italic 16px KaTeX_Main',
			'italic 16px KaTeX_Math',
			'16px KaTeX_AMS',
			'16px KaTeX_Size1',
			'16px KaTeX_Size2',
			'16px KaTeX_Size3',
			'16px KaTeX_Size4'
		].map((face) => document.fonts.load(face).catch(() => []))
	).then(() => {}));
}

/** a line's TeX without its number ids, for comparing what two lines show */
export const plain = (s: string) =>
	s
		.replace(/\\htmlId\{[^}]*\}\{([^}]*)\}/g, '$1')
		.replace(/\s+/g, '')
		.replace(/\\quad\\checkmark$/, '');

/** a note in words (a reason), not TeX arithmetic */
export const wordy = (note: string) =>
	/[A-Za-z]{3,}/.test(note.replace(/\\htmlId\{[^}]*\}\{[^}]*\}/g, '').replace(/\\[a-zA-Z]+/g, ''));

/**
 * A note is TeX arithmetic, typeset; or a sentence, set as text, whose computed numbers keep their ids (so they show
 * in rose like the line's own).
 */
export function setNote(el: HTMLElement, note: string) {
	if (!wordy(note)) return typeset(el, note);
	// a minus before a number is a minus sign
	const text = (t: string) =>
		document.createTextNode(t.replace(/(^|[\s(=])-(?=\d)/g, '$1−').replace(/'/g, '’'));
	el.replaceChildren();
	let last = 0;
	for (const m of note.matchAll(/\\htmlId\{([^}]*)\}\{([^}]*)\}/g)) {
		el.append(text(note.slice(last, m.index)));
		const n = document.createElement('span');
		n.className = 'enclosing';
		n.id = m[1];
		n.textContent = m[2].replace(/^-/, '−');
		el.append(n);
		last = m.index! + m[0].length;
	}
	el.append(text(note.slice(last)));
}

export interface ViewLine {
	key: string;
	kind: DerivationLine['kind'];
	/**
	 * an equation: left of the shared `=` (empty when the line continues the one above), and right of it; an
	 * expression set where left sides go (`eq` false), so a chain of `= …` lines can follow it; or a whole line
	 * (a table, a sentence)
	 */
	cells: { lhs: string; eq: boolean; rhs: string } | { whole: string };
	note: string | null;
	/** the trace calls whose numbers are on this line, and the first of them no earlier line shows */
	calls: number[];
	own: number | null;
	/** this line's computed numbers: their ids and the call and value behind each */
	numbers: { id: string; call: number; field: string; value: bigint }[];
	statement: number;
}

/** A statement's lines as laid out: equals signs in one column, a line that continues the one above as `= …`. */
export function layout(results: StatementResult[]): ViewLine[] {
	const out: ViewLine[] = [];
	const seen = new Set<number>();
	results.forEach((r, s) => {
		let prev: string | null = null;
		r.derivation.lines.forEach((l, i) => {
			const parts = /^\\begin\{array\}/.test(l.tex) ? null : splitEquals(l.tex);
			let cells: ViewLine['cells'];
			if (parts) {
				const [lhs, rhs] = parts;
				// the same left side as the right side (or the expression) above: a chain of equalities
				cells = { lhs: prev !== null && plain(lhs) === prev ? '' : lhs, eq: true, rhs };
			} else if (l.kind === 'given') cells = { lhs: l.tex, eq: false, rhs: '' };
			else cells = { whole: l.tex };
			prev = parts ? plain(parts[1]) : plain(l.tex);
			const own = l.calls.find((c) => !seen.has(c)) ?? null;
			l.calls.forEach((c) => seen.add(c));
			out.push({
				key: `${s}.${i}`,
				kind: l.kind,
				cells,
				note: l.note ?? null,
				calls: l.calls,
				own,
				numbers: l.numbers.map((n) => ({
					id: n.id,
					call: n.call,
					field: n.field,
					value: BigInt(n.value)
				})),
				statement: s
			});
		});
	});
	return out;
}

/**
 * What the model has done so far, by key: how many calls with that key have started, and the results of those that
 * have returned, in the order they returned. The same call can come more than once in a work order (an integer
 * square root of 1 in the divisor list and again in the quadratic formula); each place it shows waits for its own.
 */
export interface Live {
	started: Map<string, number>;
	done: Map<string, CalcCall['result'][]>;
}

export interface Reveal {
	/** lines on show, and lines whose every number the model has computed */
	visible: boolean[];
	complete: boolean[];
	/** number ids the model has computed (shown), and those whose call is under way */
	shown: Set<string>;
	working: Set<string>;
	/** the line the arithmetic under way feeds */
	active: number;
	/** a call returned something the plan does not have: the plan no longer describes this run */
	diverged: boolean;
}

/** How much of a planned derivation the model has computed (see the module comment). */
export function reveal(lines: ViewLine[], trace: CalcCall[], live: Live): Reveal {
	// each planned call's key, and which occurrence of that key it is
	const keys: string[] = [];
	const nth: number[] = [];
	const seen = new Map<string, number>();
	for (const c of trace) {
		const key = callKey(c.op, c.operands);
		const k = seen.get(key) ?? 0;
		keys.push(key);
		nth.push(k);
		seen.set(key, k + 1);
	}
	const started = (i: number) => (live.started.get(keys[i]) ?? 0) > nth[i];
	const shown = new Set<string>();
	const working = new Set<string>();
	let diverged = false;
	const abs = (x: bigint) => (x < 0n ? -x : x);
	// every number of every line is looked at (no stopping at the first still to come)
	const doneLine = lines.map((l) =>
		l.numbers
			.map((n) => {
				const got = live.done.get(keys[n.call])?.[nth[n.call]];
				if (got === undefined) {
					if (started(n.call)) working.add(n.id);
					return false;
				}
				const v = field(got, n.field);
				if (v === null || abs(v) !== abs(n.value)) {
					diverged = true;
					return false;
				}
				shown.add(n.id);
				return true;
			})
			.every(Boolean)
	);
	// a call the plan does not have marks a different run
	for (const k of live.started.keys()) if (!seen.has(k)) diverged = true;
	const visible: boolean[] = [];
	lines.forEach((l, i) => {
		if (i === 0 || l.kind === 'given') return void visible.push(!diverged || l.kind === 'given');
		const before = visible[i - 1] && (doneLine[i - 1] || (l.own !== null && started(l.own)));
		visible.push(!!before && !diverged);
	});
	// the arithmetic under way feeds the first line still waiting for a number; else the last line on show
	let active = lines.findIndex((l, i) => visible[i] && !doneLine[i]);
	if (active < 0) active = visible.lastIndexOf(true);
	return { visible, complete: doneLine, shown, working, active, diverged };
}
