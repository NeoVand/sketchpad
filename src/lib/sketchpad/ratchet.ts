/**
 * A run's layout only grows. From the moment a run starts until the next one does, an element given this attachment
 * never gets smaller: it keeps the largest size it has had since the run started as its minimum, so a step that needs
 * less room (a shorter note, a sheet with one row fewer, a line that waits for its number) leaves the room where it
 * was, and nothing below it moves up. The next run (a new `run`) lets go once, before it starts to grow again.
 *
 * Sizes are border-box (the page sets box-sizing: border-box everywhere) and ignore transforms, as layout does.
 */
export function ratchet(run: unknown, axes: 'height' | 'both' = 'height') {
	return (el: HTMLElement) => {
		void run;
		let h = 0;
		let w = 0;
		const grow = () => {
			const nh = el.offsetHeight;
			if (nh > h) {
				h = nh;
				el.style.minHeight = `${h}px`;
			}
			if (axes === 'both' && el.offsetWidth > w) {
				w = el.offsetWidth;
				el.style.minWidth = `${w}px`;
			}
		};
		const ro = new ResizeObserver(grow);
		ro.observe(el);
		grow();
		return () => {
			ro.disconnect();
			el.style.minHeight = '';
			el.style.minWidth = '';
		};
	};
}
