<!-- SPDX-License-Identifier: CC0-1.0 -->
<!--
	Phase-alpha gate: the homepage is owner-authored from here — this stub
	holds the space until real content lands. The prototype iterations live
	on ticket 08 and .scratch/ artifacts/.
-->
<script lang="ts">
	import { canvasTheme } from '$lib/actions/canvasTheme';
</script>

<svelte:head>
	<title>Plume — phase alpha</title>
</svelte:head>

<!-- Canvas tone: light gate — matches the page at both edges. -->
<main
	use:canvasTheme={'light'}
	class="flex min-h-svh flex-col items-center justify-center bg-paper px-6 text-forest"
>
	<p class="font-display text-[7rem] leading-none font-light">Plume</p>
	<p class="mt-6 max-w-[60ch] text-center text-[1.35rem] text-forest/70">
		<!-- COPY-PENDING -->
		Phase alpha. Homepage content pending.
	</p>
	<!-- Progress: the gate fronts the main site at /home. -->
	<a href="/home" class="btn btn-primary mt-8">
		<!-- COPY-PENDING -->
		Enter
	</a>
</main>
