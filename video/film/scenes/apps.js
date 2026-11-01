/**
 * Shot 7, algebra, chat and the gate: the demo's recorded factorisation and its recorded chat reply, then the gate of
 * Fig. 5a, y = xW + g s (xAᵀ)Bᵀ, set to 1 and to 0.
 */
import { h, ep, E, st, rise, inout, C, figurePanel } from '../lib.js';
import { makeWindow, cam } from '../win.js';

export default function apps(root, D, ctx, sc) {
	const T0 = sc.start;
	const w = makeWindow(root, ctx, { left: 280, top: 140, width: 1360 });
	const capA = h(
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
		`Algebra: <span style="color:${C.rose}">every number in rose</span> is computed by the model on its sheet, and each answer is checked before it is returned`
	);
	const capC = h(
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
		'Chat: on held-out phrasings the dialogue adapter opens the sheet with precision 0.994 and recall 0.989'
	);
	// the gate
	const gate = h('div', { class: 'abs', style: { inset: '0' } }, root);
	const fig = figurePanel(gate, 'fig5.svg', [20, 60, 640, 478], 840, { left: 150, top: 270 });
	// the adapter branch of the figure (A, B, the gate and the rose wires), dimmed when g = 0
	const [bx0, by0] = fig.at(62, 322),
		[bx1, by1] = fig.at(480, 455);
	const dim = h(
		'div',
		{
			class: 'abs',
			style: {
				left: `${bx0}px`,
				top: `${by0}px`,
				width: `${bx1 - bx0}px`,
				height: `${by1 - by0}px`,
				background: '#fff',
				opacity: '0'
			}
		},
		gate
	);
	const right = h(
		'div',
		{ class: 'abs', style: { left: '1060px', top: '330px', width: '720px' } },
		gate
	);
	const head = h(
		'div',
		{ style: { fontSize: '19px', color: C.soft } },
		right,
		'A multiplicative gate on every adapter branch'
	);
	const eq = h(
		'div',
		{
			class: 'serif',
			style: { marginTop: '18px', fontSize: '40px', fontStyle: 'italic', color: C.ink }
		},
		right,
		'y = xW + g s (xA<sup style="font-size:22px">T</sup>)B<sup style="font-size:22px">T</sup>'
	);
	const l1 = h(
		'div',
		{ style: { marginTop: '40px', fontSize: '26px', lineHeight: '38px', color: C.ink } },
		right,
		`<span class="serif" style="font-style:italic;color:${C.rose};font-size:32px;margin-right:18px">g = 1</span>the sheet machine: all 2,446 views pass`
	);
	const l0 = h(
		'div',
		{ style: { marginTop: '14px', fontSize: '26px', lineHeight: '38px', color: C.ink } },
		right,
		`<span class="serif" style="font-style:italic;color:${C.cobalt};font-size:32px;margin-right:18px">g = 0</span>the base model, Qwen3.5-0.8B, bit for bit`
	);
	const foot = h(
		'div',
		{ style: { marginTop: '34px', fontSize: '19px', lineHeight: '29px', color: C.soft } },
		right,
		'confirmed bit for bit for logits, hidden states and cached states, on 2,500 chat forward passes and 2,688 table views'
	);
	return (t) => {
		const u = t - T0;
		const W = inout(u, 0, 15.3, 0.8, E.o3);
		w.frame(W, (1 - ep(u, 0, 0.8, E.o3)) * 18);
		const [z1, x1, y1] = cam(u, 0.8, 3.2, 30, 31, 1.5, 440, 600, E.io5);
		w.show(0, 'algebra', Math.max(0, u - 0.1), 1 - ep(u, 8.0, 8.8, E.io3), z1, x1, y1);
		const [z2, x2, y2] = cam(u, 8.8, 11.0, 30, 31, 1.28, 480, 540, E.io5);
		w.show(1, 'chat', Math.max(0, u - 8.2) + 0.6, ep(u, 8.0, 8.8, E.io3), z2, x2, y2);
		rise(capA, inout(u, 0.6, 8.6, 0.6, E.o3), 6);
		rise(capC, inout(u, 8.8, 15.0, 0.6, E.o3), 6);
		const G = ep(u, 14.9, 15.8, E.io3);
		st(gate, 'opacity', G.toFixed(3));
		st(gate, 'display', G > 0 ? 'block' : 'none');
		if (G > 0) {
			rise(head, ep(u, 15.1, 15.8, E.o3), 8);
			rise(eq, ep(u, 15.3, 16.0, E.o3), 10);
			// g = 1, then g = 0 as the narration says "at gate zero"
			const zero = ep(u, 16.4, 17.0, E.io3);
			rise(l1, ep(u, 15.6, 16.3, E.o3), 8);
			rise(l0, ep(u, 15.9, 16.6, E.o3), 8);
			st(l1, 'opacity', String(ep(u, 15.6, 16.3, E.o3) * (1 - 0.6 * zero)));
			st(l0, 'opacity', String(ep(u, 15.9, 16.6, E.o3) * (0.4 + 0.6 * zero)));
			st(dim, 'opacity', (0.72 * zero).toFixed(3));
			rise(foot, ep(u, 17.4, 18.2, E.o3), 6);
		}
	};
}
