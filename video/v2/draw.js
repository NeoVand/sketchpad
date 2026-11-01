/** Film drawing primitives. All coordinates are in the delivered 1920 × 1080 frame. */
export const C = {
	ink: '#1f2a44',
	soft: '#4c5b78',
	mist: '#bac5d9',
	tint: '#f2f5fb',
	rose: '#d6336c',
	cobalt: '#2557a7'
};
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const p = (t, a, b) => clamp((t - a) / (b - a));
export const ease = (v) => v * v * (3 - 2 * v);
export const mix = (a, b, t) => a + (b - a) * t;
export const canvas = document.getElementById('film');
export const g = canvas.getContext('2d', { alpha: false });
const cache = new Map();
export async function img(src) {
	if (cache.size > 12 && !cache.has(src)) cache.delete(cache.keys().next().value);
	if (!cache.has(src))
		cache.set(
			src,
			new Promise((resolve, reject) => {
				const im = new Image();
				im.onload = () => resolve(im);
				im.onerror = () => reject(Error(`Missing film asset: ${src}`));
				im.src = src;
			})
		);
	return cache.get(src);
}
export function text(s, x, y, size = 36, color = C.ink, opts = {}) {
	g.save();
	g.fillStyle = color;
	g.font = `${opts.weight || 400} ${size}px "${opts.mono ? 'Geist Mono' : opts.serif ? 'Source Serif' : 'Geist'}"`;
	g.textAlign = opts.align || 'left';
	g.textBaseline = 'top';
	if (window.filmAudit && g.globalAlpha > 0.05) {
		const m = g.measureText(s),
			tr = g.getTransform();
		let l = x - (opts.align === 'center' ? m.width / 2 : opts.align === 'right' ? m.width : 0);
		const left = l * tr.a + tr.e,
			right = (l + m.width) * tr.a + tr.e;
		if (left < 75 || right > 1845) window.filmAudit.push({ s, left, right, y });
	}
	g.fillText(s, x, y);
	g.restore();
}
export function lines(s, x, y, w, size = 36, color = C.ink, lineHeight = 1.35, opts = {}) {
	g.save();
	g.font = `${opts.weight || 400} ${size}px "${opts.serif ? 'Source Serif' : 'Geist'}"`;
	let yy = y;
	for (const paragraph of s.split('\n')) {
		let row = '';
		for (const word of paragraph.split(' ')) {
			const next = row ? row + ' ' + word : word;
			if (row && g.measureText(next).width > w) {
				text(row, x, yy, size, color, opts);
				yy += size * lineHeight;
				row = word;
			} else row = next;
		}
		if (row) text(row, x, yy, size, color, opts);
		yy += size * lineHeight;
	}
	g.restore();
	return yy;
}
export function line(x1, y1, x2, y2, color = C.mist, width = 2, progress = 1) {
	g.save();
	g.strokeStyle = color;
	g.lineWidth = width;
	g.beginPath();
	g.moveTo(x1, y1);
	g.lineTo(mix(x1, x2, progress), mix(y1, y2, progress));
	g.stroke();
	g.restore();
}
export function rect(x, y, w, h, color = C.tint) {
	g.fillStyle = color;
	g.fillRect(x, y, w, h);
}
export function ring(x, y, w, h, color = C.rose, width = 3) {
	g.strokeStyle = color;
	g.lineWidth = width;
	g.strokeRect(x, y, w, h);
}
export function dot(x, y, r, color = C.rose) {
	g.fillStyle = color;
	g.beginPath();
	g.arc(x, y, r, 0, Math.PI * 2);
	g.fill();
}
export function alpha(a, fn) {
	g.save();
	g.globalAlpha *= clamp(a);
	fn();
	g.restore();
}
export function transform(x, y, s, fn) {
	g.save();
	g.translate(x, y);
	g.scale(s, s);
	fn();
	g.restore();
}
export function arrow(x1, y1, x2, y2, color = C.rose, u = 1) {
	u = ease(clamp(u));
	line(x1, y1, x2, y2, color, 3, u);
	if (u === 1) {
		const a = Math.atan2(y2 - y1, x2 - x1);
		line(x2, y2, x2 - 12 * Math.cos(a - 0.4), y2 - 12 * Math.sin(a - 0.4), color, 3);
		line(x2, y2, x2 - 12 * Math.cos(a + 0.4), y2 - 12 * Math.sin(a + 0.4), color, 3);
	}
}
export function heading(k, title, sub = '') {
	text(k, 100, 64, 30, C.rose);
	text(title, 100, 137, 62, C.ink, { serif: true });
	if (sub) text(sub, 100, 223, 34, C.soft);
}
export function footer(s, source = '') {
	lines(s, 100, 910, 1720, 34, C.soft, 1.3);
	if (source) text(source, 100, 1020, 22, C.soft);
}
export function imageCrop(im, crop, x, y, w, h) {
	const [sx, sy, sw, sh] = crop;
	g.drawImage(im, sx, sy, sw, sh, x, y, w, h);
}
export async function capture(name, index, crop, x, y, w, h) {
	const im = await img(
		`/video/out/${name === 'calc' ? 'v2/capture' : 'capture'}/${name}/${String(index).padStart(5, '0')}.jpg`
	);
	imageCrop(im, crop || [0, 0, im.width, im.height], x, y, w, h);
}
export function scoreColor(m) {
	const k = clamp(m / 20);
	return `rgb(${Math.round(mix(251, 158, k))},${Math.round(mix(227, 31, k))},${Math.round(mix(235, 75, k))})`;
}
