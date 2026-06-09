<script lang="ts">
	import { Calendar } from '$lib/components/ui/calendar/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { CalendarDate, type DateValue, getLocalTimeZone, today } from '@internationalized/date';

	interface Props {
		value: Date;
		onDateSelect: (date: Date) => void;
		onClose?: () => void;
		minDate?: Date;
	}

	let { value, onDateSelect, onClose, minDate }: Props = $props();

	function dateToCalendarDate(d: Date): CalendarDate {
		return new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
	}

	function calendarDateToDate(d: DateValue): Date {
		return d.toDate(getLocalTimeZone());
	}

	let calendarValue = $state<DateValue>(dateToCalendarDate(value));
	let minValue = $derived(minDate ? dateToCalendarDate(minDate) : undefined);
	let todayDisabled = $derived(!!minValue && today(getLocalTimeZone()).compare(minValue) < 0);

	$effect(() => {
		// Keep internal state in sync if parent passes a new Date
		const next = dateToCalendarDate(value);
		if (
			next.year !== calendarValue.year ||
			next.month !== calendarValue.month ||
			next.day !== calendarValue.day
		) {
			calendarValue = next;
		}
	});

	function handleValueChange(next: DateValue | undefined) {
		if (!next) return;
		calendarValue = next;
		onDateSelect(calendarDateToDate(next));
	}

	function handleTodayClick() {
		const todayDate = today(getLocalTimeZone());
		calendarValue = todayDate;
		onDateSelect(calendarDateToDate(todayDate));
	}

	function handleCancelClick() {
		onClose?.();
	}
</script>

<div class="rounded-lg border border-border bg-card p-4 shadow-lg">
	<div class="mb-3 flex items-center justify-between">
		<span class="text-sm font-medium text-muted-foreground">Tarih seçin:</span>
		<div class="flex gap-2">
			<Button variant="ghost" size="xs" onclick={handleTodayClick} disabled={todayDisabled}>
				Bugün
			</Button>
			{#if onClose}
				<Button variant="ghost" size="xs" onclick={handleCancelClick}>İptal</Button>
			{/if}
		</div>
	</div>

	<Calendar
		type="single"
		bind:value={calendarValue}
		onValueChange={handleValueChange}
		{minValue}
		locale="tr-TR"
		class="w-full"
	/>
</div>
