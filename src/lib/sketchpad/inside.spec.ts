import { describe, expect, it } from 'vitest';
import {
	DEPTH,
	DIM,
	MAP_K,
	analyse,
	lensGroups,
	project,
	readLens,
	steerCodes,
	steerVector,
	type FamilyMap,
	type InsideAssets
} from './inside.ts';

/** a toy model: lm_head row of character i is the unit vector e_i; the final norm is the identity */
function toy(): InsideAssets {
	const rows = new Map<string, Float32Array>();
	[...'0123456789_-MAZFNHabcdefghij'].forEach((c, i) => {
		const r = new Float32Array(DIM);
		r[i] = 1;
		rows.set(c, r);
	});
	const fam = (): FamilyMap => {
		const basis = new Float32Array(MAP_K * DIM);
		for (let k = 0; k < MAP_K; k++) basis[k * DIM + k] = 1;
		return {
			ops: [],
			cloud: [],
			cloudLabels: [],
			cloudViews: [],
			labels: {},
			radius: [],
			separation: 1,
			basis,
			centre: new Float32Array(DEPTH * DIM)
		};
	};
	const steer = new Map<string, Float32Array>();
	steer.set('3', new Float32Array(DIM).fill(1));
	steer.set('c', new Float32Array(DIM).fill(4));
	return {
		eps: 1e-6,
		normWeight: new Float32Array(DIM).fill(1),
		rows,
		families: { SUM: fam(), MUL: fam(), ADD: fam() },
		steerLayer: 20,
		steer: { SUM: steer, MUL: new Map([['3', new Float32Array(DIM).fill(2)]]) }
	};
}

/** states whose depth l points at character `early` below `switchAt` and at `late` from there on */
function states(early: number, late: number, switchAt: number) {
	const h = new Float32Array(DEPTH * DIM);
	for (let l = 0; l < DEPTH; l++) h[l * DIM + (l < switchAt ? early : late)] = 5;
	return h;
}

describe('the inside of a tick', () => {
	it('reads each depth through the lens and finds where the answer takes the lead for good', () => {
		const a = toy();
		const g = lensGroups('MUL')[0];
		const r = readLens(a, states(2, 7, 18), g);
		expect(g.alphabet[r.top]).toBe('7');
		expect(r.decided).toBe(18);
		const row = Array.from(r.probs.subarray(24 * 10, 25 * 10));
		expect(row.reduce((x, y) => x + y, 0)).toBeCloseTo(1, 5);
		expect(row[7]).toBeGreaterThan(0.9);
	});

	it('reads all three answer tokens of a multiplier tick, and none for a missing one', () => {
		const a = toy();
		const t = analyse(a, 'MUL', [states(0, 4, 20), states(0, 1, 21), undefined], null);
		expect(t.lens.map((r) => r.group.name)).toEqual(['writes', 'carries']);
		expect(t.family).toBe('MUL');
		expect(t.path?.length).toBe(DEPTH * MAP_K);
	});

	it('projects each depth onto the map (centred, normed like the lens)', () => {
		const a = toy();
		const h = new Float32Array(DEPTH * DIM);
		h[(DEPTH - 1) * DIM + 1] = 3; // the last depth is used as it is
		const p = project(a.families.SUM, h);
		expect(Array.from(p.subarray((DEPTH - 1) * MAP_K))).toEqual([0, 3, 0]);
	});

	it('pushes by the difference of two class means, and not at all toward the same answer', () => {
		const a = toy();
		expect(steerVector(a, 'SUM', '3', 'c')?.[0]).toBe(3);
		expect(steerVector(a, 'SUM', '3', '3')).toBeNull();
		expect(steerVector(a, 'SUM', '3', 'x')).toBeNull();
	});

	it('pushes only with the class means of its own family', () => {
		const a = toy();
		expect(steerVector(a, 'MUL', '3', 'c')).toBeNull();
		expect(steerVector(a, 'ADD', '3', 'c')).toBeNull();
		expect(steerCodes('0123')).toEqual({ SUM: '0123' });
		expect(steerCodes({ SUM: '01', MUL: '0' })).toEqual({ SUM: '01', MUL: '0' });
	});
});
