<script lang="ts">
	import type { PatternChipProps } from '$lib/types/ComponentProps';
	import { DAYS_OF_WEEK } from '$lib/types/Schedule';
	import { cn } from '$lib/utils';
	import { formatWeeklyPattern } from '$lib/utils/slot-utils';

	// The weekly pattern as an object: a Monday-first strip of seven cells with the
	// lesson days filled, then the pattern in words ("Sal, Per · 10:00")
	let { slots, class: className }: PatternChipProps = $props();

	const days = $derived(new Set(slots.map((s) => s.day)));
	const label = $derived(formatWeeklyPattern(slots));
</script>

<span
	class={cn(
		'inline-flex items-center gap-2 rounded-md border bg-card px-1.5 py-0.5 text-xs font-medium whitespace-nowrap',
		className
	)}
>
	<span class="flex gap-0.5" aria-hidden="true">
		{#each DAYS_OF_WEEK as day (day)}
			<span
				class={cn('h-2.5 w-1.5 rounded-[2px]', days.has(day) ? 'bg-primary' : 'bg-foreground/10')}
			></span>
		{/each}
	</span>
	<span class="tabular-nums">{label}</span>
</span>
