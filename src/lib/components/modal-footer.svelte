<script lang="ts">
	import type { ModalFooterProps } from '$lib/types/ComponentProps';
	import * as Dialog from '$lib/components/ui/dialog/index.js';

	let { children }: ModalFooterProps = $props();
</script>

<!-- Action row for a <Modal>; render as the last child, inside the form when there is one. -->
<Dialog.Footer>
	{@render children()}
</Dialog.Footer>
