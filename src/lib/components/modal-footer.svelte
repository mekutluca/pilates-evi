<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog/index.js';

	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();
</script>

<!-- Action row for a <Modal>; render as the last child, inside the form when there is one. -->
<Dialog.Footer>
	{@render children()}
</Dialog.Footer>
