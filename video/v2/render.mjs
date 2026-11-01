/**
 * Renders the film page (video/film/index.html) frame by frame.
 *
 *     node video/v2/render.mjs stills 3 12.5 30        PNG stills at those times -> video/out/v2/stills/
 *     node video/v2/render.mjs contact                 24 stills across the film -> video/out/v2/contact_preview.jpg
 *     node video/v2/render.mjs film [workers]          every frame at 60 fps -> video/out/v2/film_picture.mp4
 *
 * A small static server serves the repository root, so the page reads the fonts in node_modules, the figures in
 * static/figures, the sprites, the recordings' data and the captured frames in video/out/capture. Each worker renders
 * a contiguous run of frames and pipes them to ffmpeg; the runs are joined without re-encoding.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUT = resolve(ROOT, 'video/out/v2');
const TYPES = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.mjs': 'text/javascript',
	'.json': 'application/json',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.woff2': 'font/woff2',
	'.css': 'text/css'
};

function serve() {
	const server = createServer(async (req, res) => {
		const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
		const file = resolve(ROOT, `.${path}`);
		if (!file.startsWith(ROOT)) return res.writeHead(403).end();
		try {
			const body = await readFile(file);
			res.writeHead(200, {
				'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
				'Cache-Control': 'max-age=3600'
			});
			res.end(body);
		} catch {
			res.writeHead(404).end();
		}
	});
	return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

async function open(browser, port) {
	const page = await browser.newPage({
		viewport: { width: 1920, height: 1080 },
		deviceScaleFactor: 1
	});
	page.on('pageerror', (e) =>
		(() => {
			throw e;
		})()
	);
	page.on('console', (m) => m.type() === 'error' && console.error('console:', m.text()));
	await page.goto(`http://127.0.0.1:${port}/video/v2/index.html`);
	await page.waitForFunction(() => window.film?.ready, null, { timeout: 60000 });
	return page;
}

const shot = async (page, t, path) => {
	await page.evaluate((x) => window.film.seek(x), t);
	return page.screenshot({ path, type: 'png' });
};

const [mode = 'stills', ...args] = process.argv.slice(2);
const server = await serve();
const port = server.address().port;
const browser = await chromium.launch();
const timeline = JSON.parse(await readFile(resolve(ROOT, 'video/v2/timeline.json'), 'utf8'));
try {
	if (mode === 'audit') {
		const page = await open(browser, port);
		const issues = await page.evaluate(async () => {
			window.filmAudit = [];
			for (let t = 0; t < 285; t += 0.5) await window.film.seek(t);
			return window.filmAudit;
		});
		const unique = [...new Map(issues.map((x) => [x.s, x])).values()];
		console.log(JSON.stringify(unique, null, 2));
		if (unique.length) throw new Error('Text outside safe horizontal frame');
	} else if (mode === 'stills') {
		await mkdir(resolve(OUT, 'stills'), { recursive: true });
		const page = await open(browser, port);
		for (const a of args) {
			const t = Number(a);
			await shot(page, t, resolve(OUT, 'stills', `t${t.toFixed(2).padStart(6, '0')}.png`));
			console.log('still', t);
		}
	} else if (mode === 'contact') {
		await mkdir(resolve(OUT, 'stills'), { recursive: true });
		const page = await open(browser, port);
		const n = 24;
		const files = [];
		for (let i = 0; i < n; i++) {
			const t = 0.5 + ((timeline.duration - 2) * i) / (n - 1);
			const f = resolve(OUT, 'stills', `contact_${String(i).padStart(2, '0')}.png`);
			await shot(page, t, f);
			files.push([f, t]);
		}
		await writeFile(resolve(OUT, 'stills/contact.json'), JSON.stringify(files));
		console.log('contact stills written; tile them with video/render/contact.py');
	} else if (mode === 'film') {
		const workers = Number(args[0] ?? 4);
		const fps = timeline.fps;
		const total = Math.round(timeline.duration * fps);
		const from = Number(args[1] ?? 0);
		const to = Number(args[2] ?? total);
		const chunks = resolve(OUT, from === 0 && to === total ? 'chunks' : `chunks_${from}_${to}`);
		// Keep an existing chunk directory intact; each completed chunk is overwritten explicitly.
		await mkdir(chunks, { recursive: true });
		const per = Math.ceil((to - from) / workers);
		const t0 = Date.now();
		let done = 0;
		const jobs = Array.from({ length: workers }, async (_, w) => {
			const a = from + w * per,
				b = Math.min(to, a + per);
			if (a >= b) return null;
			const page = await open(browser, port);
			const file = resolve(chunks, `c${String(w).padStart(2, '0')}.mp4`);
			const ff = spawn(
				'nice',
				[
					'-n',
					'10',
					'ffmpeg',
					'-v',
					'error',
					'-y',
					'-f',
					'image2pipe',
					'-framerate',
					String(fps),
					'-c:v',
					'png',
					'-i',
					'-',
					'-c:v',
					'libx264',
					'-preset',
					'fast',
					'-crf',
					'16',
					'-pix_fmt',
					'yuv420p',
					'-r',
					String(fps),
					file
				],
				{ stdio: ['pipe', 'inherit', 'inherit'] }
			);
			for (let f = a; f < b; f++) {
				await page.evaluate((x) => window.film.seek(x), f / fps);
				const png = Buffer.from(
					await page.evaluate(
						() => document.getElementById('film').toDataURL('image/png').split(',')[1]
					),
					'base64'
				);
				if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
				done++;
				if (done % 300 === 0) {
					const s = (Date.now() - t0) / 1000;
					console.log(
						`${done}/${to - from} frames, ${s.toFixed(0)} s, ~${((s / done) * (to - from - done)).toFixed(0)} s left`
					);
				}
			}
			ff.stdin.end();
			await new Promise((r, j) =>
				ff.on('close', (code) => (code ? j(new Error(`ffmpeg exited ${code}`)) : r()))
			);
			await page.close();
			return file;
		});
		const files = (await Promise.all(jobs)).filter(Boolean);
		const list = resolve(chunks, 'list.txt');
		await writeFile(list, files.map((f) => `file '${f}'`).join('\n'));
		const out = resolve(
			OUT,
			from === 0 && to === total ? 'film_picture.mp4' : `film_picture_${from}_${to}.mp4`
		);
		await new Promise((r, j) =>
			spawn(
				'ffmpeg',
				['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out],
				{ stdio: 'inherit' }
			).on('close', (c) => (c ? j(new Error('concat')) : r()))
		);
		console.log(`wrote ${out} (${to - from} frames) in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
	}
} finally {
	await browser.close();
	server.close();
}
void existsSync;
