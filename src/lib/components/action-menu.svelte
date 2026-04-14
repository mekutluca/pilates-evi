<script lang="ts">
	import MoreVertical from '@lucide/svelte/icons/more-vertical';
	import { getActionDrawerContext } from '$lib/stores/action-drawer.svelte';
	import type { ActionItem } from '$lib/types';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';

	interface Props {
		actions: ActionItem[];
		trigger?: ActionItem['icon'];
		triggerClass?: string;
		onOpenDrawer?: (detail: { actions: ActionItem[] }) => void;
	}

	let { actions, trigger = MoreVertical, triggerClass, onOpenDrawer }: Props = $props();

	const drawerContext = getActionDrawerContext();

	async function handleAction(action: ActionItem) {
		try {
			await action.handler();
		} catch (error) {
			console.error('Action failed:', error);
		}
	}

	function openMobileDrawer() {
		if (onOpenDrawer) {
			onOpenDrawer({ actions });
		} else if (drawerContext) {
			drawerContext.openDrawer(actions);
		}
	}
</script>

<!-- Desktop: shadcn DropdownMenu (md and up) -->
<div class="hidden md:block">
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button variant="ghost" size="icon-sm" class={triggerClass} {...props}>
					{#if trigger}
						{@const TriggerComponent = trigger}
						<TriggerComponent size={14} />
					{/if}
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="end">
			{#each actions as action (action.label)}
				<DropdownMenu.Item onclick={() => handleAction(action)} class={action.class || ''}>
					{#if action.icon}
						{@const IconComponent = action.icon}
						<IconComponent size={14} />
					{/if}
					{action.label}
				</DropdownMenu.Item>
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
</div>

<!-- Mobile: opens the global bottom sheet via context (sm and below) -->
<div class="md:hidden">
	<Button variant="ghost" size="icon-sm" class={triggerClass} onclick={openMobileDrawer}>
		{#if trigger}
			{@const TriggerComponent = trigger}
			<TriggerComponent size={14} />
		{/if}
	</Button>
</div>
