<script lang="ts">
	import type { PageData } from './$types';
	import type { ActionResult } from '@sveltejs/kit';
	import PageHeader from '$lib/components/page-header.svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import ClockAlert from '@lucide/svelte/icons/clock-alert';
	import Plus from '@lucide/svelte/icons/plus';
	import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
	import CalendarArrowUp from '@lucide/svelte/icons/calendar-arrow-up';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { SvelteDate } from 'svelte/reactivity';
	import {
		type DayOfWeek,
		type AppointmentWithDetails,
		type AppointmentWithRelations,
		type CancelTraineeAction,
		type ScheduleSlot,
		DAY_NAMES,
		getTimeRangeString
	} from '$lib/types/Schedule';
	import {
		getWeekStart,
		formatWeekRange,
		formatDateParam,
		getDateForDayOfWeek,
		getDayOfWeekFromDate,
		formatDayMonth
	} from '$lib/utils/date-utils';
	import { getActionErrorMessage } from '$lib/utils/form-utils';
	import {
		createAppointmentDetails,
		computeAppointmentWarnings,
		getAppointmentWarningLabel
	} from '$lib/utils/appointment-utils';
	import { page } from '$app/state';
	import Modal from '$lib/components/modal.svelte';
	import Schedule from '$lib/components/schedule.svelte';
	import DatePicker from '$lib/components/date-picker.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';

	const { data, form }: { data: PageData; form: ActionResult } = $props();

	// Extract data reactively
	let appointments = $derived(data.appointments as AppointmentWithRelations[]);
	let rooms = $derived(data.rooms);
	let trainers = $derived(data.trainers);

	// Capacity/timeslot-collision flags for the week's appointments, computed once across the
	// whole set so collisions can be detected across rooms and trainers.
	let appointmentWarnings = $derived(computeAppointmentWarnings(appointments));

	// UI state
	let viewMode = $state<'room' | 'trainer'>('room');
	let selectedRoomId = $state('');
	let selectedTrainerId = $state('');
	let showDatePicker = $state(false);

	// Initialize selectedRoomId when rooms data is available
	$effect(() => {
		if (rooms.length > 0 && selectedRoomId === '') {
			const sortedRooms = rooms.toSorted((a, b) => (a.name || '').localeCompare(b.name || ''));
			selectedRoomId = sortedRooms[0].id;
		}
	});

	// Initialize selectedTrainerId when trainers data is available
	$effect(() => {
		if (trainers.length > 0 && selectedTrainerId === '') {
			const sortedTrainers = trainers.toSorted((a, b) =>
				(a.name || '').localeCompare(b.name || '')
			);
			selectedTrainerId = sortedTrainers[0].id;
		}
	});
	// Initialize week from URL parameter or current date - make it reactive to URL changes
	let currentWeekStart = $derived(() => {
		const urlWeek = page.url.searchParams.get('week');
		return urlWeek ? getWeekStart(new Date(urlWeek)) : getWeekStart(new Date());
	});

	// Appointment modal state
	let showAppointmentDetailsModal = $state(false);
	let rescheduleMode = $state(false);
	let showRescheduleConfirmation = $state(false);
	let selectedRescheduleSlot = $state<{ roomId: string; day: DayOfWeek; hour: number } | null>(
		null
	);

	let selectedAppointment = $state<AppointmentWithDetails | null>(null);
	let formLoading = $state(false);
	let rescheduleSource = $state<'trainee' | 'system'>('trainee');
	let rescheduleSystemReason = $state('');

	// Cancellation modal state
	let showCancelConfirmation = $state(false);
	let cancelTraineeAction = $state<CancelTraineeAction>('shift');

	function navigateToWeek(date: Date) {
		const weekParam = formatDateParam(date);
		goto(`?week=${weekParam}`);
	}

	function goToPreviousWeek() {
		const newWeekStart = new SvelteDate(currentWeekStart().getTime());
		newWeekStart.setDate(newWeekStart.getDate() - 7);
		navigateToWeek(newWeekStart);
	}

	function goToNextWeek() {
		const newWeekStart = new SvelteDate(currentWeekStart().getTime());
		newWeekStart.setDate(newWeekStart.getDate() + 7);
		navigateToWeek(newWeekStart);
	}

	function goToCurrentWeek() {
		navigateToWeek(getWeekStart(new Date()));
	}

	function handleDateSelect(date: Date) {
		const weekStart = getWeekStart(date);
		navigateToWeek(weekStart);
		showDatePicker = false;
	}

	function toggleDatePicker() {
		showDatePicker = !showDatePicker;
	}

	// Handle click outside to close date picker
	$effect(() => {
		function handleClickOutside(event: MouseEvent) {
			const target = event.target as Element;
			const datePickerElement = target.closest('.date-picker-container');
			if (!datePickerElement && showDatePicker) {
				showDatePicker = false;
			}
		}

		if (showDatePicker) {
			document.addEventListener('click', handleClickOutside);
			return () => {
				document.removeEventListener('click', handleClickOutside);
			};
		}
	});

	function openAppointmentDetails(appointment: AppointmentWithDetails) {
		selectedAppointment = appointment;
		showAppointmentDetailsModal = true;
	}

	function openRescheduleModal(appointment: AppointmentWithDetails) {
		selectedAppointment = appointment;
		rescheduleMode = true;
		showAppointmentDetailsModal = false;
		toast.info('Yeni bir zaman dilimi seçin', { duration: 10000 });
	}

	function resetRescheduleForm() {
		rescheduleMode = false;
		selectedRescheduleSlot = null;
		showRescheduleConfirmation = false;
		rescheduleSource = 'trainee';
		rescheduleSystemReason = '';
	}

	function handleRescheduleSlotClick(roomId: string, day: DayOfWeek, hour: number) {
		if (!rescheduleMode || !selectedAppointment) return;

		selectedRescheduleSlot = { roomId, day, hour };
		setTimeout(() => {
			showRescheduleConfirmation = true;
		}, 10);
	}

	function cancelReschedule() {
		resetRescheduleForm();
		selectedAppointment = null;
		toast.dismiss();
	}

	// Check if a time slot is in the past
	function isSlotInPast(day: DayOfWeek, hour: number): boolean {
		const now = new SvelteDate();
		const slotDate = getDateForDayOfWeek(currentWeekStart(), day);
		const slotDateTime = new SvelteDate(slotDate.getTime());
		slotDateTime.setHours(hour, 0, 0, 0);

		return slotDateTime < now;
	}

	// Check if a time slot is within 23 hours for coordinator restrictions
	function isSlotWithin23Hours(day: DayOfWeek, hour: number): boolean {
		if (data.userRole !== 'coordinator' || !rescheduleMode) return false;

		const now = new SvelteDate();
		const slotDate = getDateForDayOfWeek(currentWeekStart(), day);
		const slotDateTime = new SvelteDate(slotDate.getTime());
		slotDateTime.setHours(hour, 0, 0, 0);

		const hoursUntil = (slotDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
		return hoursUntil < 23;
	}

	// Check if an appointment is in the past
	function isAppointmentInPast(appointment: AppointmentWithDetails): boolean {
		const now = new SvelteDate();
		if (appointment.date && appointment.hour !== null) {
			const appointmentDateTime = new SvelteDate(appointment.date);
			appointmentDateTime.setHours(appointment.hour, 0, 0, 0);
			return appointmentDateTime < now;
		}

		return false;
	}

	// Check if an appointment can be rescheduled based on user role and reschedule limits
	function canRescheduleAppointment(appointment: AppointmentWithDetails): boolean {
		if (isAppointmentInPast(appointment)) {
			return false;
		}

		const now = new SvelteDate();
		let appointmentDateTime: SvelteDate;

		if (appointment.date && appointment.hour !== null) {
			appointmentDateTime = new SvelteDate(appointment.date);
			appointmentDateTime.setHours(appointment.hour, 0, 0, 0);
		} else {
			return false;
		}

		const hoursUntil = (appointmentDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

		if (data.userRole === 'admin') {
			return hoursUntil > 0;
		}

		if (!appointment.purchase_id || (appointment.reschedule_left ?? 0) <= 0) {
			return false;
		}

		if (data.userRole === 'coordinator') {
			return hoursUntil >= 23;
		}

		return false;
	}

	// Check if an appointment has any trainee with their last session
	function isLastSessionAndExtendable(appointment: AppointmentWithDetails): boolean {
		return appointment.has_last_session || false;
	}

	// Check if we're viewing the current week
	const isCurrentWeek = $derived(() => {
		const now = getWeekStart(new Date());
		return currentWeekStart().getTime() === now.getTime();
	});

	// Slot data provider for Schedule component
	function getSlotData(day: DayOfWeek, hour: number, dateString: string): ScheduleSlot {
		const isPast = isSlotInPast(day, hour);
		const isWithin23Hours = isSlotWithin23Hours(day, hour);
		const isRescheduleRestricted = rescheduleMode && isWithin23Hours;

		// Find appointment for this slot
		const appointment = appointments.find((apt) => {
			if (viewMode === 'room') {
				return apt.room_id === selectedRoomId && apt.date === dateString && apt.hour === hour;
			} else {
				return apt.trainer_id === selectedTrainerId && apt.date === dateString && apt.hour === hour;
			}
		});

		if (appointment) {
			const appointmentDetails = createAppointmentDetails(
				appointment,
				viewMode === 'room' ? undefined : appointment.pe_rooms?.name,
				viewMode === 'trainer' ? undefined : appointment.pe_trainers?.name
			);
			const isBeingRescheduled =
				rescheduleMode && selectedAppointment && appointment.id === selectedAppointment.id;
			const isEmpty = (appointmentDetails.trainee_count ?? 0) === 0;
			const warningLabel = getAppointmentWarningLabel(appointmentWarnings.get(appointment.id));

			return {
				variant: 'appointment',
				day,
				hour,
				date: dateString,
				title:
					viewMode === 'room'
						? appointmentDetails.trainer_name || ''
						: appointmentDetails.room_name || '',
				subtitle: appointmentDetails.package_name || '',
				badge: appointmentDetails.has_last_session ? 'Son ders' : undefined,
				warning: warningLabel,
				color: isBeingRescheduled ? 'warning' : warningLabel ? 'error' : 'primary',
				clickable: !rescheduleMode,
				dimmed: isEmpty,
				data: appointmentDetails
			};
		} else if (isPast) {
			return {
				variant: 'empty',
				day,
				hour,
				date: dateString,
				label: '-'
			};
		} else if (rescheduleMode) {
			const canSelectForReschedule = !isPast && !isRescheduleRestricted;
			if (canSelectForReschedule) {
				return {
					variant: 'available',
					day,
					hour,
					date: dateString,
					label: 'Seç',
					clickable: true,
					data: { roomId: viewMode === 'room' ? selectedRoomId : selectedTrainerId, day, hour }
				};
			} else if (isRescheduleRestricted) {
				return {
					variant: 'disabled',
					day,
					hour,
					date: dateString,
					label: '23s',
					reason: 'Randevuya 23 saatten az kaldı'
				};
			} else {
				return {
					variant: 'empty',
					day,
					hour,
					date: dateString,
					label: 'Müsait'
				};
			}
		} else {
			return {
				variant: 'empty',
				day,
				hour,
				date: dateString,
				label: 'Müsait'
			};
		}
	}

	// Handle slot click
	function handleScheduleSlotClick(slot: ScheduleSlot) {
		if (slot.variant === 'appointment' && slot.data && !rescheduleMode) {
			openAppointmentDetails(slot.data as AppointmentWithDetails);
		} else if (slot.variant === 'available' && rescheduleMode && slot.data) {
			const { roomId, day, hour } = slot.data as { roomId: string; day: DayOfWeek; hour: number };
			handleRescheduleSlotClick(roomId, day, hour);
		}
	}
</script>

<svelte:head>
	<title>Haftalık Program · Pilates Evi</title>
</svelte:head>

<div class="space-y-6">
	<div class="px-6 pt-6">
		<div class="flex flex-col justify-between md:flex-row md:items-center">
			<PageHeader title="Haftalık Program" />

			<div class="flex items-end gap-4">
				<!-- View Mode Selector -->
				<div class="flex flex-col gap-2">
					<Label class="font-semibold">Görünüm</Label>
					<div class="flex">
						<Button
							size="sm"
							variant={viewMode === 'room' ? 'default' : 'outline'}
							class="rounded-r-none"
							onclick={() => (viewMode = 'room')}
						>
							Oda
						</Button>
						<Button
							size="sm"
							variant={viewMode === 'trainer' ? 'default' : 'outline'}
							class="rounded-l-none"
							onclick={() => (viewMode = 'trainer')}
						>
							Eğitmen
						</Button>
					</div>
				</div>

				<!-- Room/Trainer Selector -->
				{#if viewMode === 'room'}
					<div class="flex flex-col gap-2">
						<Label for="room-select" class="font-semibold">Oda Seçin</Label>
						<NativeSelect id="room-select" bind:value={selectedRoomId} class="w-full max-w-xs">
							{#each rooms.toSorted( (a, b) => (a.name || '').localeCompare(b.name || '') ) as room (room.id)}
								<option value={room.id}>{room.name}</option>
							{/each}
						</NativeSelect>
					</div>
				{:else}
					<div class="flex flex-col gap-2">
						<Label for="trainer-select" class="font-semibold">Eğitmen Seçin</Label>
						<NativeSelect
							id="trainer-select"
							bind:value={selectedTrainerId}
							class="w-full max-w-xs"
						>
							{#each trainers.toSorted( (a, b) => (a.name || '').localeCompare(b.name || '') ) as trainer (trainer.id)}
								<option value={trainer.id}>{trainer.name}</option>
							{/each}
						</NativeSelect>
					</div>
				{/if}
			</div>
		</div>
	</div>

	{#if form && form.type === 'failure'}
		<Alert.Root variant="destructive" class="mx-6">
			<Alert.Description>{form.data?.message}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if form && form.type === 'success'}
		<Alert.Root class="mx-6 border-success/40 bg-success/10 text-success">
			<Alert.Description>{form.data?.message}</Alert.Description>
		</Alert.Root>
	{/if}

	<!-- Week Navigation -->
	<Card.Root class="mb-6 overflow-visible">
		<Card.Content>
			<div class="flex items-center justify-center gap-4">
				<Button variant="outline" size="sm" onclick={goToPreviousWeek}>
					<ChevronLeft size={16} />
				</Button>

				<div class="date-picker-container relative w-64 text-center">
					<button
						type="button"
						class="cursor-pointer text-lg font-semibold transition-all hover:underline"
						onclick={toggleDatePicker}
					>
						{formatWeekRange(currentWeekStart())}
					</button>

					{#if showDatePicker}
						<div class="absolute top-full left-1/2 z-50 mt-2 -translate-x-1/2 transform">
							<DatePicker
								value={currentWeekStart()}
								onDateSelect={handleDateSelect}
								onClose={() => (showDatePicker = false)}
							/>
						</div>
					{/if}

					{#if !isCurrentWeek()}
						<Button variant="link" size="xs" onclick={goToCurrentWeek}>Bu Haftaya Dön</Button>
					{:else}
						<div class="px-3 py-1 text-xs text-muted-foreground italic">Bu hafta</div>
					{/if}
				</div>

				<Button variant="outline" size="sm" onclick={goToNextWeek}>
					<ChevronRight size={16} />
				</Button>
			</div>
		</Card.Content>
	</Card.Root>

	<!-- Schedule Grid -->
	{#if (viewMode === 'room' && selectedRoomId) || (viewMode === 'trainer' && selectedTrainerId)}
		{@const selectedEntity =
			viewMode === 'room'
				? rooms.find((r) => r.id === selectedRoomId)
				: trainers.find((t) => t.id === selectedTrainerId)}
		{#if selectedEntity}
			<Schedule
				weekStart={currentWeekStart()}
				entityName={selectedEntity.name || ''}
				entityBadge={{
					text: viewMode === 'room' ? 'Oda' : 'Eğitmen',
					color: 'primary'
				}}
				{getSlotData}
				onSlotClick={handleScheduleSlotClick}
			>
				{#snippet alertBanner()}
					{#if rescheduleMode && selectedAppointment}
						<div class="flex items-center gap-3">
							<Alert.Root class="px-3 py-2">
								<Alert.Description class="text-sm">
									<strong>Zaman Değiştirme Modu:</strong>
									{selectedAppointment.trainer_name} - {selectedAppointment.package_name}
								</Alert.Description>
							</Alert.Root>
							<Button size="sm" variant="destructive" onclick={cancelReschedule}>İptal</Button>
						</div>
					{/if}
				{/snippet}
			</Schedule>
		{/if}
	{:else}
		<Card.Root>
			<Card.Content class="flex flex-col items-center text-center">
				{#if viewMode === 'room' && rooms.length === 0}
					<h3 class="text-lg font-semibold">Henüz oda eklenmemiş</h3>
					<p class="text-muted-foreground">
						Haftalık programı görüntülemek için önce bir oda eklemeniz gerekiyor.
					</p>
					<div class="mt-4">
						<Button href="/rooms">Oda Ekle</Button>
					</div>
				{:else if viewMode === 'trainer' && trainers.length === 0}
					<h3 class="text-lg font-semibold">Henüz eğitmen eklenmemiş</h3>
					<p class="text-muted-foreground">
						Haftalık programı görüntülemek için önce bir eğitmen eklemeniz gerekiyor.
					</p>
					<div class="mt-4">
						<Button href="/trainers">Eğitmen Ekle</Button>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}
</div>

<!-- Appointment Details Modal -->
<Modal
	bind:open={showAppointmentDetailsModal}
	size="lg"
	onClose={() => {
		// Keep selectedAppointment when transitioning to reschedule or cancel flows
		if (!rescheduleMode && !showCancelConfirmation) {
			selectedAppointment = null;
		}
	}}
>
	{#snippet header()}
		<div class="flex items-center justify-between">
			<h3 class="text-lg font-bold">Randevu Detayları</h3>
			{#if selectedAppointment && selectedAppointment.purchase_id}
				<Button
					href="/extend?purchase_id={selectedAppointment.purchase_id}"
					size="sm"
					class="bg-warning text-warning-foreground hover:bg-warning/80"
				>
					<Plus size={16} />
					Paketi Uzat
				</Button>
			{/if}
		</div>
	{/snippet}
	{#if selectedAppointment}
		<div class="space-y-4">
			<!-- Extension Alert Strip - Only for private lessons -->
			{#if isLastSessionAndExtendable(selectedAppointment) && selectedAppointment.purchase_id}
				<Alert.Root class="border-warning/40 bg-warning/10 text-warning">
					<ClockAlert size={16} />
					<Alert.Description class="text-sm font-medium text-warning">
						Bu paketin son dersi
					</Alert.Description>
				</Alert.Root>
			{/if}

			<div class="space-y-3">
				<!-- Room -->
				<div>
					<div class="text-xs text-muted-foreground">Oda</div>
					<div class="font-medium">{selectedAppointment.room_name}</div>
				</div>

				<!-- Day & Time -->
				<div class="grid grid-cols-2 gap-3">
					<div>
						<div class="text-xs text-muted-foreground">Gün</div>
						<div class="font-medium">
							{selectedAppointment.date
								? DAY_NAMES[getDayOfWeekFromDate(selectedAppointment.date) as DayOfWeek]
								: '-'}
						</div>
					</div>
					<div>
						<div class="text-xs text-muted-foreground">Saat</div>
						<div class="font-medium">
							{selectedAppointment.hour !== null
								? getTimeRangeString(selectedAppointment.hour)
								: '-'}
						</div>
					</div>
				</div>

				<!-- Trainer -->
				<div>
					<div class="text-xs text-muted-foreground">Eğitmen</div>
					<div class="font-medium">{selectedAppointment.trainer_name}</div>
				</div>

				<!-- Package -->
				<div>
					<div class="text-xs text-muted-foreground">Ders</div>
					<div class="font-medium">{selectedAppointment.package_name || 'Ders Bilgisi Yok'}</div>
				</div>

				<!-- Trainees -->
				<div>
					<div class="text-xs text-muted-foreground">
						Öğrenciler ({selectedAppointment.trainee_count})
					</div>
					<div class="space-y-2">
						{#each selectedAppointment.appointment_trainees || [] as trainee (trainee.id)}
							{@const isLastLesson =
								trainee.session_number === trainee.total_sessions &&
								trainee.total_sessions !== null &&
								!trainee.pe_purchases?.successor_id}
							{@const isGroupLesson = selectedAppointment.group_lesson_id !== null}
							<div class="flex items-center justify-between gap-2">
								<div class="flex-1 font-medium">
									{trainee.pe_trainees?.name || '-'}
									{#if isLastLesson}
										<span class="ml-2 text-xs text-warning">(Son ders)</span>
									{/if}
								</div>
								{#if isGroupLesson && trainee.purchase_id && trainee.pe_trainees?.id}
									<div class="flex gap-1">
										<Button
											href="/transfer?appointment_id={selectedAppointment.id}&trainee_id={trainee
												.pe_trainees.id}"
											size="xs"
											class="bg-warning text-warning-foreground hover:bg-warning/80"
										>
											<CalendarArrowUp size={14} />
											Kaydır
										</Button>
										<Button
											href="/extend?purchase_id={trainee.purchase_id}"
											size="xs"
											class="bg-warning text-warning-foreground hover:bg-warning/80"
										>
											<Plus size={14} />
											Uzat
										</Button>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>
	{/if}

	<div class="flex justify-end gap-2 pt-4">
		{#if selectedAppointment && (data.userRole === 'admin' || data.userRole === 'coordinator') && !isAppointmentInPast(selectedAppointment)}
			<Button
				variant="destructive"
				onclick={() => {
					showAppointmentDetailsModal = false;
					showCancelConfirmation = true;
				}}
			>
				<Trash2 size={16} />
				İptal Et
			</Button>
			<Button
				href="/transfer?appointment_id={selectedAppointment.id}"
				class="bg-warning text-warning-foreground hover:bg-warning/80"
			>
				<ArrowLeftRight size={16} />
				Değiştir
			</Button>
		{/if}
		{#if selectedAppointment && canRescheduleAppointment(selectedAppointment)}
			<Button
				class="bg-warning text-warning-foreground hover:bg-warning/80"
				onclick={() => selectedAppointment && openRescheduleModal(selectedAppointment)}
			>
				{#if (selectedAppointment.reschedule_left ?? 0) >= 999}
					Zamanını Değiştir
				{:else}
					Zamanını Değiştir ({selectedAppointment.reschedule_left} kaldı)
				{/if}
			</Button>
		{/if}
	</div>
</Modal>

<!-- Reschedule Confirmation Modal -->
<Modal
	bind:open={showRescheduleConfirmation}
	title="Randevu Zamanını Değiştir"
	size="lg"
	onClose={() => {
		selectedRescheduleSlot = null;
	}}
>
	{#if selectedAppointment && selectedRescheduleSlot}
		<div class="space-y-4">
			<!-- Appointment details (shared info) -->
			<div class="rounded bg-muted p-4">
				<h4 class="mb-3 text-sm font-semibold">Randevu Bilgileri</h4>
				<div class="grid grid-cols-2 gap-2 text-sm">
					<div><strong>Oda:</strong> {selectedAppointment.room_name}</div>
					<div><strong>Eğitmen:</strong> {selectedAppointment.trainer_name}</div>
				</div>

				{#if selectedAppointment.package_name}
					<div class="mt-2 text-sm">
						<strong>Ders:</strong>
						<Badge variant="secondary" class="ml-1">{selectedAppointment.package_name}</Badge>
					</div>
				{/if}

				{#if selectedAppointment.trainee_names && selectedAppointment.trainee_names.length > 0}
					<div class="mt-2">
						<div class="mb-1 text-sm font-semibold">
							Öğrenciler ({selectedAppointment.trainee_count}):
						</div>
						<div class="flex flex-wrap gap-1">
							{#each selectedAppointment.trainee_names as traineeName (traineeName)}
								<Badge variant="secondary">{traineeName}</Badge>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<!-- Date and time change -->
			<div class="rounded bg-warning/10 p-4">
				<h4 class="mb-3 text-sm font-semibold text-warning">Tarih ve Saat Değişikliği</h4>
				<div class="flex items-center justify-center gap-3 text-sm">
					<div class="text-center">
						<div class="font-medium text-muted-foreground">Mevcut</div>
						<div class="mt-1">
							{#if selectedAppointment.date}
								{@const currentDate = new Date(selectedAppointment.date)}
								<div class="text-xs text-muted-foreground">
									{formatDayMonth(currentDate)}
								</div>
								<div class="font-semibold">
									{DAY_NAMES[getDayOfWeekFromDate(selectedAppointment.date) as DayOfWeek]}
								</div>
							{:else}
								<div class="font-semibold">-</div>
							{/if}
							<div class="text-xs text-muted-foreground">
								{selectedAppointment.hour !== null
									? getTimeRangeString(selectedAppointment.hour)
									: '-'}
							</div>
						</div>
					</div>

					<div class="flex-shrink-0">
						<svg class="h-6 w-6 text-warning" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 7l5 5-5 5M6 12h12"
							></path>
						</svg>
					</div>

					<div class="text-center">
						<div class="font-medium text-muted-foreground">Yeni</div>
						<div class="mt-1">
							{#if selectedRescheduleSlot}
								{@const newDate = getDateForDayOfWeek(
									currentWeekStart(),
									selectedRescheduleSlot.day
								)}
								<div class="text-xs text-muted-foreground">
									{formatDayMonth(newDate)}
								</div>
								<div class="font-semibold">
									{DAY_NAMES[selectedRescheduleSlot.day]}
								</div>
								<div class="text-xs text-muted-foreground">
									{getTimeRangeString(selectedRescheduleSlot.hour)}
								</div>
							{/if}
						</div>
					</div>
				</div>
			</div>

			<form
				method="POST"
				action="?/rescheduleAppointment"
				class="space-y-4"
				use:enhance={() => {
					formLoading = true;
					return async ({ result, update }) => {
						formLoading = false;
						if (result.type === 'success') {
							const data = result.data as { message?: string } | undefined;
							toast.success(data?.message || 'Randevu başarıyla değiştirildi');
							resetRescheduleForm();
							selectedAppointment = null;
							showRescheduleConfirmation = false;
							toast.dismiss();
						} else if (result.type === 'failure') {
							toast.error(getActionErrorMessage(result));
						}
						await update();
					};
				}}
			>
				<input type="hidden" name="appointmentId" value={selectedAppointment.id} />
				<input type="hidden" name="newRoomId" value={selectedRescheduleSlot.roomId} />
				<input type="hidden" name="newDayOfWeek" value={selectedRescheduleSlot.day} />
				<input type="hidden" name="newHour" value={selectedRescheduleSlot.hour} />
				<input type="hidden" name="source" value={rescheduleSource} />

				<div class="grid gap-2">
					<Label>Değişikliği Talep Eden</Label>
					<RadioGroup
						value={rescheduleSource}
						onValueChange={(v) => (rescheduleSource = v as 'trainee' | 'system')}
						class="space-y-2"
					>
						<label class="flex cursor-pointer items-start gap-3">
							<RadioGroupItem value="trainee" class="mt-0.5" />
							<div class="flex flex-col">
								<span class="text-sm">Öğrenci Talebi</span>
								<span class="text-xs text-muted-foreground">
									Öğrenci tarafından talep edilen değişiklik
								</span>
							</div>
						</label>
						<label class="flex cursor-pointer items-start gap-3">
							<RadioGroupItem value="system" class="mt-0.5" />
							<div class="flex flex-col">
								<span class="text-sm">Sistem</span>
								<span class="text-xs text-muted-foreground">
									Stüdyo kaynaklı değişiklik (tatil, eğitmen değişikliği, vb.)
								</span>
							</div>
						</label>
					</RadioGroup>
				</div>

				{#if rescheduleSource === 'system'}
					<div class="grid gap-2">
						<Label for="reschedule-reason">Değişiklik Sebebi</Label>
						<Textarea
							id="reschedule-reason"
							name="reason"
							placeholder="Örn: 23 Nisan tatili"
							rows={2}
							required
							bind:value={rescheduleSystemReason}
						/>
					</div>
				{/if}

				<div class="flex justify-end gap-2">
					<Button
						type="button"
						variant="outline"
						onclick={() => {
							showRescheduleConfirmation = false;
						}}
					>
						İptal
					</Button>
					<Button
						type="submit"
						class="bg-warning text-warning-foreground hover:bg-warning/80"
						disabled={formLoading}
					>
						{#if formLoading}
							<LoaderCircle size={16} class="animate-spin" />
						{:else}
							Onayla
						{/if}
					</Button>
				</div>
			</form>
		</div>
	{/if}
</Modal>

<!-- Cancellation Confirmation Modal -->
<Modal
	bind:open={showCancelConfirmation}
	title="Randevuyu İptal Et"
	size="md"
	onClose={() => {
		selectedAppointment = null;
		cancelTraineeAction = 'shift';
	}}
>
	{#if selectedAppointment}
		{@const traineeCount = selectedAppointment.trainee_count ?? 0}
		<div class="space-y-4">
			<Alert.Root variant="destructive">
				<TriangleAlert size={16} />
				<Alert.Description>
					Bu işlem geri alınamaz. Randevu kalıcı olarak silinecek.
				</Alert.Description>
			</Alert.Root>

			<div class="rounded bg-muted p-4">
				<h4 class="mb-3 text-sm font-semibold">Randevu Bilgileri</h4>
				<div class="grid grid-cols-2 gap-2 text-sm">
					<div><strong>Oda:</strong> {selectedAppointment.room_name}</div>
					<div><strong>Eğitmen:</strong> {selectedAppointment.trainer_name}</div>
					<div>
						<strong>Gün:</strong>
						{selectedAppointment.date
							? DAY_NAMES[getDayOfWeekFromDate(selectedAppointment.date) as DayOfWeek]
							: '-'}
					</div>
					<div>
						<strong>Saat:</strong>
						{selectedAppointment.hour !== null ? getTimeRangeString(selectedAppointment.hour) : '-'}
					</div>
					{#if selectedAppointment.package_name}
						<div class="col-span-2">
							<strong>Ders:</strong>
							{selectedAppointment.package_name}
						</div>
					{/if}
				</div>
				{#if traineeCount > 0 && selectedAppointment.trainee_names?.length}
					<div class="mt-2">
						<div class="mb-1 text-sm font-semibold">Öğrenciler ({traineeCount}):</div>
						<div class="flex flex-wrap gap-1">
							{#each selectedAppointment.trainee_names as traineeName (traineeName)}
								<Badge variant="secondary">{traineeName}</Badge>
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<form
				method="POST"
				action="?/cancelAppointment"
				class="space-y-4"
				use:enhance={() => {
					formLoading = true;
					return async ({ result, update }) => {
						formLoading = false;
						if (result.type === 'success') {
							const data = result.data as { message?: string } | undefined;
							toast.success(data?.message || 'Randevu başarıyla iptal edildi');
							showCancelConfirmation = false;
							selectedAppointment = null;
							cancelTraineeAction = 'shift';
						} else if (result.type === 'failure') {
							toast.error(getActionErrorMessage(result));
						}
						await update();
					};
				}}
			>
				<input type="hidden" name="appointmentId" value={selectedAppointment.id} />
				{#if traineeCount > 0}
					<input type="hidden" name="traineeAction" value={cancelTraineeAction} />
					<div class="grid gap-2">
						<Label>Öğrenciler İçin İşlem</Label>
						<RadioGroup
							value={cancelTraineeAction}
							onValueChange={(v) => (cancelTraineeAction = v as CancelTraineeAction)}
							class="space-y-2"
						>
							<label class="flex cursor-pointer items-start gap-3">
								<RadioGroupItem value="shift" class="mt-0.5" />
								<div class="flex flex-col">
									<span class="text-sm">Derslerini Bir Kaydır</span>
									<span class="text-xs text-muted-foreground">
										Öğrencilerin ders sayısı korunur, ileri tarihli randevulara kaydırılır
									</span>
								</div>
							</label>
							<label class="flex cursor-pointer items-start gap-3">
								<RadioGroupItem value="remove" class="mt-0.5" />
								<div class="flex flex-col">
									<span class="text-sm">Atamaları Kaldır</span>
									<span class="text-xs text-muted-foreground">
										Öğrenciler bu dersi kaybeder, başka değişiklik olmaz
									</span>
								</div>
							</label>
						</RadioGroup>
					</div>
				{/if}
				<div class="flex justify-end gap-2">
					<Button
						type="button"
						variant="outline"
						onclick={() => {
							showCancelConfirmation = false;
						}}
					>
						Vazgeç
					</Button>
					<Button type="submit" variant="destructive" disabled={formLoading}>
						{#if formLoading}
							<LoaderCircle size={16} class="animate-spin" />
						{:else}
							<Trash2 size={16} />
							Randevuyu İptal Et
						{/if}
					</Button>
				</div>
			</form>
		</div>
	{/if}
</Modal>
