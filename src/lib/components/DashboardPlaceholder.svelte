<!-- SPDX-License-Identifier: CC0-1.0 -->
<!--
	Placeholder product screenshot: dashboard geometry only (sidebar, map
	region, event list) in the design language's dark tokens. Real UI renders
	land with the imagery pass.
-->
<div class="flex h-full w-full bg-abyss" aria-hidden="true">
	<!-- sidebar -->
	<div class="flex w-1/6 flex-col gap-3 border-r border-fog/10 p-4">
		<div class="h-3 w-3/4 rounded bg-signal/60"></div>
		{#each Array(6) as _, i (i)}
			<div class="h-2 rounded bg-moss {i === 1 ? 'w-full' : 'w-5/6'}"></div>
		{/each}
	</div>

	<!-- map region -->
	<div class="relative flex-1">
		<div
			class="absolute inset-0"
			style="background:
				radial-gradient(90% 70% at 30% 20%, rgb(217 119 87 / 0.07), transparent 60%),
				repeating-linear-gradient(0deg, transparent 0 46px, rgb(42 39 34 / 0.9) 46px 48px),
				repeating-linear-gradient(90deg, transparent 0 46px, rgb(42 39 34 / 0.9) 46px 48px),
				#171512;"
		>
			<div
				class="absolute top-[30%] left-[38%] h-3 w-3 rounded-full bg-signal shadow-[0_0_12px_2px_rgba(91,214,64,0.5)]"
			></div>
			<div class="bg-lime-soft absolute top-[62%] left-[62%] h-2.5 w-2.5 rounded-full"></div>
			<div class="bg-lime-soft absolute top-[48%] left-[22%] h-2.5 w-2.5 rounded-full"></div>
		</div>
	</div>

	<!-- event list -->
	<div class="flex w-1/4 flex-col gap-3 border-l border-fog/10 p-4">
		<div class="h-3 w-1/2 rounded bg-fog/30"></div>
		{#each Array(7) as _, i (i)}
			<div class="flex items-center gap-2">
				<div class="h-2 w-2 rounded-full {i % 3 === 0 ? 'bg-signal' : 'bg-moss'}"></div>
				<div class="h-2 flex-1 rounded bg-moss"></div>
			</div>
		{/each}
	</div>
</div>
