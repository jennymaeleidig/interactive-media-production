<!-- SPDX-License-Identifier: CC0-1.0 -->
<script lang="ts">
	import Menu from 'lucide-svelte/icons/menu';
	import X from 'lucide-svelte/icons/x';

	// Floating header, per the homepage baseline's dynamic-nav mechanic:
	// - resting (top of page): transparent, text follows the `overlay` prop —
	//   the tone actually under the header (dark photo hero → light text).
	// - scrolled: the rounded panel solidifies per the page `theme`, gains a
	//   clear border + blur, and text flips to the theme's ink.
	// Link graph is closed: the site is the gate, /home, /trust, and
	// /products/plume-os — every nav link routes to a built page.
	//
	// Below md the links collapse into a hamburger opening the full-screen
	// nav take-over (cream, hairline-divided flat list, full-width pill CTA —
	// the subject vendor's mobile menu pattern). Layering is tokenized in
	// app.css @theme: take-over < nav < assistant — the assistant is always
	// on top (map standing decision). No accordion chevrons — the graph is flat.
	let {
		theme = 'dark',
		overlay = theme
	}: { theme?: 'dark' | 'light'; overlay?: 'dark' | 'light' } = $props();

	let scrolled = $state(false);
	let open = $state(false);

	const links = [
		{ label: 'PlumeOS', href: '/products/plume-os' },
		{ label: 'Trust', href: '/trust' }
	];

	// Resting ink (what's underneath) vs scrolled ink (page theme). While the
	// take-over is open the header melts into its cream ground, so the ink is
	// forced to the light tone and the panel goes transparent.
	const ink = $derived.by(() => {
		const tone = open ? 'light' : scrolled ? theme : overlay;
		return tone === 'dark'
			? { wordmark: 'text-paper', link: 'text-paper/90 hover:text-paper' }
			: { wordmark: 'text-forest', link: 'text-forest/80 hover:text-forest' };
	});

	let panel = $state<HTMLElement | undefined>();
	let hamburger = $state<HTMLButtonElement | undefined>();

	// Focus contract (APG disclosure): focus lands in the take-over when it
	// opens and returns to the hamburger when it closes — but never steals
	// focus on initial mount.
	let wasOpen = $state(false);
	$effect(() => {
		if (open) {
			panel?.focus();
			wasOpen = true;
		} else if (wasOpen) {
			hamburger?.focus();
			wasOpen = false;
		}
	});

	// The take-over only exists below the desktop breakpoint; crossing md
	// while it's open closes it instead of stranding an invisible overlay.
	$effect(() => {
		if (!open) return;
		const desktop = window.matchMedia('(min-width: 768px)');
		const close = () => {
			if (desktop.matches) open = false;
		};
		desktop.addEventListener('change', close);
		return () => desktop.removeEventListener('change', close);
	});

	// Scroll lock while the take-over is up.
	$effect(() => {
		if (!open) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = previous;
		};
	});
</script>

<svelte:window
	onscroll={() => (scrolled = window.scrollY > 24)}
	onkeydown={(event) => {
		if (event.key === 'Escape' && open) open = false;
	}}
/>

<header class="gutter fixed inset-x-0 top-0 z-(--z-index-nav) pt-4">
	<nav
		aria-label="Main"
		class="mx-auto flex max-w-[82rem] items-center justify-between rounded-2xl px-6 py-3 transition-all duration-300 {open
			? 'border border-transparent bg-transparent'
			: scrolled
				? theme === 'dark'
					? 'border border-fog/10 bg-abyss/90 shadow-lg shadow-black/20 backdrop-blur'
					: 'border border-forest/16 bg-paper/90 shadow-lg shadow-forest/10 backdrop-blur'
				: 'border border-transparent bg-transparent'}"
	>
		<!-- Left group: wordmark + direct page links, subject-style (links sit
		     beside the logo, not centered) -->
		<div class="flex items-center gap-12">
			<a
				href="/home"
				class="font-display text-[1.75rem] leading-none {ink.wordmark}"
				onclick={() => (open = false)}
			>
				Plume
			</a>

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
			<a href="/trust#contact" class="btn btn-primary {open ? 'hidden' : ''}">Book a demo</a>

			<!-- Hamburger / close X (the button morphs, one control, one name).
			     Always mounted below md so focus can return to it on close. -->
			<button
				bind:this={hamburger}
				type="button"
				class="-m-2 rounded p-2 transition-colors md:hidden {ink.link}"
				aria-expanded={open}
				aria-controls="mobile-nav-take-over"
				onclick={() => (open = !open)}
			>
				{#if open}
					<X class="size-6" aria-hidden="true" />
				{:else}
					<Menu class="size-6" aria-hidden="true" />
				{/if}
				<span class="sr-only">{open ? 'Close menu' : 'Open menu'}</span>
			</button>
		</div>
	</nav>
</header>

{#if open}
	<!-- Nav take-over: full-screen cream panel — z-(--z-index-take-over) covers
	     page content but sits under the header (hamburger stays clickable) and
	     under the assistant widget, which is always on top (app.css @theme). -->
	<div
		bind:this={panel}
		id="mobile-nav-take-over"
		tabindex="-1"
		class="fixed inset-0 z-(--z-index-take-over) bg-paper text-forest md:hidden"
	>
		<div class="gutter flex min-h-[100dvh] flex-col pt-24 pb-8">
			<ul class="divide-y divide-forest/16">
				{#each links as link (link.label)}
					<li>
						<a
							href={link.href}
							class="block py-5 font-display text-3xl font-light transition-opacity hover:opacity-70"
							onclick={() => (open = false)}
						>
							{link.label}
						</a>
					</li>
				{/each}
			</ul>

			<a
				href="/trust#contact"
				class="btn btn-primary mt-8 w-full justify-center rounded-full"
				onclick={() => (open = false)}
			>
				Book a demo
			</a>
		</div>
	</div>
{/if}
