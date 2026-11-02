/**
 * Shot 1, silent errors: problem 71 of the comparison. Two 300-digit numbers, the answer GPT-6.1 Sol returned, and
 * the one digit in which it differs from the true sum. Every digit is from paper/baselines/results.json.
 */
import { h, ep, prog, E, st, rise, lerp, inout, C, mix } from '../film/lib.js';

const CW = 13; // character cell, px (Geist Mono at 22 px)
const LH = 34;
const PER = 100;

export default function silent(root, D) {
	const s = D.silent;
	const left = 360;
	const cam = h('div', { class: 'abs', style: { inset: '0', transformOrigin: '0 0' } }, root);

	// lines of a number, right-aligned in rows of 100; the answer's extra leading digit hangs one column to the left
	const lines = (str) => {
		const out = [];
		const n = str.length;
		const rows = Math.ceil((n - (n % PER === 1 ? 1 : 0)) / PER);
		for (let k = 0; k < rows; k++) {
			const end = n - (rows - 1 - k) * PER;
			const start = k === 0 ? 0 : end - PER;
			out.push({ start, end });
		}
		return out;
	};
	const top0 = 318;
	const place = (str, y0, cls) => {
		const els = [];
		lines(str).forEach(({ start, end }, k) => {
			const row = h(
				'div',
				{
					class: `abs mono ${cls}`,
					style: {
						top: `${y0 + k * LH}px`,
						left: `${left + (PER - (end - start)) * CW}px`,
						fontSize: '22px',
						lineHeight: `${LH}px`,
						display: 'flex'
					}
				},
				cam
			);
			const spans = [];
			for (let i = start; i < end; i++)
				spans.push(
					h(
						'span',
						{ style: { width: `${CW}px`, textAlign: 'center', display: 'inline-block' } },
						row,
						str[i]
					)
				);
			els.push({ row, spans, start });
		});
		return els;
	};
	const A = place(s.a, top0, '');
	const B = place(s.b, top0 + 3 * LH + 22, '');
	const ruleY = top0 + 6 * LH + 44;
	const rule = h(
		'div',
		{
			class: 'abs',
			style: {
				left: `${left - CW}px`,
				width: `${(PER + 1) * CW}px`,
				top: `${ruleY}px`,
				height: '1.5px',
				background: C.ink,
				transformOrigin: '100% 50%'
			}
		},
		cam
	);
	const ANS = place(s.answer, ruleY + 14, '');
	const spans = ANS.flatMap((r) => r.spans);

	const label = (y, html, color = C.soft) =>
		h(
			'div',
			{
				class: 'abs',
				style: {
					top: `${y}px`,
					left: '0',
					width: `${left - 40}px`,
					textAlign: 'right',
					fontSize: '18px',
					lineHeight: `${LH}px`,
					color,
					whiteSpace: 'nowrap'
				}
			},
			cam,
			html
		);
	const la = label(top0, '300 digits');
	const lb = label(top0 + 3 * LH + 22, '+ 300 digits');
	const lg = label(ruleY + 14 + LH, 'GPT-6.1 Sol', C.cobalt);
	const lg2 = label(ruleY + 14 + 2 * LH, 'problem 71', C.grey);

	// the wrong digit and the ring around it
	const wi = s.answer.length - s.wrongFromRight;
	const rowOf = ANS.findIndex((r) => wi >= r.start && wi < r.start + r.spans.length);
	const colOf = wi - ANS[rowOf].start;
	const wx = parseFloat(ANS[rowOf].row.style.left) + colOf * CW + CW / 2;
	const wy = ruleY + 14 + rowOf * LH + LH / 2;
	const ring = h(
		'div',
		{
			class: 'abs',
			style: {
				left: `${wx - 15}px`,
				top: `${wy - 17}px`,
				width: '30px',
				height: '34px',
				borderRadius: '9px',
				border: `2px solid ${C.cobalt}`,
				opacity: '0'
			}
		},
		cam
	);
	const note = h(
		'div',
		{
			class: 'abs',
			style: {
				left: `${wx + 26}px`,
				top: `${wy + 20}px`,
				fontSize: '11px',
				lineHeight: '15px',
				color: C.ink,
				whiteSpace: 'nowrap',
				opacity: '0'
			}
		},
		cam,
		`returned <span class="mono" style="color:${C.cobalt}">${s.answer[wi]}</span>; the true sum has <span class="mono">${s.truth[wi]}</span><br><span style="color:${C.soft}">digit ${s.wrongFromRight} from the right</span>`
	);
	const lead = h(
		'div',
		{
			class: 'abs',
			style: {
				left: `${wx + 9}px`,
				top: `${wy + 14}px`,
				width: '15px',
				height: '1px',
				background: C.ink,
				transform: 'rotate(38deg)',
				transformOrigin: '0 0',
				opacity: '0'
			}
		},
		cam
	);

	// screen-space footnote
	const foot = h(
		'div',
		{
			class: 'abs',
			style: {
				left: '120px',
				bottom: '84px',
				fontSize: '18px',
				lineHeight: '28px',
				color: C.soft,
				maxWidth: '1100px'
			}
		},
		root,
		'GPT-6.1 Sol · problem 71 · one wrong digit'
	);

	return (t) => {
		// as the camera closes in, everything but the wrong digit's row steps back, so the note has room
		const zf = ep(t, 9.4, 10.4, E.io3);
		A.forEach((r, k) =>
			rise(r.row, ep(t, 0.2 + k * 0.12, 1.1 + k * 0.12, E.o3) * (1 - 0.9 * zf), 10)
		);
		B.forEach((r, k) =>
			rise(r.row, ep(t, 0.7 + k * 0.12, 1.6 + k * 0.12, E.o3) * (1 - 0.9 * zf), 10)
		);
		ANS.forEach((r, k) => st(r.row, 'opacity', String(k === rowOf ? 1 : 1 - 0.92 * zf)));
		rise(la, ep(t, 0.2, 1.0, E.o3), 6);
		rise(lb, ep(t, 0.7, 1.5, E.o3), 6);
		st(rule, 'transform', `scaleX(${ep(t, 1.6, 2.3, E.io3).toFixed(4)})`);
		rise(lg, ep(t, 2.2, 2.9, E.o3), 6);
		rise(lg2, ep(t, 2.4, 3.1, E.o3), 6);
		// the answer streams in, most significant digit first, as a reply does
		const T0 = 2.4,
			T1 = 6.0;
		const n = spans.length;
		// after the stream, the digits that agree with the true sum recede, right to left, as a column check would
		const C0 = 6.6,
			C1 = 8.4;
		for (let i = 0; i < n; i++) {
			const sp = spans[i];
			const shown = prog(t, T0 + ((T1 - T0) * i) / n, T0 + ((T1 - T0) * i) / n + 0.12);
			const fromRight = n - 1 - i;
			const checked =
				i === wi
					? 0
					: ep(t, C0 + ((C1 - C0) * fromRight) / n, C0 + ((C1 - C0) * fromRight) / n + 0.35, E.o2);
			st(sp, 'opacity', shown.toFixed(3));
			st(
				sp,
				'color',
				i === wi
					? t > C0 + ((C1 - C0) * (n - 1 - wi)) / n
						? C.cobalt
						: C.ink
					: mix(C.ink, '#C9D1E0', checked)
			);
		}
		// operands recede with the check
		const rec = ep(t, C0, C1, E.io3);
		for (const r of [...A, ...B]) st(r.row, 'color', mix(C.ink, '#C9D1E0', rec * 0.85));
		const ringU = ep(t, 8.5, 9.3, E.o5);
		st(ring, 'opacity', ringU.toFixed(3));
		st(ring, 'transform', `scale(${lerp(1.8, 1, ringU).toFixed(3)})`);
		const noteU = ep(t, 10.4, 11.2, E.o3);
		st(note, 'opacity', noteU.toFixed(3));
		st(lead, 'opacity', noteU.toFixed(3));
		// the camera goes to the digit
		const z = ep(t, 9.0, 12.4, E.io5);
		const s1 = lerp(1, 3.1, z);
		const cx = lerp(960, wx, z),
			cy = lerp(540, wy, z);
		const tx = 960 - cx * s1 + lerp(0, -40, z),
			ty = 540 - cy * s1 + lerp(0, -50, z);
		st(
			cam,
			'transform',
			`translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${s1.toFixed(4)})`
		);
		rise(foot, inout(t, 10.6, 15.2, 0.8, E.o3), 8);
		st(cam, 'opacity', '1');
	};
}
