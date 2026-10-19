<script lang="ts">
	import type { PastStartHintProps } from '$lib/types/ComponentProps';
	import History from '@lucide/svelte/icons/history';

	// Under a start date in the past: neutral, a back-dated start is what the desk asked for
	let { id, children }: PastStartHintProps = $props();
</script>

<p {id} class="flex items-start gap-1.5 text-xs text-muted-foreground">
	<History class="mt-px size-3.5 shrink-0" aria-hidden="true" />
	<span>{@render children()}</span>
</p>
