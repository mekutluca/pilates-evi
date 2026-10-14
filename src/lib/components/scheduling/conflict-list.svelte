<script lang="ts">
	import type { ConflictListProps } from '$lib/types/ComponentProps';
	import { formatSlotLabel } from '$lib/utils/date-utils';

	let { conflicts, title, limit = 8 }: ConflictListProps = $props();

	const shown = $derived(conflicts.slice(0, limit));
</script>

<div class="rounded-xl bg-destructive/10 p-3 text-sm">
	<p class="font-medium text-destructive">{title}</p>
	<ul class="mt-1 space-y-0.5 text-muted-foreground">
		{#each shown as conflict (`${conflict.date}-${conflict.hour}`)}
			<li>
				{formatSlotLabel(conflict.date, conflict.hour)}:
				{conflict.roomConflict && conflict.trainerConflict
					? 'oda ve eğitmen dolu'
					: conflict.roomConflict
						? 'oda dolu'
						: 'eğitmen dolu'}
			</li>
		{/each}
		{#if conflicts.length > shown.length}
			<li>ve {conflicts.length - shown.length} saat daha</li>
		{/if}
	</ul>
</div>
