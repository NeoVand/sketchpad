/**
 * Shot 6, the certificate and the comparison: the 2,446 margins of the M4 certificate checked in a sweep
 * (paper/figures/data/certificate_e7.json), the weakest view drawn from the model's own sprites, then the exact answers
 * of every system on the 220 pre-registered problems (paper/baselines/results.json; Fig. 1c).
 */
import { h, ep, prog, E, st, rise, inout, lerp, C, fmt, mix } from '../lib.js';
import { makeGrid } from '../grid.js';
import { drawStrip, spritesReady } from './idea.js';

export default function cert(root, D, ctx, sc) {
	const T0 = sc.start;
	const grid = makeGrid(root, D, { x0: 242, y0: 230, c: 10.5 });
	// sweep order: left to right across both rows of blocks, as a scan
	const order = grid.cells.map((q, i) => [q.x + q.y * 0.08, i]).sort((a, b) => a[0] - b[0]);
	const rank = new Array(grid.cells.length);
	order.forEach(([, i], k) => (rank[i] = k));
	const N = grid.cells.length;
	const count = h(
		'div',
		{
			class: 'abs serif',
			style: {
				left: '0',
				right: '0',
				top: '620px',
				textAlign: 'center',
				fontSize: '80px',
				color: C.ink,
				letterSpacing: '-0.01em',
				fontFeatureSettings: '"tnum"'
			}
		},
		root,
		''
	);
	const sub = h(
		'div',
		{
			class: 'abs',
			style: {
				left: '0',
				right: '0',
				top: '738px',
				textAlign: 'center',
				fontSize: '22px',
				color: C.soft
			}
		},
		root,
		'Arithmetic adapter · Apple M4 · WebGPU · 16-bit · full check: 3.5 minutes'
	);
	// the weakest view
	const w = grid.weak;
	const ring = h(
		'div',
		{
			class: 'abs',
			style: {
				left: `${w.x - 5}px`,
				top: `${w.y - 5}px`,
				width: `${grid.c + 8}px`,
				height: `${grid.c + 8}px`,
				border: `2px solid ${C.ink}`,
				borderRadius: '3px',
				opacity: '0'
			}
		},
		root
	);
	const strip = h(
		'canvas',
		{
			width: '32',
			height: '96',
			class: 'abs pix',
			style: {
				left: '560px',
				top: '600px',
				width: '80px',
				height: '240px',
				boxShadow: `0 0 0 1px ${C.mist}`,
				opacity: '0'
			}
		},
		root
	);
	let drawn = false;
	const lead = h(
		'div',
		{
			class: 'abs',
			style: {
				left: `${w.x + grid.c / 2}px`,
				top: `${w.y + grid.c + 4}px`,
				width: '1.2px',
				background: C.ink,
				transformOrigin: '0 0',
				opacity: '0'
			}
		},
		root
	);
	const callout = h(
		'div',
		{ class: 'abs', style: { left: '680px', top: '600px', width: '900px' } },
		root,
		`<div style="font-size:19px;color:${C.soft}">the weakest of the 2,446 views</div>` +
			`<div class="serif" style="font-size:32px;margin-top:10px;color:${C.ink}">addition reads 5 and 6, no carry in, and writes 11</div>` +
			`<div class="serif" style="font-size:52px;margin-top:8px;color:${C.rose}">margin ${D.cert.weakest.margin.toFixed(2)} logits</div>` +
			`<div style="font-size:21px;margin-top:12px;color:${C.soft};line-height:31px">so it tolerates any change of the logits smaller than 1.51</div>`
	);
	// ---- the comparison --------------------------------------------------------------------------------------------
	const bars = h('div', { class: 'abs', style: { inset: '0' } }, root);
	const bt = h(
		'div',
		{ class: 'abs serif', style: { left: '200px', top: '178px', fontSize: '40px', color: C.ink } },
		bars,
		'Exact answers on 220 pre-registered problems'
	);
	const bs = h(
		'div',
		{ class: 'abs', style: { left: '200px', top: '236px', fontSize: '20px', color: C.soft } },
		bars,
		'sums of 10 to 1,000 digits and products of 2- to 20-digit numbers, 20 per length; one prompt, a budget of 32,768 output tokens'
	);
	const groups = { 1: 'frontier models', 4: 'open models', 9: 'Qwen3.5' };
	let y = 318;
	const NX = 790,
		BX = 820,
		BW = 800;
	const rows = D.bars.map((b, i) => {
		if (groups[i]) {
			h(
				'div',
				{
					class: 'abs',
					style: {
						left: `${NX - 400}px`,
						width: '400px',
						textAlign: 'right',
						top: `${y + 4}px`,
						fontSize: '16px',
						fontStyle: 'italic',
						color: C.grey
					}
				},
				bars,
				groups[i]
			);
			y += 28;
		}
		const color = i === 0 ? C.rose : i === 1 ? C.cobalt : C.grey;
		const name = h(
			'div',
			{
				class: 'abs',
				style: {
					left: `${NX - 620}px`,
					width: '620px',
					textAlign: 'right',
					top: `${y}px`,
					lineHeight: '34px',
					fontSize: '23px',
					fontWeight: i === 0 ? '600' : '400',
					color: i === 0 ? C.ink : C.ink,
					whiteSpace: 'nowrap'
				}
			},
			bars,
			`${b.name} <span style="font-size:16px;font-weight:400;color:${C.grey};margin-left:6px">${b.note}</span>`
		);
		const bar = h(
			'div',
			{
				class: 'abs',
				style: {
					left: `${BX}px`,
					top: `${y + 7}px`,
					height: '20px',
					width: `${(b.exact / 220) * BW}px`,
					background: color,
					transformOrigin: '0 50%'
				}
			},
			bars
		);
		const val = h(
			'div',
			{
				class: 'abs',
				style: {
					left: `${BX + (b.exact / 220) * BW + 14}px`,
					top: `${y}px`,
					lineHeight: '34px',
					fontSize: '22px',
					color: i === 0 ? C.rose : i === 1 ? C.cobalt : C.soft,
					whiteSpace: 'nowrap',
					fontFeatureSettings: '"tnum"'
				}
			},
			bars,
			''
		);
		const row = { name, bar, val, b, y };
		y += i === 0 ? 50 : 44;
		return row;
	});
	const axis = h(
		'div',
		{
			class: 'abs',
			style: {
				left: `${BX - 1}px`,
				top: '310px',
				width: '1.5px',
				height: `${y - 300}px`,
				background: C.ink,
				transformOrigin: '50% 0'
			}
		},
		bars
	);

	return (t) => {
		const u = t - T0;
		// the sweep
		const gOut = ep(u, 9.1, 9.8, E.io3);
		const S0 = 0.8,
			S1 = 5.4;
		let checked = 0;
		grid.draw((q, i) => {
			const at = S0 + ((S1 - S0) * rank[i]) / N;
			const v = prog(u, at, at + 0.35);
			if (u >= at) checked++;
			const flash = v > 0 && v < 1 ? Math.sin(Math.PI * v) : 0;
			return {
				x: q.x,
				y: q.y - gOut * 16,
				color: v > 0 ? mix('#C3CDDF', q.color, E.o2(v)) : '#C3CDDF',
				a: ep(u, 0, 0.6) * (1 - gOut),
				s: 1 + flash * 0.3
			};
		});
		for (const el of Object.values(grid.labels)) rise(el, ep(u, 0.1, 0.7, E.o3) * (1 - gOut), 6);
		const cU = inout(u, 0.6, 6.2, 0.6, E.o3);
		rise(count, cU, 10);
		const txt = `<span style="color:${C.rose}">${fmt(checked)}</span> of 2,446 pass`;
		if (count._t !== checked) {
			count.innerHTML = txt;
			count._t = checked;
		}
		rise(sub, inout(u, 1.2, 6.2, 0.6, E.o3), 8);
		// the weakest view
		const wU = inout(u, 6.2, 9.4, 0.6, E.o3);
		st(ring, 'opacity', wU.toFixed(3));
		st(ring, 'transform', `scale(${lerp(2.2, 1, ep(u, 6.2, 6.9, E.o5)).toFixed(3)})`);
		if (!drawn) {
			ctx.wait({
				complete: false,
				decode: () => spritesReady().then(() => drawStrip(strip, [' ', '5', '6']))
			});
			drawn = true;
		}
		st(strip, 'opacity', inout(u, 6.6, 9.4, 0.6, E.o3).toFixed(3));
		const lineU = ep(u, 6.5, 7.2, E.io3) * (1 - ep(u, 8.8, 9.4));
		const dx = 600 - (w.x + grid.c / 2),
			dy = 600 - (w.y + grid.c + 4);
		const len = Math.hypot(dx, dy);
		st(lead, 'height', `${(len * lineU).toFixed(1)}px`);
		st(lead, 'transform', `rotate(${(-Math.atan2(dx, dy) * 180) / Math.PI}deg)`);
		st(lead, 'opacity', lineU > 0 ? '1' : '0');
		rise(callout, inout(u, 6.8, 9.4, 0.6, E.o3), 10);
		// the comparison
		const B = inout(u, 9.6, 20.4, 0.6, E.io3);
		st(bars, 'opacity', B.toFixed(3));
		st(bars, 'display', B > 0 ? 'block' : 'none');
		if (B > 0) {
			rise(bt, ep(u, 9.7, 10.5, E.o3), 10);
			rise(bs, ep(u, 9.9, 10.7, E.o3), 8);
			st(axis, 'transform', `scaleY(${ep(u, 10.0, 10.8, E.io3).toFixed(3)})`);
			rows.forEach((r, i) => {
				const a = 10.3 + i * 0.07;
				rise(r.name, ep(u, a, a + 0.6, E.o3), 6);
				const g = ep(u, a + 0.2, a + 1.6, E.io3);
				st(r.bar, 'transform', `scaleX(${g.toFixed(4)})`);
				const n = Math.round(r.b.exact * g);
				const label =
					i === 0
						? `${n}<span style="font-size:16px;color:${C.rose};margin-left:12px">certified</span>`
						: `${n}`;
				if (r.val._n !== n) {
					r.val.innerHTML = label;
					r.val._n = n;
				}
				st(r.val, 'transform', `translateX(${((g - 1) * (r.b.exact / 220) * BW).toFixed(1)}px)`);
				st(r.val, 'opacity', String(g > 0.02 ? 1 : 0));
			});
		}
	};
}
