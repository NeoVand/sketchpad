import { describe, expect, it } from 'vitest';
import { ADD_DOMAIN, AddSheet, add, addCode, addDecode, addRule } from './adder.ts';
import {
	MUL_DOMAIN,
	MulSheet,
	multiply,
	outChars,
	reference,
	MulWave,
	multiplyWave
} from './multiplier.ts';
import { CELL, assembleStrip, type SpriteSheet } from './sprites.ts';
import { StreamHash } from './hash.ts';

// the generator of research/sketch/e3_browser/canvas_runtime.test.mjs, so the same 555 products are checked
let rng = 1;
const rand = () => (rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648;
const num = (n: number) =>
	Array.from({ length: n }, (_, i) =>
		i === 0 ? 1 + Math.floor(rand() * 9) : Math.floor(rand() * 10)
	).join('');

describe('multiplier runtime with the reference tables', () => {
	it('multiplies the 555 random products of canvas_runtime.test.mjs exactly', async () => {
		rng = 1;
		let total = 0;
		let bad = 0;
		for (const [n, m, k] of [
			[1, 1, 100],
			[4, 4, 200],
			[6, 6, 100],
			[10, 10, 50],
			[7, 3, 50],
			[2, 9, 50],
			[30, 30, 5]
		]) {
			for (let i = 0; i < k; i++) {
				const a = num(n);
				const b = num(m);
				const cv = await multiply(a, b, reference);
				total++;
				if (cv.result() !== (BigInt(a) * BigInt(b)).toString()) bad++;
			}
		}
		expect(total).toBe(555);
		expect(bad).toBe(0);
	});

	it('handles the edge cases', async () => {
		for (const [a, b] of [
			['0', '5'],
			['10', '10'],
			['99', '99'],
			['100', '1'],
			['1', '1000']
		]) {
			const cv = await multiply(a, b, reference);
			expect(cv.result()).toBe((BigInt(a) * BigInt(b)).toString());
		}
	});

	it('has the 1,553-row table, answers of three single characters', () => {
		expect(MUL_DOMAIN.length).toBe(1553);
		const byOp: Record<string, number> = {};
		for (const [op, v] of MUL_DOMAIN) {
			byOp[op] = (byOp[op] ?? 0) + 1;
			expect(outChars(op, v).every((c) => c.length === 1)).toBe(true);
		}
		expect(byOp).toEqual({ MUL: 1100, ADD: 220, ADZ: 220, FLS: 2, NXT: 11 });
	});

	it('follows an edit of a later multiplier digit', async () => {
		let edited = false;
		const cv = await multiply('4567', '1234', reference, (s) => {
			if (!edited && s.j === 1 && s.op === 'MUL') {
				expect(s.editable('b', 3)).toBe(true);
				expect(s.editable('b', 1)).toBe(false);
				s.bump('b', 3);
				edited = true;
			}
		});
		expect(cv.operands()).toEqual(['4567', '2234']);
		expect(cv.result()).toBe((4567n * 2234n).toString());
	});

	it('names the cells each view reads', () => {
		const cv = new MulSheet('12', '34');
		expect(cv.fovea()).toEqual([
			['a', 0],
			['b', 0],
			['cM', 0]
		]);
		expect(cv.fovea().map((c) => (c ? cv.get(c[0], c[1]) : ' '))).toEqual(cv.view());
	});
});

describe('adder runtime with the rule', () => {
	it('has 242 views, each with a one-token answer that decodes back', () => {
		expect(ADD_DOMAIN.length).toBe(242);
		for (const v of ADD_DOMAIN) {
			const r = addRule(v);
			expect(addDecode(addCode(r))).toBe(r);
		}
		expect(addDecode('x')).toBe(null);
	});

	it('adds random numbers of many lengths exactly', async () => {
		rng = 7;
		for (const n of [1, 2, 5, 40, 300]) {
			for (let i = 0; i < 10; i++) {
				const a = num(n);
				const b = num(Math.max(1, n - (i % 3)));
				const s = await add(a, b, addRule);
				expect(s.result()).toBe((BigInt(a) + BigInt(b)).toString());
				expect(s.done).toBe(true);
			}
		}
	});

	it('follows an edit of a digit not read yet', async () => {
		expect((await add('1999', '1', addRule)).result()).toBe('2000');
		const t = new AddSheet('1234', '5678');
		t.apply(addRule(t.view()));
		expect(t.editable('top', 1)).toBe(true);
		expect(t.editable('top', 4)).toBe(false);
		t.bump('top', 1);
		while (t.apply(addRule(t.view())));
		expect(t.operands()).toEqual(['2234', '5678']);
		expect(t.result()).toBe(t.expected());
		expect(t.result()).toBe('7912');
	});
});

describe('strips and fingerprints', () => {
	it('copies sprite row k into strip cell k', () => {
		const sheet: SpriteSheet = {
			width: 11 * CELL,
			height: 3 * CELL,
			data: new Uint8ClampedArray(11 * CELL * 3 * CELL * 4)
		};
		for (let y = 0; y < sheet.height; y++)
			for (let x = 0; x < sheet.width; x++) {
				const o = (y * sheet.width + x) * 4;
				sheet.data[o] = Math.floor(x / CELL); // glyph index
				sheet.data[o + 1] = Math.floor(y / CELL); // sheet row
				sheet.data[o + 3] = 255;
			}
		const s = assembleStrip(sheet, ['7', ' ', '0']);
		const px = (x: number, y: number) => [
			...s.subarray((y * CELL + x) * 4, (y * CELL + x) * 4 + 2)
		];
		expect(px(3, 5)).toEqual([8, 0]);
		expect(px(31, 40)).toEqual([0, 1]);
		expect(px(0, 95)).toEqual([1, 2]);
	});

	it('hashes a stream the same however it is chunked', () => {
		const bytes = new Uint8Array(10007).map((_, i) => (i * 131 + 7) & 255);
		const whole = new StreamHash();
		whole.update(bytes);
		const parts = new StreamHash();
		for (const [a, b] of [
			[0, 3],
			[3, 4],
			[4, 1001],
			[1001, 1001],
			[1001, 10007]
		])
			parts.update(bytes.subarray(a, b));
		expect(parts.digest()).toBe(whole.digest());
		const other = new StreamHash();
		other.update(bytes.map((v, i) => (i === 5000 ? v ^ 1 : v)));
		expect(other.digest()).not.toBe(whole.digest());
	});
});

describe('table rows a run reads', () => {
	it('maps every view of both tables back to its own row', async () => {
		const { rowIndex } = await import('./pad.svelte.ts');
		ADD_DOMAIN.forEach((v, i) => expect(rowIndex('ADD-FAST', v)).toBe(i));
		MUL_DOMAIN.forEach(([op, v], i) => expect(rowIndex(op, v)).toBe(i));
		expect(rowIndex('ADD-FAST', ['2', '1', '1'])).toBe(-1);
	});

	it('only ever reads table views, at any length', async () => {
		const { rowIndex } = await import('./pad.svelte.ts');
		rng = 3;
		let views = 0;
		await multiply(num(12), num(9), (op, v) => {
			expect(rowIndex(op, v)).toBeGreaterThanOrEqual(0);
			views++;
			return reference(op, v);
		});
		await add(num(200), num(150), (v) => {
			expect(rowIndex('ADD-FAST', v)).toBeGreaterThanOrEqual(0);
			views++;
			return addRule(v);
		});
		expect(views).toBeGreaterThan(300);
	});
});

describe('one base, one graph per program', () => {
	it('routes base files to the shared folder and the graph to the program', async () => {
		const { BASE_ID, DTYPE, MODELS, modelFiles, route, servedPath } = await import('./models.ts');
		const root = 'http://h/sketchpad/models/';
		for (const m of Object.values(MODELS)) {
			const own = modelFiles().filter((f) => servedPath(m, f).startsWith(m.id + '/'));
			expect(own).toEqual([`onnx/decoder_model_merged_${DTYPE.decoder_model_merged}.onnx`]);
			for (const f of modelFiles())
				expect(route(`${root}${m.id}/${f}`, root)).toBe(
					root + (own.includes(f) ? m.id : BASE_ID) + '/' + f
				);
		}
		// both programs ask for the same base URL, so the browser keeps one copy
		const a = route(`${root}${MODELS.add.id}/onnx/vision_encoder_fp16.onnx_data`, root);
		const b = route(`${root}${MODELS.mul.id}/onnx/vision_encoder_fp16.onnx_data`, root);
		expect(a).toBe(b);
		expect(route(`${root}${BASE_ID}/tokenizer.json`, root)).toBe(
			`${root}${BASE_ID}/tokenizer.json`
		);
		expect(route('http://h/models/x/config.json', root)).toBe(null);
		expect(route(`${root}unknown/config.json`, root)).toBe(null);
	});

	it('builds every prompt from its operation', async () => {
		const { kindOf, promptFor } = await import('./models.ts');
		expect(promptFor('ADD-FAST')).toBe('SUM<|vision_start|><|image_pad|><|vision_end|>=');
		expect(promptFor('NXT')).toBe('NXT<|vision_start|><|image_pad|><|vision_end|>=');
		expect(kindOf('ADD-FAST')).toBe('add');
		expect(kindOf('ADD')).toBe('mul');
	});
});

describe('the multiplier as a wave of overlapped passes', () => {
	const tableRows = new Set(MUL_DOMAIN.map(([op, v]) => op + v.join('')));
	const digits = (n: number, seed: number) => {
		let s = seed;
		return Array.from({ length: n }, (_, i) => {
			s = (s * 1103515245 + 12345) % 2147483648;
			return i === 0 ? 1 + (s % 9) : s % 10;
		}).join('');
	};

	it('is exact at every size, reading only views of the certified table', async () => {
		for (const [n, m] of [
			[1, 1],
			[3, 1],
			[1, 4],
			[4, 4],
			[6, 6],
			[12, 12],
			[20, 20],
			[7, 15]
		]) {
			for (let t = 0; t < 4; t++) {
				const a = digits(n, 7 * t + n);
				const b = digits(m, 11 * t + m);
				const views: string[] = [];
				const w = await multiplyWave(a, b, (items) =>
					items.map(({ op, cells }) => {
						views.push(op + cells.join(''));
						return reference(op, cells);
					})
				);
				expect(w.result()).toBe((BigInt(a) * BigInt(b)).toString());
				expect(views.every((v) => tableRows.has(v))).toBe(true);
				// pass j starts LAG ticks after pass j - 1 and takes 2n + 4 ticks
				expect(w.steps).toBe(MulWave.LAG * (m - 1) + 2 * n + 4);
				expect(w.ticks).toBe(m * (2 * n + 4));
			}
		}
	});

	it('stops when the model ends a pass against the schedule', async () => {
		await expect(
			multiplyWave('12', '34', (items) =>
				items.map(({ op, cells }) => {
					const out = reference(op, cells);
					return op === 'NXT' ? ([out[0], out[1], 'H'] as typeof out) : out;
				})
			)
		).rejects.toThrow(/schedule/);
	});
});
