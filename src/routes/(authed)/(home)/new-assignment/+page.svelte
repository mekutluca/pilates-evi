<script lang="ts">
	import type {
		AvailabilityPayload,
		GroupTimeslotsPayload,
		LessonPlanPreviewPayload
	} from '$lib/types/Api';
	import type { AvailableGroupTimeslot, SelectedGroupTimeslot, TraineeOption } from '$lib/types';
	import type { DayOfWeek, ScheduleSlot, WeeklySlot } from '$lib/types/Schedule';
	import type { AssignmentStep } from '$lib/types/Assignment';
	import { DAYS_OF_WEEK, DAY_NAMES, getTimeString } from '$lib/types/Schedule';
	import PageHeader from '$lib/components/page-header.svelte';
	import Schedule from '$lib/components/schedule.svelte';
	import TraineePicker from '$lib/components/assignment/trainee-picker.svelte';
	import LessonPlanSummary from '$lib/components/scheduling/lesson-plan-summary.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Check from '@lucide/svelte/icons/check';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import { cn } from '$lib/utils';
	import {
		formatDateForDB,
		getDayOfWeekFromDate,
		getWeekStart,
		parseLocalDate
	} from '$lib/utils/date-utils';
	import {
		formatWeeklyPattern,
		groupSlotKey,
		sortTimeSlots,
		weeklySlotKey
	} from '$lib/utils/slot-utils';
	import { actionResultMessage, canConfirmPlan, postAction } from '$lib/utils/api-client';
	import { actionResource } from '$lib/utils/action-resource.svelte';

	const STEPS: Array<{ id: AssignmentStep; label: string }> = [
		{ id: 'trainee', label: 'Öğrenci' },
		{ id: 'package', label: 'Paket' },
		{ id: 'slots', label: 'Saatler' },
		{ id: 'summary', label: 'Özet' }
	];

	let { data } = $props();
	const prefill = untrack(() => data.prefill);

	// Wizard state, seeded from the page that opened it
	let step = $state<AssignmentStep>(
		prefill.traineeId ? (prefill.packageId ? 'slots' : 'package') : 'trainee'
	);
	let traineeIds = $state<string[]>(prefill.traineeId ? [prefill.traineeId] : []);
	let createdTrainees = $state<TraineeOption[]>([]);
	let packageId = $state(prefill.packageId);
	let periods = $state(1);
	let weeks = $state(
		untrack(() => data.packages.find((p) => p.id === prefill.packageId)?.weeks_duration ?? 4)
	);
	let roomId = $state(untrack(() => prefill.roomId || data.rooms[0]?.id || ''));
	let trainerId = $state(untrack(() => prefill.trainerId || data.trainers[0]?.id || ''));
	let startDate = $state(prefill.startDate);
	let timeSlots = $state<WeeklySlot[]>(
		prefill.hour !== null
			? [{ day: getDayOfWeekFromDate(prefill.startDate), hour: prefill.hour }]
			: []
	);
	let groupSlots = $state<SelectedGroupTimeslot[]>([]);
	// Opened from a group lesson: only its slots, until "show all"
	let groupLessonFilter = $state(prefill.groupLessonId);
	let trainerFilter = $state('');

	let submitting = $state(false);

	const today = formatDateForDB(new Date());
	const trainees = $derived<TraineeOption[]>([...createdTrainees, ...data.trainees]);
	const traineeNames = $derived(
		traineeIds.map((id) => trainees.find((t) => t.id === id)?.name ?? '-')
	);
	const pkg = $derived(data.packages.find((p) => p.id === packageId));
	const isGroup = $derived(pkg?.package_type === 'group');
	const privatePackages = $derived(data.packages.filter((p) => p.package_type === 'private'));
	const groupPackages = $derived(data.packages.filter((p) => p.package_type === 'group'));
	const totalWeeks = $derived(pkg ? (isGroup ? weeks : (pkg.weeks_duration ?? 1) * periods) : 0);
	const roomName = $derived(data.rooms.find((r) => r.id === roomId)?.name ?? '-');
	const trainerName = $derived(data.trainers.find((t) => t.id === trainerId)?.name ?? '-');

	const dayName = (day: string) => DAY_NAMES[DAYS_OF_WEEK.find((d) => d === day) ?? 'monday'];

	function perWeekLabel(min: number, max: number): string {
		return min === max ? `haftada ${min} ders` : `haftada ${min}–${max} ders`;
	}

	// ---- Paket ----

	function selectPackage(id: string) {
		if (id === packageId) return;
		packageId = id;
		const next = data.packages.find((p) => p.id === id);
		weeks = next?.weeks_duration ?? 4;
		groupSlots = [];
		groupLessonFilter = '';
		if (next) timeSlots = timeSlots.slice(0, next.max_lessons_per_week);
	}

	// ---- Saatler (private) ----

	// Room/trainer bookings over the kayıt's weeks, refreshed when they change
	const busy = actionResource<AvailabilityPayload>(
		'availability',
		() => {
			if (step !== 'slots' || isGroup || !pkg || !roomId || !trainerId || !startDate) return null;
			const fd = new FormData();
			fd.set('roomId', roomId);
			fd.set('trainerId', trainerId);
			fd.set('startDate', startDate);
			fd.set('weeks', String(totalWeeks));
			return fd;
		},
		200
	);
	const busyByKey = $derived(
		new Map(
			busy.current.status === 'ready'
				? busy.current.value.busy.map((b) => [weeklySlotKey(b), b])
				: []
		)
	);

	function toggleSlot(day: DayOfWeek, hour: number) {
		if (!pkg) return;
		const key = weeklySlotKey({ day, hour });
		if (timeSlots.some((s) => weeklySlotKey(s) === key)) {
			timeSlots = timeSlots.filter((s) => weeklySlotKey(s) !== key);
		} else {
			// At the package's maximum the oldest pick makes room
			const kept = timeSlots.length >= pkg.max_lessons_per_week ? timeSlots.slice(1) : timeSlots;
			timeSlots = [...kept, { day, hour }];
		}
	}

	function getSlotData(day: DayOfWeek, hour: number, date: string): ScheduleSlot {
		const selected = timeSlots.some((s) => s.day === day && s.hour === hour);
		const taken = busyByKey.get(weeklySlotKey({ day, hour }));
		if (taken && !selected) {
			return {
				variant: 'appointment',
				day,
				hour,
				date,
				title: taken.first ? 'Dolu' : `${taken.count} haftada dolu`,
				color: 'destructive',
				dimmed: !taken.first,
				clickable: false
			};
		}
		return {
			variant: 'available',
			day,
			hour,
			date,
			label: selected ? (taken ? 'Seçili · dolu' : 'Seçili') : undefined,
			hoverLabel: 'Seç',
			color: selected ? (taken ? 'destructive' : 'primary') : undefined,
			clickable: true
		};
	}

	function handleSlotClick(slot: ScheduleSlot) {
		if (slot.variant === 'available') toggleSlot(slot.day, slot.hour);
	}

	// ---- Saatler (group) ----

	// The package's running group time slots
	const groupTimeslots = actionResource<GroupTimeslotsPayload>(
		'groupTimeslots',
		() => {
			if (!isGroup || !packageId) return null;
			const fd = new FormData();
			fd.set('packageId', packageId);
			return fd;
		},
		0
	);

	const allGroupTimeslots = $derived(
		groupTimeslots.current.status === 'ready' ? groupTimeslots.current.value.timeslots : []
	);
	const groupTrainers = $derived(
		[...new Map(allGroupTimeslots.map((t) => [t.trainer_id, t.trainer_name])).entries()].sort(
			(a, b) => a[1].localeCompare(b[1], 'tr')
		)
	);
	const shownGroupTimeslots = $derived(
		allGroupTimeslots.filter(
			(t) =>
				(!groupLessonFilter || t.group_lesson_id === groupLessonFilter) &&
				(!trainerFilter || t.trainer_id === trainerFilter)
		)
	);
	const groupTimeslotsByDay = $derived(
		DAYS_OF_WEEK.map((day) => ({
			day,
			slots: shownGroupTimeslots.filter((t) => t.day === day).sort((a, b) => a.hour - b.hour)
		})).filter((d) => d.slots.length > 0)
	);
	const selectedGroupKeys = $derived(new Set(groupSlots.map(groupSlotKey)));

	function toggleGroupSlot(timeslot: AvailableGroupTimeslot) {
		if (!pkg) return;
		const selection = {
			group_lesson_id: timeslot.group_lesson_id,
			day: timeslot.day,
			hour: timeslot.hour
		};
		if (selectedGroupKeys.has(groupSlotKey(selection))) {
			groupSlots = groupSlots.filter((s) => groupSlotKey(s) !== groupSlotKey(selection));
		} else if (groupSlots.length < pkg.max_lessons_per_week) {
			groupSlots = [...groupSlots, selection];
		} else {
			toast.warning(`Bu pakette en fazla ${pkg.max_lessons_per_week} saat seçilebilir`);
		}
	}

	const groupSlotLabels = $derived(
		groupSlots
			.map((s) => allGroupTimeslots.find((t) => groupSlotKey(t) === groupSlotKey(s)))
			.filter((t) => t !== undefined)
			.sort(
				(a, b) =>
					DAYS_OF_WEEK.findIndex((d) => d === a.day) - DAYS_OF_WEEK.findIndex((d) => d === b.day) ||
					a.hour - b.hour
			)
			.map((t) => `${dayName(t.day)} ${getTimeString(t.hour)} · ${t.trainer_name}`)
	);

	// ---- Özet ----

	function assignmentForm(): FormData {
		const fd = new FormData();
		fd.set('packageId', packageId);
		fd.set('traineeIds', traineeIds.join(','));
		fd.set('startDate', startDate);
		if (isGroup) {
			fd.set('kind', 'group');
			fd.set('groupSlots', groupSlots.map(groupSlotKey).join(','));
			fd.set('weeks', String(weeks));
		} else {
			fd.set('kind', 'private');
			fd.set('timeSlots', timeSlots.map(weeklySlotKey).join(','));
			fd.set('roomId', roomId);
			fd.set('trainerId', trainerId);
			fd.set('periods', String(periods));
		}
		return fd;
	}

	const preview = actionResource<LessonPlanPreviewPayload>(
		'preview',
		() => (step === 'summary' ? assignmentForm() : null),
		0
	);
	const canCreate = $derived(canConfirmPlan(preview.current));

	async function submit() {
		if (!canCreate || submitting) return;
		submitting = true;
		const result = await postAction('create', assignmentForm());
		submitting = false;
		if (result.type === 'success') {
			toast.success(result.data?.message ?? 'Kayıt oluşturuldu');
			goto(result.data?.redirectTo ?? '/schedule');
		} else {
			toast.error(actionResultMessage(result));
		}
	}

	// ---- Navigation ----

	const stepIndex = $derived(STEPS.findIndex((s) => s.id === step));

	// Why the current step can't be left yet (null = it can)
	const blocker = $derived.by((): string | null => {
		switch (step) {
			case 'trainee':
				return traineeIds.length === 0 ? 'En az bir öğrenci seçin.' : null;
			case 'package':
				if (!pkg) return 'Bir paket seçin.';
				if (!isGroup && traineeIds.length > pkg.max_capacity) {
					return `Bu pakette en fazla ${pkg.max_capacity} öğrenci olabilir.`;
				}
				if (!isGroup && (!Number.isInteger(periods) || periods < 1 || periods > 12)) {
					return 'Dönem sayısı 1 ile 12 arasında olmalı.';
				}
				if (isGroup && (!Number.isInteger(weeks) || weeks < 1 || weeks > 26)) {
					return 'Hafta sayısı 1 ile 26 arasında olmalı.';
				}
				return null;
			case 'slots': {
				if (!pkg) return 'Bir paket seçin.';
				if (!startDate || startDate < today) return 'Başlangıç bugün veya sonrası olmalı.';
				const count = isGroup ? groupSlots.length : timeSlots.length;
				if (count < pkg.min_lessons_per_week || count > pkg.max_lessons_per_week) {
					return `${perWeekLabel(pkg.min_lessons_per_week, pkg.max_lessons_per_week)} seçin (${count} seçili).`;
				}
				if (!isGroup && timeSlots.some((s) => busyByKey.has(weeklySlotKey(s)))) {
					return 'Seçilen saatlerden biri bazı haftalarda dolu.';
				}
				return null;
			}
			case 'summary':
				return null;
		}
	});

	function next() {
		if (blocker || stepIndex >= STEPS.length - 1) return;
		step = STEPS[stepIndex + 1].id;
	}

	function back() {
		if (stepIndex > 0) step = STEPS[stepIndex - 1].id;
	}
</script>

<svelte:head>
	<title>Yeni kayıt · Pilates Evi</title>
</svelte:head>

<div class="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
	<PageHeader title="Yeni kayıt" back={{ href: '/trainees', label: 'Öğrenciler' }} />

	<ol class="flex flex-wrap items-center gap-2 text-sm" aria-label="Adımlar">
		{#each STEPS as s, i (s.id)}
			{@const done = i < stepIndex}
			<li class="flex items-center gap-2">
				<button
					type="button"
					disabled={!done}
					aria-current={s.id === step ? 'step' : undefined}
					class={cn(
						'flex items-center gap-2 rounded-full border px-3 py-1',
						s.id === step && 'border-primary bg-primary text-primary-foreground',
						done && 'hover:bg-muted',
						!done && s.id !== step && 'text-muted-foreground'
					)}
					onclick={() => (step = s.id)}
				>
					{#if done}
						<Check class="size-3.5" />
					{:else}
						<span class="tabular-nums">{i + 1}</span>
					{/if}
					{s.label}
				</button>
				{#if i < STEPS.length - 1}
					<span class="h-px w-4 bg-border" aria-hidden="true"></span>
				{/if}
			</li>
		{/each}
	</ol>

	<Card.Root>
		<Card.Content class="space-y-6">
			{#if step === 'trainee'}
				<div>
					<h2 class="text-lg font-semibold">Kimin için?</h2>
					<p class="text-sm text-muted-foreground">
						Birden fazla öğrenci seçerseniz özel derste aynı derslere katılırlar; grup dersinde her
						biri kendi kaydını alır.
					</p>
				</div>
				<TraineePicker
					{trainees}
					bind:selected={traineeIds}
					onCreated={(t) => (createdTrainees = [t, ...createdTrainees])}
				/>
			{:else if step === 'package'}
				<div>
					<h2 class="text-lg font-semibold">Paket</h2>
					<p class="text-sm text-muted-foreground">{traineeNames.join(', ')}</p>
				</div>

				{#if data.packages.length === 0}
					<p class="text-sm text-muted-foreground">
						Aktif paket yok.
						{#if data.userRole === 'admin'}
							<a href="/packages" class="underline">Paketler</a> sayfasından ekleyin.
						{:else}
							Yöneticinizden paket eklemesini isteyin.
						{/if}
					</p>
				{/if}

				{#each [{ title: 'Özel ders', list: privatePackages }, { title: 'Grup dersi', list: groupPackages }] as section (section.title)}
					{#if section.list.length > 0}
						<fieldset class="grid gap-2">
							<legend class="mb-2 text-sm font-medium text-muted-foreground">
								{section.title}
							</legend>
							<div class="grid gap-2 sm:grid-cols-2">
								{#each section.list as p (p.id)}
									{@const tooSmall =
										p.package_type === 'private' && traineeIds.length > p.max_capacity}
									<button
										type="button"
										role="radio"
										aria-checked={packageId === p.id}
										disabled={tooSmall}
										class={cn(
											'rounded-md border p-3 text-left text-sm transition-colors',
											'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
											packageId === p.id
												? 'border-primary ring-1 ring-primary'
												: 'hover:bg-muted/50',
											tooSmall && 'cursor-not-allowed opacity-50'
										)}
										onclick={() => selectPackage(p.id)}
									>
										<span class="font-medium">{p.name}</span>
										<span class="block text-muted-foreground">
											{perWeekLabel(p.min_lessons_per_week, p.max_lessons_per_week)}
											{#if p.package_type === 'private'}
												· {p.weeks_duration} hafta · en fazla {p.max_capacity} kişi
											{:else}
												· grup en fazla {p.max_capacity} kişi
											{/if}
										</span>
										{#if tooSmall}
											<span class="block text-xs">{traineeIds.length} öğrenci için uygun değil</span
											>
										{/if}
									</button>
								{/each}
							</div>
						</fieldset>
					{/if}
				{/each}

				{#if pkg}
					{#if isGroup}
						<div class="grid gap-2 sm:max-w-56">
							<Label for="wizard-weeks">Kaç hafta?</Label>
							<Input id="wizard-weeks" type="number" min={1} max={26} bind:value={weeks} />
						</div>
					{:else}
						<div class="grid gap-2 sm:max-w-56">
							<Label for="wizard-periods">Kaç dönem?</Label>
							<Input id="wizard-periods" type="number" min={1} max={12} bind:value={periods} />
							<p class="text-xs text-muted-foreground">
								1 dönem = {pkg.weeks_duration} hafta; toplam {totalWeeks} hafta.
							</p>
						</div>
					{/if}
				{/if}
			{:else if step === 'slots' && pkg}
				<div>
					<h2 class="text-lg font-semibold">Saatler</h2>
					<p class="text-sm text-muted-foreground">
						{pkg.name} · {perWeekLabel(pkg.min_lessons_per_week, pkg.max_lessons_per_week)}
					</p>
				</div>

				<div class="grid gap-4 sm:grid-cols-3">
					<div class="grid gap-2">
						<Label for="wizard-start">Başlangıç</Label>
						<Input id="wizard-start" type="date" min={today} bind:value={startDate} />
					</div>
					{#if !isGroup}
						<div class="grid gap-2">
							<Label for="wizard-room">Oda</Label>
							<NativeSelect id="wizard-room" bind:value={roomId}>
								{#each data.rooms as room (room.id)}
									<option value={room.id}>{room.name}</option>
								{/each}
							</NativeSelect>
						</div>
						<div class="grid gap-2">
							<Label for="wizard-trainer">Eğitmen</Label>
							<NativeSelect id="wizard-trainer" bind:value={trainerId}>
								{#each data.trainers as trainer (trainer.id)}
									<option value={trainer.id}>{trainer.name}</option>
								{/each}
							</NativeSelect>
						</div>
					{/if}
				</div>

				{#if isGroup}
					{#if groupTimeslots.current.status === 'loading' || groupTimeslots.current.status === 'idle'}
						<p class="flex items-center gap-2 text-sm text-muted-foreground">
							<LoaderCircle class="size-4 animate-spin" />
							Grup saatleri yükleniyor…
						</p>
					{:else if groupTimeslots.current.status === 'failed'}
						<p class="text-sm text-destructive">{groupTimeslots.current.message}</p>
					{:else if allGroupTimeslots.length === 0}
						<p class="text-sm text-muted-foreground">
							Bu paketin devam eden grup dersi yok. Önce
							<a href="/group-lessons/new?package_id={pkg.id}" class="underline">grup dersi açın</a
							>.
						</p>
					{:else}
						<div class="flex flex-wrap items-end gap-4">
							{#if groupTrainers.length > 1}
								<div class="grid gap-2">
									<Label for="wizard-trainer-filter">Eğitmen</Label>
									<NativeSelect id="wizard-trainer-filter" bind:value={trainerFilter}>
										<option value="">Tümü</option>
										{#each groupTrainers as [id, name] (id)}
											<option value={id}>{name}</option>
										{/each}
									</NativeSelect>
								</div>
							{/if}
							{#if groupLessonFilter}
								<Button variant="link" class="px-0" onclick={() => (groupLessonFilter = '')}>
									Diğer grup derslerinin saatlerini de göster
								</Button>
							{/if}
						</div>

						<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
							{#each groupTimeslotsByDay as { day, slots } (day)}
								<div class="grid content-start gap-2">
									<h3 class="text-sm font-medium">{DAY_NAMES[day]}</h3>
									{#each slots as timeslot (groupSlotKey(timeslot))}
										{@const selected = selectedGroupKeys.has(groupSlotKey(timeslot))}
										{@const full = timeslot.current_capacity >= timeslot.max_capacity}
										<button
											type="button"
											aria-pressed={selected}
											disabled={full && !selected}
											class={cn(
												'rounded-md border px-3 py-2 text-left text-sm transition-colors',
												'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
												selected ? 'border-primary ring-1 ring-primary' : 'hover:bg-muted/50',
												full && !selected && 'cursor-not-allowed opacity-50'
											)}
											onclick={() => toggleGroupSlot(timeslot)}
										>
											<span class="flex items-center justify-between gap-2">
												<span class="font-medium tabular-nums">{getTimeString(timeslot.hour)}</span>
												<span class="text-muted-foreground tabular-nums">
													{full ? 'Dolu' : `${timeslot.current_capacity}/${timeslot.max_capacity}`}
												</span>
											</span>
											<span class="block text-muted-foreground">
												{timeslot.trainer_name} · {timeslot.room_name}
											</span>
										</button>
									{/each}
								</div>
							{/each}
						</div>
					{/if}
				{:else}
					<div class="flex flex-wrap items-center justify-between gap-2 text-sm">
						<p class="text-muted-foreground">
							Her hafta tekrar eden saatleri seçin. "Dolu": oda veya eğitmen bu haftalarda meşgul.
						</p>
						{#if busy.current.status === 'loading'}
							<span class="flex items-center gap-2 text-muted-foreground">
								<LoaderCircle class="size-4 animate-spin" />
								Kontrol ediliyor…
							</span>
						{:else if busy.current.status === 'failed'}
							<span class="text-destructive">{busy.current.message}</span>
						{/if}
					</div>
					<Schedule
						weekStart={getWeekStart(parseLocalDate(startDate || today))}
						entityName={`${roomName} · ${trainerName}`}
						{getSlotData}
						onSlotClick={handleSlotClick}
					/>
					{#if timeSlots.length > 0}
						<p class="text-sm">
							Seçili: <span class="font-medium">{formatWeeklyPattern(timeSlots)}</span>
						</p>
					{/if}
				{/if}
			{:else if step === 'summary' && pkg}
				<h2 class="text-lg font-semibold">Özet</h2>
				<dl class="grid gap-3 text-sm sm:grid-cols-[10rem_1fr]">
					<dt class="text-muted-foreground">Öğrenci</dt>
					<dd>{traineeNames.join(', ')}</dd>
					<dt class="text-muted-foreground">Paket</dt>
					<dd>
						{pkg.name} ·
						{isGroup ? `${weeks} hafta` : `${periods} dönem (${totalWeeks} hafta)`}
					</dd>
					<dt class="text-muted-foreground">Program</dt>
					<dd>
						{#if isGroup}
							{groupSlotLabels.join(', ')}
						{:else}
							{formatWeeklyPattern(sortTimeSlots(timeSlots))} · {roomName} · {trainerName}
						{/if}
					</dd>
				</dl>

				<LessonPlanSummary plan={preview.current} idleMessage="" />
			{/if}
		</Card.Content>

		<Card.Footer class="flex flex-wrap items-center justify-between gap-3 border-t">
			<div>
				{#if stepIndex > 0}
					<Button variant="outline" onclick={back}>
						<ArrowLeft />
						Geri
					</Button>
				{/if}
			</div>
			<div class="flex flex-wrap items-center gap-3">
				{#if blocker && step !== 'summary'}
					<span class="text-sm text-muted-foreground">{blocker}</span>
				{/if}
				{#if step === 'summary'}
					<Button onclick={submit} disabled={!canCreate || submitting}>
						{#if submitting}<LoaderCircle class="animate-spin" />{/if}
						Kaydı oluştur
					</Button>
				{:else}
					<Button onclick={next} disabled={blocker !== null}>
						Devam
						<ArrowRight />
					</Button>
				{/if}
			</div>
		</Card.Footer>
	</Card.Root>
</div>
