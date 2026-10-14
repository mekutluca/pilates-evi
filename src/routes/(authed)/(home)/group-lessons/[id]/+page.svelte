<script lang="ts">
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
	import { formatDisplayDate, formatSlotLabel } from '$lib/utils/date-utils';
	import { formatWeeklyPattern } from '$lib/utils/slot-utils';

	const INITIAL_SESSIONS = 12;

	let { data } = $props();

	const lesson = $derived(data.lesson);
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

<svelte:head>
	<title>{lesson.packageName} · Grup Dersleri · Pilates Evi</title>
</svelte:head>

<div class="space-y-6 p-4 md:p-6">
	<PageHeader
		title={lesson.packageName}
		subtitle={`${formatWeeklyPattern(lesson.slots)} · ${lesson.roomName} · ${lesson.trainerName}`}
		back={{ href: '/group-lessons', label: 'Grup Dersleri' }}
	>
		{#if running}
			<div class="mt-4 flex flex-wrap gap-2">
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
				<Button variant="outline" class="text-destructive" onclick={() => (endOpen = true)}>
					<CalendarOff />
					Sonlandır
				</Button>
			</div>
		{:else}
			<Badge variant="secondary" class="mt-4">Sona erdi · {formatDisplayDate(lesson.endDate)}</Badge
			>
		{/if}
	</PageHeader>

	<dl class="grid gap-4 sm:grid-cols-3">
		<div class="rounded-md border p-4">
			<dt class="text-sm text-muted-foreground">Öğrenci</dt>
			<dd class="mt-1 text-2xl font-semibold tabular-nums">
				{lesson.traineeCount}
				<span class="text-base font-normal text-muted-foreground">/ {lesson.maxCapacity}</span>
			</dd>
		</div>
		<div class="rounded-md border p-4">
			<dt class="text-sm text-muted-foreground">Sıradaki randevu</dt>
			<dd class="mt-1 font-medium">
				{nextSession ? formatSlotLabel(nextSession.date, nextSession.hour) : '—'}
			</dd>
		</div>
		<div class="rounded-md border p-4">
			<dt class="text-sm text-muted-foreground">Başlangıç</dt>
			<dd class="mt-1 font-medium">{formatDisplayDate(lesson.startDate)}</dd>
		</div>
	</dl>

	<div class="grid gap-6 lg:grid-cols-5">
		<Card.Root class="lg:col-span-3">
			<Card.Header>
				<Card.Title>Yaklaşan randevular</Card.Title>
			</Card.Header>
			<Card.Content>
				{#if lesson.sessions.length === 0}
					<p class="text-sm text-muted-foreground">Yaklaşan randevu yok.</p>
				{:else}
					<ul class="divide-y rounded-md border">
						{#each sessions as session (session.appointmentId)}
							<li>
								<a
									href={calendarHref(session)}
									class="flex items-start justify-between gap-3 px-3 py-2 text-sm hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none"
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
							<li class="flex items-center justify-between gap-3 py-2 text-sm">
								<span>
									<a href={`/trainees/${member.traineeId}`} class="font-medium hover:underline">
										{member.name}
									</a>
									<span class="block text-muted-foreground">
										{member.upcomingCount} ders kaldı · son {formatDisplayDate(member.lastDate)}
									</span>
								</span>
								<Button
									variant="outline"
									size="sm"
									href={`/trainees/${member.traineeId}/renew/${member.purchaseId}`}
								>
									Yenile
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
		<GroupLessonMoveSheet
			bind:open={moveOpen}
			{lesson}
			rooms={data.rooms}
			trainers={data.trainers}
			onDone={invalidateAll}
		/>
		<EndGroupLessonDialog bind:open={endOpen} {lesson} onDone={invalidateAll} />
	{/key}
{/if}
