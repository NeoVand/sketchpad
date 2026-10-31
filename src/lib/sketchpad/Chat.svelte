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
				{t.a}{#if t.busy}<span class="caret" aria-hidden="true"></span>{/if}
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
		color: var(--color-blue-grey);
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
	.err {
		color: var(--color-blue-grey);
	}
	.meta {
		margin-top: 4px;
		padding-left: 12px;
		font-size: var(--text-2xs);
		color: var(--color-blue-grey);
	}
</style>
