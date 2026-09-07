<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import AssistantWidget from '$lib/components/AssistantWidget.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<!-- Site-wide sales-assistant widget (suppresses itself on the gate page). -->
<AssistantWidget />
