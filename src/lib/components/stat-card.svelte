<script lang="ts">
	import type { ActionItem } from '$lib/types/ActionItem';

	interface Props {
		title: string;
		value: number | string;
		icon: ActionItem['icon'];
		description?: string;
	}

	let { title, value, icon, description }: Props = $props();
</script>

<div class="stat bg-base-100">
	<div class="stat-figure text-base-content/40">
		{#if icon}
			{@const Icon = icon}
			<Icon size={32} />
		{/if}
	</div>
	<div class="stat-title">{title}</div>
	<div class="stat-value">{value}</div>
	{#if description}
		<div class="stat-desc">{description}</div>
	{/if}
</div>
