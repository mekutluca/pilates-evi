<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';
	import { cn } from '$lib/utils/class-utils';

	interface Props {
		open: boolean;
		onClose?: () => void;
		title?: string;
		size?: 'sm' | 'md' | 'lg' | 'xl';
		children: Snippet;
		/** Actions rendered next to the title; kept clear of the close button. */
		headerActions?: Snippet;
	}

	let {
		open = $bindable(),
		onClose = () => {},
		title,
		size = 'md',
		children,
		headerActions
	}: Props = $props();

	const sizeClasses = {
		sm: 'max-w-sm',
		md: 'max-w-md',
		lg: 'max-w-lg',
		xl: 'max-w-5xl w-11/12'
	} as const;

	function handleOpenChange(isOpen: boolean) {
		if (!isOpen) {
			open = false;
			onClose();
		}
	}
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
	<Dialog.Content class={cn(sizeClasses[size])}>
		{#if title || headerActions}
			<Dialog.Header>
				<!-- pr-8 reserves space for the absolutely positioned close button -->
				<div class="flex items-center justify-between gap-2 pr-8">
					{#if title}
						<Dialog.Title>{title}</Dialog.Title>
					{/if}
					{#if headerActions}
						<div class="flex shrink-0 items-center gap-2">
							{@render headerActions()}
						</div>
					{/if}
				</div>
			</Dialog.Header>
		{/if}
		{@render children()}
	</Dialog.Content>
</Dialog.Root>
