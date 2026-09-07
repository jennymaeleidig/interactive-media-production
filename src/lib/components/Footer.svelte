<!-- SPDX-License-Identifier: CC0-1.0 -->
<script lang="ts">
	// Footer per the stacked-darks pattern: link groups on the darkest tone,
	// legal strip a third tone below. Link graph is closed — groups carry
	// only the built pages (/products/plume-os, /trust); the legal strip is
	// copyright + satire notice only.
	const groups: { title: string; links: { label: string; href: string }[] }[] = [
		{ title: 'Platform', links: [{ label: 'PlumeOS', href: '/products/plume-os' }] },
		{ title: 'Company', links: [{ label: 'Trust', href: '/trust' }] }
	];
</script>

<footer class="text-fog">
	<div class="gutter bg-deep">
		<div class="mx-auto max-w-[82rem] border-b border-fog/10 py-16">
			<div class="grid gap-12 md:grid-cols-[1fr_repeat(2,auto)]">
				<div>
					<p class="font-display text-[2rem] leading-none text-paper">Plume</p>
					<!-- COPY-PENDING -->
					<p class="mt-4 max-w-[28ch] text-[1.05rem] text-haze">Everything, already together.</p>
				</div>
				{#each groups as group (group.title)}
					<nav aria-label={group.title}>
						<h2 class="eyebrow mb-4 text-haze">{group.title}</h2>
						<ul class="space-y-2">
							{#each group.links as link (link.label)}
								<li>
									<a href={link.href} class="text-[1.05rem] text-fog hover:text-paper"
										>{link.label}</a
									>
								</li>
							{/each}
						</ul>
					</nav>
				{/each}
			</div>
		</div>
	</div>
	<div class="gutter bg-pine">
		<div class="mx-auto max-w-[82rem] py-6 text-[0.84rem] text-haze">
			<p>© 2026 Plume. A work of satire.</p>
		</div>
	</div>
</footer>
