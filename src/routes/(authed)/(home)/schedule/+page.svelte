<script lang="ts">
	import type { PageData } from './$types';
	import type { ActionResult } from '@sveltejs/kit';
	import PageHeader from '$lib/components/page-header.svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Plus from '@lucide/svelte/icons/plus';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import type { ScheduleGrid, DayOfWeek, AppointmentWithDetails } from '$lib/types/Schedule';
	import { DAYS_OF_WEEK, DAY_NAMES, SCHEDULE_HOURS, getTimeRangeString } from '$lib/types/Schedule';
	import {
		getWeekStart,
		formatWeekRange,
		formatDateParam,
		getDateForDayOfWeek,
		formatDayMonth
	} from '$lib/utils/date-utils';
	import { getActionErrorMessage } from '$lib/utils/form-utils';
	import Combobox from '$lib/components/combobox.svelte';
	import { page } from '$app/state';

	const { data, form }: { data: PageData; form: ActionResult } = $props();

	// Extract data reactively
	let appointments = $derived(data.appointments);
	// Access inherited data from parent layout
	let rooms = $derived(data.rooms);
	let trainers = $derived(data.trainers);
	let trainings = $derived(data.trainings);
	let trainees = $derived(data.trainees);
	let roomTrainings = $derived(data.roomTrainings);
	let trainerTrainings = $derived(data.trainerTrainings);

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

	// Appointment modal state
	let showAddAppointmentModal = $state(false);
	let showAppointmentDetailsModal = $state(false);
	let selectedSlot = $state<{ roomId: number; day: DayOfWeek; hour: number } | null>(null);

	let selectedAppointment = $state<AppointmentWithDetails | null>(null);
	let formLoading = $state(false);

	// Form data
	let selectedTrainerIdForForm = $state<number | null>(null);
	let selectedTrainingId = $state<number | null>(null);
	let selectedTrainees = $state<typeof trainees>([]);
	let appointmentNotes = $state('');

	function navigateToWeek(date: Date) {
		const weekParam = formatDateParam(date);
		goto(`?week=${weekParam}`);
	}

	function goToPreviousWeek() {
		const newWeekStart = new Date(currentWeekStart());
		newWeekStart.setDate(newWeekStart.getDate() - 7);
		navigateToWeek(newWeekStart);
	}

	function goToNextWeek() {
		const newWeekStart = new Date(currentWeekStart());
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
	const DAY_MAPPING: Record<DayOfWeek, number> = {
		monday: 1,
		tuesday: 2,
		wednesday: 3,
		thursday: 4,
		friday: 5,
		saturday: 6,
		sunday: 0
	};

	function calculateDateForDayHour(day: DayOfWeek): string {
		const targetDate = new Date(currentWeekStart());
		const currentDay = targetDate.getDay();
		const targetDay = DAY_MAPPING[day];
		const daysToAdd = targetDay === 0 ? 7 - currentDay : targetDay - currentDay;
		targetDate.setDate(currentWeekStart().getDate() + daysToAdd);
		return targetDate.toISOString().split('T')[0];
	}

	function createAppointmentDetails(
		appointment: any,
		roomName?: string | null,
		trainerName?: string | null
	): AppointmentWithDetails {
		return {
			...appointment,
			status: appointment.status || 'scheduled',
			room_name: roomName || rooms.find((r) => r.id === appointment.room_id)?.name || '',
			trainer_name:
				trainerName || trainers.find((t) => t.id === appointment.trainer_id)?.name || '',
			training_name: trainings.find((tr) => tr.id === appointment.training_id)?.name || '',
			trainee_names:
				appointment.pe_appointment_trainees?.map(
					(at: { pe_trainees: { name: string } }) => at.pe_trainees.name
				) || [],
			trainee_count: appointment.pe_appointment_trainees?.length || 0
		};
	}

	function openAppointmentModal(entityId: number, day: DayOfWeek, hour: number) {
		// In trainer view, we need to use a room ID for the appointment, not trainer ID
		// We'll need to handle this in the modal by showing room selection
		const roomId = viewMode === 'room' ? entityId : 0; // Use 0 to indicate room needs to be selected
		selectedSlot = { roomId, day, hour };
		resetAppointmentForm();
		showAddAppointmentModal = true;
	}

	function openAppointmentDetails(appointment: AppointmentWithDetails) {
		selectedAppointment = appointment;
		showAppointmentDetailsModal = true;
	}

	function resetAppointmentForm() {
		selectedTrainerIdForForm = viewMode === 'trainer' ? selectedTrainerId : null;
		selectedTrainingId = null;
		selectedTrainees = [];
		appointmentNotes = '';
	}

	function handleTraineeSelect(trainee: (typeof trainees)[0]) {
		selectedTrainees = [...selectedTrainees, trainee];
	}

	function handleTraineeRemove(trainee: (typeof trainees)[0]) {
		selectedTrainees = selectedTrainees.filter((t) => t.id !== trainee.id);
	}

	// Get available trainings for selected room and trainer
	const availableTrainings = $derived(() => {
		if (!selectedSlot || !selectedTrainerIdForForm) return [];

		// Get trainings available for the selected room
		const roomTrainingIds = roomTrainings
			.filter((rt) => rt.room_id === selectedSlot?.roomId)
			.map((rt) => rt.training_id);

		// Get trainings available for the selected trainer
		const trainerTrainingIds = trainerTrainings
			.filter((tt) => tt.trainer_id === selectedTrainerIdForForm)
			.map((tt) => tt.training_id);

		// Find trainings that are available for both room and trainer
		const commonTrainingIds = roomTrainingIds.filter((id) => trainerTrainingIds.includes(id));

		const availableTrainingsForBoth = trainings.filter((training) =>
			commonTrainingIds.includes(training.id)
		);

		// Fallback hierarchy:
		// 1. If both room and trainer have specific trainings, show intersection
		// 2. If only room has specific trainings, show room trainings
		// 3. If only trainer has specific trainings, show trainer trainings
		// 4. If neither has specific trainings, show all trainings
		if (availableTrainingsForBoth.length > 0) {
			return availableTrainingsForBoth;
		} else if (roomTrainingIds.length > 0) {
			return trainings.filter((training) => roomTrainingIds.includes(training.id));
		} else if (trainerTrainingIds.length > 0) {
			return trainings.filter((training) => trainerTrainingIds.includes(training.id));
		} else {
			return trainings;
		}
	});

	// Get selected training details
	const selectedTraining = $derived(() => {
		return selectedTrainingId ? trainings.find((t) => t.id === selectedTrainingId) : null;
	});

	// Get available trainees (exclude already selected ones)
	const availableTrainees = $derived(() => {
		const selectedIds = selectedTrainees.map((t) => t.id);
		return trainees.filter((trainee) => !selectedIds.includes(trainee.id));
	});

	// Validate trainee count against training capacity
	const traineeCountValid = $derived(() => {
		const training = selectedTraining();
		if (!training) return selectedTrainees.length > 0;
		return (
			selectedTrainees.length >= training.min_capacity &&
			selectedTrainees.length <= training.max_capacity
		);
	});

	// Get capacity message
	const capacityMessage = $derived(() => {
		const training = selectedTraining();
		if (!training) return '';
		const min = training.min_capacity;
		const max = training.max_capacity;
		const current = selectedTrainees.length;

		if (current < min) {
			return `En az ${min} öğrenci seçmelisiniz (şu anda ${current})`;
		} else if (current > max) {
			return `En fazla ${max} öğrenci seçebilirsiniz (şu anda ${current})`;
		} else {
			return `${current}/${max} öğrenci seçildi`;
		}
	});

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
						day_of_week: day,
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
						day_of_week: day,
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
		<div class="flex items-center justify-between">
			<PageHeader title="Haftalık Program" />

			<div class="flex items-start gap-4">
				<!-- View Mode Selector -->
				<div class="form-control flex flex-col">
					<div class="label">
						<span class="label-text font-semibold">Görünüm</span>
					</div>
					<div class="join">
						<button
							class="btn join-item"
							class:btn-primary={viewMode === 'room'}
							class:btn-outline={viewMode !== 'room'}
							onclick={() => (viewMode = 'room')}
						>
							Oda
						</button>
						<button
							class="btn join-item"
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
							class="select-bordered select w-full max-w-xs"
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
							class="select-bordered select w-full max-w-xs"
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
					<h2 class="mb-4 card-title text-xl">
						{#if viewMode === 'room'}
							<span class="mr-2 badge badge-sm badge-primary">Oda</span>
						{:else}
							<span class="mr-2 badge badge-sm badge-info">Eğitmen</span>
						{/if}
						{selectedEntity.name}
					</h2>

					<div class="overflow-x-auto">
						<table class="table table-xs">
							<thead>
								<tr>
									<th class="sticky left-0 w-20 bg-base-100">Saat</th>
									{#each DAYS_OF_WEEK as day (day)}
										{@const dayDate = getDateForDayOfWeek(currentWeekStart(), day)}
										<th class="min-w-28 text-center">
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
												{#if slot?.appointment}
													<button
														class="min-h-12 w-full cursor-pointer rounded p-2 text-xs transition-colors hover:opacity-80"
														class:bg-primary={viewMode === 'room'}
														class:text-primary-content={viewMode === 'room'}
														class:bg-info={viewMode === 'trainer'}
														class:text-info-content={viewMode === 'trainer'}
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
														<div class="truncate opacity-80">
															{slot.appointment.trainee_count} öğrenci
														</div>
														{#if slot.appointment.training_name}
															<div class="truncate text-xs opacity-70">
																{slot.appointment.training_name}
															</div>
														{/if}
													</button>
												{:else if slot?.is_available}
													<button
														class="group flex min-h-12 w-full cursor-pointer items-center justify-center rounded bg-base-200 p-2 transition-colors hover:bg-base-300"
														onclick={() => openAppointmentModal(entityId, day, hour)}
													>
														<span class="text-xs text-base-content/40 group-hover:hidden"
															>Müsait</span
														>
														<Plus size={16} class="hidden text-base-content/60 group-hover:block" />
													</button>
												{:else}
													<div
														class="flex min-h-12 items-center justify-center rounded bg-error/20 p-2 text-error"
													>
														<span class="text-xs">Kapalı</span>
													</div>
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

<!-- Add Appointment Modal -->
<dialog class="modal" class:modal-open={showAddAppointmentModal}>
	<div class="modal-box max-w-2xl">
		<h3 class="mb-4 text-lg font-bold">Yeni Randevu Ekle</h3>

		{#if selectedSlot}
			<div class="mb-4 text-sm text-base-content/70">
				{#if viewMode === 'room'}
					<strong>Oda:</strong> {rooms.find((r) => r.id === selectedSlot?.roomId)?.name} |
				{:else}
					<strong>Eğitmen:</strong> {trainers.find((t) => t.id === selectedTrainerId)?.name} |
				{/if}
				<strong>Gün:</strong>
				{DAY_NAMES[selectedSlot.day]} |
				<strong>Saat:</strong>
				{getTimeRangeString(selectedSlot.hour)}
			</div>
		{/if}

		<form
			method="POST"
			action="?/createAppointment"
			class="space-y-4"
			use:enhance={() => {
				formLoading = true;
				return async ({ result, update }) => {
					formLoading = false;
					if (result.type === 'success') {
						toast.success('Randevu başarıyla oluşturuldu');
						showAddAppointmentModal = false;
						resetAppointmentForm();
						// Data will be automatically refreshed by SvelteKit
					} else if (result.type === 'failure') {
						toast.error(getActionErrorMessage(result));
					}
					await update();
				};
			}}
		>
			{#if selectedSlot}
				<input type="hidden" name="dayOfWeek" value={selectedSlot.day} />
				<input type="hidden" name="hour" value={selectedSlot.hour} />
				<input type="hidden" name="weekStart" value={formatDateParam(currentWeekStart())} />
			{/if}

			<!-- Room selection -->
			<fieldset class="fieldset">
				<legend class="fieldset-legend">Oda</legend>
				{#if viewMode === 'room'}
					<!-- Hidden input for room ID when in room view -->
					<input type="hidden" name="roomId" value={selectedSlot?.roomId} />
					<select class="select-bordered select w-full" disabled>
						<option>{rooms.find((r) => r.id === selectedSlot?.roomId)?.name}</option>
					</select>
				{:else}
					<!-- Room selection dropdown for trainer view -->
					<select name="roomId" class="select-bordered select w-full" required>
						<option value="">Oda seçin</option>
						{#each rooms as room (room.id)}
							<option value={room.id}>{room.name}</option>
						{/each}
					</select>
				{/if}
			</fieldset>

			<fieldset class="fieldset">
				<legend class="fieldset-legend">Eğitmen</legend>
				<select
					name="trainerId"
					class="select-bordered select w-full"
					bind:value={selectedTrainerIdForForm}
					disabled={viewMode === 'trainer'}
					required
				>
					<option value="">Eğitmen seçin</option>
					{#each trainers as trainer (trainer.id)}
						<option value={trainer.id}>{trainer.name}</option>
					{/each}
				</select>
			</fieldset>

			<fieldset class="fieldset">
				<legend class="fieldset-legend">Eğitim Türü</legend>
				<select
					name="trainingId"
					class="select-bordered select w-full"
					bind:value={selectedTrainingId}
					required
				>
					<option value="">Eğitim türü seçin</option>
					{#each availableTrainings() as training (training.id)}
						<option value={training.id}>
							{training.name} ({training.min_capacity}-{training.max_capacity} kişi)
						</option>
					{/each}
				</select>
				{#if availableTrainings().length === 0}
					<div class="mt-1 text-xs text-warning">
						{#if !selectedTrainerIdForForm}
							Önce eğitmen seçin
						{:else}
							Bu oda ve eğitmen için uygun eğitim türü yok
						{/if}
					</div>
				{/if}
			</fieldset>

			<fieldset class="fieldset">
				<legend class="fieldset-legend">Öğrenciler</legend>

				<!-- Capacity message -->
				{#if selectedTraining()}
					<div
						class="mb-2 text-xs"
						class:text-success={traineeCountValid()}
						class:text-error={!traineeCountValid()}
					>
						{capacityMessage()}
					</div>
				{:else}
					<div class="mb-2 text-xs text-base-content/60">En az bir öğrenci seçmelisiniz</div>
				{/if}

				<!-- Hidden inputs for form submission -->
				{#each selectedTrainees as trainee (trainee.id)}
					<input type="hidden" name="traineeIds" value={trainee.id} />
				{/each}

				<!-- Trainee combobox -->
				<Combobox
					items={availableTrainees()}
					selectedItems={selectedTrainees}
					placeholder="Öğrenci seçin..."
					searchPlaceholder="Öğrenci ara..."
					emptyMessage="Öğrenci bulunamadı"
					multiple={true}
					onSelect={handleTraineeSelect}
					onRemove={handleTraineeRemove}
				/>
			</fieldset>

			<fieldset class="fieldset">
				<legend class="fieldset-legend">Notlar (İsteğe bağlı)</legend>
				<textarea
					name="notes"
					class="textarea-bordered textarea w-full"
					placeholder="Randevu ile ilgili notlar..."
					bind:value={appointmentNotes}
					rows="3"
				></textarea>
			</fieldset>

			<div class="modal-action">
				<button
					type="button"
					class="btn"
					onclick={() => {
						showAddAppointmentModal = false;
						resetAppointmentForm();
					}}
				>
					İptal
				</button>
				<button
					type="submit"
					class="btn btn-secondary"
					disabled={formLoading ||
						!selectedTrainerIdForForm ||
						!selectedTrainingId ||
						!traineeCountValid()}
				>
					{#if formLoading}
						<LoaderCircle size={16} class="animate-spin" />
					{:else}
						<Plus size={16} />
					{/if}
					Randevu Oluştur
				</button>
			</div>
		</form>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button
			onclick={() => {
				showAddAppointmentModal = false;
				resetAppointmentForm();
			}}>kapat</button
		>
	</form>
</dialog>

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
								{DAY_NAMES[selectedAppointment.day_of_week as DayOfWeek]}
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

				<!-- Training Info -->
				{#if selectedAppointment.training_name}
					<div>
						<h4 class="mb-2 text-base font-semibold">Eğitim Türü</h4>
						<div class="badge badge-secondary">{selectedAppointment.training_name}</div>
					</div>
				{/if}

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
			<!-- TODO: Add edit/reschedule/cancel buttons here -->
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
