<!-- SPDX-License-Identifier: CC0-1.0 -->
<script lang="ts">
	// Floating header, per the homepage baseline's dynamic-nav mechanic:
	// - resting (top of page): transparent, text follows the `overlay` prop —
	//   the tone actually under the header (dark photo hero → light text).
	// - scrolled: the rounded panel solidifies per the page `theme`, gains a
	//   clear border + blur, and text flips to the theme's ink.
	// Link graph is closed: the site is the gate, /home, /trust, and
	// /products/plume-os — every nav link routes to a built page.
	let {
		theme = 'dark',
		overlay = theme
	}: { theme?: 'dark' | 'light'; overlay?: 'dark' | 'light' } = $props();

	let scrolled = $state(false);

	const links = [
		{ label: 'PlumeOS', href: '/products/plume-os' },
		{ label: 'Trust', href: '/trust' }
	];

	// Resting ink (what's underneath) vs scrolled ink (page theme)
	const ink = $derived.by(() => {
		const tone = scrolled ? theme : overlay;
		return tone === 'dark'
			? { wordmark: 'text-paper', link: 'text-paper/90 hover:text-paper' }
			: { wordmark: 'text-forest', link: 'text-forest/80 hover:text-forest' };
	});
</script>

<svelte:window onscroll={() => (scrolled = window.scrollY > 24)} />

<header class="gutter fixed inset-x-0 top-0 z-50 pt-4">
	<nav
		aria-label="Main"
		class="mx-auto flex max-w-[82rem] items-center justify-between rounded-2xl px-6 py-3 transition-all duration-300 {scrolled
			? theme === 'dark'
				? 'border border-fog/10 bg-abyss/90 shadow-lg shadow-black/20 backdrop-blur'
				: 'border border-forest/16 bg-paper/90 shadow-lg shadow-forest/10 backdrop-blur'
			: 'border border-transparent bg-transparent'}"
	>
		<!-- Left group: wordmark + direct page links, subject-style (links sit
		     beside the logo, not centered) -->
		<div class="flex items-center gap-12">
			<a href="/home" class="font-display text-[1.75rem] leading-none {ink.wordmark}">Plume</a>

			<ul class="hidden items-center gap-8 md:flex">
				{#each links as link (link.label)}
					<li>
						<a href={link.href} class="text-[1.05rem] font-medium transition-colors {ink.link}">
							{link.label}
						</a>
					</li>
				{/each}
			</ul>
		</div>

		<div class="flex items-center gap-5">
			<a href="/trust#contact" class="btn btn-primary">Book a demo</a>
		</div>
	</nav>
</header>
