<script lang="ts" generics="T extends { id: string; name: string | null }">
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import { Button } from '$lib/components/ui/button/index.js';
	import { enhance } from '$app/forms';
	import { enhanceForm } from '$lib/utils/enhance';
	import { getContext } from 'svelte';
	import type { ReorderContext } from '$lib/types';
	import type { ReorderCellProps } from '$lib/types/ComponentProps';

	let { item, index }: ReorderCellProps<T> = $props();

	const ctx = getContext<ReorderContext>('reorder');
</script>

<form
	method="POST"
	action={ctx.action}
	class="flex gap-1"
	use:enhance={enhanceForm({ busy: (b) => ctx.setBusy(b) })}
>
	<input type="hidden" name="id" value={item.id} />
	<Button
		type="submit"
		name="direction"
		value="-1"
		variant="ghost"
		size="icon-sm"
		class="max-md:size-11"
		aria-label={`${item.name ?? ''} yukarı taşı`}
		disabled={ctx.busy() || index === 0}
	>
		<ArrowUp class="size-3.5" />
	</Button>
	<Button
		type="submit"
		name="direction"
		value="1"
		variant="ghost"
		size="icon-sm"
		class="max-md:size-11"
		aria-label={`${item.name ?? ''} aşağı taşı`}
		disabled={ctx.busy() || index === ctx.total() - 1}
	>
		<ArrowDown class="size-3.5" />
	</Button>
</form>
