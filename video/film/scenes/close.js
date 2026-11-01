/** Shot 9, the close: the name, where to find the paper, the code and the model. */
import { h, ep, E, rise, C } from '../lib.js';

export default function close(root, D, ctx, sc) {
	const T0 = sc.start;
	const mark = h(
		'img',
		{
			src: '/static/logo/sketchpad-mark.svg',
			class: 'abs',
			style: { left: '912px', top: '214px', width: '96px', height: '96px' }
		},
		root
	);
	const name = h(
		'div',
		{
			class: 'abs serif',
			style: {
				left: '0',
				right: '0',
				top: '330px',
				textAlign: 'center',
				fontSize: '120px',
				fontWeight: '500',
				color: C.rose,
				letterSpacing: '-0.015em',
				lineHeight: '1'
			}
		},
		root,
		'Sketchpad'
	);
	const sub = h(
		'div',
		{
			class: 'abs serif',
			style: {
				left: '0',
				right: '0',
				top: '478px',
				textAlign: 'center',
				fontSize: '34px',
				color: C.ink
			}
		},
		root,
		'certified exact arithmetic with a small vision-language model'
	);
	const rows = [
		['Run it', 'neovand.github.io/sketchpad/demo'],
		['Paper', 'arXiv, forthcoming · neovand.github.io/sketchpad'],
		['Code', 'github.com/NeoVand/sketchpad'],
		['Model', 'huggingface.co/mohsenvand/sketchpad-0.8b-preview']
	].map(([k, v], i) =>
		h(
			'div',
			{
				class: 'abs',
				style: {
					left: '0',
					width: '1920px',
					top: `${592 + i * 46}px`,
					fontSize: '23px',
					lineHeight: '34px',
					display: 'flex',
					justifyContent: 'center'
				}
			},
			root,
			`<span style="width:170px;text-align:right;color:${C.soft};margin-right:28px">${k}</span><span style="width:640px;color:${C.ink}">${v}</span>`
		)
	);
	const by = h(
		'div',
		{
			class: 'abs',
			style: {
				left: '0',
				right: '0',
				top: '840px',
				textAlign: 'center',
				fontSize: '20px',
				color: C.soft
			}
		},
		root,
		'Mostafa ‘Neo’ Mohsenvand · MIT Media Lab · 2026'
	);
	return (t) => {
		const u = t - T0;
		// the end: everything goes to white
		const k = 1 - ep(u, 14.6, 16.8, E.io3);
		rise(mark, ep(u, 0.4, 1.4, E.o3) * k, 10);
		rise(name, ep(u, 0.6, 1.7, E.o5) * k, 22);
		rise(sub, ep(u, 1.1, 2.0, E.o3) * k, 12);
		rows.forEach((el, i) => rise(el, ep(u, 2.0 + i * 0.18, 2.8 + i * 0.18, E.o3) * k, 8));
		rise(by, ep(u, 3.0, 3.8, E.o3) * k, 6);
	};
}
