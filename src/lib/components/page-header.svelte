<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		subtitle?: string;
		children?: Snippet;
	}

	let { title, subtitle = '', children }: Props = $props();
</script>

<div class="mb-6">
	<h1 class="text-3xl font-bold">{title}</h1>
	{#if subtitle}
		<p class="mt-2 text-muted-foreground">{subtitle}</p>
	{/if}
	{#if children}
		{@render children()}
	{/if}
</div>
