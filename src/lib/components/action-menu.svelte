<script lang="ts">
	import MoreVertical from '@lucide/svelte/icons/more-vertical';
	import { getActionDrawerContext } from '$lib/stores/action-drawer.svelte';
	import type { ActionItem } from '$lib/types/ActionItem';

	interface Props {
		actions: ActionItem[];
		trigger?: ActionItem['icon'];
		triggerClass?: string;
		onOpenDrawer?: (detail: { actions: ActionItem[] }) => void;
	}

	let {
		actions,
		trigger = MoreVertical,
		triggerClass = 'btn btn-sm btn-ghost',
		onOpenDrawer
	}: Props = $props();

	const drawerContext = getActionDrawerContext();

	async function handleAction(action: ActionItem) {
		try {
			await action.handler(); // No dummy ID needed with optional parameter
			// Close dropdown on desktop by blurring active element
			const activeElement = document?.activeElement as HTMLElement | null;
			activeElement?.blur();
		} catch (error) {
			console.error('Action failed:', error);
			// Could implement user-facing error handling here
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

<!-- Desktop: Dropdown (md and up) -->
<div class="hidden md:block">
	<div class="dropdown dropdown-end">
		<div tabindex="0" role="button" class={triggerClass}>
			{#if trigger}
				{@const TriggerComponent = trigger}
				<TriggerComponent size={14} />
			{/if}
		</div>
		<ul class="dropdown-content menu z-[1] w-52 rounded-box border bg-base-100 p-2 shadow-lg">
			{#each actions as action (action.label)}
				<li>
					<button onclick={() => handleAction(action)} class={action.class || ''} type="button">
						{#if action.icon}
							{@const IconComponent = action.icon}
							<IconComponent size={14} />
						{/if}
						{action.label}
					</button>
				</li>
			{/each}
		</ul>
	</div>
</div>

<!-- Mobile: Trigger button (sm and below) -->
<div class="md:hidden">
	<button class={triggerClass} onclick={openMobileDrawer} type="button">
		{#if trigger}
			{@const TriggerComponent = trigger}
			<TriggerComponent size={14} />
		{/if}
	</button>
</div>
