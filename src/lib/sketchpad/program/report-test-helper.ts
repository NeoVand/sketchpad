import { writeFileSync } from 'node:fs';
import { format } from 'prettier';
/** Reproducible artifacts use the repository's JSON formatting. */
export async function writeReport(name: string, value: unknown): Promise<void> {
	writeFileSync(
		new URL(name, import.meta.url),
		await format(JSON.stringify(value), { parser: 'json', useTabs: true, printWidth: 100 })
	);
}
