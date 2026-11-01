/**
 * Shot 5, the finite list and the proof: the 2,446 views assemble into their tables; Theorem 1 as Lean states it
 * (paper/lean/Sheet.lean, Sketchpad.sheet_exact_iff, verbatim); Theorem 2's counterexample, Fig. 3b of the paper.
 */
import { h, ep, prog, E, st, rise, inout, lerp, rng, C, figurePanel } from '../lib.js';
import { makeGrid } from '../grid.js';

const LEAN = [
	'<span style="color:#7A5BA8">theorem</span> sheet_exact_iff {query : C → Option V} {paint : C → A → C} {f T : V → A} {I : Set C}',
	"    (hpaint : ∀ c v, query c = some v → ∀ a a', paint c a = paint c a' → a = a') :",
	'    <span class="u3">(∀ c₀ ∈ I, ∀ n, trace query paint f c₀ n = trace query paint T c₀ n)</span> <span class="iff">↔</span>',
	'      <span class="u4">∀ v ∈ reachedViews query paint T I, f v = T v</span>'
];

export default function proof(root, D, ctx, sc) {
	const T0 = sc.start;
	// ---- the finite list ------------------------------------------------------------------------------------------
	const grid = makeGrid(root, D, { x0: 242, y0: 250, c: 10.5 });
	const R = rng(7);
	const scatter = grid.cells.map((q) => ({
		x: q.x + (R() - 0.5) * 900,
		y: q.y + (R() - 0.5) * 700 - 120,
		d: R()
	}));
	const big = h(
		'div',
		{
			class: 'abs serif',
			style: {
				left: '0',
				right: '0',
				top: '640px',
				textAlign: 'center',
				fontSize: '84px',
				fontWeight: '400',
				color: C.ink,
				letterSpacing: '-0.01em'
			}
		},
		root,
		'2,446 views'
	);
	const sub = h(
		'div',
		{
			class: 'abs',
			style: {
				left: '0',
				right: '0',
				top: '760px',
				textAlign: 'center',
				fontSize: '22px',
				color: C.soft,
				lineHeight: '34px'
			}
		},
		root,
		'every view the procedures can meet, listed in advance:<br>242 for addition, 1,553 for multiplication, 651 for subtraction and division'
	);
	// ---- Theorem 1 in Lean ----------------------------------------------------------------------------------------
	const lean = h(
		'div',
		{ class: 'abs', style: { left: '170px', top: '0', width: '1600px', height: '1080px' } },
		root
	);
	const leanHead = h(
		'div',
		{ class: 'abs', style: { left: '0', top: '226px', fontSize: '19px', color: C.soft } },
		lean,
		'Theorem 1, as Lean checks it · paper/lean/Sheet.lean'
	);
	const ys = [292, 340, 448, 560];
	const lines = LEAN.map((html, i) =>
		h(
			'div',
			{
				class: 'abs mono',
				style: {
					left: '0',
					top: `${ys[i]}px`,
					fontSize: '24px',
					lineHeight: '36px',
					whiteSpace: 'pre',
					color: C.ink
				}
			},
			lean,
			html
		)
	);
	const style = h('style', {}, root);
	style.textContent = `.u3,.u4{background-image:linear-gradient(${C.rose},${C.rose});background-repeat:no-repeat;background-position:0 100%;background-size:var(--w,0%) 2px;padding-bottom:3px}.iff{color:${C.rose};font-weight:600}`;
	const g2 = h(
		'div',
		{ class: 'abs', style: { left: '58px', top: '384px', fontSize: '19px', color: C.soft } },
		lean,
		'given a runtime whose write step is one-to-one,'
	);
	const g3 = h(
		'div',
		{
			class: 'abs serif',
			style: { left: '58px', top: '494px', fontSize: '27px', fontStyle: 'italic', color: C.ink }
		},
		lean,
		'the model’s run is the reference run, step for step, from every start and for every length n,'
	);
	const g3b = h(
		'div',
		{
			class: 'abs serif',
			style: { left: '1112px', top: '444px', fontSize: '27px', fontStyle: 'italic', color: C.rose }
		},
		lean,
		'if and only if'
	);
	const g4 = h(
		'div',
		{
			class: 'abs serif',
			style: { left: '86px', top: '606px', fontSize: '27px', fontStyle: 'italic', color: C.ink }
		},
		lean,
		'the model agrees with the table on every view a reference run meets.'
	);
	const leanFoot = h(
		'div',
		{
			class: 'abs',
			style: {
				left: '0',
				top: '720px',
				width: '1300px',
				fontSize: '19px',
				lineHeight: '30px',
				color: C.soft
			}
		},
		lean,
		'Compiled with Lean 4 and Mathlib, with no sorry. What the runtime must do, that reference runs meet only table views, is stated in the paper and checked at every step; it is not formalised.'
	);
	// ---- Theorem 2 ------------------------------------------------------------------------------------------------
	const th2 = h(
		'div',
		{ class: 'abs', style: { left: '170px', top: '300px', width: '640px' } },
		root
	);
	const th2Head = h('div', { style: { fontSize: '19px', color: C.soft } }, th2, 'Theorem 2');
	const th2Big = h(
		'div',
		{
			class: 'serif',
			style: {
				marginTop: '16px',
				fontSize: '40px',
				lineHeight: '50px',
				color: C.ink,
				letterSpacing: '-0.005em'
			}
		},
		th2,
		'When a step can read the steps before it, no finite test suffices.'
	);
	const th2Sub = h(
		'div',
		{ style: { marginTop: '26px', fontSize: '21px', lineHeight: '33px', color: C.soft } },
		th2,
		`With its state in the context, a decoder can pass every test up to N steps and fail at step N + 1. <span style="color:${C.rose}">Under the pinned-sheet policy</span>, the same decoder keeps its margin at every length.`
	);
	const fig = figurePanel(root, 'fig3.svg', [1050, 30, 1600, 575], 790, { left: 940, top: 175 });
	return (t) => {
		const u = t - T0;
		// the views fly in to their tables
		const out1 = ep(u, 6.6, 7.4, E.io3);
		grid.draw((q, i) => {
			const d = 0.2 + scatter[i].d * 1.6 + ((q.x - 242) / 1436) * 1.2;
			const v = ep(u, d, d + 1.5, E.o5);
			return {
				x: lerp(scatter[i].x, q.x, v),
				y: lerp(scatter[i].y, q.y, v) - out1 * 20,
				color: '#C3CDDF',
				a: Math.min(1, v * 1.6) * (1 - out1),
				s: lerp(0.4, 1, v)
			};
		});
		for (const el of Object.values(grid.labels)) rise(el, ep(u, 2.8, 3.6, E.o3) * (1 - out1), 6);
		rise(big, ep(u, 3.0, 4.0, E.o3) * (1 - out1), 14);
		rise(sub, ep(u, 3.6, 4.5, E.o3) * (1 - out1), 10);
		// Lean
		const L = inout(u, 7.2, 14.1, 0.7, E.io3);
		st(lean, 'opacity', L.toFixed(3));
		st(lean, 'display', L > 0 ? 'block' : 'none');
		if (L > 0) {
			rise(leanHead, ep(u, 7.3, 8.0, E.o3), 6);
			const at = [7.6, 8.0, 8.5, 9.9];
			lines.forEach((el, i) => {
				const v = ep(u, at[i], at[i] + 0.9, E.io3);
				st(el, 'clipPath', `inset(-10px ${((1 - v) * 100).toFixed(2)}% -10px 0)`);
			});
			st(lines[2], '--w', `${(ep(u, 9.0, 9.9, E.io3) * 100).toFixed(1)}%`);
			lines[2]
				.querySelector('.u3')
				.style.setProperty('--w', `${(ep(u, 9.0, 9.9, E.io3) * 100).toFixed(1)}%`);
			lines[3]
				.querySelector('.u4')
				.style.setProperty('--w', `${(ep(u, 10.8, 11.6, E.io3) * 100).toFixed(1)}%`);
			rise(g2, ep(u, 8.4, 9.1, E.o3), 6);
			rise(g3, ep(u, 9.2, 10.0, E.o3), 8);
			rise(g3b, ep(u, 9.9, 10.6, E.o3), 8);
			rise(g4, ep(u, 10.9, 11.7, E.o3), 8);
			rise(leanFoot, ep(u, 11.6, 12.4, E.o3), 6);
		}
		// Theorem 2 and Fig. 3b, revealed along its tick axis
		const T2 = inout(u, 13.8, 20.7, 0.7, E.io3);
		st(th2, 'opacity', T2.toFixed(3));
		st(fig.box, 'opacity', T2.toFixed(3));
		if (T2 > 0) {
			rise(th2Head, ep(u, 14.0, 14.7, E.o3), 6);
			rise(th2Big, ep(u, 14.2, 15.0, E.o3), 10);
			rise(th2Sub, ep(u, 15.4, 16.2, E.o3), 8);
			// the plot's left edge (axis and labels) shows first, then the ticks 1 .. 24 sweep in
			const v = lerp(1125, 1600, ep(u, 14.6, 18.6, E.io3));
			const right = ((1600 - v) / (1600 - 1050)) * 100;
			st(fig.box, 'clipPath', `inset(0 ${right.toFixed(2)}% 0 0)`);
		}
		void prog;
	};
}
