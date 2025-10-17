<script lang="ts">
	import type { PageData } from './$types';
	import type {
		AppointmentWithRelations,
		DayOfWeek,
		AppointmentWithDetails
	} from '$lib/types/Schedule';
	import { DAY_NAMES, getTimeRangeString } from '$lib/types/Schedule';
	import PageHeader from '$lib/components/page-header.svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ClockAlert from '@lucide/svelte/icons/clock-alert';
	import Modal from '$lib/components/modal.svelte';
	import Schedule from '$lib/components/schedule.svelte';
	import type { ScheduleSlot } from '$lib/components/schedule.types';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		getWeekStart,
		formatWeekRange,
		formatDateParam,
		getDayOfWeekFromDate,
		formatDayMonth
	} from '$lib/utils/date-utils';
	import { createAppointmentDetails } from '$lib/utils/appointment-utils';

	let { data }: { data: PageData } = $props();

	// Extract data
	let appointments = $derived(data.appointments as AppointmentWithRelations[]);
	let trainerName = $derived(data.trainerName);
	let trainerId = $derived(data.trainerId);

	// Week navigation state
	let currentWeekStart = $derived(() => {
		const urlWeek = page.url.searchParams.get('week');
		return urlWeek ? getWeekStart(new Date(urlWeek)) : getWeekStart(new Date());
	});

	let showDatePicker = $state(false);
	let showAppointmentDetailsModal = $state(false);
	let selectedAppointment = $state<AppointmentWithDetails | null>(null);

	// Slot data provider for Schedule component
	function getSlotData(day: DayOfWeek, hour: number, dateString: string): ScheduleSlot {
		const appointment = appointments.find((apt) => apt.date === dateString && apt.hour === hour);

		if (appointment) {
			const appointmentDetails = createAppointmentDetails(appointment);
			return {
				variant: 'appointment',
				day,
				hour,
				date: dateString,
				title: appointmentDetails.room_name || '',
				subtitle: appointmentDetails.package_name || '',
				badge: appointmentDetails.has_last_session ? 'Son ders' : undefined,
				color: 'info',
				clickable: true,
				data: appointmentDetails
			};
		} else {
			return {
				variant: 'empty',
				day,
				hour,
				date: dateString,
				label: '-'
			};
		}
	}

	// Handle slot click
	function handleScheduleSlotClick(slot: ScheduleSlot) {
		if (slot.variant === 'appointment' && slot.data) {
			selectedAppointment = slot.data as AppointmentWithDetails;
			showAppointmentDetailsModal = true;
		}
	}

	function navigateToWeek(date: Date) {
		const weekParam = formatDateParam(date);
		goto(`?week=${weekParam}`);
	}

	function goToPreviousWeek() {
		const newWeekStart = new Date(currentWeekStart().getTime());
		newWeekStart.setDate(newWeekStart.getDate() - 7);
		navigateToWeek(newWeekStart);
	}

	function goToNextWeek() {
		const newWeekStart = new Date(currentWeekStart().getTime());
		newWeekStart.setDate(newWeekStart.getDate() + 7);
		navigateToWeek(newWeekStart);
	}

	function goToCurrentWeek() {
		navigateToWeek(getWeekStart(new Date()));
	}

	function isCurrentWeek() {
		const thisWeek = getWeekStart(new Date());
		return currentWeekStart().getTime() === thisWeek.getTime();
	}

	function handleDateSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		// If the value is empty (cleared), default to current week
		if (!target.value) {
			goToCurrentWeek();
			showDatePicker = false;
			return;
		}
		const selectedDate = new Date(target.value);
		// Check if the date is valid
		if (isNaN(selectedDate.getTime())) {
			goToCurrentWeek();
			showDatePicker = false;
			return;
		}
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
</script>

<div class="space-y-6">
	<div class="px-6 pt-6">
		<PageHeader title="Haftalık Programım" subtitle="Bu hafta derslerinizi görüntüleyin" />
	</div>

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
							<div class="mt-2 flex gap-2">
								<button
									class="btn flex-1 btn-ghost btn-sm"
									onclick={() => {
										goToCurrentWeek();
										showDatePicker = false;
									}}
								>
									Bugün
								</button>
								<button
									class="btn flex-1 btn-ghost btn-sm"
									onclick={() => (showDatePicker = false)}
								>
									İptal
								</button>
							</div>
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
	<Schedule
		weekStart={currentWeekStart()}
		entityName={trainerName || ''}
		entityBadge={{
			text: 'Eğitmen',
			color: 'info'
		}}
		{getSlotData}
		onSlotClick={handleScheduleSlotClick}
	/>
</div>

<!-- Appointment Details Modal -->
<Modal
	bind:open={showAppointmentDetailsModal}
	size="lg"
	onClose={() => {
		selectedAppointment = null;
	}}
>
	{#snippet header()}
		<h3 class="text-lg font-bold">Randevu Detayları</h3>
	{/snippet}
	{#if selectedAppointment}
		<div class="space-y-4">
			<!-- Extension Alert Strip - Only for private lessons with last session -->
			{#if selectedAppointment.has_last_session && selectedAppointment.purchase_id}
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
								trainee.total_sessions !== null &&
								!trainee.pe_purchases?.successor_id}
							<div class="flex items-center justify-between gap-2">
								<div class="flex-1 font-medium">
									{trainee.pe_trainees?.name || '-'}
									{#if isLastLesson}
										<span class="ml-2 text-xs text-warning">(Son ders)</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>
		</div>
	{/if}

	<div class="modal-action">
		<button
			type="button"
			class="btn"
			onclick={() => {
				showAppointmentDetailsModal = false;
			}}
		>
			Kapat
		</button>
	</div>
</Modal>
