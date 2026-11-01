/** Version 2: deterministic pictures driven by the measured narration, with no published-site changes. */
import {
	C,
	g,
	text,
	lines,
	line,
	rect,
	ring,
	dot,
	alpha,
	transform,
	arrow,
	heading,
	footer,
	capture,
	img,
	p,
	ease,
	mix,
	scoreColor
} from './draw.js';
const [TL, D, INSIDE, DEPTH, CALC, CHAT, ALG, MANIFEST] = await Promise.all(
	[
		'/video/v2/timeline.json',
		'/video/film/data/film.json',
		'/paper/figures/data/inside_e7.json',
		'/paper/figures/data/steer_e7_sweep.json',
		'/static/recordings/calc.json',
		'/static/recordings/chat.json',
		'/paper/figures/data/algebra.json',
		'/video/out/capture/manifest.json'
	].map((u) =>
		fetch(u).then((r) => {
			if (!r.ok) throw Error(u);
			return r.json();
		})
	)
);
await document.fonts.load('36px Geist');
await document.fonts.load('36px "Geist Mono"');
await document.fonts.load('62px "Source Serif"');
const sprites = await img('/static/sketchpad/sprites.png');
const timing = Object.fromEntries(TL.narration.map((n) => [n.id, n]));
const at = (id) => timing[id].at;
const phase = (t, id) => p(t, at(id), at(id) + timing[id].duration);
const fade = (t, a, d = 0.65) => ease(p(t, a, a + d));
// Fail on stale input data instead of silently illustrating different results.
if (!CALC.result.lines[0].includes('3.1428571428')) throw Error('Division result changed');
if (!CHAT.result.lines[0].includes('15880 seats are empty.')) throw Error('Chat result changed');
if (ALG.source !== 'factor x^3-6x^2+11x-6') throw Error('Algebra example changed');
if (MANIFEST.machine.frames !== 540 || MANIFEST.inside.frames !== 600)
	throw Error('Capture range changed');
if (Object.values(D.cert.blocks).flat(2).length !== 2446)
	throw Error('Certificate row count changed');
if (DEPTH['MUL@15'] !== 0 || DEPTH['MUL@19'] !== 0 || DEPTH['MUL@20'] !== 1)
	throw Error('Depth result changed');
function sheet(x, y, s = 1, k = 0, showView = true) {
	transform(x, y, s, () => {
		const tk = D.mul.ticks[Math.min(k, D.mul.ticks.length - 1)];
		const rows = k >= D.mul.ticks.length ? D.mul.final : tk.before;
		const cw = 39,
			rh = 50;
		rows.forEach((row, r) =>
			row.forEach((v, c) => {
				rect(c * cw, r * rh, cw - 1, rh - 1, '#f8f9fc');
				text(v, c * cw + 8, r * rh + 6, 30, r < 2 ? C.ink : C.rose, { mono: true });
			})
		);
		line(0, 98, 390, 98, C.mist);
		line(0, 248, 390, 248, C.mist);
		if (showView && k < D.mul.ticks.length)
			tk.fovea.forEach((q) => {
				if (q) ring(q.c * cw, q.r * rh, cw - 1, rh - 1, C.rose, 2);
			});
	});
}
function strip(x, y, s = 3, view = D.mul.ticks[0].view) {
	g.save();
	g.imageSmoothingEnabled = false;
	view.forEach((v, j) => {
		let i = ' 0123456789'.indexOf(v);
		g.drawImage(sprites, i * 32, j * 32, 32, 32, x, y + j * 32 * s, 32 * s, 32 * s);
	});
	g.restore();
	ring(x, y, 32 * s, 96 * s, C.rose, 2);
}
function grid(x, y, w, h, progress = 1, labels = true) {
	const names = {
		MUL: 'Multiply',
		SUM: 'Column addition',
		ADD: 'Add product',
		ADZ: 'Last product',
		SUB: 'Subtract',
		EST: 'Estimate division',
		NXT: 'Next digit',
		DEC: 'Lower estimate',
		FLS: 'Last carry'
	};
	// True certificate rows, in nine groups, each with its full row count.
	const order = ['MUL', 'SUM', 'ADD', 'ADZ', 'SUB', 'EST', 'NXT', 'DEC', 'FLS'];
	let n = 0;
	for (let j = 0; j < order.length; j++) {
		const name = order[j],
			b = D.cert.blocks[name];
		let bx, by, bw, bh;
		if (j === 0) {
			bx = x;
			by = y;
			bw = w * 0.77;
			bh = h * 0.48;
		} else if (j < 6) {
			bx = x + (j - 1) * w * 0.195;
			by = y + h * 0.66;
			bw = w * 0.17;
			bh = h * 0.34;
		} else {
			bx = x + w * 0.84;
			by = y + (j - 6) * h * 0.19;
			bw = w * 0.16;
			bh = h * 0.11;
		}
		const ch = Math.min(bh / b.length, bw / b[0].length);
		if (labels) text(names[name], bx, by - 40, 28, C.soft);
		for (let r = 0; r < b.length; r++)
			for (let c = 0; c < b[r].length; c++) {
				const active = n++ / 2446 < progress;
				rect(
					bx + c * ch,
					by + r * ch,
					Math.max(1, ch - 1),
					Math.max(1, ch - 1),
					active ? scoreColor(b[r][c]) : '#edf0f5'
				);
			}
	}
}
function cloud(x, y, w, h, turn = 0, labels = true) {
	const F = INSIDE.families.MUL;
	const a = 0.22 + turn;
	const proj = ([px, py, pz]) => [px * Math.cos(a) + pz * Math.sin(a), py * 0.85 + pz * 0.24];
	const pts = F.cloud.map(proj);
	const xs = pts.map((q) => q[0]),
		ys = pts.map((q) => q[1]);
	const minX = Math.min(...xs),
		maxX = Math.max(...xs),
		minY = Math.min(...ys),
		maxY = Math.max(...ys);
	const sc = Math.min(w / (maxX - minX), h / (maxY - minY)) * 0.86;
	const tx = (q) => x + w / 2 + (q[0] - (minX + maxX) / 2) * sc,
		ty = (q) => y + h / 2 - (q[1] - (minY + maxY) / 2) * sc;
	pts.forEach((q, i) => {
		const d = Number(F.cloudLabels[i]);
		dot(
			tx(q),
			ty(q),
			labels ? 3.6 : 2.5,
			`rgb(${mix(37, 214, d / 9)},${mix(87, 51, d / 9)},${mix(167, 108, d / 9)})`
		);
	});
	if (labels)
		for (const [label, q] of Object.entries(F.labels)) {
			const c = proj(q);
			text(label, tx(c) + 9, ty(c) - 24, 32, C.ink, { mono: true });
		}
}
function curve(x, y, w, h, u = 1, labels = true) {
	const sx = (d) => x + ((d - 1) / 22) * w,
		sy = (v) => y + h - v * h;
	if (labels) {
		line(x, y, x, y + h, C.mist);
		line(x, y + h, x + w, y + h, C.mist);
		[0, 1].forEach((v) =>
			text(v ? '80 / 80' : '0 / 80', x - 20, sy(v) - 18, 32, C.soft, { align: 'right' })
		);
		[1, 5, 10, 15, 19, 20, 23].forEach((d) =>
			text(String(d), sx(d), y + h + 20, 30, C.soft, { align: 'center' })
		);
	}
	const end = 1 + 22 * u;
	g.save();
	g.beginPath();
	g.strokeStyle = C.cobalt;
	g.lineWidth = labels ? 6 : 3;
	for (let d = 1; d <= Math.min(23, Math.floor(end)); d++) {
		const yy = sy(DEPTH[`MUL@${d}`]);
		if (d === 1) g.moveTo(sx(d), yy);
		else g.lineTo(sx(d), yy);
	}
	g.stroke();
	g.restore();
	if (labels && end >= 20) {
		dot(sx(20), sy(1), 9, C.rose);
		text('Layer 20', sx(20) - 30, y - 80, 36, C.rose, { align: 'right' });
		text('Every tested answer changes', x + w * 0.3, y - 32, 32, C.soft);
	}
}
function model(x, y, u = 1, pulse = 0) {
	alpha(u, () => {
		for (let j = 0; j < 24; j++) {
			const glow = Math.abs(j / 23 - pulse) < 0.09;
			rect(x + j * 12, y, 7, 180, glow ? C.rose : (j + 1) % 4 === 0 ? C.cobalt : '#dce3ef');
		}
		text('Qwen3.5 · 0.8B', x + 144, y + 210, 38, C.ink, { align: 'center' });
	});
}
function bigEquation(y = 430) {
	text('x³ − 6x² + 11x − 6', 960, y, 72, C.ink, { serif: true, align: 'center' });
	text('= (x − 1)(x − 2)(x − 3)', 960, y + 110, 68, C.rose, { serif: true, align: 'center' });
}
function recorded(label = 'dialogue adapter · trained further for chat') {
	text(`Recorded model run · ${label}`, 100, 849, 30, C.soft);
}
function first(t) {
	const s = D.silent;
	const zoom = fade(t, at('N02'), 2);
	text('A language model learns to predict text.', 100, 84, 38, C.soft);
	text('One wrong digit. No warning.', 100, 160, 70, C.ink, { serif: true });
	if (zoom < 1) {
		alpha(1 - zoom, () => {
			const a = s.a.match(/.{1,75}/g),
				b = s.b.match(/.{1,75}/g),
				ans = s.answer.match(/.{1,75}/g);
			text('Two 300-digit inputs', 100, 300, 32, C.soft);
			a.forEach((v, i) => text(v, 100, 360 + i * 34, 29, C.ink, { mono: true }));
			b.forEach((v, i) => text(v, 100, 530 + i * 34, 29, C.ink, { mono: true }));
			line(100, 685, 1780, 685);
			text('GPT-6.1 Sol', 100, 716, 32, C.cobalt);
			ans.forEach((v, i) => text(v, 100, 765 + i * 34, 29, C.cobalt, { mono: true }));
		});
	}
	alpha(zoom, () => {
		const ix = s.truth.length - s.wrongFromRight;
		const a = Math.max(0, ix - 9);
		const b = Math.min(s.truth.length, ix + 10);
		const str = s.answer.slice(a, b),
			ref = s.truth.slice(a, b);
		const x = 350,
			cw = 67;
		text('GPT-6.1 Sol’s answer', 100, 380, 36, C.cobalt);
		text('Reference sum', 100, 605, 36, C.soft);
		[...str].forEach((v, i) =>
			text(v, x + i * cw, 460, 72, i === ix - a ? C.rose : C.ink, { mono: true })
		);
		[...ref].forEach((v, i) =>
			text(v, x + i * cw, 680, 72, i === ix - a ? C.rose : C.ink, { mono: true })
		);
		ring(x + (ix - a) * cw - 8, 447, 76, 110, C.rose, 4);
		line(x + (ix - a) * cw + 30, 562, x + (ix - a) * cw + 30, 665, C.rose, 3);
		text('One differing digit in a 301-digit answer', 100, 930, 38, C.soft);
	});
	text('Paper · Introduction / comparison problem 71', 100, 1020, 22, C.soft);
}
function title(t, sc) {
	const u = t - sc.start,
		drift = Math.sin(u * 0.25) * 5;
	alpha(fade(t, sc.start, 0.8), () => {
		transform(155, 135 + drift, 0.64, () => {
			text('x³ − 6x² + 11x − 6', 0, 0, 60, C.ink, { serif: true });
			text('= (x − 1)(x − 2)(x − 3)', 0, 100, 58, C.rose, { serif: true });
		});
		cloud(1230, 95 - drift, 500, 285, u * 0.008, false);
		sheet(180, 655 + drift, 0.85, 12, true);
		grid(1190, 700 - drift, 520, 220, 1, false);
		curve(730, 815, 340, 130, 1, false);
		text('Sketchpad', 960, 410, 158, C.rose, { serif: true, weight: 500, align: 'center' });
		text('Mostafa ‘Neo’ Mohsenvand', 960, 602, 34, C.soft, { align: 'center' });
	});
}
function idea(t, sc) {
	heading(
		'01 / THE IDEA',
		'A working sheet for a small model',
		'Vision-language model: reads images as well as text'
	);
	const cells = fade(t, sc.start + 0.4),
		image = fade(t, at('N04') + 0.5),
		m = fade(t, at('N04') + 3),
		out = fade(t, at('N05') + 0.5);
	alpha(cells, () => {
		sheet(120, 360, 1.25, 0, true);
		text('Three cells', 610, 400, 36, C.rose);
	});
	alpha(image, () => {
		arrow(615, 500, 790, 500, C.rose);
		strip(805, 355, 3);
		text('Image', 853, 680, 34, C.soft, { align: 'center' });
	});
	// Model and all output wires appear only after their inputs exist.
	alpha(m, () => {
		arrow(920, 500, 1045, 500, C.rose);
		model(1070, 410, 1, p(t, at('N05'), at('N05') + 3));
	});
	alpha(out, () => {
		['7', '0', 'A'].forEach((v, i) => {
			arrow(1370, 440 + i * 65, 1475, 350 + i * 180, C.rose, out);
			text(v, 1510, 315 + i * 180, 72, C.rose, { mono: true });
		});
		text('Digit', 1610, 337, 34);
		text('Carry', 1610, 517, 34);
		text('Next operation', 1570, 697, 32);
	});
	if (t >= at('N07')) {
		rect(90, 770, 1740, 260, 'white');
		text('LoRA adapter', 100, 790, 45, C.rose, { serif: true });
		text('10.2 million added weights · 1.2% of the model', 100, 858, 38);
		footer(
			'Weights: learned numbers. Frozen: original weights stay fixed.\nFine-tuning: training an existing model for this task.',
			'Paper · The sheet machine / Model and Training'
		);
	} else if (t >= at('N06'))
		footer(
			'Bounded view: three fixed cells + operation.\nEarlier steps remain on the sheet; the next input stays the same size.',
			'Paper · Views and Runtime'
		);
	else if (t >= at('N05'))
		footer(
			'Forward pass: one trip through the model. Carry: amount passed to the next column.\nA: add this digit to the running total.',
			'Paper · Figure 1a / recorded multiplication view'
		);
	else
		footer(
			'The view becomes a 32 × 96 pixel image. The model reads the printed digits.',
			'Paper · The sheet machine / Views'
		);
}
async function demo(t, sc) {
	const u = phase(t, 'N08');
	if (t < at('N09')) {
		heading(
			'02 / TRAINING AND EXECUTION',
			'Learn every view. Return to the hard ones.',
			'Only the added weights are trained'
		);
		strip(210, 350, 3.2);
		arrow(330, 510, 580, 510, C.rose, fade(t, sc.start + 1));
		model(630, 410, 1, (u * 2) % 1);
		arrow(960, 510, 1180, 510, C.rose, fade(t, sc.start + 2));
		text('7   0   A', 1240, 425, 62, C.rose, { mono: true });
		text('Correct answer', 1230, 525, 36, C.soft);
		const r = p(t, sc.start + 4, at('N09') - 1);
		if (r > 0) {
			line(1280, 640, 1280, 755, C.cobalt, 3, r);
			line(1280, 755, 700, 755, C.cobalt, 3, r);
			arrow(700, 755, 700, 650, C.cobalt, r);
			text('Weak cases return for another training turn', 100, 800, 36, C.cobalt);
		}
		footer(
			'Ordinary text also stays in training, with the original model as the teacher.',
			'Paper · Training / E7 recipe and objective'
		);
	} else {
		const u = phase(t, 'N09');
		heading('02 / TRAINING AND EXECUTION', 'Now the trained model runs in the browser');
		if (u < 0.15) {
			await capture('machine', 450, null, 510, 265, 900, 562.5);
		} else if (u < 0.65) {
			await capture(
				'machine',
				Math.round(mix(40, 539, p(u, 0.15, 0.6))),
				[55, 580, 1360, 470],
				110,
				300,
				1292,
				446.5
			);
			text('4,821 × 3,967', 1470, 380, 32, C.ink, { serif: true });
			lines('Each new result digit is written by the model.', 1470, 470, 330, 34, C.soft);
			text('Result: 19,124,907', 110, 760, 54, C.rose, { mono: true });
		} else {
			await capture(
				'calc',
				Math.round(mix(350, 719, p(u, 0.65, 1))),
				[60, 580, 1370, 600],
				110,
				300,
				1164.5,
				510
			);
			text('22 ÷ 7', 1350, 330, 52, C.ink, { serif: true });
			text('3.1428571428…', 1130, 715, 54, C.rose, { mono: true });
			text('10 decimal places', 1350, 430, 32, C.soft);
		}
		recorded();
		footer(
			'Code moves the view. The model computes the result digits.',
			'Recorded demo · model revision fe9d599a / result from calc.json'
		);
	}
}
function proof(t, sc) {
	if (t < at('N11')) {
		heading('03 / THE FINITE LIST', 'Longer problems. The same kinds of view.');
		grid(130, 370, 1650, 425, fade(t, sc.start, 4));
		text('2,446', 960, 235, 80, C.rose, { serif: true, align: 'center' });
		footer(
			'All possible local views, grouped by the nine operations.',
			'Paper · Figure 1b / arithmetic adapter certificate'
		);
	} else if (t < at('N12')) {
		heading('03 / THE FINITE LIST', 'Exact: every step matches the arithmetic procedure');
		text('Every reached view correct', 960, 345, 56, C.rose, { serif: true, align: 'center' });
		text('⇕', 960, 427, 78, C.soft, { align: 'center' });
		text('Every reference run matched, at any length', 960, 540, 54, C.ink, {
			serif: true,
			align: 'center'
		});
		text('Given the runtime conditions', 960, 625, 34, C.soft, { align: 'center' });
		text('Lean: software that checks a mathematical proof', 100, 732, 38, C.cobalt);
		text('sheet_exact_iff', 100, 796, 33, C.cobalt, { mono: true });
		text('∀ v ∈ reachedViews query paint T I, f v = T v', 100, 844, 30, C.soft, { mono: true });
		footer(
			'Reference procedure: the intended pencil-and-paper rules.\nFor decimal outputs: the specified number of places.',
			'Paper · Exactness on views / paper/lean/Sheet.lean'
		);
	} else {
		heading('03 / THE FINITE LIST', 'What changes when earlier steps stay in the input?');
		text('The sheet', 100, 300, 42, C.rose, { serif: true });
		strip(290, 420, 3.2);
		text('Always three cells', 100, 790, 36, C.soft);
		text('Chain of thought', 800, 300, 42, C.cobalt, { serif: true });
		text('Written reasoning reads every earlier step', 800, 365, 34, C.soft);
		const count = 2 + Math.floor(phase(t, 'N12') * 4);
		for (let j = 0; j < count; j++) {
			const y = 450 + j * 55;
			for (let k = 0; k <= j; k++) rect(800 + k * 135, y, 110, 10, k === j ? C.cobalt : '#bac5d9');
			text(String(j + 1), 740, y - 12, 28, C.soft);
		}
		footer(
			'Possible histories keep growing. No finite test alone covers every longer history.',
			'Paper · Necessity of the pinned-sheet policy / Lean counterexample'
		);
	}
}
function cert(t) {
	if (t < at('N14')) {
		heading(
			'04 / THE CERTIFICATE',
			'Check every view on the device that runs it',
			'Certificate: the check and its repeatable record'
		);
		grid(130, 380, 1650, 400, phase(t, 'N13'));
		footer(
			'Device · model-file identity · output scores · every allowed view\nAnyone can repeat the check.',
			'Paper · Certificate format / arithmetic adapter · Apple M4'
		);
	} else if (t < at('N16')) {
		heading(
			'04 / THE CERTIFICATE',
			'The margin is the gap above the nearest rival',
			'Logit: the model’s score for a possible output'
		);
		const rounding = t >= at('N15'),
			batch = rounding && phase(t, 'N15') > 0.62;
		const x0 = 420,
			x1 = 1450,
			y = 535;
		const move = rounding ? Math.sin((Math.min(1, phase(t, 'N15') * 1.6) * Math.PI) / 2) * 350 : 0;
		line(x0, y, x1, y, C.mist, 3);
		dot(x0 + move, y, 12, C.cobalt);
		dot(x1 - move, y, 12, C.rose);
		text('Nearest rival', x0, 385, 36, C.cobalt, { align: 'center' });
		text('Correct answer', x1, 385, 36, C.rose, { align: 'center' });
		text('3.02', 960, 610, 80, C.rose, { serif: true, align: 'center' });
		text('Smallest measured gap · arithmetic adapter', 960, 710, 36, C.soft, { align: 'center' });
		if (rounding) {
			text('less than 1.51 →', 380, 450, 34, C.cobalt);
			text('← less than 1.51', 1150, 450, 34, C.rose);
		}
		if (batch)
			text('Tested batches of 2, 4 and 32: score changes ≤ 1.09', 960, 800, 38, C.ink, {
				align: 'center'
			});
		footer(
			rounding
				? 'Rounding: storing numbers with limited precision.\nThe guarantee holds if each score moves by less than 1.51.'
				: 'Every view passed on the Apple M4 laptop’s graphics processor (GPU).',
			'Paper · Robustness theorem / measured batch checks, not a universal hardware bound'
		);
	} else {
		heading(
			'04 / THE COMPARISON',
			'220 sums and products',
			'Pre-registered: problems and rules fixed before answers were seen'
		);
		const u = fade(t, at('N16') + 1, 2);
		[
			['Sketchpad', 220, C.rose],
			['GPT-6.1 Sol', 217, C.cobalt]
		].forEach(([name, n, c], i) => {
			text(name, 120, 380 + i * 190, 44, c);
			rect(510, 378 + i * 190, ((1050 * n) / 220) * u, 68, c);
			text(String(n), 1610, 376 + i * 190, 64, c, { serif: true });
		});
		text('Strongest of ten alternatives tested', 120, 730, 36, C.soft);
		footer(
			'Sums: 10–1,000 digits · product inputs: 2–20 digits\n220-problem server comparison; separate from the browser certificate.',
			'Paper · Figure 1c / comparison records'
		);
	}
}
async function algebra(t) {
	heading(
		'05 / ALGEBRA',
		'Arithmetic procedures become algebra',
		'Algebra: working with expressions containing unknowns'
	);
	if (t < at('N18')) {
		const u = phase(t, 'N17');
		if (u < 0.6) {
			await capture(
				'algebra',
				Math.round(mix(380, 719, u / 0.6)),
				[65, 815, 1010, 385],
				150,
				310,
				1212,
				462
			);
			recorded();
		} else {
			bigEquation(370);
			text('Factor: rewrite as a product', 960, 700, 38, C.soft, { align: 'center' });
			recorded();
		}
		footer(
			'Code arranges the symbolic steps. The model computes every new number.',
			'Paper · Algebra / recorded factorisation of x³ − 6x² + 11x − 6'
		);
	} else {
		bigEquation(310);
		text('The proof has a boundary', 100, 650, 46, C.cobalt, { serif: true });
		lines(
			'The certificate covers the procedures’ model steps. The runtime that moves the view is ordinary code, outside the computer-checked proof.',
			100,
			730,
			1690,
			40,
			C.ink
		);
		footer(
			'Runtime: code that lays out the sheet and moves the view.',
			'Paper · Certification / runtime conditions'
		);
	}
}
async function chat(t) {
	if (t < at('N20')) {
		heading(
			'06 / CHAT AND THE GATE',
			'One dial on the adapter',
			'Gate: multiplies the adapter’s contribution; set by the runtime'
		);
		const one = phase(t, 'N19') > 0.55;
		text('original model  +  dial × adapter', 960, 330, 63, C.ink, {
			serif: true,
			align: 'center'
		});
		line(575, 590, 1345, 590, C.mist, 5);
		dot(one ? 1345 : 575, 590, 24, one ? C.rose : C.cobalt);
		text('0', 575, 650, 54, C.cobalt, { align: 'center' });
		text('1', 1345, 650, 54, C.rose, { align: 'center' });
		text(
			one ? 'Uses the sheet' : 'The original model, bit for bit',
			960,
			770,
			48,
			one ? C.rose : C.cobalt,
			{ serif: true, align: 'center' }
		);
		footer(
			'Gate zero’s identity was checked in the paper’s CPU setup.',
			'Paper · Gating / identity test'
		);
	} else if (t < at('N21')) {
		heading(
			'06 / CHAT AND THE GATE',
			'The question opens the sheet',
			'Dialogue adapter: trained further to write sheet calls in chat'
		);
		await capture(
			'chat',
			Math.round(mix(300, 539, phase(t, 'N20'))),
			[45, 1060, 965, 320],
			100,
			335,
			1351,
			448
		);
		text('Gate = 1', 1530, 340, 40, C.rose);
		lines('Throughout the conversation', 1530, 405, 290, 34, C.soft);
		recorded();
		footer(
			'Sheet program: instructions for the arithmetic procedures.',
			'Recorded stadium question · 47 × 1,186 − 39,862 = 15,880'
		);
	} else if (t < at('N22')) {
		const u = phase(t, 'N21');
		heading('06 / CHAT AND THE GATE', 'Teaching the model when to use the sheet');
		if (u < 0.58) {
			text('On-policy distillation', 100, 310, 48, C.rose, { serif: true });
			lines(
				'Learn on replies the adapted model generates; the original model teaches.',
				100,
				395,
				1600,
				40,
				C.soft
			);
			text('Example dialogues', 100, 580, 36);
			arrow(470, 610, 635, 610, C.rose, fade(t, at('N21') + 1));
			text('Model replies', 680, 580, 36);
			arrow(980, 610, 1145, 610, C.rose, fade(t, at('N21') + 2));
			text('Original model teaches', 1190, 580, 36, C.cobalt);
		} else {
			text('Reinforcement learning: learn from rewards', 100, 310, 45, C.rose, { serif: true });
			text('GRPO: compare a group of replies; favour better rewards', 100, 395, 38, C.soft);
			[0, 1, 2, 3].forEach((j) => {
				rect(170, 530 + j * 62, 500 - j * 40, 9, j === 2 ? C.rose : C.mist);
				text(
					j === 2 ? 'Correct answer → higher reward' : 'Check the answer',
					800,
					510 + j * 62,
					34,
					j === 2 ? C.rose : C.soft
				);
			});
		}
		footer(
			'Arithmetic views stay in training.\nTraining rewards used exact-code sheet execution.',
			'Paper · Dialogue fine-tuning / supervised examples, distillation, GRPO'
		);
	} else {
		heading(
			'06 / CHAT AND THE GATE',
			'A measured cost in word-problem accuracy',
			'GSM8K: grade-school maths word problems'
		);
		[
			['Original model', 54.9, C.cobalt],
			['Dialogue adapter', 49.1, C.rose]
		].forEach(([name, v, c], j) => {
			text(name, 120, 380 + j * 170, 42, c);
			rect(580, 380 + j * 170, (v / 60) * 900, 60, c);
			text(v.toFixed(1) + '%', 1510, 378 + j * 170, 52, c, { serif: true });
		});
		text('−5.8 percentage points', 960, 750, 58, C.rose, { serif: true, align: 'center' });
		footer(
			'1,069 fresh items, not used in development.\nBoth models received exact execution for sheet calls.',
			'Paper · Fresh GSM8K comparison / 49.1% versus 54.9%'
		);
	}
}
async function inside(t) {
	if (t < at('N24'))
		heading('07 / INSIDE THE MODEL', 'Inspect the model. Change its internal numbers.');
	if (t < at('N24')) {
		const u = phase(t, 'N23');
		if (u < 0.52) {
			// Isolate the complete first-output column. 2.65× display scale makes original 12px digits readable.
			await capture('inside', 240, [55, 540, 265, 435], 300, 300, 344.5, 565.5);
			rect(300, 360, 70, 500, 'white');
			[
				[24, 379],
				[16, 530],
				[8, 681],
				[0, 832]
			].forEach(([n, y]) => text(String(n), 340, y, 34, C.soft, { align: 'right' }));
			text('24 processing layers', 300, 237, 34, C.rose);
			text('One view · output digit 8', 850, 340, 40, C.rose);
			lines(
				'Layer: one processing stage.\nInternal state: the numbers passed between layers.',
				850,
				435,
				850,
				40,
				C.soft
			);
			text('Recorded model run · dialogue adapter', 850, 710, 30, C.soft);
			footer(
				'The layer panel shows how the model’s answer develops through its processing stages.',
				'Recorded demo panel; numerical intervention claim uses the arithmetic adapter'
			);
		} else {
			cloud(180, 300, 850, 530, 0, true);
			text('State-space projection', 1120, 340, 46, C.rose, { serif: true });
			lines(
				'A simplified picture of the model’s internal numbers.\nEach point is a view, coloured by its answer.',
				1120,
				430,
				670,
				39,
				C.soft
			);
			footer(
				'Measured states from the arithmetic adapter. A visualisation, not a proof.',
				'Paper · Figure 6b / inside_e7.json'
			);
		}
	} else {
		heading(
			'07 / INSIDE THE MODEL',
			'A push toward another digit',
			'Arithmetic adapter · 80 multiplication cases tested'
		);
		curve(420, 410, 1280, 350, fade(t, at('N24'), 4));
		text('Depth: number of layers completed', 1060, 830, 36, C.soft, { align: 'center' });
		footer(
			'Intervention: change the internal numbers and measure the answer.\nNone changed through layer 15; 0/80 at layer 19; 80/80 at layer 20.',
			'Paper · Figure 6c / steer_e7_sweep.json'
		);
	}
}
function close() {
	text('Sketchpad', 100, 125, 130, C.rose, { serif: true });
	sheet(1390, 145, 0.95, D.mul.ticks.length, false);
	text('Give it two long numbers. Watch every digit.', 100, 340, 46, C.ink, { serif: true });
	text('neovand.github.io/sketchpad', 100, 460, 50, C.cobalt);
	text('Full check on a new device: all 2,446 views', 100, 575, 38, C.ink);
	text('Default recheck: the lowest-margin tenth of each table', 100, 637, 36, C.soft);
	line(100, 735, 1815, 735);
	text('Paper, code and model are open.', 100, 788, 40, C.ink, { serif: true });
	text('github.com/NeoVand/sketchpad', 100, 855, 34, C.soft);
	text('huggingface.co/mohsenvand/sketchpad-0.8b-preview', 100, 910, 34, C.soft);
	text('Mostafa ‘Neo’ Mohsenvand · MIT Media Lab', 100, 1000, 28, C.soft);
}
const SCENES = { silent: first, title, idea, demo, proof, cert, algebra, chat, inside, close };
async function seek(t) {
	const sc = TL.scenes.find((s) => t >= s.start && t < s.end) || TL.scenes.at(-1);
	rect(0, 0, 1920, 1080, 'white');
	await SCENES[sc.id](t, sc);
	// Brief dip to white at chapter boundaries, preserving the full frame during reading holds.
	const opacity = Math.min(
		sc.start === 0 ? 1 : fade(t, sc.start, 0.28),
		sc.id === 'close' ? 1 : 1 - fade(t, sc.end - 0.25, 0.25)
	);
	if (opacity < 1) alpha(1 - opacity, () => rect(0, 0, 1920, 1080, 'white'));
}
window.film = { seek, duration: TL.duration, fps: TL.fps, ready: true };
await seek(Number(new URLSearchParams(location.search).get('t') || 0));
