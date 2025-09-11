<script lang="ts">
	import type {
		DayOfWeek,
		AppointmentWithDetails,
		AppointmentWithRelations
	} from '$lib/types/Schedule';
	import { DAYS_OF_WEEK, DAY_NAMES, SCHEDULE_HOURS, getTimeRangeString } from '$lib/types/Schedule';
	import { getDateForDayOfWeek, formatDayMonth, getDayOfWeekFromDate } from '$lib/utils/date-utils';
	import type { Room } from '$lib/types/Room';
	import type { Trainer } from '$lib/types/Trainer';

	interface Props {
		viewMode: 'room' | 'trainer';
		selectedEntityId: number;
		entities: Room[] | Trainer[];
		appointments: AppointmentWithRelations[];
		weekStart?: Date;
		onSlotClick?: (entityId: number, day: DayOfWeek, hour: number) => void;
		showSlotAvailability?: boolean;
		availabilityCallback?: (entityId: number, day: DayOfWeek, hour: number) => boolean;
		canSelectCallback?: (entityId: number, day: DayOfWeek, hour: number) => boolean;
		selectedSlots?: Array<{ day: DayOfWeek; hour: number }>;
		pastSlotCallback?: (entityId: number, day: DayOfWeek, hour: number) => boolean;
	}

	// State for appointment details modal
	let showAppointmentDetails = $state(false);
	let selectedAppointmentDetails = $state<AppointmentWithDetails | null>(null);

	const {
		viewMode,
		selectedEntityId,
		entities,
		appointments,
		weekStart,
		onSlotClick,
		showSlotAvailability = false,
		availabilityCallback,
		canSelectCallback,
		selectedSlots = [],
		pastSlotCallback
	}: Props = $props();

	// Get selected entity
	const selectedEntity = $derived(entities.find((e) => e.id === selectedEntityId));

	// Create slots for the selected entity
	const scheduleSlots = $derived.by(() => {
		if (!selectedEntity) return {};

		interface ScheduleSlot {
			entity_id: number;
			entity_name: string;
			hour: number;
			is_available: boolean;
			is_selected: boolean;
			can_select: boolean;
			is_past: boolean;
			appointment?: AppointmentWithRelations;
		}

		const slots: Record<string, Record<number, ScheduleSlot>> = {};

		DAYS_OF_WEEK.forEach((day) => {
			slots[day] = {};

			SCHEDULE_HOURS.forEach((hour) => {
				const appointment = appointments.find((apt) => {
					// Skip appointments without appointment_date
					if (!apt.appointment_date) return false;

					// Get the day of week from the appointment date
					const appointmentDayOfWeek = getDayOfWeekFromDate(apt.appointment_date);

					if (viewMode === 'room') {
						return (
							apt.room_id === selectedEntity.id &&
							appointmentDayOfWeek === day &&
							apt.hour === hour &&
							(apt.status === 'scheduled' || apt.status === null)
						);
					} else {
						return (
							apt.trainer_id === selectedEntity.id &&
							appointmentDayOfWeek === day &&
							apt.hour === hour &&
							(apt.status === 'scheduled' || apt.status === null)
						);
					}
				});

				const isAvailable = availabilityCallback
					? availabilityCallback(selectedEntity.id, day, hour)
					: !appointment;

				const isSelected = selectedSlots.some((slot) => slot.day === day && slot.hour === hour);

				const canSelect = canSelectCallback
					? canSelectCallback(selectedEntity.id, day, hour)
					: true;

				const isPast = pastSlotCallback ? pastSlotCallback(selectedEntity.id, day, hour) : false;

				slots[day][hour] = {
					entity_id: selectedEntity.id,
					entity_name: selectedEntity.name || '',
					hour,
					is_available: isAvailable,
					is_selected: isSelected,
					can_select: canSelect,
					is_past: isPast,
					appointment: appointment
				};
			});
		});

		return slots;
	});

	function handleSlotClick(entityId: number, day: DayOfWeek, hour: number) {
		if (onSlotClick) {
			onSlotClick(entityId, day, hour);
		}
	}

	// Find conflicting appointments for an unavailable slot
	function findConflictingAppointment(entityId: number, day: DayOfWeek, hour: number) {
		if (!weekStart) return null;

		const targetDate = getDateForDayOfWeek(weekStart, day);
		const targetDateStr = targetDate.toISOString().split('T')[0];

		return appointments.find((apt) => {
			if (!apt.appointment_date || (apt.status !== 'scheduled' && apt.status !== null))
				return false;
			if (apt.hour !== hour) return false;
			if (apt.appointment_date !== targetDateStr) return false;

			// Return any appointment that matches the time slot - we'll show its details
			return true;
		});
	}

	// Handle clicking on unavailable slots to show appointment details
	function handleUnavailableSlotClick(entityId: number, day: DayOfWeek, hour: number) {
		const conflictingAppointment = findConflictingAppointment(entityId, day, hour);
		if (conflictingAppointment) {
			selectedAppointmentDetails = toAppointmentDetails(conflictingAppointment);
			showAppointmentDetails = true;
		}
	}

	// Convert AppointmentWithRelations to AppointmentWithDetails
	function toAppointmentDetails(apt: AppointmentWithRelations): AppointmentWithDetails {
		return {
			// Core database fields
			id: apt.id,
			appointment_date: apt.appointment_date,
			created_at: apt.created_at,
			created_by: apt.created_by,
			hour: apt.hour,
			notes: apt.notes,
			package_group_id: apt.package_group_id!,
			room_id: apt.room_id,
			series_id: apt.series_id,
			session_number: apt.session_number,
			status: apt.status || 'scheduled',
			total_sessions: apt.total_sessions,
			trainer_id: apt.trainer_id,
			updated_at: apt.updated_at,
			// Extended fields from relations
			room_name: apt.pe_rooms?.name || '',
			trainer_name: apt.pe_trainers?.name || '',
			package_name: apt.pe_package_groups?.pe_packages?.name || '',
			trainee_names:
				apt.pe_package_groups?.pe_groups?.pe_trainee_groups
					?.filter((tg) => !tg.left_at) // Only active members
					?.map((tg) => tg.pe_trainees.name) || [],
			trainee_count:
				apt.pe_package_groups?.pe_groups?.pe_trainee_groups?.filter((tg) => !tg.left_at)?.length ||
				0,
			reschedule_left: apt.pe_package_groups?.reschedule_left ?? 0
		};
	}

	// Close appointment details modal
	function closeAppointmentModal() {
		showAppointmentDetails = false;
		selectedAppointmentDetails = null;
	}
</script>

<div class="card bg-base-100 shadow-xl">
	<div class="card-body">
		{#if selectedEntity}
			<h3 class="mb-4 card-title text-lg">
				{viewMode === 'room' ? 'Oda' : 'Eğitmen'}: {selectedEntity.name}
			</h3>

			<div class="overflow-x-auto">
				<table class="table w-full border-collapse table-xs">
					<thead>
						<tr class="border-b">
							<th class="w-16 p-2 font-medium">Saat</th>
							{#each DAYS_OF_WEEK as day (day)}
								<th class="min-w-32 p-2 text-center font-medium">
									{#if weekStart}
										{@const dayDate = getDateForDayOfWeek(weekStart, day)}
										<div class="text-xs text-base-content/60">{formatDayMonth(dayDate)}</div>
										<div class="font-semibold">{DAY_NAMES[day]}</div>
									{:else}
										{DAY_NAMES[day]}
									{/if}
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each SCHEDULE_HOURS as hour (hour)}
							<tr>
								<td class="bg-base-200 p-2 text-center font-mono text-xs">
									{getTimeRangeString(hour)}
								</td>
								{#each DAYS_OF_WEEK as day (day)}
									{@const slot = scheduleSlots[day]?.[hour]}
									<td class="p-1">
										{#if slot?.is_past && showSlotAvailability}
											<!-- Past slot - prioritize over all other states -->
											<div
												class="flex min-h-12 items-center justify-center rounded bg-base-200 p-2 text-base-content/40"
											>
												<span class="text-xs">-</span>
											</div>
										{:else if slot?.appointment}
											<!-- Existing appointment - clickable to show details -->
											<button
												class="flex min-h-12 w-full cursor-pointer items-center justify-center rounded border border-error/50 bg-error/30 p-2 text-error transition-colors hover:bg-error/40"
												onclick={() => {
													selectedAppointmentDetails = slot.appointment
														? toAppointmentDetails(slot.appointment)
														: null;
													showAppointmentDetails = true;
												}}
											>
												<span class="text-xs font-medium">Dolu</span>
											</button>
										{:else if slot?.is_selected}
											<!-- Selected slot -->
											<button
												class="flex min-h-12 w-full cursor-pointer items-center justify-center rounded border-2 border-success bg-success/30 p-2 text-success transition-colors hover:bg-success/40"
												onclick={() => handleSlotClick(selectedEntity.id, day, hour)}
											>
												<span class="text-xs font-medium">Seçili</span>
											</button>
										{:else if slot?.is_available && showSlotAvailability && slot?.can_select}
											<!-- Available slot for selection -->
											<button
												class="flex min-h-12 w-full cursor-pointer items-center justify-center rounded border border-info/30 bg-info/20 p-2 text-info transition-colors hover:bg-info/30"
												onclick={() => handleSlotClick(selectedEntity.id, day, hour)}
											>
												<span class="text-xs">Seç</span>
											</button>
										{:else if slot?.is_available && showSlotAvailability && !slot?.can_select}
											<!-- Available but can't select (quota reached) -->
											<div
												class="flex min-h-12 items-center justify-center rounded bg-base-200 p-2 text-base-content/40"
											>
												<span class="text-xs">-</span>
											</div>
										{:else if !slot?.is_available && showSlotAvailability}
											<!-- Unavailable slot (conflict) - clickable to show details -->
											<button
												class="flex min-h-12 w-full cursor-pointer items-center justify-center rounded border border-error/50 bg-error/30 p-2 text-error transition-colors hover:bg-error/40"
												onclick={() => handleUnavailableSlotClick(selectedEntity.id, day, hour)}
											>
												<span class="text-xs font-medium">Dolu</span>
											</button>
										{:else}
											<!-- Empty slot (not in selection mode) -->
											<div
												class="flex min-h-12 items-center justify-center rounded bg-base-200 p-2"
											>
												<span class="text-xs opacity-40">-</span>
											</div>
										{/if}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<div class="py-8 text-center text-base-content/60">
				{viewMode === 'room' ? 'Oda' : 'Eğitmen'} seçiniz
			</div>
		{/if}
	</div>
</div>

<!-- Appointment Details Modal -->
{#if showAppointmentDetails && selectedAppointmentDetails}
	<div class="modal-open modal">
		<div class="modal-box">
			<h3 class="mb-4 text-lg font-bold">Randevu Detayları</h3>

			<div class="space-y-3">
				<div class="flex justify-between">
					<span class="font-medium">Tarih:</span>
					<span
						>{selectedAppointmentDetails.appointment_date
							? new Date(selectedAppointmentDetails.appointment_date).toLocaleDateString('tr-TR')
							: 'Bilinmiyor'}</span
					>
				</div>

				<div class="flex justify-between">
					<span class="font-medium">Saat:</span>
					<span>{String(selectedAppointmentDetails.hour).padStart(2, '0')}:00</span>
				</div>

				<div class="flex justify-between">
					<span class="font-medium">Oda:</span>
					<span>{selectedAppointmentDetails.room_name || 'Bilinmiyor'}</span>
				</div>

				<div class="flex justify-between">
					<span class="font-medium">Eğitmen:</span>
					<span>{selectedAppointmentDetails.trainer_name || 'Bilinmiyor'}</span>
				</div>

				<div class="flex justify-between">
					<span class="font-medium">Ders:</span>
					<span>{selectedAppointmentDetails.package_name || 'Bilinmiyor'}</span>
				</div>

				{#if selectedAppointmentDetails.session_number && selectedAppointmentDetails.total_sessions}
					<div class="flex justify-between">
						<span class="font-medium">Seans:</span>
						<span
							>{selectedAppointmentDetails.session_number} / {selectedAppointmentDetails.total_sessions}</span
						>
					</div>
				{/if}
			</div>

			<div class="modal-action">
				<button class="btn" onclick={closeAppointmentModal}> Kapat </button>
			</div>
		</div>

		<!-- Click outside to close -->
		<button class="modal-backdrop" onclick={closeAppointmentModal} aria-label="Modalı kapat"
		></button>
	</div>
{/if}
