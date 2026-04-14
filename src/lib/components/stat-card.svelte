<script lang="ts">
	import type { ActionItem } from '$lib/types';
	import * as Card from '$lib/components/ui/card/index.js';

	interface Props {
		title: string;
		value: number | string;
		icon: ActionItem['icon'];
		description?: string;
	}

	let { title, value, icon, description }: Props = $props();
</script>

<Card.Root>
	<Card.Header class="flex flex-row items-center justify-between pb-2">
		<Card.Title class="text-sm font-medium text-muted-foreground">{title}</Card.Title>
		{#if icon}
			{@const Icon = icon}
			<Icon size={20} class="text-muted-foreground" />
		{/if}
	</Card.Header>
	<Card.Content>
		<div class="text-2xl font-bold">{value}</div>
		{#if description}
			<p class="mt-1 text-xs text-muted-foreground">{description}</p>
		{/if}
	</Card.Content>
</Card.Root>
