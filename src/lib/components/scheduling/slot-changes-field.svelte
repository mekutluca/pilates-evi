<script lang="ts">
	import type { SlotChangesFieldProps } from '$lib/types/ComponentProps';
	import { DAY_NAMES, SCHEDULE_HOURS, getTimeString } from '$lib/types/Schedule';
	import { Input } from '$lib/components/ui/input/index.js';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import PatternChip from '$lib/components/pattern-chip.svelte';
	import MoveArrow from './move-arrow.svelte';
	import { addDaysToDate, daysBetween, formatSlotLabel } from '$lib/utils/date-utils';
	import {
		MAX_SLOT_SHIFT_DAYS,
		firstSlotDate,
		shiftedSlot,
		weeklySlotKey
	} from '$lib/utils/slot-utils';

	// Each slot of a weekly program, from its first lesson after `start`: the lesson's new
	// date and hour. The date says the new weekday and which way it goes (Salı → the Monday
	// before or after); a line under it confirms the change in weekdays.
	let { from, shifts = $bindable(), start, legend, hint }: SlotChangesFieldProps = $props();

	const rows = $derived(
		from.map((slot, i) => {
			const first = firstSlotDate(slot, start);
			const shift = shifts[i];
			return {
				slot,
				first,
				date: addDaysToDate(first, shift.days),
				days: shift.days,
				to: shiftedSlot(slot, shift),
				changed: shift.days !== 0 || shift.hour !== slot.hour
			};
		})
	);
	const newProgram = $derived(rows.map((r) => r.to));

	// A picked date sets how many days the slot's lessons move; out of range (a week or more,
	// which is Hafta kaydır) it is clamped to the nearest allowed day
	function setDate(i: number, value: string) {
		if (!value) return;
		const days = daysBetween(rows[i].first, value);
		shifts[i].days = Math.max(-MAX_SLOT_SHIFT_DAYS, Math.min(MAX_SLOT_SHIFT_DAYS, days));
	}

	function direction(days: number): string {
		if (days === 0) return 'aynı gün';
		return days < 0 ? `${-days} gün önce` : `${days} gün sonra`;
	}
</script>

<fieldset class="grid gap-3">
	<legend class="mb-2 text-sm font-medium">{legend}</legend>
	{#each rows as row, i (weeklySlotKey(row.slot))}
		{@const label = formatSlotLabel(row.first, row.slot.hour)}
		<div class="grid gap-1.5">
			<div class="grid items-center gap-2 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto]">
				<span class="flex items-center gap-1.5 tabular-nums">
					{label}
					<MoveArrow label="yeni tarih ve saat" class="size-4" />
				</span>
				<div class="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:contents">
					<Input
						type="date"
						class="tabular-nums sm:w-40"
						min={addDaysToDate(row.first, -MAX_SLOT_SHIFT_DAYS)}
						max={addDaysToDate(row.first, MAX_SLOT_SHIFT_DAYS)}
						value={row.date}
						onchange={(e) => setDate(i, e.currentTarget.value)}
						aria-label={`${label} dersinin yeni tarihi`}
					/>
					<NativeSelect bind:value={shifts[i].hour} aria-label={`${label} dersinin yeni saati`}>
						{#each SCHEDULE_HOURS as hour (hour)}
							<option value={hour}>{getTimeString(hour)}</option>
						{/each}
					</NativeSelect>
				</div>
			</div>
			{#if row.changed}
				<p class="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
					Her hafta {DAY_NAMES[row.slot.day]}
					{getTimeString(row.slot.hour)}
					<MoveArrow label="yeni gün ve saat" class="size-3" />
					<span class="font-medium text-foreground">
						{DAY_NAMES[row.to.day]}
						{getTimeString(row.to.hour)}
					</span>
					{#if row.days !== 0}
						<span aria-hidden="true">·</span>
						{direction(row.days)}
					{/if}
				</p>
			{/if}
		</div>
	{/each}
	{#if rows.some((r) => r.changed)}
		<p class="flex flex-wrap items-center gap-2 text-sm">
			<span class="text-muted-foreground">Yeni program</span>
			<PatternChip slots={newProgram} />
		</p>
	{/if}
	<p class="text-xs text-muted-foreground">{hint}</p>
</fieldset>
