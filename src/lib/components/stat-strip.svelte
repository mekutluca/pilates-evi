<script lang="ts">
	import type { StatStripProps } from '$lib/types/ComponentProps';

	// A row of figures in one card, split by hairlines (two columns on phones)
	let { items }: StatStripProps = $props();
</script>

<dl
	class="grid grid-cols-2 overflow-hidden surface sm:auto-cols-fr sm:grid-flow-col sm:grid-cols-none"
>
	{#each items as item (item.label)}
		<div
			class="border-foreground/10 px-5 py-4 not-first:border-s max-sm:odd:border-s-0 max-sm:last:odd:col-span-2 max-sm:nth-[n+3]:border-t"
		>
			<dt class="text-sm text-muted-foreground">{item.label}</dt>
			<dd class="mt-1 text-3xl font-semibold tabular-nums">
				{item.value}
				{#if item.of !== undefined}
					<span class="text-base font-normal text-muted-foreground">/ {item.of}</span>
				{/if}
			</dd>
			{#if item.hint}
				<p class="mt-0.5 truncate text-xs text-muted-foreground">{item.hint}</p>
			{/if}
		</div>
	{/each}
</dl>
