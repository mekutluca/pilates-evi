<script lang="ts">
	import type { BrandMarkProps } from '$lib/types/ComponentProps';

	// The mark: an exercise ball resting on a mat, on a Studio Orange tile (same drawing as
	// static/favicon.svg); the ball's seam is cut in the tile colour
	let { class: className = 'size-7' }: BrandMarkProps = $props();
</script>

<svg viewBox="0 0 32 32" class={className} aria-hidden="true">
	<rect width="32" height="32" rx="7" class="fill-primary" />
	<circle cx="16" cy="14.5" r="8.5" class="fill-primary-foreground" />
	<path
		d="M8.6 11.3 C13 13.8 19 13.8 23.4 11.3"
		fill="none"
		class="stroke-primary"
		stroke-width="2"
		stroke-linecap="round"
	/>
	<path
		d="M6 25.5 H26"
		class="stroke-primary-foreground"
		stroke-width="2.4"
		stroke-linecap="round"
	/>
</svg>
