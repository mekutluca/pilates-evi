<script lang="ts">
	import type { BackButtonProps } from '$lib/types/ComponentProps';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import { Button } from '$lib/components/ui/button/index.js';

	let { href, label }: BackButtonProps = $props();
</script>

<Button variant="ghost" size="sm" {href} class="-ms-2 mb-2">
	<ChevronLeft data-icon="inline-start" />
	{label}
</Button>
