/** Record the actual local demo at 60 frames per second, without loading any model.
 * Both the page and worker clocks advance deterministically. Network/model requests
 * are blocked and recorded inputs are served from this checkout. No event is synthesized.
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
const OUT = resolve('video/out/v3/capture');
mkdirSync(OUT, { recursive: true });
const clips = {
	machine: { tab: null, seconds: 8, speed: 0.7 },
	calc: { tab: 'Calculate', seconds: 10, speed: 0.7 },
	algebra: { tab: 'Algebra', seconds: 34, speed: 1 },
	chat: { tab: 'Chat', seconds: 12, speed: 1 }
};
const b = await chromium.launch({
	args: ['--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=metal']
});
const manifest = existsSync(OUT + '/manifest.json')
	? JSON.parse(readFileSync(OUT + '/manifest.json', 'utf8'))
	: {};
for (const [name, spec] of Object.entries(clips)) {
	if (process.argv.length > 2 && !process.argv.slice(2).includes(name)) continue;
	const dir = OUT + '/' + name;
	mkdirSync(dir, { recursive: true });
	const c = await b.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
	await c.addInitScript(() => {
		const NativeWorker = window.Worker;
		window.__filmWorkers = [];
		window.__filmErrors = [];
		window.__filmMessages = [];
		window.Worker = class extends NativeWorker {
			constructor(...args) {
				super(...args);
				window.__filmWorkers.push(this);
				this.addEventListener('message', (e) => {
					if (!e.data?.__filmAck) {
						window.__filmMessages.push(e.data?.type);
						if (e.data?.type === 'error') window.__filmErrors.push(e.data);
					}
				});
			}
		};
		window.__filmStepWorkers = (ms) =>
			Promise.all(
				window.__filmWorkers.map(
					(w) =>
						new Promise((r) => {
							const listener = (e) => {
								if (e.data?.__filmAck) {
									w.removeEventListener('message', listener);
									r();
								}
							};
							w.addEventListener('message', listener);
							w.postMessage({ __filmTick: ms });
						})
				)
			);
	});
	const p = await c.newPage();
	const requests = [];
	p.on('request', (r) => requests.push(r.url()));
	p.on('pageerror', (e) => {
		throw e;
	});
	await p.route(/\.onnx(?:_data)?(?:\?|$)|\.safetensors(?:\?|$)/, (route) => route.abort());
	await p.route(/\/workers\/worker-[^/]*\.js$/, async (route) => {
		const response = await route.fetch();
		const body = await response.text();
		const shim = `{let now=0,id=0;const timers=new Map();self.setTimeout=(f,ms,...args)=>{const i=++id;timers.set(i,{at:now+(Number(ms)||0),f:()=>f(...args)});return i};self.clearTimeout=i=>timers.delete(i);self.addEventListener('message',async e=>{if(!('__filmTick' in e.data))return;e.stopImmediatePropagation();const end=now+e.data.__filmTick;for(let n=0;n<10000;n++){const first=[...timers.entries()].filter(([,q])=>q.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!first)break;now=first[1].at;timers.delete(first[0]);first[1].f();await Promise.resolve();await Promise.resolve();}now=end;self.postMessage({__filmAck:true});});}\n`;
		await route.fulfill({ response, body: shim + body });
	});
	await p.clock.install({ time: new Date('2026-11-01T12:00:00Z') });
	await p.goto('http://127.0.0.1:4173/demo.html', { waitUntil: 'networkidle' });
	await p.evaluate(() => document.fonts.ready);
	const step = async (ms) => {
		await p.evaluate((d) => window.__filmStepWorkers(d), ms);
		await p.clock.runFor(ms);
		await p.evaluate((d) => {
			for (const a of document.getAnimations()) {
				a.pause();
				a.currentTime = (Number(a.currentTime) || 0) + d;
			}
		}, ms);
	};
	await p.addStyleTag({
		content: `body{background:white!important} body>div>header,.film-hero,main>.head,main>.more,footer{display:none!important} main{max-width:1500px!important;margin:0 auto!important;padding:28px!important} nav.parts{margin-top:0!important}.instruments{display:none!important} .band{margin-top:20px!important}.beats,.chat .examples,.ask .sp-foot{display:none!important}.chat>form,.chat>.model{display:none!important}.deriv-body{max-height:none!important;overflow:visible!important}.deriv{max-height:none!important;overflow:visible!important}.deriv .line{margin:5px 0!important}.deriv .katex{font-size:1.3em!important}.algebra{grid-template-columns:minmax(0,1fr) 340px!important}.chat-band{grid-template-columns:1fr 1.2fr 330px!important} `
	});
	await step(100);
	if (spec.tab) {
		await p.evaluate((label) => {
			const el = [...document.querySelectorAll('nav.parts button')].find((e) =>
				e.textContent.includes(label)
			);
			if (!el) throw Error('missing tab ' + label);
			el.click();
		}, spec.tab);
	}
	for (let i = 0; i < (spec.tab ? 8 : 1); i++) await step(20);
	await p.evaluate(() => document.fonts.ready);
	await p.waitForTimeout(1000);
	await p.screenshot({ path: dir + '/setup.png' });
	writeFileSync(dir + '/setup.html', await p.locator('main').innerHTML());
	writeFileSync(
		dir + '/setup.json',
		JSON.stringify(
			await p.locator('main').evaluate((e) =>
				[...e.children].map((x) => ({
					tag: x.tagName,
					class: x.className,
					box: x.getBoundingClientRect().toJSON(),
					text: x.innerText?.slice(0, 100)
				}))
			),
			null,
			2
		)
	);
	if (process.env.PROBE) {
		console.log(name, await p.locator('body').innerText());
		await c.close();
		continue;
	}
	const frames = Math.round(spec.seconds * 60);
	for (let f = 0; f < frames; f++) {
		await p.screenshot({
			path: dir + '/' + String(f).padStart(5, '0') + '.jpg',
			type: 'jpeg',
			quality: 94
		});
		await step((1000 / 60) * spec.speed);
	}
	const text = await p.locator('main').innerText();
	writeFileSync(dir + '/final.txt', text);
	const errors = await p.evaluate(() => window.__filmErrors);
	if (errors.length) throw Error(JSON.stringify(errors));
	writeFileSync(dir + '/requests.json', JSON.stringify(requests, null, 2));
	const blocked = requests.filter((u) =>
		/\.onnx(?:_data)?(?:[?#]|$)|\.safetensors(?:[?#]|$)/.test(u)
	);
	manifest[name] = {
		frames,
		width: 1600,
		height: 1000,
		fps: 60,
		speed: spec.speed,
		mode: 'Recorded',
		source: 'local production build',
		modelDownloads: 0,
		blockedModelRequests: blocked.length,
		errors,
		sha: 'recordings from checkout',
		finalText: text
	};
	writeFileSync(OUT + '/manifest.json', JSON.stringify(manifest, null, 2));
	console.log(name, frames, 'frames', text.slice(-250));
	await c.close();
}
await b.close();
