<script lang="ts">
	import type { ChatTurn } from './pad.svelte.ts';

	interface Props {
		turns: ChatTurn[];
		/** the model is loaded */
		ready: boolean;
		busy: boolean;
		/** the model asked: 1, the one that opens its sheet; 0, stock Qwen3.5-0.8B */
		gate: 0 | 1;
		ongate: (g: 0 | 1) => void;
		/** questions to try, one click each */
		examples: string[];
		onask: (q: string) => void;
	}

	let { turns, ready, busy, gate, ongate, examples, onask }: Props = $props();
	let q = $state('');

	/** the answer's **bold** and *italic* spans, as the model marks them (the markdown worth drawing in a short reply) */
	const spans = (a: string) =>
		a
			.split(/(\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*\*)/)
			.map((t) =>
				t.startsWith('**') && t.endsWith('**') && t.length > 4
					? { mark: 'b', text: t.slice(2, -2) }
					: t.startsWith('*') && t.endsWith('*') && t.length > 2
						? { mark: 'i', text: t.slice(1, -1) }
						: { mark: '', text: t }
			);

	/**
	 * A reply in its parts: the model's prose, each sheet block it wrote (open while it is still writing it), and the
	 * sheet's result lines that went back into the reply after a block
	 */
	interface Part {
		kind: 'text' | 'sheet' | 'result';
		text: string;
		open?: boolean;
		/** which block of the reply (sheet and result parts) */
		block?: number;
	}
	function parts(a: string): Part[] {
		const out: Part[] = [];
		let last = 0;
		let n = 0;
		for (const m of a.matchAll(/```sheet[^\n]*\n?([\s\S]*?)(```|$)/g)) {
			out.push({ kind: 'text', text: a.slice(last, m.index) });
			out.push({ kind: 'sheet', text: m[1].trimEnd(), open: m[2] !== '```', block: n });
			last = m.index + m[0].length;
			const r = /^\n((?:= [^\n]*(?:\n|$))+)/.exec(a.slice(last));
			if (r) {
				out.push({ kind: 'result', text: r[1].trim(), block: n });
				last += r[0].length;
			}
			n++;
		}
		out.push({ kind: 'text', text: a.slice(last) });
		return out.filter((p) => p.kind !== 'text' || p.text.trim());
	}

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!q.trim() || !ready || busy) return;
		onask(q);
		q = '';
	}
</script>

<div class="chat">
	<div class="model" role="group" aria-label="The model to ask">
		<span class="k">Model</span>
		<button class:on={gate === 1} aria-pressed={gate === 1} onclick={() => ongate(1)}>
			with its sheet
		</button>
		<button class:on={gate === 0} aria-pressed={gate === 0} onclick={() => ongate(0)}>
			stock Qwen
		</button>
	</div>
	<form onsubmit={submit}>
		<input
			bind:value={q}
			placeholder={ready ? 'Ask it anything' : 'Ask it anything, once the model is loaded'}
			disabled={!ready}
			aria-label="Ask the model a question"
			maxlength="400"
		/>
		<button type="submit" disabled={!ready || busy || !q.trim()}>Ask</button>
	</form>
	<ul class="examples" aria-label="Questions to try">
		{#each examples as ex (ex)}
			<li>
				<button disabled={!ready || busy} onclick={() => onask(ex)}>{ex}</button>
			</li>
		{/each}
	</ul>
	{#each turns as t, i (i)}
		<div class="turn">
			<p class="q">{t.q}</p>
			<div class="a" class:stock={t.gate === 0} class:busy={t.busy}>
				{#each parts(t.a) as p, k (k)}
					{#if p.kind === 'sheet'}
						<pre class="block" aria-label="A sheet block the model wrote">{p.text}</pre>
						{@const b = t.blocks[p.block ?? 0]}
						{#if !p.open && b && b.result === null}
							<p class="working">on the sheet…</p>
						{/if}
					{:else if p.kind === 'result'}
						<pre class="result num" aria-label="The sheet's result">{p.text}</pre>
					{:else}
						<p class="text">
							{#each spans(p.text.replace(/^\n+|\n+$/g, '')) as sp, j (j)}{#if sp.mark === 'b'}<strong
										>{sp.text}</strong
									>{:else if sp.mark === 'i'}<em>{sp.text}</em>{:else}{sp.text}{/if}{/each}
						</p>
					{/if}
				{/each}
				{#if t.error}<p class="err">{t.error}</p>{/if}
			</div>
			<!-- one line under the reply: the caret while it writes, then its times (the same height, so nothing moves) -->
			<p class="meta num">
				{#if t.busy}<span class="caret" class:stock={t.gate === 0} aria-hidden="true"
					></span>{:else if t.ms !== null}<span>{(t.ms / 1000).toFixed(1)} s</span
					>{#each t.blocks as b, k (k)}{#if b.seconds !== null}<span
								>sheet {t.blocks.length > 1 ? `${k + 1} ` : ''}{b.seconds.toFixed(1)} s</span
							>{/if}{/each}<span>{t.gate === 1 ? 'with its sheet' : 'stock Qwen'}</span
					>{:else}&nbsp;{/if}
			</p>
		</div>
	{/each}
</div>

<style>
	.model {
		display: flex;
		align-items: baseline;
		gap: 12px;
		margin-bottom: 12px;
		font-size: var(--text-sm);
	}
	.model .k {
		color: var(--color-ink-soft);
	}
	.model button {
		color: var(--color-ink-soft);
		font-weight: 400;
	}
	.model button.on {
		color: var(--color-ink);
		font-weight: 500;
	}
	form {
		display: flex;
		gap: 14px;
		align-items: center;
	}
	input {
		flex: 1;
		min-width: 0;
		height: 34px;
		padding: 0 12px;
		border: 0;
		border-radius: var(--radius-ui);
		background: var(--field);
		color: var(--color-ink);
		font: inherit;
		font-size: var(--text-ui);
		transition: background var(--hover) ease;
	}
	input:hover:not(:disabled),
	input:focus {
		background: var(--field-hover);
		outline: none;
	}
	input::placeholder {
		color: var(--color-ink-soft);
	}
	button {
		border: 0;
		background: none;
		color: var(--color-ink-soft);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 500;
		padding: 0 2px;
		cursor: pointer;
		transition: color var(--hover) ease;
	}
	button:hover:not(:disabled) {
		color: var(--color-ink);
	}
	button:disabled {
		color: var(--color-mist);
		cursor: default;
	}
	/* questions to try: quiet lines, one click each */
	.examples {
		display: grid;
		gap: 6px;
		margin: 12px 0 0;
		padding: 0;
		list-style: none;
	}
	.examples button {
		padding: 0;
		text-align: left;
		font-size: var(--text-xs);
		font-weight: 400;
		line-height: 1.4;
	}
	.examples button:disabled {
		color: var(--color-ink-soft);
		opacity: 0.6;
	}
	.turn {
		margin-top: 20px;
	}
	.q {
		color: var(--color-ink);
		font-size: var(--text-ui);
		font-weight: 500;
	}
	/* the reply: a rose rule for the model with its sheet, cobalt for stock Qwen */
	.a {
		display: grid;
		gap: 6px;
		margin-top: 6px;
		padding-left: 12px;
		box-shadow: inset 2px 0 0 var(--color-rose-light);
		color: var(--color-ink-soft);
		font-size: var(--text-ui);
		max-width: 68ch;
	}
	.a.stock {
		box-shadow: inset 2px 0 0 var(--color-cobalt-light);
	}
	.text {
		white-space: pre-wrap;
	}
	/* what the model wrote on its sheet, then what the sheet gave back: both the model's own */
	pre {
		margin: 0;
		font-family: var(--font-mono);
		font-size: var(--text-sm);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.block {
		color: var(--color-ink);
	}
	.result {
		color: var(--color-rose);
	}
	.working {
		font-size: var(--text-xs);
		color: var(--color-ink-soft);
	}
	.caret {
		display: inline-block;
		width: 7px;
		height: 1em;
		vertical-align: -2px;
		background: var(--color-rose);
		animation: blink 1s ease-in-out infinite;
	}
	.caret.stock {
		background: var(--color-cobalt);
	}
	@keyframes blink {
		50% {
			opacity: 0.2;
		}
	}
	.a strong {
		font-weight: 600;
		color: var(--color-ink);
	}
	.err {
		color: var(--color-ink-soft);
	}
	.meta span:not(.caret) + span::before {
		content: ' · ';
	}
	.meta {
		margin-top: 4px;
		padding-left: 12px;
		height: 16px;
		line-height: 16px;
		font-size: var(--text-2xs);
		color: var(--color-ink-soft);
	}
</style>
