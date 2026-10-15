<script lang="ts">
	import type { LoadErrorProps } from '$lib/types/ComponentProps';
	import { Button } from '$lib/components/ui/button/index.js';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import RotateCw from '@lucide/svelte/icons/rotate-cw';
	import { invalidateAll } from '$app/navigation';

	// A block that failed to load: a red-tinted strip with a retry in place
	let { message, onRetry }: LoadErrorProps = $props();
	let retrying = $state(false);

	// Reloads the page's data unless the caller retries something narrower (a preview)
	async function retry() {
		if (onRetry) {
			onRetry();
			return;
		}
		retrying = true;
		await invalidateAll();
		retrying = false;
	}
</script>

<div
	class="flex flex-wrap items-center gap-3 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive"
	role="alert"
>
	<TriangleAlert class="size-4 shrink-0" />
	<span class="flex-1">{message}</span>
	<Button variant="outline" size="sm" onclick={retry} disabled={retrying}>
		<RotateCw class={retrying ? 'animate-spin' : ''} />
		Tekrar dene
	</Button>
</div>
