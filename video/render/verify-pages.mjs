/** Browser checks and review screenshots, after the website media has been copied.
 * node video/render/verify-pages.mjs [demo origin] [homepage origin]
 * No model is loaded. The demo's existing recorded runs exercise its four tabs.
 */
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const [demo = 'http://127.0.0.1:5190', home = 'http://127.0.0.1:5191'] = process.argv.slice(2);
const out = resolve('video/out/review');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
	channel: 'chrome',
	args: ['--enable-gpu', '--use-angle=metal']
});
const report = [];
try {
	for (const width of [1440, 390]) {
		const page = await browser.newPage({
			viewport: { width, height: 1000 },
			reducedMotion: 'reduce'
		});
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		for (const [name, url] of [
			['demo', `${demo}/demo`],
			['film', `${demo}/film`],
			['homepage', home]
		]) {
			console.log('review', name, width);
			await page.goto(url, { waitUntil: 'networkidle' });
			await page.evaluate(() => document.fonts.ready);
			if (name === 'homepage') {
				await page.waitForFunction(() => !document.documentElement.classList.contains('veiled'));
				await page.locator('#work').scrollIntoViewIfNeeded();
			}
			const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
			assert.equal(overflow, false, `${name} horizontal overflow at ${width}px`);
			if (name === 'demo') {
				const v = page.locator('.film-hero video');
				assert.equal(
					await v.evaluate((el) => el.paused),
					true,
					'reduced motion pauses the preview'
				);
				assert.equal(await page.locator('nav.parts button').count(), 4);
			}
			if (name === 'film') {
				await page.locator('video').evaluate((el) => el.load());
				await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
				const duration = await page.locator('video').evaluate((el) => el.duration);
				assert.ok(Math.abs(duration - 149) < 0.1, `film duration ${duration}`);
				assert.equal(await page.locator('track[kind=captions]').count(), 1);
			}
			if (name === 'homepage') {
				const card = page
					.locator('article')
					.filter({ has: page.getByRole('heading', { name: 'Sketchpad', exact: true }) });
				assert.equal(await card.count(), 1);
				assert.equal(await card.locator('.links a').count(), 3);
				await card.screenshot({ path: `${out}/card-${width}.png` });
			}
			await page.screenshot({ path: `${out}/${name}-${width}.png` });
			report.push({ name, width, overflow, errors: [...errors] });
		}
		assert.deepEqual(errors, [], 'no browser exceptions');
		await page.close();
	}
	const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
	await page.goto(`${demo}/demo`, { waitUntil: 'networkidle' });
	for (const label of ['Calculate', 'Algebra', 'Chat', 'The sheet machine']) {
		const tab = page.locator('nav.parts button').filter({ hasText: label });
		await tab.click();
		await page.waitForFunction(
			(label) =>
				[...document.querySelectorAll('nav.parts button')].some(
					(button) =>
						button.textContent.includes(label) && button.getAttribute('aria-current') === 'true'
				),
			label
		);
	}
	const preview = page.locator('.film-hero video');
	await preview.evaluate((el) => el.play());
	await page.waitForFunction(() => document.querySelector('.film-hero video')?.currentTime > 0.1);
	await page.close();
	await writeFile(`${out}/pages.json`, JSON.stringify(report, null, 2));
	console.log(
		'Desktop, mobile, reduced motion, film metadata, card links, preview playback and all four tabs passed.'
	);
} finally {
	await browser.close();
}
