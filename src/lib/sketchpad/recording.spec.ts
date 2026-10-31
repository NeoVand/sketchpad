import { describe, expect, it } from 'vitest';
import { DEPTH, MAP_K, lensGroups, type InsideTick } from './inside.ts';
import { compactInside, expandInside } from './recording.ts';

/** a multiply tick's inside readouts, with each depth's guess and share made up but deterministic */
function tick(): InsideTick {
	const lens = lensGroups('MUL').map((group, g) => {
		const K = group.alphabet.length;
		const probs = new Float32Array(DEPTH * K);
		const top = (g + 3) % K;
		for (let l = 0; l < DEPTH; l++) {
			// the depth's own guess: the final answer from depth 12 on, a neighbour before
			const guess = l >= 12 ? top : (top + 1) % K;
			const p = 0.4 + (0.55 * l) / (DEPTH - 1);
			for (let k = 0; k < K; k++) probs[l * K + k] = (1 - p) / (K - 1);
			probs[l * K + guess] = p;
		}
		return { group, probs, top, decided: 12 };
	});
	const path = Float32Array.from({ length: DEPTH * MAP_K }, (_, i) => Math.sin(i) * 3);
	return { lens, family: 'MUL', path, pushed: null };
}

describe('recorded inside readouts', () => {
	it('keep what the panels draw: each depth’s guess, the final answer’s share, the decision and the path', () => {
		const t = tick();
		const back = expandInside(compactInside(t), 'MUL')!;
		expect(back.family).toBe('MUL');
		expect(back.lens.map((r) => [r.group.token, r.top, r.decided])).toEqual(
			t.lens.map((r) => [r.group.token, r.top, r.decided])
		);
		for (const [i, r] of back.lens.entries()) {
			const K = r.group.alphabet.length;
			const was = t.lens[i];
			for (let l = 0; l < DEPTH; l++) {
				const row = (p: Float32Array) => Array.from(p.subarray(l * K, (l + 1) * K));
				const argmax = (p: number[]) => p.indexOf(Math.max(...p));
				// the same best guess at every depth, and the final answer's share to the percent
				expect(argmax(row(r.probs))).toBe(argmax(row(was.probs)));
				expect(Math.abs(r.probs[l * K + r.top] - was.probs[l * K + was.top])).toBeLessThanOrEqual(
					0.005
				);
			}
		}
		for (let i = 0; i < DEPTH * MAP_K; i++)
			expect(Math.abs(back.path![i] - t.path![i])).toBeLessThanOrEqual(0.005);
	});

	it('stay small: integers and two decimals', () => {
		const c = compactInside(tick())!;
		const text = JSON.stringify(c);
		expect(
			c.lens.every((g) => g.sure.every(Number.isInteger) && g.argp.every(Number.isInteger))
		).toBe(true);
		expect(text.length).toBeLessThan(1200);
	});

	it('pass nothing on for a view read without its states', () => {
		expect(compactInside(null)).toBeNull();
		expect(expandInside(null, 'MUL')).toBeNull();
	});
});
