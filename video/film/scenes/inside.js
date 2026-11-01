/**
 * Shot 8, inside the model: the demo's own layer-by-layer panel during the recorded multiplication, then Fig. 6c, the
 * share of steps a class-mean push changes against the depth at which it is applied.
 */
import { h, ep, E, st, rise, inout, lerp, C, figurePanel } from '../lib.js';
import { makeWindow, cam } from '../win.js';

export default function inside(root, D, ctx, sc) {
	const T0 = sc.start;
	const w = makeWindow(root, ctx, { left: 280, top: 140, width: 1360 });
	const cap = h(
		'div',
		{
			class: 'abs',
			style: {
				left: '0',
				right: '0',
				top: '1018px',
				textAlign: 'center',
				fontSize: '18px',
				color: C.soft
			}
		},
		root,
		'The demo’s layer lens: how sure each of the 24 layers is of the answer, view by view'
	);
	const part = h('div', { class: 'abs', style: { inset: '0' } }, root);
	const left = h(
		'div',
		{ class: 'abs', style: { left: '170px', top: '300px', width: '820px' } },
		part
	);
	const head = h(
		'div',
		{ style: { fontSize: '19px', color: C.soft } },
		left,
		'Arithmetic adapter: push a step’s state toward another answer, at one depth'
	);
	const big = h(
		'div',
		{
			class: 'serif',
			style: {
				marginTop: '16px',
				fontSize: '42px',
				lineHeight: '54px',
				color: C.ink,
				letterSpacing: '-0.005em'
			}
		},
		left,
		'A multiplication digit is decided in the fifth full-attention layer.'
	);
	const sub = h(
		'div',
		{ style: { marginTop: '28px', fontSize: '22px', lineHeight: '34px', color: C.soft } },
		left,
		`Pushed after depth 20, <span style="color:${C.cobalt}">80 of 80 multiplication steps</span> change their digit, and <span style="color:${C.rose}">79 of 80 addition steps</span>. Pushed at any depth up to 15, none do.`
	);
	const fig = figurePanel(part, 'fig6.svg', [1255, 70, 1600, 480], 560, {
		left: 1170,
		top: 210 + (30 * 560) / 345
	});
	return (t) => {
		const u = t - T0;
		const W = inout(u, 0, 6.9, 0.8, E.o3);
		w.frame(W, (1 - ep(u, 0, 0.8, E.o3)) * 18);
		const [z, x, y] = cam(u, 0.6, 2.8, 30, 31, 1.95, 215, 380, E.io5);
		w.show(0, 'inside', u + 0.8, 1, z, x, y);
		rise(cap, inout(u, 0.6, 6.6, 0.6, E.o3), 6);
		const P = ep(u, 6.6, 7.4, E.io3);
		st(part, 'opacity', P.toFixed(3));
		st(part, 'display', P > 0 ? 'block' : 'none');
		if (P > 0) {
			rise(head, ep(u, 6.8, 7.5, E.o3), 6);
			rise(big, ep(u, 7.0, 7.8, E.o3), 10);
			rise(sub, ep(u, 8.6, 9.4, E.o3), 8);
			const v = lerp(1330, 1600, ep(u, 7.6, 11.4, E.io3));
			st(fig.box, 'clipPath', `inset(0 ${(((1600 - v) / (1600 - 1255)) * 100).toFixed(2)}% 0 0)`);
		}
	};
}
