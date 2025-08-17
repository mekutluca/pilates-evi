<script lang="ts">
    import X from '@lucide/svelte/icons/x';

    interface ActionItem {
        label: string;
        handler: () => void;
        class?: string;
        icon?: any;
    }

    interface Props {
        isOpen: boolean;
        actions: ActionItem[];
    }

    let {
        isOpen = $bindable(),
        actions
    }: Props = $props();

    let isClosing = $state(false);

    function handleAction(action: ActionItem) {
        action.handler();
        closeDrawer();
    }

    function closeDrawer() {
        isClosing = true;
        setTimeout(() => {
            isOpen = false;
            isClosing = false;
        }, 300); // Match animation duration
    }

    // Close drawer on escape key
    function handleKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape' && isOpen) {
            closeDrawer();
        }
    }
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- Bottom Sheet Modal for Mobile -->
{#if isOpen}
    <div class="fixed inset-0 z-50 md:hidden">
        <!-- Backdrop -->
        <div 
            class="fixed inset-0 bg-black/50 animate-fade-in" 
            onclick={closeDrawer}
            role="button"
            tabindex="-1"
        ></div>
        
        <!-- Bottom Sheet -->
        <div class="fixed inset-x-0 bottom-0 bg-base-100 rounded-t-xl shadow-xl" class:animate-slide-up={isOpen && !isClosing} class:animate-slide-down={isClosing}>
            <!-- Handle -->
            <div class="flex justify-center py-2">
                <div class="w-10 h-1 bg-base-content/20 rounded-full"></div>
            </div>
            
            <!-- Header -->
            <div class="flex items-center justify-between px-4 pb-2">
                <h3 class="text-lg font-semibold">İşlemler</h3>
                <button class="btn btn-sm btn-ghost" onclick={closeDrawer}>
                    <X size={16} />
                </button>
            </div>
            
            <!-- Action items -->
            <div class="pb-6 space-y-2 max-h-96 overflow-y-auto">
                {#each actions as action}
                    <button 
                        class="btn btn-ghost btn-block justify-start text-left {action.class || ''}"
                        onclick={() => handleAction(action)}
                    >
                        {#if action.icon}
                            {@const IconComponent = action.icon}
                            <IconComponent size={16} />
                        {/if}
                        {action.label}
                    </button>
                {/each}
            </div>
            
            <!-- Safe area for iOS -->
            <div class="h-safe-bottom"></div>
        </div>
    </div>
{/if}

<style>
    @keyframes slide-up {
        from {
            transform: translateY(100%);
        }
        to {
            transform: translateY(0);
        }
    }
    
    @keyframes slide-down {
        from {
            transform: translateY(0);
        }
        to {
            transform: translateY(100%);
        }
    }
    
    @keyframes fade-in {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }
    
    .animate-slide-up {
        animation: slide-up 0.3s ease-out;
    }
    
    .animate-slide-down {
        animation: slide-down 0.3s ease-in;
    }
    
    .animate-fade-in {
        animation: fade-in 0.3s ease-out;
    }
    
    .h-safe-bottom {
        height: env(safe-area-inset-bottom);
    }
</style>