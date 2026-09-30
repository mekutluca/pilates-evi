<script lang="ts">
	import type { SearchInputProps } from '$lib/types/ComponentProps';
	import X from '@lucide/svelte/icons/x';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Button } from '$lib/components/ui/button/index.js';

	let {
		value = $bindable(''),
		placeholder = '',
		clearTitle = 'Aramayı temizle',
		classes = ''
	}: SearchInputProps = $props();

	function clear() {
		value = '';
	}
</script>

<div class="relative {classes}">
	<Input type="text" {placeholder} bind:value class="pr-8" />
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
