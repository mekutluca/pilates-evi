<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';

	interface Props {
		open: boolean;
		onClose?: () => void;
		title?: string;
		size?: 'sm' | 'md' | 'lg' | 'xl';
		children: Snippet;
	}

	let { open = $bindable(), onClose = () => {}, title, size = 'md', children }: Props = $props();

	let showContent = $state(false);
	let resetTimeout: NodeJS.Timeout | null = null;
	let shouldCallOnClose = $state(false);

	const RESET_DELAY = 300;
	const sizeClasses = {
		sm: 'modal-box w-80',
		md: 'modal-box',
		lg: 'modal-box max-w-lg',
		xl: 'modal-box w-11/12 max-w-5xl'
	} as const;

	$effect(() => {
		if (open) {
			// Opening modal
			showContent = true;
			shouldCallOnClose = false;
			if (resetTimeout) {
				clearTimeout(resetTimeout);
				resetTimeout = null;
			}
		} else if (showContent) {
			// Closing modal - keep content visible during animation
			resetTimeout = setTimeout(() => {
				showContent = false;
				resetTimeout = null;
				if (shouldCallOnClose) {
					onClose();
					shouldCallOnClose = false;
				}
			}, RESET_DELAY);
		}
	});

	function handleClose() {
		if (showContent && !resetTimeout) {
			shouldCallOnClose = true;
			open = false;
		}
	}

	function handleBackdropClick(event: Event) {
		event.preventDefault();
		handleClose();
	}

	function handleDialogClose(event: Event) {
		event.preventDefault();
		if (open) {
			handleClose();
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			event.preventDefault();
			handleClose();
		}
	}

	onMount(() => {
		return () => {
			if (resetTimeout) {
				clearTimeout(resetTimeout);
			}
		};
	});
</script>

<dialog class="modal" class:modal-open={open} onclose={handleDialogClose} onkeydown={handleKeyDown}>
	<div class={sizeClasses[size]}>
		{#if title}
			<h3 class="mb-4 text-lg font-bold">{title}</h3>
		{/if}

		{#if showContent}
			{@render children()}
		{/if}
	</div>
	<button
		type="button"
		class="modal-backdrop"
		onclick={handleBackdropClick}
		aria-label="Close modal"
	></button>
</dialog>
