<script lang="ts">
	import type { PageData } from './$types';
	import type { AppointmentWithRelations, DayOfWeek } from '$lib/types/Schedule';
	import PageHeader from '$lib/components/page-header.svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import WeeklyScheduleGrid from '$lib/components/weekly-schedule-grid.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		getWeekStart,
		formatWeekRange,
		formatDateParam,
		getDateForDayOfWeek
	} from '$lib/utils/date-utils';

	let { data }: { data: PageData } = $props();

	// Extract data
	let appointments = $derived(data.appointments as AppointmentWithRelations[]);
	let trainerName = $derived(data.trainerName);

	// Week navigation state
	let currentWeekStart = $derived(() => {
		const urlWeek = page.url.searchParams.get('week');
		return urlWeek ? getWeekStart(new Date(urlWeek)) : getWeekStart(new Date());
	});

	let showDatePicker = $state(false);

	// Create a dummy trainer array for the WeeklyScheduleGrid component
	// Since we only show one trainer's schedule, we create a single-item array
	const trainerEntities = $derived([
		{
			id: '1', // dummy ID since we're only showing current trainer
			name: trainerName || 'Eğitmen',
			is_active: true,
			phone: ''
		}
	]);

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
	<WeeklyScheduleGrid
		viewMode="trainer"
		selectedEntityId="1"
		entities={trainerEntities}
		{appointments}
		weekStart={currentWeekStart()}
	/>
</div>
