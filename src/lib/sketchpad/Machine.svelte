<script lang="ts">
	import { SUM_CODES } from './inside.ts';
	import { explain, type TickView } from './pad.svelte.ts';
	import { B } from './sprites.ts';

	interface Props {
		last: TickView | null;
		kind: 'add' | 'mul';
	}

	let { last, kind }: Props = $props();

	/** the adder: the carry on the sheet is the machine's state; each view the model reads is one arrow */
	const add = $derived.by(() => {
		if (!last || last.op !== 'ADD-FAST') return null;
		const from = last.cells[0] === '1' ? 1 : 0;
		const v = SUM_CODES.indexOf(last.out[0]);
		const to: number | 'halt' | null = v < 0 ? null : v === 20 ? 'halt' : v >= 10 ? 1 : 0;
		return { from, to, sum: v >= 0 && v < 20 ? v : null };
	});
	const on = (from: number, to: number | 'halt') => !!add && add.from === from && add.to === to;
	const addWords = $derived.by(() => {
		if (!last || !add) return '';
		if (add.to === 'halt') return 'Nothing left to add: halt.';
		if (add.sum === null) return `It wrote ${last.out[0]}.`;
		const [c, t, b] = last.cells;
		const digits = [t, b].filter((g) => g !== B);
		const sum = digits.reduce((x, g) => x + Number(g), 0) + (c === '1' ? 1 : 0);
		const s = add.sum;
		const write = `write ${s % 10}${s >= 10 ? ', carry 1' : ''}`;
		const terms = [...digits, ...(c === '1' ? ['carry 1'] : [])];
		const lhs = terms.length ? terms.join(' + ') : '0';
		// a pushed tick can write a sum that is not the column's
		return s === sum ? `${lhs} = ${s}: ${write}.` : `${lhs} = ${sum}, but it wrote ${s}: ${write}.`;
	});

	/**
	 * The multiplier's steps, by what they do (the word the model reads for each is in the One view panel): the inner
	 * loop (multiply, add) on the left, the end of a pass (add the last product digit, add the last carry, move to the
	 * next digit) along the bottom, halt above, and the return to multiply as an arc underneath, so no arrow crosses
	 * another or a letter. The model names the next step with its third token, the letter on each arrow.
	 */
	const R = 21;
	const NODES: Record<string, { x: number; y: number; words: string[] }> = {
		MUL: { x: 38, y: 100, words: ['multiply'] },
		ADD: { x: 38, y: 26, words: ['add'] },
		ADZ: { x: 114, y: 100, words: ['add last', 'digit'] },
		FLS: { x: 190, y: 100, words: ['add last', 'carry'] },
		NXT: { x: 266, y: 100, words: ['next', 'digit'] },
		H: { x: 266, y: 26, words: ['halt'] }
	};
	const STEP_WORDS: Record<string, string> = {
		MUL: 'multiply',
		ADD: 'add',
		ADZ: 'add the last product digit',
		FLS: 'add the last carry',
		NXT: 'next digit',
		H: 'halt'
	};
	const LETTER: Record<string, string> = {
		M: 'MUL',
		A: 'ADD',
		Z: 'ADZ',
		F: 'FLS',
		N: 'NXT',
		H: 'H'
	};
	const EDGES = [
		{ from: 'MUL', to: 'ADD', letter: 'A', bend: 14 },
		{ from: 'ADD', to: 'MUL', letter: 'M', bend: 14 },
		{ from: 'MUL', to: 'ADZ', letter: 'Z', bend: 0 },
		{ from: 'ADZ', to: 'FLS', letter: 'F', bend: 0 },
		{ from: 'FLS', to: 'NXT', letter: 'N', bend: 0 },
		{ from: 'NXT', to: 'MUL', letter: 'M', bend: -64 },
		{ from: 'NXT', to: 'H', letter: 'H', bend: 0 }
	];
	const mul = $derived.by(() => {
		if (!last || last.op === 'ADD-FAST') return null;
		return { from: last.op as string, to: LETTER[last.out[2]] ?? null, letter: last.out[2] };
	});
	const mulWords = $derived.by(() => {
		if (!mul) return '';
		// a calculator step (SUB, EST, DEC) is not on the multiplier's diagram: say what it did
		if (!(mul.from in NODES) && last) return `${mul.from}: ${explain(last.op, last.out)}.`;
		const to = mul.to ? STEP_WORDS[mul.to] : null;
		return `It took “${STEP_WORDS[mul.from]}”, then wrote ${mul.letter}: ${to ? (mul.to === 'H' ? 'halt' : `next, ${to}`) : 'no step'}.`;
	});

	/** an arrow between two states, bent by `bend`, and where its letter goes: off the curve's middle, outside the bend */
	function arc(x1: number, y1: number, x2: number, y2: number, bend: number, r = R) {
		const dx = x2 - x1;
		const dy = y2 - y1;
		const d = Math.hypot(dx, dy) || 1;
		const ux = dx / d;
		const uy = dy / d;
		const sx = x1 + ux * r;
		const sy = y1 + uy * r;
		const ex = x2 - ux * (r + 2);
		const ey = y2 - uy * (r + 2);
		const mx = (sx + ex) / 2 - uy * bend;
		const my = (sy + ey) / 2 + ux * bend;
		// straight arrows carry their letter on their left (above a rightward arrow, clear of the arc below)
		const side = bend > 0 ? 1 : -1;
		const cx = (sx + 2 * mx + ex) / 4;
		const cy = (sy + 2 * my + ey) / 4;
		return {
			d: `M${sx},${sy} Q${mx},${my} ${ex},${ey}`,
			lx: cx - uy * 9 * side,
			ly: cy + ux * 9 * side
		};
	}
</script>

<figure class="sp-panel machine">
	<figcaption class="sp-cap">
		<span class="sp-title">The machine</span>
		<span class="sp-sub">its state is on the sheet; the model takes every arrow</span>
	</figcaption>
	<div class="sp-body">
		{#if kind === 'add'}
			<svg viewBox="0 0 270 150" role="img" aria-label="The adder as a two-state machine">
				<defs>
					<marker
						id="ma"
						viewBox="0 0 8 8"
						refX="7"
						refY="4"
						markerWidth="6"
						markerHeight="6"
						orient="auto"
					>
						<path d="M0,0 L8,4 L0,8 z" class="head" />
					</marker>
					<marker
						id="ma-on"
						viewBox="0 0 8 8"
						refX="7"
						refY="4"
						markerWidth="6"
						markerHeight="6"
						orient="auto"
					>
						<path d="M0,0 L8,4 L0,8 z" class="head on" />
					</marker>
				</defs>
				{#each [{ s: 0, x: 65, loop: 'M51.2,58.3 C27,4 103,4 78.8,58.3' }, { s: 1, x: 205, loop: 'M191.2,58.3 C167,4 243,4 218.8,58.3' }] as n (n.s)}
					{@const self = on(n.s, n.s)}
					<path
						class="edge"
						class:on={self}
						d={n.loop}
						marker-end={self ? 'url(#ma-on)' : 'url(#ma)'}
					/>
					<text class="elab" class:on={self} x={n.x} y="12" text-anchor="middle"
						>{n.s === 0 ? 'sum < 10' : 'sum ≥ 10'}</text
					>
				{/each}
				<path
					class="edge"
					class:on={on(0, 1)}
					d="M86.2,66.7 Q135,42 182.0,65.8"
					marker-end={on(0, 1) ? 'url(#ma-on)' : 'url(#ma)'}
				/>
				<text class="elab" class:on={on(0, 1)} x="135" y="50" text-anchor="middle">sum ≥ 10</text>
				<path
					class="edge"
					class:on={on(1, 0)}
					d="M183.8,89.3 Q135,114 88.0,90.2"
					marker-end={on(1, 0) ? 'url(#ma-on)' : 'url(#ma)'}
				/>
				<text class="elab" class:on={on(1, 0)} x="135" y="113" text-anchor="middle"
					>sum &lt; 10</text
				>
				<path
					class="edge"
					class:on={on(0, 'halt')}
					d="M65,102 L65,124"
					marker-end={on(0, 'halt') ? 'url(#ma-on)' : 'url(#ma)'}
				/>
				<text class="node-t" class:on={on(0, 'halt')} x="65" y="138" text-anchor="middle">halt</text
				>
				{#each [{ s: 0, x: 65 }, { s: 1, x: 205 }] as n (n.s)}
					<circle class="node" class:on={add?.from === n.s} cx={n.x} cy="78" r="24" />
					<!-- the state: the carry the sheet holds -->
					<text class="state-k" class:on={add?.from === n.s} x={n.x} y="70" text-anchor="middle"
						>carry</text
					>
					<text class="state-v" class:on={add?.from === n.s} x={n.x} y="92" text-anchor="middle"
						>{n.s}</text
					>
				{/each}
			</svg>
		{:else}
			<svg viewBox="0 0 300 150" role="img" aria-label="The multiplier's steps as a machine">
				<defs>
					<marker
						id="mm"
						viewBox="0 0 8 8"
						refX="7"
						refY="4"
						markerWidth="6"
						markerHeight="6"
						orient="auto"
					>
						<path d="M0,0 L8,4 L0,8 z" class="head" />
					</marker>
					<marker
						id="mm-on"
						viewBox="0 0 8 8"
						refX="7"
						refY="4"
						markerWidth="6"
						markerHeight="6"
						orient="auto"
					>
						<path d="M0,0 L8,4 L0,8 z" class="head on" />
					</marker>
				</defs>
				{#each EDGES as e (e.from + e.to)}
					{@const a = NODES[e.from]}
					{@const b = NODES[e.to]}
					{@const g = arc(a.x, a.y, b.x, b.y, e.bend)}
					{@const lit = !!mul && mul.from === e.from && mul.to === e.to}
					<path class="edge" class:on={lit} d={g.d} marker-end={lit ? 'url(#mm-on)' : 'url(#mm)'} />
					<text class="elab mono" class:on={lit} x={g.lx} y={g.ly + 3} text-anchor="middle"
						>{e.letter}</text
					>
				{/each}
				{#each Object.entries(NODES) as [k, n] (k)}
					<circle class="node" class:on={mul?.from === k} cx={n.x} cy={n.y} r={R} />
					<text
						class="node-t"
						class:on={mul?.from === k}
						x={n.x}
						y={n.y + 3.5 - (n.words.length - 1) * 5}
						text-anchor="middle"
					>
						{#each n.words as w, i (i)}<tspan x={n.x} dy={i ? 10 : 0}>{w}</tspan>{/each}
					</text>
				{/each}
			</svg>
		{/if}
	</div>
	<p class="sp-foot num">
		{#if kind === 'add'}{addWords ||
				'Each view the model reads is one arrow; the carry on the sheet is the state.'}{:else}{mulWords ||
				'Each view is one arrow: its third token, the letter, names the next step.'}{/if}
	</p>
</figure>

<style>
	svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	.mono {
		font-family: var(--font-mono);
	}
	/* the step the model just took is rose; the rest of the machine stays in quiet ink */
	.edge {
		fill: none;
		stroke: var(--color-blue-grey);
		stroke-width: 1;
		transition:
			stroke var(--hover) ease,
			stroke-width var(--hover) ease;
	}
	.edge.on {
		stroke: var(--color-rose);
		stroke-width: 1.6;
	}
	.head {
		fill: var(--color-blue-grey);
	}
	.head.on {
		fill: var(--color-rose);
	}
	.elab {
		font-size: 10px;
		fill: var(--color-ink-soft);
		transition: fill var(--hover) ease;
	}
	.elab.on {
		fill: var(--color-rose);
	}
	.node {
		fill: var(--color-paper);
		stroke: var(--color-blue-grey);
		stroke-width: 1;
		transition:
			stroke var(--hover) ease,
			fill var(--hover) ease;
	}
	.node.on {
		stroke: var(--color-ink);
		fill: var(--color-tint);
	}
	.node-t {
		font-size: 9px;
		fill: var(--color-ink-soft);
	}
	.node-t.on {
		fill: var(--color-ink);
	}
	.state-k {
		font-size: 9px;
		fill: var(--color-ink-soft);
	}
	.state-v {
		font-family: var(--font-mono);
		font-size: 16px;
		fill: var(--color-ink-soft);
	}
	.state-k.on,
	.state-v.on {
		fill: var(--color-ink);
	}
</style>
