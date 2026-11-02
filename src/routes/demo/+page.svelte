<script lang="ts">
	import { onMount } from 'svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import * as I from '#lib/ui/icons.ts';
	import type { IconData } from '#lib/ui/icons.ts';
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
	import { ratchet } from '#lib/sketchpad/ratchet.ts';
	import { loadMathFonts } from '#lib/sketchpad/derivation-view.ts';
	import DigitWork from '#lib/sketchpad/DigitWork.svelte';
	import '#lib/sketchpad/panel.css';
	import {
		HAS_CALC,
		HF_CARD,
		HF_ROOT,
		MODELS,
		PROGRAM,
		PUBLISHED,
		type Kind
	} from '#lib/sketchpad/models.ts';
	import { RECORDING_FORMAT, type Recording } from '#lib/sketchpad/recording.ts';
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
	const PARTS: { id: Part; n: number; label: string; short: string; icon: IconData }[] = [
		{ id: 'machine', n: 1, label: 'The sheet machine', short: 'Sheet', icon: I.Sheet },
		{ id: 'calc', n: 2, label: 'Calculate', short: 'Calculate', icon: I.Calculator },
		{ id: 'algebra', n: 3, label: 'Algebra', short: 'Algebra', icon: I.Root },
		{ id: 'chat', n: 4, label: 'Chat', short: 'Chat', icon: I.Chat }
	];
	let part = $state<Part>('machine');
	/** the sheet machine's operation, kept while another part is shown */
	let machineOp = $state<'add' | 'mul'>('add');
	/** Calculate and Algebra read the calculator's tables, which only some programs have learned (models.ts) */
	const calcPart = $derived(part === 'calc' || part === 'algebra');
	/** the parts that work on the calculator's sheet: Calculate, Algebra, and the chat's sheet blocks */
	const sheetPart = $derived(calcPart || part === 'chat');
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
		'solve x^2-2=0',
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
	/**
	 * questions to try in the chat, worded afresh (none is one of the training or held-out templates): word problems
	 * with numbers too big to do in one's head, an equation in a sentence, and a plain question that should not open
	 * the sheet
	 */
	const CHAT_EXAMPLES = [
		'A warehouse packs 4,386 boxes a week with 27 jars in each box. How many jars does it pack in 52 weeks?',
		'A stadium has 47 sections of 1,186 seats, and 39,862 tickets were sold. How many seats are empty?',
		'A school buys 348 train tickets at $86.75 each. How much does it pay?',
		'Solve 7x − 45 = 3x + 1,203 for x.',
		'Why is the sky blue? Answer in one sentence.'
	];
	/** a chat block the cost model expects to take longer than this (seconds) shows its estimate and a Stop */
	const LONG_BLOCK = 30;
	/** a new question lets the chat's column go once (ratchet.ts), as a new run does */
	const chatRun = $derived(pad.asks);
	/** where the line the algebra's arithmetic feeds sits (Derivation reports it; DigitWork follows it) */
	let activeTop = $state<number | null>(null);
	/**
	 * the moment a run's exact answer was final (Derivation reports it): the run reads as answered from then on, while
	 * a decimal display (the ≈ line) may still be worked out after it
	 */
	let answered = $state<{ run: number; seconds: number; more: boolean } | null>(null);
	const answeredNow = $derived(answered && answered.run === pad.runs ? answered : null);
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
		const opened = fromHash ? setPart(fromHash.id, false, false) : Promise.resolve();
		// local checks and the screenshot script drive the page through this handle
		if (import.meta.env.DEV) Object.assign(globalThis, { sketchpad: pad });
		void costs();
		// open on something visible: the certificate panel shows the shipped table and the inside panels their maps, then
		// the tab's recorded run plays (in that order, so no panel changes its layout once the run is under way)
		void Promise.all([opened, pad.showShipped(), pad.showInside(modelsBase)])
			.then(() => play(part, RECORDED_PACE))
			// then, while the visitor reads, the math faces Algebra and the chat's sheet draw with
			.then(() => loadMathFonts());
	});

	/** the math faces, waited for at most 3 s: a derivation drawn before they arrive shifts by a pixel or two when they do */
	const mathFaces = () => Promise.race([loadMathFonts(), new Promise((r) => setTimeout(r, 3000))]);

	// ---- the recordings: what each tab shows before the model loads, and whenever Recorded is chosen -----------------
	/** each tab's recording, fetched when the tab is first shown (a few tens of KB) */
	const recordings: Partial<Record<Part, Promise<Recording | null>>> = {};
	function recordingFor(p: Part) {
		return (recordings[p] ??= fetch(RECORDING_URLS[p])
			.then((r) => (r.ok ? (r.json() as Promise<Recording>) : null))
			.then((r) => (r?.format === RECORDING_FORMAT ? r : null))
			.catch(() => null));
	}
	const RECORDING_URLS: Record<Part, string> = {
		machine: asset('recordings/machine.json'),
		calc: asset('recordings/calc.json'),
		algebra: asset('recordings/algebra.json'),
		chat: asset('recordings/chat.json')
	};
	/** the tab has no recording to show (it could not be read): the panels ask for the model instead */
	let unrecorded = $state(false);
	/** the recording last played (the header names where and when it was made) */
	let lastRecording = $state.raw<Recording | null>(null);
	/** a recording plays at its recorded times, a little slower, so it can be followed */
	const RECORDED_PACE = 1.5;
	/** after the model loads: the visitor's own runs (Live, the default) or the tabs' recordings */
	let wantLive = $state(true);
	const loaded = $derived(pad.chatReady);
	const showing = $derived<'recorded' | 'live'>(loaded && wantLive ? 'live' : 'recorded');

	/**
	 * Play a tab's recording: the page runs it as it would live, every answer from the recording. With the model
	 * loaded and Live chosen it plays at once (a tab switched to shows its recorded run until the visitor runs one).
	 */
	async function play(p: Part, pace: number) {
		const rec = await recordingFor(p);
		if (part === p) unrecorded = !rec;
		// a derivation's faces are in before its lines are drawn: one arriving mid-run would shift them
		if (rec && (p === 'algebra' || p === 'chat')) await mathFaces();
		if (!rec || part !== p || pad.chatBusy || pad.loading) return;
		if (pad.running) await pad.halt();
		const i = rec.input;
		lastRecording = rec;
		pad.playRecording(rec, pace, spritesUrl);
		try {
			if (i.tab === 'machine') {
				if (!(await setOp(i.op))) return;
				a = i.a;
				b = i.b;
				pad.stage(a, b);
				await pad.run(a, b);
			} else if (i.tab === 'calc') {
				line = i.line;
				await pad.runCalc(i.line);
			} else if (i.tab === 'algebra') {
				pad.checkMode = i.checkMode;
				order = i.order;
				await pad.runAlgebra(i.order);
			} else {
				pad.chatGate = i.gate;
				await pad.ask(i.question);
			}
		} finally {
			// the model answers the visitor's runs again; the recording stays on show until one replaces it
			if (loaded && wantLive) pad.stopPlayback();
		}
	}

	/** the switch: Recorded plays the tab's recording; Live loads the model if it is not loaded yet */
	async function show(mode: 'recorded' | 'live') {
		if (mode === 'live') {
			wantLive = true;
			if (!loaded) return load();
			if (pad.replaying && pad.running) await pad.halt();
			pad.stopPlayback();
		} else {
			wantLive = false;
			void play(part, RECORDED_PACE);
		}
	}

	/** when and where the recordings were made, and whether they ran under the certificate this page loads */
	const recordedOn = (rec: Recording, article = false) => {
		const where = rec.provenance.machine ?? rec.provenance.device;
		const when = new Date(rec.provenance.date).toLocaleDateString('en-GB', {
			day: 'numeric',
			month: 'short'
		});
		return `${article ? (/^[aeiou]/i.test(where) ? 'an ' : 'a ') : ''}${where}, ${when}`;
	};
	const sameCertificate = (rec: Recording) =>
		rec.provenance.certificateRevision === (PUBLISHED.certificateRevision ?? PUBLISHED.revision);

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
	async function setPart(p: Part, write = true, autoplay = true) {
		if (p === part) return;
		// the last tab's run stops and its results go before the new tab is laid out: nothing of it (a long derivation in
		// a narrower column) sets the new tab's height, which only grows until its own run starts (ratchet.ts)
		if (pad.running) await pad.halt();
		// a tab with a derivation is laid out once its faces are in (they are, unless the visitor is quick)
		if (write && (p === 'algebra' || p === 'chat')) await mathFaces();
		pad.clearRun();
		if (p !== 'algebra') pad.algebraPlan = null;
		part = p;
		// the part shown is in the address, so a link (or a reload) opens it
		if (write) void goto(`${DEMO}#${p}` as typeof DEMO, { replace: true, shallow: true });
		if (p === 'machine') await setOp(machineOp);
		else if ((p === 'calc' || p === 'algebra' || p === 'chat') && HAS_CALC) {
			await setOp('calc');
			pad.clearRun();
			if (p === 'calc') pad.stageCalc(line);
			else if (p === 'algebra') void pad.stageAlgebra(order);
			else pad.algebraPlan = null;
		}
		// the tab opens on its recorded run (at once, when the visitor has the model and Live)
		if (autoplay) void play(p, showing === 'live' ? 0 : RECORDED_PACE);
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
		pad.sheet && !(sheetPart && pad.op !== 'calc') ? sourceOf(pad.sheet) : null
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
	/** the inside panels' layout: one for the whole run (the calculator's steps would switch it from view to view) */
	const panelKind = $derived<'add' | 'mul'>(pad.op === 'calc' ? 'mul' : pad.op);

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

	async function load() {
		// a recording playing stops for the load (the load starts when no run is under way)
		if (pad.running) await pad.halt();
		pad.load(modelsBase, spritesUrl);
		await new Promise<void>((done) => {
			const wait = setInterval(() => {
				if (pad.chatReady || pad.loadError || !pad.loading) {
					clearInterval(wait);
					done();
				}
			}, 200);
		});
		if (!pad.chatReady) return;
		// loaded: Live, the default; the tab shows its recorded run, whole, until the visitor runs one of their own
		wantLive = true;
		pad.stopPlayback();
		void play(part, 0);
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
		<button class="primary ic" onclick={() => pad.stop()}
			><Icon icon={I.Stop} size={16} />Stop</button
		>
	{:else if calcPart}
		<button
			class="primary ic"
			disabled={calcOff || !pad.ready || (!pad.canCalc && !pad.certifying)}
			onclick={() => calc(algebra ? order : line, algebra)}
			><Icon icon={I.Play} size={16} />Run</button
		>
		{#if queued}<span class="hint">starts when the check ends</span>
		{:else if pad.ready && pad.certifying && !pad.canCalc}<span class="hint"
				>after the certificates</span
			>{/if}
	{:else}
		<button
			class="primary ic"
			disabled={!pad.ready || (!pad.canRun && !certBusy)}
			onclick={() => go(a, b)}><Icon icon={I.Play} size={16} />Run</button
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
	<div class="sp-foot status num" aria-live="polite" {@attach ratchet(pad.runs)}>
		{#if calcOff}
			<p>&nbsp;</p>
		{:else if pad.running && part === 'chat' && (pad.algebraEstimate ?? 0) > LONG_BLOCK}
			<!-- a block the cost model says is long: its estimate (no number of the answer), and a way out -->
			<p class="verdict live">
				<span>A long block: about {duration(pad.algebraEstimate ?? 0)} by the cost model</span
				><button class="stop ic" onclick={() => pad.stop()}
					><Icon icon={I.Stop} size={15} />Stop</button
				>
			</p>
			<p class="live">
				<span>{fmt(pad.ticks)} {pad.ticks === 1 ? 'view' : 'views'}</span><span
					>{(pad.computeMs / Math.max(1, pad.ticks)).toFixed(0)} ms a view</span
				><span>{progress}</span>
			</p>
		{:else if pad.running && (part === 'algebra' || part === 'chat') && answeredNow}
			<p class="verdict live">
				<!-- a recording plays at its own pace: the page's clock would not be the recorded time -->
				<strong class="ok">Answered</strong>{pad.replaying
					? ''
					: ` in ${duration(answeredNow.seconds)}`}{answeredNow.more
					? '; the decimal display follows.'
					: '.'}
			</p>
			<p class="live">
				<span>{fmt(pad.ticks)} {pad.ticks === 1 ? 'view' : 'views'}</span><span
					>{(pad.computeMs / Math.max(1, pad.ticks)).toFixed(0)} ms a view</span
				><span>{progress}</span>
			</p>
		{:else if pad.running}
			<p class="verdict live">
				<span>{fmt(pad.ticks)} {pad.ticks === 1 ? 'view' : 'views'}</span><span
					>{(pad.computeMs / Math.max(1, pad.ticks)).toFixed(0)} ms a view</span
				><span>{progress}</span>
			</p>
			<p class="live">
				{#if pad.recovering}<span>the GPU was reset: loading the model again</span
					>{/if}{#if pad.sheet && !(pad.sheet instanceof Grid) && pad.sheet.edits}<span
						>{pad.sheet.edits} {pad.sheet.edits === 1 ? 'digit' : 'digits'} changed</span
					>{/if}{#if pad.pushes}<span
						>{pad.pushes} {pad.pushes === 1 ? 'view' : 'views'} pushed</span
					>{/if}
			</p>
		{:else if (part === 'algebra' || part === 'chat') && pad.algebra}
			{@const r = pad.algebra}
			{@const refused = r.results.some((x) => x.status === 'refused')}
			<p class="verdict">
				{#if refused}<strong>Refused.</strong> A check failed, so the answer is withheld.
				{:else}<strong class={{ ok: r.ok }}>{r.ok ? 'Exact.' : 'Wrong.'}</strong>
					{#if !r.ok}The page’s own arithmetic says <span class="ref">{r.want.join('; ')}</span
						>.{:else}Every line matches the page’s own arithmetic.{/if}{/if}
			</p>
			{#if pad.recordedShown}{@render recordedFacts(pad.recordedShown)}{:else}
				<p>
					<span>{fmt(r.ticks)} views in {fmt(r.steps)} steps, {duration(r.seconds)}</span
					>{#if answeredNow?.more}<span>answered in {duration(answeredNow.seconds)}</span>{/if}<span
						>{#if r.certified}every view it read is certified{:else if r.unchecked === 0}every view
							it read passed{:else}{r.unchecked} unchecked {r.unchecked === 1
								? 'view'
								: 'views'}{/if}</span
					>
				</p>
			{/if}
		{:else if part === 'calc' && pad.calcResult}
			{@const r = pad.calcResult}
			<p class="verdict">
				<strong class={{ ok: r.ok }}>{r.ok ? 'Exact.' : 'Wrong.'}</strong>
				{r.text} =
				<span class="got">{r.got.length > 48 ? `${r.got.slice(0, 48)}…` : r.got}</span>{#if !r.ok}
					(the page’s own arithmetic says <span class="ref">{r.want}</span>){/if}
			</p>
			{#if pad.recordedShown}{@render recordedFacts(pad.recordedShown)}{:else}
				<p>
					<span>{fmt(r.ticks)} views in {fmt(r.steps)} steps, {duration(r.seconds)}</span><span
						>{#if r.certified}every view it read is certified{:else if r.unchecked === 0}every view
							it read passed{:else}{r.unchecked} unchecked {r.unchecked === 1
								? 'view'
								: 'views'}{/if}</span
					>
				</p>
			{/if}
		{:else if part === 'machine' && pad.result}
			{@const r = pad.result}
			<p class="verdict">
				<strong class={{ ok: r.ok }}>{r.ok ? 'Exact.' : 'Wrong.'}</strong>
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
			{#if pad.recordedShown}{@render recordedFacts(pad.recordedShown)}{:else}
				<p>
					<span>{fmt(r.ticks)} views in {fmt(r.steps ?? r.ticks)} steps, {duration(r.seconds)}</span
					><span
						>{#if r.certified && r.certSource === 'shipped'}certified (shipped, checked again here){:else if r.certified}certified
							on this device{:else if r.unchecked === 0}every view it read passed{:else}{r.unchecked}
							unchecked {r.unchecked === 1 ? 'view' : 'views'}{/if}</span
					>{#if r.pushes}<span>{r.pushes} pushed</span>{/if}{#if r.edits}<span
							>{r.edits} changed</span
						>{/if}
				</p>
			{/if}
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
		{:else if part === 'chat' && pad.ready}
			<p class="verdict">
				{pad.certifying
					? 'Checking the three tables it reads on this device first.'
					: 'The sheet opens when the model writes a sheet block.'}
			</p>
			<p>
				its work order runs here, every digit by the model, and the result goes back into the reply
			</p>
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
		{:else if !pad.ready && unrecorded}
			<p class="verdict">Load the model to {part === 'algebra' ? 'solve it' : 'run it'}.</p>
			<p>
				{part === 'calc'
					? 'a + b, a − b, a × b, a ÷ b to k places, √a to k places, gcd(a, b)'
					: 'It downloads once; this browser keeps it.'}
			</p>
		{/if}
	</div>
{/snippet}

{#snippet recordedFacts(rec: Recording)}
	<!-- a finished recording says what it is: where and when it ran, and under which certificate -->
	<p>
		<span
			>recorded on {recordedOn(rec)}: {fmt(rec.result.views)} views in {fmt(rec.result.steps)} steps,
			{duration(rec.result.seconds)}</span
		><span
			>{sameCertificate(rec)
				? `under the certificate this page loads (${rec.provenance.certificateRevision.slice(0, 8)})`
				: `under an older certificate (${rec.provenance.certificateRevision.slice(0, 8)})`}</span
		>
	</p>
{/snippet}

{#snippet shownSwitch()}
	<!-- Recorded and Live under one switch: Live loads the model the first time -->
	<span class="opts" role="group" aria-label="What the panels show">
		<button
			class="plain ic"
			aria-pressed={showing === 'recorded'}
			onclick={() => show('recorded')}
			title="A run recorded on the reference device, played back"
			><Icon icon={I.Replay} size={15} />Recorded</button
		>
		<button
			class="plain ic"
			aria-pressed={showing === 'live'}
			disabled={pad.gpuOk !== true || !!pad.loading}
			onclick={() => show('live')}
			title="The model on your GPU"><Icon icon={I.Chip} size={15} />Live</button
		>
	</span>
{/snippet}

{#snippet pace()}
	<span class="opts" role="group" aria-label="Pace">
		<span class="hint">Pace</span>
		<button
			class="plain ic"
			aria-pressed={pad.pace === 0}
			onclick={() => (pad.pace = 0)}
			title="As fast as the GPU goes"><Icon icon={I.Fast} size={15} />fast</button
		>
		<button
			class="plain ic"
			aria-pressed={pad.pace > 0}
			onclick={() => (pad.pace = 900)}
			title="A pause between steps, so the inside views can follow each one"
			><Icon icon={I.Slow} size={15} />slow</button
		>
	</span>
{/snippet}

<!-- data-run changes when a run or a question starts, the tab changes or the model comes in: the moments the layout
	may let go once (scripts/layout-probe.js reads it) -->
<main class="demo" data-run="{part}.{pad.runs}.{pad.asks}.{loaded ? 1 : 0}">
	<header class="head">
		<div class="title">
			<h2>Try the sheet</h2>
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
				<!-- before a load: the recorded runs play, and one quiet line says where they were made -->
				{@render shownSwitch()}
				<p class="note num">
					{#if lastRecording}Recorded on {recordedOn(lastRecording, true)} ·&nbsp;{/if}<button
						class="link ic"
						onclick={load}
						disabled={pad.gpuOk === null}><Icon icon={I.Download} size={15} />Load the model</button
					>
					to run it on your GPU ({cost === null
						? '1.9 GB'
						: cost === 0
							? 'from this browser’s cache'
							: bytes(cost)}).
				</p>
			{:else}
				{@render shownSwitch()}
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
				><span class="n"><Icon icon={p.icon} size={17} /></span><span class="long">{p.label}</span
				><span class="short">{p.short}</span></button
			>
		{/each}
	</nav>

	<!-- the controls of the part shown: one line, tone and spacing, no outlines -->
	{#if part === 'machine'}
		<div class="controls">
			<div class="ops" role="group" aria-label="Operation">
				<button class="plain ic" aria-pressed={pad.op === 'add'} onclick={() => setOp('add')}
					><Icon icon={I.Plus} size={15} />Add</button
				>
				<button class="plain ic" aria-pressed={pad.op === 'mul'} onclick={() => setOp('mul')}
					><Icon icon={I.Times} size={15} />Multiply</button
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
						class="plain ic"
						aria-pressed={pad.parallel}
						disabled={pad.running}
						onclick={() => {
							pad.parallel = !pad.parallel;
							pad.stage(a, b);
						}}
						title="Run the passes of b overlapped, each two columns behind the one before, as one batch per step"
						><Icon icon={I.Layers} size={15} />{pad.parallel
							? 'Passes overlapped'
							: 'One pass at a time'}</button
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
					<span class="hint ic"><Icon icon={I.Shield} size={15} />Check</span>
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
		<!-- the chat, and beside its reply the sheet: each block the model writes runs there, every digit by the model -->
		<div class="band chat-band">
			<section class="sp-panel ask" aria-label="Chat">
				<div class="sp-cap">
					<span class="sp-title">Ask it</span>
					<span class="sp-sub"
						>{pad.chatGate === 1
							? 'it opens its sheet when a question needs exact arithmetic'
							: 'stock Qwen3.5-0.8B: the same weights with the gate at 0'}</span
					>
				</div>
				<div class="sp-body chat-body" {@attach ratchet(chatRun)}>
					<Chat
						turns={pad.chat}
						ready={pad.chatReady && !pad.certifying}
						busy={pad.chatBusy || pad.running}
						gate={pad.chatGate}
						ongate={(g) => (pad.chatGate = g)}
						examples={CHAT_EXAMPLES}
						onask={(q) => pad.ask(q)}
					/>
				</div>
				<p class="sp-foot">
					One model: Qwen3.5-0.8B with one adapter that also reads every view of the sheet’s tables.
					On 780 held-out questions on this page’s path it opened its sheet for 98.9% of those that
					needed it and for 0.4% of those that did not, and wrote the right sheet line for 91.7% of
					word problems, 96.7% of equations and 98.3% of sums typed into prose. “Stock Qwen” shuts
					the adapter’s gate: the same weights as Qwen3.5-0.8B, bit for bit.
				</p>
			</section>
			<Derivation
				plan={pad.algebraPlan}
				final={pad.algebra}
				live={pad.algebraLive}
				liveVersion={pad.liveVersion}
				running={pad.running}
				onactive={(top) => (activeTop = top)}
				onanswered={(more) => (answered = { run: pad.runs, seconds: pad.wallMs / 1000, more })}
				foot={status}
				run={pad.runs}
				hint={null}
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
				run={pad.runs}
			/>
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
				onanswered={(more) => (answered = { run: pad.runs, seconds: pad.wallMs / 1000, more })}
				foot={status}
				run={pad.runs}
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
				run={pad.runs}
			/>
		</div>
	{:else}
		<!-- the top row: the sheet (the model's only memory), one tick, and the machine; panels on one grid -->
		<div class={['band', { tall: calcPart, calc: part === 'calc' }]}>
			<figure class="sp-panel sheet-panel">
				<figcaption class="sp-cap">
					<span class="sp-title">The sheet</span>
					<span class="sp-sub"
						>{part === 'machine'
							? 'the model’s only memory; click a digit it has not read to change it'
							: 'the model’s only memory; each procedure works on its own sheet'}</span
					>
				</figcaption>
				<!-- a new sheet (each procedure has its own) is a new drawing; the body keeps the run's tallest -->
				<div class="sp-body sheet-body" {@attach ratchet(pad.runs)}>
					{#key source}
						<Sheet
							{source}
							version={pad.version}
							{tickMs}
							sprites={SPRITES}
							onedit={edit}
							compact
						/>
					{/key}
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
					run={pad.runs}
				/>
			{:else}
				<Machine last={pad.last} kind={panelKind} run={pad.runs} />
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
			kind={sheetPart ? 'calc' : panelKind}
			runKey={pad.runs}
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
			also={sheetPart
				? `${part === 'calc' ? 'Calculate' : part === 'algebra' ? 'Algebra' : 'The chat’s sheet'} also reads the adder’s 242 views and the multiplier’s 1,553: 2,446 in all, each checked.`
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
	h2 {
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
	/* the load, as a word in the line that says what is shown */
	.model .link {
		padding: 0;
		border: 0;
		background: none;
		color: var(--color-ink);
		font: inherit;
		font-weight: 500;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
	}
	.model .link:disabled {
		color: var(--color-ink-soft);
		cursor: default;
	}
	.model .opts {
		font-size: var(--text-xs);
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
		align-items: center;
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
		display: inline-flex;
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
	 * algebra: the derivation, which only grows during a run, and beside it the digit work, which never sets the row's
	 * height (DigitWork.svelte): its block has one size and sits out of the flow, and the derivation keeps that size as
	 * its least height
	 */
	.band.algebra {
		grid-template-columns: minmax(0, 1fr) 300px;
		grid-template-rows: auto auto 44px;
		/* the digit work's one size: the tallest sheet any operation draws (a product's ten rows), and the view */
		--work-sheet: 220px;
		--work-view: 120px;
		--work-gap: 14px;
		--work-h: calc(var(--work-sheet) + var(--work-gap) + var(--work-view));
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
	/* the Stop of a long chat block: a quiet word beside its estimate */
	.status .stop {
		margin-left: 12px;
		padding: 0;
		border: 0;
		background: none;
		color: var(--color-ink);
		font: inherit;
		font-weight: 500;
		text-decoration: underline;
		text-underline-offset: 3px;
		cursor: pointer;
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
	/*
	 * the chat: the question and the reply, and beside them the sheet each block runs on and its digit work. Like
	 * Algebra's band, the digit work never sets the row's height (DigitWork.svelte), and each column only grows within a
	 * run or a reply.
	 */
	.chat-band {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr) 300px;
		/* the chat's note is longer than the sheet's two status lines: the last row takes the taller */
		grid-template-rows: auto auto auto;
		--work-sheet: 220px;
		--work-view: 120px;
		--work-gap: 14px;
		--work-h: calc(var(--work-sheet) + var(--work-gap) + var(--work-view));
	}
	.chat-body {
		align-content: start;
		overflow: visible;
	}
	/* the reply's column reaches as low as the sheet beside it, so its note sits on the same line as the sheet's status */
	.chat-band .ask {
		grid-row: 1 / span 3;
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
			grid-template-columns: minmax(0, 1fr) 260px;
			grid-template-rows: auto auto auto auto auto 44px;
		}
		.chat-band .ask {
			grid-row: 1 / span 3;
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
		/* the counts under way stay on one line each, so the status does not change height as they tick */
		.status p.live {
			white-space: nowrap;
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
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: repeat(9, auto);
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
