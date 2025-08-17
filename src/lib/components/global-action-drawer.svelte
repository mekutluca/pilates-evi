<script lang="ts">
	import X from '@lucide/svelte/icons/x';
	import type { ActionItem } from '$lib/types/ActionItem';

	interface Props {
		isOpen: boolean;
		actions: ActionItem[];
	}

	let { isOpen = $bindable(), actions }: Props = $props();

	let isClosing = $state(false);

	async function handleAction(action: ActionItem) {
		try {
			await action.handler();
			closeDrawer();
		} catch (error) {
			console.error('Action failed:', error);
			// Could implement user-facing error handling here
		}
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
			class="animate-fade-in fixed inset-0 bg-black/50"
			onclick={closeDrawer}
			onkeydown={(e) => e.key === 'Enter' && closeDrawer()}
			role="button"
			tabindex="-1"
			aria-label="Close drawer"
		></div>

		<!-- Bottom Sheet -->
		<div
			class="fixed inset-x-0 bottom-0 rounded-t-xl bg-base-100 shadow-xl"
			class:animate-slide-up={isOpen && !isClosing}
			class:animate-slide-down={isClosing}
		>
			<!-- Handle -->
			<div class="flex justify-center py-2">
				<div class="h-1 w-10 rounded-full bg-base-content/20"></div>
			</div>

			<!-- Header -->
			<div class="flex items-center justify-between px-4 pb-2">
				<h3 class="text-lg font-semibold">İşlemler</h3>
				<button class="btn btn-ghost btn-sm" onclick={closeDrawer}>
					<X size={16} />
				</button>
			</div>

			<!-- Action items -->
			<div class="max-h-96 space-y-2 overflow-y-auto pb-6">
				{#each actions as action (action.label)}
					<button
						class="btn btn-block justify-start text-left btn-ghost {action.class || ''}"
						onclick={() => handleAction(action)}
						type="button"
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
