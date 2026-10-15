<script lang="ts">
	import type { WeeklySlotsFieldProps } from '$lib/types/ComponentProps';
	import { DAYS_OF_WEEK, DAY_NAMES, SCHEDULE_HOURS, getTimeString } from '$lib/types/Schedule';
	import { Button } from '$lib/components/ui/button/index.js';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';

	let { slots = $bindable(), legend, min = 1, max = 7 }: WeeklySlotsFieldProps = $props();

	function addSlot() {
		const used = new Set(slots.map((s) => s.day));
		const day = DAYS_OF_WEEK.find((d) => !used.has(d)) ?? 'monday';
		slots = [...slots, { day, hour: slots[0]?.hour ?? SCHEDULE_HOURS[0] }];
	}
</script>

<fieldset class="grid gap-2">
	<legend class="mb-2 text-sm font-medium">{legend}</legend>
	{#each slots as slot, i (i)}
		<div class="flex items-center gap-2">
			<NativeSelect bind:value={slot.day} aria-label={`${i + 1}. ders günü`}>
				{#each DAYS_OF_WEEK as day (day)}
					<option value={day}>{DAY_NAMES[day]}</option>
				{/each}
			</NativeSelect>
			<NativeSelect bind:value={slot.hour} aria-label={`${i + 1}. ders saati`}>
				{#each SCHEDULE_HOURS as hour (hour)}
					<option value={hour}>{getTimeString(hour)}</option>
				{/each}
			</NativeSelect>
			<Button
				variant="ghost"
				size="icon-sm"
				class="max-md:size-11"
				aria-label={`${i + 1}. ders saatini kaldır`}
				disabled={slots.length <= min}
				onclick={() => (slots = slots.filter((_, j) => j !== i))}
			>
				<X />
			</Button>
		</div>
	{/each}
	{#if slots.length < max}
		<Button variant="outline" size="sm" class="w-fit" onclick={addSlot}>
			<Plus />
			Saat ekle
		</Button>
	{/if}
</fieldset>
