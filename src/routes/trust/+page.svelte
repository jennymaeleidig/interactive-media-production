<!-- SPDX-License-Identifier: CC0-1.0 -->
<!--
	Trust surface (mimics the structure of a civic-optimist vendor's trust
	hub, under the homepage baseline): hero statement + full-width photo,
	three principles, practice cards, numbered beliefs, single CTA, FAQ.
	Light theme, flat light run into the stacked darks. ALL copy placeholder
	pending the corporate-jargon-voice pass (copy-policy decision on the
	vendor-mimicry map).
-->
<script lang="ts">
	import { blurWords } from '$lib/actions/blurWords';
	import { canvasTheme } from '$lib/actions/canvasTheme';
	import Nav from '$lib/components/Nav.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import FaqItem from '$lib/components/FaqItem.svelte';
	import Fence from 'lucide-svelte/icons/fence';
	import KeyRound from 'lucide-svelte/icons/key-round';
	import FileSearch from 'lucide-svelte/icons/file-search';

	const principles = [
		{
			icon: Fence,
			title: 'Limits',
			text: 'Placeholder: the system is meant for specific public safety purposes, and nothing else.'
		},
		{
			icon: KeyRound,
			title: 'Ownership',
			text: 'Placeholder: access and permissions are set by the agencies that run it, not by us.'
		},
		{
			icon: FileSearch,
			title: 'Oversight',
			text: 'Placeholder: every search is recorded, and every record can be reviewed.'
		}
	];

	const practices = [
		{
			title: 'Data security and ethics',
			text: 'Placeholder: your local agency decides who can access data, assigns permissions by role, and every search is recorded.',
			plain: 'If someone uses the system, there is a record of it.'
		},
		{
			title: 'Rights and safeguards',
			text: 'Placeholder: the system is built to support specific, case-based investigations, not broad watching of people.',
			plain: 'It is built for cases, not for watching people.'
		},
		{
			title: 'Law enforcement access',
			text: 'Placeholder: approved users log in with role- and purpose-based access, and every search is logged.',
			plain: 'Use is visible and reviewable.'
		},
		{
			title: 'What is Plume?',
			text: 'Placeholder: how the system works, who controls it, and how privacy is protected, in one place.',
			plain: 'How the system works, who controls it, and how privacy is protected.'
		},
		{
			title: 'Compliance tools',
			text: 'Placeholder: built-in guardrails like access controls, audit logs, and data limits keep use visible and aligned with policy.',
			plain: null
		}
	];

	const beliefs = [
		'Safety, shared',
		'Privacy, kept',
		'Cases, not dragnets',
		'Bounded by principle',
		'Reviewed, always'
	];

	const faqs = [
		{
			q: 'Does Plume use facial recognition?',
			a: 'Placeholder: no. Searches are based on vehicle characteristics, not identity, and the system cannot recognize or track individuals.'
		},
		{
			q: 'Who can search the system?',
			a: 'Placeholder: access is managed by the local agency, limited to authorized users with role-based permissions, and every search is tied to a specific user. There is no open browsing.'
		},
		{
			q: 'Is data shared automatically?',
			a: 'Placeholder: no. Each agency controls its own data. Sharing is opt-in, governed by agreements, and limited to lawful investigative purposes.'
		},
		{
			q: 'Is this mass surveillance?',
			a: 'Placeholder: the system is designed for specific public safety investigations. Local agencies decide who can use it and are responsible for how it is used.'
		},
		{
			q: 'How is use of the system reviewed?',
			a: 'Placeholder: every search is recorded and tied to a specific user, and supervisors can audit those records against agency rules and the law.'
		},
		{
			q: 'Does Plume sell data to national databases?',
			a: 'Placeholder: no. Plume does not sell or hand customer data to national aggregators, and no third party has standing access to it.'
		},
		{
			q: 'Who owns the data?',
			a: 'Placeholder: the agency that collected it. Plume stores it under the agency’s policies, and retention limits are set locally, not by us.'
		}
	];
</script>

<svelte:head>
	<title>Plume — Trust</title>
	<meta
		name="description"
		content="Plume trust surface: limits, ownership, and oversight. A satirical prototype; all copy is placeholder."
	/>
</svelte:head>

<Nav theme="light" overlay="light" />

<!-- Canvas tone: the page opens on cream, so the canvas is paper (the dark
	     bookend is the shared footer). -->
<main use:canvasTheme={'light'} class="bg-paper text-forest">
	<!-- Hero statement: big serif claim + lede, then a full-width golden-hour
	     photo frame — the trust-page pattern, not the homepage's 85svh hero. -->
	<section class="gutter pt-32 pb-16 md:pt-40">
		<div class="mx-auto max-w-[82rem]">
			<h1
				class="max-w-[24ch] font-display text-[clamp(3rem,2.75rem+1.25vw,3.875rem)] leading-[1] font-light"
				use:blurWords={{ stagger: 92, immediate: true }}
			>
				<!-- COPY-PENDING -->
				Safety is a fundamental right
			</h1>
			<p class="mt-6 max-w-[60ch] text-[1.125rem] font-light text-forest/80">
				<!-- COPY-PENDING -->
				Placeholder: public safety technology affects real people and neighborhoods, so we build clear
				limits into the product, keep decisions with local agencies, and record system use so it can be
				reviewed.
			</p>
			<div class="frame mt-12 aspect-[4/3] md:aspect-[2/1]">
				<span class="sr-only">Placeholder: golden-hour neighborhood frame</span>
			</div>
		</div>
	</section>

	<!-- Principles: icon trio — Limits, Ownership, Oversight — the page's
	     thesis that trust is proven by what the system does -->
	<section class="gutter py-16 md:py-20">
		<div class="mx-auto max-w-[82rem]">
			<h2
				class="max-w-[24ch] font-display text-[clamp(3rem,2.75rem+1.25vw,3.875rem)] leading-[1] font-light"
				use:blurWords={{ stagger: 58 }}
			>
				<!-- COPY-PENDING -->
				Trust is proven by what the system does
			</h2>
			<p class="mt-4 max-w-[45ch] text-[1.125rem] text-forest/80">
				<!-- COPY-PENDING -->
				Placeholder: trust is not automatic. Access is limited, searches are tied to a reason, and use
				can be reviewed.
			</p>
			<div class="mt-12 grid gap-10 md:grid-cols-3">
				{#each principles as p (p.title)}
					<div>
						<p.icon class="h-6 w-6 text-accent" strokeWidth={1.5} aria-hidden="true" />
						<h3 class="mt-4 font-display text-[1.5rem] leading-[1.04] font-light">
							<!-- COPY-PENDING -->
							{p.title}
						</h3>
						<p class="mt-2 max-w-[35ch] text-[0.9375rem] text-forest/80">{p.text}</p>
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- Hard questions: the pivot heading into the paperwork half -->
	<section class="gutter py-16 md:py-20">
		<div class="mx-auto max-w-[82rem]">
			<h2
				class="max-w-[24ch] font-display text-[clamp(3rem,2.75rem+1.25vw,3.875rem)] leading-[1] font-light"
				use:blurWords={{ stagger: 58 }}
			>
				<!-- COPY-PENDING -->
				It's fair to ask hard questions. Here are clear answers.
			</h2>
		</div>
	</section>

	<!-- Practice: hairline link cards with the plain-terms line; hover fills
	     the whole card with the accent tint (story-card motif) -->
	<section class="gutter py-16 md:py-20">
		<div class="mx-auto max-w-[82rem]">
			<h2 class="max-w-[24ch] font-display text-[2.75rem] leading-[1] font-light">
				<!-- COPY-PENDING -->
				How we put trust into practice
			</h2>
			<p class="mt-4 max-w-[60ch] text-[0.9375rem] font-light text-forest/80">
				<!-- COPY-PENDING -->
				Placeholder: we build limits into the system, give local agencies control, and make usage reviewable.
			</p>
			<div class="mt-10 grid gap-6 md:grid-cols-2">
				{#each practices as practice (practice.title)}
					<!-- Static panel: the sub-surfaces these cards once linked to are
					     out of scope — the site is three pages, so no dead links -->
					<div class="rounded-[0.75rem] border border-forest/16 p-6">
						<h3 class="font-display text-[1.5rem] leading-[1.04] font-light">
							<!-- COPY-PENDING -->
							{practice.title}
						</h3>
						<p class="mt-3 max-w-[60ch] text-[0.9375rem] text-forest/80">{practice.text}</p>
						{#if practice.plain}
							<p class="mt-4 text-[0.9375rem] text-forest/80">
								<span class="font-medium text-forest">That means:</span>
								{practice.plain}
							</p>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	</section>

	<!-- Beliefs: numbered hairline rows — the claim side of the ledger -->
	<section class="gutter py-16 md:py-20">
		<div class="mx-auto grid max-w-[82rem] gap-10 md:grid-cols-[1fr_2fr]">
			<div>
				<p class="eyebrow"><!-- COPY-PENDING -->Our beliefs</p>
				<h2 class="mt-3 max-w-[24ch] font-display text-[2.75rem] leading-[1] font-light">
					<!-- COPY-PENDING -->
					Built in from the beginning
				</h2>
				<p class="mt-4 max-w-[45ch] text-[0.9375rem] font-light text-forest/80">
					<!-- COPY-PENDING -->
					Placeholder: public safety and individual civil liberties should go together. We build our technology
					with that balance in mind.
				</p>
			</div>
			<ul>
				{#each beliefs as belief, i (belief)}
					<li class="flex items-baseline gap-6 border-t border-forest/16 py-5 last:border-b">
						<span class="font-mono text-[0.8125rem] text-forest/60"
							>{String(i + 1).padStart(2, '0')}</span
						>
						<span class="font-display text-[1.35rem] font-light">
							<!-- COPY-PENDING -->
							{belief}
						</span>
					</li>
				{/each}
			</ul>
		</div>
	</section>

	<!-- Contact: quiet eyebrow + heading + one CTA — restraint is the boast.
	     #contact is the demo ask's destination (nav + PlumeOS hero CTA). -->
	<section id="contact" class="gutter py-16 md:py-20">
		<div class="mx-auto max-w-[82rem] text-center">
			<p class="eyebrow"><!-- COPY-PENDING -->Questions welcome</p>
			<h2
				class="mx-auto mt-3 max-w-[24ch] font-display text-[clamp(3rem,2.75rem+1.25vw,3.875rem)] leading-[1] font-light"
			>
				<!-- COPY-PENDING -->
				Have questions about how this works?
			</h2>
			<p class="mx-auto mt-4 max-w-[60ch] text-[0.9375rem] font-light text-forest/80">
				<!-- COPY-PENDING -->
				Placeholder: reach out and we'll walk through the safeguards, the controls, and what's reviewable
				together.
			</p>
			<!-- mailto: there is no contact page in the three-page site -->
			<a href="mailto:hello@plume.example" class="btn btn-primary mt-8"
				><!-- COPY-PENDING -->Contact us</a
			>
		</div>
	</section>

	<!-- FAQ: bold-question accordion, accent open-state, light tone -->
	<section class="gutter py-16 md:py-20">
		<div class="mx-auto max-w-[52rem]">
			<h2
				class="max-w-[24ch] font-display text-[2.75rem] leading-[1] font-light"
				use:blurWords={{ stagger: 58 }}
			>
				<!-- COPY-PENDING -->
				Frequently asked questions
			</h2>
			<div class="mt-8">
				{#each faqs as faq (faq.q)}
					<FaqItem question={faq.q} tone="light">
						<p class="max-w-[60ch] text-[0.9375rem] text-forest/80">{faq.a}</p>
					</FaqItem>
				{/each}
			</div>
		</div>
	</section>
</main>

<Footer />
