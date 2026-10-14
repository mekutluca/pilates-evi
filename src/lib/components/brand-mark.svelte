<script lang="ts">
	import type { BrandMarkProps } from '$lib/types/ComponentProps';

	// The mark: a pilates ring on a Studio Orange tile (same drawing as static/favicon.svg)
	let { class: className = 'size-7' }: BrandMarkProps = $props();
</script>

<svg viewBox="0 0 32 32" class={className} aria-hidden="true">
	<rect width="32" height="32" rx="7" class="fill-primary" />
	<circle
		cx="16"
		cy="16"
		r="8.5"
		fill="none"
		class="stroke-primary-foreground"
		stroke-width="2.6"
	/>
	<rect x="4.5" y="13" width="5" height="6" rx="1.6" class="fill-primary-foreground" />
	<rect x="22.5" y="13" width="5" height="6" rx="1.6" class="fill-primary-foreground" />
</svg>
