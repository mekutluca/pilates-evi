<script lang="ts">
	import type { MovePreviewListProps } from '$lib/types/ComponentProps';
	import type { MovePreviewRow } from '$lib/types/Transfer';
	import MoveArrow from './move-arrow.svelte';
	import History from '@lucide/svelte/icons/history';
	import { formatSlotLabel, isAppointmentFuture } from '$lib/utils/date-utils';

	// The lessons a Taşı moves, old → new. Those landing in the past are corrections of
	// what happened: marked, and left out of the WhatsApp messages
	let { rows, rooms, trainers }: MovePreviewListProps = $props();

	const isPast = (row: MovePreviewRow) => !isAppointmentFuture(row.to.date, row.to.hour);
	const pastCount = $derived(rows.filter(isPast).length);

	const roomNames = $derived(new Map(rooms.map((r) => [r.id, r.name ?? '-'])));
	const trainerNames = $derived(new Map(trainers.map((t) => [t.id, t.name ?? '-'])));

	// Room and trainer changes as [from, to, what] pairs
	function placeChanges(row: MovePreviewRow): [string, string, string][] {
		const changes: [string, string, string][] = [];
		if (row.from.roomId !== row.to.roomId) {
			changes.push([
				roomNames.get(row.from.roomId) ?? '-',
				roomNames.get(row.to.roomId) ?? '-',
				'yeni oda'
			]);
		}
		if (row.from.trainerId !== row.to.trainerId) {
			changes.push([
				trainerNames.get(row.from.trainerId) ?? '-',
				trainerNames.get(row.to.trainerId) ?? '-',
				'yeni eğitmen'
			]);
		}
		return changes;
	}
</script>

<p class="text-sm text-muted-foreground tabular-nums">
	{rows.length} randevu taşınacak{pastCount > 0 ? `, ${pastCount} tanesi geçmiş bir tarihe` : ''}
</p>
<ul class="max-h-64 divide-y overflow-y-auto rounded-xl border text-sm tabular-nums">
	{#each rows as row (row.appointmentId)}
		{@const changes = placeChanges(row)}
		<li class="px-3 py-2">
			<div class="flex flex-wrap items-center gap-2">
				<span>{formatSlotLabel(row.from.date, row.from.hour)}</span>
				{#if row.from.date !== row.to.date || row.from.hour !== row.to.hour}
					<MoveArrow label="yeni saat" />
					<span class="font-medium">{formatSlotLabel(row.to.date, row.to.hour)}</span>
				{/if}
				{#if isPast(row)}
					<span class="inline-flex items-center gap-1 text-xs text-muted-foreground">
						<History class="size-3" aria-hidden="true" />
						geçmiş
					</span>
				{/if}
			</div>
			{#each changes as [from, to, what] (what)}
				<div class="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
					{from}
					<MoveArrow label={what} class="size-3" />
					{to}
				</div>
			{/each}
		</li>
	{/each}
</ul>
