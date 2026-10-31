import { expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { RefCalc } from './calc';
import { binomialRow } from './binomial';
it('measures both coefficient procedures and checks every row independently', async () => {
	const measurements = [];
	for (let n = 0; n <= 12; n++) {
		const pascal = new RefCalc(),
			recurrence = new RefCalc();
		const left = await binomialRow(pascal, n, 'pascal'),
			right = await binomialRow(recurrence, n, 'recurrence');
		let row = [1n];
		for (let i = 1; i <= n; i++) row = [1n, ...row.slice(1).map((v, j) => row[j] + v), 1n];
		expect(left).toEqual(row);
		expect(right).toEqual(row);
		measurements.push({
			n,
			pascal: pascal.total,
			recurrence: recurrence.total,
			selected: pascal.total.rows <= recurrence.total.rows ? 'pascal' : 'recurrence'
		});
	}
	if (process.env.PROGRAM_REPORT)
		writeFileSync(
			new URL('./binomial-costs.json', import.meta.url),
			JSON.stringify(measurements, null, 2) + '\n'
		);
});
