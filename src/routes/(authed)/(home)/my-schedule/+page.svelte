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
	import type { ScheduleSlot } from '$lib/types/Schedule';
	import DatePicker from '$lib/components/date-picker.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		getWeekStart,
		formatWeekRange,
		formatDateParam,
		getDayOfWeekFromDate
	} from '$lib/utils/date-utils';
	import {
		createAppointmentDetails,
		computeAppointmentWarnings,
		getAppointmentWarningLabel
	} from '$lib/utils/appointment-utils';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';

	let { data }: { data: PageData } = $props();

	// Extract data
	let appointments = $derived(data.appointments as AppointmentWithRelations[]);
	let trainerName = $derived(data.trainerName);

	// Capacity/timeslot-collision flags for the week's appointments, computed once across the
	// whole set so collisions can be detected across rooms and trainers.
	let appointmentWarnings = $derived(computeAppointmentWarnings(appointments));

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
			const isEmpty = (appointmentDetails.trainee_count ?? 0) === 0;
			const warningLabel = getAppointmentWarningLabel(appointmentWarnings.get(appointment.id));
			return {
				variant: 'appointment',
				day,
				hour,
				date: dateString,
				title: appointmentDetails.room_name || '',
				subtitle: appointmentDetails.package_name || '',
				badge: appointmentDetails.has_last_session ? 'Son ders' : undefined,
				warning: warningLabel,
				color: warningLabel ? 'error' : 'primary',
				clickable: true,
				dimmed: isEmpty,
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
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Local computation, not reactive state
		const newWeekStart = new Date(currentWeekStart().getTime());
		newWeekStart.setDate(newWeekStart.getDate() - 7);
		navigateToWeek(newWeekStart);
	}

	function goToNextWeek() {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Local computation, not reactive state
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
</script>

<svelte:head>
	<title>Haftalık Programım · Pilates Evi</title>
</svelte:head>

<div class="space-y-6">
	<div class="px-6 pt-6">
		<PageHeader title="Haftalık Programım" subtitle="Bu hafta derslerinizi görüntüleyin" />
	</div>

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
	<Schedule
		weekStart={currentWeekStart()}
		entityName={trainerName || ''}
		entityBadge={{
			text: 'Eğitmen',
			color: 'primary'
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

	<div class="flex justify-end gap-2 pt-4">
		<Button
			variant="outline"
			onclick={() => {
				showAppointmentDetailsModal = false;
			}}
		>
			Kapat
		</Button>
	</div>
</Modal>
