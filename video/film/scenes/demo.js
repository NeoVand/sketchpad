/** Shot 4, the machine at work: the live demo's recorded multiplication, then its recorded long division. */
import { h, ep, E, rise, inout } from '../lib.js';
import { makeWindow, cam } from '../win.js';

export default function demo(root, D, ctx, sc) {
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
				color: '#4C5B78'
			}
		},
		root,
		'neovand.github.io/sketchpad/demo · runs recorded on the published model, played back by the page'
	);
	return (t) => {
		const u = t - sc.start;
		w.frame(ep(u, 0, 0.9, E.o3), (1 - ep(u, 0, 0.9, E.o3)) * 18);
		rise(cap, inout(u, 0.6, sc.end - sc.start, 0.8, E.o3), 6);
		// the multiplication, the camera easing in on the sheet and the view
		const [z1, x1, y1] = cam(u, 1.2, 3.6, 5.2, 6.6, 1.5, 560, 420, E.io5);
		w.show(0, 'machine', Math.max(0, u - 0.3), 1 - ep(u, 6.0, 6.8, E.io3), z1, x1, y1);
		// the division
		const [z2, x2, y2] = cam(u, 6.4, 8.8, 20, 21, 1.45, 520, 420, E.io5);
		w.show(1, 'calc', Math.max(0, u - 6.2), ep(u, 6.0, 6.8, E.io3), z2, x2, y2);
	};
}
