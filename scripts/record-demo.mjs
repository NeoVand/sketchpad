/*
 * Record one real run per tab for the demo to open on (src/lib/sketchpad/recording.ts), and write them to
 * static/recordings/<tab>.json.
 *
 * It drives the dev page (`pnpm dev`, port 5190 by default) in Chrome with WebGPU, loads the published model, and
 * makes each run with the page's recorder on: the sheet machine multiplies, Calculate divides, Algebra factors, and the
 * chat answers a word problem with its sheet. Every model call is kept as the page made it (views, outputs, timings,
 * the inside readouts), with the provenance: device, date, model, base and certificate revisions, file fingerprints.
 *
 *   PLAYWRIGHT=/path/to/node_modules/playwright/index.mjs node scripts/record-demo.mjs [base url] [chrome profile dir]
 *
 * Playwright is not a dependency of this repo; point PLAYWRIGHT at any copy (its `chromium` export is used, with the
 * installed Chrome channel). The profile directory keeps the model in the browser's cache between runs. With
 * HF_MIRROR=http://host:port, model files are read from a local mirror laid out as <revision>/<path> instead.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { join } from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT ?? 'playwright');
const BASE = process.argv[2] ?? 'http://127.0.0.1:5190';
const PROFILE = process.argv[3] ?? join(tmpdir(), 'sketchpad-record-profile');
const OUT = new URL('../static/recordings/', import.meta.url);

/** the runs: each tab's input, and how the dev page makes it */
const RUNS = [
	{ tab: 'machine', part: 0, input: { tab: 'machine', op: 'mul', a: '4821', b: '3967' } },
	{ tab: 'calc', part: 1, input: { tab: 'calc', line: '22 ÷ 7 to 10 places' } },
	{
		tab: 'algebra',
		part: 2,
		input: { tab: 'algebra', order: 'factor x^3-6x^2+11x-6', checkMode: 'light' }
	},
	{
		tab: 'chat',
		part: 3,
		input: {
			tab: 'chat',
			question:
				'A stadium has 47 sections of 1,186 seats, and 39,862 tickets were sold. How many seats are empty?',
			gate: 1
		}
	}
];

const ctx = await chromium.launchPersistentContext(PROFILE, {
	channel: 'chrome',
	headless: true,
	viewport: { width: 1440, height: 900 },
	args: ['--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=metal']
});
// optional: serve the model files from a local mirror laid out as <revision>/<path> (no download from Hugging Face)
if (process.env.HF_MIRROR)
	await ctx.route('https://huggingface.co/mohsenvand/sketchpad-0.8b-preview/resolve/**', (route) =>
		route.fulfill({
			status: 302,
			headers: {
				location: `${process.env.HF_MIRROR}/${new URL(route.request().url()).pathname.split('/resolve/')[1]}`,
				'access-control-allow-origin': '*'
			}
		})
	);
const page = ctx.pages()[0] ?? (await ctx.newPage());
const until = (fn, arg, timeout = 900000) =>
	page.waitForFunction(fn, arg, { timeout, polling: 200 });

await page.goto(`${BASE}/demo#algebra`);
await until(() => globalThis.sketchpad && sketchpad.gpuOk !== null);
await page.evaluate(() => sketchpad.stopPlayback());
await page
	.getByRole('button', { name: /^Load the model/ })
	.first()
	.click();
await until(() => sketchpad.canCalc && !sketchpad.certifying && !sketchpad.replaying);
mkdirSync(OUT, { recursive: true });

for (const run of RUNS) {
	await page.locator('.parts .part').nth(run.part).click();
	await page.waitForTimeout(800);
	await until(() => !sketchpad.running && !sketchpad.certifying && !sketchpad.replaying);
	const rec = await page.evaluate(async (input) => {
		sketchpad.startRecording();
		if (input.tab === 'machine') {
			await sketchpad.setOp(input.op);
			await sketchpad.run(input.a, input.b);
		} else if (input.tab === 'calc') await sketchpad.runCalc(input.line);
		else if (input.tab === 'algebra') {
			sketchpad.checkMode = input.checkMode;
			await sketchpad.runAlgebra(input.order);
		} else {
			sketchpad.chatGate = input.gate;
			await sketchpad.ask(input.question);
		}
		return sketchpad.finishRecording(input);
	}, run.input);
	if (!rec) throw new Error(`no recording for ${run.tab}`);
	// the machine, which the browser does not name (WebGPU says only "Apple metal-3")
	rec.provenance = { machine: cpus()[0].model, ...rec.provenance };
	const text = JSON.stringify(rec);
	writeFileSync(new URL(`${run.tab}.json`, OUT), text);
	console.log(
		run.tab,
		`${(text.length / 1024).toFixed(0)} KB`,
		rec.calls.length,
		'calls',
		rec.result.lines
	);
}
await ctx.close();
