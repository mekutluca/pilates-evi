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
	import type { SelectedTimeSlot, ExistingGroupLesson, PackagePurchaseForm } from '$lib/types';
	import type { DayOfWeek } from '$lib/types/Schedule';
	import { DAY_NAMES } from '$lib/types/Schedule';
	import {
		getWeekStart,
		formatWeekRange,
		formatDateParam,
		getDateForDayOfWeek
	} from '$lib/utils/date-utils';
	import { getActionErrorMessage } from '$lib/utils/form-utils';
	import Schedule from '$lib/components/schedule.svelte';
	import type { ScheduleSlot } from '$lib/components/schedule.types';
	import DatePicker from '$lib/components/date-picker.svelte';

	let { data } = $props();
	let { packages, appointments } = $derived(data);
	let existingGroupLessons = $derived<ExistingGroupLesson[]>(
		(data as { existingGroupLessons?: ExistingGroupLesson[] }).existingGroupLessons ?? []
	);
	let existingGroupLessonTrainees = $derived<string[]>(
		(data as { existingGroupLessonTrainees?: string[] }).existingGroupLessonTrainees ?? []
	);

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
	let assignmentForm = $state<PackagePurchaseForm>({
		package_id: '',
		room_id: '',
		trainer_id: '',
		start_date: getCurrentWeekMonday(),
		time_slots: [],
		trainee_ids: []
	});

	// Step titles - fixed, always show all 5 steps
	const stepTitles = [
		'Ders Seçimi',
		'Program Seçimi',
		'Kayıt Süresi',
		'Kaynak Seçimi & Zaman Planlaması',
		'Öğrenci Seçimi'
	];

	// Step 1 state
	let selectedPackage = $derived(packages.find((p) => p.id === assignmentForm.package_id));

	// Total steps: always 5
	const totalSteps = 5;

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

		// Use total assignment weeks for conflict checking
		const weeksToCheck =
			selectedPackage.package_type === 'group' && createNewGroupLesson
				? 26
				: totalAssignmentWeeks();
		url.searchParams.set('weeks_duration', weeksToCheck.toString());

		// Add room_id and trainer_id if selected
		if (assignmentForm.room_id) {
			url.searchParams.set('room_id', assignmentForm.room_id);
		}
		if (assignmentForm.trainer_id) {
			url.searchParams.set('trainer_id', assignmentForm.trainer_id);
		}

		// Include selected group lesson ID if an existing group lesson is selected
		if (selectedGroupLessonId) {
			url.searchParams.set('selected_group_lesson_id', selectedGroupLessonId.toString());
		} else {
			url.searchParams.delete('selected_group_lesson_id');
		}

		// Use goto to trigger a server-side reload with new parameters
		await goto(url.toString(), { replaceState: true });
	}

	// Step 2 state (Group lesson selection - only for group packages)
	let selectedGroupLessonId = $state<string | null>(null);
	let createNewGroupLesson = $state(false);

	// Navigation flow tracking
	let navigationPath = $state<number[]>([1]); // Track the actual path taken

	// Registration Duration state (new step before resource selection)
	let packageCount = $state(1); // For private: number of packages to create
	let assignmentWeeks = $state(4); // For group: number of weeks to assign

	// Calculated total weeks for the assignment
	const totalAssignmentWeeks = $derived(() => {
		if (!selectedPackage) return 0;
		if (selectedPackage.package_type === 'private') {
			return (selectedPackage.weeks_duration || 1) * packageCount;
		} else {
			return assignmentWeeks;
		}
	});

	// Step 2/3/4 state (Resource & Time - step number varies based on package type)
	let selectedTimeSlots = $state<SelectedTimeSlot[]>([]);

	// Step 3/4 state (Trainee selection - step number varies based on package type)
	let selectedTrainees = $state<string[]>([]);
	let traineeSearchTerm = $state('');

	// Week navigation state
	let showDatePicker = $state(false);

	// Determine which steps are active in the current flow
	const activeSteps = $derived(() => {
		const steps: number[] = [1]; // Step 1 is always active

		if (!selectedPackage) return steps;

		if (selectedPackage.package_type === 'private') {
			// Private: 1 → 3 → 4 → 5 (skip step 2)
			return [1, 3, 4, 5];
		} else {
			// Group package
			steps.push(2); // Step 2 is always included for group

			if (createNewGroupLesson) {
				// New group: 1 → 2 → 4 → 5 (skip step 3)
				return [1, 2, 4, 5];
			} else if (selectedGroupLessonId) {
				// Existing group: 1 → 2 → 3 → 5 (skip step 4)
				return [1, 2, 3, 5];
			} else {
				// Not yet decided on step 2
				return [1, 2];
			}
		}
	});

	// Check if a step is in the active flow
	const isStepActive = $derived((step: number) => {
		return activeSteps().includes(step);
	});

	// Get next active step
	function getNextStep(fromStep: number): number | null {
		const active = activeSteps();
		const currentIndex = active.indexOf(fromStep);
		if (currentIndex === -1 || currentIndex === active.length - 1) {
			return null;
		}
		return active[currentIndex + 1];
	}

	// Progress calculation based on active steps
	const progress = $derived(() => {
		const active = activeSteps();
		const currentIndex = active.indexOf(currentStep);
		if (currentIndex === -1) return 0;
		return ((currentIndex + 1) / active.length) * 100;
	});

	// Navigation functions
	function nextStep() {
		const next = getNextStep(currentStep);
		if (next !== null) {
			currentStep = next;
			navigationPath.push(next);
		}
	}

	function prevStep() {
		if (navigationPath.length > 1) {
			navigationPath.pop(); // Remove current step
			currentStep = navigationPath[navigationPath.length - 1]; // Go to previous step in path
		}
	}

	// Week navigation - reactive to start_date changes
	const currentWeekStart = $derived.by(() => {
		// In extension mode, use the extension start date
		// Otherwise use the form's start_date or current week
		const startDate = assignmentForm.start_date || getCurrentWeekMonday();
		return getWeekStart(new Date(startDate));
	});

	async function goToPreviousWeek() {
		const currentWeek = currentWeekStart;
		const newWeekStart = new SvelteDate(currentWeek.getTime());
		newWeekStart.setDate(newWeekStart.getDate() - 7);
		assignmentForm.start_date = formatDateParam(newWeekStart);
		await reloadAppointments();
	}

	async function goToNextWeek() {
		const currentWeek = currentWeekStart;
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

	async function handleDateSelect(date: Date) {
		const weekStart = getWeekStart(date);
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
		return currentWeekStart.getTime() === now.getTime();
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
		assignmentForm.room_id = target.value;
		selectedTimeSlots = []; // Clear selections when room changes

		// Reload appointments if both room and trainer are selected
		if (assignmentForm.room_id.length > 0 && assignmentForm.trainer_id.length > 0) {
			await reloadAppointments();
		}
	}

	// Handle trainer selection change
	async function handleTrainerChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		assignmentForm.trainer_id = target.value;
		selectedTimeSlots = []; // Clear selections when trainer changes

		// Reload appointments if both room and trainer are selected
		if (assignmentForm.room_id.length > 0 && assignmentForm.trainer_id.length > 0) {
			await reloadAppointments();
		}
	}

	// Step 1: Package Selection Only
	async function handleStep1Submit() {
		if (!assignmentForm.package_id) {
			toast.error('Ders seçimi gereklidir');
			return;
		}

		// For group packages, reload to get existing group lessons
		if (selectedPackage?.package_type === 'group') {
			await reloadAppointments();
		}

		// Use smart navigation to go to next active step
		nextStep();
	}

	// Step 2: Purchase Selection (only for group packages)
	async function handleStep2Submit() {
		// This is only called for group packages
		if (!selectedPackage || selectedPackage.package_type !== 'group') return;

		if (!createNewGroupLesson && !selectedGroupLessonId) {
			toast.error('Program seçimi gereklidir');
			return;
		}

		// Reload appointments for the selected option
		await reloadAppointments();

		// Use smart navigation - it will automatically go to the correct next step
		// New group: goes to step 4 (resource/time)
		// Existing group: goes to step 3 (duration)
		nextStep();
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

		// Set group_lesson_id if an existing group lesson was selected
		if (selectedGroupLessonId) {
			assignmentForm.group_lesson_id = selectedGroupLessonId;
			// Include duration_weeks for joining existing group lessons
			assignmentForm.duration_weeks = assignmentWeeks;
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
				toast.success(result.data?.message || 'Kayıt tamamlandı');
				goto('/schedule');
			} else if (result.type === 'failure') {
				toast.error(getActionErrorMessage(result));
				console.error('Assignment creation failed:', result);
			} else {
				// Catch-all for unexpected response types
				toast.error('Bir hata oluştu');
				console.error('Unexpected result type:', result);
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Bilinmeyen hata oluştu';
			toast.error(`Bir hata oluştu: ${errorMessage}`);
			console.error('Assignment creation error:', error);
		} finally {
			formLoading = false;
		}
	}

	// Validation for current step
	const canProceed = $derived(() => {
		const isGroupPackage = selectedPackage?.package_type === 'group';

		switch (currentStep) {
			case 1:
				// Step 1: Package selection
				return assignmentForm.package_id.length > 0;
			case 2:
				// Step 2: Group lesson selection (only for group packages)
				return createNewGroupLesson || selectedGroupLessonId !== null;
			case 3:
				// Step 3: Duration selection (for private & existing group)
				if (isGroupPackage) {
					return assignmentWeeks > 0;
				} else {
					return packageCount > 0;
				}
			case 4:
				// Step 4: Resource & time selection (for all flows that reach here)
				return (
					selectedPackage &&
					assignmentForm.room_id.length > 0 &&
					assignmentForm.trainer_id.length > 0 &&
					assignmentForm.start_date !== '' &&
					selectedTimeSlots.length === selectedPackage.lessons_per_week
				);
			case 5: {
				// Step 5: Trainee selection
				if (createNewGroupLesson) {
					// New group lessons don't require trainees
					return true;
				}
				// Private and existing group require trainee selection
				const availableCapacity = getAvailableCapacity();
				return selectedTrainees.length > 0 && selectedTrainees.length <= availableCapacity;
			}
			default:
				return false;
		}
	});

	// Time slot management for step 2
	function handleScheduleSlotClick(_entityId: string, day: DayOfWeek, hour: number) {
		if (!selectedPackage) return;

		const existingIndex = selectedTimeSlots.findIndex(
			(slot) => slot.day === day && slot.hour === hour
		);

		if (existingIndex >= 0) {
			// Remove if already selected
			selectedTimeSlots.splice(existingIndex, 1);
		} else {
			// Calculate the actual date for this day in the current week
			const weekStart = currentWeekStart;
			const slotDate = getDateForDayOfWeek(weekStart, day);
			const dateString = formatDateParam(slotDate);

			if (selectedTimeSlots.length < selectedPackage.lessons_per_week) {
				// Add if not at capacity
				selectedTimeSlots.push({
					day: day,
					hour: hour,
					date: dateString
				});
			} else {
				// At capacity - replace oldest selection with new one
				selectedTimeSlots.shift(); // Remove the first (oldest) selection
				selectedTimeSlots.push({
					day: day,
					hour: hour,
					date: dateString
				});
			}
		}
	}

	// Check if a slot would be in the past based on start date
	function isSlotInPast(_entityId: string, day: DayOfWeek, hour: number): boolean {
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
	function isSlotAvailable(_entityId: string, day: DayOfWeek, hour: number): boolean {
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

		// Calculate all the dates this slot would occur on for the assignment duration
		const startDate = new Date(assignmentForm.start_date);
		const weeksDuration =
			selectedPackage.package_type === 'group' && createNewGroupLesson
				? 26 // For creating new group lesson, check 26 weeks
				: totalAssignmentWeeks(); // For others, use the calculated assignment duration
		const slotDates: string[] = [];

		for (let week = 0; week < weeksDuration; week++) {
			const weekStart = new Date(startDate);
			weekStart.setDate(startDate.getDate() + week * 7);
			const slotDate = getDateForDayOfWeek(weekStart, day);
			slotDates.push(formatDateParam(slotDate));
		}

		// Check if ANY of these dates has a conflicting appointment
		const hasConflict = slotDates.some((dateStr) => {
			return appointments.some((apt) => {
				// Skip appointments without date
				if (!apt.date) return false;

				// Check if it's the exact date and hour
				if (apt.date !== dateStr || apt.hour !== hour) return false;

				// Check if it conflicts with our selected room or trainer
				const roomConflict = apt.room_id === assignmentForm.room_id;
				const trainerConflict = apt.trainer_id === assignmentForm.trainer_id;

				return roomConflict || trainerConflict;
			});
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

	// Slot data provider for Schedule component
	function getSlotData(day: DayOfWeek, hour: number, dateString: string): ScheduleSlot {
		const isPast = isSlotInPast(assignmentForm.room_id, day, hour);
		const isAvailable = isSlotAvailable(assignmentForm.room_id, day, hour);
		const isSelected = scheduleSelectedSlots.some((slot) => slot.day === day && slot.hour === hour);

		// Find existing appointment in this slot
		const appointment = appointments.find((apt) => {
			return apt.room_id === assignmentForm.room_id && apt.date === dateString && apt.hour === hour;
		});

		if (appointment) {
			// Note: appointments in new-assignment don't have relations loaded
			// They're just used to show conflicts, so we show minimal info
			return {
				variant: 'appointment',
				day,
				hour,
				date: dateString,
				title: 'Dolu',
				subtitle: '',
				color: 'error',
				clickable: false
			};
		} else if (isPast) {
			return {
				variant: 'empty',
				day,
				hour,
				date: dateString,
				label: '-'
			};
		} else if (isSelected) {
			return {
				variant: 'available',
				day,
				hour,
				date: dateString,
				label: 'Seçili',
				clickable: true
			};
		} else if (isAvailable && canSelectSlot()) {
			return {
				variant: 'available',
				day,
				hour,
				date: dateString,
				label: 'Seç',
				clickable: true
			};
		} else if (isAvailable && !canSelectSlot()) {
			return {
				variant: 'available',
				day,
				hour,
				date: dateString,
				label: '-',
				disabled: true
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

	// Handle slot click for Schedule component
	function handleNewScheduleSlotClick(slot: ScheduleSlot) {
		if (slot.variant === 'available' && slot.clickable) {
			handleScheduleSlotClick(assignmentForm.room_id, slot.day, slot.hour);
		}
	}

	// Filtered trainees based on search term
	const filteredTrainees = $derived(
		trainees.filter(
			(trainee) =>
				trainee.name.toLowerCase().includes(traineeSearchTerm.toLowerCase()) ||
				(trainee.phone && trainee.phone.includes(traineeSearchTerm))
		)
	);

	// Trainee selection for step 3
	function toggleTrainee(traineeId: string, event?: Event) {
		// Don't allow toggling existing group lesson trainees
		if (existingGroupLessonTrainees && existingGroupLessonTrainees.includes(traineeId)) {
			toast.info('Bu öğrenci zaten programın üyesi');
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

	// Check if a trainee is already in the existing group lesson
	function isTraineeInExistingGroupLesson(traineeId: string): boolean {
		return existingGroupLessonTrainees && existingGroupLessonTrainees.includes(traineeId);
	}

	// Helper to get existing group lesson trainee count
	function getExistingTraineeCount(): number {
		return existingGroupLessonTrainees ? existingGroupLessonTrainees.length : 0;
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
					{#each stepTitles as title, index (index)}
						{@const stepNum = index + 1}
						{@const isActive = isStepActive(stepNum)}
						<div
							class="badge flex items-center gap-1 px-3 py-2 text-xs"
							class:badge-accent={currentStep === stepNum && isActive}
							class:badge-success={currentStep > stepNum && isActive}
							class:badge-outline={currentStep < stepNum}
							class:opacity-40={!isActive}
						>
							{#if !isActive}
								<span class="line-through">{title}</span>
							{:else if currentStep > stepNum}
								<Check class="h-3 w-3" />
								<span class="hidden sm:inline">{title}</span>
								<span class="sm:hidden">{stepNum}</span>
							{:else}
								<span class="hidden sm:inline">{title}</span>
								<span class="sm:hidden">{stepNum}</span>
							{/if}
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

					{#if packages.length === 0}
						<!-- Package Selection -->
							<!-- Empty state when no packages exist -->
							<div class="flex flex-col items-center justify-center py-16 text-center">
								<Dumbbell class="mb-4 h-16 w-16 text-base-content/30" />
								<h3 class="mb-2 text-lg font-semibold text-base-content/70">
									Henüz ders eklenmemiş
								</h3>
								<p class="mb-6 max-w-md text-base-content/60">
									Yeni kayıt oluşturmak için önce ders oluşturmalısınız.
								</p>
								<a href="/packages" class="btn btn-accent">
									<Plus class="h-4 w-4" />
									İlk Dersi Oluştur
								</a>
							</div>
						{:else}
							<!-- Normal Mode - Show all packages -->
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
						{/if}
					</div>
				{:else if currentStep === 2}
					<!-- Step 2: Group Lesson Selection -->
					<div class="space-y-6">
						<h2 class="flex items-center gap-2 text-xl font-semibold">
							<Users class="h-5 w-5 text-accent" />
							Program Seçimi
						</h2>

						<div class="space-y-4">
							<!-- Create New Purchase Option -->
							<label class="cursor-pointer">
								<div
									class="card border transition-all duration-200 hover:shadow-lg {createNewGroupLesson
										? 'border-accent bg-accent/10 shadow-lg'
										: 'hover:border-accent/50'}"
								>
									<div class="card-body p-4">
										<div class="flex items-start gap-3">
											<input
												type="radio"
												class="radio mt-1 radio-sm radio-accent"
												checked={createNewGroupLesson}
												onchange={async () => {
													createNewGroupLesson = true;
													selectedGroupLessonId = null;
													// Clear existing purchase trainees data
													await reloadAppointments();
												}}
											/>
											<div class="flex-1">
												<div class="font-medium">Yeni Program Oluştur</div>
												<div class="mt-1 text-xs text-base-content/60">
													Bu ders için yeni bir program oluşturun ve öğrencileri seçin
												</div>
											</div>
										</div>
									</div>
								</div>
							</label>

							<!-- Existing Purchase Series -->
							{#if existingGroupLessons && existingGroupLessons.length > 0 && selectedPackage}
								{@const packageSeries = existingGroupLessons.filter(
									(series) => series.package_id === selectedPackage.id
								)}
								<div class="space-y-3 pt-4">
									<h4 class="font-medium text-base-content">Mevcut Ders Programları</h4>
									{#if packageSeries.length > 0}
										<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
											{#each packageSeries as groupLesson (groupLesson.group_lesson_id)}
												<label class="cursor-pointer">
													<div
														class="card border-2 transition-all duration-200 hover:shadow-lg {selectedGroupLessonId ===
														groupLesson.group_lesson_id
															? 'border-accent bg-accent/5 shadow-lg ring-2 ring-accent/20'
															: 'border-base-300 hover:border-accent/50 hover:shadow-md'}"
													>
														<div class="card-body p-4">
															<div class="flex items-start gap-3">
																<input
																	type="radio"
																	class="radio mt-1 radio-accent"
																	checked={selectedGroupLessonId === groupLesson.group_lesson_id}
																	onchange={async () => {
																		selectedGroupLessonId = groupLesson.group_lesson_id;
																		createNewGroupLesson = false;
																		// Reload to get existing trainees for this purchase
																		await reloadAppointments();
																	}}
																/>
																<div class="flex-1 space-y-3">
																	<!-- Location & Trainer Info -->
																	<div class="flex flex-wrap gap-4 text-sm">
																		<div class="flex items-center gap-1.5">
																			<span class="text-base-content/70">Oda:</span>
																			<span class="font-medium">{groupLesson.room_name}</span>
																		</div>
																		<div class="flex items-center gap-1.5">
																			<span class="text-base-content/70">Eğitmen:</span>
																			<span class="font-medium">{groupLesson.trainer_name}</span>
																		</div>
																	</div>

																	<!-- Schedule Information -->
																	<div class="space-y-2">
																		<div class="text-sm">
																			<span class="text-base-content/70">Ders Saatleri:</span>
																		</div>
																		<div class="flex flex-wrap gap-2">
																			{#each groupLesson.day_time_combinations || [] as combo (combo.day)}
																				{@const dayName = DAY_NAMES[combo.day as DayOfWeek]}
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
																				{groupLesson.current_capacity}
																			</span>
																			<span class="text-xs text-base-content/50">/</span>
																			<span class="text-sm text-base-content/70">
																				{groupLesson.max_capacity}
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
										<div class="text-sm text-base-content/60">Henüz grup dersi bulunmuyor.</div>
									{/if}
								</div>
							{:else}
								<div class="space-y-3 pt-4">
									<h4 class="font-medium text-base-content">Mevcut Ders Grupları</h4>
									<div class="text-sm text-base-content/60">Henüz grup dersi bulunmuyor.</div>
								</div>
							{/if}
						</div>
					</div>
				{:else if currentStep === 3}
					<!-- Step 3: Registration Duration (Private & Existing Group only) -->
					<div class="space-y-6">
						<h2 class="flex items-center gap-2 text-xl font-semibold">
							<Calendar class="h-5 w-5 text-accent" />
							Kayıt Süresi
						</h2>

						{#if selectedPackage?.package_type === 'private'}
							<!-- Private Package Duration -->
							<div class="space-y-6">
								<div class="rounded-lg border border-base-300 bg-base-100 p-4">
									<div class="text-sm text-base-content/70">
										<strong>{selectedPackage.name}</strong> paketi
										<strong>{selectedPackage.weeks_duration} hafta</strong> sürer ve haftada
										<strong>{selectedPackage.lessons_per_week} ders</strong>
										içerir (toplam
										<strong
											>{(selectedPackage.weeks_duration || 0) * selectedPackage.lessons_per_week} ders</strong
										>).
									</div>
								</div>

								<div class="form-control max-w-md">
									<label class="label" for="package-count">
										<span class="label-text font-medium">
											Kaç Paket Oluşturulacak?
										</span>
									</label>
									<input
										id="package-count"
										type="number"
										min="1"
										max="10"
										class="input-bordered input w-full"
										bind:value={packageCount}
									/>
									<div class="label">
										<span class="label-text-alt text-base-content/60">
											Toplam süre: <strong>{totalAssignmentWeeks()} hafta</strong>
											({totalAssignmentWeeks() * selectedPackage.lessons_per_week} ders)
										</span>
									</div>
								</div>
							</div>
						{:else}
							<!-- Group Package Duration -->
							<div class="space-y-6">
								<div class="rounded-lg border border-base-300 bg-base-100 p-4">
									<div class="text-sm text-base-content/70">
										Grup dersine kaç hafta için kayıt yapılacağını belirleyin.
									</div>
								</div>

								<div class="form-control max-w-md">
									<label class="label" for="assignment-weeks">
										<span class="label-text font-medium">Kayıt Süresi (Hafta)</span>
									</label>
									<input
										id="assignment-weeks"
										type="number"
										min="1"
										max="52"
										class="input-bordered input w-full"
										bind:value={assignmentWeeks}
									/>
									<div class="label">
										<span class="label-text-alt text-base-content/60">
											Toplam: <strong>{assignmentWeeks} hafta</strong>
										</span>
									</div>
								</div>
							</div>
						{/if}
					</div>
				{:else if currentStep === 4}
					<!-- Step 4: Room/Trainer Selection & Time Slot Planning -->
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
											<option value={''} disabled>Oda seçiniz</option>
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
											<option value={''} disabled>Eğitmen seçiniz</option>
											{#each trainers as trainer (trainer.id)}
												<option value={trainer.id}>
													{trainer.name}
												</option>
											{/each}
										</select>
									</div>
								</div>

								<!-- Schedule Grid - Only show when room and trainer are selected -->
								{#if assignmentForm.room_id.length > 0 && assignmentForm.trainer_id.length > 0}
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
												{formatWeekRange(currentWeekStart)}
											</button>

											{#if showDatePicker}
												<div
													class="absolute top-full left-1/2 z-50 mt-2 -translate-x-1/2 transform"
												>
													<DatePicker
														value={currentWeekStart}
														onDateSelect={handleDateSelect}
														onClose={() => (showDatePicker = false)}
													/>
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

									{@const selectedRoom = rooms.find((r) => r.id === assignmentForm.room_id)}
									{#if selectedRoom}
										<Schedule
											weekStart={currentWeekStart}
											entityName={selectedRoom.name || ''}
											entityBadge={{
												text: 'Oda',
												color: 'primary'
											}}
											{getSlotData}
											onSlotClick={handleNewScheduleSlotClick}
										/>
									{/if}
								{:else}
									<div class="py-8 text-center text-base-content/60">
										Oda ve eğitmen seçildikten sonra zaman dilimleri görünecektir
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{:else if currentStep === 5}
					<!-- Step 5: Trainee Selection -->
					<div class="space-y-6">
						<div class="flex items-center justify-between">
							<h2 class="flex items-center gap-2 text-xl font-semibold">
								<Users class="h-5 w-5 text-accent" />
								Öğrenci Seçimi
							</h2>
							{#if selectedPackage && !createNewGroupLesson}
								<div class="text-sm text-base-content/60">
									{selectedTrainees.length} / {getAvailableCapacity()} seçildi
								</div>
							{/if}
						</div>

						{#if selectedPackage && createNewGroupLesson}
							<!-- New group lesson - show message instead of trainee selection -->
							<div class="rounded-lg border border-base-300 bg-base-100 p-4">
								<div class="text-sm text-base-content/70">
									Öğrenci seçimini, grup dersini oluşturduktan sonra tekrar "Yeni Kayıt" ekranından
									yapabilirsiniz.
								</div>
							</div>
						{:else if selectedPackage}
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
										{@const isExisting = isTraineeInExistingGroupLesson(trainee.id)}
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
									} else if (currentStep === 2) {
										handleStep2Submit();
									} else if (currentStep === 3) {
										// Duration step - just move to next
										nextStep();
									} else if (currentStep === 4) {
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
