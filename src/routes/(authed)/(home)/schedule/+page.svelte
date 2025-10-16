<script lang="ts">
	import type { PageData } from './$types';
	import type { ActionResult } from '@sveltejs/kit';
	import PageHeader from '$lib/components/page-header.svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import ClockAlert from '@lucide/svelte/icons/clock-alert';
	import Plus from '@lucide/svelte/icons/plus';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { SvelteDate } from 'svelte/reactivity';
	import type {
		DayOfWeek,
		AppointmentWithDetails,
		AppointmentWithRelations
	} from '$lib/types/Schedule';
	import { DAY_NAMES, getTimeRangeString } from '$lib/types/Schedule';
	import {
		getWeekStart,
		formatWeekRange,
		formatDateParam,
		getDateForDayOfWeek,
		getDayOfWeekFromDate,
		formatDayMonth
	} from '$lib/utils/date-utils';
	import { getActionErrorMessage } from '$lib/utils/form-utils';
	import { createAppointmentDetails } from '$lib/utils/appointment-utils';
	import { page } from '$app/state';
	import Modal from '$lib/components/modal.svelte';
	import Schedule from '$lib/components/schedule.svelte';
	import type { ScheduleSlot } from '$lib/components/schedule.types';

	const { data, form }: { data: PageData; form: ActionResult } = $props();

	// Extract data reactively
	let appointments = $derived(data.appointments as AppointmentWithRelations[]);
	// Access inherited data from parent layout
	let rooms = $derived(data.rooms);
	let trainers = $derived(data.trainers);

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

	// Appointment modal state (simplified - add appointment modal removed)
	let showAppointmentDetailsModal = $state(false);
	let rescheduleMode = $state(false);
	let showRescheduleConfirmation = $state(false);
	let selectedRescheduleSlot = $state<{ roomId: string; day: DayOfWeek; hour: number } | null>(
		null
	);

	let selectedAppointment = $state<AppointmentWithDetails | null>(null);
	let formLoading = $state(false);

	// Extension modal state - TODO: Re-implement for new schema
	let showExtensionModal = $state(false);
	let additionalPackages = $state(1);
	let extensionLoading = $state(false);

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

	function handleDateSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		const selectedDate = new Date(target.value);
		const weekStart = getWeekStart(selectedDate);
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
		// Don't reset selectedAppointment when closing the details modal for reschedule
		toast.info('Yeni bir zaman dilimi seçin', { duration: 10000 });
	}

	function resetRescheduleForm() {
		rescheduleMode = false;
		selectedRescheduleSlot = null;
		showRescheduleConfirmation = false;
	}

	function handleRescheduleSlotClick(roomId: string, day: DayOfWeek, hour: number) {
		if (!rescheduleMode || !selectedAppointment) return;

		selectedRescheduleSlot = { roomId, day, hour };
		// Add a small delay to ensure state is set before opening modal
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
		// Only apply 23-hour restriction to coordinators in reschedule mode
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
		// Use the date if available
		if (appointment.date && appointment.hour !== null) {
			const appointmentDateTime = new SvelteDate(appointment.date);
			appointmentDateTime.setHours(appointment.hour, 0, 0, 0);
			return appointmentDateTime < now;
		}

		return false;
	}

	// Check if an appointment can be rescheduled based on user role and reschedule limits
	function canRescheduleAppointment(appointment: AppointmentWithDetails): boolean {
		// Rule 1: Past appointments are never reschedulable
		if (isAppointmentInPast(appointment)) {
			return false;
		}

		// Calculate time until appointment
		const now = new SvelteDate();
		let appointmentDateTime: SvelteDate;

		if (appointment.date && appointment.hour !== null) {
			appointmentDateTime = new SvelteDate(appointment.date);
			appointmentDateTime.setHours(appointment.hour, 0, 0, 0);
		} else {
			// Fallback: this shouldn't happen with new appointments
			return false;
		}

		const hoursUntil = (appointmentDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

		// Rule 2: Admin can reschedule any future appointment (no reschedule limit check)
		if (data.userRole === 'admin') {
			return hoursUntil > 0;
		}

		// Rule 3: For non-admin users, check if the package has reschedules remaining
		if (!appointment.purchase_id || (appointment.reschedule_left ?? 0) <= 0) {
			return false; // No reschedules left
		}

		// Rule 4: Coordinator can only reschedule if there are reschedules left AND there are 23+ hours until appointment
		if (data.userRole === 'coordinator') {
			return hoursUntil >= 23;
		}

		return false;
	}

	// Check if an appointment has any trainee with their last session
	function isLastSessionAndExtendable(appointment: AppointmentWithDetails): boolean {
		// Check if any trainee in this appointment has their last session
		return appointment.has_last_session || false;
	}

	// TODO: Re-implement extension functions for new schema
	function isPrivatePackage(appointment: AppointmentWithDetails): boolean {
		// For now, check if appointment has a purchase_id (private lessons have purchases)
		return appointment.purchase_id !== null && appointment.purchase_id !== undefined;
	}

	function openExtensionModal(appointment: AppointmentWithDetails) {
		selectedAppointment = appointment;
		showExtensionModal = true;
		additionalPackages = 1;
		extensionLoading = false;
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
				color: isBeingRescheduled ? 'warning' : viewMode === 'room' ? 'primary' : 'info',
				clickable: !rescheduleMode,
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

<div class="space-y-6">
	<div class="px-6 pt-6">
		<div class="flex flex-col justify-between md:flex-row md:items-center">
			<PageHeader title="Haftalık Program" />

			<div class="flex items-start gap-4">
				<!-- View Mode Selector -->
				<div class="form-control flex flex-col">
					<div class="label">
						<span class="label-text font-semibold">Görünüm</span>
					</div>
					<div class="join">
						<button
							class="btn join-item btn-sm md:btn-md"
							class:btn-primary={viewMode === 'room'}
							class:btn-outline={viewMode !== 'room'}
							onclick={() => (viewMode = 'room')}
						>
							Oda
						</button>
						<button
							class="btn join-item btn-sm md:btn-md"
							class:btn-info={viewMode === 'trainer'}
							class:btn-outline={viewMode !== 'trainer'}
							onclick={() => (viewMode = 'trainer')}
						>
							Eğitmen
						</button>
					</div>
				</div>

				<!-- Room/Trainer Selector -->
				{#if viewMode === 'room'}
					<div class="form-control">
						<label class="label" for="room-select">
							<span class="label-text font-semibold">Oda Seçin</span>
						</label>
						<select
							id="room-select"
							bind:value={selectedRoomId}
							class="select-bordered select w-full max-w-xs select-sm md:select-md"
						>
							{#each rooms.toSorted( (a, b) => (a.name || '').localeCompare(b.name || '') ) as room (room.id)}
								<option value={room.id}>{room.name}</option>
							{/each}
						</select>
					</div>
				{:else}
					<div class="form-control">
						<label class="label" for="trainer-select">
							<span class="label-text font-semibold">Eğitmen Seçin</span>
						</label>
						<select
							id="trainer-select"
							bind:value={selectedTrainerId}
							class="select-bordered select w-full max-w-xs select-sm md:select-md"
						>
							{#each trainers.toSorted( (a, b) => (a.name || '').localeCompare(b.name || '') ) as trainer (trainer.id)}
								<option value={trainer.id}>{trainer.name}</option>
							{/each}
						</select>
					</div>
				{/if}
			</div>
		</div>
	</div>

	{#if form && form.type === 'failure'}
		<div class="alert alert-error">
			<span>{form.data?.message}</span>
		</div>
	{/if}

	{#if form && form.type === 'success'}
		<div class="alert alert-success">
			<span>{form.data?.message}</span>
		</div>
	{/if}

	<!-- Week Navigation -->
	<div class="card mb-6 bg-base-100 shadow-xl">
		<div class="card-body">
			<div class="flex items-center justify-center gap-4">
				<button class="btn btn-outline btn-sm" onclick={goToPreviousWeek}>
					<ChevronLeft size={16} />
				</button>

				<div class="date-picker-container relative w-64 text-center">
					<button
						class="cursor-pointer text-lg font-semibold transition-all hover:underline"
						onclick={toggleDatePicker}
					>
						{formatWeekRange(currentWeekStart())}
					</button>

					{#if showDatePicker}
						<div
							class="absolute top-full left-1/2 z-50 mt-2 min-w-56 -translate-x-1/2 transform rounded-lg border border-base-300 bg-base-100 p-4 shadow-lg"
						>
							<div class="mb-2 text-sm text-base-content/70">Tarih seçin:</div>
							<input
								type="date"
								class="input-bordered input w-full"
								value={formatDateParam(currentWeekStart())}
								onchange={handleDateSelect}
							/>
							<button
								class="btn mt-2 w-full btn-ghost btn-sm"
								onclick={() => (showDatePicker = false)}
							>
								İptal
							</button>
						</div>
					{/if}

					{#if !isCurrentWeek()}
						<button class="btn btn-link btn-xs btn-info" onclick={goToCurrentWeek}
							>Bu Haftaya Dön</button
						>
					{:else}
						<div class="px-3 py-1 text-xs text-base-content/60 italic">Bu hafta</div>
					{/if}
				</div>

				<button class="btn btn-outline btn-sm" onclick={goToNextWeek}>
					<ChevronRight size={16} />
				</button>
			</div>
		</div>
	</div>

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
					color: viewMode === 'room' ? 'primary' : 'info'
				}}
				{getSlotData}
				onSlotClick={handleScheduleSlotClick}
			>
				{#snippet alertBanner()}
					{#if rescheduleMode && selectedAppointment}
						<div class="flex items-center gap-3">
							<div class="alert alert-info px-3 py-2">
								<div class="text-sm">
									<strong>Zaman Değiştirme Modu:</strong>
									{selectedAppointment.trainer_name} - {selectedAppointment.package_name}
								</div>
							</div>
							<button class="btn btn-sm btn-error" onclick={cancelReschedule}> İptal </button>
						</div>
					{/if}
				{/snippet}
			</Schedule>
		{/if}
	{/if}
</div>

<!-- Appointment Details Modal -->
<Modal
	bind:open={showAppointmentDetailsModal}
	size="lg"
	onClose={() => {
		// Only reset selectedAppointment if we're not in reschedule mode
		if (!rescheduleMode) {
			selectedAppointment = null;
		}
	}}
>
	{#snippet header()}
		<div class="flex items-center justify-between">
			<h3 class="text-lg font-bold">Randevu Detayları</h3>
			{#if selectedAppointment && selectedAppointment.purchase_id}
				<a
					href="/extend?purchase_id={selectedAppointment.purchase_id}"
					class="btn btn-sm btn-warning"
				>
					<Plus size={16} />
					Paketi Uzat
				</a>
			{/if}
		</div>
	{/snippet}
	{#if selectedAppointment}
		<div class="space-y-4">
			<!-- Extension Alert Strip - Only for private lessons -->
			{#if isLastSessionAndExtendable(selectedAppointment) && selectedAppointment.purchase_id}
				<div class="alert alert-warning p-3">
					<div class="flex items-center gap-2">
						<ClockAlert size={16} />
						<span class="text-sm font-medium">Bu paketin son dersi</span>
					</div>
				</div>
			{/if}

			<div class="space-y-3">
				<!-- Room -->
				<div>
					<div class="text-xs text-base-content/60">Oda</div>
					<div class="font-medium">{selectedAppointment.room_name}</div>
				</div>

				<!-- Day & Time -->
				<div class="grid grid-cols-2 gap-3">
					<div>
						<div class="text-xs text-base-content/60">Gün</div>
						<div class="font-medium">
							{selectedAppointment.date
								? DAY_NAMES[getDayOfWeekFromDate(selectedAppointment.date) as DayOfWeek]
								: '-'}
						</div>
					</div>
					<div>
						<div class="text-xs text-base-content/60">Saat</div>
						<div class="font-medium">
							{selectedAppointment.hour !== null
								? getTimeRangeString(selectedAppointment.hour)
								: '-'}
						</div>
					</div>
				</div>

				<!-- Trainer -->
				<div>
					<div class="text-xs text-base-content/60">Eğitmen</div>
					<div class="font-medium">{selectedAppointment.trainer_name}</div>
				</div>

				<!-- Package -->
				<div>
					<div class="text-xs text-base-content/60">Ders</div>
					<div class="font-medium">{selectedAppointment.package_name || 'Ders Bilgisi Yok'}</div>
				</div>

				<!-- Trainees -->
				<div>
					<div class="text-xs text-base-content/60">
						Öğrenciler ({selectedAppointment.trainee_count})
					</div>
					<div class="space-y-2">
						{#each selectedAppointment.appointment_trainees || [] as trainee (trainee.id)}
							{@const isLastLesson =
								trainee.session_number === trainee.total_sessions &&
								trainee.total_sessions !== null}
							{@const isGroupLesson = selectedAppointment.group_lesson_id !== null}
							<div class="flex items-center justify-between gap-2">
								<div class="flex-1 font-medium">
									{trainee.pe_trainees?.name || '-'}
									{#if isLastLesson}
										<span class="ml-2 text-xs text-warning">(Son ders)</span>
									{/if}
								</div>
								{#if isGroupLesson && trainee.purchase_id}
									<a
										href="/extend?purchase_id={trainee.purchase_id}"
										class="btn flex-shrink-0 btn-xs btn-warning"
									>
										<Plus size={14} />
										Uzat
									</a>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>
	{/if}

	<div class="modal-action">
		{#if selectedAppointment && canRescheduleAppointment(selectedAppointment)}
			<button
				type="button"
				class="btn btn-warning"
				onclick={() => selectedAppointment && openRescheduleModal(selectedAppointment)}
			>
				{#if (selectedAppointment.reschedule_left ?? 0) >= 999}
					Zamanını Değiştir
				{:else}
					Zamanını Değiştir ({selectedAppointment.reschedule_left} kaldı)
				{/if}
			</button>
		{/if}
		<button
			type="button"
			class="btn"
			onclick={() => {
				showAppointmentDetailsModal = false;
				// Don't reset selectedAppointment immediately - let the Modal's onClose handle it after animation
			}}
		>
			Kapat
		</button>
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
			<div class="rounded bg-base-200 p-4">
				<h4 class="mb-3 text-sm font-semibold">Randevu Bilgileri</h4>
				<div class="grid grid-cols-2 gap-2 text-sm">
					<div><strong>Oda:</strong> {selectedAppointment.room_name}</div>
					<div><strong>Eğitmen:</strong> {selectedAppointment.trainer_name}</div>
				</div>

				{#if selectedAppointment.package_name}
					<div class="mt-2 text-sm">
						<strong>Ders:</strong>
						<span class="ml-1 badge badge-sm badge-secondary"
							>{selectedAppointment.package_name}</span
						>
					</div>
				{/if}

				{#if selectedAppointment.trainee_names && selectedAppointment.trainee_names.length > 0}
					<div class="mt-2">
						<div class="mb-1 text-sm font-semibold">
							Öğrenciler ({selectedAppointment.trainee_count}):
						</div>
						<div class="flex flex-wrap gap-1">
							{#each selectedAppointment.trainee_names as traineeName (traineeName)}
								<span class="badge badge-xs badge-success">{traineeName}</span>
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
						<div class="font-medium text-base-content/70">Mevcut</div>
						<div class="mt-1">
							{#if selectedAppointment.date}
								{@const currentDate = new Date(selectedAppointment.date)}
								<div class="text-xs text-base-content/60">
									{formatDayMonth(currentDate)}
								</div>
								<div class="font-semibold">
									{DAY_NAMES[getDayOfWeekFromDate(selectedAppointment.date) as DayOfWeek]}
								</div>
							{:else}
								<div class="font-semibold">-</div>
							{/if}
							<div class="text-xs text-base-content/70">
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
						<div class="font-medium text-base-content/70">Yeni</div>
						<div class="mt-1">
							{#if selectedRescheduleSlot}
								{@const newDate = getDateForDayOfWeek(
									currentWeekStart(),
									selectedRescheduleSlot.day
								)}
								<div class="text-xs text-base-content/60">
									{formatDayMonth(newDate)}
								</div>
								<div class="font-semibold">
									{DAY_NAMES[selectedRescheduleSlot.day]}
								</div>
								<div class="text-xs text-base-content/70">
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
							toast.success('Randevu başarıyla ertelendi');
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

				<fieldset class="fieldset">
					<legend class="fieldset-legend">Değişiklik Sebebi (İsteğe bağlı)</legend>
					<textarea
						name="reason"
						class="textarea-bordered textarea w-full"
						placeholder="Randevu değişikliği sebebini açıklayın..."
						rows="2"
					></textarea>
				</fieldset>

				<div class="modal-action">
					<button
						type="button"
						class="btn"
						onclick={() => {
							showRescheduleConfirmation = false;
							// Don't reset selectedRescheduleSlot immediately - let the Modal's onClose handle it after animation
						}}
					>
						İptal
					</button>
					<button type="submit" class="btn btn-warning" disabled={formLoading}>
						{#if formLoading}
							<LoaderCircle size={16} class="animate-spin" />
						{:else}
							Onayla
						{/if}
					</button>
				</div>
			</form>
		</div>
	{/if}
</Modal>

<Modal bind:open={showExtensionModal} title="Paketi Uzat">
	{#if selectedAppointment}
		<form
			method="POST"
			action="?/extendPackage"
			use:enhance={() => {
				extensionLoading = true;
				return async ({ result, update }) => {
					extensionLoading = false;
					if (result.type === 'success') {
						toast.success('Paket başarıyla uzatıldı');
						showExtensionModal = false;
						additionalPackages = 1;
					} else if (result.type === 'failure') {
						toast.error(getActionErrorMessage(result));
					}
					await update();
				};
			}}
			class="space-y-5"
		>
			<input type="hidden" name="purchase_id" value={selectedAppointment.purchase_id} />
			<input type="hidden" name="package_count" value={additionalPackages} />

			<div class="alert alert-warning">
				<span>Extension functionality needs to be reimplemented for the new schema.</span>
			</div>

			<!-- Extension Input -->
			<div class="form-control">
				<label class="label pb-2" for="package_count">
					<span class="label-text font-medium">Kaç paket uzatılsın?</span>
				</label>
				<input
					type="number"
					id="package_count"
					name="package_count"
					bind:value={additionalPackages}
					min="1"
					max="20"
					class="input-bordered input text-center text-lg font-medium"
					required
				/>
			</div>

			<!-- Action Buttons -->
			<div class="modal-action">
				<button type="button" class="btn" onclick={() => (showExtensionModal = false)}>
					İptal
				</button>
				<button type="submit" class="btn btn-info" disabled={true}>
					{#if extensionLoading}
						<LoaderCircle size={16} class="animate-spin" />
					{:else}
						Uzat (Henüz aktif değil)
					{/if}
				</button>
			</div>
		</form>
	{/if}
</Modal>
