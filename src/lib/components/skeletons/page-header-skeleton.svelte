<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';

	interface Props {
		subtitle?: boolean;
		actions?: boolean;
	}

	let { subtitle = true, actions = false }: Props = $props();
</script>

<div class="flex items-center justify-between">
	<div class="mb-6 space-y-2">
		<Skeleton class="h-9 w-56" />
		{#if subtitle}
			<Skeleton class="h-5 w-36" />
		{/if}
	</div>
	{#if actions}
		<div class="flex gap-2">
			<Skeleton class="h-8 w-24" />
			<Skeleton class="h-8 w-9" />
		</div>
	{/if}
</div>
