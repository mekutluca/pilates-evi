<script lang="ts">
	import type { TraineeNoteProps } from '$lib/types/ComponentProps';
	import NotepadText from '@lucide/svelte/icons/notepad-text';
	import { cn } from '$lib/utils';

	// A trainee's note (health, limits) the lesson should respect: always shown in full.
	// A span, so it can sit inside a row link.
	let { note, name, class: className }: TraineeNoteProps = $props();
</script>

<span class={cn('flex gap-1.5 rounded-lg bg-muted/60 px-2.5 py-1.5 text-sm', className)}>
	<NotepadText class="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
	<span class="min-w-0 break-words whitespace-pre-line">
		<span class="sr-only">Not:</span>
		{#if name}
			<span class="font-medium">{name}:</span>
		{/if}
		{note}
	</span>
</span>
