<script lang="ts">
	import type { SearchInputProps } from '$lib/types/ComponentProps';
	import X from '@lucide/svelte/icons/x';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button } from '$lib/components/ui/button/index.js';

	let {
		value = $bindable(''),
		placeholder = '',
		label,
		clearTitle = 'Aramayı temizle',
		classes = ''
	}: SearchInputProps = $props();

	let input = $state<HTMLInputElement | null>(null);

	// Clearing keeps the cursor in the field, ready for the next search
	function clear() {
		value = '';
		input?.focus();
	}
</script>

<div class="relative {classes}">
	<!-- The browser's own clear button is hidden: ours below works everywhere -->
	<Input
		type="search"
		{placeholder}
		aria-label={label ?? (placeholder || 'Ara')}
		bind:value
		bind:ref={input}
		class="pr-8 [&::-webkit-search-cancel-button]:appearance-none"
	/>
	{#if value?.trim()}
		<Button
			variant="ghost"
			size="icon-xs"
			class="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
			onclick={clear}
			title={clearTitle}
			aria-label={clearTitle}
		>
			<X class="size-4" />
		</Button>
	{/if}
</div>
