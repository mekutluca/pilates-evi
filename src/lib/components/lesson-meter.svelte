<script lang="ts">
	import type { LessonMeterProps } from '$lib/types/ComponentProps';
	import { cn } from '$lib/utils';

	// How far a kayıt has come: the done share fills the track in the orange ramp; once a
	// renewal is due the fill goes quiet and the amber count carries the meaning
	let { done, total, renewalDue = false, class: className }: LessonMeterProps = $props();

	const left = $derived(Math.max(total - done, 0));
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
	<span
		class={cn(
			'shrink-0 text-xs font-semibold tabular-nums',
			renewalDue ? 'text-warning-foreground' : 'text-muted-foreground'
		)}
	>
		{left === 0 ? 'Bitti' : `${left} ders kaldı`}
	</span>
</span>
