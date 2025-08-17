<script lang="ts">
    import MoreVertical from '@lucide/svelte/icons/more-vertical';
    import { getActionDrawerContext } from '$lib/stores/action-drawer.svelte';

    interface ActionItem {
        label: string;
        handler: () => void;
        class?: string;
        icon?: any;
    }

    interface Props {
        actions: ActionItem[];
        trigger?: any;
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

    function handleAction(action: ActionItem) {
        action.handler();
        // Close dropdown on desktop by blurring active element
        const activeElement = document?.activeElement as HTMLElement | null;
        activeElement?.blur();
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
        <ul class="dropdown-content menu rounded-box bg-base-100 z-[1] w-52 border p-2 shadow-lg">
            {#each actions as action}
                <li>
                    <button 
                        onclick={() => handleAction(action)}
                        class={action.class || ''}
                    >
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
    <button class={triggerClass} onclick={openMobileDrawer}>
        {#if trigger}
            {@const TriggerComponent = trigger}
            <TriggerComponent size={14} />
        {/if}
    </button>
</div>