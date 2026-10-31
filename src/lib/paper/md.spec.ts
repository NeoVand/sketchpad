import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseBib } from './bib.ts';
import { compress, inline, number, parse } from './md.ts';
import { renderPaper } from './html.ts';
import { renderTex } from './tex.ts';

describe('the paper source', () => {
	it('parses divs, headings, tables and maths', () => {
		const doc = parse(
			'---\ntitle: T\n---\n## A {#sec-a}\n\nText $x$ [@k].\n\n::: theorem {#thm-a title="P"}\nBody.\n:::\n\n| a | b |\n|---|--:|\n| 1 | $|x|$ |\n\n$$\ny = x\n$$\n'
		);
		expect(doc.meta.title).toBe('T');
		expect(doc.blocks.map((b) => b.t)).toEqual(['heading', 'para', 'div', 'table', 'math']);
		const n = number(doc);
		expect(n.ids.get('sec-a')?.n).toBe('1');
		expect(n.ids.get('thm-a')?.n).toBe('1');
		expect(n.cites.get('k')).toBe(1);
	});

	it('sets a citation against the word before it and escapes dollars', () => {
		const xs = inline('word [@a; @b] costs \\$7');
		expect(xs[0]).toEqual({ t: 'text', s: 'word' });
		expect(xs[1]).toEqual({ t: 'cite', keys: ['a', 'b'] });
		expect(xs[2]).toEqual({ t: 'text', s: ' costs $7' });
	});

	it('compresses citation runs', () => {
		expect(compress([3, 1, 2, 7, 5, 6])).toBe('1–3,5–7');
		expect(compress([4, 5])).toBe('4,5');
	});

	it('renders the real paper to HTML and LaTeX with every reference resolved', () => {
		const md = readFileSync('paper/paper.md', 'utf8');
		const bib = parseBib(readFileSync('paper/refs.bib', 'utf8'));
		const html = renderPaper(
			md,
			bib,
			(f) => `/figures/${f}`,
			() => true
		);
		expect(html.missing).toEqual([]);
		const tex = renderTex(md, bib, { figDir: '', figExists: () => true });
		expect(tex).toContain('\\begin{thebibliography}');
	});
});
