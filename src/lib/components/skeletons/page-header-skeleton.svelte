<script lang="ts">
	import type { PageHeaderSkeletonProps } from '$lib/types/ComponentProps';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';

	// Mirrors page-header.svelte: title and subtitle on the left, actions on the right
	let { subtitle = true, actions = false }: PageHeaderSkeletonProps = $props();
</script>

<div
	class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3"
	role="status"
	aria-label="Yükleniyor"
>
	<div class="space-y-2">
		<Skeleton class="h-8 w-56" />
		{#if subtitle}
			<Skeleton class="h-4 w-36" />
		{/if}
	</div>
	{#if actions}
		<div class="flex gap-2">
			<Skeleton class="h-9 w-28 rounded-4xl" />
			<Skeleton class="h-9 w-24 rounded-4xl" />
		</div>
	{/if}
</div>
