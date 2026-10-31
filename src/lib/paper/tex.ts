/**
 * paper.md to LaTeX for arXiv (paper/build-tex.ts writes paper/tex/main.tex; tectonic builds it). Numbers for
 * sections, figures, tables, theorems and citations come from md.ts, as on the web page, so the two never drift:
 * figure and table numbers are written out, not left to LaTeX's counters, and the bibliography is emitted in
 * order of first citation.
 */
import { format, type Entry } from './bib.ts';
import { inline, number, parse, type Attrs, type Block, type Inline } from './md.ts';

const SPECIAL: Record<string, string> = {
	'\\': '\\textbackslash{}',
	'&': '\\&',
	'%': '\\%',
	$: '\\$',
	'#': '\\#',
	_: '\\_',
	'{': '\\{',
	'}': '\\}',
	'~': '\\textasciitilde{}',
	'^': '\\textasciicircum{}'
};

export const escText = (s: string) =>
	s
		.replace(/[\\&%$#_{}~^]/g, (c) => SPECIAL[c])
		.replace(/(^|[\s(—[])"/g, '$1``')
		.replace(/"/g, "''")
		.replace(/(^|[\s(—[])'/g, '$1`');

/** code: monospace, breakable after punctuation */
const escCode = (s: string) =>
	'\\texttt{' + escText(s).replace(/(\\_|\.|\/|,|=)/g, '$1\\allowbreak{}') + '}';

const KIND_LABEL: Record<string, string> = {
	figure: 'Fig.',
	'ext-figure': 'Extended Data Fig.',
	table: 'Table',
	'ext-table': 'Extended Data Table',
	theorem: 'Theorem',
	'ext-theorem': 'Theorem'
};

export interface TexOptions {
	figDir: string;
	figExists: (pdf: string) => boolean;
}

export function renderTex(md: string, bib: Map<string, Entry>, opt: TexOptions): string {
	const doc = parse(md);
	const num = number(doc);
	const missing: string[] = [];

	const inl = (xs: Inline[]): string =>
		xs
			.map((x) => {
				switch (x.t) {
					case 'text':
						return escText(x.s);
					case 'math':
						return `$${x.tex}$`;
					case 'code':
						return escCode(x.s);
					case 'strong':
						return `\\textbf{${inl(x.c)}}`;
					case 'em':
						return `\\emph{${inl(x.c)}}`;
					case 'link':
						return `\\href{${x.href.replace(/[%#]/g, (c) => '\\' + c)}}{${inl(x.c)}}`;
					case 'br':
						return '\\\\';
					case 'ref': {
						const r = num.ids.get(x.id);
						if (!r) {
							missing.push(x.id);
							return '??';
						}
						return `\\hyperref[${x.id}]{${r.n}}`;
					}
					case 'cite':
						return `\\cite{${x.keys.join(',')}}`;
					case 'note':
						return `\\footnote{${inl(x.c)}}`;
				}
			})
			.join('');
	const run = (s: string) => inl(inline(s));
	const label = (id: string | undefined) => {
		const r = id ? num.ids.get(id) : undefined;
		return r ? `${KIND_LABEL[r.kind]} ${r.n}` : '';
	};

	const table = (b: Extract<Block, { t: 'table' }>) => {
		const width = b.head.map((_, i) =>
			Math.max(...[b.head[i], ...b.rows.map((r) => r[i] ?? '')].map((c) => c.length))
		);
		const wide = width.reduce((a, c) => a + c, 0) > 90;
		const spec = b.align
			.map((a, i) => (wide && width[i] > 24 && a === 'l' ? '>{\\raggedright\\arraybackslash}X' : a))
			.join('');
		const env = wide ? 'tabularx' : 'tabular';
		const open = wide ? `\\begin{tabularx}{\\linewidth}{${spec}}` : `\\begin{tabular}{${spec}}`;
		const row = (cs: string[]) => cs.map(run).join(' & ') + ' \\\\';
		const tight = b.head.length > 8 ? '\\footnotesize\\setlength{\\tabcolsep}{3pt}\n' : '';
		return [
			tight + open,
			'\\toprule',
			row(b.head),
			'\\midrule',
			...b.rows.map(row),
			'\\bottomrule',
			`\\end{${env}}`
		].join('\n');
	};

	const blocks = (bs: Block[]): string =>
		bs
			.map((b) => {
				switch (b.t) {
					case 'heading': {
						const lab = b.attrs.id ? `\\label{${b.attrs.id}}` : '';
						const star = b.attrs.classes.includes('unnumbered') ? '*' : '';
						if (b.level === 2) return `\\section${star}{${run(b.text)}}${lab}`;
						if (b.level === 3) return `\\subsection*{${run(b.text)}}${lab}`;
						return `\\paragraph{${run(b.text)}}${lab}`;
					}
					case 'para':
						return run(b.text) + '\n';
					case 'list': {
						const env = b.ordered ? 'enumerate' : 'itemize';
						return `\\begin{${env}}\n${b.items.map((it) => `\\item ${run(it)}`).join('\n')}\n\\end{${env}}`;
					}
					case 'math':
						return `\\[\n${b.tex}\n\\]`;
					case 'code':
						return `\\begin{verbatim}\n${b.text}\n\\end{verbatim}`;
					case 'table':
						return `{\\small\n${table(b)}\n}`;
					case 'div':
						return div(b.kind, b.attrs, b.children);
				}
			})
			.join('\n');

	const div = (kind: string, a: Attrs, children: Block[]): string => {
		const lab = a.id ? `\\phantomsection\\label{${a.id}}` : '';
		switch (kind) {
			case 'abstract':
				return `\\begin{abstract}\n${blocks(children)}\n\\end{abstract}`;
			case 'figure': {
				const pdf = a.kv.pdf;
				const img =
					pdf && opt.figExists(pdf)
						? `\\includegraphics[width=\\linewidth]{${opt.figDir}${pdf}}`
						: `\\fbox{\\parbox[c][6cm][c]{0.9\\linewidth}{\\centering ${escText(pdf ?? 'figure')} is being drawn}}`;
				const [first, ...rest] = children;
				const cap =
					first && first.t === 'para'
						? `\\textbf{${label(a.id)} $|$} ${run(first.text)} ${blocks(rest)}`
						: blocks(children);
				return `\\begin{figure}[tbp]\n\\centering\n${img}\n\\caption*{${cap.trim()}}${lab}\n\\end{figure}`;
			}
			case 'table': {
				const [first, ...rest] = children;
				const hasCap = first && first.t === 'para';
				const cap = hasCap ? `\\caption*{\\textbf{${label(a.id)} $|$} ${run(first.text)}}` : '';
				return `\\begin{table}[tbp]\n\\centering\n${cap}${lab}\n${blocks(hasCap ? rest : children)}\n\\end{table}`;
			}
			case 'theorem': {
				const name = a.kv.title ? ` (${run(a.kv.title)})` : '';
				const lean = a.kv.lean
					? `\n\n\\noindent{\\small\\raggedright\\textsc{Lean:} ${a.kv.lean
							.split(/,\s*/)
							.map(escCode)
							.join(', ')}\\par}`
					: '';
				return `\\begin{thmbox}${lab}\\noindent\\textbf{${label(a.id)}}${name}.\\enspace\\itshape ${blocks(children).trim()}\\upshape${lean}\n\\end{thmbox}`;
			}
			case 'proof':
				return `\\begin{proofbox}\\noindent\\textit{${a.kv.title ? run(a.kv.title) : 'Proof sketch'}.}\\enspace ${blocks(children).trim()}\n\\end{proofbox}`;
			case 'status':
				return `\\begin{statusbox}\\noindent\\textbf{${escText(a.kv.label ?? 'Today')}.}\\enspace ${blocks(children).trim()}\n\\end{statusbox}`;
			case 'appendix':
				return `\\appendix\n${blocks(children)}`;
			default:
				return blocks(children);
		}
	};

	const body = blocks(doc.blocks);
	const keys = [...num.cites.entries()].sort((x, y) => x[1] - y[1]);
	const items = keys
		.map(([k]) => {
			const e = bib.get(k);
			if (!e) return `\\bibitem{${k}} ${escText(k)} (missing).`;
			const f = format(e);
			const link = f.href ? ` \\url{${f.href}}` : '';
			const venue = f.venue.replace(/&/g, '\\&');
			return `\\bibitem{${k}} ${f.authors.replace(/&/g, '\\&')} ${f.title}. ${venue} (${f.year}).${link}`;
		})
		.join('\n');
	if (missing.length) throw new Error(`unknown references: ${missing.join(', ')}`);

	const m = doc.meta;
	return `% Generated by paper/build-tex.ts from paper/paper.md and paper/refs.bib. Do not edit by hand.
\\documentclass[10pt]{article}
\\usepackage[a4paper,margin=22mm]{geometry}
\\usepackage{fontspec}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx,booktabs,tabularx,array,xcolor}
\\usepackage[font=small,labelformat=empty,justification=raggedright,singlelinecheck=false]{caption}
\\usepackage{newunicodechar}
\\usepackage{microtype}
\\usepackage{enumitem}
\\usepackage[numbers,super,sort&compress]{natbib}
\\usepackage[hidelinks]{hyperref}
\\usepackage{url}
\\setlist{nosep,leftmargin=*}
\\definecolor{ink}{HTML}{1F2A44}
\\definecolor{inksoft}{HTML}{4C5B78}
\\definecolor{rose}{HTML}{D6336C}
\\definecolor{tint}{HTML}{F2F5FB}
\\newenvironment{thmbox}{\\par\\medskip\\begingroup\\leftskip=1em\\rightskip=1em}{\\par\\endgroup\\medskip}
\\newenvironment{proofbox}{\\par\\smallskip\\begingroup\\small\\leftskip=1em\\rightskip=1em}{\\par\\endgroup\\medskip}
\\newenvironment{statusbox}{\\par\\smallskip\\begingroup\\small\\color{inksoft}\\leftskip=1em}{\\par\\endgroup\\smallskip}
${UNICODE}
\\setlength{\\parskip}{0.35em}
\\setlength{\\parindent}{0pt}
\\renewcommand{\\bibnumfmt}[1]{#1.}
\\title{${run(m.title ?? '')}}
\\author{${run(m.authors ?? '')}${m.affiliation ? `\\\\ {\\small ${run(m.affiliation)}}` : ''}}
\\date{${run(m.date ?? '')}}
\\begin{document}
\\maketitle
${body}
\\section*{References}
\\begingroup\\small
\\renewcommand{\\refname}{}
\\vspace{-2.5em}
\\begin{thebibliography}{${keys.length}}
\\setlength{\\itemsep}{1pt}
${items}
\\end{thebibliography}
\\endgroup
\\end{document}
`;
}

/** text-mode characters the Latin Modern text font lacks or sets badly, mapped once in the preamble */
const UNICODE = [
	['×', '\\ensuremath{\\times}'],
	['−', '\\ensuremath{-}'],
	['≤', '\\ensuremath{\\le}'],
	['≥', '\\ensuremath{\\ge}'],
	['≠', '\\ensuremath{\\neq}'],
	['≈', '\\ensuremath{\\approx}'],
	['±', '\\ensuremath{\\pm}'],
	['⇔', '\\ensuremath{\\Leftrightarrow}'],
	['⇒', '\\ensuremath{\\Rightarrow}'],
	['→', '\\ensuremath{\\to}'],
	['←', '\\ensuremath{\\leftarrow}'],
	['√', '\\ensuremath{\\surd}'],
	['✓', '\\ensuremath{\\checkmark}'],
	['·', '\\ensuremath{\\cdot}'],
	['÷', '\\ensuremath{\\div}'],
	['∈', '\\ensuremath{\\in}'],
	['τ', '\\ensuremath{\\tau}'],
	['δ', '\\ensuremath{\\delta}'],
	['Π', '\\ensuremath{\\Pi}'],
	['∞', '\\ensuremath{\\infty}'],
	['⌊', '\\ensuremath{\\lfloor}'],
	['⌋', '\\ensuremath{\\rfloor}'],
	['…', '\\ldots{}'],
	['²', '\\textsuperscript{2}'],
	['³', '\\textsuperscript{3}'],
	['⁴', '\\textsuperscript{4}'],
	['⁵', '\\textsuperscript{5}'],
	['¹', '\\textsuperscript{1}'],
	['⁰', '\\textsuperscript{0}'],
	['₁', '\\textsubscript{1}'],
	['₂', '\\textsubscript{2}'],
	[' ', '\\,'],
	[' ', '\\,']
]
	.map(([c, r]) => `\\newunicodechar{${c}}{${r}}`)
	.join('\n');
