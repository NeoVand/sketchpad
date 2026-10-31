<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { asset, resolve } from '$app/paths';
	import { AddSheet } from '#lib/sketchpad/adder.ts';
	import { Grid } from '#lib/sketchpad/calc-sheet.ts';
	import { MulWave } from '#lib/sketchpad/multiplier.ts';
	import Certificate from '#lib/sketchpad/Certificate.svelte';
	import Chat from '#lib/sketchpad/Chat.svelte';
	import Inset from '#lib/sketchpad/Inset.svelte';
	import Lens from '#lib/sketchpad/Lens.svelte';
	import Machine from '#lib/sketchpad/Machine.svelte';
	import Procedure from '#lib/sketchpad/Procedure.svelte';
	import StateSpace from '#lib/sketchpad/StateSpace.svelte';
	import Derivation from '#lib/sketchpad/Derivation.svelte';
	import DigitWork from '#lib/sketchpad/DigitWork.svelte';
	import '#lib/sketchpad/panel.css';
	import { HAS_CALC, HF_CARD, HF_ROOT, MODELS, PROGRAM, type Kind } from '#lib/sketchpad/models.ts';
	import { pad } from '#lib/sketchpad/pad.svelte.ts';
	import { RefCalc, run as runWorkOrder } from '#lib/sketchpad/program/index.ts';
	import type { TickOp } from '#lib/sketchpad/protocol.ts';
	import Sheet from '#lib/sketchpad/Sheet.svelte';
	import { sourceOf } from '#lib/sketchpad/sources.ts';

	const SPRITES = asset('sketchpad/sprites.png');
	let modelsBase = '';
	let spritesUrl = '';

	/** the demo's four parts */
	type Part = 'machine' | 'calc' | 'algebra' | 'chat';
	const PARTS: { id: Part; n: number; label: string; short: string }[] = [
		{ id: 'machine', n: 1, label: 'The sheet machine', short: 'Sheet' },
		{ id: 'calc', n: 2, label: 'Calculate', short: 'Calculate' },
		{ id: 'algebra', n: 3, label: 'Algebra', short: 'Algebra' },
		{ id: 'chat', n: 4, label: 'Chat', short: 'Chat' }
	];
	let part = $state<Part>('machine');
	/** the sheet machine's operation, kept while another part is shown */
	let machineOp = $state<'add' | 'mul'>('add');
	/** Calculate and Algebra read the calculator's tables, which only some programs have learned (models.ts) */
	const calcPart = $derived(part === 'calc' || part === 'algebra');
	const calcOff = $derived(calcPart && !HAS_CALC);

	const rnd = (n: number) =>
		Array.from({ length: n }, (_, i) =>
			i === 0 ? 1 + Math.floor(Math.random() * 9) : Math.floor(Math.random() * 10)
		).join('');

	let a = $state('482917305561');
	let b = $state('739104826637');
	const LIMIT: Record<Kind, number> = { add: 2000, mul: 20, calc: 0 };
	/** the calculator's line (calc-task.ts) */
	let line = $state('22 ÷ 7 to 10 places');
	/** one line for each operation, signed numbers among them */
	const calcPresets = [
		'98765 + 43219',
		'5025 − 7831',
		'−482917 × 7391',
		'22 ÷ 7 to 10 places',
		'√2 to 6 places',
		'gcd(1071, 462)'
	];

	const presets: { label: string; op: Kind; n: number; m: number }[] = [
		{ label: '40-digit sum', op: 'add', n: 40, m: 40 },
		{ label: '1,000-digit sum', op: 'add', n: 1000, m: 1000 },
		{ label: '4 × 4', op: 'mul', n: 4, m: 4 },
		{ label: '6 × 6', op: 'mul', n: 6, m: 6 },
		{ label: '10 × 10', op: 'mul', n: 10, m: 10 }
	];

	/**
	 * Algebra's work orders, grouped by the cost model's seconds on an M4 for textbook steps with the light check
	 * (program/NOTES.md): under 12 s first (FEATURED holds them until the page has counted), the slower ones after,
	 * each with its time.
	 */
	const FEATURED = [
		'solve 3(x-2)+5=2x+14',
		'solve 7x+13=2026-4x',
		'solve 2x+3y=7, x-y=1',
		'solve x^2-x-6=0',
		'solve (2x-3)(x+5)=x^2+1-16',
		'123456 * 654321'
	];
	const SLOWER = [
		'solve 2x+3y-z=1, x-y+2z=3, 3x+y+z=8',
		'factor x^3-6x^2+11x-6',
		'expand (x+2)^5',
		'expand (2x-3)^4',
		'expand (x+1)^10'
	];
	let order = $state(FEATURED[0]);
	/** where the line the algebra's arithmetic feeds sits (Derivation reports it; DigitWork follows it) */
	let activeTop = $state<number | null>(null);
	const MODES = ['light', 'strong'] as const;
	/** the cost model's seconds for each preset, in each check mode (the reference arithmetic counts the steps) */
	let modelled = $state<Record<string, number>>({});
	const SUP: Record<string, string> = {
		'0': '⁰',
		'1': '¹',
		'2': '²',
		'3': '³',
		'4': '⁴',
		'5': '⁵',
		'6': '⁶',
		'7': '⁷',
		'8': '⁸',
		'9': '⁹'
	};
	/** a work order as a reader writes it: powers raised, true minus and times signs */
	const pretty = (s: string) =>
		s
			.replace(/\^(\d+)/g, (_, d: string) => [...d].map((c) => SUP[c]).join(''))
			.replace(/\*/g, '×')
			.replace(/-/g, '−');

	onMount(() => {
		spritesUrl = new URL(SPRITES, location.href).href;
		// the published program on Hugging Face, or (dev only) an unpublished one beside the sprites
		modelsBase = PROGRAM.local ? new URL('models/', spritesUrl).href : HF_ROOT;
		void pad.probe(modelsBase);
		pad.stage(a, b);
		const fromHash = PARTS.find((p) => `#${p.id}` === location.hash);
		if (fromHash) void setPart(fromHash.id, false);
		// local checks and the screenshot script drive the page through this handle
		if (import.meta.env.DEV) Object.assign(globalThis, { sketchpad: pad });
		void costs();
	});

	/** the cost model's time for every algebra preset, in both check modes (pure BigInt arithmetic, a few ms) */
	async function costs() {
		const out: Record<string, number> = {};
		for (const mode of ['light', 'strong'] as const)
			for (const o of [...FEATURED, ...SLOWER]) {
				const c = new RefCalc();
				await runWorkOrder(o, c, { checkMode: mode });
				out[`${mode}:${o}`] = c.total.seconds;
			}
		modelled = out;
	}
	const secondsOf = (o: string) => modelled[`${pad.checkMode}:${o}`];
	const BEATS = [...FEATURED, ...SLOWER];
	const groups = $derived.by(() => {
		const light = (o: string) => modelled[`light:${o}`];
		if (light(BEATS[0]) === undefined) return [FEATURED, SLOWER];
		return [BEATS.filter((o) => light(o) < 12), BEATS.filter((o) => light(o) >= 12)];
	});

	/** this page's path; a part adds only its hash */
	const DEMO = resolve('/demo');
	async function setPart(p: Part, write = true) {
		if (p === part) return;
		part = p;
		// the part shown is in the address, so a link (or a reload) opens it
		if (write) void goto(`${DEMO}#${p}` as typeof DEMO, { replace: true, shallow: true });
		if (p === 'machine') await setOp(machineOp);
		else if ((p === 'calc' || p === 'algebra') && HAS_CALC) {
			await setOp('calc');
			pad.clearRun();
			if (p === 'calc') pad.stageCalc(line);
			else void pad.stageAlgebra(order);
		}
	}

	/** the line typed in Calculate (or Algebra) is laid out a moment after typing stops */
	let staging = 0;
	function retype() {
		clearTimeout(staging);
		staging = window.setTimeout(
			() => (part === 'calc' ? pad.stageCalc(line) : part === 'algebra' && pad.stageAlgebra(order)),
			250
		);
	}

	const source = $derived(
		pad.sheet && !(calcPart && pad.op !== 'calc') ? sourceOf(pad.sheet) : null
	);
	const cert = $derived(pad.cert);
	const tickMs = $derived(pad.last?.ms ?? 160);
	const next = $derived.by((): { op: TickOp; cells: string[] } | null => {
		void pad.version;
		const s = pad.sheet;
		if (!s || s.done || calcOff) return null;
		// a calculator sheet laid out but not run: its first view
		if (s instanceof Grid) return pad.last ? null : pad.preview;
		if (s instanceof MulWave) {
			const q = s.active()[0];
			return q ? { op: q.op, cells: s.view(q) } : null;
		}
		return { op: s instanceof AddSheet ? 'ADD-FAST' : s.op, cells: s.view() };
	});
	const progress = $derived.by(() => {
		void pad.version;
		const s = pad.sheet;
		if (!s) return '';
		if (s instanceof Grid) return GRID_NAMES[s.title] ?? `one-digit multiplication, ${s.title}`;
		if (s instanceof AddSheet) return `${fmt(s.columnsDone)} of ${fmt(s.n)} columns`;
		if (s instanceof MulWave) {
			const on = s.active().map((q) => q.j + 1);
			return on.length
				? `${on.length === 1 ? 'pass' : 'passes'} ${on.length > 1 ? `${on[0]}–${on[on.length - 1]}` : on[0]} of ${s.m} under way`
				: `${s.m} passes done`;
		}
		return `digit ${Math.min(s.j + 1, s.m)} of ${s.m} of b`;
	});
	/** a calculator sheet's procedure, as the running line names it */
	const GRID_NAMES: Record<string, string> = {
		'a − b': 'subtraction',
		'a ÷ b': 'long division',
		'√a': 'square root'
	};

	const fmt = (n: number) => n.toLocaleString('en-US');
	/** a download size as a visitor reads it: KB below a megabyte, MB below a gigabyte, GB above */
	const bytes = (n: number) =>
		n >= 1e9
			? `${(n / 1e9).toFixed(2)} GB`
			: n >= 1e6
				? `${fmt(Math.round(n / 1e6))} MB`
				: `${fmt(Math.max(1, Math.round(n / 1e3)))} KB`;
	const mb = (n: number) => fmt(Math.round(n / 1e6));
	const duration = (s: number) =>
		s < 90 ? `${s.toFixed(s < 10 ? 1 : 0)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;

	/** what loading the program costs now: nothing once this browser has cached it */
	const cost = $derived(pad.costs[pad.op]);
	const missing = $derived(pad.available[pad.op] === false);
	const certBusy = $derived(cert.status === 'running');
	/** the shipped table's weakest rows are being checked on this device (runs may start meanwhile) */
	const spotBusy = $derived(!!cert.spot?.running);
	const certFailed = $derived(
		(cert.status === 'done' || cert.status === 'cached') && cert.pass < cert.rows
	);
	const loadNote = $derived.by(() => {
		const l = pad.lastLoad;
		if (!l || !pad.ready || l.id !== MODELS[pad.op].id) return '';
		if (!l.network) return `Loaded in ${l.seconds.toFixed(1)} s from this browser’s cache.`;
		const parts = [`${bytes(l.network)} fetched`];
		if (l.cached) parts.push(`${bytes(l.cached)} from this browser’s cache`);
		return `Loaded in ${l.seconds.toFixed(1)} s: ${parts.join(', ')}.`;
	});

	/** the panels that draw one tick follow the step the calculator is taking (the adder's or a three-answer step) */
	const panelKind = $derived<'add' | 'mul'>(
		pad.op === 'calc' ? (pad.last?.op === 'ADD-FAST' ? 'add' : 'mul') : pad.op
	);

	/** a calculator line or work order asked for while the tables are being checked starts when the check passes */
	async function calc(text: string, algebra = false) {
		// a run replaces the layout still to come from typing
		clearTimeout(staging);
		const start = () => (algebra ? pad.runAlgebra(text) : pad.runCalc(text));
		if (pad.canCalc) return void start();
		if (!certBusy && !pad.certifying) return;
		const ask = (queued = { a: text, b: '' });
		await pad.allSettled();
		if (queued !== ask) return;
		queued = null;
		if (pad.canCalc) void start();
	}

	/** a run asked for while the table is being checked starts when the check passes */
	let queued = $state.raw<{ a: string; b: string } | null>(null);
	async function go(x: string, y: string) {
		if (pad.canRun) return void pad.run(x, y);
		if (!certBusy) return;
		const ask = (queued = { a: x, b: y });
		await pad.certSettled();
		// typed over, switched operation or asked again meanwhile
		if (queued !== ask) return;
		queued = null;
		if (pad.canRun) void pad.run(x, y);
	}

	function digits(v: string) {
		return v.replace(/\D/g, '').slice(0, LIMIT[pad.op]);
	}

	/** what is typed is what the sheet shows, until a run takes it over */
	function type(which: 'a' | 'b', el: HTMLInputElement) {
		const v = digits(el.value);
		if (which === 'a') a = v;
		else b = v;
		queued = null;
		// drop anything that is not a digit from the field itself too
		if (el.value !== v) el.value = v;
		pad.stage(a, b);
	}

	/** switch the operation (a run in progress stops first); returns whether this switch took effect */
	async function setOp(k: Kind) {
		queued = null;
		if (k !== 'calc') machineOp = k;
		await pad.setOp(k);
		if (pad.op !== k) return false;
		if (k === 'calc') return true;
		if (k === 'mul' && (a.length > LIMIT.mul || b.length > LIMIT.mul)) {
			a = rnd(6);
			b = rnd(6);
		}
		pad.stage(a, b);
		return true;
	}

	async function preset(p: (typeof presets)[number]) {
		if (!(await setOp(p.op))) return;
		if (pad.running) return;
		a = rnd(p.n);
		b = rnd(p.m);
		pad.stage(a, b);
		go(a, b);
	}

	function edit(r: number, c: number, by: number) {
		if (!source) return false;
		const [row, x] = source.address(r, c);
		return pad.bump(row, x, by);
	}

	function load() {
		pad.load(modelsBase, spritesUrl);
	}
</script>

<svelte:head>
	<title>Sketchpad · demo</title>
	<meta
		name="description"
		content="Qwen3.5-0.8B computes exactly on a sheet that is its only working memory, reading it through its own vision tower, in your browser."
	/>
</svelte:head>

{#snippet runButton(algebra: boolean)}
	{#if pad.running}
		<button class="primary" onclick={() => pad.stop()}>Stop</button>
	{:else if calcPart}
		<button
			class="primary"
			disabled={calcOff || !pad.ready || (!pad.canCalc && !pad.certifying)}
			onclick={() => calc(algebra ? order : line, algebra)}>Run</button
		>
		{#if queued}<span class="hint">starts when the check ends</span>
		{:else if pad.ready && pad.certifying && !pad.canCalc}<span class="hint"
				>after the certificates</span
			>{/if}
	{:else}
		<button
			class="primary"
			disabled={!pad.ready || (!pad.canRun && !certBusy)}
			onclick={() => go(a, b)}>Run</button
		>
		{#if queued}<span class="hint">starts when the check ends</span>
		{:else if pad.ready && certBusy}<span class="hint">after the certificate</span>
		{:else if certFailed}<span class="hint"
				>off: {fmt(cert.rows - cert.pass)} views fail on this device</span
			>{/if}
	{/if}
{/snippet}

{#snippet status()}
	<!-- two fixed lines: the answer, then the facts behind it -->
	<div class="sp-foot status num" aria-live="polite">
		{#if calcOff}
			<p>&nbsp;</p>
		{:else if pad.running}
			<p class="verdict">
				<span>{fmt(pad.ticks)} {pad.ticks === 1 ? 'view' : 'views'}</span><span
					>{(pad.computeMs / Math.max(1, pad.ticks)).toFixed(0)} ms a view</span
				><span>{progress}</span>
			</p>
			<p>
				{#if pad.recovering}<span>the GPU was reset: loading the model again</span
					>{/if}{#if pad.sheet && !(pad.sheet instanceof Grid) && pad.sheet.edits}<span
						>{pad.sheet.edits} {pad.sheet.edits === 1 ? 'digit' : 'digits'} changed</span
					>{/if}{#if pad.pushes}<span
						>{pad.pushes} {pad.pushes === 1 ? 'view' : 'views'} pushed</span
					>{/if}
			</p>
		{:else if part === 'algebra' && pad.algebra}
			{@const r = pad.algebra}
			{@const refused = r.results.some((x) => x.status === 'refused')}
			<p class="verdict">
				{#if refused}<strong>Refused.</strong> A check failed, so the answer is withheld.
				{:else}<strong class:ok={r.ok}>{r.ok ? 'Exact.' : 'Wrong.'}</strong>
					{#if !r.ok}The page’s own arithmetic says <span class="ref">{r.want.join('; ')}</span
						>.{:else}Every line matches the page’s own arithmetic.{/if}{/if}
			</p>
			<p>
				<span>{fmt(r.ticks)} views in {fmt(r.steps)} steps, {duration(r.seconds)}</span><span
					>{#if r.certified}every view it read is certified{:else if r.unchecked === 0}every view it
						read passed{:else}{r.unchecked} unchecked {r.unchecked === 1
							? 'view'
							: 'views'}{/if}</span
				>
			</p>
		{:else if part === 'calc' && pad.calcResult}
			{@const r = pad.calcResult}
			<p class="verdict">
				<strong class:ok={r.ok}>{r.ok ? 'Exact.' : 'Wrong.'}</strong>
				{r.text} =
				<span class="got">{r.got.length > 48 ? `${r.got.slice(0, 48)}…` : r.got}</span>{#if !r.ok}
					(the page’s own arithmetic says <span class="ref">{r.want}</span>){/if}
			</p>
			<p>
				<span>{fmt(r.ticks)} views in {fmt(r.steps)} steps, {duration(r.seconds)}</span><span
					>{#if r.certified}every view it read is certified{:else if r.unchecked === 0}every view it
						read passed{:else}{r.unchecked} unchecked {r.unchecked === 1
							? 'view'
							: 'views'}{/if}</span
				>
			</p>
		{:else if part === 'machine' && pad.result}
			{@const r = pad.result}
			<p class="verdict">
				<strong class:ok={r.ok}>{r.ok ? 'Exact.' : 'Wrong.'}</strong>
				{#if r.ok}
					{#if r.operands[0].length + r.operands[1].length + r.got.length <= 48}
						{r.operands[0]}
						{pad.op === 'add' ? '+' : '×'}
						{r.operands[1]} = <span class="got">{r.got}</span>
					{:else}
						All {fmt(r.got.length)} digits of the {pad.op === 'add' ? 'sum' : 'product'} match.
					{/if}
				{:else if r.pushes}
					Pushed off course: the sheet says <span class="got"
						>{r.got.length > 30 ? `${r.got.slice(0, 30)}…` : r.got}</span
					>, not
					<span class="ref">{r.want.length > 30 ? `${r.want.slice(0, 30)}…` : r.want}</span>.
				{:else}
					The sheet says {r.got.length > 30 ? `${r.got.slice(0, 30)}…` : r.got}.
				{/if}
			</p>
			<p>
				<span>{fmt(r.ticks)} views in {fmt(r.steps ?? r.ticks)} steps, {duration(r.seconds)}</span
				><span
					>{#if r.certified && r.certSource === 'shipped'}certified (shipped, checked again here){:else if r.certified}certified
						on this device{:else if r.unchecked === 0}every view it read passed{:else}{r.unchecked}
						unchecked {r.unchecked === 1 ? 'view' : 'views'}{/if}</span
				>{#if r.pushes}<span>{r.pushes} pushed</span>{/if}{#if r.edits}<span>{r.edits} changed</span
					>{/if}
			</p>
		{:else if pad.runError}
			<p class="verdict">{pad.runError === 'stopped' ? 'Stopped.' : pad.runError}</p>
			{#if part === 'calc' && pad.runError !== 'stopped'}<p>
					Try a + b, a − b, a × b, a ÷ b to k places, √a to k places or gcd(a, b).
				</p>{/if}
		{:else if part === 'calc' && pad.ready}
			<p class="verdict">
				{pad.certifying
					? 'Checking the three tables it reads on this device first.'
					: 'Every digit is the model’s; signs and decimal points are layout.'}
			</p>
			<p>a + b, a − b, a × b, a ÷ b to k places, √a to k places, gcd(a, b)</p>
		{:else if part === 'algebra' && pad.ready}
			<p class="verdict">
				{pad.certifying
					? 'Checking the three tables it reads on this device first.'
					: 'The runtime plans the steps; every number in rose is the model’s.'}
			</p>
			<p>an expression, solve … (up to three unknowns), expand …, factor …</p>
		{:else if part === 'machine' && pad.ready && !certBusy}
			<p class="verdict">
				{pad.op === 'add'
					? 'Run, then click an unread digit to change it,'
					: 'Run, then click a later digit of b to change it,'}
			</p>
			<p>
				{pad.op === 'add'
					? 'or a number in the state space to push the next view.'
					: 'or a digit on the multiply map to push a step.'}
			</p>
		{:else if !pad.ready}
			<p class="verdict">Load the model to {part === 'algebra' ? 'solve it' : 'run it'}.</p>
			<p>
				{part === 'calc'
					? 'a + b, a − b, a × b, a ÷ b to k places, √a to k places, gcd(a, b)'
					: 'It downloads once; this browser keeps it.'}
			</p>
		{/if}
	</div>
{/snippet}

{#snippet pace()}
	<span class="opts" role="group" aria-label="Pace">
		<span class="hint">Pace</span>
		<button
			class="plain"
			aria-pressed={pad.pace === 0}
			onclick={() => (pad.pace = 0)}
			title="As fast as the GPU goes">fast</button
		>
		<button
			class="plain"
			aria-pressed={pad.pace > 0}
			onclick={() => (pad.pace = 900)}
			title="A pause between steps, so the inside views can follow each one">slow</button
		>
	</span>
{/snippet}

<main class="demo">
	<header class="head">
		<div class="title">
			<h1>Sketchpad</h1>
			<p class="lede">
				Qwen3.5-0.8B adds, subtracts, multiplies, divides, takes square roots and finds gcds
				exactly, on a sheet it reads with its own eyes. Every digit is the model’s; the page only
				paints and moves.
			</p>
			<p class="terms">
				A <em>view</em> is three cells of the sheet, read as one image; a <em>step</em> is one forward
				pass of the model, which answers one view or several at once.
			</p>
		</div>
		<div class="model" aria-live="polite">
			{#if pad.gpuOk === false}
				<p class="note">{pad.gpuReason}</p>
			{:else if missing}
				<p class="note">
					{PROGRAM.local
						? `The model files are not on this server (static/sketchpad/models/${PROGRAM.folder}/).`
						: 'The model files could not be reached.'}
				</p>
			{:else if pad.loading}
				{@const total = pad.expect}
				<div class="loading">
					<span class="num">
						{#if pad.recovering}
							Loading the model again
						{:else if pad.loadStage === 'compile'}
							Preparing the GPU
						{:else if total === 0}
							Reading the model from this browser’s cache
						{:else}
							Downloading: {mb(pad.received)} of {total ? mb(total) : '…'} MB
						{/if}
					</span>
					<span class="track"
						><i
							style:width="{pad.loadStage === 'compile' || total === 0
								? 100
								: total
									? Math.min(100, (pad.received / total) * 100)
									: 0}%"
						></i></span
					>
				</div>
			{:else if !pad.ready}
				<button class="primary" onclick={load} disabled={pad.gpuOk === null}>
					Load the model{cost === null ? '' : cost === 0 ? ' · cached' : ` · ${bytes(cost)}`}
				</button>
			{:else}
				<p class="note num">{loadNote}</p>
			{/if}
			{#if pad.loadError}<p class="note err">{pad.loadError}</p>{/if}
			{#if pad.gpuNote}<p class="note">{pad.gpuNote}</p>{/if}
		</div>
	</header>

	<nav class="parts" aria-label="Parts of the demo">
		{#each PARTS as p (p.id)}
			<button
				class="part"
				aria-current={part === p.id ? 'true' : undefined}
				onclick={() => setPart(p.id)}
				><span class="n num">{p.n}</span><span class="long">{p.label}</span><span class="short"
					>{p.short}</span
				></button
			>
		{/each}
	</nav>

	<!-- the controls of the part shown: one line, tone and spacing, no outlines -->
	{#if part === 'machine'}
		<div class="controls">
			<div class="ops" role="group" aria-label="Operation">
				<button class="plain" aria-pressed={pad.op === 'add'} onclick={() => setOp('add')}
					>Add</button
				>
				<button class="plain" aria-pressed={pad.op === 'mul'} onclick={() => setOp('mul')}
					>Multiply</button
				>
			</div>
			<div class="nums">
				<input
					value={a}
					oninput={(e) => type('a', e.currentTarget)}
					inputmode="numeric"
					autocomplete="off"
					spellcheck="false"
					disabled={pad.running}
					aria-label="First number"
				/>
				<span class="sign" aria-hidden="true">{pad.op === 'add' ? '+' : '×'}</span>
				<input
					value={b}
					oninput={(e) => type('b', e.currentTarget)}
					inputmode="numeric"
					autocomplete="off"
					spellcheck="false"
					disabled={pad.running}
					aria-label="Second number"
				/>
			</div>
			<div class="actions">{@render runButton(false)}</div>
			<div class="presets">
				{#each presets as p (p.label)}
					<button class="plain" disabled={pad.running} onclick={() => preset(p)}>{p.label}</button>
				{/each}
			</div>
			<div class="toggles">
				{#if pad.op === 'mul'}
					<button
						class="plain"
						aria-pressed={pad.parallel}
						disabled={pad.running}
						onclick={() => {
							pad.parallel = !pad.parallel;
							pad.stage(a, b);
						}}
						title="Run the passes of b overlapped, each two columns behind the one before, as one batch per step"
						>{pad.parallel ? 'Passes overlapped' : 'One pass at a time'}</button
					>
				{/if}
				{@render pace()}
			</div>
		</div>
	{:else if part === 'calc'}
		<div class="controls">
			<div class="nums wide">
				<input
					class="line"
					bind:value={line}
					oninput={retype}
					onkeydown={(e) => e.key === 'Enter' && calc(line)}
					autocomplete="off"
					spellcheck="false"
					disabled={pad.running || calcOff}
					aria-label="A calculation: a + b, a − b, a × b, a ÷ b to k places, √a to k places, gcd(a, b)"
				/>
			</div>
			<div class="actions">{@render runButton(false)}</div>
			<div class="presets">
				{#each calcPresets as p (p)}
					<button
						class="plain"
						disabled={pad.running || calcOff}
						onclick={() => {
							line = p;
							pad.stageCalc(p);
							calc(p);
						}}>{p}</button
					>
				{/each}
			</div>
			<div class="toggles">{@render pace()}</div>
		</div>
	{:else if part === 'algebra'}
		<div class="controls">
			<div class="nums wide">
				<input
					class="line"
					bind:value={order}
					oninput={retype}
					onkeydown={(e) => e.key === 'Enter' && calc(order, true)}
					autocomplete="off"
					spellcheck="false"
					disabled={pad.running || calcOff}
					aria-label="A work order: an expression, solve …, expand … or factor …"
				/>
			</div>
			<div class="actions">{@render runButton(true)}</div>
			<div class="toggles">
				<span class="opts" role="group" aria-label="Check">
					<span class="hint">Check</span>
					{#each MODES as m (m)}
						<button
							class="plain"
							aria-pressed={pad.checkMode === m}
							disabled={pad.running}
							onclick={() => {
								pad.checkMode = m;
								void pad.stageAlgebra(order);
							}}>{m}</button
						>
					{/each}
				</span>
				{@render pace()}
			</div>
			<div class="beats">
				{#each groups as group, gi (gi)}
					<div class="beat-row">
						<span class="hint beat-k">{gi === 0 ? 'Under 12 s' : 'Slower'}</span>
						{#each group as o (o)}
							<button
								class="plain beat"
								disabled={pad.running || calcOff}
								onclick={() => {
									order = o;
									void pad.stageAlgebra(o);
									calc(o, true);
								}}
								><span class="mono">{pretty(o)}</span>{#if secondsOf(o) !== undefined}<span
										class="secs num">≈{duration(secondsOf(o))}</span
									>{/if}</button
							>
						{/each}
					</div>
				{/each}
				<p class="hint">
					≈ the cost model’s time on an M4 for these steps and this check (0.065 s a decoder call,
					0.037 s a view); each run reports the time it took here.
				</p>
			</div>
		</div>
	{/if}

	{#if calcOff}
		<p class="off">
			{part === 'calc' ? 'Calculate' : 'Algebra'} reads three tables more than the sheet machine: subtract,
			guess a quotient digit, and lower the guess. The program loaded here has not learned them.
		</p>
	{/if}

	{#if part === 'chat'}
		<!-- chat: the same weights with the adapter's gate at 0, which is stock Qwen3.5-0.8B -->
		<div class="band chat-band">
			<section class="sp-panel ask" aria-label="Chat">
				<div class="sp-cap">
					<span class="sp-title">Ask it</span>
					<span class="sp-sub"
						>stock Qwen3.5-0.8B: the same weights, with the adapter’s gate at 0</span
					>
				</div>
				<div class="sp-body chat-body">
					<Chat
						turns={pad.chat}
						ready={pad.chatReady}
						busy={pad.chatBusy}
						onask={(q) => pad.ask(q)}
					/>
				</div>
				<p class="sp-foot">
					A gate in the graph switches the adapter off for this chat, so it is stock Qwen3.5-0.8B
					(thinking off, up to 120 new tokens). With the adapter on, its instruction-following
					breaks; one model that chats and opens its sheet by itself is next.
				</p>
			</section>
			<section class="sp-panel side" aria-label="The gate">
				<div class="sp-cap">
					<span class="sp-title">One graph, two models</span>
					<span class="sp-sub">the gate is an input of the decoder</span>
				</div>
				<div class="sp-body">
					<dl class="gate">
						<dt><i class="dot cobalt"></i>gate 0</dt>
						<dd>stock Qwen3.5-0.8B, bit for bit: this chat</dd>
						<dt><i class="dot rose"></i>gate 1</dt>
						<dd>the adapter on: every tick of the sheet machine, Calculate and Algebra</dd>
					</dl>
				</div>
				<p class="sp-foot">
					<span class="sp-dim">The inside views below follow the last view the sheet ran.</span>
				</p>
			</section>
		</div>
	{:else if part === 'algebra'}
		<!-- algebra: the derivation, and beside the line it feeds, the arithmetic under way -->
		<div class="band algebra">
			<Derivation
				plan={pad.algebraPlan}
				final={pad.algebra}
				live={pad.algebraLive}
				liveVersion={pad.liveVersion}
				running={pad.running}
				onactive={(top) => (activeTop = top)}
				foot={status}
			/>
			<DigitWork
				source={pad.sheet ? sourceOf(pad.sheet) : null}
				version={pad.version}
				{tickMs}
				sprites={SPRITES}
				last={pad.last}
				{next}
				top={activeTop}
				running={pad.running}
			/>
		</div>
	{:else}
		<!-- the top row: the sheet (the model's only memory), one tick, and the machine; panels on one grid -->
		<div class="band" class:tall={calcPart} class:calc={part === 'calc'}>
			<figure class="sp-panel sheet-panel">
				<figcaption class="sp-cap">
					<span class="sp-title">The sheet</span>
					<span class="sp-sub"
						>{part === 'machine'
							? 'the model’s only memory; click a digit it has not read to change it'
							: 'the model’s only memory; each procedure works on its own sheet'}</span
					>
				</figcaption>
				<div class="sp-body sheet-body">
					<Sheet {source} version={pad.version} {tickMs} sprites={SPRITES} onedit={edit} compact />
				</div>
				{@render status()}
			</figure>
			<Inset last={pad.last} {next} sprites={SPRITES} />
			{#if part === 'calc'}
				<Procedure
					sheet={pad.sheet}
					version={pad.version}
					last={pad.last}
					preview={pad.preview}
					{line}
				/>
			{:else}
				<Machine last={pad.last} kind={panelKind} />
			{/if}
		</div>
	{/if}

	<!-- the inside of the model, and the certificate -->
	<div class="instruments">
		<Lens
			seen={pad.last?.inside ?? null}
			kind={panelKind}
			ready={!!pad.insideMeta}
			slow={pad.pace > 0}
			unseen={!!pad.last && !pad.last.inside}
		/>
		<StateSpace
			seen={pad.last?.inside ?? null}
			wrote={pad.last ? pad.last.out[0] : null}
			meta={pad.insideMeta}
			kind={panelKind}
			runKey={pad.sheet}
			slow={pad.pace > 0}
			push={pad.push}
			canPush={pad.ready && !!pad.insideMeta && pad.op !== 'calc'}
			onpush={(c) => (pad.push = c)}
		/>
		<Certificate
			{cert}
			device={pad.ready ? (pad.lastLoad?.gpu ?? null) : null}
			canCheck={pad.ready && !pad.running && !certBusy && !spotBusy}
			oncheck={() => pad.certify()}
			walk={pad.walk}
			also={calcPart
				? `${part === 'calc' ? 'Calculate' : 'Algebra'} also reads the adder’s 242 views and the multiplier’s 1,553: 2,446 in all, each checked.`
				: ''}
		/>
	</div>

	<!-- below the stage: a margin column and a text column -->
	<section class="more" aria-labelledby="how">
		<h2 id="how" class="label">How it works</h2>
		<div class="prose">
			<p>
				At each step the runtime crops three cells of the sheet, a 32 × 96 pixel view, and the model
				answers in tokens: for addition the column’s sum code; for every other step two glyphs and
				the name of its next step, all three from one forward pass (the prompt ends in two
				placeholder slots). The runtime stamps the glyphs and moves the window; nothing else carries
				over between steps. The passes of a multiplication overlap, two columns apart, and their
				views go through the model as one batch.
			</p>
			<p>
				The model can only ever meet {HAS_CALC ? '2,446' : '1,795'} views: 242 in addition, 1,553 in multiplication{HAS_CALC
					? ' and 651 in the calculator’s three tables (subtract, guess a quotient digit, lower the guess)'
					: ''}. Every one was checked on a reference device; your device checks the weakest tenth
				again before a run (or all of them, on request), so a run of any length is a chain of
				checked steps. A view’s margin is how far the right answer’s logit leads the next best.
			</p>
			<p>
				Calculate lays long subtraction, long division (Knuth’s Algorithm D), square roots digit by
				digit and gcd (Euclid’s algorithm, one division after another) over those five tables. Signs
				and decimal points are layout. Algebra goes one level up: a fixed runtime writes the steps a
				textbook would (expand, collect, move a term across, divide, the quadratic formula,
				synthetic division, elimination), and every number in them is worked on the sheet by the
				model. Each answer is checked by putting it back: into the collected equation (light) or
				into both typed sides (strong). Every arithmetic step is the model’s and certified; the work
				order, the steps and the layout are not.
			</p>
			<p>
				Inside, the program’s graph also returns the state at every layer. The lens reads each layer
				through the model’s own output head; the state space is a 3D slice of the 1,024-dimensional
				state chosen to separate the answers. Pushing adds the difference of two answers’ mean
				states to the stream entering layer 20, right after the full-attention layer that writes the
				decision.
			</p>
			<p>
				The weights, the certificate and the inside data are on
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external link -->
				<a href={HF_CARD} target="_blank" rel="noopener">Hugging Face</a>, pinned by revision.
			</p>
		</div>
	</section>
</main>

<style>
	/*
	 * One screen: the problem, the sheet, and the inside of the model side by side, so a run can be watched (and
	 * filmed) without scrolling. Explanations sit below the stage.
	 */
	.demo {
		/* the sheet's row labels and its gap (Sheet.svelte reads these) */
		--margin-w: 44px;
		--gutter: 14px;
		--col-gap: 40px;
		max-width: 1440px;
		margin: 0 auto;
		padding: 22px 32px 96px;
	}

	.head {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: end;
		gap: 12px 40px;
	}
	h1 {
		font-size: var(--text-head);
		font-weight: 500;
		letter-spacing: -0.02em;
		line-height: 1.1;
	}
	.lede {
		margin-top: 6px;
		max-width: 72ch;
		font-size: var(--text-ui);
		color: var(--color-ink-soft);
	}
	/* the two words the page counts in, said once */
	.terms {
		margin-top: 4px;
		max-width: 120ch;
		font-size: var(--text-xs);
		color: var(--color-ink-soft);
	}
	.terms em {
		font-style: normal;
		font-weight: 500;
		color: var(--color-ink);
	}
	.model {
		display: grid;
		justify-items: end;
		gap: 4px;
		min-width: 0;
		max-width: 520px;
		text-align: right;
	}
	.note {
		font-size: var(--text-xs);
		color: var(--color-ink-soft);
	}
	.loading {
		display: grid;
		gap: 6px;
		width: 280px;
		font-size: var(--text-xs);
		color: var(--color-ink-soft);
		text-align: left;
	}
	.track {
		position: relative;
		height: 2px;
		background: var(--track);
	}
	.track i {
		position: absolute;
		inset: 0 auto 0 0;
		background: var(--color-ink);
		transition: width var(--hover) ease;
	}

	/* the four parts: numbered text, the shown one in ink with a short rule under it */
	.parts {
		display: flex;
		gap: 30px;
		margin-top: 22px;
		border-bottom: 1px solid var(--color-edge);
	}
	.part {
		position: relative;
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 0 0 10px;
		border: 0;
		background: none;
		font: inherit;
		font-size: var(--text-ui);
		color: var(--color-ink-soft);
		cursor: pointer;
		transition: color var(--hover) ease;
	}
	.part .n {
		font-size: var(--text-xs);
		color: var(--color-ink-soft);
		transition: color var(--hover) ease;
	}
	.part:hover {
		color: var(--color-ink);
	}
	.part[aria-current='true'] {
		color: var(--color-ink);
		font-weight: 500;
	}
	.part[aria-current='true'] .n {
		color: var(--color-ink);
	}
	.part::after {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		bottom: -1px;
		height: 2px;
		background: var(--color-ink);
		transform: scaleX(0);
		transform-origin: left;
		transition: transform var(--move) var(--ease);
	}
	.part[aria-current='true']::after {
		transform: scaleX(1);
	}
	.part .short {
		display: none;
	}

	/* controls: one line, tone and spacing, no outlines */
	.controls {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 10px 22px;
		margin-top: 16px;
	}
	.ops {
		display: flex;
		gap: 16px;
	}
	.ops .plain {
		font-size: var(--text-ui);
	}
	.nums {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1 1 340px;
		min-width: 0;
		max-width: 520px;
	}
	.sign {
		font-family: var(--font-mono);
		color: var(--color-ink-soft);
	}
	.nums input {
		flex: 1 1 0;
		height: 30px;
		min-width: 0;
		padding: 0 10px;
		border: 0;
		border-radius: var(--radius-ui);
		background: var(--field);
		color: var(--color-ink);
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		letter-spacing: 0.02em;
		transition: background var(--hover) ease;
	}
	.nums input:hover:not(:disabled),
	.nums input:focus {
		background: var(--field-hover);
		outline: none;
	}
	.nums input:disabled {
		color: var(--color-ink-soft);
	}
	.actions {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 30px;
	}
	.presets {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 16px;
	}
	.presets .plain {
		font-size: var(--text-xs);
	}
	.toggles {
		display: flex;
		align-items: baseline;
		gap: 22px;
		margin-left: auto;
		font-size: var(--text-xs);
	}
	/* a named choice: its name, then the options */
	.opts {
		display: inline-flex;
		align-items: baseline;
		gap: 10px;
	}
	.toggles .plain {
		font-size: var(--text-xs);
	}
	.beats {
		display: grid;
		gap: 6px;
		flex-basis: 100%;
	}
	.beat-row {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 20px;
	}
	.beat-k {
		width: 72px;
	}
	.beat {
		display: inline-flex;
		align-items: baseline;
		gap: 6px;
		font-size: var(--text-xs);
	}
	.mono {
		font-family: var(--font-mono);
	}
	.secs {
		font-size: var(--text-2xs);
		color: var(--color-ink-soft);
	}
	.off {
		margin-top: 12px;
		max-width: 80ch;
		font-size: var(--text-xs);
		color: var(--color-ink-soft);
	}

	/*
	 * The top row: three panels on one grid, like the instruments below (panel.css): titles, figures and notes share
	 * lines, and every size is fixed, so nothing a tick writes (a longer answer, a wider sheet) moves a neighbour.
	 */
	.band {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 250px 300px;
		grid-template-rows: auto 188px 44px;
		gap: 10px var(--col-gap);
		margin-top: 22px;
	}
	/*
	 * algebra: the derivation as tall as its lines (laid out whole when a run starts, so nothing moves while it fills
	 * in), and the digit work beside it
	 */
	.band.algebra {
		grid-template-columns: minmax(0, 1fr) 300px;
		grid-template-rows: auto auto 44px;
	}
	/* the calculator's sheets have up to ten rows: a taller (still fixed) sheet row */
	.band.tall {
		grid-template-rows: auto 272px 44px;
	}
	.sheet-body {
		align-content: start;
	}
	/* two fixed lines under the sheet; a line that is too long ends in an ellipsis instead of pushing anything */
	.status {
		display: grid;
		grid-template-rows: 24px 20px;
		height: 44px;
	}
	.status p {
		min-width: 0;
		line-height: 20px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.status span + span::before {
		content: ' · ';
	}
	/* the answer: a size up from the facts under it */
	.verdict {
		font-size: var(--text-ui);
		line-height: 24px;
		color: var(--color-ink);
	}
	.verdict strong {
		font-weight: 600;
		color: var(--color-ink);
	}
	/* exact: the model's answer, certified */
	.verdict strong.ok,
	.got {
		color: var(--color-rose);
	}
	/* the page's own arithmetic: a reference */
	.ref {
		color: var(--color-violet);
	}

	/* chat: the chat beside a short note on the gate */
	.chat-band {
		grid-template-rows: auto minmax(188px, auto) auto;
	}
	.chat-body {
		align-content: start;
		overflow: visible;
	}
	.gate {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: 10px 14px;
		align-content: start;
		font-size: var(--text-xs);
	}
	.gate dt {
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: var(--font-mono);
		color: var(--color-ink);
		white-space: nowrap;
	}
	.gate dd {
		color: var(--color-ink-soft);
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
	}
	.dot.cobalt {
		background: var(--color-cobalt);
	}
	.dot.rose {
		background: var(--color-rose);
	}
	.chat-band .side {
		grid-column: 3;
	}
	.chat-band .ask {
		grid-column: 1 / 3;
	}

	/* the inside of the model: three panels on one grid (panel.css: captions, figures and notes share rows) */
	.instruments {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr) minmax(0, 0.9fr);
		/* the figures take what the window leaves, so the whole stage fits from 800 px tall screens up */
		grid-template-rows: auto clamp(210px, calc(100dvh - 690px), 360px) 4.4em;
		gap: 10px var(--col-gap);
		margin-top: 28px;
	}

	/* below the stage: a margin column for the label, a text column for the prose */
	.more {
		display: grid;
		grid-template-columns: 160px minmax(0, 68ch);
		gap: 0 var(--col-gap);
		margin-top: 72px;
	}
	.label {
		padding-top: 2px;
		font-size: var(--text-xs);
		font-weight: 500;
		color: var(--color-ink-soft);
		text-align: right;
	}
	.prose {
		display: grid;
		gap: 12px;
		color: var(--color-ink-soft);
		line-height: 1.6;
	}

	@media (max-width: 1279px) {
		.band {
			grid-template-columns: minmax(0, 1fr) 250px;
			grid-template-rows: auto 188px 44px auto 188px auto;
		}
		.band.tall {
			grid-template-rows: auto 272px 44px auto 272px auto;
		}
		.band > :global(:nth-child(3)) {
			grid-column: 1 / -1;
		}
		.band.algebra {
			grid-template-columns: minmax(0, 1fr) 260px;
			grid-template-rows: auto auto 44px;
		}
		.chat-band {
			grid-template-rows: auto minmax(188px, auto) auto auto auto auto;
		}
		.chat-band .ask,
		.chat-band .side {
			grid-column: 1 / -1;
		}
		.instruments {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			grid-template-rows: auto 320px 4.4em auto 320px 4.4em;
		}
	}
	@media (max-width: 719px) {
		.demo {
			padding: 18px 16px 72px;
			--margin-w: 52px;
			--gutter: 6px;
			--col-gap: 24px;
		}
		.head {
			grid-template-columns: minmax(0, 1fr);
		}
		.model {
			justify-items: start;
			text-align: left;
		}
		.parts {
			gap: 20px;
		}
		.part .long {
			display: none;
		}
		.part .short {
			display: inline;
		}
		/* a phone has the height to spare: the status may wrap */
		.status {
			height: auto;
			grid-template-rows: auto;
		}
		.status p {
			white-space: normal;
		}
		.toggles {
			margin-left: 0;
		}
		.beat-k {
			width: 100%;
		}
		/* stacked, the sheet takes the height it draws (a phone can scroll); the other figures keep theirs */
		/* the view (a strip, or one line before there is one) and the procedure are as tall as they are */
		.band,
		.band.tall {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto auto auto auto auto auto auto 188px auto;
		}
		.band.tall {
			grid-template-rows: auto auto auto auto auto auto auto 272px auto;
		}
		.band.calc {
			grid-template-rows: repeat(9, auto);
		}
		.band.algebra {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: repeat(6, auto);
		}
		.chat-band {
			grid-template-rows: auto minmax(160px, auto) auto auto auto auto;
		}
		/* each figure keeps its height (the panels set it); an empty one takes only its line */
		.instruments {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: repeat(3, auto auto auto);
		}
		.more {
			grid-template-columns: minmax(0, 1fr);
			gap: 8px;
			margin-top: 56px;
		}
		.label {
			text-align: left;
		}
	}
</style>
