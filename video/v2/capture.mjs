/**
 * Frame-by-frame capture of the live demo (https://neovand.github.io/sketchpad/demo) in its Recorded mode: the page
 * plays the published model's recorded runs, so no model is loaded and the GPU is not used for inference.
 *
 *     node video/v2/capture.mjs calc      (from the repository root; all clips by default)
 *
 * The page's clock is Playwright's fake clock and every Web Animation is stepped by hand, so each frame is exactly
 * 1/60 s of page time later than the one before (times `speed`), however long a screenshot takes: a true 60 fps
 * capture. The recording is answered from the page's worker, whose timers the fake clock does not reach; so frames
 * are taken at a fixed real cadence (REAL ms apart) and the worker's setTimeout is scaled by REAL / (page ms per
 * frame), which keeps the recorded pace in step with the page. Frames are JPEG (quality 93) at device scale 2, in
 * video/out/v2/capture/<clip>/NNNNN.jpg, with a manifest.
 */
import { chromium } from 'playwright';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../out/v2/capture');
const URL = 'https://neovand.github.io/sketchpad/demo';
export const VIEW = { width: 1360, height: 850, scale: 2 };
/** real milliseconds between frames */
const REAL = 40;

/** each clip: which tab, how far the page is scrolled, how long (film seconds) and how fast page time runs */
const CLIPS = {
	machine: { tab: null, scroll: 0, seconds: 9, speed: 0.5 },
	calc: { tab: 'calc', scroll: 0, seconds: 12, speed: 0.6 },
	algebra: { tab: 'algebra', scroll: 0, seconds: 12, speed: 2 },
	chat: { tab: 'chat', scroll: 0, seconds: 9, speed: 1 },
	inside: { tab: null, scroll: 380, seconds: 10, speed: 0.5 }
};

async function capture(browser, name, clip) {
	const dir = resolve(OUT, name);
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	const ctx = await browser.newContext({
		viewport: { width: VIEW.width, height: VIEW.height },
		deviceScaleFactor: VIEW.scale
	});
	const page = await ctx.newPage();
	const dt = (1000 / 60) * clip.speed;
	const K = REAL / dt;
	await page.route(/\/workers\/worker-[^/]*\.js$/, async (route) => {
		const resp = await route.fetch();
		const body = await resp.text();
		const shim = `{const s=self.setTimeout;self.setTimeout=(f,ms,...a)=>s(f,(Number(ms)||0)*${K.toFixed(4)},...a);}\n`;
		await route.fulfill({ response: resp, body: shim + body });
	});
	await page.clock.install({ time: new Date('2026-11-01T12:00:00Z') });
	await page.goto(URL, { waitUntil: 'networkidle' });
	await page.evaluate(() => document.fonts.ready);
	const step = async (ms) => {
		await page.clock.runFor(ms);
		await page.evaluate((d) => {
			for (const a of document.getAnimations()) {
				a.pause();
				a.currentTime = (Number(a.currentTime) || 0) + d;
			}
		}, ms);
	};
	if (clip.tab) {
		// let the machine tab settle, then switch tabs the way a visitor does (a DOM click: Playwright's own click
		// waits on animation frames, which the fake clock holds)
		await step(400);
		await page.evaluate((tab) => {
			const labels = { calc: 'Calculate', algebra: 'Algebra', chat: 'Chat' };
			const b = [...document.querySelectorAll('nav.parts button')].find((x) =>
				x.textContent.includes(labels[tab])
			);
			if (!b) throw new Error(`no tab ${tab}`);
			b.click();
		}, clip.tab);
		// a recording with a derivation waits for its math fonts, which load over the network in real time
		await page.waitForTimeout(1500);
		await page.evaluate(() => document.fonts.ready);
	}
	// The film preview was added after the original capture. Keep future captures framed on
	// the interactive stage at the same vertical position as before that addition.
	const heroOffset = await page.evaluate(() => {
		const hero = document.querySelector('.film-hero');
		return hero?.nextElementSibling
			? hero.nextElementSibling.getBoundingClientRect().top - hero.getBoundingClientRect().top
			: 0;
	});
	if (clip.scroll + heroOffset)
		await page.evaluate((y) => window.scrollTo(0, y), clip.scroll + heroOffset);
	const n = Math.round(clip.seconds * 60);
	const t0 = Date.now();
	let next = performance.now();
	let late = 0;
	for (let i = 0; i < n; i++) {
		await page.screenshot({
			path: resolve(dir, `${String(i).padStart(5, '0')}.jpg`),
			type: 'jpeg',
			quality: 93
		});
		await step(dt);
		next += REAL;
		const wait = next - performance.now();
		if (wait > 0) await new Promise((r) => setTimeout(r, wait));
		else late++;
	}
	if (late) console.log(`${name}: ${late} frames over the ${REAL} ms cadence`);
	await ctx.close();
	console.log(`${name}: ${n} frames in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
	return {
		frames: n,
		width: VIEW.width * VIEW.scale,
		height: VIEW.height * VIEW.scale,
		speed: clip.speed,
		scroll: clip.scroll,
		css: VIEW
	};
}

const want = process.argv.slice(2);
const browser = await chromium.launch({
	args: ['--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=metal']
});
const manifestPath = resolve(OUT, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
for (const [name, clip] of Object.entries(CLIPS)) {
	if (want.length && !want.includes(name)) continue;
	manifest[name] = await capture(browser, name, clip);
	writeFileSync(manifestPath, JSON.stringify(manifest, null, 1));
}
await browser.close();
