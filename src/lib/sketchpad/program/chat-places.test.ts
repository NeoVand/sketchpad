import { describe, expect, it } from 'vitest';
import { RefCalc } from './calc';
import { run } from './run';

/** the chat's sheet blocks run with `defaultPlaces: 4`; Calculate and Algebra keep the 12-place cut */
const chat = async (source: string) => {
	const c = new RefCalc();
	const r = await run(source, c, { checkMode: 'light', defaultPlaces: 4 });
	return { line: r.lines.join(' | '), seconds: c.total.seconds };
};

describe('a chat block with no places of its own', () => {
	it('keeps a division exact and shows four places, in seconds rather than minutes', async () => {
		const r = await chat('2375 ÷ 12');
		expect(r.line).toBe('= 2375/12 (≈ 197.9166…)');
		expect(r.seconds).toBeLessThan(30);
		const before = new RefCalc();
		const old = await run('2375 ÷ 12', before, { checkMode: 'light' });
		expect(old.lines).toEqual(['= 197.916666666666…']);
		expect(before.total.seconds).toBeGreaterThan(5 * r.seconds);
	});

	it('writes a decimal that ends within the places as the decimal, and an integer as it is', async () => {
		expect((await chat('100 ÷ 8')).line).toBe('= 12.5');
		expect((await chat('-7 ÷ 3')).line).toBe('= -7/3 (≈ -2.3333…)');
		expect((await chat('4386 × 27 × 52')).line).toBe('= 6157944');
		expect((await chat('348 × 86.75')).line).toBe('= 30189');
	});

	it('cuts an irrational root at four places', async () => {
		expect((await chat('sqrt(2)')).line).toBe('= 1.4142…');
	});

	it('keeps the places a block asks for', async () => {
		expect((await chat('1/3 to 6 places')).line).toBe('= 0.333333…');
		expect((await chat('sqrt(2) to 6 places')).line).toBe('= 1.414213…');
	});
});
