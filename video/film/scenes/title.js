/** Shot 2, the title: the paper's title, set as the paper's landing page sets it. */
import { h, ep, E, st, rise, inout, C, lerp } from '../lib.js';

export default function title(root, D, ctx, sc) {
	const t0 = sc.start;
	// a faint sheet behind: the 32-px grid the model's cells sit on, and a three-cell window resting in it
	const grid = h(
		'div',
		{
			class: 'abs',
			style: {
				inset: '0',
				backgroundImage: `linear-gradient(${C.tint} 1.5px, transparent 1.5px), linear-gradient(90deg, ${C.tint} 1.5px, transparent 1.5px)`,
				backgroundSize: '48px 48px',
				backgroundPosition: '24px 12px'
			}
		},
		root
	);
	const win = h(
		'div',
		{
			class: 'abs',
			style: {
				width: '48px',
				height: '144px',
				border: `2px solid ${C.rose}`,
				borderRadius: '8px',
				left: `${24 + 48 * 30 - 1}px`,
				top: `${12 + 48 * 2 - 1}px`
			}
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
				top: '360px',
				textAlign: 'center',
				fontSize: '156px',
				fontWeight: '500',
				letterSpacing: '-0.015em',
				color: C.rose,
				lineHeight: '1'
			}
		},
		root
	);
	const letters = [...'Sketchpad'].map((ch) =>
		h('span', { style: { display: 'inline-block' } }, name, ch)
	);
	const sub = h(
		'div',
		{
			class: 'abs serif',
			style: {
				left: '0',
				right: '0',
				top: '560px',
				textAlign: 'center',
				fontSize: '40px',
				fontWeight: '400',
				color: C.ink,
				letterSpacing: '-0.005em'
			}
		},
		root,
		'certified exact arithmetic with a small vision-language model'
	);
	const by = h(
		'div',
		{
			class: 'abs',
			style: {
				left: '0',
				right: '0',
				top: '650px',
				textAlign: 'center',
				fontSize: '21px',
				color: C.soft
			}
		},
		root,
		'Mostafa ‘Neo’ Mohsenvand · MIT Media Lab'
	);
	return (t) => {
		const u = t - t0;
		letters.forEach((el, i) => {
			const v = ep(u, 0.35 + i * 0.05, 1.35 + i * 0.05, E.o5);
			st(el, 'opacity', v.toFixed(3));
			st(el, 'transform', `translateY(${((1 - v) * 28).toFixed(2)}px)`);
		});
		rise(sub, ep(u, 1.2, 2.1, E.o3), 12);
		rise(by, ep(u, 1.7, 2.6, E.o3), 10);
		st(grid, 'opacity', String(0.9 * ep(u, 0, 1.5)));
		// the window steps along its row, one cell at a time, as a run does
		const step = Math.floor(Math.max(0, u - 1.2) / 0.9);
		const frac = E.io3(Math.min(1, (Math.max(0, u - 1.2) % 0.9) / 0.35));
		const col = 30 - step + (step > 0 ? 1 - frac : 0);
		st(win, 'left', `${(24 + 48 * lerp(col, col, 1) - 1).toFixed(2)}px`);
		st(win, 'opacity', String(0.55 * inout(u, 0.8, 7.2, 0.8)));
	};
}
