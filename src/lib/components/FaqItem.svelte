<!-- SPDX-License-Identifier: CC0-1.0 -->
<script lang="ts">
	// Bold-question accordion per the design language's FAQ motif: question in
	// the page ink, chevron in the accent, accent stays on the open control.
	// `tone` follows the theme lock — dark for dark surfaces, light for the
	// flat light run (the /trust page).
	let {
		question,
		tone = 'dark',
		children
	}: {
		question: string;
		tone?: 'dark' | 'light';
		children?: import('svelte').Snippet;
	} = $props();

	let open = $state(false);

	const panelId = $props.id();

	const tone_ = $derived(
		tone === 'dark'
			? { row: 'border-fog/10', question: 'text-paper', chevron: 'text-signal' }
			: { row: 'border-forest/16', question: 'text-forest', chevron: 'text-accent' }
	);
</script>

<div class="border-b {tone_.row}">
	<h3>
		<button
			type="button"
			aria-expanded={open}
			aria-controls={panelId}
			onclick={() => (open = !open)}
			class="flex w-full cursor-pointer items-center justify-between gap-6 py-6 text-left font-sans text-[1.35rem] font-bold {tone_.question}"
		>
			{question}
			<svg
				class="h-5 w-5 shrink-0 transition-transform duration-300 {tone_.chevron} {open
					? 'rotate-180'
					: ''}"
				viewBox="0 0 20 20"
				fill="none"
				aria-hidden="true"
			>
				<path d="M5 8l5 5 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
			</svg>
		</button>
	</h3>
	{#if open}
		<div id={panelId} class="pb-6">
			{@render children?.()}
		</div>
	{/if}
</div>
