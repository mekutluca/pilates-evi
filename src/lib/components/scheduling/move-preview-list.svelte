<script lang="ts">
	import type { MovePreviewListProps } from '$lib/types/ComponentProps';
	import type { MovePreviewRow } from '$lib/types/Transfer';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import { formatSlotLabel } from '$lib/utils/date-utils';

	let { rows, rooms, trainers }: MovePreviewListProps = $props();

	const roomNames = $derived(new Map(rooms.map((r) => [r.id, r.name ?? '-'])));
	const trainerNames = $derived(new Map(trainers.map((t) => [t.id, t.name ?? '-'])));

	function placeLabel(row: MovePreviewRow): string | null {
		const parts: string[] = [];
		if (row.from.roomId !== row.to.roomId) {
			parts.push(
				`${roomNames.get(row.from.roomId) ?? '-'} → ${roomNames.get(row.to.roomId) ?? '-'}`
			);
		}
		if (row.from.trainerId !== row.to.trainerId) {
			parts.push(
				`${trainerNames.get(row.from.trainerId) ?? '-'} → ${trainerNames.get(row.to.trainerId) ?? '-'}`
			);
		}
		return parts.length > 0 ? parts.join(' · ') : null;
	}
</script>

<ul class="max-h-64 divide-y overflow-y-auto rounded-md border text-sm">
	{#each rows as row (row.appointmentId)}
		{@const place = placeLabel(row)}
		<li class="px-3 py-2">
			<div class="flex flex-wrap items-center gap-2">
				<span>{formatSlotLabel(row.from.date, row.from.hour)}</span>
				{#if row.from.date !== row.to.date || row.from.hour !== row.to.hour}
					<ArrowRight class="size-3.5 text-muted-foreground" />
					<span class="font-medium">{formatSlotLabel(row.to.date, row.to.hour)}</span>
				{/if}
			</div>
			{#if place}
				<div class="text-xs text-muted-foreground">{place}</div>
			{/if}
		</li>
	{/each}
</ul>
