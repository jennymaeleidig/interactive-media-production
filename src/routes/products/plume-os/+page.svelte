<!-- SPDX-License-Identifier: CC0-1.0 -->
<!--
	PlumeOS product page: mimics the structure of the vendor's real-time
	crime center product page, skinned entirely in the homepage baseline
	(full-bleed photo hero, flat light run, one dark act, stacked darks).
	The product surface is the owner-loved MapPlaceholder illustration —
	fake-UI-safe pending the imagery pass. The source page's empty
	"related products / resources" rails are skipped. ALL copy placeholder
	pending the corporate-jargon-voice pass (copy-policy decision on the
	vendor-mimicry map).
-->
<script lang="ts">
	import { blurWords } from '$lib/actions/blurWords';
	import { canvasTheme } from '$lib/actions/canvasTheme';
	import Nav from '$lib/components/Nav.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import MapPlaceholder from '$lib/components/MapPlaceholder.svelte';
	import FaqItem from '$lib/components/FaqItem.svelte';
	import Check from 'lucide-svelte/icons/check';

	const capabilities = [
		'Live and private camera feeds',
		'CAD and records integrations',
		'Free-form search and alerts',
		'Cross-agency sharing',
		'Any vendor, any feed',
		'Geospatial mapping',
		'Unlimited seats',
		'Audit trail built in'
	];

	const faqs = [
		{
			q: 'Who is PlumeOS for?',
			a: 'Placeholder: any team that needs real-time situational awareness — police and fire departments, fusion centers, security operations centers, hospitals, logistics hubs. From a dedicated operations center or a phone in the field, every seat sees the same live map.'
		},
		{
			q: 'What makes PlumeOS different from a VMS or CAD system?',
			a: 'Placeholder: those systems are valuable, but they live in silos. PlumeOS is the glue that connects them into one real-time map, layering alerts, video, sensors, and location data so your team sees the full picture and can act with context.'
		},
		{
			q: 'Can we use PlumeOS without a real-time crime center?',
			a: 'Placeholder: yes. No dedicated facility or big-city tech stack required. Any screen can serve as your command center — desktop, tablet, or mobile — so a small agency or regional task force operates from the same tools.'
		},
		{
			q: 'Is PlumeOS only for police departments?',
			a: 'Placeholder: no. PlumeOS supports a wide range of public safety and security teams — fire, EMS, private security — coordinating responses, managing events, or monitoring locations.'
		}
	];
</script>

<svelte:head>
	<title>Plume — PlumeOS</title>
	<meta
		name="description"
		content="PlumeOS, the everything-on-one-map operations platform. A satirical prototype; all copy is placeholder."
	/>
</svelte:head>

<Nav theme="light" overlay="dark" />

<!-- Canvas tone: the page's bookends are both dark (photo hero + dark
	     footer), so the canvas is abyss — same call as the homepage. -->
<main use:canvasTheme={'dark'} class="bg-paper text-forest">
	<!-- Photo hero: full-bleed placeholder frame, 85svh, 20% wash, bottom-left
	     content. The product label rides as an eyebrow; the product page
	     carries its ask here (source structure), unlike the homepage hero. -->
	<section class="relative flex min-h-[85svh] items-end overflow-hidden bg-abyss">
		<div class="hero-wash absolute inset-0"></div>
		<div class="absolute inset-0 bg-black/20"></div>
		<div class="gutter relative w-full pb-16">
			<div class="mx-auto max-w-[82rem]">
				<p class="eyebrow text-paper"><!-- COPY-PENDING -->PlumeOS</p>
				<h1
					class="mt-3 max-w-[24ch] font-display text-display leading-[1] font-light text-paper"
					use:blurWords={{ stagger: 92, immediate: true }}
				>
					<!-- COPY-PENDING -->
					One map. Already together.
				</h1>
				<p class="mt-6 max-w-[60ch] text-[1.125rem] font-light text-paper">
					<!-- COPY-PENDING -->
					Placeholder: the real-time operations platform that runs anywhere — from the command center
					to a laptop in the field.
				</p>
				<!-- The demo ask lands on the trust contact band (three-page site) -->
				<a href="/trust#contact" class="btn btn-primary mt-8"><!-- COPY-PENDING -->Book a demo</a>
			</div>
		</div>
	</section>

	<!-- The centerpiece: the one-map claim, shown — glass panel treatment on
	     the flat light run, the owner-loved map illustration inside -->
	<section class="gutter py-16 md:py-20">
		<div class="mx-auto max-w-[82rem]">
			<MapPlaceholder />
		</div>
	</section>

	<!-- Value prop: the imperative triad heading + lede (source structure) -->
	<section class="gutter py-16 md:py-20">
		<div class="mx-auto max-w-[82rem]">
			<h2
				class="max-w-[24ch] font-display text-display leading-[1] font-light"
				use:blurWords={{ stagger: 58 }}
			>
				<!-- COPY-PENDING -->
				Notice. Record. Respond.
			</h2>
			<p class="mt-4 max-w-[60ch] text-[1.125rem] text-forest/80">
				<!-- COPY-PENDING -->
				Placeholder: instant alerts, mobile access, and shared intel that help agencies collaborate across
				jurisdictions and respond faster.
			</p>
		</div>
	</section>

	<!-- Capabilities: heading, product frame, hairline checklist in two
	     columns — mono check glyphs keep the paperwork voice -->
	<section class="gutter py-16 md:py-20">
		<div class="mx-auto max-w-[82rem]">
			<h2
				class="max-w-[24ch] font-display text-display leading-[1] font-light"
				use:blurWords={{ stagger: 58 }}
			>
				<!-- COPY-PENDING -->
				Everything you need, already on the map
			</h2>
			<div class="frame mt-10 aspect-[16/9]">
				<span class="sr-only">Placeholder: PlumeOS operations surface frame</span>
			</div>
			<ul class="mt-10 grid gap-x-12 md:grid-cols-2">
				{#each capabilities as capability (capability)}
					<li
						class="flex items-center gap-3 border-t border-forest/16 py-4 text-body last:border-b md:[&:nth-last-child(2)]:border-b"
					>
						<Check class="h-4 w-4 shrink-0 text-accent" strokeWidth={2} aria-hidden="true" />
						<!-- COPY-PENDING -->
						{capability}
					</li>
				{/each}
			</ul>
		</div>
	</section>

	<!-- Testimonial: the one dark act — serif quote on the elevated tone,
	     placeholder attribution -->
	<section class="gutter bg-moss py-20 text-fog">
		<div class="mx-auto max-w-[52rem]">
			<figure>
				<blockquote>
					<p
						class="font-display text-[clamp(1.75rem,1.5rem+1vw,2.25rem)] leading-[1.15] font-light text-paper"
					>
						<!-- COPY-PENDING -->
						"Placeholder: we watched the vehicles cross three jurisdictions, and every team was working
						from the same picture before the first call ended."
					</p>
				</blockquote>
				<figcaption class="mt-6 text-body text-haze">
					<!-- COPY-PENDING -->
					Placeholder: commander, western regional agency
				</figcaption>
			</figure>
		</div>
	</section>

	<!-- FAQ: bold-question accordion, light tone, back on the flat run -->
	<section class="gutter py-16 md:py-20">
		<div class="mx-auto max-w-[52rem]">
			<h2
				class="font-display text-display-mid leading-[1] font-light"
				use:blurWords={{ stagger: 58 }}
			>
				<!-- COPY-PENDING -->
				Frequently asked questions
			</h2>
			<div class="mt-8">
				{#each faqs as faq (faq.q)}
					<FaqItem question={faq.q} tone="light">
						<p class="max-w-[60ch] text-body text-forest/80">{faq.a}</p>
					</FaqItem>
				{/each}
			</div>
		</div>
	</section>
</main>

<Footer />
