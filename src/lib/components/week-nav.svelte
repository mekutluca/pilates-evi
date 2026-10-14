<script lang="ts">
	import type { WeekNavProps } from '$lib/types/ComponentProps';
	import DatePicker from '$lib/components/date-picker.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { addDays, formatWeekRange, getWeekStart } from '$lib/utils/date-utils';
	import { clickOutside } from '$lib/utils/click-outside';

	let { weekStart, onNavigate }: WeekNavProps = $props();

	let showDatePicker = $state(false);
	const isCurrentWeek = $derived(weekStart.getTime() === getWeekStart(new Date()).getTime());
</script>

<div class="flex items-center justify-center gap-2">
	<Button
		variant="outline"
		size="icon-sm"
		aria-label="Önceki hafta"
		onclick={() => onNavigate(addDays(weekStart, -7))}
	>
		<ChevronLeft />
	</Button>
	<div class="relative text-center" use:clickOutside={() => (showDatePicker = false)}>
		<button
			type="button"
			class="min-w-56 cursor-pointer text-base font-semibold hover:underline"
			onclick={() => (showDatePicker = !showDatePicker)}
		>
			{formatWeekRange(weekStart)}
		</button>
		{#if showDatePicker}
			<div class="absolute top-full left-1/2 z-50 mt-2 -translate-x-1/2">
				<DatePicker
					value={weekStart}
					onDateSelect={(date) => {
						showDatePicker = false;
						onNavigate(date);
					}}
					onClose={() => (showDatePicker = false)}
				/>
			</div>
		{/if}
	</div>
	<Button
		variant="outline"
		size="icon-sm"
		aria-label="Sonraki hafta"
		onclick={() => onNavigate(addDays(weekStart, 7))}
	>
		<ChevronRight />
	</Button>
	{#if !isCurrentWeek}
		<Button variant="ghost" size="sm" onclick={() => onNavigate(new Date())}>Bu hafta</Button>
	{/if}
</div>
