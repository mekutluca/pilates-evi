<script lang="ts">
	import { cn, type WithElementRef } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLHeadingElement>> = $props();
</script>

<!-- Customized: a heading, so card titles show up in the page outline -->
<h2
	bind:this={ref}
	data-slot="card-title"
	class={cn('font-heading text-base font-medium', className)}
	{...restProps}
>
	{@render children?.()}
</h2>
