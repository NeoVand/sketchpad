/**
 * The Sketchpad film. Scenes are laid out once; window.film.seek(t) sets every element for time t (seconds) and
 * resolves when the frame is ready to capture (fonts loaded, capture frames decoded).
 */
import { h, inout, prog, E, st } from './lib.js';
import silent from './scenes/silent.js';
import title from './scenes/title.js';
import idea from './scenes/idea.js';
import demo from './scenes/demo.js';
import proof from './scenes/proof.js';
import cert from './scenes/cert.js';
import apps from './scenes/apps.js';
import inside from './scenes/inside.js';
import close from './scenes/close.js';

const MAKERS = { silent, title, idea, demo, proof, cert, apps, inside, close };

const [timeline, data, manifest] = await Promise.all([
	fetch('/video/timeline.json').then((r) => r.json()),
	fetch('/video/film/data/film.json').then((r) => r.json()),
	fetch('/video/out/capture/manifest.json')
		.then((r) => (r.ok ? r.json() : {}))
		.catch(() => ({}))
]);

const stage = document.getElementById('stage');
const pending = new Set();
/** a scene registers the images it changed this frame; seek waits for them */
const ctx = {
	manifest,
	timeline,
	wait(img) {
		if (img.complete && img.naturalWidth) return;
		pending.add(img.decode());
	}
};

let chapterN = 0;
const scenes = timeline.scenes.map((s) => {
	const root = h('div', { class: 'scene', 'data-id': s.id }, stage);
	const update = MAKERS[s.id](root, data, ctx, s);
	let chapter = null;
	if (s.chapter) {
		chapterN++;
		chapter = h('div', { class: 'chapter' }, root, `<b>${chapterN}</b>${s.chapter}`);
	}
	return { ...s, root, update, chapter };
});

const FADE = 0.6;
async function seek(t) {
	for (const s of scenes) {
		const on = t >= s.start && t < s.end;
		st(s.root, 'display', on ? 'block' : 'none');
		if (!on) continue;
		const first = s.start <= 0.001;
		const last = s.end >= timeline.duration - 0.001;
		const a = first ? 1 : E.sine(prog(t, s.start, s.start + FADE));
		const b = last ? 1 : 1 - E.sine(prog(t, s.end - FADE, s.end));
		st(s.root, 'opacity', String(Math.min(a, b)));
		if (s.chapter) {
			const u = inout(t, s.start + 0.5, s.end - 0.2, 0.7, E.o3);
			st(s.chapter, 'opacity', String(u));
			st(s.chapter, 'transform', `translateX(${((1 - u) * -10).toFixed(2)}px)`);
		}
		s.update(t);
	}
	await document.fonts.ready;
	while (pending.size) {
		const all = [...pending];
		pending.clear();
		await Promise.all(all);
	}
	// two animation frames so the paint the screenshot takes is this frame's
	await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

window.film = { seek, duration: timeline.duration, fps: timeline.fps, ready: true };
const q = new URLSearchParams(location.search);
await seek(Number(q.get('t') ?? 0));
