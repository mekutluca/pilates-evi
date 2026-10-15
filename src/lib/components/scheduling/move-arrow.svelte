<script lang="ts">
	import type { MoveArrowProps } from '$lib/types/ComponentProps';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import { cn } from '$lib/utils';

	// "from → to": screen readers hear the label instead of an arrow
	let { label = 'yeni', class: className }: MoveArrowProps = $props();
</script>

<ArrowRight class={cn('size-3.5 shrink-0 text-muted-foreground', className)} aria-hidden="true" />
<span class="sr-only">{label}:</span>
