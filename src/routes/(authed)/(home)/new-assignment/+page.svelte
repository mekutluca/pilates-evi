<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { SvelteDate } from 'svelte/reactivity';
	import Plus from '@lucide/svelte/icons/plus';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import Check from '@lucide/svelte/icons/check';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Users from '@lucide/svelte/icons/users';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import Dumbbell from '@lucide/svelte/icons/dumbbell';
	import type { PackageAssignmentForm, SelectedTimeSlot } from '$lib/types/Package';
	import type { DayOfWeek } from '$lib/types/Schedule';
	import {
		getWeekStart,
		formatWeekRange,
		formatDateParam,
		getDayOfWeekFromDate,
		TURKISH_DAYS
	} from '$lib/utils/date-utils';
	import WeeklyScheduleGrid from '$lib/components/weekly-schedule-grid.svelte';

	let { data } = $props();
	let { packages, appointments, existingAppointmentSeries, existingGroupTrainees } = $derived(data);

	// Access inherited data from parent layout
	let rooms = $derived(data.rooms);
	let trainers = $derived(data.trainers);
	let trainees = $derived(data.trainees);

	// Wizard state
	let currentStep = $state(1);
	let formLoading = $state(false);

	// Get current week's Monday as default start date
	function getCurrentWeekMonday(): string {
		const today = new Date();
		const weekStart = getWeekStart(today);
		return formatDateParam(weekStart);
	}

	// Assignment form data
	let assignmentForm = $state<PackageAssignmentForm>({
		package_id: 0,
		room_id: 0,
		trainer_id: 0,
		start_date: getCurrentWeekMonday(),
		time_slots: [],
		trainee_ids: []
	});

	// Step titles - dynamic based on package type
	const stepTitles = $derived(() => {
		if (selectedPackage?.package_type === 'group') {
			return ['Ders Seçimi', 'Grup Seçimi', 'Kaynak Seçimi & Zaman Planlaması', 'Öğrenci Seçimi'];
		}
		return ['Ders Seçimi', 'Kaynak Seçimi & Zaman Planlaması', 'Öğrenci Seçimi'];
	});

	// Step 1 state
	let selectedPackage = $derived(packages.find((p) => p.id === assignmentForm.package_id));

	// Total steps can be 3 (private packages) or 4 (group packages with group selection)
	const totalSteps = $derived(selectedPackage?.package_type === 'group' ? 4 : 3);

	// Group packages by type (private first, then group)
	const groupedPackages = $derived(() => {
		const private_packages = packages.filter((pkg) => pkg.package_type === 'private');
		const group_packages = packages.filter((pkg) => pkg.package_type === 'group');
		return { private: private_packages, group: group_packages };
	});

	// Function to reload appointments based on current package and date selection
	async function reloadAppointments() {
		if (!selectedPackage || !assignmentForm.start_date) return;

		const url = new URL(page.url);
		url.searchParams.set('package_id', selectedPackage.id.toString());
		url.searchParams.set('start_date', assignmentForm.start_date);
		url.searchParams.set('weeks_duration', (selectedPackage.weeks_duration || 52).toString());

		// Include selected group ID if an existing group is selected
		if (selectedGroupId) {
			url.searchParams.set('selected_group_id', selectedGroupId.toString());
		} else {
			url.searchParams.delete('selected_group_id');
		}

		// Use goto to trigger a server-side reload with new parameters
		await goto(url.toString(), { replaceState: true });
	}

	// Step 2 state (Group selection - only for group packages)
	let selectedGroupId = $state<number | null>(null);
	let createNewGroup = $state(false);

	// Navigation flow tracking
	let navigationPath = $state<number[]>([1]); // Track the actual path taken

	// Step 2/3 state (Resource & Time - step number varies based on package type)
	let selectedTimeSlots = $state<SelectedTimeSlot[]>([]);

	// Step 3/4 state (Trainee selection - step number varies based on package type)
	let selectedTrainees = $state<number[]>([]);
	let traineeSearchTerm = $state('');

	// Week navigation state
	let showDatePicker = $state(false);

	// Progress calculation
	const progress = $derived((currentStep / totalSteps) * 100);

	// Navigation functions
	function nextStep() {
		if (currentStep < totalSteps) {
			const newStep = currentStep + 1;
			currentStep = newStep;
			navigationPath.push(newStep);
		}
	}

	function prevStep() {
		if (navigationPath.length > 1) {
			navigationPath.pop(); // Remove current step
			currentStep = navigationPath[navigationPath.length - 1]; // Go to previous step in path
		}
	}

	// Week navigation functions
	function currentWeekStart(): Date {
		return getWeekStart(new Date(assignmentForm.start_date || getCurrentWeekMonday()));
	}

	async function goToPreviousWeek() {
		const currentWeek = currentWeekStart();
		const newWeekStart = new SvelteDate(currentWeek.getTime());
		newWeekStart.setDate(newWeekStart.getDate() - 7);
		assignmentForm.start_date = formatDateParam(newWeekStart);
		await reloadAppointments();
	}

	async function goToNextWeek() {
		const currentWeek = currentWeekStart();
		const newWeekStart = new SvelteDate(currentWeek.getTime());
		newWeekStart.setDate(newWeekStart.getDate() + 7);
		assignmentForm.start_date = formatDateParam(newWeekStart);
		await reloadAppointments();
	}

	async function goToCurrentWeek() {
		const currentMonday = getWeekStart(new Date());
		assignmentForm.start_date = formatDateParam(currentMonday);
		await reloadAppointments();
	}

	async function handleDateSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		const selectedDate = new Date(target.value);
		const weekStart = getWeekStart(selectedDate);
		assignmentForm.start_date = formatDateParam(weekStart);
		showDatePicker = false;
		await reloadAppointments();
	}

	function toggleDatePicker() {
		showDatePicker = !showDatePicker;
	}

	// Check if we're viewing the current week
	const isCurrentWeek = $derived(() => {
		const now = getWeekStart(new Date());
		return currentWeekStart().getTime() === now.getTime();
	});

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

	// Only reload appointments explicitly, not in effects to avoid navigation loops

	// Handle room selection change
	async function handleRoomChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		assignmentForm.room_id = parseInt(target.value);
		selectedTimeSlots = []; // Clear selections when room changes

		// Reload appointments if both room and trainer are selected
		if (assignmentForm.room_id > 0 && assignmentForm.trainer_id > 0) {
			await reloadAppointments();
		}
	}

	// Handle trainer selection change
	async function handleTrainerChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		assignmentForm.trainer_id = parseInt(target.value);
		selectedTimeSlots = []; // Clear selections when trainer changes

		// Reload appointments if both room and trainer are selected
		if (assignmentForm.room_id > 0 && assignmentForm.trainer_id > 0) {
			await reloadAppointments();
		}
	}

	// Step 1: Package Selection Only
	async function handleStep1Submit() {
		if (!assignmentForm.package_id) {
			toast.error('Ders seçimi gereklidir');
			return;
		}

		// If group package selected, go to group selection step
		// If private package selected, skip group selection and go to resource/time step
		if (selectedPackage?.package_type === 'group') {
			// For group packages, reload appointments to get existing appointment series
			await reloadAppointments();
			nextStep(); // Go to step 2 (group selection)
		} else {
			// For private packages, go directly to step 2 (resource & time)
			// But we need to adjust the step to skip the group selection
			currentStep = 2;
			navigationPath.push(2);
			// Reload appointments for the selected package
			await reloadAppointments();
		}
	}

	// Step 2: Group Selection (only for group packages)
	async function handleStep2Submit() {
		// This is only called for group packages
		if (!selectedPackage || selectedPackage.package_type !== 'group') return;

		if (createNewGroup) {
			// Creating new group - go to resource & time selection (step 3)
			nextStep();
			await reloadAppointments();
		} else if (selectedGroupId) {
			// Selected existing group - reload to get existing trainees and skip resource/time and go directly to trainee selection (step 4)
			await reloadAppointments(); // Load existing trainees for the selected group
			currentStep = 4;
			navigationPath.push(4);
		} else {
			toast.error('Grup seçimi gereklidir');
		}
	}

	// Step 2 (private packages) or Step 3 (group packages): Room, Trainer, and Time Slot Selection
	function handleResourceTimeSubmit() {
		if (!selectedPackage) return;

		if (!assignmentForm.room_id || !assignmentForm.trainer_id) {
			toast.error('Oda ve eğitmen seçimi gereklidir');
			return;
		}

		if (!assignmentForm.start_date) {
			toast.error('Başlangıç haftası seçimi gereklidir');
			return;
		}

		if (selectedTimeSlots.length !== selectedPackage.lessons_per_week) {
			toast.error(`${selectedPackage.lessons_per_week} zaman dilimi seçmelisiniz`);
			return;
		}

		assignmentForm.time_slots = selectedTimeSlots;
		nextStep();
	}

	// Step 3: Trainee Selection & Final Submit
	async function handleFinalSubmit() {
		if (!selectedPackage) return;

		// For private packages, trainee selection is required
		if (selectedPackage.package_type === 'private' && selectedTrainees.length === 0) {
			toast.error('En az bir öğrenci seçmelisiniz');
			return;
		}

		// Check capacity (account for existing group members)
		const availableCapacity = getAvailableCapacity();
		if (selectedTrainees.length > availableCapacity) {
			toast.error(`Maksimum ${availableCapacity} öğrenci seçilebilir`);
			return;
		}

		assignmentForm.trainee_ids = selectedTrainees;

		// Set group_id if an existing group was selected
		if (selectedGroupId) {
			const selectedGroup = existingAppointmentSeries?.find(
				(group) => group.package_group_id === selectedGroupId
			);
			if (selectedGroup) {
				assignmentForm.group_id = selectedGroup.group_id;
			}
		}

		// Submit the assignment via fetch
		formLoading = true;

		try {
			const formData = new FormData();
			formData.append('assignmentData', JSON.stringify(assignmentForm));

			const response = await fetch('?/createAssignment', {
				method: 'POST',
				body: formData
			});

			const result = await response.json();

			if (result.type === 'success') {
				toast.success('Kayıt tamamlandı');
				goto('/schedule');
			} else {
				toast.error(result.data?.message || 'Bir hata oluştu');
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Bilinmeyen hata oluştu';
			toast.error(`Bir hata oluştu: ${errorMessage}`);
		} finally {
			formLoading = false;
		}
	}

	// Validation for current step
	const canProceed = $derived(() => {
		const isGroupPackage = selectedPackage?.package_type === 'group';

		switch (currentStep) {
			case 1:
				// Only package selection required in step 1
				return assignmentForm.package_id > 0;
			case 2:
				if (isGroupPackage) {
					// Group selection step - either create new or select existing
					return createNewGroup || selectedGroupId !== null;
				} else {
					// Resource & time selection for private packages
					return (
						selectedPackage &&
						assignmentForm.room_id > 0 &&
						assignmentForm.trainer_id > 0 &&
						assignmentForm.start_date !== '' &&
						selectedTimeSlots.length === selectedPackage.lessons_per_week
					);
				}
			case 3:
				if (isGroupPackage) {
					// Resource & time selection for group packages (when creating new group)
					return (
						selectedPackage &&
						assignmentForm.room_id > 0 &&
						assignmentForm.trainer_id > 0 &&
						assignmentForm.start_date !== '' &&
						selectedTimeSlots.length === selectedPackage.lessons_per_week
					);
				} else {
					// Trainee selection for private packages
					const availableCapacity = getAvailableCapacity();
					return selectedTrainees.length > 0 && selectedTrainees.length <= availableCapacity;
				}
			case 4: {
				// Trainee selection for group packages
				if (!isGroupPackage) return false;
				const availableCapacity = getAvailableCapacity();
				return selectedTrainees.length > 0 && selectedTrainees.length <= availableCapacity;
			}
			default:
				return false;
		}
	});

	// Time slot management for step 2
	function handleScheduleSlotClick(_entityId: number, day: DayOfWeek, hour: number) {
		if (!selectedPackage) return;

		const existingIndex = selectedTimeSlots.findIndex(
			(slot) => slot.day === day && slot.hour === hour
		);

		if (existingIndex >= 0) {
			// Remove if already selected
			selectedTimeSlots.splice(existingIndex, 1);
		} else if (selectedTimeSlots.length < selectedPackage.lessons_per_week) {
			// Add if not at capacity
			selectedTimeSlots.push({
				day: day,
				hour: hour
			});
		} else {
			// At capacity - replace oldest selection with new one
			selectedTimeSlots.shift(); // Remove the first (oldest) selection
			selectedTimeSlots.push({
				day: day,
				hour: hour
			});
		}
	}

	// Check if a slot would be in the past based on start date
	function isSlotInPast(_entityId: number, day: DayOfWeek, hour: number): boolean {
		if (!assignmentForm.start_date) return false;

		const startDate = new Date(assignmentForm.start_date);
		const dayMapping: Record<DayOfWeek, number> = {
			monday: 1,
			tuesday: 2,
			wednesday: 3,
			thursday: 4,
			friday: 5,
			saturday: 6,
			sunday: 0
		};

		// Calculate the actual date for this slot in the first week
		const slotDate = new SvelteDate(startDate.getTime());
		const startDayOfWeek = startDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
		const targetDayOfWeek = dayMapping[day];

		// Calculate days to add from start date to target day
		let daysToAdd = targetDayOfWeek - startDayOfWeek;
		if (targetDayOfWeek === 0) daysToAdd = 7 - startDayOfWeek; // Sunday case
		if (daysToAdd < 0) daysToAdd += 7; // Next week if day already passed

		slotDate.setDate(startDate.getDate() + daysToAdd);
		slotDate.setHours(hour, 0, 0, 0); // Set the specific hour

		// Check if this slot would be in the past (including current time)
		const now = new Date();

		return slotDate < now;
	}

	// Check if a slot is available across all weeks for the selected package
	function isSlotAvailable(_entityId: number, day: DayOfWeek, hour: number): boolean {
		// Must have package, room, trainer, and start date selected
		if (
			!selectedPackage ||
			!assignmentForm.room_id ||
			!assignmentForm.trainer_id ||
			!assignmentForm.start_date
		) {
			return false;
		}

		// Past slots are considered unavailable for selection
		if (isSlotInPast(_entityId, day, hour)) {
			return false;
		}

		// Check if any appointment in the fetched data conflicts with this slot
		const hasConflict = appointments.some((apt) => {
			// Skip appointments without appointment_date or not scheduled
			if (!apt.appointment_date || apt.status !== 'scheduled') return false;

			// Check if it's the same day of week and hour
			const aptDayOfWeek = getDayOfWeekFromDate(apt.appointment_date);
			if (aptDayOfWeek !== day || apt.hour !== hour) return false;

			// Check if it conflicts with our selected room or trainer
			const roomConflict = apt.pe_package_groups?.pe_rooms?.id === assignmentForm.room_id;
			const trainerConflict = apt.pe_package_groups?.pe_trainers?.id === assignmentForm.trainer_id;

			return roomConflict || trainerConflict;
		});

		return !hasConflict; // Available if no conflicts found
	}

	// Check if slot selection should be disabled - now always allows selection for available slots
	function canSelectSlot(): boolean {
		if (!selectedPackage) return false;

		// Always allow selection/deselection for available slots
		// The handleScheduleSlotClick function will handle moving selections when at capacity
		return true;
	}

	// Get selected slots in the format expected by the schedule component
	const scheduleSelectedSlots = $derived(
		selectedTimeSlots.map((slot) => ({
			day: slot.day as DayOfWeek,
			hour: slot.hour
		}))
	);

	// Filtered trainees based on search term
	const filteredTrainees = $derived(
		trainees.filter(
			(trainee) =>
				trainee.name.toLowerCase().includes(traineeSearchTerm.toLowerCase()) ||
				(trainee.phone && trainee.phone.includes(traineeSearchTerm))
		)
	);

	// Trainee selection for step 3
	function toggleTrainee(traineeId: number, event?: Event) {
		// Don't allow toggling existing group trainees
		if (existingGroupTrainees && existingGroupTrainees.includes(traineeId)) {
			toast.info('Bu öğrenci zaten grubun üyesi');
			return;
		}

		const index = selectedTrainees.indexOf(traineeId);
		const availableCapacity = getAvailableCapacity();

		if (index === -1) {
			if (selectedPackage && selectedTrainees.length < availableCapacity) {
				selectedTrainees.push(traineeId);
			} else {
				toast.warning(`Maksimum ${availableCapacity} öğrenci seçilebilir`);
			}
		} else {
			selectedTrainees.splice(index, 1);
		}
	}

	// Check if a trainee is already in the existing group
	function isTraineeInExistingGroup(traineeId: number): boolean {
		return existingGroupTrainees && existingGroupTrainees.includes(traineeId);
	}

	// Helper to get existing group trainee count
	function getExistingTraineeCount(): number {
		return existingGroupTrainees ? existingGroupTrainees.length : 0;
	}

	// Helper to get available capacity for new trainees
	function getAvailableCapacity(): number {
		return selectedPackage ? selectedPackage.max_capacity - getExistingTraineeCount() : 0;
	}
</script>

<div class="min-h-screen bg-base-200 p-4">
	<div class="mx-auto max-w-6xl">
		<!-- Header -->
		<div class="mb-6">
			<h1 class="flex items-center gap-2 text-2xl font-bold">
				<Plus class="h-6 w-6 text-base-content" />
				Yeni Kayıt
			</h1>
			<p class="mt-1 text-sm text-base-content/60">
				Ders seçin, zaman dilimlerini belirleyin ve öğrencileri atayın
			</p>
		</div>

		<!-- Progress Bar -->
		<div class="card mb-6 bg-base-100 shadow-sm">
			<div class="card-body p-4">
				<div class="mb-4">
					<div class="text-sm text-base-content/60">
						Adım {currentStep} / {totalSteps}
					</div>
				</div>

				<!-- Progress bar -->
				<div class="h-2 w-full rounded-full bg-base-200">
					<div
						class="h-2 rounded-full bg-accent transition-all duration-300"
						style="width: {progress}%"
					></div>
				</div>

				<!-- Step indicators -->
				<div class="mt-4 flex flex-wrap justify-center gap-2 sm:justify-between">
					{#each stepTitles() as title, index (index)}
						<div
							class="badge flex items-center gap-1 px-3 py-2 text-xs"
							class:badge-accent={currentStep === index + 1}
							class:badge-success={currentStep > index + 1}
							class:badge-outline={currentStep < index + 1}
						>
							{#if currentStep > index + 1}
								<Check class="h-3 w-3" />
							{/if}
							<span class="hidden sm:inline">{title}</span>
							<span class="sm:hidden">{index + 1}</span>
						</div>
					{/each}
				</div>
			</div>
		</div>

		<!-- Step Content -->
		<div class="card bg-base-100 shadow-xl">
			<div class="card-body p-6">
				{#if formLoading}
					<div class="flex items-center justify-center py-12">
						<LoaderCircle size={48} class="animate-spin text-accent" />
						<span class="ml-3 text-lg">Kayıt tamamlanıyor...</span>
					</div>
				{:else if currentStep === 1}
					<!-- Step 1: Package Selection Only -->
					<div class="space-y-6">
						<h2 class="flex items-center gap-2 text-xl font-semibold">
							<Dumbbell class="h-5 w-5 text-accent" />
							Ders Seçimi
						</h2>

						<!-- Package Selection -->
						<div class="space-y-6">
							<!-- Private Packages -->
							{#if groupedPackages().private.length > 0}
								<div class="space-y-3">
									<h4 class="font-medium text-base-content">Özel Dersler</h4>
									<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
										{#each groupedPackages().private as pkg (pkg.id)}
											<label class="cursor-pointer">
												<div
													class="card border transition-all duration-200 hover:shadow-lg {assignmentForm.package_id ===
													pkg.id
														? 'border-accent bg-accent/10 shadow-lg'
														: 'hover:border-accent/50'}"
												>
													<div class="card-body p-4">
														<div class="flex items-start gap-3">
															<input
																type="radio"
																class="radio mt-1 radio-sm radio-accent"
																bind:group={assignmentForm.package_id}
																value={pkg.id}
															/>
															<div class="flex-1">
																<div class="font-medium">{pkg.name}</div>
																<div class="mt-2 text-xs text-base-content/60">
																	<div>{pkg.lessons_per_week} ders/hafta</div>
																	<div>Max {pkg.max_capacity} kişi</div>
																	<div>
																		{#if pkg.package_type === 'group'}
																			Devamlı
																		{:else if pkg.weeks_duration}
																			{pkg.weeks_duration} hafta
																		{:else}
																			Süresiz
																		{/if}
																	</div>
																</div>
															</div>
														</div>
													</div>
												</div>
											</label>
										{/each}
									</div>
								</div>
							{/if}

							<!-- Group Packages -->
							{#if groupedPackages().group.length > 0}
								<div class="space-y-3">
									<h4 class="font-medium text-base-content">Grup Dersleri</h4>
									<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
										{#each groupedPackages().group as pkg (pkg.id)}
											<label class="cursor-pointer">
												<div
													class="card border transition-all duration-200 hover:shadow-lg {assignmentForm.package_id ===
													pkg.id
														? 'border-accent bg-accent/10 shadow-lg'
														: 'hover:border-accent/50'}"
												>
													<div class="card-body p-4">
														<div class="flex items-start gap-3">
															<input
																type="radio"
																class="radio mt-1 radio-sm radio-accent"
																bind:group={assignmentForm.package_id}
																value={pkg.id}
															/>
															<div class="flex-1">
																<div class="font-medium">{pkg.name}</div>
																<div class="mt-2 text-xs text-base-content/60">
																	<div>{pkg.lessons_per_week} ders/hafta</div>
																	<div>Max {pkg.max_capacity} kişi</div>
																	<div>
																		{#if pkg.package_type === 'group'}
																			Devamlı
																		{:else if pkg.weeks_duration}
																			{pkg.weeks_duration} hafta
																		{:else}
																			Süresiz
																		{/if}
																	</div>
																</div>
															</div>
														</div>
													</div>
												</div>
											</label>
										{/each}
									</div>
								</div>
							{/if}
						</div>
					</div>
				{:else if currentStep === 2 && selectedPackage?.package_type === 'group'}
					<!-- Step 2: Group Selection (only for group packages) -->
					<div class="space-y-6">
						<h2 class="flex items-center gap-2 text-xl font-semibold">
							<Users class="h-5 w-5 text-accent" />
							Grup Seçimi
						</h2>

						<div class="space-y-4">
							<!-- Create New Group Option -->
							<label class="cursor-pointer">
								<div
									class="card border transition-all duration-200 hover:shadow-lg {createNewGroup
										? 'border-accent bg-accent/10 shadow-lg'
										: 'hover:border-accent/50'}"
								>
									<div class="card-body p-4">
										<div class="flex items-start gap-3">
											<input
												type="radio"
												class="radio mt-1 radio-sm radio-accent"
												checked={createNewGroup}
												onchange={async () => {
													createNewGroup = true;
													selectedGroupId = null;
													// Clear existing group trainees data
													await reloadAppointments();
												}}
											/>
											<div class="flex-1">
												<div class="font-medium">Yeni Grup Oluştur</div>
												<div class="mt-1 text-xs text-base-content/60">
													Bu ders için yeni bir grup oluşturun ve öğrencileri seçin
												</div>
											</div>
										</div>
									</div>
								</div>
							</label>

							<!-- Existing Appointment Series -->
							{#if existingAppointmentSeries && existingAppointmentSeries.length > 0 && selectedPackage}
								{@const packageSeries = existingAppointmentSeries.filter(
									(series) => series.package_id === selectedPackage.id
								)}
								<div class="space-y-3 pt-4">
									<h4 class="font-medium text-base-content">Mevcut Ders Grupları</h4>
									{#if packageSeries.length > 0}
										<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
											{#each packageSeries as group (group.package_group_id)}
												<label class="cursor-pointer">
													<div
														class="card border-2 transition-all duration-200 hover:shadow-lg {selectedGroupId ===
														group.package_group_id
															? 'border-accent bg-accent/5 shadow-lg ring-2 ring-accent/20'
															: 'border-base-300 hover:border-accent/50 hover:shadow-md'}"
													>
														<div class="card-body p-4">
															<div class="flex items-start gap-3">
																<input
																	type="radio"
																	class="radio mt-1 radio-accent"
																	checked={selectedGroupId === group.package_group_id}
																	onchange={async () => {
																		selectedGroupId = group.package_group_id;
																		createNewGroup = false;
																		// Reload to get existing trainees for this group
																		await reloadAppointments();
																	}}
																/>
																<div class="flex-1 space-y-3">
																	<!-- Location & Trainer Info -->
																	<div class="flex flex-wrap gap-4 text-sm">
																		<div class="flex items-center gap-1.5">
																			<span class="text-base-content/70">Oda:</span>
																			<span class="font-medium">{group.room_name}</span>
																		</div>
																		<div class="flex items-center gap-1.5">
																			<span class="text-base-content/70">Eğitmen:</span>
																			<span class="font-medium">{group.trainer_name}</span>
																		</div>
																	</div>

																	<!-- Schedule Information -->
																	<div class="space-y-2">
																		<div class="text-sm">
																			<span class="text-base-content/70">Ders Saatleri:</span>
																		</div>
																		<div class="flex flex-wrap gap-2">
																			{#each group.day_time_combinations || [] as combo (combo.day)}
																				{@const dayName = TURKISH_DAYS[combo.day]}
																				{#each combo.hours as hour (hour)}
																					<span class="badge badge-sm px-2 py-1 badge-secondary">
																						{dayName}
																						{hour}:00
																					</span>
																				{/each}
																			{/each}
																		</div>
																	</div>

																	<!-- Capacity Information -->
																	<div
																		class="flex items-center justify-between border-t border-base-200 pt-2"
																	>
																		<div class="flex items-center gap-2">
																			<span class="text-sm text-base-content/70">Kapasite:</span>
																		</div>
																		<div class="flex items-center gap-2">
																			<span class="text-sm font-semibold text-success">
																				{group.current_capacity}
																			</span>
																			<span class="text-xs text-base-content/50">/</span>
																			<span class="text-sm text-base-content/70">
																				{group.max_capacity}
																			</span>
																			<span class="text-xs text-base-content/50">öğrenci</span>
																		</div>
																	</div>
																</div>
															</div>
														</div>
													</div>
												</label>
											{/each}
										</div>
									{:else}
										<div class="text-sm text-base-content/60">
											Bu ders için henüz mevcut randevu serisi bulunmuyor.
										</div>
									{/if}
								</div>
							{:else}
								<div class="space-y-3 pt-4">
									<h4 class="font-medium text-base-content">Mevcut Ders Grupları</h4>
									<div class="text-sm text-base-content/60">
										Bu ders için henüz mevcut randevu serisi bulunmuyor.
									</div>
								</div>
							{/if}
						</div>
					</div>
				{:else if (currentStep === 2 && selectedPackage?.package_type === 'private') || (currentStep === 3 && selectedPackage?.package_type === 'group')}
					<!-- Step 2: Room/Trainer Selection & Time Slot Planning -->
					<div class="space-y-6">
						<div class="flex items-center justify-between">
							<h2 class="flex items-center gap-2 text-xl font-semibold">
								<Calendar class="h-5 w-5 text-accent" />
								Kaynak Seçimi & Zaman Planlaması
							</h2>
							{#if selectedPackage}
								<div class="text-sm text-base-content/60">
									{selectedTimeSlots.length} / {selectedPackage.lessons_per_week} zaman dilimi seçildi
								</div>
							{/if}
						</div>

						{#if selectedPackage}
							<div class="space-y-6">
								<!-- Room and Trainer Selection (50/50 split) -->
								<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
									<!-- Room Selection -->
									<div class="form-control">
										<label class="label" for="room-select">
											<span class="label-text font-medium">Oda Seçimi</span>
										</label>
										<select
											id="room-select"
											class="select-bordered select w-full select-primary"
											value={assignmentForm.room_id}
											onchange={handleRoomChange}
										>
											<option value={0} disabled>Oda seçiniz</option>
											{#each rooms as room (room.id)}
												<option value={room.id}>
													{room.name}
												</option>
											{/each}
										</select>
									</div>

									<!-- Trainer Selection -->
									<div class="form-control">
										<label class="label" for="trainer-select">
											<span class="label-text font-medium">Eğitmen Seçimi</span>
										</label>
										<select
											id="trainer-select"
											class="select-bordered select w-full select-info"
											value={assignmentForm.trainer_id}
											onchange={handleTrainerChange}
										>
											<option value={0} disabled>Eğitmen seçiniz</option>
											{#each trainers as trainer (trainer.id)}
												<option value={trainer.id}>
													{trainer.name}
												</option>
											{/each}
										</select>
									</div>
								</div>

								<!-- Schedule Grid - Only show when room and trainer are selected -->
								{#if assignmentForm.room_id > 0 && assignmentForm.trainer_id > 0}
									<!-- Week Navigation above schedule -->
									<div class="mb-6 flex items-center justify-center gap-4">
										<button class="btn btn-outline btn-sm" onclick={goToPreviousWeek} type="button">
											<ChevronLeft size={16} />
										</button>

										<div class="date-picker-container relative w-64 text-center">
											<button
												class="cursor-pointer text-lg font-semibold transition-all hover:underline"
												onclick={toggleDatePicker}
												type="button"
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
														class="input-bordered input input-sm w-full"
														value={formatDateParam(currentWeekStart())}
														onchange={handleDateSelect}
														min={new Date().toISOString().split('T')[0]}
													/>
													<button
														class="btn mt-2 w-full btn-ghost btn-xs"
														onclick={() => (showDatePicker = false)}
														type="button"
													>
														İptal
													</button>
												</div>
											{/if}

											{#if !isCurrentWeek()}
												<button
													class="btn text-info btn-link btn-xs"
													onclick={goToCurrentWeek}
													type="button"
												>
													Bu Haftaya Dön
												</button>
											{:else}
												<div class="px-3 py-1 text-xs text-base-content/60 italic">Bu hafta</div>
											{/if}
										</div>

										<button class="btn btn-outline btn-sm" onclick={goToNextWeek} type="button">
											<ChevronRight size={16} />
										</button>
									</div>

									<WeeklyScheduleGrid
										viewMode="room"
										selectedEntityId={assignmentForm.room_id}
										entities={rooms}
										{appointments}
										weekStart={currentWeekStart()}
										onSlotClick={handleScheduleSlotClick}
										showSlotAvailability={true}
										availabilityCallback={isSlotAvailable}
										canSelectCallback={canSelectSlot}
										selectedSlots={scheduleSelectedSlots}
										pastSlotCallback={isSlotInPast}
									/>
								{:else}
									<div class="py-8 text-center text-base-content/60">
										Oda ve eğitmen seçildikten sonra zaman dilimleri görünecektir
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{:else if (currentStep === 3 && selectedPackage?.package_type === 'private') || (currentStep === 4 && selectedPackage?.package_type === 'group')}
					<!-- Step 3: Trainee Selection -->
					<div class="space-y-6">
						<div class="flex items-center justify-between">
							<h2 class="flex items-center gap-2 text-xl font-semibold">
								<Users class="h-5 w-5 text-accent" />
								Öğrenci Seçimi
							</h2>
							{#if selectedPackage}
								<div class="text-sm text-base-content/60">
									{selectedTrainees.length} / {getAvailableCapacity()} seçildi
								</div>
							{/if}
						</div>

						{#if selectedPackage}
							<div class="space-y-4">
								<!-- Search Input -->
								<div class="form-control max-w-sm">
									<label class="label" for="trainee-search">
										<span class="label-text">Öğrenci Ara</span>
									</label>
									<input
										id="trainee-search"
										type="text"
										class="input-bordered input input-sm"
										placeholder="İsim veya telefon ile ara..."
										bind:value={traineeSearchTerm}
									/>
								</div>

								<!-- Trainee List -->
								<div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
									{#each filteredTrainees as trainee (trainee.id)}
										{@const isExisting = isTraineeInExistingGroup(trainee.id)}
										{@const isSelected = selectedTrainees.includes(trainee.id)}
										<div
											class="cursor-pointer {isExisting ? 'cursor-not-allowed' : ''}"
											role="button"
											tabindex="0"
											onclick={(event) => !isExisting && toggleTrainee(trainee.id, event)}
											onkeydown={(event) =>
												!isExisting &&
												(event.key === 'Enter' || event.key === ' ') &&
												toggleTrainee(trainee.id, event)}
										>
											<div
												class="card border transition-colors {isExisting
													? 'border-base-300 bg-base-100 opacity-60'
													: isSelected
														? 'border-success bg-success/5 hover:bg-success/10'
														: 'hover:bg-base-50'}"
											>
												<div class="card-body p-4">
													<div class="flex items-center">
														{#if isExisting}
															<!-- Existing group member - non-interactive -->
															<div class="flex h-5 w-5 items-center justify-center">
																<Check class="h-3 w-3 text-base-content/40" />
															</div>
														{:else}
															<!-- Regular checkbox for selectable trainees -->
															<input
																type="checkbox"
																class="pointer-events-none checkbox checkbox-sm checkbox-success"
																checked={isSelected}
																readonly
															/>
														{/if}
														<div class="ml-3 flex-1">
															<div
																class="text-sm font-medium {isExisting
																	? 'text-base-content/60'
																	: ''}"
															>
																{trainee.name}
																{#if isExisting}
																	<span class="ml-2 badge badge-xs badge-neutral">Mevcut Üye</span>
																{/if}
															</div>
															{#if trainee.phone}
																<div class="text-xs text-base-content/60">{trainee.phone}</div>
															{/if}
														</div>
													</div>
												</div>
											</div>
										</div>
									{/each}
								</div>

								{#if traineeSearchTerm && filteredTrainees.length === 0}
									<div class="py-8 text-center text-base-content/60">
										Arama kriteriyle eşleşen öğrenci bulunamadı
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/if}

				<!-- Navigation -->
				<div class="flex justify-between pt-8">
					<div>
						{#if currentStep > 1}
							<button class="btn btn-outline" onclick={prevStep}>
								<ArrowLeft class="h-4 w-4" />
								Önceki
							</button>
						{/if}
					</div>
					<div>
						{#if currentStep < totalSteps}
							<button
								class="btn btn-accent"
								disabled={!canProceed()}
								onclick={() => {
									if (currentStep === 1) {
										handleStep1Submit();
									} else if (currentStep === 2 && selectedPackage?.package_type === 'group') {
										handleStep2Submit();
									} else if (
										(currentStep === 2 && selectedPackage?.package_type === 'private') ||
										(currentStep === 3 && selectedPackage?.package_type === 'group')
									) {
										handleResourceTimeSubmit();
									}
								}}
							>
								Sonraki
								<ArrowRight class="h-4 w-4" />
							</button>
						{:else}
							<button
								class="btn btn-accent"
								disabled={!canProceed() || formLoading}
								onclick={handleFinalSubmit}
							>
								{#if formLoading}
									<LoaderCircle class="h-4 w-4 animate-spin" />
								{:else}
									<Check class="h-4 w-4" />
								{/if}
								Kaydı Tamamla
							</button>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
