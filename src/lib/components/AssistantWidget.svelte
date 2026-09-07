<!-- SPDX-License-Identifier: CC0-1.0 -->
<!--
	The Plume AI Sales Assistant: a site-wide floating bubble opening a
	choices-only dialogue panel, mimicking the subject vendor's sales-
	assistant widget (avatar header, agent bubbles, persistent chips,
	privacy footer) — with no free-text input: the runtime's option set is
	the one reply mechanism. Panel stays light (paper) on both page themes,
	like the source widget. Suppressed on the gate page (/).
-->
<script lang="ts">
	import { page } from '$app/state';
	import X from 'lucide-svelte/icons/x';
	import { assistant } from '$lib/state/assistant.svelte';

	let panel = $state<HTMLElement | undefined>();
	let bubble = $state<HTMLElement | undefined>();
	let scroller = $state<HTMLElement | undefined>();

	// Focus contract (APG non-modal dialog): focus lands on the panel when
	// it opens and returns to the bubble when it closes — but never steals
	// focus on initial mount.
	let wasOpen = $state(false);
	$effect(() => {
		if (assistant.open) {
			panel?.focus();
			wasOpen = true;
		} else if (wasOpen) {
			bubble?.focus();
			wasOpen = false;
		}
	});

	// Keep the newest bubble (and the typing indicator) in view.
	$effect(() => {
		void assistant.messages.length;
		void assistant.typing;
		scroller?.scrollTo({ top: scroller.scrollHeight });
	});
</script>

<svelte:window
	onkeydown={(event) => {
		if (event.key === 'Escape' && assistant.open) assistant.hide();
	}}
/>

{#if page.url.pathname !== '/'}
	<div class="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3 sm:right-6 sm:bottom-6">
		{#if assistant.open}
			<div
				bind:this={panel}
				role="dialog"
				aria-label="Plume AI Sales Assistant"
				tabindex="-1"
				class="flex h-[32rem] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-forest/15 bg-paper text-forest"
			>
				<header class="flex items-center gap-3 border-b border-forest/10 bg-cream px-4 py-3">
					<span
						aria-hidden="true"
						class="flex size-9 shrink-0 items-center justify-center rounded-full bg-forest font-display text-lg text-paper"
					>
						P
					</span>
					<div class="min-w-0 flex-1 leading-tight">
						<p class="font-display text-lg">Plume</p>
						<p class="text-xs text-forest/70">AI Sales Assistant</p>
					</div>
					<button
						type="button"
						class="rounded-full p-1.5 text-forest/70 transition-colors hover:bg-forest/10 hover:text-forest"
						onclick={() => assistant.hide()}
					>
						<X class="size-5" aria-hidden="true" />
						<span class="sr-only">Close the assistant</span>
					</button>
				</header>

				<div
					bind:this={scroller}
					role="log"
					aria-live="polite"
					aria-label="Conversation"
					class="flex-1 space-y-2 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-3"
				>
					{#each assistant.messages as message}
						{#if message.role === 'assistant'}
							<p class="w-fit max-w-[85%] rounded-xl rounded-tl-sm bg-oat px-3 py-2 text-sm">
								{message.text}
							</p>
						{:else}
							<p
								class="ml-auto w-fit max-w-[85%] rounded-xl rounded-tr-sm bg-accent px-3 py-2 text-sm text-paper"
							>
								{message.text}
							</p>
						{/if}
					{/each}
					{#if assistant.typing}
						<p
							class="w-16 rounded-xl rounded-tl-sm bg-oat px-3 py-2.5"
							aria-label="The assistant is typing"
						>
							<span class="typing-dots" aria-hidden="true">
								<span></span><span></span><span></span>
							</span>
						</p>
					{/if}
				</div>

				{#if assistant.choices.length > 0}
					<!-- Contextual choices: the one reply mechanism — the user's
					     picked option lands as their bubble above the chips. -->
					<div
						class="flex flex-wrap justify-end gap-2 px-4 py-2"
						role="group"
						aria-label="Reply choices"
					>
						{#each assistant.choices as choice (choice.index)}
							<button
								type="button"
								class="rounded-full bg-accent px-3.5 py-1.5 text-sm font-medium text-paper transition-colors hover:bg-fern"
								onclick={() => assistant.choose(choice.index)}
							>
								{choice.text}
							</button>
						{/each}
					</div>
				{/if}

				<div class="flex items-center gap-2 border-t border-forest/10 px-4 py-2.5">
					{#each assistant.chips as chip (chip.node)}
						<button
							type="button"
							disabled={assistant.typing}
							class="rounded-lg bg-forest px-3 py-1.5 text-sm font-medium text-accent-soft transition-colors hover:bg-pine disabled:opacity-50"
							onclick={() => assistant.jumpToChip(chip)}
						>
							{chip.label}
						</button>
					{/each}
					<a
						href="/trust"
						class="ml-auto text-xs text-forest/60 underline underline-offset-2 transition-colors hover:text-forest"
					>
						Privacy Policy
					</a>
				</div>
			</div>
		{/if}

		<button
			bind:this={bubble}
			type="button"
			class="flex size-14 items-center justify-center rounded-full bg-accent font-display text-2xl text-paper transition-colors hover:bg-fern"
			aria-expanded={assistant.open}
			onclick={() => assistant.toggle()}
		>
			<span aria-hidden="true">P</span>
			<span class="sr-only">Plume AI Sales Assistant</span>
		</button>
	</div>
{/if}

<style>
	/* Typing dots: three staggered pulses — keyframes aren't expressible in
	   utilities, so this lives here; app.css's reduce-motion rule gates it. */
	.typing-dots {
		display: inline-flex;
		gap: 0.25rem;
	}
	.typing-dots span {
		width: 0.375rem;
		height: 0.375rem;
		border-radius: 9999px;
		background: var(--color-forest);
		opacity: 0.2;
		animation: dot-pulse 1.4s ease-in-out infinite;
	}
	.typing-dots span:nth-child(2) {
		animation-delay: 0.2s;
	}
	.typing-dots span:nth-child(3) {
		animation-delay: 0.4s;
	}
	@keyframes dot-pulse {
		0%,
		100% {
			opacity: 0.2;
		}
		50% {
			opacity: 1;
		}
	}
	/* app.css's reduce-motion rule caps every animation at 0.01ms, which turns
	   this 1.4s loop into a strobe — so reduced-motion users get a slower,
	   opacity-only loop instead (functional feedback, below vestibular
	   thresholds; the !important beats the global 0.01ms cap). */
	@media (prefers-reduced-motion: reduce) {
		.typing-dots span {
			animation: dot-pulse 2.8s ease-in-out infinite !important;
		}
	}
</style>
