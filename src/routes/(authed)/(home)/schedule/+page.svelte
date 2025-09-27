<script lang="ts">
	import type { PageData } from './$types';
	import type { ActionResult } from '@sveltejs/kit';
	import PageHeader from '$lib/components/page-header.svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import ClockAlert from '@lucide/svelte/icons/clock-alert';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { SvelteDate } from 'svelte/reactivity';
	import type {
		ScheduleGrid,
		DayOfWeek,
		AppointmentWithDetails,
		AppointmentWithRelations,
		TimeSlotPattern,
		ExtensionConflict
	} from '$lib/types/Schedule';
	import { DAYS_OF_WEEK, DAY_NAMES, SCHEDULE_HOURS, getTimeRangeString } from '$lib/types/Schedule';
	import {
		getWeekStart,
		formatWeekRange,
		formatDateParam,
		getDateForDayOfWeek,
		formatDayMonth,
		getDayOfWeekFromDate,
		TURKISH_DAYS
	} from '$lib/utils/date-utils';
	import { getActionErrorMessage } from '$lib/utils/form-utils';
	import { page } from '$app/state';
	import Modal from '$lib/components/modal.svelte';

	const { data, form }: { data: PageData; form: ActionResult } = $props();

	// Extract data reactively
	let appointments = $derived(data.appointments as AppointmentWithRelations[]);
	let allAppointments = $derived(data.allAppointments as AppointmentWithRelations[]);
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
			const sortedRooms = rooms.toSorted((a, b) => a.id - b.id);
			selectedRoomId = sortedRooms[0].id;
		}
	});

	// Initialize selectedTrainerId when trainers data is available
	$effect(() => {
		if (trainers.length > 0 && selectedTrainerId === 0) {
			const sortedTrainers = trainers.toSorted((a, b) => a.id - b.id);
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
	let selectedRescheduleSlot = $state<{ roomId: number; day: DayOfWeek; hour: number } | null>(
		null
	);

	let selectedAppointment = $state<AppointmentWithDetails | null>(null);
	let formLoading = $state(false);

	// Extension modal state
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
		const purchase = appointment.pe_purchases;
		return {
			// Database fields - use values from appointment and purchase
			id: appointment.id,
			room_id: purchase?.room_id || 0,
			trainer_id: purchase?.trainer_id || 0,
			purchase_id: appointment.purchase_id!,
			hour: appointment.hour,
			status: appointment.status || 'scheduled',
			appointment_date: appointment.appointment_date,
			session_number: appointment.session_number,
			total_sessions: appointment.total_sessions,
			notes: appointment.notes,
			series_id: appointment.series_id,
			// Extended fields using relation data
			room_name: roomName || purchase?.pe_rooms?.name || '',
			trainer_name: trainerName || purchase?.pe_trainers?.name || '',
			package_name: purchase?.pe_packages?.name || '',
			trainee_names:
				purchase?.pe_purchase_trainees?.map((pt: { pe_trainees: { name: string } }) => pt.pe_trainees.name) ||
				[],
			trainee_count: purchase?.pe_purchase_trainees?.length || 0,
			reschedule_left: purchase?.reschedule_left ?? 0,
			package_start_date: purchase?.start_date,
			package_end_date: purchase?.end_date
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
		// Don't reset selectedAppointment when closing the details modal for reschedule
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
		// Use the appointment_date if available, otherwise fallback to current week calculation
		if (appointment.appointment_date) {
			const appointmentDateTime = new SvelteDate(appointment.appointment_date);
			appointmentDateTime.setHours(appointment.hour, 0, 0, 0);
			return appointmentDateTime < now;
		}

		// Fallback: derive day from appointment_date if needed
		return false;
	}

	// Check if an appointment can be rescheduled based on user role and reschedule limits
	function canRescheduleAppointment(appointment: AppointmentWithDetails): boolean {
		// Rule 1: Past appointments are never reschedulable
		if (isAppointmentInPast(appointment)) {
			return false;
		}

		// Check if the package group has reschedules remaining
		if (!appointment.purchase_id || (appointment.reschedule_left ?? 0) <= 0) {
			return false; // No reschedules left
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

		// Rule 3: Admin can reschedule any future appointment if reschedules are available
		if (data.userRole === 'admin') {
			return hoursUntil > 0;
		}

		// Rule 4: Coordinator can only reschedule if there are reschedules left AND there are 23+ hours until appointment
		if (data.userRole === 'coordinator') {
			return hoursUntil >= 23;
		}

		return false;
	}

	// Check if an appointment is the last session and can be extended
	function isLastSessionAndExtendable(appointment: AppointmentWithDetails): boolean {
		// First check if this is the last session of its package
		const isLastSession = (
			appointment.session_number === appointment.total_sessions &&
			appointment.total_sessions !== null &&
			appointment.total_sessions !== undefined &&
			appointment.total_sessions > 1
		);

		// Only show "Son ders" if it's the last session AND this package is the latest in the extension chain
		return isLastSession && isLatestInExtensionChain(appointment);
	}

	// Check if an appointment belongs to a private package that can be extended
	function isPrivatePackage(appointment: AppointmentWithDetails): boolean {
		// Private packages have a finite total_sessions, group packages have null total_sessions
		const isPrivate =
			appointment.total_sessions !== null &&
			appointment.total_sessions !== undefined &&
			appointment.total_sessions > 0;

		if (!isPrivate) return false;

		// Check if this package is the latest in the extension chain (no successor)
		return isLatestInExtensionChain(appointment);
	}

	// Check if the appointment belongs to the latest package in an extension chain
	function isLatestInExtensionChain(appointment: AppointmentWithDetails): boolean {
		if (!appointment.purchase_id) return false;

		// Find the appointment's purchase in the loaded data
		const purchase = appointments.find(
			(apt) => apt.purchase_id === appointment.purchase_id
		)?.pe_purchases;

		// If no successor_id, this is the latest package in the chain
		return purchase?.successor_id === null || purchase?.successor_id === undefined;
	}

	// Open extension modal
	function openExtensionModal(appointment: AppointmentWithDetails) {
		selectedAppointment = appointment;
		showExtensionModal = true;
		additionalPackages = 1; // Reset to default
		extensionLoading = false; // Reset loading state
	}

	// Get package chain information (current package + all successors)
	function getPackageChain(appointment: AppointmentWithDetails) {
		const chain = [];
		let currentPurchaseId: number | null = appointment.purchase_id;

		while (currentPurchaseId) {
			const purchase = appointments.find(
				(apt) => apt.purchase_id === currentPurchaseId
			)?.pe_purchases;

			if (purchase) {
				chain.push({
					id: purchase.id,
					start_date: purchase.start_date,
					end_date: purchase.end_date,
					successor_id: purchase.successor_id
				});
				currentPurchaseId = purchase.successor_id;
			} else {
				break;
			}
		}

		return chain;
	}

	// Calculate extension date ranges
	function calculateExtensionRanges(appointment: AppointmentWithDetails, packageCount: number) {
		const packageInfo = appointments.find(
			(apt) => apt.purchase_id === appointment.purchase_id
		)?.pe_purchases?.pe_packages;

		if (!packageInfo || !('weeks_duration' in packageInfo) || !packageInfo.weeks_duration)
			return [];

		const chain = getPackageChain(appointment);
		const lastPackage = chain[chain.length - 1];
		if (!lastPackage?.end_date) return [];

		const lastEndDate = new SvelteDate(lastPackage.end_date);
		const weeksDuration = packageInfo.weeks_duration as number;

		const ranges = [];
		for (let i = 0; i < packageCount; i++) {
			const startDate = new SvelteDate(lastEndDate.getTime());
			startDate.setDate(lastEndDate.getDate() + 1 + i * weeksDuration * 7);

			const endDate = new SvelteDate(startDate.getTime());
			endDate.setDate(startDate.getDate() + weeksDuration * 7 - 1);

			ranges.push({
				start: startDate.toISOString().split('T')[0],
				end: endDate.toISOString().split('T')[0]
			});
		}

		return ranges;
	}

	// Check for conflicts in extension ranges
	function checkExtensionConflicts(
		appointment: AppointmentWithDetails,
		packageCount: number
	): ExtensionConflict[] {
		const purchase = appointments.find(
			(apt) => apt.purchase_id === appointment.purchase_id
		)?.pe_purchases;

		if (!purchase || !('time_slots' in purchase) || !purchase.time_slots) return [];

		const ranges = calculateExtensionRanges(appointment, packageCount);
		const timeSlots = purchase.time_slots as TimeSlotPattern[];
		const conflicts: ExtensionConflict[] = [];

		// Get room and trainer IDs
		const roomId = purchase.room_id;
		const trainerId = purchase.trainer_id;

		if (!roomId || !trainerId) return [];

		for (const range of ranges) {
			const rangeConflicts = [];
			const startDate = new SvelteDate(range.start);
			const endDate = new SvelteDate(range.end);

			// Check each time slot for conflicts
			for (const slot of timeSlots) {
				// Generate all appointment dates for this slot within the range
				let checkDate = new SvelteDate(startDate.getTime());

				while (checkDate <= endDate) {
					// Calculate the actual date for this day of week
					const dayNames = [
						'sunday',
						'monday',
						'tuesday',
						'wednesday',
						'thursday',
						'friday',
						'saturday'
					];
					const targetDayIndex = dayNames.indexOf(slot.day);
					const currentDayIndex = checkDate.getDay();
					const daysToAdd = (targetDayIndex - currentDayIndex + 7) % 7;

					const appointmentDate = new SvelteDate(checkDate.getTime());
					appointmentDate.setDate(checkDate.getDate() + daysToAdd);

					// Only check if the appointment date is within our range
					if (appointmentDate >= startDate && appointmentDate <= endDate) {
						const dateStr = appointmentDate.toISOString().split('T')[0];

						// Check for conflicts with existing appointments
						const hasConflict = allAppointments.some((apt) => {
							if (!apt.appointment_date || apt.status !== 'scheduled') return false;
							if (apt.appointment_date !== dateStr || apt.hour !== slot.hour) return false;

							// Check room and trainer conflicts
							const existingRoomId = apt.pe_purchases?.room_id;
							const existingTrainerId = apt.pe_purchases?.trainer_id;

							return existingRoomId === roomId || existingTrainerId === trainerId;
						});

						if (hasConflict) {
							rangeConflicts.push({
								date: dateStr,
								hour: slot.hour,
								day: slot.day
							});
						}
					}

					// Move to next week
					checkDate.setDate(checkDate.getDate() + 7);
				}
			}

			if (rangeConflicts.length > 0) {
				conflicts.push({
					packageIndex: ranges.indexOf(range),
					range: range,
					conflicts: rangeConflicts
				});
			}
		}

		return conflicts;
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
							apt.pe_purchases?.room_id === selectedRoom.id &&
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
							apt.pe_purchases?.trainer_id === selectedTrainer.id &&
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
							{#each rooms.toSorted((a, b) => a.id - b.id) as room (room.id)}
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
							{#each trainers.toSorted((a, b) => a.id - b.id) as trainer (trainer.id)}
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
															class="min-h-12 w-full rounded p-2 text-xs transition-colors {isBeingRescheduled
																? 'border-2 border-dashed border-warning bg-warning/20 text-warning-content'
																: ''} {rescheduleMode
																? 'cursor-default'
																: 'cursor-pointer hover:opacity-80'}"
															class:bg-primary={viewMode === 'room' && !isBeingRescheduled}
															class:text-primary-content={viewMode === 'room' &&
																!isBeingRescheduled}
															class:bg-info={viewMode === 'trainer' && !isBeingRescheduled}
															class:text-info-content={viewMode === 'trainer' &&
																!isBeingRescheduled}
															onclick={() =>
																slot.appointment &&
																!rescheduleMode &&
																openAppointmentDetails(slot.appointment)}
														>
															<div class="truncate font-semibold">
																{#if viewMode === 'room'}
																	{slot.appointment.trainer_name}
																{:else}
																	{slot.appointment.room_name}
																{/if}
															</div>
															{#if slot.appointment.package_name}
																<div class="truncate text-xs text-primary-content/70">
																	{slot.appointment.package_name}
																</div>
															{/if}
															{#if isLastSessionAndExtendable(slot.appointment)}
																<div
																	class="flex items-center justify-center gap-1 text-xs font-semibold"
																>
																	<ClockAlert size={12} />
																	<span>Son ders</span>
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
																	<span class="text-xs text-success">Seç</span>
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
			{#if selectedAppointment && isPrivatePackage(selectedAppointment)}
				<button
					type="button"
					class="btn btn-sm btn-warning"
					onclick={() => openExtensionModal(selectedAppointment!)}
				>
					Paketi uzat
				</button>
			{/if}
		</div>
	{/snippet}
	{#if selectedAppointment}
		<div class="space-y-4">
			<!-- Extension Alert Strip -->
			{#if isLastSessionAndExtendable(selectedAppointment)}
				<div class="alert alert-warning p-3">
					<div class="flex items-center gap-2">
						<ClockAlert size={16} />
						<span class="text-sm font-medium">Bu paketin son dersi</span>
					</div>
				</div>
			{/if}

			<!-- Time and Room Info -->
			<div class="card bg-base-200">
				<div class="card-body p-4">
					<div class="grid grid-cols-2 gap-2 text-sm">
						<div><strong>Oda:</strong> {selectedAppointment.room_name}</div>
						<div>
							<strong>Gün:</strong>
							{selectedAppointment.appointment_date
								? DAY_NAMES[getDayOfWeekFromDate(selectedAppointment.appointment_date) as DayOfWeek]
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
				<div class="space-y-2">
					<div class="badge badge-accent">
						{selectedAppointment.package_name || 'Ders Bilgisi Yok'}
					</div>
					{#if selectedAppointment.package_start_date}
						<div class="text-sm text-base-content/70">
							<strong>Başlangıç:</strong>
							{formatDayMonth(new Date(selectedAppointment.package_start_date))}
							{#if selectedAppointment.package_end_date}
								<br />
								<strong>Bitiş:</strong>
								{formatDayMonth(new Date(selectedAppointment.package_end_date))}
							{:else}
								<br />
								<strong>Bitiş:</strong> <span class="text-info">Devamlı</span>
							{/if}
						</div>
					{/if}
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
				{#if (selectedAppointment.reschedule_left ?? 0) >= 999}
					Ertele
				{:else}
					Ertele ({selectedAppointment.reschedule_left} kaldı)
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
	title="Randevuyu Ertele"
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
							{#if selectedAppointment.appointment_date}
								{@const currentDate = new Date(selectedAppointment.appointment_date)}
								<div class="text-xs text-base-content/60">
									{formatDayMonth(currentDate)}
								</div>
								<div class="font-semibold">
									{DAY_NAMES[
										getDayOfWeekFromDate(selectedAppointment.appointment_date) as DayOfWeek
									]}
								</div>
							{:else}
								<div class="font-semibold">-</div>
							{/if}
							<div class="text-xs text-base-content/70">
								{getTimeRangeString(selectedAppointment.hour)}
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

<!-- Extension Modal -->
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

			{#if selectedAppointment}
				{@const packageInfo = appointments.find(
					(apt) => apt.purchase_id === selectedAppointment!.purchase_id
				)?.pe_purchases?.pe_packages}
				{@const packageChain = getPackageChain(selectedAppointment)}
				{@const extensionRanges = calculateExtensionRanges(selectedAppointment, additionalPackages)}
				{@const extensionConflicts = checkExtensionConflicts(
					selectedAppointment,
					additionalPackages
				)}

				<!-- Package Summary -->
				<div class="rounded-lg border border-base-300 bg-base-100 p-4">
					<div class="mb-3 flex items-center gap-3">
						<div class="flex h-8 w-8 items-center justify-center rounded-full bg-base-300">
							<span class="text-sm font-semibold">{packageChain.length}</span>
						</div>
						<div>
							<h4 class="font-medium">{selectedAppointment.package_name}</h4>
							{#if packageInfo}
								<p class="text-sm text-base-content/60">
									{packageInfo.weeks_duration ?? 0} hafta • Haftada {packageInfo.lessons_per_week ?? 0} ders
								</p>
							{/if}
						</div>
					</div>
					<div class="text-sm text-base-content/70">
						<span>{selectedAppointment.trainee_names?.join(', ')}</span>
						<span class="mx-2">•</span>
						<span>{selectedAppointment.trainer_name}</span>
						<span class="mx-2">•</span>
						<span>{selectedAppointment.room_name}</span>
					</div>
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
					{#if packageInfo}
						<div class="label pt-1">
							<span class="label-text-alt text-base-content/50">
								Her paket {packageInfo.weeks_duration ?? 0} hafta, haftada {packageInfo.lessons_per_week ?? 0} ders
							</span>
						</div>
					{/if}
				</div>

				<!-- Timeline -->
				<div class="space-y-3">
					<h5 class="text-sm font-medium tracking-wide text-base-content/70 uppercase">
						Paket Zinciri
					</h5>
					<div class="space-y-2">
						<!-- Existing packages -->
						{#each packageChain as pkg, index (pkg.id)}
							<div class="flex items-center gap-3 rounded-lg border border-base-300 p-3">
								<div class="flex h-6 w-6 items-center justify-center rounded-full bg-base-300">
									<span class="text-xs font-medium">{index + 1}</span>
								</div>
								<div class="flex-1">
									<span class="text-sm font-medium">Mevcut paket</span>
								</div>
								<span class="font-mono text-sm text-base-content/60">
									{formatDayMonth(new Date(pkg.start_date))} - {formatDayMonth(
										new Date(pkg.end_date!)
									)}
								</span>
							</div>
						{/each}

						<!-- New packages -->
						{#if extensionRanges.length > 0}
							{#each extensionRanges as range, index (range.start)}
								<div
									class="flex items-center gap-3 rounded-lg border border-success/30 bg-success/10 p-3"
								>
									<div class="flex h-6 w-6 items-center justify-center rounded-full bg-success/20">
										<span class="text-xs font-medium text-success"
											>{packageChain.length + index + 1}</span
										>
									</div>
									<div class="flex-1">
										<span class="text-sm font-medium text-success">Yeni paket</span>
									</div>
									<span class="font-mono text-sm text-success">
										{formatDayMonth(new Date(range.start))} - {formatDayMonth(new Date(range.end))}
									</span>
								</div>
							{/each}
						{/if}
					</div>
				</div>

				<!-- Conflict Warning -->
				{#if extensionConflicts.length > 0}
					<div class="rounded-lg border border-error/30 bg-error/10 p-4">
						<div class="space-y-3">
							<div class="flex items-center gap-2">
								<div class="flex h-5 w-5 items-center justify-center rounded-full bg-error/20">
									<span class="text-xs font-bold text-error">!</span>
								</div>
								<h5 class="font-medium text-error">Çakışma Tespit Edildi</h5>
							</div>
							<div class="text-sm text-error/80">
								Pakette yer alan oda veya eğitmen, aşağıdaki tarih ve saatlerde dolu. Paketi
								uzatmanız için ya çakışan randevuları değiştirin, veya 'Yeni Kayıt' ekranından uygun
								başka saatler seçin.
							</div>
							<div class="space-y-1">
								{#each extensionConflicts as conflict (conflict.packageIndex)}
									{#each conflict.conflicts as conflictDetail (conflictDetail.date + conflictDetail.hour)}
										<div class="text-sm text-error/80">
											• {formatDayMonth(new Date(conflictDetail.date))} ({TURKISH_DAYS[
												[
													'sunday',
													'monday',
													'tuesday',
													'wednesday',
													'thursday',
													'friday',
													'saturday'
												].indexOf(conflictDetail.day)
											]}) saat {conflictDetail.hour}:00
										</div>
									{/each}
								{/each}
							</div>
						</div>
					</div>
				{/if}

				<!-- Summary -->
				{#if additionalPackages > 0}
					<div class="rounded-lg border border-success/30 bg-success/10 p-4">
						<div class="flex items-center justify-between">
							<span class="font-medium">Toplam uzatma</span>
							<span class="font-semibold text-success">
								{additionalPackages} paket
								{#if packageInfo}
									• {additionalPackages * (packageInfo.weeks_duration ?? 1)} hafta
								{/if}
							</span>
						</div>
					</div>
				{/if}

				<!-- Action Buttons -->
				<div class="modal-action">
					<button type="button" class="btn" onclick={() => (showExtensionModal = false)}
						>İptal</button
					>
					<button type="submit" class="btn btn-info" disabled={extensionConflicts.length > 0 || extensionLoading}>
						{#if extensionLoading}
							<LoaderCircle size={16} class="animate-spin" />
						{:else}
							{extensionConflicts.length > 0 ? 'Çakışma Var' : 'Uzat'}
						{/if}
					</button>
				</div>
			{/if}
		</form>
	{/if}
</Modal>
