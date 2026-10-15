<script lang="ts">
	import type { LessonMeterProps } from '$lib/types/ComponentProps';
	import { cn } from '$lib/utils';
	import ClockAlert from '@lucide/svelte/icons/clock-alert';

	// How far a kayıt has come: the done share fills the track in the orange ramp; once a
	// renewal is due the fill goes quiet and the amber count carries the meaning
	let { total, left, renewalDue = false, class: className }: LessonMeterProps = $props();

	const done = $derived(Math.max(total - left, 0));
	const share = $derived(total > 0 ? Math.min(done / total, 1) : 0);
</script>

<span class={cn('flex items-center gap-3', className)}>
	<span
		class="h-1.5 min-w-16 flex-1 overflow-hidden rounded-full bg-muted"
		role="meter"
		aria-valuemin={0}
		aria-valuemax={total}
		aria-valuenow={done}
		aria-label={`${total} dersin ${done} tanesi yapıldı`}
	>
		<span
			class={cn(
				'block h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none',
				renewalDue ? 'bg-foreground/25' : 'bg-chart-3'
			)}
			style:width="{share * 100}%"
		></span>
	</span>
	<!-- The icon and the hidden words carry "renewal due" without relying on the amber -->
	<span
		class={cn(
			'inline-flex shrink-0 items-center gap-1 text-xs font-semibold tabular-nums',
			renewalDue ? 'text-warning-foreground' : 'text-muted-foreground'
		)}
	>
		{#if renewalDue}<ClockAlert class="size-3.5" aria-hidden="true" />{/if}
		{left === 0 ? 'Bitti' : `${left} ders kaldı`}
		{#if renewalDue}<span class="sr-only">, yenileme zamanı</span>{/if}
	</span>
</span>
