<script lang="ts">
	import '../app.css';
	import { ModeWatcher } from 'mode-watcher';
	import { Toaster } from '$lib/components/ui/sonner/index.js';

	let { children } = $props();
</script>

<svelte:head>
	<title>Pilates Evi</title>
	<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
</svelte:head>

<ModeWatcher defaultMode="system" lightClassNames={['light']} />
<Toaster richColors position="top-center" />
{@render children()}
