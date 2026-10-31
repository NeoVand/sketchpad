/**
 * One calculator line as the page takes it: `a + b`, `a − b`, `a × b`, `a ÷ b to k places`, `√a to k places` or
 * `gcd(a, b)`, with signed integers. The sheet does the digits (sheet-calc.ts); the decimal point, the signs and the
 * trailing `…` of an inexact answer are layout. `expected` is the page's own BigInt answer, the check on the sheet's.
 */
import type { SheetCalc } from './sheet-calc.ts';

export type CalcTask =
	| { op: '+' | '−' | '×'; a: bigint; b: bigint }
	| { op: '÷'; a: bigint; b: bigint; places: number }
	| { op: '√'; a: bigint; places: number }
	| { op: 'gcd'; a: bigint; b: bigint };

const INT = String.raw`([-−]?\d+)`;
const PLACES = String.raw`(?:\s+to\s+(\d+)(?:\s+places?)?)?`;

/** the task a line asks for, or a message saying what is wrong with it */
export function parseTask(text: string): CalcTask | string {
	const t = text.trim().replace(/\s+/g, ' ');
	const n = (s: string) => BigInt(s.replace('−', '-'));
	const places = (s: string | undefined) => {
		const k = s === undefined ? 0 : Number(s);
		return k > 40 ? null : k;
	};
	let m = t.match(new RegExp(String.raw`^(?:gcd\s*\(?\s*)${INT}\s*[, ]\s*${INT}\s*\)?$`, 'i'));
	if (m) return { op: 'gcd', a: n(m[1]), b: n(m[2]) };
	m = t.match(new RegExp(String.raw`^(?:√|sqrt)\s*\(?\s*${INT}\s*\)?${PLACES}$`, 'i'));
	if (m) {
		const k = places(m[2]);
		if (k === null) return 'at most 40 places';
		if (n(m[1]) < 0n) return 'a square root needs a number of 0 or more';
		return { op: '√', a: n(m[1]), places: k };
	}
	m = t.match(new RegExp(String.raw`^${INT}\s*([+\-−×*x÷/])\s*${INT}${PLACES}$`, 'i'));
	if (!m) return 'type a + b, a − b, a × b, a ÷ b to k places, √a to k places or gcd(a, b)';
	const a = n(m[1]);
	const b = n(m[3]);
	const sym = m[2];
	if (sym === '÷' || sym === '/') {
		const k = places(m[4]);
		if (k === null) return 'at most 40 places';
		if (b === 0n) return 'division by zero';
		return { op: '÷', a, b, places: k };
	}
	if (m[4] !== undefined) return 'places go with ÷ and √';
	return { op: sym === '+' ? '+' : sym === '×' || sym === '*' || /x/i.test(sym) ? '×' : '−', a, b };
}

const abs = (n: bigint) => (n < 0n ? -n : n);
const ten = (k: number) => 10n ** BigInt(k);

/** an integer with k decimals as text: 314159 with k = 5 is 3.14159; `more` marks digits that go on */
export function decimal(v: bigint, k: number, negative = false, more = false) {
	let s = v.toString().padStart(k + 1, '0');
	if (k) s = `${s.slice(0, -k)}.${s.slice(-k)}`;
	return (negative && v !== 0n ? '−' : '') + s + (more ? '…' : '');
}

/** how the task reads on the page */
export function describe(t: CalcTask) {
	const s = (n: bigint) => (n < 0n ? `−${-n}` : `${n}`);
	if (t.op === '√') return `√${t.a}${t.places ? ` to ${t.places} places` : ''}`;
	if (t.op === 'gcd') return `gcd(${s(t.a)}, ${s(t.b)})`;
	if (t.op === '÷') return `${s(t.a)} ÷ ${s(t.b)}${t.places ? ` to ${t.places} places` : ''}`;
	return `${s(t.a)} ${t.op} ${s(t.b)}`;
}

/** the answer, from the page's own arithmetic */
export function expected(t: CalcTask): string {
	if (t.op === '+') return decimal(abs(t.a + t.b), 0, t.a + t.b < 0n);
	if (t.op === '−') return decimal(abs(t.a - t.b), 0, t.a - t.b < 0n);
	if (t.op === '×') return decimal(abs(t.a * t.b), 0, t.a * t.b < 0n);
	if (t.op === 'gcd') {
		let [a, b] = [abs(t.a), abs(t.b)];
		while (b) [a, b] = [b, a % b];
		return a.toString();
	}
	if (t.op === '÷') {
		const n = abs(t.a) * ten(t.places);
		const d = abs(t.b);
		return decimal(n / d, t.places, t.a < 0n !== t.b < 0n, n % d !== 0n);
	}
	const n = t.a * ten(2 * (t as Extract<CalcTask, { op: '√' }>).places);
	let r = 0n;
	if (n > 0n) {
		let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
		for (;;) {
			const y = (x + n / x) / 2n;
			if (y >= x) break;
			x = y;
		}
		r = x;
	}
	return decimal(r, (t as Extract<CalcTask, { op: '√' }>).places, false, r * r !== n);
}

/** the answer, on the sheet: every digit from `calc`, the layout here */
export async function solve(calc: SheetCalc, t: CalcTask): Promise<string> {
	if (t.op === '+' || t.op === '−') {
		const v = t.op === '+' ? await calc.add(t.a, t.b) : await calc.sub(t.a, t.b);
		return decimal(abs(v), 0, v < 0n);
	}
	if (t.op === '×') {
		const v = await calc.mul(t.a, t.b);
		return decimal(abs(v), 0, v < 0n);
	}
	if (t.op === 'gcd') {
		let [a, b] = [abs(t.a), abs(t.b)];
		// Euclid: the remainder of each division divides the next; a zero remainder (all zero digits) stops
		while (b) [a, b] = [b, (await calc.divmod(a, b)).r];
		return a.toString();
	}
	if (t.op === '÷') {
		// to k places: k zeros after the dividend (layout), one integer division
		const { q, exact } = await calc.divFloor(abs(t.a) * ten(t.places), abs(t.b));
		return decimal(q, t.places, t.a < 0n !== t.b < 0n, !exact);
	}
	const k = (t as Extract<CalcTask, { op: '√' }>).places;
	const { root, exact } = await calc.sqrtFloor(t.a * ten(2 * k));
	return decimal(root, k, false, !exact);
}
