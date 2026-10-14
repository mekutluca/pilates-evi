<script lang="ts">
	import type { CardSkeletonProps } from '$lib/types/ComponentProps';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { cn } from '$lib/utils';

	let {
		rows = 3,
		rowClass,
		title = true,
		class: className,
		children
	}: CardSkeletonProps = $props();
</script>

<Card.Root class={className}>
	{#if title}
		<Card.Header>
			<Skeleton class="h-5 w-40" />
			<Skeleton class="h-4 w-56" />
		</Card.Header>
	{/if}
	<Card.Content>
		{#if children}
			{@render children()}
		{:else}
			<div class="space-y-3">
				{#each { length: rows }, i (i)}
					<Skeleton class={cn('h-14 w-full', rowClass)} />
				{/each}
			</div>
		{/if}
	</Card.Content>
</Card.Root>
