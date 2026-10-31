/*
 * The demo's layout rule, checked in the browser: from the moment a run starts until the next run starts, no element
 * of the part's band, or anything below it, may get shorter or move up. Growing is fine.
 *
 * Use: open /demo on the tab to check, paste this file into the browser console (or inject it before the page loads),
 * load the model, and run. Then `layoutProbe.report()` lists every element that got shorter or moved up during a run,
 * with when (ms after the run started), where it was and where it went; an empty list is a pass. `layoutProbe.clear()`
 * empties the log.
 *
 * How it measures: a ResizeObserver on every element of the band and below logs a height that shrinks; once a frame,
 * every element's top on the page (getBoundingClientRect().top + scrollY, transforms included) is compared with the
 * frame before, and a top that went up is logged. A run is seen starting when the page's `data-run` changes (a run on
 * the sheet, a question to the chat; on the demo page also a switch of tab, which lays out another part, and the model
 * coming in, which turns the recorded panels into the visitor's own): the layout may then let go once, so the probe
 * takes its baseline two frames later. Drawings (the insides of an SVG
 * or a canvas) are not layout and are skipped.
 */
(() => {
	if (globalThis.layoutProbe) return;
	const SKIP = 'svg *, script, style';
	const probe = {
		log: [],
		/** the run under way, counted from the first one the probe saw */
		run: 0,
		on: false,
		report: () => probe.log.slice(),
		clear: () => void (probe.log.length = 0)
	};
	globalThis.layoutProbe = probe;

	const heights = new Map();
	const tops = new Map();
	let t0 = 0;

	const band = () => document.querySelector('.band');
	/** the band and everything after it on the page */
	const inScope = (el) => {
		const b = band();
		if (!b || !(el instanceof Element) || el.matches(SKIP)) return false;
		return (
			b === el ||
			b.contains(el) ||
			!!(b.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)
		);
	};
	const describe = (el) => {
		const one = (e) =>
			e.tagName.toLowerCase() +
			[...e.classList]
				.filter((c) => !/^svelte-|^s-/.test(c))
				.map((c) => '.' + c)
				.join('');
		const parts = [];
		for (let e = el, i = 0; e && e !== document.body && i < 3; e = e.parentElement, i++)
			parts.unshift(one(e));
		const line = el.closest('[data-line]');
		return parts.join(' > ') + (line ? ` [line ${line.getAttribute('data-line')}]` : '');
	};
	const note = (el, kind, from, to) =>
		probe.log.push({
			run: probe.run,
			ms: Math.round(performance.now() - t0),
			kind,
			el: describe(el),
			from: Math.round(from * 10) / 10,
			to: Math.round(to * 10) / 10
		});

	const ro = new ResizeObserver((entries) => {
		for (const e of entries) {
			const el = e.target;
			if (!el.isConnected) continue;
			const h = e.borderBoxSize?.[0]?.blockSize ?? e.contentRect.height;
			const was = heights.get(el);
			heights.set(el, h);
			// a height of zero is an element leaving view, which its container's size accounts for
			if (probe.on && was !== undefined && h > 0 && h + 0.5 < was) note(el, 'shorter', was, h);
		}
	});
	const watch = (el) => {
		if (heights.has(el) || !inScope(el)) return;
		heights.set(el, undefined);
		ro.observe(el);
	};
	const scan = (root) => {
		watch(root);
		root.querySelectorAll?.('*').forEach(watch);
	};

	/**
	 * a run (or a chat question) has started: the page's `data-run` changed, or, on a page without it, the Run button
	 * has turned into Stop
	 */
	const runKey = () =>
		document.querySelector('[data-run]')?.getAttribute('data-run') ??
		([...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Stop')
			? `stop ${probe.run + 1}`
			: `idle ${probe.run}`);
	let lastKey = null;
	const baseline = () => {
		tops.clear();
		for (const el of heights.keys()) {
			if (!el.isConnected) continue;
			const r = el.getBoundingClientRect();
			heights.set(el, r.height);
			if (r.height > 0) tops.set(el, r.top + scrollY);
		}
		t0 = performance.now();
		probe.on = true;
	};
	const start = () => {
		new MutationObserver((ms) => {
			for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) scan(n);
			const key = runKey();
			if (lastKey !== null && key !== lastKey && !key.startsWith('idle')) {
				// a new run: the layout may let go once; the baseline is what it shows two frames later
				probe.on = false;
				probe.run++;
				scan(document.body);
				requestAnimationFrame(() => requestAnimationFrame(baseline));
			}
			lastKey = key;
		}).observe(document.documentElement, {
			childList: true,
			subtree: true,
			characterData: true,
			attributes: true,
			attributeFilter: ['data-run']
		});
		scan(document.body);

		const frame = () => {
			if (probe.on)
				for (const el of heights.keys()) {
					if (!el.isConnected) continue;
					const r = el.getBoundingClientRect();
					if (r.height === 0) continue;
					const top = r.top + scrollY;
					const was = tops.get(el);
					tops.set(el, top);
					if (was !== undefined && top + 0.5 < was) note(el, 'up', was, top);
				}
			requestAnimationFrame(frame);
		};
		requestAnimationFrame(frame);
	};
	// injected before the page has a document, it starts once there is one
	if (document.body) start();
	else addEventListener('DOMContentLoaded', start, { once: true });
})();
