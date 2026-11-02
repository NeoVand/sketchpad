/** V3: v1's motion, sheet, sprites, palette and grid, extended into one question-led film.
 * No v2 slide scene is imported. Every frame is a deterministic function of the edit time.
 */
import { h, st, C, ep, prog, lerp, clamp, mix } from '../film/lib.js';
import { makeGrid } from '../film/grid.js';
import idea, { drawStrip, spritesReady } from './idea.js';
import silent from './silent.js';
const [TL, D, manifest] = await Promise.all([
	fetch('./timeline.json').then((r) => r.json()),
	fetch('../film/data/film.json').then((r) => r.json()),
	fetch('../out/v3/capture/manifest.json').then((r) => r.json())
]);
const S = Object.fromEntries(TL.scenes.map((s) => [s.id, s]));
const N = Object.fromEntries(TL.narration.map((n) => [n.id, n]));
const at = (id) => N[id].at;
const stage = document.getElementById('stage');
const silentRoot = h('div', { class: 'abs', style: { inset: '0' } }, stage);
const ideaRoot = h('div', { class: 'abs', style: { inset: '0' } }, stage);
const pending = new Set();
const context = { manifest, wait: (img) => pending.add(img.decode()) };
const updateSilent = silent(silentRoot, D, context, S.silent);
const updateIdea = idea(ideaRoot, D, context, { start: 0 });
const cv = h('canvas', { width: 1920, height: 1080, class: 'abs', style: { inset: '0' } }, stage);
const g = cv.getContext('2d');
const gridRoot = h('div', { style: { display: 'none' } }, stage);
const grid = makeGrid(gridRoot, D, { x0: 245, y0: 300, c: 10.5 });
// Second recorded view: ADD(blank carry, product 7, blank result); ADD row 0, column 7.
const slot = grid.cells.find((q) => q.name === 'ADD' && q.r === 0 && q.c === 7);
const strip = document.createElement('canvas');
strip.width = 32;
strip.height = 96;
await spritesReady();
drawStrip(strip, D.mul.ticks[0].view);
const gridStrip = document.createElement('canvas');
gridStrip.width = 32;
gridStrip.height = 96;
drawStrip(gridStrip, D.mul.ticks[1].view);
const weakStrip = document.createElement('canvas');
weakStrip.width = 32;
weakStrip.height = 96;
drawStrip(weakStrip, [' ', '6', '7']);
const cache = new Map();
async function frame(name, f) {
	const m = manifest[name];
	if (!m) throw Error('Missing capture ' + name);
	f = clamp(Math.round(f), 0, m.frames - 1);
	const key = name + '/' + f;
	if (!cache.has(key)) {
		const im = new Image();
		im.src = `/video/out/v3/capture/${name}/${String(f).padStart(5, '0')}.jpg`;
		cache.set(key, im);
		await im.decode();
		if (cache.size > 20) cache.delete(cache.keys().next().value);
	}
	const im = cache.get(key);
	if (!im.complete) await im.decode();
	return im;
}
const text = (s, x, y, size = 30, color = C.ink, align = 'left', font = 'Geist') => {
	g.font = `${size}px "${font}"`;
	g.fillStyle = color;
	g.textAlign = align;
	g.textBaseline = 'middle';
	g.fillText(s, x, y);
};
const box = (x, y, w, h, color = C.tint, r = 12) => {
	g.fillStyle = color;
	g.beginPath();
	g.roundRect(x, y, w, h, r);
	g.fill();
};
function line(x1, y1, x2, y2, u = 1, color = C.mist, width = 2, arrow = false) {
	if (u <= 0) return;
	g.strokeStyle = color;
	g.lineWidth = width;
	g.beginPath();
	g.moveTo(x1, y1);
	g.lineTo(lerp(x1, x2, u), lerp(y1, y2, u));
	g.stroke();
	if (arrow && u > 0.995) {
		const a = Math.atan2(y2 - y1, x2 - x1);
		g.beginPath();
		g.moveTo(x2 - 10 * Math.cos(a - 0.45), y2 - 10 * Math.sin(a - 0.45));
		g.lineTo(x2, y2);
		g.lineTo(x2 - 10 * Math.cos(a + 0.45), y2 - 10 * Math.sin(a + 0.45));
		g.stroke();
	}
}
function alpha(a, fn) {
	if (a <= 0) return;
	g.save();
	g.globalAlpha *= clamp(a);
	fn();
	g.restore();
}
function stripAt(x, y, w = 96, a = 1, which = strip) {
	alpha(a, () => {
		g.imageSmoothingEnabled = false;
		g.drawImage(which, x, y, w, w * 3);
		g.strokeStyle = C.rose;
		g.lineWidth = 2;
		g.strokeRect(x, y, w, w * 3);
		g.imageSmoothingEnabled = true;
	});
}
function model(x = 1120, y = 320, w = 340, h = 280, p = 0, a = 1, addon = 0) {
	alpha(a, () => {
		for (let i = 0; i < 24; i++) {
			const d = p * 26 - i;
			box(
				x + (i * w) / 24,
				y,
				w / 24 - 4,
				h,
				mix(i % 4 === 3 ? C.soft : C.bar, C.rose, Math.exp((-d * d) / 4)),
				2
			);
		}
		if (addon > 0) {
			line(x, y + h + 36, x + w, y + h + 36, addon, C.rose, 6);
			text('~10 million added weights', x + w / 2, y + h + 80, 24, C.rose, 'center');
		}
	});
}
function caption(s, t, a, b, y = 900) {
	alpha(ep(t, a, a + 0.5) * (b === undefined ? 1 : 1 - ep(t, b - 0.5, b)), () =>
		text(s, 960, y, 27, C.soft, 'center')
	);
}
function mapTime(t, knots) {
	if (t <= knots[0][0]) return knots[0][1];
	for (let i = 1; i < knots.length; i++)
		if (t <= knots[i][0])
			return lerp(knots[i - 1][1], knots[i][1], prog(t, knots[i - 1][0], knots[i][0]));
	return knots.at(-1)[1];
}
function simpleSheet(x, y, w = 600, progress = 0) {
	box(x, y, w, 330, C.tint);
	const rows = ['        4821', '      × 3967', '', '    33747   ', '   19124907'];
	for (let r = 0; r < rows.length; r++) {
		const str = r < 2 ? rows[r] : rows[r].slice(0, Math.floor(rows[r].length * progress));
		text(str, x + w - 45, y + 55 + r * 55, 32, r < 2 ? C.ink : C.rose, 'right', 'Geist Mono');
	}
	line(x + 70, y + 145, x + w - 35, y + 145, 1, C.mist);
}
function gridDraw(t, start, check = 0, opacity = 1) {
	grid.draw((q, i) => {
		const delay = (q.y - 300) / 500 + (q.x - 245) / 1400;
		const v = ep(t, start + delay, start + delay + 1.2);
		return {
			x: q.x,
			y: q.y + (1 - v) * 30,
			color: check > i / 2446 ? q.color : C.bar,
			a: v * opacity,
			s: 1
		};
	});
	g.drawImage(grid.canvas, 0, 0);
}
function scorePair(t, u, real = false) {
	const near = real ? 1 : Math.sin(u * 1.7);
	const yy = real ? 375 : 425 - near * 14;
	const yw = real ? 575 : 430 + near * 14;
	box(350, 280, 260, 410, C.tint);
	stripAt(432, 340, 86, 1, real ? weakStrip : strip);
	text(real ? 'Weakest checked view' : 'Illustration', 480, 740, 26, C.soft, 'center');
	line(820, 760, 820, 270, ep(u, 0, 0.8), C.mist);
	line(820, yy, 1240, yy, ep(u, 0.2, 1.1), C.rose, 5);
	line(820, yw, 1170, yw, ep(u, 0.5, 1.4), C.cobalt, 5);
	text('right digit', 1270, real ? yy : 320, 28, C.rose);
	text('strongest wrong digit', 1200, real ? yw : 570, 28, C.cobalt);
	if (!real) {
		line(1240, yy, 1300, 350, 1, C.rose, 1.5);
		line(1170, yw, 1250, 535, 1, C.cobalt, 1.5);
	}
	if (real) {
		line(760, yw, 760, yy, ep(u, 1, 2), C.rose, 3, true);
		alpha(ep(u, 2, 2.5), () => text('margin', 720, 475, 26, C.rose, 'right'));
	}
}
function proofTrace(t, start, history = false) {
	const u = t - start;
	const x0 = 300,
		dx = 178;
	for (let row = 0; row < 2; row++) {
		const y = 390 + row * 220;
		text(row ? 'reference' : 'model', 190, y, 26, row ? C.cobalt : C.rose, 'right');
		for (let i = 0; i < 8; i++) {
			const x = x0 + i * dx;
			const v = ep(u, i * 0.45, i * 0.45 + 0.6);
			alpha(v, () => {
				box(x, y - 38, 86, 76, row ? C.cobaltL : C.roseL, 7);
				text(D.mul.ticks[i].out[0], x + 43, y, 36, row ? C.cobalt : C.rose, 'center', 'Geist Mono');
			});
			if (i < 7)
				line(
					x + 86,
					y,
					x + dx - 12,
					y,
					ep(u, i * 0.45 + 0.4, i * 0.45 + 0.9),
					row ? C.cobalt : C.rose,
					2,
					true
				);
		}
		const pos = x0 + ((u * 0.7) % 7) * dx;
		box(pos, y + 54, 34, 4, row ? C.cobalt : C.rose, 2);
	}
	alpha(ep(u, 3, 4), () => text('same write → same next view', 960, 760, 29, C.ink, 'center'));
	if (!history) caption('Proof checked in Lean', t, at('N19') - 0.65, undefined, 840);
}
function gateDrawing(t, start) {
	const u = t - start;
	const off = ep(t, at('N34') + 3, at('N34') + 4);
	const back = ep(t, at('N35') - 1.4, at('N35') - 0.7);
	const value = 1 - off + back;
	model(790, 290, 430, 260, (u * 0.16) % 1, 1, 0);
	line(550, 420, 790, 420, ep(u, 0, 0.6), C.cobalt, 4, true);
	line(1220, 420, 1500, 420, ep(u, 0.6, 1.2), C.cobalt, 4, true);
	text('original model', 1005, 240, 28, C.soft, 'center');
	alpha(value, () => {
		line(790, 640, 1220, 640, 1, C.rose, 6);
		line(1010, 640, 1010, 565, 1, C.rose, 3, true);
	});
	text('sheet add-on', 1005, 690, 28, C.rose, 'center');
	line(360, 590, 560, 590, 1, C.mist, 4);
	box(350 + 200 * value, 575, 26, 30, C.rose, 12);
	text(value < 0.05 ? '0' : '1', 460, 660, 44, C.rose, 'center', 'Geist Mono');
	text('gate', 460, 710, 26, C.soft, 'center');
	alpha(off * (1 - back), () =>
		text('identical to original · bit for bit', 960, 810, 33, C.ink, 'center')
	);
	if (back > 0) {
		alpha(back, () => {
			const gap = ep(t, at('N35') + 0.8, at('N35') + 2);
			line(1370, 670, 1370, 780, 1, C.mist);
			line(1300, 680, 1440, 680, 1, C.cobalt, 5);
			line(1300, 680 + gap * 78, 1440, 680 + gap * 78, 1, C.rose, 5);
			text('−5.8 points', 1510, 720, 35, C.rose, 'center');
			text('fresh word problems', 1420, 835, 25, C.soft, 'center');
		});
	}
}
async function captureDraw(name, t, a, b, options = {}) {
	const m = manifest[name];
	const f = prog(t, a, b) * (m.frames - 1);
	const im = await frame(name, f);
	const crop =
		options.crop ??
		(name === 'machine' || name === 'calc'
			? [60, 60, 1140, 470]
			: [50, 0, 1500, name === 'algebra' ? 990 : 760]);
	const width = options.width ?? 1640;
	const height = (width * crop[3]) / crop[2];
	const x = options.x ?? (1920 - width) / 2;
	const y = options.y ?? (1080 - height) / 2;
	g.drawImage(im, ...crop, x, y, width, height);
	text(
		'Recorded' + (b - a < (m.frames / 60) * m.speed ? ' · accelerated' : ''),
		x,
		y - 28,
		23,
		C.soft
	);
	return { x, y, width, height };
}
function training(t) {
	const a = at('N33') - 0.7;
	const u = t - a;
	const v = ep(u, 0, 1);
	alpha(v, () => {
		box(250, 330, 290, 155, C.tint);
		text('its own reply', 395, 405, 28, C.ink, 'center');
		model(850, 300, 330, 220, (u * 0.2) % 1);
		text('original model', 1015, 265, 26, C.soft, 'center');
		line(540, 405, 820, 405, ep(u, 1, 2), C.cobalt, 3, true);
		const v1 = ep(u, 1, 2);
		box(lerp(550, 790, v1), 390, 32, 30, C.rose, 4);
		line(1015, 560, 540, 560, ep(u, 2.4, 3.4), C.rose, 3, true);
		text('feedback to the add-on', 760, 610, 26, C.rose, 'center');
		if (u > 4) {
			for (let i = 0; i < 5; i++) {
				const x = 320 + i * 240;
				const p = ep(u, 4 + i * 0.18, 5.5 + i * 0.18);
				box(x, lerp(720, 780, p), 150, 60, i === 1 || i === 3 ? C.roseL : C.bar, 8);
				alpha(p, () =>
					text(
						i === 1 || i === 3 ? '✓' : '·',
						x + 75,
						810,
						36,
						i === 1 || i === 3 ? C.rose : C.soft,
						'center'
					)
				);
			}
			text('reward correct answers', 960, 930, 27, C.soft, 'center');
		}
	});
}
function inside(t) {
	const a = S.inside.start,
		u = t - a;
	const depth = mapTime(t, [
		[a, 0],
		[at('N37') - 0.7, 8],
		[at('N38') - 0.7, 15],
		[at('N38') + 2, 19],
		[at('N38') + 2.6, 20],
		[S.inside.end, 24]
	]);
	stripAt(180, 360, 80);
	line(260, 480, 420, 480, ep(u, 0, 0.8), C.mist, 3, true);
	const x = 430,
		w = 1120;
	for (let i = 0; i < 24; i++) {
		const xi = x + (i * w) / 24;
		box(
			xi,
			330,
			32,
			300,
			i + 1 === Math.floor(depth) ? C.rose : (i + 1) % 4 === 0 ? C.soft : C.bar,
			3
		);
		if ([1, 15, 19, 20, 24].includes(i + 1))
			text(String(i + 1), xi + 16, 680, 26, C.soft, 'center');
	}
	text('processing layer', 990, 745, 25, C.soft, 'center');
	const px = x + (clamp(depth - 1, 0, 23) * w) / 24 + 16;
	line(px, 235, px, 325, ep(t, at('N37') - 0.6, at('N37') + 0.3), C.rose, 4, true);
	text('push toward another digit', px, 195, 28, C.rose, 'center');
	text(depth < 20 ? '7' : '4', 1670, 480, 100, depth < 20 ? C.ink : C.rose, 'center', 'Geist Mono');
	line(1550, 480, 1610, 480, 1, C.mist, 3, true);
	const changed = depth >= 20;
	alpha(ep(t, at('N38') - 0.6, at('N38') + 0.1), () => {
		text(
			changed ? '80 / 80 changed' : '0 / 80 changed',
			960,
			855,
			48,
			changed ? C.rose : C.cobalt,
			'center'
		);
		text('Arithmetic adapter · multiplication · 80 trials', 960, 935, 25, C.soft, 'center');
	});
}
async function draw(t) {
	g.clearRect(0, 0, 1920, 1080);
	st(cv, 'opacity', '1');
	st(ideaRoot, 'opacity', '1');
	st(silentRoot, 'opacity', '1');
	st(silentRoot, 'display', 'none');
	st(ideaRoot, 'display', 'none');
	const sc = TL.scenes.find((s) => t >= s.start && t < s.end) ?? TL.scenes.at(-1);
	const u = t - sc.start;
	if (!['silent', 'idea', 'grid'].includes(sc.id)) {
		g.fillStyle = '#fff';
		g.fillRect(0, 0, 1920, 1080);
	}
	if (sc.id === 'silent') {
		st(silentRoot, 'display', 'block');
		const tm = mapTime(t, [
			[0, 0],
			[at('N02') - 0.6, 11.5],
			[at('N03') - 0.6, 12.7],
			[S.silent.end, 13.4]
		]);
		updateSilent(tm);
		// The comparison is the film's overlay; the original answer had no warning.
		alpha(ep(t, at('N03') - 0.6, at('N03') + 0.2), () =>
			text('What about the next answer?', 960, 810, 39, C.ink, 'center', 'Source Serif')
		);
	} else if (sc.id === 'title') {
		const p = ep(u, 0, 0.55),
			out = ep(t, sc.end - 0.55, sc.end);
		alpha(p, () =>
			text('Sketchpad', 960, lerp(550, 490, p) - out * 110, 118, C.rose, 'center', 'Source Serif')
		);
	} else if (sc.id === 'montage') {
		const b = [sc.start, sc.start + 5, sc.start + 10, sc.start + 16, sc.end];
		const names = ['machine', 'calc', 'algebra', 'chat'];
		let j = b.findIndex((a, i) => i < 4 && t >= a && t < b[i + 1]);
		if (j < 0) j = 3;
		const blend = j > 0 ? ep(t, b[j], b[j] + 0.35) : 1;
		if (blend < 1) {
			g.save();
			g.globalAlpha = 1 - blend;
			await captureDraw(names[j - 1], b[j] - 1 / 60, b[j - 1], b[j]);
			g.restore();
		}
		g.save();
		g.globalAlpha = blend;
		await captureDraw(names[j], t, b[j], b[j + 1]);
		g.restore();
		// A horizontal sheet rule travels through each cut, maintaining direction.
		line(170, 990, 1750, 990, clamp((u + 0.5) / 1), C.mist, 1.5);
	} else if (sc.id === 'idea') {
		st(ideaRoot, 'display', 'block');
		const tm = mapTime(t, [
			[sc.start, 0],
			[at('N08') - 0.6, 2],
			[at('N09') - 0.7, 5.9],
			[at('N10') - 0.7, 9.9],
			[at('N11') - 0.7, 10],
			[at('N12') - 0.8, 11.2],
			[sc.end, 12.15]
		]);
		updateIdea(tm);
		alpha(ep(t, at('N12') - 0.8, at('N12') + 0.3), () => {
			line(1160, 635, 1497, 635, ep(t, at('N12') - 0.8, at('N12') + 0.2), C.rose, 5);
		});
	} else if (sc.id === 'grid') {
		// Keep the lifted three-cell sprite from v1's idea at exactly its previous position.
		const travel = ep(t, at('N15') - 2.5, at('N15') - 0.7);
		const gx = lerp(920, slot.x, travel),
			gy = lerp(306, slot.y, travel),
			gw = lerp(96, 9.3, travel);
		st(ideaRoot, 'display', 'block');
		st(ideaRoot, 'opacity', String(1 - ep(u, 0.1, 3)));
		updateIdea(12.15);
		gridDraw(t, at('N15') - 2, ep(t, at('N16') - 0.7, sc.end - 0.5));
		stripAt(gx, gy, gw, 1 - travel * 0.35, gridStrip);
		alpha(ep(t, at('N15') - 0.7, at('N15') + 0.1), () =>
			text('2,446 views', 960, 760, 76, C.ink, 'center', 'Source Serif')
		);
	} else if (sc.id === 'proof') {
		const v = ep(u, 0, 1.4);
		alpha(1 - v, () => {
			gridDraw(t, sc.start - 10, 1);
			text('2,446 views', 960, 760, 76, C.ink, 'center', 'Source Serif');
		});
		alpha(v, () => proofTrace(t, sc.start - 0.5));
		// The selected checked view returns to the first step rather than a new object appearing.
		stripAt(
			lerp(slot.x, 300, v),
			lerp(slot.y, 350, v),
			lerp(9.3, 28, v),
			1 - ep(u, 1.2, 1.7),
			gridStrip
		);
	} else if (sc.id === 'history') {
		const v = ep(u, 0, 1.1);
		alpha(1 - v, () => proofTrace(t, sc.start - 10, true));
		alpha(v, () => {
			for (let i = 0; i < 7; i++) {
				const show = ep(u, 0.3 + i * 0.6, 1 + i * 0.6);
				alpha(show, () => {
					const y = 255 + i * 67;
					for (let j = 0; j <= i; j++)
						box(310 + j * 135, y, 106, 40, j === 6 ? C.rose : C.cobaltL, 5);
					line(
						310 + i * 135 + 106,
						y + 20,
						310 + (i + 1) * 135 - 10,
						y + 20,
						ep(u, i * 0.6 + 0.7, i * 0.6 + 1.1),
						C.cobalt,
						2,
						true
					);
				});
			}
			text('history keeps growing', 1220, 400, 30, C.ink);
			text('finite tests alone', 1220, 455, 25, C.soft);
			stripAt(1330, 550, 52);
			text('the sheet view stays fixed', 1356, 770, 25, C.rose, 'center');
		});
	} else if (sc.id === 'margin') {
		const real = ep(t, at('N23') - 1, at('N23') - 0.5);
		alpha(1 - real, () => scorePair(t, u, false));
		alpha(real, () => scorePair(t, t - at('N23') + 2, true));
	} else if (sc.id === 'record') {
		const transfer = ep(t, at('N25') - 1, at('N25') + 0.4);
		const batch = ep(t, at('N24b') + 4, at('N24b') + 5.5);
		alpha(1 - transfer, () => {
			scorePair(t, 10, true);
			text('1.51', 1470, 740, 44, C.ink, 'center');
			text('half the margin · rounded', 1470, 795, 24, C.soft, 'center');
			if (batch) {
				const d = 72 * batch;
				line(890, 375, 890, 375 + d, 1, C.rose, 4, true);
				line(1020, 575, 1020, 575 - d, 1, C.cobalt, 4, true);
				text('≤ 1.09 per score · tested batches', 960, 890, 27, C.soft, 'center');
			}
		});
		alpha(transfer, () => {
			gridDraw(t, sc.start - 10, 1);
			box(610, 650, 700, 240, '#fff', 12);
			g.strokeStyle = C.mist;
			g.lineWidth = 2;
			g.strokeRect(610, 650, 700, 240);
			text('2,446 / 2,446 checked', 960, 700, 30, C.ink, 'center');
			text('minimum margin', 780, 770, 25, C.soft);
			text('Arithmetic adapter · Apple M4', 960, 850, 25, C.soft, 'center');
			text('↻  full check', 960, 955, 27, C.cobalt, 'center');
		});
		// This is one number moving from the measured gap into the repeatable record.
		text('3.02', lerp(710, 1150, transfer), lerp(545, 770, transfer), 54, C.rose, 'right');
	} else if (sc.id === 'comparison') {
		const v = ep(u, 0, 1);
		alpha(1 - v, () => gridDraw(t, sc.start - 10, 1));
		alpha(v, () => {
			text('220 problems fixed in advance', 960, 120, 34, C.ink, 'center');
			text(
				'sums of 10 to 1,000 digits and products of 2 to 20 digits · exact answers',
				960,
				170,
				23,
				C.soft,
				'center'
			);
			// Sketchpad, then the ten comparison models in the paper's order (Fig. 1c), every bar from the axis outward.
			const x = 560,
				w = 1120,
				top = 232,
				step = 70,
				hgt = 40;
			line(x, top - 18, x, top + step * D.bars.length - 14, ep(u, 0, 0.8), C.mist, 2);
			D.bars.forEach((b, i) => {
				const y = top + i * step;
				const color = i === 0 ? C.rose : i === 1 ? C.cobalt : C.grey;
				const p = ep(t, at('N27') - 0.9 + i * 0.16, at('N27') + 0.6 + i * 0.16);
				const lab = ep(t, at('N27') - 1.2 + i * 0.16, at('N27') - 0.6 + i * 0.16);
				alpha(lab, () => {
					text(b.name, x - 26, y + hgt / 2 - 7, 26, i < 2 ? color : C.ink, 'right');
					text(b.note, x - 26, y + hgt / 2 + 17, 17, C.grey, 'right');
				});
				box(x, y, ((w * b.exact) / 220) * p, hgt, color, 2);
				if (p > 0.85)
					alpha(ep(p, 0.85, 1), () =>
						text(
							String(b.exact),
							x + ((w * b.exact) / 220) * p + 18,
							y + hgt / 2,
							i === 0 ? 34 : 28,
							color
						)
					);
			});
		});
	} else if (sc.id === 'algebra') {
		await captureDraw('algebra', t, sc.start, sc.end - 2, { width: 1520 });
		if (t >= at('N30') - 0.7) {
			g.strokeStyle = C.mist;
			g.lineWidth = 2;
			g.strokeRect(165, 90, 1590, 890);
			caption('ordinary code · outside proof', t, at('N30') - 0.7, undefined, 1020);
		}
	} else if (sc.id === 'chat') {
		const trainingIn = ep(t, at('N33') - 1, at('N33') - 0.5);
		if (trainingIn < 1) {
			g.save();
			g.globalAlpha = 1 - trainingIn;
			await captureDraw('chat', t, sc.start, at('N33') - 0.5, { width: 1680 });
			g.restore();
		}
		training(t);
	} else if (sc.id === 'gate') {
		gateDrawing(t, sc.start);
	} else if (sc.id === 'inside') {
		inside(t);
	} else if (sc.id === 'close') {
		const finish = ep(t, at('N41') - 0.8, at('N41') + 0.3);
		if (finish < 1) {
			g.save();
			g.globalAlpha = 1 - finish;
			await captureDraw('machine', t, sc.start, at('N40') + 3, { width: 1640 });
			g.restore();
		}
		alpha(ep(t, at('N40') - 0.7, at('N40') + 0.1) * (1 - finish), () => {
			text('↻ weakest views on your device', 960, 830, 29, C.rose, 'center');
			text('full device check available', 960, 885, 25, C.soft, 'center');
		});
		alpha(finish, () => {
			text('Sketchpad', 960, 310, 104, C.rose, 'center', 'Source Serif');
			simpleSheet(630, 430, 660, 1);
			const links = [
				['Paper / demo', 'neovand.github.io/sketchpad'],
				['Code', 'github.com/NeoVand/sketchpad'],
				['Model', 'huggingface.co/mohsenvand/sketchpad-0.8b-preview']
			];
			links.forEach((l, i) =>
				alpha(ep(t, at('N41') + 0.4 + i * 0.55, at('N41') + 1 + i * 0.55), () => {
					text(l[0], 480, 830 + i * 58, 25, C.soft, 'right');
					text(l[1], 520, 830 + i * 58, 28, C.ink);
				})
			);
		});
	}
	// Source-to-target bridge strokes persist over cuts; no centred scale animations.
	if (
		[
			'grid',
			'proof',
			'history',
			'margin',
			'record',
			'comparison',
			'algebra',
			'chat',
			'gate',
			'inside',
			'close'
		].includes(sc.id)
	) {
		const v = ep(u, 0, 0.7);
		alpha(1 - v, () => line(170, 990, 1750, 990, 1, C.mist, 1.5));
	}
}
const transitionFrames = new Map();
async function seek(t) {
	await document.fonts.ready;
	const i = TL.scenes.findIndex((s) => t >= s.start && t < s.end),
		sc = TL.scenes[i];
	const transition = i > 0 && t - sc.start < 0.65 && !['grid', 'proof', 'record'].includes(sc.id);
	let prevImage = null;
	const prev = i > 0 ? TL.scenes[i - 1] : null;
	if (transition && !['silent', 'idea'].includes(prev.id)) {
		if (!transitionFrames.has(sc.id)) {
			await draw(sc.start - 1 / 60);
			transitionFrames.set(sc.id, await createImageBitmap(cv));
		}
		prevImage = transitionFrames.get(sc.id);
	}
	await draw(t);
	if (transition) {
		const v = ep(t, sc.start, sc.start + 0.65);
		if (prevImage) alpha(1 - v, () => g.drawImage(prevImage, 0, 0));
		else if (prev.id === 'silent') {
			st(silentRoot, 'display', 'block');
			st(silentRoot, 'opacity', String(1 - v));
			updateSilent(13.4);
			st(cv, 'opacity', String(v));
		}
	}
	while (pending.size) {
		const ps = [...pending];
		pending.clear();
		await Promise.all(ps);
	}
	await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}
window.film = { ready: true, seek, duration: TL.duration, fps: 60 };
await seek(Number(new URLSearchParams(location.search).get('t') ?? 0));
