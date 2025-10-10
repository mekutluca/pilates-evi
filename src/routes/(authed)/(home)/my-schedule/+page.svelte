<script lang="ts">
	import type { PageData } from './$types';
	import type {
		AppointmentWithRelations,
		DayOfWeek,
		AppointmentWithDetails
	} from '$lib/types/Schedule';
	import { DAYS_OF_WEEK, DAY_NAMES, SCHEDULE_HOURS, getTimeRangeString } from '$lib/types/Schedule';
	import PageHeader from '$lib/components/page-header.svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import ClockAlert from '@lucide/svelte/icons/clock-alert';
	import Modal from '$lib/components/modal.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		getWeekStart,
		formatWeekRange,
		formatDateParam,
		getDateForDayOfWeek,
		formatDayMonth,
		getDayOfWeekFromDate
	} from '$lib/utils/date-utils';

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

	// Convert AppointmentWithRelations to AppointmentWithDetails
	function createAppointmentDetails(apt: AppointmentWithRelations): AppointmentWithDetails {
		const purchase = apt.pe_purchases;
		const groupLesson = apt.pe_group_lessons;
		const packageInfo = purchase?.pe_packages || groupLesson?.pe_packages;

		// Get trainee information from appointment_trainees
		const appointmentTrainees = apt.pe_appointment_trainees || [];
		const traineeNames = appointmentTrainees
			.map((at) => at.pe_trainees?.name || '')
			.filter(Boolean);

		// Check if any trainee has their last session
		const hasLastSession = appointmentTrainees.some(
			(at) => at.session_number === at.total_sessions && at.total_sessions !== null
		);

		return {
			// Database fields
			id: apt.id,
			room_id: apt.room_id,
			trainer_id: apt.trainer_id,
			purchase_id: apt.purchase_id,
			group_lesson_id: apt.group_lesson_id,
			hour: apt.hour,
			date: apt.date,
			// Extended fields
			room_name: apt.pe_rooms?.name || '',
			trainer_name: apt.pe_trainers?.name || '',
			package_name: packageInfo?.name || '',
			trainee_names: traineeNames,
			trainee_count: traineeNames.length,
			reschedule_left: purchase?.reschedule_left ?? 0,
			has_last_session: hasLastSession,
			appointment_trainees: appointmentTrainees
		};
	}

	function openAppointmentDetails(apt: AppointmentWithRelations) {
		selectedAppointment = createAppointmentDetails(apt);
		showAppointmentDetailsModal = true;
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
	<div class="card bg-base-100 shadow-xl">
		<div class="card-body">
			<h2 class="card-title mb-4 text-xl">
				<span class="mr-2 badge badge-sm badge-info">Eğitmen</span>
				{trainerName}
			</h2>

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
									{@const dayDate = getDateForDayOfWeek(currentWeekStart(), day)}
									{@const dateString = formatDateParam(dayDate)}
									{@const appointment = appointments.find(
										(apt) => apt.date === dateString && apt.hour === hour
									)}
									<td class="p-1 text-center">
										{#if appointment}
											{@const appointmentDetails = createAppointmentDetails(appointment)}
											<button
												class="min-h-12 w-full rounded bg-info p-2 text-xs text-info-content transition-colors hover:opacity-80"
												onclick={() => openAppointmentDetails(appointment)}
											>
												<div class="truncate font-semibold">
													{appointmentDetails.room_name}
												</div>
												{#if appointmentDetails.package_name}
													<div class="truncate text-xs text-info-content/70">
														{appointmentDetails.package_name}
													</div>
												{/if}
												{#if appointmentDetails.has_last_session}
													<div class="flex items-center justify-center gap-1 text-xs font-semibold">
														<ClockAlert size={12} />
														<span>Son ders</span>
													</div>
												{/if}
											</button>
										{:else}
											<div
												class="flex min-h-12 items-center justify-center rounded bg-base-200 p-2 text-base-content/40"
											>
												<span class="text-xs">-</span>
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
			<!-- Extension Alert Strip -->
			{#if selectedAppointment.has_last_session}
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
							{selectedAppointment.date
								? DAY_NAMES[getDayOfWeekFromDate(selectedAppointment.date) as DayOfWeek]
								: '-'}
						</div>
						<div>
							<strong>Saat:</strong>
							{selectedAppointment.hour !== null
								? getTimeRangeString(selectedAppointment.hour)
								: '-'}
						</div>
					</div>
				</div>
			</div>

			<!-- Package Info -->
			<div>
				<h4 class="mb-2 text-base font-semibold">Ders</h4>
				<div class="space-y-2">
					<div class="badge badge-secondary">
						{selectedAppointment.package_name || 'Ders Bilgisi Yok'}
					</div>
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
