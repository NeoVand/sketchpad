<script lang="ts">
	import type { ChatTurn } from './pad.svelte.ts';

	interface Props {
		turns: ChatTurn[];
		/** the model is loaded */
		ready: boolean;
		busy: boolean;
		onask: (q: string) => void;
	}

	let { turns, ready, busy, onask }: Props = $props();
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

	function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!q.trim() || !ready || busy) return;
		onask(q);
		q = '';
	}
</script>

<div class="chat">
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
	{#each turns as t, i (i)}
		<div class="turn">
			<p class="q">{t.q}</p>
			<!-- the answer comes from stock Qwen (gate 0): cobalt, the colour of the alternative -->
			<p class="a" class:busy={t.busy}>
				{#each spans(t.a) as sp, k (k)}{#if sp.mark === 'b'}<strong>{sp.text}</strong
						>{:else if sp.mark === 'i'}<em>{sp.text}</em
						>{:else}{sp.text}{/if}{/each}{#if t.busy}<span class="caret" aria-hidden="true"
					></span>{/if}
				{#if t.error}<span class="err">{t.error}</span>{/if}
			</p>
			{#if t.ms !== null}<p class="meta num">{(t.ms / 1000).toFixed(1)} s</p>{/if}
		</div>
	{/each}
</div>

<style>
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
	.turn {
		margin-top: 20px;
	}
	.q {
		color: var(--color-ink);
		font-size: var(--text-ui);
		font-weight: 500;
	}
	.a {
		margin-top: 6px;
		padding-left: 12px;
		box-shadow: inset 2px 0 0 var(--color-cobalt-light);
		color: var(--color-ink-soft);
		font-size: var(--text-ui);
		white-space: pre-wrap;
		max-width: 68ch;
	}
	.caret {
		display: inline-block;
		width: 7px;
		height: 1em;
		margin-left: 2px;
		vertical-align: -2px;
		background: var(--color-cobalt);
		animation: blink 1s ease-in-out infinite;
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
	.meta {
		margin-top: 4px;
		padding-left: 12px;
		font-size: var(--text-2xs);
		color: var(--color-ink-soft);
	}
</style>
