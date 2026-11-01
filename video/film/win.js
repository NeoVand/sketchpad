/**
 * The live demo as a window on the white page: frames captured by video/capture/capture.mjs, shown at the time asked,
 * with a camera that eases in on a point of the page (in the page's CSS pixels) without ever showing past its edges.
 */
import { h, st, lerp, clamp } from './lib.js';

export function makeWindow(root, ctx, { left = 280, top = 150, width = 1360 } = {}) {
	const css = { w: 1360, h: 850 };
	const k = width / css.w;
	const height = css.h * k;
	const win = h(
		'div',
		{
			class: 'window',
			style: { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` }
		},
		root
	);
	const layers = [0, 1].map(() =>
		h('img', { style: { width: `${css.w * k}px`, height: `${css.h * k}px`, opacity: '0' } }, win)
	);
	const srcOf = (clip, i) => `/video/out/capture/${clip}/${String(i).padStart(5, '0')}.jpg`;
	return {
		win,
		width,
		height,
		/**
		 * show layer `n` (0 or 1) at opacity `a`: frame of `clip` at clip time `time` (film seconds), with the camera
		 * at zoom `zoom` centred (as far as the edges allow) on the page point (fx, fy), blended by `z` from the centre
		 */
		show(n, clip, time, a, zoom = 1, fx = css.w / 2, fy = css.h / 2) {
			const img = layers[n];
			st(img, 'opacity', a.toFixed(3));
			if (a <= 0.001) return;
			const m = ctx.manifest[clip];
			const count = m ? m.frames : 1;
			const i = clamp(Math.round(time * 60), 0, count - 1);
			const src = srcOf(clip, i);
			if (img.getAttribute('src') !== src) {
				img.setAttribute('src', src);
				ctx.wait(img);
			}
			const s = zoom;
			let tx = width / 2 - fx * k * s;
			let ty = height / 2 - fy * k * s;
			tx = clamp(tx, width - css.w * k * s, 0);
			ty = clamp(ty, height - css.h * k * s, 0);
			st(
				img,
				'transform',
				`translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${s.toFixed(4)})`
			);
		},
		frame(a, rise = 0) {
			st(win, 'opacity', a.toFixed(3));
			st(
				win,
				'transform',
				`translateY(${rise.toFixed(2)}px) scale(${lerp(0.975, 1, a).toFixed(4)})`
			);
		}
	};
}

/** a camera move: zoom and focus eased from (1, centre) to (zoom, focus) over [a, b] and back over [c, d] */
export function cam(u, a, b, c, d, zoom, fx, fy, ease) {
	const z = Math.min(ease(clamp((u - a) / (b - a))), 1 - ease(clamp((u - c) / (d - c))));
	return [lerp(1, zoom, z), lerp(680, fx, z), lerp(425, fy, z)];
}
