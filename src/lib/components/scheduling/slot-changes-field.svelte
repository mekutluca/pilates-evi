<script lang="ts">
	import type { SlotChangesFieldProps } from '$lib/types/ComponentProps';
	import { DAYS_OF_WEEK, DAY_NAMES, SCHEDULE_HOURS, getTimeString } from '$lib/types/Schedule';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import PatternChip from '$lib/components/pattern-chip.svelte';
	import MoveArrow from './move-arrow.svelte';
	import { weeklySlotKey } from '$lib/utils/slot-utils';

	// Each slot of a weekly program with its new day and hour; once one changes, the new
	// program shows as a pattern chip
	let { from, targets = $bindable(), legend, hint }: SlotChangesFieldProps = $props();

	const changed = $derived(
		from.some((slot, i) => targets[i] && weeklySlotKey(slot) !== weeklySlotKey(targets[i]))
	);
</script>

<fieldset class="grid gap-2">
	<legend class="mb-2 text-sm font-medium">{legend}</legend>
	{#each from as slot, i (weeklySlotKey(slot))}
		{@const label = `${DAY_NAMES[slot.day]} ${getTimeString(slot.hour)}`}
		<div class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 text-sm">
			<span class="tabular-nums">
				{label}
				<MoveArrow label="yeni gün ve saat" class="ml-1 inline size-4" />
			</span>
			<NativeSelect bind:value={targets[i].day} aria-label={`${label} için yeni gün`}>
				{#each DAYS_OF_WEEK as day (day)}
					<option value={day}>{DAY_NAMES[day]}</option>
				{/each}
			</NativeSelect>
			<NativeSelect bind:value={targets[i].hour} aria-label={`${label} için yeni saat`}>
				{#each SCHEDULE_HOURS as hour (hour)}
					<option value={hour}>{getTimeString(hour)}</option>
				{/each}
			</NativeSelect>
		</div>
	{/each}
	{#if changed}
		<p class="mt-1 flex flex-wrap items-center gap-2 text-sm">
			<span class="text-muted-foreground">Yeni program</span>
			<PatternChip slots={targets} />
		</p>
	{/if}
	<p class="text-xs text-muted-foreground">{hint}</p>
</fieldset>
