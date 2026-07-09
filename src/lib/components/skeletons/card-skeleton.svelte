<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { cn } from '$lib/utils';

	interface Props {
		/** Number of placeholder rows rendered when no children are provided */
		rows?: number;
		/** Classes applied to each placeholder row (e.g. to change height) */
		rowClass?: string;
		/** Render a card title placeholder */
		title?: boolean;
		class?: string;
		/** Custom skeleton content replacing the default rows */
		children?: Snippet;
	}

	let { rows = 3, rowClass, title = true, class: className, children }: Props = $props();
</script>

<Card.Root class={className}>
	{#if title}
		<Card.Header>
			<div class="flex items-center gap-2">
				<Skeleton class="size-5 rounded-full" />
				<Skeleton class="h-5 w-40" />
			</div>
		</Card.Header>
	{/if}
	<Card.Content>
		{#if children}
			{@render children()}
		{:else}
			<div class="space-y-3">
				{#each { length: rows } as _, i (i)}
					<Skeleton class={cn('h-14 w-full', rowClass)} />
				{/each}
			</div>
		{/if}
	</Card.Content>
</Card.Root>
