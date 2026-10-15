<script lang="ts">
	import type { GroupLessonDetailViewProps } from '$lib/types/ComponentProps';
	import PageHeader from '$lib/components/page-header.svelte';
	import GroupLessonMoveSheet from '$lib/components/scheduling/group-lesson-move-sheet.svelte';
	import EndGroupLessonDialog from '$lib/components/scheduling/end-group-lesson-dialog.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import MoveRight from '@lucide/svelte/icons/move-right';
	import CalendarOff from '@lucide/svelte/icons/calendar-off';
	import { invalidateAll } from '$app/navigation';
	import { formatDisplayDate, formatShortDate, formatSlotLabel } from '$lib/utils/date-utils';
	import StatStrip from '$lib/components/stat-strip.svelte';
	import { cn } from '$lib/utils';
	import { isRenewalDue } from '$lib/utils/appointment-utils';
	import CalendarClock from '@lucide/svelte/icons/calendar-clock';
	import PatternChip from '$lib/components/pattern-chip.svelte';
	import { getTimeString } from '$lib/types/Schedule';

	const INITIAL_SESSIONS = 12;

	// The loaded group lesson: header actions, stats, upcoming sessions, roster, panels
	let { lesson, rooms, trainers }: GroupLessonDetailViewProps = $props();
	const running = $derived(!lesson.endDate);
	let moveOpen = $state(false);
	let endOpen = $state(false);
	let showAllSessions = $state(false);

	const sessions = $derived(
		showAllSessions ? lesson.sessions : lesson.sessions.slice(0, INITIAL_SESSIONS)
	);
	const nextSession = $derived(lesson.sessions[0]);

	const calendarHref = (session: (typeof lesson.sessions)[number]) =>
		`/schedule?view=room&room=${session.roomId}&week=${session.date}&appointment=${session.appointmentId}`;
</script>

<div class="space-y-6">
	<PageHeader
		title={lesson.packageName}
		subtitle={`${lesson.roomName} · ${lesson.trainerName}`}
		back={{ href: '/group-lessons', label: 'Grup Dersleri' }}
	>
		<PatternChip slots={lesson.slots} class="mt-2" />
		{#snippet actions()}
			{#if running}
				<Button
					href={`/new-assignment?package_id=${lesson.packageId}&group_lesson_id=${lesson.id}`}
				>
					<UserPlus />
					Öğrenci ekle
				</Button>
				<Button variant="outline" onclick={() => (moveOpen = true)}>
					<MoveRight />
					Taşı
				</Button>
				<Button variant="destructive" onclick={() => (endOpen = true)}>
					<CalendarOff />
					Sonlandır
				</Button>
			{:else}
				<Badge variant="secondary">Sona erdi · {formatDisplayDate(lesson.endDate)}</Badge>
			{/if}
		{/snippet}
	</PageHeader>

	<StatStrip
		items={[
			{ label: 'Öğrenci', value: lesson.traineeCount, of: lesson.maxCapacity },
			{
				label: 'Sıradaki randevu',
				value: nextSession ? getTimeString(nextSession.hour) : '—',
				hint: nextSession ? formatSlotLabel(nextSession.date, nextSession.hour) : undefined
			},
			{
				label: 'Başlangıç',
				value: formatShortDate(lesson.startDate),
				hint: lesson.startDate.slice(0, 4)
			}
		]}
	/>

	<div class="grid gap-6 lg:grid-cols-5">
		<Card.Root class="lg:col-span-3">
			<Card.Header>
				<Card.Title>Yaklaşan randevular</Card.Title>
			</Card.Header>
			<Card.Content>
				{#if lesson.sessions.length === 0}
					<p class="text-sm text-muted-foreground">Yaklaşan randevu yok.</p>
				{:else}
					<ul class="divide-y">
						{#each sessions as session (session.appointmentId)}
							<li>
								<a
									href={calendarHref(session)}
									class="row-link flex items-start justify-between gap-3 py-2.5 text-sm"
								>
									<span>
										<span class="font-medium">{formatSlotLabel(session.date, session.hour)}</span>
										{#if session.offPattern}
											<Badge variant="outline" class="ml-1">Tek seferlik</Badge>
										{/if}
										{#if session.traineeNames.length > 0}
											<span class="block text-muted-foreground">
												{session.traineeNames.join(', ')}
											</span>
										{/if}
										{#if session.roomName !== lesson.roomName || session.trainerName !== lesson.trainerName}
											<span class="block text-xs text-muted-foreground">
												{session.roomName} · {session.trainerName}
											</span>
										{/if}
									</span>
									<span class="shrink-0 text-muted-foreground tabular-nums">
										{session.traineeNames.length}/{lesson.maxCapacity}
									</span>
								</a>
							</li>
						{/each}
					</ul>
					{#if lesson.sessions.length > INITIAL_SESSIONS}
						<Button
							variant="ghost"
							size="sm"
							class="mt-2"
							onclick={() => (showAllSessions = !showAllSessions)}
						>
							{showAllSessions ? 'Daha az göster' : `Tümünü göster (${lesson.sessions.length})`}
						</Button>
					{/if}
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root class="h-fit lg:col-span-2">
			<Card.Header>
				<Card.Title>Öğrenciler</Card.Title>
			</Card.Header>
			<Card.Content>
				{#if lesson.members.length === 0}
					<p class="text-sm text-muted-foreground">
						Henüz öğrenci yok{running ? '; Öğrenci ekle ile kayıt açın.' : '.'}
					</p>
				{:else}
					<ul class="divide-y">
						{#each lesson.members as member (member.traineeId)}
							{@const renewalDue = isRenewalDue(member.lastDate)}
							<li class="flex items-center justify-between gap-3 py-2 text-sm">
								<span>
									<a href={`/trainees/${member.traineeId}`} class="font-medium hover:underline">
										{member.name}
									</a>
									<span
										class={cn(
											'flex items-center gap-1',
											renewalDue ? 'font-medium text-warning-foreground' : 'text-muted-foreground'
										)}
									>
										{#if renewalDue}<CalendarClock class="size-3.5" aria-hidden="true" />{/if}
										{member.upcomingCount} ders kaldı · son {formatShortDate(member.lastDate)}
										{#if renewalDue}<span class="sr-only">, yenileme zamanı</span>{/if}
									</span>
								</span>
								<Button
									variant="outline"
									size="sm"
									href={`/trainees/${member.traineeId}/renew/${member.purchaseId}`}
								>
									Yenile<span class="sr-only">: {member.name}</span>
								</Button>
							</li>
						{/each}
					</ul>
				{/if}
			</Card.Content>
		</Card.Root>
	</div>
</div>

{#if running}
	{#key lesson}
		<GroupLessonMoveSheet bind:open={moveOpen} {lesson} {rooms} {trainers} onDone={invalidateAll} />
		<EndGroupLessonDialog bind:open={endOpen} {lesson} onDone={invalidateAll} />
	{/key}
{/if}
