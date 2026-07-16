<script lang="ts">
	import '../app.css';
	import { Toaster } from 'svelte-sonner';

	let { children } = $props();
</script>

<svelte:head>
	<title>Pilates Evi</title>
</svelte:head>

<Toaster richColors position="bottom-center" />
{@render children()}
