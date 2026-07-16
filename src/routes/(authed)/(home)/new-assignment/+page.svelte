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
	import type {
		SelectedTimeSlot,
		PackagePurchaseForm,
		AvailableGroupTimeslot,
		SelectedGroupTimeslot
	} from '$lib/types';
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
	import type { ScheduleSlot } from '$lib/types/Schedule';
	import DatePicker from '$lib/components/date-picker.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group/index.js';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { cn } from '$lib/utils/class-utils';
	import { DAY_ORDER } from '$lib/utils/slot-utils';

	let { data } = $props();
	let { packages, appointments } = $derived(data);
	let existingGroupLessonTrainees = $derived(data.existingGroupLessonTrainees ?? []);
	let availableGroupTimeslots = $derived(data.availableGroupTimeslots ?? []);

	// Monday-first ordering for the timeslot day groups; AvailableGroupTimeslot.day is a
	// plain string, hence the widened lookup with an end-of-list fallback for unknown days.
	const dayOrder: Record<string, number> = DAY_ORDER;

	let groupedTimeslots = $derived(() => {
		const grouped: Record<string, AvailableGroupTimeslot[]> = {};

		for (const ts of availableGroupTimeslots) {
			if (!grouped[ts.day]) {
				grouped[ts.day] = [];
			}
			grouped[ts.day].push(ts);
		}

		// Sort hours within each day
		for (const day in grouped) {
			grouped[day].sort((a, b) => a.hour - b.hour);
		}

		// Sort days and return as array of [day, timeslots]
		return Object.entries(grouped).sort(
			([dayA], [dayB]) => (dayOrder[dayA] || 99) - (dayOrder[dayB] || 99)
		);
	});

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
	let selectedGroupTimeslots = $state<SelectedGroupTimeslot[]>([]);
	let joinExistingTimeslots = $state(false); // Flag to indicate joining existing timeslots

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
	let traineeCurrentPage = $state(1);
	const traineesPerPage = 12;

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
			} else if (joinExistingTimeslots && selectedGroupTimeslots.length > 0) {
				// Joining existing timeslots: 1 → 2 → 3 → 5 (skip step 4)
				return [1, 2, 3, 5];
			} else if (selectedGroupLessonId) {
				// Existing group (legacy): 1 → 2 → 3 → 5 (skip step 4)
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

	// Floor at 4 so the landing screen (activeSteps = [1]) doesn't report 100%.
	const progress = $derived(() => {
		const active = activeSteps();
		const currentIndex = active.indexOf(currentStep);
		if (currentIndex === -1) return 0;
		return ((currentIndex + 1) / Math.max(active.length, 4)) * 100;
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

	const currentWeekStart = $derived.by(() => {
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

	// Helper function to format lessons per week display
	function formatLessonsPerWeek(pkg: {
		min_lessons_per_week: number;
		max_lessons_per_week: number;
	}): string {
		return pkg.min_lessons_per_week === pkg.max_lessons_per_week
			? `${pkg.min_lessons_per_week} ders/hafta`
			: `${pkg.min_lessons_per_week}-${pkg.max_lessons_per_week} ders/hafta`;
	}

	// Helper function to format selection counter
	function formatSelectionCounter(
		selected: number,
		pkg: { min_lessons_per_week: number; max_lessons_per_week: number }
	): string {
		return pkg.min_lessons_per_week === pkg.max_lessons_per_week
			? `${selected} / ${pkg.max_lessons_per_week}`
			: `${selected} / ${pkg.min_lessons_per_week}-${pkg.max_lessons_per_week}`;
	}

	// Helper function to check if selection count is valid
	function isValidSelectionCount(
		selected: number,
		pkg: { min_lessons_per_week: number; max_lessons_per_week: number }
	): boolean {
		return selected >= pkg.min_lessons_per_week && selected <= pkg.max_lessons_per_week;
	}

	// Helper function to get validation error message
	function getTimeslotValidationError(pkg: {
		min_lessons_per_week: number;
		max_lessons_per_week: number;
	}): string {
		return pkg.min_lessons_per_week === pkg.max_lessons_per_week
			? `${pkg.min_lessons_per_week} zaman dilimi seçmelisiniz`
			: `${pkg.min_lessons_per_week} ile ${pkg.max_lessons_per_week} arası zaman dilimi seçmelisiniz`;
	}

	// Step 2: Purchase Selection (only for group packages)
	async function handleStep2Submit() {
		// This is only called for group packages
		if (!selectedPackage || selectedPackage.package_type !== 'group') return;

		if (!createNewGroupLesson && !joinExistingTimeslots && !selectedGroupLessonId) {
			toast.error('Program seçimi gereklidir');
			return;
		}

		// Validate timeslot selection if joining existing timeslots
		if (joinExistingTimeslots) {
			if (!isValidSelectionCount(selectedGroupTimeslots.length, selectedPackage)) {
				toast.error(getTimeslotValidationError(selectedPackage));
				return;
			}
		}

		// Reload appointments for the selected option
		await reloadAppointments();

		// Use smart navigation - it will automatically go to the correct next step
		// New group: goes to step 4 (resource/time)
		// Existing timeslots or group: goes to step 3 (duration)
		nextStep();
	}

	// Step 4: Room, Trainer, and Time Slot Selection
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

		// For new group lessons, require at least 1 timeslot (no max limit)
		// For private packages, enforce min/max_lessons_per_week
		const isNewGroupLesson = selectedPackage.package_type === 'group' && createNewGroupLesson;

		if (isNewGroupLesson) {
			if (selectedTimeSlots.length < 1) {
				toast.error('En az bir zaman dilimi seçmelisiniz');
				return;
			}
		} else if (!isValidSelectionCount(selectedTimeSlots.length, selectedPackage)) {
			toast.error(getTimeslotValidationError(selectedPackage));
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

		// Set group_lesson_id if an existing group lesson was selected (legacy flow)
		if (selectedGroupLessonId) {
			assignmentForm.group_lesson_id = selectedGroupLessonId;
			// Include duration_weeks for joining existing group lessons
			assignmentForm.duration_weeks = assignmentWeeks;
		}

		// Set selected_group_timeslots if joining specific timeslots from existing groups
		if (joinExistingTimeslots && selectedGroupTimeslots.length > 0) {
			assignmentForm.selected_group_timeslots = selectedGroupTimeslots;
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
				// Can proceed if creating new group, or selected enough timeslots from existing groups
				if (createNewGroupLesson) return true;
				if (joinExistingTimeslots && selectedPackage) {
					return isValidSelectionCount(selectedGroupTimeslots.length, selectedPackage);
				}
				return selectedGroupLessonId !== null;
			case 3:
				// Step 3: Duration selection (for private & existing group)
				if (isGroupPackage) {
					return assignmentWeeks > 0;
				} else {
					return packageCount > 0;
				}
			case 4: {
				// Step 4: Resource & time selection (for all flows that reach here)
				// For new group lessons, require at least 1 timeslot (no max limit)
				// For private packages, enforce min/max_lessons_per_week
				const isNewGroupLesson = selectedPackage?.package_type === 'group' && createNewGroupLesson;
				const hasValidTimeslots = isNewGroupLesson
					? selectedTimeSlots.length >= 1
					: selectedPackage && isValidSelectionCount(selectedTimeSlots.length, selectedPackage);

				return (
					selectedPackage &&
					assignmentForm.room_id.length > 0 &&
					assignmentForm.trainer_id.length > 0 &&
					assignmentForm.start_date !== '' &&
					hasValidTimeslots
				);
			}
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

	// Time slot management for step 4
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

			// For new group lessons, allow unlimited timeslots (trainer can teach any number)
			// For private packages, enforce max_lessons_per_week restriction
			const isNewGroupLesson = selectedPackage.package_type === 'group' && createNewGroupLesson;

			if (isNewGroupLesson) {
				// No limit for new group lessons
				selectedTimeSlots.push({
					day: day,
					hour: hour,
					date: dateString
				});
			} else if (selectedTimeSlots.length < selectedPackage.max_lessons_per_week) {
				// Add if not at max capacity
				selectedTimeSlots.push({
					day: day,
					hour: hour,
					date: dateString
				});
			} else {
				// At max capacity - replace oldest selection with new one
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

		// Past slots are now considered available for selection (removed restriction)

		// Calculate all the dates this slot would occur on for the assignment duration
		const startDate = new Date(assignmentForm.start_date);
		const weeksDuration =
			selectedPackage.package_type === 'group' && createNewGroupLesson
				? 26 // For creating new group lesson, check 26 weeks
				: totalAssignmentWeeks(); // For others, use the calculated assignment duration
		const slotDates: string[] = [];

		for (let week = 0; week < weeksDuration; week++) {
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Local computation, not reactive state
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

		// Check if room and trainer are selected (required to check availability)
		const hasRoomAndTrainer =
			assignmentForm.room_id.length > 0 && assignmentForm.trainer_id.length > 0;

		// Find existing appointment in this slot
		const appointment = appointments.find((apt) => {
			return apt.room_id === assignmentForm.room_id && apt.date === dateString && apt.hour === hour;
		});

		if (appointment) {
			// Appointment exists in this specific slot
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
		} else if (isSelected) {
			// Selected slot - show with different styling for past dates
			return {
				variant: 'available',
				day,
				hour,
				date: dateString,
				label: isPast ? 'Seçili (Geçmiş)' : 'Seçili',
				clickable: true,
				...(isPast && { color: 'warning' as const }) // Use warning color for past selected slots
			};
		} else if (isAvailable && canSelectSlot()) {
			// Available slot - show with different styling for past dates
			return {
				variant: 'available',
				day,
				hour,
				date: dateString,
				label: isPast ? 'Seç (Geçmiş)' : 'Seç',
				clickable: true,
				...(isPast && { color: 'warning' as const }) // Use warning color for past available slots
			};
		} else if (hasRoomAndTrainer && !isAvailable) {
			// Room and trainer are selected but slot is not available due to conflict
			// Show as "Dolu" instead of "-" for clarity in new-assignment screen
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
		} else {
			// No room/trainer selected yet, or other unavailable state
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

	// Pagination for trainees
	const traineeTotalPages = $derived(Math.ceil(filteredTrainees.length / traineesPerPage));
	const paginatedTrainees = $derived(() => {
		const startIndex = (traineeCurrentPage - 1) * traineesPerPage;
		const endIndex = startIndex + traineesPerPage;
		return filteredTrainees.slice(startIndex, endIndex);
	});

	// Reset page when search term changes
	$effect(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- Dependency tracking for Svelte 5 reactivity
		traineeSearchTerm;
		traineeCurrentPage = 1;
	});

	// Trainee selection for step 3
	function toggleTrainee(traineeId: string) {
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

	// Toggle group timeslot selection
	function toggleGroupTimeslot(timeslot: AvailableGroupTimeslot) {
		if (!selectedPackage) return;

		const isFull = timeslot.current_capacity >= timeslot.max_capacity;
		const isSelected = selectedGroupTimeslots.some(
			(t) =>
				t.group_lesson_id === timeslot.group_lesson_id &&
				t.day === timeslot.day &&
				t.hour === timeslot.hour
		);
		const canSelect = !isFull || isSelected;

		if (!canSelect) return;

		// When selecting timeslots, automatically switch to joinExistingTimeslots mode
		if (!joinExistingTimeslots) {
			joinExistingTimeslots = true;
			createNewGroupLesson = false;
			selectedGroupLessonId = null;
		}

		if (isSelected) {
			// Remove from selection
			selectedGroupTimeslots = selectedGroupTimeslots.filter(
				(t) =>
					!(
						t.group_lesson_id === timeslot.group_lesson_id &&
						t.day === timeslot.day &&
						t.hour === timeslot.hour
					)
			);
			// If no timeslots selected, reset the mode
			if (selectedGroupTimeslots.length === 0) {
				joinExistingTimeslots = false;
			}
		} else if (selectedGroupTimeslots.length < selectedPackage.max_lessons_per_week) {
			// Add to selection
			selectedGroupTimeslots = [
				...selectedGroupTimeslots,
				{
					group_lesson_id: timeslot.group_lesson_id,
					day: timeslot.day,
					hour: timeslot.hour
				}
			];
		} else {
			toast.warning(`Maksimum ${selectedPackage.max_lessons_per_week} zaman dilimi seçebilirsiniz`);
		}
	}

	// Trainee pagination functions
	function goToTraineePage(page: number) {
		if (page >= 1 && page <= traineeTotalPages) {
			traineeCurrentPage = page;
		}
	}

	function getTraineePageNumbers(): (number | string)[] {
		if (traineeTotalPages <= 7) {
			return Array.from({ length: traineeTotalPages }, (_, i) => i + 1);
		}

		const pages: (number | string)[] = [1];

		if (traineeCurrentPage > 3) {
			pages.push('...');
		}

		const startPage = Math.max(2, traineeCurrentPage - 1);
		const endPage = Math.min(traineeTotalPages - 1, traineeCurrentPage + 1);

		for (let i = startPage; i <= endPage; i++) {
			pages.push(i);
		}

		if (traineeCurrentPage < traineeTotalPages - 2) {
			pages.push('...');
		}

		if (traineeTotalPages > 1) {
			pages.push(traineeTotalPages);
		}

		return pages;
	}
</script>

<svelte:head>
	<title>Yeni Kayıt · Pilates Evi</title>
</svelte:head>

<div class="p-4">
	<div class="mx-auto max-w-6xl">
		<!-- Header -->
		<div class="mb-6">
			<h1 class="flex items-center gap-2 text-2xl font-bold">
				<Plus class="h-6 w-6" />
				Yeni Kayıt
			</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				Ders seçin, zaman dilimlerini belirleyin ve öğrencileri atayın
			</p>
		</div>

		<!-- Progress Bar -->
		<Card.Root class="mb-6">
			<Card.Content class="p-4">
				<div class="mb-4">
					<div class="text-sm text-muted-foreground">
						Adım {currentStep} / {totalSteps}
					</div>
				</div>

				<!-- Progress bar -->
				<div class="h-2 w-full rounded-full bg-muted">
					<div
						class="h-2 rounded-full bg-primary transition-all duration-300"
						style="width: {progress()}%"
					></div>
				</div>

				<!-- Step indicators -->
				<div class="mt-4 flex flex-wrap justify-center gap-2 sm:justify-between">
					{#each stepTitles as title, index (index)}
						{@const stepNum = index + 1}
						{@const isActive = isStepActive(stepNum)}
						<Badge
							variant={currentStep === stepNum && isActive
								? 'default'
								: currentStep > stepNum && isActive
									? 'secondary'
									: 'outline'}
							class={cn('flex items-center gap-1 px-3 py-2', !isActive && 'opacity-40')}
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
						</Badge>
					{/each}
				</div>
			</Card.Content>
		</Card.Root>

		<!-- Step Content -->
		<Card.Root>
			<Card.Content class="p-6">
				{#if formLoading}
					<div class="flex items-center justify-center py-12">
						<LoaderCircle size={48} class="animate-spin text-primary" />
						<span class="ml-3 text-lg">Kayıt tamamlanıyor...</span>
					</div>
				{:else if currentStep === 1}
					<!-- Step 1: Package Selection Only -->
					<div class="space-y-6">
						<h2 class="flex items-center gap-2 text-xl font-semibold">
							<Dumbbell class="h-5 w-5 text-muted-foreground" />
							Ders Seçimi
						</h2>

						{#if packages.length === 0}
							<!-- Empty state when no packages exist -->
							<div class="flex flex-col items-center justify-center py-16 text-center">
								<Dumbbell class="mb-4 h-16 w-16 text-muted-foreground/40" />
								<h3 class="mb-2 text-lg font-semibold text-muted-foreground">
									Henüz ders eklenmemiş
								</h3>
								<p class="mb-6 max-w-md text-muted-foreground">
									Yeni kayıt oluşturmak için önce ders oluşturmalısınız.
								</p>
								<Button href="/packages">
									<Plus class="h-4 w-4" />
									İlk Dersi Oluştur
								</Button>
							</div>
						{:else}
							<!-- Normal Mode - Show all packages -->
							<RadioGroup bind:value={assignmentForm.package_id} class="space-y-6">
								<!-- Private Packages -->
								{#if groupedPackages().private.length > 0}
									<div class="space-y-3">
										<h4 class="font-medium">Özel Dersler</h4>
										<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
											{#each groupedPackages().private as pkg (pkg.id)}
												<label class="cursor-pointer">
													<div
														class={cn(
															'rounded-lg border p-4 transition-all duration-200 hover:shadow-lg',
															assignmentForm.package_id === pkg.id
																? 'border-primary bg-primary/10 shadow-lg'
																: 'hover:border-primary/50'
														)}
													>
														<div class="flex items-start gap-3">
															<RadioGroupItem value={pkg.id} class="mt-1" />
															<div class="flex-1">
																<div class="font-medium">{pkg.name}</div>
																<div class="mt-2 text-xs text-muted-foreground">
																	<div>{formatLessonsPerWeek(pkg)}</div>
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
												</label>
											{/each}
										</div>
									</div>
								{/if}

								<!-- Group Packages -->
								{#if groupedPackages().group.length > 0}
									<div class="space-y-3">
										<h4 class="font-medium">Grup Dersleri</h4>
										<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
											{#each groupedPackages().group as pkg (pkg.id)}
												<label class="cursor-pointer">
													<div
														class={cn(
															'rounded-lg border p-4 transition-all duration-200 hover:shadow-lg',
															assignmentForm.package_id === pkg.id
																? 'border-primary bg-primary/10 shadow-lg'
																: 'hover:border-primary/50'
														)}
													>
														<div class="flex items-start gap-3">
															<RadioGroupItem value={pkg.id} class="mt-1" />
															<div class="flex-1">
																<div class="font-medium">{pkg.name}</div>
																<div class="mt-2 text-xs text-muted-foreground">
																	<div>{formatLessonsPerWeek(pkg)}</div>
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
												</label>
											{/each}
										</div>
									</div>
								{/if}
							</RadioGroup>
						{/if}
					</div>
				{:else if currentStep === 2}
					<!-- Step 2: Group Lesson Selection -->
					<div class="space-y-6">
						<h2 class="flex items-center gap-2 text-xl font-semibold">
							<Users class="h-5 w-5 text-muted-foreground" />
							Program Seçimi
						</h2>

						<div class="space-y-4">
							<!-- Create New Group Option -->
							<label class="cursor-pointer">
								<div
									class={cn(
										'rounded-lg border p-4 transition-all duration-200 hover:shadow-lg',
										createNewGroupLesson
											? 'border-primary bg-primary/10 shadow-lg'
											: 'hover:border-primary/50'
									)}
								>
									<div class="flex items-start gap-3">
										<input
											type="radio"
											class="mt-1 size-4 accent-accent"
											checked={createNewGroupLesson}
											onchange={async () => {
												createNewGroupLesson = true;
												joinExistingTimeslots = false;
												selectedGroupLessonId = null;
												selectedGroupTimeslots = [];
												await reloadAppointments();
											}}
										/>
										<div class="flex-1">
											<div class="font-medium">Yeni Program Oluştur</div>
											<div class="mt-1 text-xs text-muted-foreground">
												Bu ders için yeni bir program oluşturun ve öğrencileri seçin
											</div>
										</div>
									</div>
								</div>
							</label>

							<!-- Available Timeslots from Existing Groups -->
							{#if availableGroupTimeslots && availableGroupTimeslots.length > 0 && selectedPackage}
								<div class="space-y-4 pt-4">
									<div class="flex items-center justify-between">
										<h4 class="font-medium">Mevcut Zaman Dilimleri</h4>
										<div class="text-sm text-muted-foreground">
											{formatSelectionCounter(selectedGroupTimeslots.length, selectedPackage)} seçildi
										</div>
									</div>

									<div class="rounded-lg border border-border bg-card p-4">
										<div class="text-sm text-muted-foreground">
											Aşağıdaki mevcut zaman dilimlerinden
											{#if selectedPackage.min_lessons_per_week === selectedPackage.max_lessons_per_week}
												<strong>{selectedPackage.min_lessons_per_week}</strong> tane seçin.
											{:else}
												<strong>{selectedPackage.min_lessons_per_week}</strong> ile
												<strong>{selectedPackage.max_lessons_per_week}</strong> arası seçin.
											{/if}
										</div>
									</div>

									<!-- Grouped by day -->
									<div class="space-y-6">
										{#each groupedTimeslots() as [day, timeslots] (day)}
											{@const dayName = DAY_NAMES[day as DayOfWeek]}
											<div class="space-y-3">
												<h5 class="border-b border-border pb-2 font-medium text-foreground/80">
													{dayName}
												</h5>
												<div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
													{#each timeslots as timeslot (`${timeslot.group_lesson_id}-${timeslot.day}-${timeslot.hour}`)}
														{@const isSelected = selectedGroupTimeslots.some(
															(t) =>
																t.group_lesson_id === timeslot.group_lesson_id &&
																t.day === timeslot.day &&
																t.hour === timeslot.hour
														)}
														{@const isFull = timeslot.current_capacity >= timeslot.max_capacity}
														<div
															class={cn(
																'cursor-pointer',
																isFull && !isSelected && 'cursor-not-allowed'
															)}
															role="button"
															tabindex="0"
															onclick={() => toggleGroupTimeslot(timeslot)}
															onkeydown={(event) => {
																if (event.key === 'Enter' || event.key === ' ') {
																	event.preventDefault();
																	toggleGroupTimeslot(timeslot);
																}
															}}
														>
															<div
																class={cn(
																	'rounded-lg border transition-colors',
																	isFull && !isSelected
																		? 'border-border opacity-50'
																		: isSelected
																			? 'border-foreground/30 bg-muted'
																			: 'border-border hover:border-border/80'
																)}
															>
																<div class="flex items-center gap-3 px-3 py-2">
																	<Checkbox
																		checked={isSelected}
																		disabled={isFull && !isSelected}
																		class="pointer-events-none"
																	/>
																	<div class="min-w-0 flex-1">
																		<div class="text-sm font-medium">
																			{timeslot.hour}:00
																			{#if isFull}
																				<Badge variant="destructive" class="ml-2">Dolu</Badge>
																			{/if}
																		</div>
																		<div class="text-xs text-muted-foreground">
																			{timeslot.room_name} • {timeslot.trainer_name}
																		</div>
																	</div>
																	<div class="text-xs text-muted-foreground">
																		{timeslot.current_capacity}/{timeslot.max_capacity}
																	</div>
																</div>
															</div>
														</div>
													{/each}
												</div>
											</div>
										{/each}
									</div>
								</div>
							{:else}
								<div class="space-y-3 pt-4">
									<h4 class="font-medium">Mevcut Ders Grupları</h4>
									<div class="text-sm text-muted-foreground">Henüz grup dersi bulunmuyor.</div>
								</div>
							{/if}
						</div>
					</div>
				{:else if currentStep === 3}
					<!-- Step 3: Registration Duration (Private & Existing Group only) -->
					<div class="space-y-6">
						<h2 class="flex items-center gap-2 text-xl font-semibold">
							<Calendar class="h-5 w-5 text-muted-foreground" />
							Kayıt Süresi
						</h2>

						{#if selectedPackage?.package_type === 'private'}
							<!-- Private Package Duration -->
							<div class="space-y-6">
								<div class="rounded-lg border border-border bg-card p-4">
									<div class="text-sm text-muted-foreground">
										<strong>{selectedPackage.name}</strong> paketi
										<strong>{selectedPackage.weeks_duration} hafta</strong> sürer ve
										<strong>{formatLessonsPerWeek(selectedPackage)}</strong>
										içerir.
									</div>
								</div>

								<div class="grid max-w-md gap-2">
									<Label for="package-count" class="font-medium">Kaç Paket Oluşturulacak?</Label>
									<Input
										id="package-count"
										type="number"
										min="1"
										max="10"
										bind:value={packageCount}
									/>
									<div class="text-xs text-muted-foreground">
										Toplam süre: <strong>{totalAssignmentWeeks()} hafta</strong>
									</div>
								</div>
							</div>
						{:else}
							<!-- Group Package Duration -->
							<div class="space-y-6">
								<div class="rounded-lg border border-border bg-card p-4">
									<div class="text-sm text-muted-foreground">
										Grup dersine kaç hafta için kayıt yapılacağını belirleyin.
									</div>
								</div>

								<div class="grid max-w-md gap-2">
									<Label for="assignment-weeks" class="font-medium">Kayıt Süresi (Hafta)</Label>
									<Input
										id="assignment-weeks"
										type="number"
										min="1"
										max="52"
										bind:value={assignmentWeeks}
									/>
									<div class="text-xs text-muted-foreground">
										Toplam: <strong>{assignmentWeeks} hafta</strong>
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
								<Calendar class="h-5 w-5 text-muted-foreground" />
								Kaynak Seçimi & Zaman Planlaması
							</h2>
							{#if selectedPackage}
								<div class="text-sm text-muted-foreground">
									{#if selectedPackage.package_type === 'group' && createNewGroupLesson}
										{selectedTimeSlots.length} zaman dilimi seçildi
									{:else}
										{formatSelectionCounter(selectedTimeSlots.length, selectedPackage)} zaman dilimi
										seçildi
									{/if}
								</div>
							{/if}
						</div>

						{#if selectedPackage}
							<div class="space-y-6">
								<!-- Room and Trainer Selection (50/50 split) -->
								<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
									<!-- Room Selection -->
									<div class="grid gap-2">
										<Label for="room-select" class="font-medium">Oda Seçimi</Label>
										<NativeSelect
											id="room-select"
											value={assignmentForm.room_id}
											onchange={handleRoomChange}
										>
											<option value="" disabled>Oda seçiniz</option>
											{#each rooms as room (room.id)}
												<option value={room.id}>{room.name}</option>
											{/each}
										</NativeSelect>
									</div>

									<!-- Trainer Selection -->
									<div class="grid gap-2">
										<Label for="trainer-select" class="font-medium">Eğitmen Seçimi</Label>
										<NativeSelect
											id="trainer-select"
											value={assignmentForm.trainer_id}
											onchange={handleTrainerChange}
										>
											<option value="" disabled>Eğitmen seçiniz</option>
											{#each trainers as trainer (trainer.id)}
												<option value={trainer.id}>{trainer.name}</option>
											{/each}
										</NativeSelect>
									</div>
								</div>

								<!-- Schedule Grid - Only show when room and trainer are selected -->
								{#if assignmentForm.room_id.length > 0 && assignmentForm.trainer_id.length > 0}
									<!-- Week Navigation above schedule -->
									<div class="mb-6 flex items-center justify-center gap-4">
										<Button variant="outline" size="sm" onclick={goToPreviousWeek} type="button">
											<ChevronLeft size={16} />
										</Button>

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
												<Button
													variant="link"
													size="xs"
													class="text-muted-foreground"
													onclick={goToCurrentWeek}
													type="button"
												>
													Bu Haftaya Dön
												</Button>
											{:else}
												<div class="px-3 py-1 text-xs text-muted-foreground italic">Bu hafta</div>
											{/if}
										</div>

										<Button variant="outline" size="sm" onclick={goToNextWeek} type="button">
											<ChevronRight size={16} />
										</Button>
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
									<div class="py-8 text-center text-muted-foreground">
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
								<Users class="h-5 w-5 text-muted-foreground" />
								Öğrenci Seçimi
							</h2>
							{#if selectedPackage && !createNewGroupLesson}
								<div class="text-sm text-muted-foreground">
									{selectedTrainees.length} / {getAvailableCapacity()} seçildi
								</div>
							{/if}
						</div>

						{#if selectedPackage && createNewGroupLesson}
							<!-- New group lesson - show message instead of trainee selection -->
							<div class="rounded-lg border border-border bg-card p-4">
								<div class="text-sm text-muted-foreground">
									Öğrenci seçimini, grup dersini oluşturduktan sonra tekrar "Yeni Kayıt" ekranından
									yapabilirsiniz.
								</div>
							</div>
						{:else if selectedPackage}
							<div class="space-y-4">
								<!-- Search Input -->
								<div class="grid max-w-sm gap-2">
									<Label for="trainee-search">Öğrenci Ara</Label>
									<Input
										id="trainee-search"
										type="text"
										placeholder="İsim veya telefon ile ara..."
										bind:value={traineeSearchTerm}
									/>
								</div>

								<!-- Trainee List -->
								<div class="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
									{#each paginatedTrainees() as trainee (trainee.id)}
										{@const isExisting = isTraineeInExistingGroupLesson(trainee.id)}
										{@const isSelected = selectedTrainees.includes(trainee.id)}
										<div
											class={cn('cursor-pointer', isExisting && 'cursor-not-allowed')}
											role="button"
											tabindex="0"
											onclick={() => !isExisting && toggleTrainee(trainee.id)}
											onkeydown={(event) =>
												!isExisting &&
												(event.key === 'Enter' || event.key === ' ') &&
												toggleTrainee(trainee.id)}
										>
											<div
												class={cn(
													'rounded-lg border p-4 transition-colors',
													isExisting
														? 'border-border bg-card opacity-60'
														: isSelected
															? 'border-primary bg-primary/5 hover:bg-primary/10'
															: 'hover:bg-muted/40'
												)}
											>
												<div class="flex items-center">
													{#if isExisting}
														<div class="flex h-5 w-5 items-center justify-center">
															<Check class="h-3 w-3 text-muted-foreground" />
														</div>
													{:else}
														<Checkbox checked={isSelected} class="pointer-events-none" />
													{/if}
													<div class="ml-3 flex-1">
														<div
															class={cn(
																'text-sm font-medium',
																isExisting && 'text-muted-foreground'
															)}
														>
															{trainee.name}
															{#if isExisting}
																<Badge variant="outline" class="ml-2">Mevcut Üye</Badge>
															{/if}
														</div>
														{#if trainee.phone}
															<div class="text-xs text-muted-foreground">{trainee.phone}</div>
														{/if}
													</div>
												</div>
											</div>
										</div>
									{/each}
								</div>

								{#if traineeSearchTerm && filteredTrainees.length === 0}
									<div class="py-8 text-center text-muted-foreground">
										Arama kriteriyle eşleşen öğrenci bulunamadı
									</div>
								{/if}

								{#if traineeTotalPages > 1}
									<div class="mt-6 flex items-center justify-center gap-1">
										<Button
											variant="outline"
											size="sm"
											onclick={() => goToTraineePage(traineeCurrentPage - 1)}
											disabled={traineeCurrentPage === 1}
											type="button"
										>
											«
										</Button>

										{#each getTraineePageNumbers() as page, index (index)}
											{#if page === '...'}
												<Button variant="outline" size="sm" disabled type="button">...</Button>
											{:else}
												<Button
													variant={traineeCurrentPage === page ? 'default' : 'outline'}
													size="sm"
													onclick={() => goToTraineePage(page as number)}
													type="button"
												>
													{page}
												</Button>
											{/if}
										{/each}

										<Button
											variant="outline"
											size="sm"
											onclick={() => goToTraineePage(traineeCurrentPage + 1)}
											disabled={traineeCurrentPage === traineeTotalPages}
											type="button"
										>
											»
										</Button>
									</div>

									<div class="mt-2 text-center text-sm text-muted-foreground">
										Sayfa {traineeCurrentPage} / {traineeTotalPages} (Toplam {filteredTrainees.length}
										öğrenci)
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
							<Button variant="outline" onclick={prevStep}>
								<ArrowLeft class="h-4 w-4" />
								Önceki
							</Button>
						{/if}
					</div>
					<div>
						{#if currentStep < totalSteps}
							<Button
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
							</Button>
						{:else}
							<Button disabled={!canProceed() || formLoading} onclick={handleFinalSubmit}>
								{#if formLoading}
									<LoaderCircle class="h-4 w-4 animate-spin" />
								{:else}
									<Check class="h-4 w-4" />
								{/if}
								Kaydı Tamamla
							</Button>
						{/if}
					</div>
				</div>
			</Card.Content>
		</Card.Root>
	</div>
</div>
