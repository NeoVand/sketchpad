/**
 * Column addition on the sheet (the "fast" format of research/sketch/e3_browser/index.html). Each tick the model reads
 * one strip (carry, top digit, bottom digit) and answers with one token: `0`-`9` is the sum digit with no carry,
 * `a`-`j` is digit 0-9 with a carry, `H` is halt. The runtime stamps the digit, writes the carry one column to the
 * left and steps the window one column left, until the model writes H or the sheet runs out.
 */
import { B, GLYPHS } from './sprites.ts';

const CODES = 'abcdefghij';

export type AddView = [carry: string, top: string, bottom: string];

/** What the model should write: 'H', or the sum digit followed by the carry ('0' or '1'). */
export function addRule([c, t, b]: readonly string[]): string {
	if (c === B && t === B && b === B) return 'H';
	const s = [c, t, b].filter((g) => g !== B).reduce((x, g) => x + Number(g), 0);
	return `${s % 10}${Math.floor(s / 10)}`;
}

/** The one token that says a rule's answer. */
export const addCode = (r: string) => (r === 'H' ? 'H' : r[1] === '0' ? r[0] : CODES[Number(r[0])]);

/** A token back to the rule form, or null if the token is not one of the 21 answers. */
export function addDecode(t: string): string | null {
	if (t === 'H') return 'H';
	if (/^\d$/.test(t)) return `${t}0`;
	const i = CODES.indexOf(t);
	return t.length === 1 && i >= 0 ? `${i}1` : null;
}

/** All 242 views: carry in {blank, 1}, top and bottom in {blank, 0-9}. */
export const ADD_DOMAIN: AddView[] = [];
for (const c of [B, '1'])
	for (const t of GLYPHS) for (const b of GLYPHS) ADD_DOMAIN.push([c, t, b]);

const clean = (s: string) => s.replace(/\D/g, '');

/** The adder's sheet: four rows of `n` columns, column 0 on the left. Plain data; the page redraws from it. */
export class AddSheet {
	readonly n: number;
	readonly carry: string[];
	readonly top: string[];
	readonly bottom: string[];
	readonly sum: string[];
	/** the column being read; -1 when done */
	pointer: number;
	ticks = 0;
	done = false;
	edits = 0;

	constructor(a: string, b: string) {
		a = clean(a);
		b = clean(b);
		this.n = Math.max(a.length, b.length) + 1;
		this.top = [...a.padStart(this.n)];
		this.bottom = [...b.padStart(this.n)];
		this.carry = Array(this.n).fill(B);
		this.sum = Array(this.n).fill(B);
		this.pointer = this.n - 1;
	}

	view(): AddView {
		const i = this.pointer;
		return [this.carry[i], this.top[i], this.bottom[i]];
	}

	/** Apply one answer in rule form; returns false once the run is over. */
	apply(rule: string): boolean {
		const i = this.pointer;
		this.ticks++;
		if (rule === 'H') return this.finish();
		this.sum[i] = rule[0];
		if (i > 0) this.carry[i - 1] = rule[1] === '1' ? '1' : B;
		this.pointer = i - 1;
		return this.pointer < 0 ? this.finish() : true;
	}

	private finish() {
		this.done = true;
		this.pointer = -1;
		return false;
	}

	/** columns already summed */
	get columnsDone() {
		return this.done ? this.n : this.n - 1 - this.pointer;
	}

	/** A top or bottom digit the model has not read yet can be changed. */
	editable(row: 'top' | 'bottom', i: number) {
		return !this.done && i < this.pointer && /\d/.test(this[row][i]);
	}

	/** Step an unread digit by one (0-9); returns whether it changed. */
	bump(row: 'top' | 'bottom', i: number, by = 1): boolean {
		if (!this.editable(row, i)) return false;
		this[row][i] = String((Number(this[row][i]) + 10 + by) % 10);
		this.edits++;
		return true;
	}

	operands(): [string, string] {
		return [this.top.join('').trim(), this.bottom.join('').trim()];
	}

	result(): string {
		return this.sum.join('').trim();
	}

	/** the true sum of what is on the sheet now (edits included) */
	expected(): string {
		const [a, b] = this.operands();
		return (BigInt(a || '0') + BigInt(b || '0')).toString();
	}
}

/** Run a sheet to the end with a policy (the model, or addRule in tests). */
export async function add(
	a: string,
	b: string,
	policy: (v: AddView) => Promise<string> | string
): Promise<AddSheet> {
	const s = new AddSheet(a, b);
	while (s.apply(await policy(s.view())));
	return s;
}
