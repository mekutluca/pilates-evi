<script lang="ts">
	import type { PageHeaderProps } from '$lib/types/ComponentProps';
	import BackButton from '$lib/components/back-button.svelte';

	// The house page header: title and one muted line on the left, the page's actions
	// (at most one primary) on the right; `children` adds details under the title
	let { title, subtitle = '', back, actions, children }: PageHeaderProps = $props();
</script>

<header>
	{#if back}
		<BackButton href={back.href} label={back.label} />
	{/if}
	<div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
		<div class="min-w-0">
			<h1 class="text-2xl font-bold text-balance">{title}</h1>
			{#if subtitle}
				<p class="mt-1 text-sm text-muted-foreground">{subtitle}</p>
			{/if}
			{#if children}
				{@render children()}
			{/if}
		</div>
		{#if actions}
			<div class="flex flex-wrap items-center gap-2">
				{@render actions()}
			</div>
		{/if}
	</div>
</header>
