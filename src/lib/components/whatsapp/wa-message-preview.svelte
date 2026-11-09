<script lang="ts">
	import type { WaMessagePreviewProps } from '$lib/types/ComponentProps';
	import { bodySegments } from '$lib/whatsapp/template-params';
	import { cn } from '$lib/utils';

	// The message as the trainee's phone shows it: a bubble on the chat's ground, the
	// parameters filled and marked so the admin sees what changes from student to student
	let { header, body, values, caption, class: className }: WaMessagePreviewProps = $props();

	const segments = $derived(bodySegments(body));
</script>

<figure class={cn('grid gap-2', className)}>
	{#if caption}
		<figcaption class="text-xs font-medium text-muted-foreground">{caption}</figcaption>
	{/if}
	<div class="rounded-xl bg-muted/70 p-3 sm:p-4">
		<div
			class="relative max-w-[22rem] rounded-2xl rounded-tl-sm bg-card px-3 pt-2 pb-1.5 text-sm ring-1 ring-foreground/10"
		>
			{#if header}
				<p class="mb-1 font-bold">{header}</p>
			{/if}
			<p class="leading-relaxed break-words whitespace-pre-wrap">
				{#each segments as segment, i (i)}
					{#if segment.kind === 'text'}{segment.text}{:else if values[segment.name]}<mark
							class="rounded-[4px] bg-primary/10 box-decoration-clone px-0.5 text-foreground ring-1 ring-primary/20"
							title={`{{${segment.name}}}`}>{values[segment.name]}</mark
						>{:else}<mark
							class="rounded-[4px] bg-destructive/10 px-0.5 font-mono text-xs text-destructive"
							>{`{{${segment.name}}}`}</mark
						>{/if}
				{/each}
			</p>
			<p class="mt-0.5 text-right text-xs text-muted-foreground tabular-nums" aria-hidden="true">
				13:00
			</p>
		</div>
	</div>
</figure>
