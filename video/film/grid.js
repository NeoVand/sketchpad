/**
 * The 2,446 views as Fig. 1b lays them out: one cell per view, blocks per table (block reshapes from
 * paper/figures/fig1_v2.py, computed in build-data.ts), coloured by the M4 margin with the paper's cr_exact map.
 */
import { h, exactColor } from './lib.js';

const LAYOUT = {
	MUL: [0, 0],
	SUM: [0, 17],
	ADD: [25, 17],
	ADZ: [48, 17],
	SUB: [71, 17],
	EST: [96, 17],
	NXT: [125.8, 0.33],
	DEC: [125.8, 5.25],
	FLS: [125.8, 10.17]
};
export const ORDER = ['MUL', 'SUM', 'ADD', 'ADZ', 'SUB', 'EST', 'NXT', 'DEC', 'FLS'];

export function makeGrid(root, D, { x0, y0, c }) {
	const canvas = h(
		'canvas',
		{
			width: '1920',
			height: '1080',
			class: 'abs',
			style: { left: '0', top: '0', width: '1920px', height: '1080px' }
		},
		root
	);
	const g = canvas.getContext('2d');
	const cells = [];
	const labels = {};
	for (const name of ORDER) {
		const b = D.cert.blocks[name];
		const [bx, by] = LAYOUT[name];
		for (let r = 0; r < b.length; r++)
			for (let cc = 0; cc < b[r].length; cc++)
				cells.push({
					name,
					r,
					c: cc,
					x: x0 + (bx + cc) * c,
					y: y0 + (by + r) * c,
					m: b[r][cc],
					color: exactColor(b[r][cc])
				});
		const n = b.length * b[0].length;
		const side = by < 15 && name !== 'MUL';
		labels[name] = h(
			'div',
			{
				class: 'abs',
				style: side
					? {
							left: `${x0 + bx * c - 150}px`,
							width: '138px',
							textAlign: 'right',
							top: `${y0 + by * c - 6}px`,
							fontSize: '16px',
							color: '#4C5B78',
							lineHeight: `${c + 12}px`,
							whiteSpace: 'nowrap'
						}
					: {
							left: `${x0 + bx * c}px`,
							top: `${y0 + by * c - 28}px`,
							fontSize: '16px',
							color: '#4C5B78',
							whiteSpace: 'nowrap'
						}
			},
			root,
			`${name} ${n.toLocaleString('en-US')}`
		);
	}
	const weak = cells.find(
		(q) => q.name === D.cert.weakest.block && q.r === D.cert.weakest.r && q.c === D.cert.weakest.c
	);
	return {
		canvas,
		cells,
		labels,
		weak,
		c,
		/** draw every cell: f(cell, i) -> { x, y, color, a, s } or null to skip */
		draw(f) {
			g.clearRect(0, 0, 1920, 1080);
			for (let i = 0; i < cells.length; i++) {
				const o = f(cells[i], i);
				if (!o || o.a <= 0.002) continue;
				g.globalAlpha = Math.min(1, o.a);
				g.fillStyle = o.color;
				const s = (c - 1.2) * (o.s ?? 1);
				g.fillRect(o.x + (c - 1.2 - s) / 2, o.y + (c - 1.2 - s) / 2, s, s);
			}
			g.globalAlpha = 1;
		}
	};
}
