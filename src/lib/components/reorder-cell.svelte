<script lang="ts" generics="T extends { id: string }">
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import ArrowDown from '@lucide/svelte/icons/arrow-down';
	import { Button } from '$lib/components/ui/button/index.js';
	import { enhance } from '$app/forms';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { getActionErrorMessage } from '$lib/utils/form-utils';
	import type { ReorderContext } from '$lib/types';

	let { item, index }: { item: T; index: number } = $props();

	const ctx = getContext<ReorderContext>('reorder');
</script>

<form
	method="POST"
	action={ctx.action}
	class="flex gap-1"
	use:enhance={() => {
		ctx.setBusy(true);
		return async ({ result, update }) => {
			ctx.setBusy(false);
			if (result.type === 'failure') {
				toast.error(getActionErrorMessage(result));
			}
			await update();
		};
	}}
>
	<input type="hidden" name="id" value={item.id} />
	<Button
		type="submit"
		name="direction"
		value="-1"
		variant="ghost"
		size="icon-sm"
		aria-label="Yukarı taşı"
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
		aria-label="Aşağı taşı"
		disabled={ctx.busy() || index === ctx.total() - 1}
	>
		<ArrowDown class="size-3.5" />
	</Button>
</form>
