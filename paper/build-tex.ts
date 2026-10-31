/**
 * Writes paper/tex/main.tex from paper/paper.md and paper/refs.bib, the same source the web page renders.
 *
 *   node paper/build-tex.ts            # write main.tex
 *   node paper/build-tex.ts --pdf      # and build main.pdf with tectonic
 *
 * Node runs this file directly (type stripping); it imports only dependency-free modules.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBib } from '../src/lib/paper/bib.ts';
import { parse, wordCount } from '../src/lib/paper/md.ts';
import { renderTex } from '../src/lib/paper/tex.ts';

const here = dirname(fileURLToPath(import.meta.url));
const md = readFileSync(join(here, 'paper.md'), 'utf8');
const bib = parseBib(readFileSync(join(here, 'refs.bib'), 'utf8'));
const out = join(here, 'tex');
mkdirSync(out, { recursive: true });

const figDir = '../figures/out/';
const tex = renderTex(md, bib, {
	figDir,
	figExists: (f) => existsSync(join(here, 'figures', 'out', f))
});
writeFileSync(join(out, 'main.tex'), tex);
console.log(`main.tex written: ${tex.length} characters; main text ${wordCount(parse(md))} words`);

if (process.argv.includes('--pdf')) {
	const tectonic = existsSync('/opt/homebrew/bin/tectonic')
		? '/opt/homebrew/bin/tectonic'
		: 'tectonic';
	execFileSync(tectonic, ['--keep-logs', 'main.tex'], { cwd: out, stdio: 'inherit' });
	// the site serves the same PDF beside the web version
	copyFileSync(join(out, 'main.pdf'), join(out, '..', '..', 'static', 'sketchpad.pdf'));
	console.log(`main.pdf built in ${out}, copied to static/sketchpad.pdf`);
}
