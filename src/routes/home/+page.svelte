<!-- SPDX-License-Identifier: CC0-1.0 -->
<!--
	Phase-alpha homepage (ticket 08), restyled under the homepage baseline
	(ticket 18): flat light run, full-bleed photo hero with no CTA, glass
	stat cards, hairline commitments, stacked darks. Light theme, placeholder
	imagery frames, ALL copy placeholder pending the corporate-jargon-voice
	pass (copy-policy decision on the vendor-mimicry map).
-->
<script lang="ts">
	import { blurWords } from '$lib/actions/blurWords';
	import { canvasTheme } from '$lib/actions/canvasTheme';
	import Nav from '$lib/components/Nav.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import MapPlaceholder from '$lib/components/MapPlaceholder.svelte';

	const heroCards = [
		{
			numeral: '10,000+',
			chips: ['bg-accent', 'bg-accent-soft', 'bg-fern'],
			caption: 'Placeholder: fifteen-character caption'
		},
		{
			numeral: '42%',
			chips: ['bg-fern', 'bg-accent', 'bg-signal'],
			caption: 'Placeholder: fifteen-character caption'
		},
		{
			numeral: '1 in 5',
			chips: ['bg-signal', 'bg-fern', 'bg-accent-soft'],
			caption: 'Placeholder: fifteen-character caption'
		}
	];

	const gallery = [
		{ alt: 'Placeholder: wide neighborhood frame', span: 'md:col-span-3', ratio: 'aspect-[2/1]' },
		{ alt: 'Placeholder: tall street frame', span: 'md:col-span-1', ratio: 'aspect-[1/1]' },
		{ alt: 'Placeholder: golden-hour frame', span: 'md:col-span-2', ratio: 'aspect-[3/2]' }
	];

	const commitments = [
		'Placeholder commitment one',
		'Placeholder commitment two',
		'Placeholder commitment three',
		'Placeholder commitment four'
	];

	const stats = [
		{ numeral: '10,000+', caption: 'Placeholder: one-line human caption' },
		{ numeral: '42%', caption: 'Placeholder: one-line human caption' },
		{ numeral: '1 in 5', caption: 'Placeholder: one-line human caption' }
	];

	const lineup = [
		{ label: 'PlumeOS', href: '/products/plume-os' as string | null },
		{ label: 'Cameras', href: null },
		{ label: 'Sensors', href: null }
	];
</script>

<svelte:head>
	<title>Plume — Everything, already together.</title>
	<meta
		name="description"
		content="Plume, a satirical community platform prototype. All copy is placeholder."
	/>
</svelte:head>

<Nav theme="light" overlay="dark" />

<!-- Canvas tone: stamps body[data-theme] so the overscroll bounce area
	     matches the page. The attribute means "canvas tone", not "page mode"
	     — this page's bookends are both dark (photo hero + dark footer), so
	     the canvas is abyss. -->
<main use:canvasTheme={'dark'} class="bg-paper text-forest">
	<!-- Photo hero: full-bleed placeholder frame, 85svh, 20% wash, bottom-left
	     content, NO CTA button — the nav carries the only ask. -->
	<section class="relative flex min-h-[85svh] items-end overflow-hidden bg-abyss">
		<div class="hero-wash absolute inset-0"></div>
		<div class="absolute inset-0 bg-black/20"></div>
		<div class="gutter relative w-full pb-16">
			<div class="mx-auto max-w-[82rem]">
				<h1
					class="max-w-[24ch] font-display text-[clamp(3.25rem,2.75rem+1.25vw,3.875rem)] leading-[1] font-light text-paper"
					use:blurWords={{ stagger: 92, immediate: true }}
				>
					<!-- COPY-PENDING -->
					Better tools for safer communities
				</h1>
				<!-- COPY-PENDING -->
				<p class="mt-6 max-w-[60ch] text-[1.125rem] font-light text-paper">
					Placeholder: one mission paragraph on how Plume brings every feed, system, and team into a
					single operating picture for the whole community.
				</p>
			</div>
		</div>
	</section>

	<!-- Hero cards: 3 sand squares — quiet eyebrow, tricolor chips, serif-300
	     numeral, 15ch caption. Hover: opacity .7. -->
	<section class="gutter py-8 md:py-12">
		<div class="mx-auto grid max-w-[82rem] gap-6 md:grid-cols-3">
			{#each heroCards as card (card.numeral + card.caption)}
				<a
					href="/products/plume-os"
					class="block rounded-[1rem] bg-oat p-6 transition-opacity duration-200 hover:opacity-70"
				>
					<p class="eyebrow text-forest"><!-- COPY-PENDING -->Placeholder eyebrow</p>
					<div class="mt-3 flex gap-1.5">
						{#each card.chips as chip, i (i)}
							<span class="h-2 w-2 rounded-[2px] {chip}"></span>
						{/each}
					</div>
					<p class="mt-4 font-display text-[2rem] leading-none font-light">
						<!-- COPY-PENDING -->
						{card.numeral}
					</p>
					<p class="mt-2 max-w-[15ch] text-body text-forest/80">{card.caption}</p>
				</a>
			{/each}
		</div>
	</section>

	<!-- Asymmetric gallery: thinned photo row, aspect-ratio frames, 12px radius -->
	<section class="gutter py-16 md:py-20">
		<div class="mx-auto max-w-[82rem]">
			<div class="grid gap-6 md:grid-cols-4">
				<h2
					class="max-w-[24ch] font-display text-[2.75rem] leading-[1] font-light max-md:text-[3.125rem] md:col-span-1"
				>
					<!-- COPY-PENDING -->
					Public safety works better together
				</h2>
				<p class="max-w-[45ch] self-end text-[1.125rem] text-forest/80 md:col-span-1">
					<!-- COPY-PENDING -->
					Placeholder: one lede paragraph on shared views across teams and neighborhoods.
				</p>
			</div>
			<div class="mt-10 grid gap-6 md:grid-cols-3">
				{#each gallery as img (img.alt)}
					<div
						class="frame {img.ratio} {img.span} transition-opacity duration-200 hover:opacity-90"
					>
						<span class="sr-only">{img.alt}</span>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- Commitments: hairline rows, serif-300 items, plain text — subject-native -->
	<section class="gutter py-16 md:py-20">
		<div class="mx-auto max-w-[82rem]">
			<h2
				class="max-w-[24ch] font-display text-[clamp(3.25rem,2.75rem+1.25vw,3.875rem)] leading-[1] font-light"
			>
				<!-- COPY-PENDING -->
				Raising the bar
			</h2>
			<p class="mt-4 max-w-[45ch] text-[1.125rem] text-forest/80">
				<!-- COPY-PENDING -->
				This year, we've:
			</p>
			<ul class="mt-10">
				{#each commitments as item (item)}
					<li
						class="border-t border-forest/16 py-5 font-display text-[1.125rem] font-light last:border-b"
					>
						<!-- COPY-PENDING -->
						{item}
					</li>
				{/each}
			</ul>
		</div>
	</section>

	<!-- Results: glass stat cards — dark card, photo frame, blur(60px) inner
	     panel; numerals at heading scale (giant-stat treatment is dead) -->
	<section class="gutter py-16 md:py-20">
		<div class="mx-auto max-w-[82rem]">
			<h2
				class="max-w-[24ch] font-display text-[clamp(3.25rem,2.75rem+1.25vw,3.875rem)] leading-[1] font-light"
			>
				<!-- COPY-PENDING -->
				Results that matter
			</h2>
			<p class="mt-4 max-w-[60ch] text-body font-light text-forest/80">
				<!-- COPY-PENDING -->
				Placeholder: one paragraph framing the stats below.
			</p>
			<div class="mt-10 grid gap-6 md:grid-cols-3">
				{#each stats as stat (stat.numeral + stat.caption)}
					<div class="rounded-[12px] bg-abyss p-3">
						<div
							class="stat-ground relative flex aspect-[4/4.3] flex-col justify-end overflow-hidden rounded-[8px]"
						>
							<div class="stat-glass relative m-4 rounded-[8px] p-6 backdrop-blur-xl">
								<p
									class="font-display text-[clamp(3.25rem,2.75rem+1.25vw,3.875rem)] leading-[1] font-light text-paper"
								>
									<!-- COPY-PENDING -->
									{stat.numeral}
								</p>
								<p
									class="mt-2 max-w-[20ch] font-display text-[2rem] leading-[1.04] font-light text-paper/80"
								>
									{stat.caption}
								</p>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- Trust moment: quiet eyebrow + heading + paragraph + a single CTA —
	     restraint is the boast -->
	<section class="gutter py-16 md:py-20">
		<div class="mx-auto max-w-[82rem] text-center">
			<p class="eyebrow"><!-- COPY-PENDING -->Powerful technology needs clear boundaries</p>
			<h2
				class="mx-auto mt-3 max-w-[24ch] font-display text-[clamp(3.25rem,2.75rem+1.25vw,3.875rem)] leading-[1] font-light"
			>
				<!-- COPY-PENDING -->
				Accountability built in
			</h2>
			<p class="mx-auto mt-4 max-w-[60ch] text-body font-light text-forest/80">
				<!-- COPY-PENDING -->
				Placeholder: every search is logged. Every policy is transparent.
			</p>
			<a href="/trust" class="btn btn-primary mt-8"><!-- COPY-PENDING -->Visit the Trust Hub</a>
		</div>
	</section>

	<!-- Product band: the dark act — glass centerpiece (the owner-loved map
	     illustration), glass lineup rail, arrow link -->
	<section id="platform" class="gutter overflow-hidden bg-moss py-20 text-fog">
		<div class="mx-auto max-w-[82rem]">
			<p class="eyebrow text-fog"><!-- COPY-PENDING -->Plume Platform</p>
			<h2
				class="mt-3 max-w-[24ch] font-display text-[2.75rem] leading-[1] font-light text-paper max-md:text-[3.125rem]"
				use:blurWords={{ stagger: 58 }}
			>
				<!-- COPY-PENDING -->
				Safety requires more than cameras. It needs a connected platform.
			</h2>
			<div class="mt-12">
				<MapPlaceholder />
			</div>
			<div class="lineup-rail mt-12 grid gap-6 rounded-[8px] p-6 backdrop-blur-2xl md:grid-cols-3">
				{#each lineup as product (product.label)}
					{#if product.href}
						<!-- Built surface: a real link with the arrow affordance -->
						<a href={product.href} class="group block">
							<div class="frame aspect-[3/2] transition-opacity group-hover:opacity-90">
								<span class="sr-only">Placeholder: {product.label} product frame</span>
							</div>
							<p class="mt-3 flex items-center gap-2 text-body font-medium text-signal">
								{product.label}
								<span aria-hidden="true" class="transition-transform group-hover:translate-x-1"
									>→</span
								>
							</p>
						</a>
					{:else}
						<!-- Unbuilt surface: a quiet frame, no dead link -->
						<div>
							<div class="frame aspect-[3/2]">
								<span class="sr-only">Placeholder: {product.label} product frame</span>
							</div>
							<p class="mt-3 text-body font-medium text-signal/60">{product.label}</p>
						</div>
					{/if}
				{/each}
			</div>
			<a
				href="/products/plume-os"
				class="mt-10 inline-flex h-11 items-center gap-1.5 text-[0.875rem] font-light text-signal hover:text-paper"
			>
				<!-- COPY-PENDING -->
				See how Plume works
				<span aria-hidden="true">→</span>
			</a>
		</div>
	</section>
</main>

<Footer />

<style>
	/* Stat-card ground and glass tiers: multi-stop gradients over var() theme
	   tokens plus translucent fills — un-representable in utilities, so per
	   CODING_STANDARDS.md's Tailwind rule they live here (with this comment)
	   rather than in inline style attributes. */
	.stat-ground {
		background:
			radial-gradient(120% 90% at 20% 10%, rgb(56 111 164 / 0.2), transparent 55%),
			linear-gradient(160deg, var(--color-pine), var(--color-abyss));
	}
	.stat-glass {
		background: rgb(0 0 0 / 0.11);
	}
	.lineup-rail {
		background: rgb(255 255 255 / 0.1);
	}
</style>
