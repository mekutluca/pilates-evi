<script lang="ts">
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';

	// The week board while its appointments load: same card, header and grid rhythm, with
	// a few placeholder lesson blocks so the layout doesn't jump when the data lands
	const ROWS = 8;
	const BLOCKS = new Set(['1-1', '1-3', '3-0', '3-4', '5-2', '6-5']);
</script>

<div class="overflow-hidden surface" role="status" aria-label="Takvim yükleniyor">
	<div class="border-b px-4 py-3">
		<Skeleton class="h-5 w-32" />
	</div>
	<div class="overflow-hidden">
		<div class="grid min-w-[56rem] grid-cols-[4rem_repeat(7,1fr)] border-b">
			<div></div>
			{#each { length: 7 }, day (day)}
				<div class="flex flex-col items-center gap-1 py-2">
					<Skeleton class="h-3.5 w-16" />
					<Skeleton class="h-3 w-10" />
				</div>
			{/each}
		</div>
		{#each { length: ROWS }, row (row)}
			<div class="grid h-16 min-w-[56rem] grid-cols-[4rem_repeat(7,1fr)] border-b">
				<div class="px-3 py-1"><Skeleton class="h-3.5 w-10" /></div>
				{#each { length: 7 }, day (day)}
					<div class="p-0.5">
						{#if BLOCKS.has(`${row}-${day}`)}
							<Skeleton class="h-full w-full rounded-md" />
						{/if}
					</div>
				{/each}
			</div>
		{/each}
	</div>
</div>
