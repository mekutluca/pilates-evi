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
		header?: Snippet;
	}

	let {
		open = $bindable(),
		onClose = () => {},
		title,
		size = 'md',
		children,
		header
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
		{#if header}
			<Dialog.Header>
				{@render header()}
			</Dialog.Header>
		{:else if title}
			<Dialog.Header>
				<Dialog.Title>{title}</Dialog.Title>
			</Dialog.Header>
		{/if}
		{@render children()}
	</Dialog.Content>
</Dialog.Root>
