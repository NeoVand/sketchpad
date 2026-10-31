import type { Calc } from './calc';
import { CheckFailed } from './arithmetic';
export type BinomialMethod = 'pascal' | 'recurrence';
/** Numeric coefficients are computed on Calc; endpoints and symmetry are structural copies. */
export async function binomialRow(
	calc: Calc,
	n: number,
	method: BinomialMethod
): Promise<bigint[]> {
	if (method === 'pascal') {
		let row = [1n];
		for (let i = 1; i <= n; i++)
			row = [1n, ...(await calc.wave(row.slice(1).map((v, j) => () => calc.add(row[j], v)))), 1n];
		return row;
	}
	const row = [1n];
	for (let k = 1; k <= n; k++) {
		const numerator = await calc.mul(row[k - 1], BigInt(n - k + 1));
		const { q, r } = await calc.divmod(numerator, BigInt(k));
		if (r !== 0n) throw new CheckFailed('Binomial recurrence left a remainder');
		row.push(q);
	}
	return row;
}
