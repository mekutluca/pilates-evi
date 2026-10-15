<script lang="ts">
	import { streamed } from '$lib/utils/streamed.svelte';
	import type { PanelLesson } from '$lib/types/Dashboard';
	import PageHeader from '$lib/components/page-header.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { CardSkeleton } from '$lib/components/skeletons/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import LoadError from '$lib/components/load-error.svelte';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import PatternChip from '$lib/components/pattern-chip.svelte';
	import LessonMeter from '$lib/components/lesson-meter.svelte';
	import { cn } from '$lib/utils';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Plus from '@lucide/svelte/icons/plus';
	import { DAYS_OF_WEEK, DAY_NAMES, getTimeString } from '$lib/types/Schedule';
	import {
		formatDateForDB,
		formatDisplayDate,
		formatShortDate,
		formatTurkishDate,
		getDayOfWeekFromDate,
		isAppointmentFuture
	} from '$lib/utils/date-utils';

	let { data } = $props();

	const today = formatDateForDB(new Date());
	// Streamed: `undefined` while loading, `null` when it failed
	const panelData = streamed(
		() => data.panel,
		() => 'panel'
	);
	const isTrainer = $derived(data.userRole === 'trainer');
	const isStaff = $derived(data.userRole === 'admin' || data.userRole === 'coordinator');

	// Only staff can open the studio calendar
	function lessonHref(lesson: PanelLesson): string | undefined {
		return !isStaff
			? undefined
			: `/schedule?view=room&room=${lesson.roomId}&week=${lesson.date}&appointment=${lesson.appointmentId}`;
	}

	function endingLabel(remaining: number, lastDate: string): string {
		return remaining === 0
			? `${formatShortDate(lastDate)} bitti`
			: `son ders ${formatShortDate(lastDate)}`;
	}
</script>

<svelte:head>
	<title>Panel · Pilates Evi</title>
</svelte:head>

{#snippet lessonList(lessons: PanelLesson[], empty: string)}
	{#if lessons.length === 0}
		<p class="text-sm text-muted-foreground">{empty}</p>
	{:else}
		{@const nextId = lessons.find((l) => isAppointmentFuture(l.date, l.hour))?.appointmentId}
		<ul class="divide-y">
			{#each lessons as lesson (lesson.appointmentId)}
				{@const href = lessonHref(lesson)}
				{@const past = !isAppointmentFuture(lesson.date, lesson.hour)}
				<li>
					<svelte:element
						this={href ? 'a' : 'div'}
						{href}
						class={cn(
							'flex gap-4 py-2.5 text-sm',
							href ? 'row-link' : '-mx-2 px-2',
							past && 'text-muted-foreground'
						)}
					>
						<span class="w-12 shrink-0 font-semibold tabular-nums"
							>{getTimeString(lesson.hour)}</span
						>
						<span class="min-w-0 flex-1">
							<span class="flex flex-wrap items-center gap-2">
								<span class="font-medium">{lesson.packageName}</span>
								{#if lesson.appointmentId === nextId}
									<Badge variant="secondary">Sıradaki</Badge>
								{/if}
							</span>
							<span class="block truncate text-muted-foreground">
								{lesson.traineeNames.length > 0
									? lesson.traineeNames.join(', ')
									: lesson.isGroup
										? 'Henüz öğrenci yok'
										: ''}
							</span>
							<span class="block truncate text-xs text-muted-foreground sm:hidden">
								{lesson.roomName} · {lesson.trainerName}
							</span>
						</span>
						<span class="hidden shrink-0 text-right text-muted-foreground sm:block">
							{lesson.roomName}
							<span class="block">{lesson.trainerName}</span>
						</span>
					</svelte:element>
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}

<div class="mx-auto w-full max-w-6xl space-y-6 p-4 lg:p-6">
	<PageHeader title="Panel" subtitle={formatTurkishDate(today)}>
		{#snippet actions()}
			{#if isTrainer}
				<Button variant="outline" href="/my-schedule">
					<Calendar />
					Takvimim
				</Button>
			{:else if isStaff}
				<Button href="/new-assignment">
					<Plus />
					Yeni kayıt
				</Button>
				<Button variant="outline" href="/schedule">
					<Calendar />
					Takvim
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	{#if panelData.current === undefined}
		<div
			class="grid gap-6 lg:grid-cols-5 lg:items-start"
			role="status"
			aria-label="Panel yükleniyor"
		>
			<CardSkeleton rows={3} rowClass="h-12" class="lg:col-span-3" />
			<CardSkeleton rows={4} rowClass="h-20" class="lg:col-span-2 lg:row-span-2" />
			<CardSkeleton rows={3} rowClass="h-10" class="lg:col-span-3" />
		</div>
	{:else}
		{@const panel = panelData.current}
		{#if !panel}
			<LoadError message="Panel yüklenemedi." />
		{:else if panel.kind === 'trainee'}
			<Empty.Root class="border">
				<Empty.Header>
					<Empty.Title>Hoş geldiniz</Empty.Title>
					<Empty.Description>
						Ders programınız ve paketiniz için stüdyonuzla iletişime geçin.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{:else if panel.kind === 'trainer'}
			<div class="grid gap-6 lg:grid-cols-2">
				<Card.Root class="h-fit">
					<Card.Header>
						<Card.Title>Bugün</Card.Title>
						<Card.Description>
							{panel.today.length} randevu · bu hafta {panel.week.length} randevu, {panel.weekTraineeCount}
							öğrenci
						</Card.Description>
					</Card.Header>
					<Card.Content>
						{@render lessonList(panel.today, 'Bugün randevunuz yok.')}
					</Card.Content>
				</Card.Root>

				<Card.Root class="h-fit">
					<Card.Header>
						<Card.Title>Bu hafta</Card.Title>
					</Card.Header>
					<Card.Content class="space-y-4">
						{#each DAYS_OF_WEEK as day (day)}
							{@const lessons = panel.week.filter(
								(l) => l.date > today && getDayOfWeekFromDate(l.date) === day
							)}
							{#if lessons.length > 0}
								<section class="grid gap-2">
									<h3 class="text-sm font-medium">
										{DAY_NAMES[day]} · {formatDisplayDate(lessons[0].date)}
									</h3>
									{@render lessonList(lessons, '')}
								</section>
							{/if}
						{/each}
						{#if !panel.week.some((l) => l.date > today)}
							<p class="text-sm text-muted-foreground">Bu hafta başka randevunuz yok.</p>
						{/if}
					</Card.Content>
				</Card.Root>
			</div>
		{:else}
			<!-- Phones read Bugün → renewals → new kayıtlar; desktop puts renewals beside both -->
			<div class="grid gap-6 lg:grid-cols-5 lg:items-start">
				<Card.Root class="h-fit lg:col-span-3">
					<Card.Header>
						<Card.Title>Bugün</Card.Title>
						<Card.Description>
							{panel.today.length} randevu · bu hafta {panel.weekLessonCount} randevu, {panel.weekTraineeCount}
							öğrenci
						</Card.Description>
					</Card.Header>
					<Card.Content>
						{@render lessonList(panel.today, 'Bugün randevu yok.')}
					</Card.Content>
				</Card.Root>
				<Card.Root class="h-fit lg:col-span-2 lg:row-span-2">
					<Card.Header>
						<Card.Title>Paketi bitmek üzere</Card.Title>
						<Card.Description>
							Son dersi 14 gün içinde olan veya geçen hafta biten, yenilenmemiş kayıtlar
						</Card.Description>
					</Card.Header>
					<Card.Content>
						{#if panel.ending.length === 0}
							<p class="text-sm text-muted-foreground">Bitmek üzere olan kayıt yok.</p>
						{:else}
							<ul class="divide-y">
								{#each panel.ending as kayit (`${kayit.traineeId}|${kayit.purchaseId}`)}
									<li class="grid gap-2 py-3 text-sm">
										<div class="flex items-center justify-between gap-3">
											<span class="min-w-0">
												<a
													href={`/trainees/${kayit.traineeId}`}
													class="font-medium hover:underline"
												>
													{kayit.traineeName}
												</a>
												<span class="block truncate text-muted-foreground">
													{kayit.packageName} · {endingLabel(kayit.remaining, kayit.lastDate)}
												</span>
											</span>
											<Button
												variant="outline"
												size="sm"
												href={`/trainees/${kayit.traineeId}/renew/${kayit.purchaseId}`}
											>
												Yenile<span class="sr-only">: {kayit.traineeName}</span>
											</Button>
										</div>
										<PatternChip slots={kayit.slots} class="w-fit" />
										<LessonMeter total={kayit.total} left={kayit.remaining} renewalDue />
									</li>
								{/each}
							</ul>
						{/if}
					</Card.Content>
				</Card.Root>
				<Card.Root class="h-fit lg:col-span-3">
					<Card.Header>
						<Card.Title>Bu hafta yeni kayıtlar</Card.Title>
						{#if panel.renewalCount > 0}
							<Card.Description>Ayrıca {panel.renewalCount} yenileme</Card.Description>
						{/if}
					</Card.Header>
					<Card.Content>
						{#if panel.newKayitlar.length === 0}
							<p class="text-sm text-muted-foreground">Bu hafta yeni kayıt yok.</p>
						{:else}
							<ul class="divide-y">
								{#each panel.newKayitlar as kayit (kayit.purchaseId)}
									<li class="flex items-start justify-between gap-3 py-2 text-sm">
										<span>
											{#each kayit.trainees as trainee, i (trainee.id)}
												{#if i > 0},
												{/if}
												<a href={`/trainees/${trainee.id}`} class="font-medium hover:underline">
													{trainee.name}
												</a>
											{/each}
											<span class="block text-muted-foreground">{kayit.packageName}</span>
										</span>
										<span class="flex shrink-0 flex-col items-end gap-1">
											<Badge variant="outline">{kayit.isGroup ? 'Grup' : 'Özel'}</Badge>
											<span class="text-xs text-muted-foreground">
												{formatDisplayDate(kayit.createdAt)}
											</span>
										</span>
									</li>
								{/each}
							</ul>
						{/if}
					</Card.Content>
				</Card.Root>
			</div>
		{/if}
	{/if}
</div>
