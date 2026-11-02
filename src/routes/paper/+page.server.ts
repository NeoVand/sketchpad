/**
 * The paper page, rendered at build time from paper/paper.md and paper/refs.bib (the same source as the arXiv
 * LaTeX, paper/build-tex.ts). The page is prerendered, so the parser and KaTeX never reach the browser.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { asset } from '$app/paths';
import { parseBib } from '#lib/paper/bib.ts';
import { renderPaper } from '#lib/paper/html.ts';
import type { PageServerLoad } from './$types';

export const prerender = true;
/** the paper needs no client code: no hydration, so the rendered HTML is not shipped twice */
export const csr = false;

export const load: PageServerLoad = () => {
	const root = process.cwd();
	const md = readFileSync(resolvePath(root, 'paper/paper.md'), 'utf8');
	const bib = parseBib(readFileSync(resolvePath(root, 'paper/refs.bib'), 'utf8'));
	const out = renderPaper(
		md,
		bib,
		(f) => asset(`/figures/${f}` as Parameters<typeof asset>[0]),
		(f) => existsSync(resolvePath(root, 'static/figures', f))
	);
	if (out.missing.some((m) => !m.startsWith('figure:')))
		throw new Error(`paper.md: unresolved ${out.missing.join(', ')}`);
	return out;
};
