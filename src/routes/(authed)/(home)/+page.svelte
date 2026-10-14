<script lang="ts">
	import type { PanelLesson } from '$lib/types/Dashboard';
	import PageHeader from '$lib/components/page-header.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import AlertCircle from '@lucide/svelte/icons/alert-circle';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Plus from '@lucide/svelte/icons/plus';
	import { DAYS_OF_WEEK, DAY_NAMES, getTimeString } from '$lib/types/Schedule';
	import {
		formatDateForDB,
		formatDisplayDate,
		formatTurkishDate,
		getDayOfWeekFromDate
	} from '$lib/utils/date-utils';

	let { data } = $props();

	const today = formatDateForDB(new Date());
	const isTrainer = $derived(data.userRole === 'trainer');

	function lessonHref(lesson: PanelLesson): string | undefined {
		return isTrainer
			? undefined
			: `/schedule?view=room&room=${lesson.roomId}&week=${lesson.date}&appointment=${lesson.appointmentId}`;
	}

	function endingLabel(remaining: number, lastDate: string): string {
		if (remaining === 0) return `Bitti · ${formatDisplayDate(lastDate)}`;
		return `${remaining} ders kaldı · son ${formatDisplayDate(lastDate)}`;
	}
</script>

<svelte:head>
	<title>Panel · Pilates Evi</title>
</svelte:head>

{#snippet stats(items: Array<{ label: string; value: number }>)}
	<dl class="grid grid-cols-2 gap-4 lg:grid-cols-4">
		{#each items as item (item.label)}
			<div class="rounded-md border p-4">
				<dt class="text-sm text-muted-foreground">{item.label}</dt>
				<dd class="mt-1 text-2xl font-semibold tabular-nums">{item.value}</dd>
			</div>
		{/each}
	</dl>
{/snippet}

{#snippet lessonList(lessons: PanelLesson[], empty: string)}
	{#if lessons.length === 0}
		<p class="text-sm text-muted-foreground">{empty}</p>
	{:else}
		<ul class="divide-y rounded-md border">
			{#each lessons as lesson (lesson.appointmentId)}
				{@const href = lessonHref(lesson)}
				<li>
					<svelte:element
						this={href ? 'a' : 'div'}
						{href}
						class="flex gap-4 px-3 py-2 text-sm {href
							? 'hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none'
							: ''}"
					>
						<span class="w-12 shrink-0 font-medium tabular-nums">{getTimeString(lesson.hour)}</span>
						<span class="min-w-0 flex-1">
							<span class="font-medium">{lesson.packageName}</span>
							<span class="block text-muted-foreground">
								{lesson.roomName} · {lesson.trainerName}
							</span>
							<span class="block truncate text-muted-foreground">
								{lesson.traineeNames.length > 0
									? lesson.traineeNames.join(', ')
									: lesson.isGroup
										? 'Henüz öğrenci yok'
										: ''}
							</span>
						</span>
					</svelte:element>
				</li>
			{/each}
		</ul>
	{/if}
{/snippet}

<div class="space-y-6 p-4 md:p-6">
	<PageHeader title="Panel" subtitle={formatTurkishDate(today)}>
		<div class="mt-4 flex flex-wrap gap-2">
			{#if isTrainer}
				<Button variant="outline" href="/my-schedule">
					<Calendar />
					Takvimim
				</Button>
			{:else}
				<Button href="/new-assignment">
					<Plus />
					Yeni kayıt
				</Button>
				<Button variant="outline" href="/schedule">
					<Calendar />
					Takvim
				</Button>
			{/if}
		</div>
	</PageHeader>

	{#await data.panel}
		<div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
			{#each { length: 4 }, i (i)}
				<Skeleton class="h-22 rounded-md" />
			{/each}
		</div>
		<div class="grid gap-6 lg:grid-cols-5">
			<Skeleton class="h-80 rounded-xl lg:col-span-3" />
			<Skeleton class="h-80 rounded-xl lg:col-span-2" />
		</div>
	{:then panel}
		{#if !panel}
			<Alert.Root variant="destructive">
				<AlertCircle />
				<Alert.Description>Panel yüklenemedi. Sayfayı yenileyip tekrar deneyin.</Alert.Description>
			</Alert.Root>
		{:else if panel.kind === 'trainer'}
			{@render stats([
				{ label: 'Bugün', value: panel.today.length },
				{ label: 'Bu hafta', value: panel.week.length },
				{ label: 'Öğrenci (bu hafta)', value: panel.weekTraineeCount }
			])}

			<div class="grid gap-6 lg:grid-cols-2">
				<Card.Root class="h-fit">
					<Card.Header>
						<Card.Title>Bugün</Card.Title>
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
			{@render stats([
				{ label: 'Bugün', value: panel.today.length },
				{ label: 'Bu hafta', value: panel.weekLessonCount },
				{ label: 'Öğrenci (bu hafta)', value: panel.weekTraineeCount },
				{ label: 'Bitmek üzere', value: panel.ending.length }
			])}

			<div class="grid gap-6 lg:grid-cols-5">
				<Card.Root class="h-fit lg:col-span-3">
					<Card.Header>
						<Card.Title>Bugün</Card.Title>
					</Card.Header>
					<Card.Content>
						{@render lessonList(panel.today, 'Bugün randevu yok.')}
					</Card.Content>
				</Card.Root>

				<div class="space-y-6 lg:col-span-2">
					<Card.Root>
						<Card.Header>
							<Card.Title>Paketi bitmek üzere</Card.Title>
							<Card.Description>
								Son dersi önümüzdeki 14 gün içinde olan veya geçen hafta biten, yenilenmemiş
								kayıtlar
							</Card.Description>
						</Card.Header>
						<Card.Content>
							{#if panel.ending.length === 0}
								<p class="text-sm text-muted-foreground">Bitmek üzere olan kayıt yok.</p>
							{:else}
								<ul class="divide-y">
									{#each panel.ending as kayit (`${kayit.traineeId}|${kayit.purchaseId}`)}
										<li class="flex items-center justify-between gap-3 py-2 text-sm">
											<span class="min-w-0">
												<a
													href={`/trainees/${kayit.traineeId}`}
													class="font-medium hover:underline"
												>
													{kayit.traineeName}
												</a>
												<span class="block text-muted-foreground">
													{kayit.packageName} · {endingLabel(kayit.remaining, kayit.lastDate)}
												</span>
											</span>
											<Button
												variant="outline"
												size="sm"
												href={`/trainees/${kayit.traineeId}/renew/${kayit.purchaseId}`}
											>
												Yenile
											</Button>
										</li>
									{/each}
								</ul>
							{/if}
						</Card.Content>
					</Card.Root>

					<Card.Root>
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
			</div>
		{/if}
	{/await}
</div>
