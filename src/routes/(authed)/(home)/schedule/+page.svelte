<script lang="ts">
	import type { PageData } from './$types';
	import type { ActionItem } from '$lib/types';
	import type { MovingTrainee } from '$lib/types/ComponentProps';
	import type {
		AppointmentWithDetails,
		DayOfWeek,
		PickedSlot,
		ScheduleSlot
	} from '$lib/types/Schedule';
	import PageHeader from '$lib/components/page-header.svelte';
	import Schedule from '$lib/components/schedule.svelte';
	import WeekNav from '$lib/components/week-nav.svelte';
	import AppointmentSheet from '$lib/components/scheduling/appointment-sheet.svelte';
	import MoveSheet from '$lib/components/scheduling/move-sheet.svelte';
	import CancelDialog from '$lib/components/scheduling/cancel-dialog.svelte';
	import CloseDayDialog from '$lib/components/scheduling/close-day-dialog.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import CalendarX from '@lucide/svelte/icons/calendar-x';
	import MoveRight from '@lucide/svelte/icons/move-right';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import {
		formatDateForDB,
		formatSlotLabel,
		getWeekStart,
		isAppointmentFuture,
		parseLocalDate
	} from '$lib/utils/date-utils';
	import { isIsoDate } from '$lib/utils/validation';
	import {
		computeAppointmentWarnings,
		createAppointmentDetails,
		getAppointmentWarningLabel,
		lessonBlockLines
	} from '$lib/utils/appointment-utils';

	let { data }: { data: PageData } = $props();

	const appointments = $derived(data.appointments);
	const rooms = $derived(data.rooms);
	const trainers = $derived(data.trainers);
	const isStaff = $derived(data.userRole === 'admin' || data.userRole === 'coordinator');
	const appointmentWarnings = $derived(computeAppointmentWarnings(appointments));

	// View (room or trainer) and the selected one live in the URL, so links and the week
	// navigation keep them
	const params = $derived(page.url.searchParams);
	const viewMode = $derived<'room' | 'trainer'>(
		params.get('view') === 'trainer' ? 'trainer' : 'room'
	);
	// An unknown or empty id in the URL falls back to the first room / trainer
	const selectedRoomId = $derived(
		rooms.find((r) => r.id === params.get('room'))?.id ?? rooms[0]?.id ?? ''
	);
	const selectedTrainerId = $derived(
		trainers.find((t) => t.id === params.get('trainer'))?.id ?? trainers[0]?.id ?? ''
	);
	const weekStart = $derived.by(() => {
		const week = params.get('week');
		return getWeekStart(week && isIsoDate(week) ? parseLocalDate(week) : new Date());
	});

	// Panels
	let selected = $state<AppointmentWithDetails | null>(null);
	let appointmentSheetOpen = $state(false);
	let moveSheetOpen = $state(false);
	let movingTrainee = $state<MovingTrainee | null>(null);
	let pickMode = $state(false);
	let pickedSlot = $state<PickedSlot | null>(null);
	let cancelOpen = $state(false);
	let closeDayDate = $state<string | null>(null);
	let closeDayOpen = $state(false);

	function navigate(changes: Record<string, string>) {
		const url = new URL(page.url);
		for (const [key, value] of Object.entries(changes)) url.searchParams.set(key, value);
		url.searchParams.delete('appointment');
		url.searchParams.delete('action');
		url.searchParams.delete('trainee');
		goto(url, { keepFocus: true, noScroll: true });
	}

	const goToWeek = (date: Date) => navigate({ week: formatDateForDB(getWeekStart(date)) });

	// Opened from another page (e.g. a trainee's lesson list): ?appointment=<id>&action=move
	function openFromUrl() {
		const id = Number(params.get('appointment'));
		const appointment = id ? appointments.find((a) => a.id === id) : undefined;
		if (!appointment) return;
		selected = createAppointmentDetails(appointment);
		// ?trainee= moves only that trainee of a group lesson
		const enrollment = appointment.pe_appointment_trainees.find(
			(e) => e.pe_trainees.id === params.get('trainee')
		);
		movingTrainee = enrollment
			? { id: enrollment.pe_trainees.id, name: enrollment.pe_trainees.name }
			: null;
		const action = params.get('action');
		if (action === 'move') moveSheetOpen = true;
		else if (action === 'cancel') cancelOpen = true;
		else appointmentSheetOpen = true;
	}
	$effect(openFromUrl);

	function openMove(trainee: MovingTrainee | null) {
		movingTrainee = trainee;
		pickedSlot = null;
		appointmentSheetOpen = false;
		moveSheetOpen = true;
	}

	function startPicking() {
		moveSheetOpen = false;
		pickMode = true;
	}

	function stopPicking() {
		pickMode = false;
		moveSheetOpen = true;
	}

	async function afterChange(week?: string) {
		pickMode = false;
		pickedSlot = null;
		selected = null;
		// Also drops ?appointment= so the panel doesn't reopen on the refreshed data
		navigate(week ? { week: formatDateForDB(getWeekStart(parseLocalDate(week))) } : {});
		await invalidateAll();
	}

	function getSlotData(day: DayOfWeek, hour: number, date: string): ScheduleSlot {
		const appointment = appointments.find((apt) =>
			viewMode === 'room'
				? apt.room_id === selectedRoomId && apt.date === date && apt.hour === hour
				: apt.trainer_id === selectedTrainerId && apt.date === date && apt.hour === hour
		);

		if (appointment) {
			const details = createAppointmentDetails(appointment);
			const warning = getAppointmentWarningLabel(appointmentWarnings.get(appointment.id));
			const isMoving = pickMode && selected?.id === appointment.id;
			return {
				variant: 'appointment',
				day,
				hour,
				date,
				...lessonBlockLines(details, viewMode === 'room' ? 'trainer' : 'room'),
				badge: details.has_last_session ? 'Son ders' : undefined,
				warning,
				color: isMoving ? 'muted' : warning ? 'destructive' : 'primary',
				clickable: !pickMode,
				dimmed: (details.trainee_count ?? 0) === 0,
				data: details
			};
		}

		if (!isAppointmentFuture(date, hour) || !isStaff) {
			return { variant: 'empty', day, hour, date };
		}

		return {
			variant: 'available',
			day,
			hour,
			date,
			label: pickMode ? 'Buraya taşı' : undefined,
			hoverLabel: pickMode ? undefined : 'Kayıt ekle',
			clickable: true
		};
	}

	function handleSlotClick(slot: ScheduleSlot) {
		if (slot.variant === 'appointment' && slot.data && 'trainee_count' in slot.data) {
			selected = slot.data;
			appointmentSheetOpen = true;
			return;
		}
		if (slot.variant !== 'available') return;

		if (pickMode && selected) {
			pickedSlot = {
				date: slot.date,
				hour: slot.hour,
				// In trainer view the lesson keeps its room
				roomId: viewMode === 'room' ? selectedRoomId : selected.room_id
			};
			stopPicking();
			return;
		}

		const prefill = new URLSearchParams({ date: slot.date, hour: String(slot.hour) });
		if (viewMode === 'room') prefill.set('room_id', selectedRoomId);
		else prefill.set('trainer_id', selectedTrainerId);
		goto(`/new-assignment?${prefill}`);
	}

	function dayActions(date: string): ActionItem[] {
		if (!isStaff || date <= formatDateForDB(new Date())) return [];
		return [
			{
				label: 'Günü kapat',
				icon: CalendarX,
				handler: () => {
					closeDayDate = date;
					closeDayOpen = true;
				}
			}
		];
	}
</script>

<svelte:head>
	<title>Takvim · Pilates Evi</title>
</svelte:head>

<div class="space-y-4 p-4 lg:p-6">
	<PageHeader title="Takvim">
		{#snippet actions()}
			<WeekNav {weekStart} onNavigate={goToWeek} />
		{/snippet}
	</PageHeader>

	<div class="flex flex-wrap items-center gap-3">
		<ToggleGroup.Root
			type="single"
			variant="outline"
			size="sm"
			value={viewMode}
			onValueChange={(v) => v && navigate({ view: v })}
			aria-label="Görünüm"
		>
			<ToggleGroup.Item value="room">Oda</ToggleGroup.Item>
			<ToggleGroup.Item value="trainer">Eğitmen</ToggleGroup.Item>
		</ToggleGroup.Root>
		<span class="h-5 w-px bg-border" aria-hidden="true"></span>
		<ToggleGroup.Root
			type="single"
			size="sm"
			spacing={1}
			value={viewMode === 'room' ? selectedRoomId : selectedTrainerId}
			onValueChange={(v) => v && navigate(viewMode === 'room' ? { room: v } : { trainer: v })}
			aria-label={viewMode === 'room' ? 'Oda' : 'Eğitmen'}
			class="flex-wrap"
		>
			{#each viewMode === 'room' ? rooms : trainers as entity (entity.id)}
				<ToggleGroup.Item
					value={entity.id}
					class="px-3 data-[state=on]:bg-secondary data-[state=on]:font-semibold data-[state=on]:text-secondary-foreground data-[state=on]:ring-1 data-[state=on]:ring-foreground/15"
				>
					{entity.name}
				</ToggleGroup.Item>
			{/each}
		</ToggleGroup.Root>
	</div>

	{#if pickMode && selected}
		<div
			class="sticky top-0 z-20 flex flex-wrap items-center gap-3 rounded-2xl bg-card p-3 text-sm shadow-md ring-1 ring-primary/40"
			role="status"
		>
			<MoveRight class="size-4" />
			<span>
				<span class="font-medium">Taşınıyor:</span>
				{selected.package_name} · {formatSlotLabel(selected.date, selected.hour)}. Yeni saati seçin;
				başka haftaya, odaya veya eğitmene geçebilirsiniz.
			</span>
			<Button variant="outline" size="sm" class="ml-auto" onclick={stopPicking}>Vazgeç</Button>
		</div>
	{/if}

	{#if (viewMode === 'room' ? rooms : trainers).length === 0}
		<Empty.Root class="border">
			<Empty.Header>
				<Empty.Title>
					{viewMode === 'room' ? 'Henüz oda yok' : 'Henüz eğitmen yok'}
				</Empty.Title>
				<Empty.Description>
					{#if data.userRole === 'admin'}
						Takvimi kullanmak için önce {viewMode === 'room' ? 'bir oda' : 'bir eğitmen'} ekleyin.
					{:else}
						Stüdyo yöneticinizden {viewMode === 'room' ? 'oda' : 'eğitmen'} eklemesini isteyin.
					{/if}
				</Empty.Description>
			</Empty.Header>
			{#if data.userRole === 'admin'}
				<Empty.Content>
					<Button href={viewMode === 'room' ? '/rooms' : '/trainers'}>
						{viewMode === 'room' ? 'Oda ekle' : 'Eğitmen ekle'}
					</Button>
				</Empty.Content>
			{/if}
		</Empty.Root>
	{:else}
		{@const entity =
			viewMode === 'room'
				? rooms.find((r) => r.id === selectedRoomId)
				: trainers.find((t) => t.id === selectedTrainerId)}
		<Schedule
			{weekStart}
			entityName={entity?.name ?? ''}
			{getSlotData}
			onSlotClick={handleSlotClick}
			{dayActions}
		/>
	{/if}
</div>

<AppointmentSheet
	bind:open={appointmentSheetOpen}
	appointment={selected}
	userRole={data.userRole}
	onMove={openMove}
	onCancel={() => {
		appointmentSheetOpen = false;
		cancelOpen = true;
	}}
/>

{#key `${selected?.id}-${movingTrainee?.id}`}
	<MoveSheet
		bind:open={moveSheetOpen}
		appointment={selected}
		trainee={movingTrainee}
		{rooms}
		{trainers}
		userRole={data.userRole}
		{pickedSlot}
		onPickTime={startPicking}
		onDone={afterChange}
	/>
{/key}

{#key selected?.id}
	<CancelDialog bind:open={cancelOpen} appointment={selected} onDone={() => afterChange()} />
{/key}

{#key closeDayDate}
	<CloseDayDialog bind:open={closeDayOpen} date={closeDayDate} onDone={() => afterChange()} />
{/key}
