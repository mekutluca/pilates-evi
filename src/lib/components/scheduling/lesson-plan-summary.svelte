<script lang="ts">
	import LoadError from '$lib/components/load-error.svelte';
	import type { LessonPlanSummaryProps } from '$lib/types/ComponentProps';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { formatSlotLabel, isAppointmentFuture } from '$lib/utils/date-utils';
	import History from '@lucide/svelte/icons/history';
	import ConflictList from './conflict-list.svelte';

	let { plan, idleMessage, onRetry, kayit = true }: LessonPlanSummaryProps = $props();
</script>

<div class="space-y-3 text-sm" aria-live="polite">
	{#if plan.status === 'idle'}
		<p class="text-muted-foreground">{idleMessage}</p>
	{:else if plan.status === 'loading'}
		<div class="space-y-2" role="status" aria-label="Hesaplanıyor">
			<Skeleton class="h-4 w-3/4" />
			<Skeleton class="h-4 w-1/2" />
		</div>
	{:else if plan.status === 'failed'}
		<LoadError message={plan.message} {onRetry} />
	{:else}
		{@const { sessions, conflicts, fullSessions, duplicateSessions } = plan.value}
		{@const first = sessions[0]}
		{@const last = sessions[sessions.length - 1]}
		{@const pastCount = sessions.filter((s) => !isAppointmentFuture(s.date, s.hour)).length}
		<p>
			<span class="font-medium">{sessions.length} ders</span>
			{#if first && last}
				· {formatSlotLabel(first.date, first.hour)} – {formatSlotLabel(last.date, last.hour)}
			{/if}
		</p>
		{#if pastCount > 0}
			<!-- A back-dated start: neutral, it is what the desk asked for -->
			<p class="flex gap-2">
				<History class="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
				<span>
					{#if pastCount === sessions.length}
						<span class="font-medium tabular-nums">{pastCount} dersin</span> tamamı geçmişte
						kalıyor.
						{#if kayit}Kayıt, geçmiş kayıtlar arasında görünür.{/if}
					{:else}
						Geçmişte kalan <span class="font-medium tabular-nums">{pastCount} ders</span> de
						eklenir.
						{#if kayit}
							Kayıtta <span class="font-medium tabular-nums"
								>{sessions.length - pastCount} ders</span
							>
							kalır.
						{/if}
					{/if}
				</span>
			</p>
		{/if}
		{#if conflicts.length > 0}
			<ConflictList
				{conflicts}
				title={`${conflicts.length} saatte çakışma var, saatleri değiştirin`}
			/>
		{/if}
		{#if fullSessions > 0}
			<p class="text-destructive">{fullSessions} derste yer yok. Başka saat seçin.</p>
		{/if}
		{#if duplicateSessions > 0}
			<p class="text-destructive">Öğrenci {duplicateSessions} derse zaten kayıtlı.</p>
		{/if}
	{/if}
</div>
