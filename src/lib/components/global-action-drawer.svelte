<script lang="ts">
	import type { ActionItem } from '$lib/types';
	import * as Drawer from '$lib/components/ui/drawer/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { cn } from '$lib/utils/class-utils';

	interface Props {
		isOpen: boolean;
		actions: ActionItem[];
	}

	let { isOpen = $bindable(), actions }: Props = $props();

	async function handleAction(action: ActionItem) {
		try {
			await action.handler();
			isOpen = false;
		} catch (error) {
			console.error('Action failed:', error);
		}
	}

	function handleOpenChange(open: boolean) {
		isOpen = open;
	}
</script>

<Drawer.Root bind:open={isOpen} onOpenChange={handleOpenChange}>
	<Drawer.Content class="md:hidden">
		<Drawer.Header>
			<Drawer.Title>İşlemler</Drawer.Title>
		</Drawer.Header>
		<div class="flex max-h-96 flex-col gap-1 overflow-y-auto px-4 pb-6">
			{#each actions as action (action.label)}
				<Button
					variant="ghost"
					class={cn('w-full justify-start text-left', action.class || '')}
					onclick={() => handleAction(action)}
				>
					{#if action.icon}
						{@const IconComponent = action.icon}
						<IconComponent size={16} />
					{/if}
					{action.label}
				</Button>
			{/each}
		</div>
	</Drawer.Content>
</Drawer.Root>
