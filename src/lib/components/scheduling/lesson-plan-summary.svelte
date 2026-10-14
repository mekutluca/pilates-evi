<script lang="ts">
	import type { LessonPlanSummaryProps } from '$lib/types/ComponentProps';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { formatSlotLabel } from '$lib/utils/date-utils';
	import ConflictList from './conflict-list.svelte';

	let { plan, idleMessage }: LessonPlanSummaryProps = $props();
</script>

<div class="space-y-3 text-sm" aria-live="polite">
	{#if plan.status === 'idle'}
		<p class="text-muted-foreground">{idleMessage}</p>
	{:else if plan.status === 'loading'}
		<p class="flex items-center gap-2 text-muted-foreground">
			<LoaderCircle class="size-4 animate-spin" />
			Hesaplanıyor…
		</p>
	{:else if plan.status === 'failed'}
		<p class="text-destructive">{plan.message}</p>
	{:else}
		{@const { sessions, conflicts, fullSessions, duplicateSessions } = plan.value}
		{@const first = sessions[0]}
		{@const last = sessions[sessions.length - 1]}
		<p>
			<span class="font-medium">{sessions.length} ders</span>
			{#if first && last}
				· {formatSlotLabel(first.date, first.hour)} → {formatSlotLabel(last.date, last.hour)}
			{/if}
		</p>
		{#if conflicts.length > 0}
			<ConflictList
				{conflicts}
				title={`${conflicts.length} saatte çakışma var; saatleri değiştirin`}
			/>
		{/if}
		{#if fullSessions > 0}
			<p class="text-destructive">{fullSessions} derste yer yok; başka saat seçin.</p>
		{/if}
		{#if duplicateSessions > 0}
			<p class="text-destructive">Öğrenci {duplicateSessions} derse zaten kayıtlı.</p>
		{/if}
	{/if}
</div>
