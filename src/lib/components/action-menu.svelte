<script lang="ts">
	import type { ActionMenuProps } from '$lib/types/ComponentProps';
	import MoreVertical from '@lucide/svelte/icons/more-vertical';
	import { getActionDrawerContext } from '$lib/stores/action-drawer.svelte';
	import type { ActionItem } from '$lib/types';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { cn } from '$lib/utils';

	let {
		actions,
		trigger = MoreVertical,
		label,
		ariaLabel,
		triggerClass,
		onOpenDrawer
	}: ActionMenuProps = $props();

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
				<Button
					variant="ghost"
					size={label ? 'sm' : 'icon-sm'}
					class={triggerClass}
					aria-label={label ?? ariaLabel ?? 'İşlemler'}
					{...props}
				>
					{#if trigger}
						{@const TriggerComponent = trigger}
						<TriggerComponent size={14} />
					{/if}
					{#if label}
						<span>{label}</span>
					{/if}
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<!-- w-auto: size to the longest label, not to the narrow icon trigger -->
		<DropdownMenu.Content align="end" class="w-auto">
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
	<Button
		variant="ghost"
		size="icon-sm"
		class={cn('size-11', triggerClass)}
		aria-label={label ?? ariaLabel ?? 'İşlemler'}
		onclick={openMobileDrawer}
	>
		{#if trigger}
			{@const TriggerComponent = trigger}
			<TriggerComponent size={14} />
		{/if}
	</Button>
</div>
