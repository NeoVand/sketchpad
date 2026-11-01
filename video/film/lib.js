/** Small helpers for a film whose every frame is a function of t. */

export const C = {
	ink: '#1F2A44',
	soft: '#4C5B78',
	grey: '#7D8BA8',
	mist: '#BAC5D9',
	tint: '#F2F5FB',
	rose: '#D6336C',
	roseL: '#F1A3BC',
	cobalt: '#2557A7',
	cobaltL: '#9DB8E0',
	violet: '#7A5BA8',
	bar: '#DCE3EF'
};

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, u) => a + (b - a) * u;
/** progress of t through [a, b], clamped to [0, 1] */
export const prog = (t, a, b) => clamp((t - a) / (b - a));

export const E = {
	o2: (u) => 1 - (1 - u) * (1 - u),
	o3: (u) => 1 - Math.pow(1 - u, 3),
	o5: (u) => 1 - Math.pow(1 - u, 5),
	i3: (u) => u * u * u,
	io3: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
	io5: (u) => (u < 0.5 ? 16 * u ** 5 : 1 - Math.pow(-2 * u + 2, 5) / 2),
	sine: (u) => -(Math.cos(Math.PI * u) - 1) / 2
};

/** eased progress */
export const ep = (t, a, b, e = E.io3) => e(prog(t, a, b));

/** opacity that comes in over [a, a + d] and goes out over [b - d, b] */
export const inout = (t, a, b, d = 0.5, e = E.io3) =>
	Math.min(e(prog(t, a, a + d)), 1 - e(prog(t, b - d, b)));

/** create an element: h('div', { class: 'x', style: {...} }, parent, html) */
export function h(tag, attrs = {}, parent = null, html = null) {
	const el = document.createElement(tag);
	for (const [k, v] of Object.entries(attrs)) {
		if (k === 'style') Object.assign(el.style, v);
		else if (k === 'class') el.className = v;
		else el.setAttribute(k, v);
	}
	if (html !== null) el.innerHTML = html;
	if (parent) parent.appendChild(el);
	return el;
}

export function svg(tag, attrs = {}, parent = null) {
	const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
	for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
	if (parent) parent.appendChild(el);
	return el;
}

/** set a style only when it changes (thousands of elements are touched per frame) */
export function st(el, prop, value) {
	const key = `_${prop}`;
	if (el[key] === value) return;
	el[key] = value;
	el.style[prop] = value;
}

/** fade and rise: opacity u, translateY (1 - u) * dy */
export function rise(el, u, dy = 14) {
	st(el, 'opacity', String(u));
	st(el, 'transform', `translateY(${((1 - u) * dy).toFixed(2)}px)`);
}

export const fmt = (n) => n.toLocaleString('en-US');

/** a deterministic pseudo-random sequence */
export function rng(seed) {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

const rgbOf = (a) =>
	a.startsWith('#')
		? [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16))
		: a
				.match(/[\d.]+/g)
				.slice(0, 3)
				.map(Number);
/** colour mix of two colours given as #rrggbb or rgb(r,g,b) */
export function mix(a, b, u) {
	const pa = rgbOf(a);
	const pb = rgbOf(b);
	const c = pa.map((x, i) => Math.round(lerp(x, pb[i], clamp(u))));
	return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** the paper's cr_exact colormap (paper/figstyle/palette.py), sampled on [0, 0.86] as Fig. 1b samples it */
const EXACT = ['#FFFFFF', '#FBE3EB', '#F1A3BC', '#E3678F', '#D6336C', '#9E1F4B', '#5E1430'];
export function exactColor(margin, vmax = 20) {
	const x = clamp(margin / vmax) * 0.86 * (EXACT.length - 1);
	const i = Math.min(EXACT.length - 2, Math.floor(x));
	return mix(EXACT[i], EXACT[i + 1], x - i);
}

/**
 * A panel cut from one of the paper's figures (static/figures/*.svg), drawn as a vector image: `crop` is the panel's
 * box in the figure's coordinates at 1600 px width, `width` the displayed width of that box.
 */
export function figurePanel(parent, file, crop, width, { left = 0, top = 0 } = {}) {
	const [x0, y0, x1, y1] = crop;
	const k = width / (x1 - x0);
	const box = h(
		'div',
		{
			class: 'abs',
			style: {
				left: `${left}px`,
				top: `${top}px`,
				width: `${width}px`,
				height: `${(y1 - y0) * k}px`,
				overflow: 'hidden'
			}
		},
		parent
	);
	const img = h(
		'img',
		{
			src: `/static/figures/${file}`,
			style: {
				position: 'absolute',
				width: `${1600 * k}px`,
				left: `${-x0 * k}px`,
				top: `${-y0 * k}px`
			}
		},
		box
	);
	return {
		box,
		img,
		k,
		w: width,
		h: (y1 - y0) * k,
		at: (x, y) => [left + (x - x0) * k, top + (y - y0) * k]
	};
}
