<script lang="ts">
	import type { PageData } from './$types';
	import type { ActionResult } from '@sveltejs/kit';
	import PageHeader from '$lib/components/page-header.svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { SvelteDate } from 'svelte/reactivity';
	import type {
		ScheduleGrid,
		DayOfWeek,
		AppointmentWithDetails,
		AppointmentWithRelations
	} from '$lib/types/Schedule';
	import { DAYS_OF_WEEK, DAY_NAMES, SCHEDULE_HOURS, getTimeRangeString } from '$lib/types/Schedule';
	import {
		getWeekStart,
		formatWeekRange,
		formatDateParam,
		getDateForDayOfWeek,
		formatDayMonth,
		getDayOfWeekFromDate
	} from '$lib/utils/date-utils';
	import { getActionErrorMessage } from '$lib/utils/form-utils';
	import { page } from '$app/state';

	const { data, form }: { data: PageData; form: ActionResult } = $props();

	// Extract data reactively
	let appointments = $derived(data.appointments);
	// Access inherited data from parent layout
	let rooms = $derived(data.rooms);
	let trainers = $derived(data.trainers);

	// UI state
	let viewMode = $state<'room' | 'trainer'>('room');
	let selectedRoomId = $state(0);
	let selectedTrainerId = $state(0);
	let showDatePicker = $state(false);

	// Initialize selectedRoomId when rooms data is available
	$effect(() => {
		if (rooms.length > 0 && selectedRoomId === 0) {
			selectedRoomId = rooms[0].id;
		}
	});

	// Initialize selectedTrainerId when trainers data is available
	$effect(() => {
		if (trainers.length > 0 && selectedTrainerId === 0) {
			selectedTrainerId = trainers[0].id;
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
	let selectedRescheduleSlot = $state<{ roomId: number; day: DayOfWeek; hour: number } | null>(
		null
	);

	let selectedAppointment = $state<AppointmentWithDetails | null>(null);
	let formLoading = $state(false);

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

	// Constants for day mapping
	function calculateDateForDayHour(day: DayOfWeek): string {
		const weekStart = currentWeekStart();
		const targetDate = getDateForDayOfWeek(weekStart, day);
		return formatDateParam(targetDate);
	}

	function createAppointmentDetails(
		appointment: AppointmentWithRelations,
		roomName?: string | null,
		trainerName?: string | null
	): AppointmentWithDetails {
		return {
			// Database fields - use direct values from Appointment
			id: appointment.id,
			room_id: appointment.room_id,
			trainer_id: appointment.trainer_id,
			package_id: appointment.package_id,
			hour: appointment.hour,
			status: appointment.status || 'scheduled',
			appointment_date: appointment.appointment_date,
			session_number: appointment.session_number,
			total_sessions: appointment.total_sessions,
			notes: appointment.notes,
			created_at: appointment.created_at,
			updated_at: appointment.updated_at,
			created_by: appointment.created_by,
			series_id: appointment.series_id,
			// Extended fields using relation data
			room_name: roomName || appointment.pe_rooms?.name || '',
			trainer_name: trainerName || appointment.pe_trainers?.name || '',
			package_name: appointment.pe_packages?.name || '',
			trainee_names:
				appointment.pe_appointment_trainees?.map(
					(at: { pe_trainees: { name: string } }) => at.pe_trainees.name
				) || [],
			trainee_count: appointment.pe_appointment_trainees?.length || 0
		};
	}

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
	}

	function handleRescheduleSlotClick(roomId: number, day: DayOfWeek, hour: number) {
		if (!rescheduleMode || !selectedAppointment) return;

		selectedRescheduleSlot = { roomId, day, hour };
		showRescheduleConfirmation = true;
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
		// Use the appointment_date if available, otherwise fallback to current week calculation
		if (appointment.appointment_date) {
			const appointmentDateTime = new SvelteDate(appointment.appointment_date);
			appointmentDateTime.setHours(appointment.hour, 0, 0, 0);
			return appointmentDateTime < now;
		}

		// Fallback: derive day from appointment_date if needed
		return false;
	}

	// Check if an appointment can be rescheduled based on user role and package settings
	function canRescheduleAppointment(appointment: AppointmentWithDetails): boolean {
		// First check if appointment is in the past - no one can reschedule past appointments
		if (isAppointmentInPast(appointment)) {
			return false;
		}

		// Check if the package allows rescheduling
		if (!appointment.package_id) {
			return false; // Legacy appointments without packages cannot be rescheduled
		}

		// Check if the package is reschedulable (data comes from server)
		// The pe_packages data is loaded in the appointment query
		const packageData = (appointment as AppointmentWithRelations).pe_packages;
		if (packageData && packageData.reschedulable === false) {
			return false; // Package doesn't allow rescheduling
		}

		// Calculate time until appointment
		const now = new SvelteDate();
		let appointmentDateTime: SvelteDate;

		if (appointment.appointment_date) {
			appointmentDateTime = new SvelteDate(appointment.appointment_date);
			appointmentDateTime.setHours(appointment.hour, 0, 0, 0);
		} else {
			// Fallback: this shouldn't happen with new appointments
			return false;
		}

		const hoursUntil = (appointmentDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

		// Admin can reschedule until the appointment starts (but not after)
		if (data.userRole === 'admin') {
			return hoursUntil > 0;
		}

		// Coordinator can only reschedule if there are 23+ hours until the appointment
		if (data.userRole === 'coordinator') {
			return hoursUntil >= 23;
		}

		return false;
	}

	// Check if we're viewing the current week
	const isCurrentWeek = $derived(() => {
		const now = getWeekStart(new Date());
		return currentWeekStart().getTime() === now.getTime();
	});

	// Build schedule grid for selected room or trainer
	const scheduleGrid = $derived(() => {
		const grid: ScheduleGrid = {};

		if (viewMode === 'room') {
			const selectedRoom = rooms.find((r) => r.id === selectedRoomId);
			if (!selectedRoom) return grid;

			grid[selectedRoom.id] = {
				room_name: selectedRoom.name || '',
				slots: {}
			};

			DAYS_OF_WEEK.forEach((day) => {
				grid[selectedRoom.id].slots[day] = {};

				SCHEDULE_HOURS.forEach((hour) => {
					const dateString = calculateDateForDayHour(day);
					const appointment = appointments.find(
						(apt) =>
							apt.room_id === selectedRoom.id &&
							apt.appointment_date === dateString &&
							apt.hour === hour &&
							apt.status === 'scheduled'
					);

					grid[selectedRoom.id].slots[day][hour] = {
						room_id: selectedRoom.id,
						room_name: selectedRoom.name || '',
						hour,
						is_available: true,
						appointment: appointment
							? createAppointmentDetails(appointment, selectedRoom.name)
							: undefined
					};
				});
			});
		} else {
			const selectedTrainer = trainers.find((t) => t.id === selectedTrainerId);
			if (!selectedTrainer) return grid;

			grid[selectedTrainer.id] = {
				room_name: selectedTrainer.name || '',
				slots: {}
			};

			DAYS_OF_WEEK.forEach((day) => {
				grid[selectedTrainer.id].slots[day] = {};

				SCHEDULE_HOURS.forEach((hour) => {
					const dateString = calculateDateForDayHour(day);
					const appointment = appointments.find(
						(apt) =>
							apt.trainer_id === selectedTrainer.id &&
							apt.appointment_date === dateString &&
							apt.hour === hour &&
							apt.status === 'scheduled'
					);

					grid[selectedTrainer.id].slots[day][hour] = {
						room_id: selectedTrainer.id,
						room_name: selectedTrainer.name || '',
						hour,
						is_available: true,
						appointment: appointment
							? createAppointmentDetails(appointment, undefined, selectedTrainer.name)
							: undefined
					};
				});
			});
		}

		return grid;
	});
</script>

<div class="space-y-6">
	<div class="px-6 pt-6">
		<div class="flex md:items-center justify-between flex-col md:flex-row">
			<PageHeader title="Haftalık Program" />

			<div class="flex items-start gap-4">
				<!-- View Mode Selector -->
				<div class="form-control flex flex-col">
					<div class="label">
						<span class="label-text font-semibold">Görünüm</span>
					</div>
					<div class="join">
						<button
							class="btn btn-sm md:btn-md join-item"
							class:btn-primary={viewMode === 'room'}
							class:btn-outline={viewMode !== 'room'}
							onclick={() => (viewMode = 'room')}
						>
							Oda
						</button>
						<button
							class="btn btn-sm md:btn-md join-item"
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
							{#each rooms as room (room.id)}
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
							{#each trainers as trainer (trainer.id)}
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
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body">
					<div class="mb-4 flex items-center justify-between">
						<h2 class="card-title text-xl">
							{#if viewMode === 'room'}
								<span class="mr-2 badge badge-sm badge-primary">Oda</span>
							{:else}
								<span class="mr-2 badge badge-sm badge-info">Eğitmen</span>
							{/if}
							{selectedEntity.name}
						</h2>

						{#if rescheduleMode && selectedAppointment}
							<div class="flex items-center gap-3">
								<div class="alert alert-info px-3 py-2">
									<div class="text-sm">
										<strong>Erteleme Modu:</strong>
										{selectedAppointment.trainer_name} - {selectedAppointment.package_name}
									</div>
								</div>
								<button class="btn btn-sm btn-error" onclick={cancelReschedule}> İptal </button>
							</div>
						{/if}
					</div>

					<div class="overflow-x-auto">
						<table class="table table-xs md:table-fixed">
							<thead>
								<tr>
									<th class="sticky left-0 w-20 bg-base-100">Saat</th>
									{#each DAYS_OF_WEEK as day (day)}
										{@const dayDate = getDateForDayOfWeek(currentWeekStart(), day)}
										<th class="min-w-28 text-center md:w-[calc((100%-5rem)/7)]">
											<div class="text-xs text-base-content/60">{formatDayMonth(dayDate)}</div>
											<div class="font-semibold">{DAY_NAMES[day]}</div>
										</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each SCHEDULE_HOURS as hour (hour)}
									<tr>
										<td class="sticky left-0 bg-base-100 text-sm font-semibold">
											{getTimeRangeString(hour)}
										</td>
										{#each DAYS_OF_WEEK as day (day)}
											{@const entityId = viewMode === 'room' ? selectedRoomId : selectedTrainerId}
											{@const slot = scheduleGrid()[entityId]?.slots[day]?.[hour]}
											<td class="p-1 text-center">
												{#if true}
													{@const isPast = isSlotInPast(day, hour)}
													{@const isWithin23Hours = isSlotWithin23Hours(day, hour)}
													{@const isRescheduleRestricted = rescheduleMode && isWithin23Hours}
													{@const canSelectForReschedule =
														rescheduleMode &&
														!isPast &&
														!isRescheduleRestricted &&
														!slot?.appointment}

													{#if slot?.appointment}
														{@const isBeingRescheduled =
															rescheduleMode &&
															selectedAppointment &&
															slot.appointment.id === selectedAppointment.id}
														<button
															class="min-h-12 w-full cursor-pointer rounded p-2 text-xs transition-colors hover:opacity-80 {isBeingRescheduled
																? 'border-2 border-dashed border-warning bg-warning/20 text-warning-content'
																: ''}"
															class:bg-primary={viewMode === 'room' && !isBeingRescheduled}
															class:text-primary-content={viewMode === 'room' &&
																!isBeingRescheduled}
															class:bg-info={viewMode === 'trainer' && !isBeingRescheduled}
															class:text-info-content={viewMode === 'trainer' &&
																!isBeingRescheduled}
															onclick={() =>
																slot.appointment && openAppointmentDetails(slot.appointment)}
														>
															<div class="truncate font-semibold">
																{#if viewMode === 'room'}
																	{slot.appointment.trainer_name}
																{:else}
																	{slot.appointment.room_name}
																{/if}
															</div>
															<div class="truncate text-primary-content/80">
																{slot.appointment.trainee_count} öğrenci
															</div>
															{#if slot.appointment.package_name}
																<div class="truncate text-xs text-primary-content/70">
																	{slot.appointment.package_name}
																</div>
															{/if}
														</button>
													{:else if isPast}
														<div
															class="flex min-h-12 items-center justify-center rounded bg-base-300 p-2 text-base-content/40"
														>
															<span class="text-xs">-</span>
														</div>
													{:else if slot?.is_available}
														{#if rescheduleMode}
															{#if canSelectForReschedule}
																<button
																	class="group flex min-h-12 w-full cursor-pointer items-center justify-center rounded bg-success/20 p-2 transition-colors hover:bg-success/30"
																	onclick={() => handleRescheduleSlotClick(entityId, day, hour)}
																>
																	<span class="text-xs text-success group-hover:hidden">Seç</span>
																	<!-- Plus button removed - use /new-assignment for appointment creation -->
																</button>
															{:else if isRescheduleRestricted}
																<div
																	class="flex min-h-12 items-center justify-center rounded bg-warning/20 p-2 text-warning"
																>
																	<span class="text-xs">23s</span>
																</div>
															{:else}
																<div
																	class="flex min-h-12 items-center justify-center rounded bg-base-200 p-2 text-base-content/40"
																>
																	<span class="text-xs">Müsait</span>
																</div>
															{/if}
														{:else}
															<div
																class="flex min-h-12 items-center justify-center rounded bg-base-200 p-2 text-base-content/40"
															>
																<span class="text-xs">Müsait</span>
															</div>
														{/if}
													{:else}
														<div
															class="flex min-h-12 items-center justify-center rounded bg-error/20 p-2 text-error"
														>
															<span class="text-xs">Kapalı</span>
														</div>
													{/if}
												{/if}
											</td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</div>

<!-- Appointment Details Modal -->
<dialog class="modal" class:modal-open={showAppointmentDetailsModal}>
	<div class="modal-box max-w-lg">
		<h3 class="mb-4 text-lg font-bold">Randevu Detayları</h3>

		{#if selectedAppointment}
			<div class="space-y-4">
				<!-- Time and Room Info -->
				<div class="card bg-base-200">
					<div class="card-body p-4">
						<div class="grid grid-cols-2 gap-2 text-sm">
							<div><strong>Oda:</strong> {selectedAppointment.room_name}</div>
							<div>
								<strong>Gün:</strong>
								{selectedAppointment.appointment_date
									? DAY_NAMES[
											getDayOfWeekFromDate(selectedAppointment.appointment_date) as DayOfWeek
										]
									: '-'}
							</div>
							<div><strong>Saat:</strong> {getTimeRangeString(selectedAppointment.hour)}</div>
							<div>
								<strong>Durum:</strong>
								<span
									class="badge badge-sm {selectedAppointment.status === 'scheduled'
										? 'badge-success'
										: selectedAppointment.status === 'completed'
											? 'badge-info'
											: 'badge-error'}"
								>
									{selectedAppointment.status === 'scheduled'
										? 'Planlandı'
										: selectedAppointment.status === 'completed'
											? 'Tamamlandı'
											: 'İptal Edildi'}
								</span>
							</div>
						</div>
					</div>
				</div>

				<!-- Trainer Info -->
				<div>
					<h4 class="mb-2 text-base font-semibold">Eğitmen</h4>
					<div class="badge badge-info">{selectedAppointment.trainer_name}</div>
				</div>

				<!-- Package Info -->
				<div>
					<h4 class="mb-2 text-base font-semibold">Ders</h4>
					<div class="badge badge-accent">
						{selectedAppointment.package_name || 'Ders Bilgisi Yok'}
					</div>
				</div>

				<!-- Trainees -->
				<div>
					<h4 class="mb-2 text-base font-semibold">
						Öğrenciler ({selectedAppointment.trainee_count})
					</h4>
					<div class="flex flex-wrap gap-2">
						{#each selectedAppointment.trainee_names || [] as traineeName, index (traineeName + index)}
							<div class="badge badge-success">{traineeName}</div>
						{/each}
					</div>
				</div>

				<!-- Notes -->
				{#if selectedAppointment.notes}
					<div>
						<h4 class="mb-2 text-base font-semibold">Notlar</h4>
						<div class="rounded bg-base-200 p-3 text-sm text-base-content/70">
							{selectedAppointment.notes}
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<div class="modal-action">
			{#if selectedAppointment && selectedAppointment.status === 'scheduled' && canRescheduleAppointment(selectedAppointment)}
				<button
					type="button"
					class="btn btn-warning"
					onclick={() => selectedAppointment && openRescheduleModal(selectedAppointment)}
				>
					Ertele
				</button>
			{/if}
			<button
				type="button"
				class="btn"
				onclick={() => {
					showAppointmentDetailsModal = false;
					selectedAppointment = null;
				}}
			>
				Kapat
			</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button
			onclick={() => {
				showAppointmentDetailsModal = false;
				selectedAppointment = null;
			}}>kapat</button
		>
	</form>
</dialog>

<!-- Reschedule Confirmation Modal -->
<dialog class="modal" class:modal-open={showRescheduleConfirmation}>
	<div class="modal-box max-w-lg">
		<h3 class="mb-4 text-lg font-bold">Randevuyu Ertele</h3>

		{#if selectedAppointment && selectedRescheduleSlot}
			{@const newRoomName = rooms.find((r) => r.id === selectedRescheduleSlot?.roomId)?.name}

			<div class="space-y-4">
				<!-- Current appointment info -->
				<div class="rounded bg-base-200 p-4">
					<h4 class="mb-2 text-sm font-semibold">Mevcut Randevu</h4>
					<div class="grid grid-cols-2 gap-2 text-sm">
						<div><strong>Oda:</strong> {selectedAppointment.room_name}</div>
						<div><strong>Eğitmen:</strong> {selectedAppointment.trainer_name}</div>
						<div>
							<strong>Gün:</strong>
							{selectedAppointment.appointment_date
								? DAY_NAMES[getDayOfWeekFromDate(selectedAppointment.appointment_date) as DayOfWeek]
								: '-'}
						</div>
						<div><strong>Saat:</strong> {getTimeRangeString(selectedAppointment.hour)}</div>
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

				<!-- New appointment info -->
				<div class="rounded bg-success/10 p-4">
					<h4 class="mb-2 text-sm font-semibold text-success">Yeni Randevu</h4>
					<div class="grid grid-cols-2 gap-2 text-sm">
						<div><strong>Oda:</strong> {newRoomName}</div>
						<div><strong>Eğitmen:</strong> {selectedAppointment.trainer_name}</div>
						<div><strong>Gün:</strong> {DAY_NAMES[selectedRescheduleSlot.day]}</div>
						<div><strong>Saat:</strong> {getTimeRangeString(selectedRescheduleSlot.hour)}</div>
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
						<legend class="fieldset-legend">Erteleme Sebebi (İsteğe bağlı)</legend>
						<textarea
							name="reason"
							class="textarea-bordered textarea w-full"
							placeholder="Randevu erteleme sebebini açıklayın..."
							rows="2"
						></textarea>
					</fieldset>

					<div class="modal-action">
						<button
							type="button"
							class="btn"
							onclick={() => {
								showRescheduleConfirmation = false;
								selectedRescheduleSlot = null;
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
	</div>
	<form method="dialog" class="modal-backdrop">
		<button
			onclick={() => {
				showRescheduleConfirmation = false;
				selectedRescheduleSlot = null;
			}}>kapat</button
		>
	</form>
</dialog>
