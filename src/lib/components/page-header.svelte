<script lang="ts">
	import type { PageHeaderProps } from '$lib/types/ComponentProps';
	import BackButton from '$lib/components/back-button.svelte';

	let { title, subtitle = '', back, children }: PageHeaderProps = $props();
</script>

<div class="mb-6">
	{#if back}
		<BackButton href={back.href} label={back.label} />
	{/if}
	<h1 class="text-3xl font-bold">{title}</h1>
	{#if subtitle}
		<p class="mt-2 text-muted-foreground">{subtitle}</p>
	{/if}
	{#if children}
		{@render children()}
	{/if}
</div>
