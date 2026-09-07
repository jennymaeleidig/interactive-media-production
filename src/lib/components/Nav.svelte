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
	// nav take-over (stone body under a paper header strip — the two-tone
	// analog of the subject vendor's mobile menu — hairline-divided flat list,
	// full-width pill CTA). Layering is tokenized in
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

	const close = () => (open = false);

	// Resting ink (what's underneath) vs scrolled ink (page theme). While the
	// take-over is open the ink is forced to the light tone: the header panel
	// carries its own solid paper fill above the stone take-over body (the
	// two-tone strip-over-body pattern — forest ink on paper stays readable).
	const ink = $derived.by(() => {
		const tone = open ? 'light' : scrolled ? theme : overlay;
		return tone === 'dark'
			? { wordmark: 'text-paper', link: 'text-paper/90 hover:text-paper' }
			: { wordmark: 'text-forest', link: 'text-forest/80 hover:text-forest' };
	});

	// Resting = invisible panel; scrolling solidifies it in the page theme's
	// ink. Open always wins: the header keeps its own solid paper fill — the
	// lighter strip over the deeper stone take-over body (ticket 03 two-tone).
	const panelClass = $derived.by(() => {
		if (open) return 'border border-forest/16 bg-paper shadow-lg shadow-forest/10';
		if (!scrolled) return 'border border-transparent bg-transparent';
		return theme === 'dark'
			? 'border border-fog/10 bg-abyss/90 shadow-lg shadow-black/20 backdrop-blur'
			: 'border border-forest/16 bg-paper/90 shadow-lg shadow-forest/10 backdrop-blur';
	});

	let panel = $state<HTMLElement | undefined>();
	let hamburger = $state<HTMLButtonElement | undefined>();

	// Focus contract (APG disclosure): focus lands in the take-over when it
	// opens and returns to the hamburger when it closes — but never steals
	// focus on initial mount. On open it lands on the first link, not the
	// bare container, so screen readers announce a menu entry.
	let wasOpen = $state(false);
	$effect(() => {
		if (open) {
			const first = panel?.querySelector<HTMLElement>('a[href], button');
			(first ?? panel)?.focus();
			wasOpen = true;
		} else if (wasOpen) {
			hamburger?.focus();
			wasOpen = false;
		}
	});

	// The take-over covers the whole page, so for keyboard users it behaves as
	// modal: Tab cycles across the visible header controls (wordmark, close X)
	// and the take-over's links + CTA instead of falling through into the
	// focusable page content hidden beneath the fixed panel.
	function cycleTakeOverFocus(event: KeyboardEvent) {
		if (!panel) return;
		const roots = [hamburger?.closest('nav'), panel];
		const focusables = roots
			.flatMap((root) =>
				Array.from(root?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? [])
			)
			.filter((el) => el.offsetParent !== null);
		if (focusables.length === 0) return;
		const at = focusables.findIndex((el) => el === document.activeElement);
		event.preventDefault();
		const next = event.shiftKey
			? at <= 0
				? focusables.length - 1
				: at - 1
			: at === -1 || at === focusables.length - 1
				? 0
				: at + 1;
		focusables[next].focus();
	}

	// The take-over only exists below the desktop breakpoint; crossing md
	// while it's open closes it instead of stranding an invisible overlay.
	$effect(() => {
		if (!open) return;
		const desktop = window.matchMedia('(min-width: 768px)');
		const autoClose = () => {
			if (desktop.matches) open = false;
		};
		desktop.addEventListener('change', autoClose);
		return () => desktop.removeEventListener('change', autoClose);
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
		if (!open) return;
		if (event.key === 'Escape') open = false;
		else if (event.key === 'Tab') cycleTakeOverFocus(event);
	}}
/>

<header class="gutter fixed inset-x-0 top-0 z-(--z-index-nav) pt-4">
	<nav
		aria-label="Main"
		class="mx-auto flex max-w-[82rem] items-center justify-between rounded-2xl px-6 py-3 transition-all duration-300 {panelClass}"
	>
		<!-- Left group: wordmark + direct page links, subject-style (links sit
		     beside the logo, not centered) -->
		<div class="flex items-center gap-12">
			<a
				href="/home"
				class="font-display text-[1.75rem] leading-none {ink.wordmark}"
				onclick={close}
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
	<!-- Nav take-over: full-screen stone panel (one tone deeper than the
	     paper header strip above it — two-tone, ticket 03) —
	     z-(--z-index-take-over) covers page content but sits under the header
	     (hamburger stays clickable) and under the assistant widget, which is
	     always on top (app.css @theme). -->
	<div
		bind:this={panel}
		id="mobile-nav-take-over"
		tabindex="-1"
		aria-label="Site menu"
		class="fixed inset-0 z-(--z-index-take-over) bg-stone text-forest md:hidden"
	>
		<div class="gutter flex min-h-[100dvh] flex-col pt-24 pb-8">
			<ul class="divide-y divide-forest/16">
				{#each links as link (link.label)}
					<li>
						<a
							href={link.href}
							class="block py-5 font-display text-3xl font-light transition-opacity hover:opacity-70"
							onclick={close}
						>
							{link.label}
						</a>
					</li>
				{/each}
			</ul>

			<a
				href="/trust#contact"
				class="btn btn-primary mt-8 w-full justify-center rounded-full"
				onclick={close}
			>
				Book a demo
			</a>
		</div>
	</div>
{/if}
