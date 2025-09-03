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
		getDayOfWeekFromDate
	} from '$lib/utils/date-utils';
	import WeeklyScheduleGrid from '$lib/components/weekly-schedule-grid.svelte';

	let { data } = $props();
	let { packages, appointments } = $derived(data);

	// Access inherited data from parent layout
	let rooms = $derived(data.rooms);
	let trainers = $derived(data.trainers);
	let trainees = $derived(data.trainees);

	// Wizard state
	let currentStep = $state(1);
	const totalSteps = 3;
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

	// Step titles
	const stepTitles = ['Ders Seçimi', 'Kaynak Seçimi & Zaman Planlaması', 'Öğrenci Seçimi'];

	// Step 1 state
	let selectedPackage = $derived(packages.find((p) => p.id === assignmentForm.package_id));

	// Group packages by type (private first, then group)
	const groupedPackages = $derived(() => {
		const private_packages = packages.filter(pkg => pkg.package_type === 'private');
		const group_packages = packages.filter(pkg => pkg.package_type === 'group');
		return { private: private_packages, group: group_packages };
	});

	// Function to reload appointments based on current package and date selection
	async function reloadAppointments() {
		if (!selectedPackage || !assignmentForm.start_date) return;

		const url = new URL(page.url);
		url.searchParams.set('package_id', selectedPackage.id.toString());
		url.searchParams.set('start_date', assignmentForm.start_date);
		url.searchParams.set('weeks_duration', (selectedPackage.weeks_duration || 52).toString());

		// Use goto to trigger a server-side reload with new parameters
		await goto(url.toString(), { replaceState: true });
	}

	// Step 2 state
	let selectedTimeSlots = $state<SelectedTimeSlot[]>([]);

	// Step 3 state
	let selectedTrainees = $state<number[]>([]);
	let traineeSearchTerm = $state('');

	// Week navigation state
	let showDatePicker = $state(false);

	// Progress calculation
	const progress = $derived((currentStep / totalSteps) * 100);

	// Navigation functions
	function nextStep() {
		if (currentStep < totalSteps) {
			currentStep++;
		}
	}

	function prevStep() {
		if (currentStep > 1) {
			currentStep--;
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
		nextStep();
		// Reload appointments for the selected package
		await reloadAppointments();
	}

	// Step 2: Room, Trainer, and Time Slot Selection
	function handleStep2Submit() {
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

		// Check capacity
		if (selectedTrainees.length > selectedPackage.max_capacity) {
			toast.error(`Maksimum ${selectedPackage.max_capacity} öğrenci seçilebilir`);
			return;
		}

		assignmentForm.trainee_ids = selectedTrainees;

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
				toast.success('Randevular başarıyla oluşturuldu');
				goto('/schedule');
			} else {
				toast.error(result.data?.message || 'Bir hata oluştu');
			}
		} catch {
			toast.error('Bir hata oluştu');
		} finally {
			formLoading = false;
		}
	}

	// Validation for current step
	const canProceed = $derived(() => {
		switch (currentStep) {
			case 1:
				// Only package selection required in step 1
				return assignmentForm.package_id > 0;
			case 2:
				// Room, trainer, start date, and time slot selection required in step 2
				return (
					selectedPackage &&
					assignmentForm.room_id > 0 &&
					assignmentForm.trainer_id > 0 &&
					assignmentForm.start_date !== '' &&
					selectedTimeSlots.length === selectedPackage.lessons_per_week
				);
			case 3:
				// Trainee selection (or skip for group packages)
				if (!selectedPackage) return false;
				if (selectedPackage.package_type === 'group') return true;
				return (
					selectedTrainees.length > 0 && selectedTrainees.length <= selectedPackage.max_capacity
				);
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
			const roomConflict = apt.room_id === assignmentForm.room_id;
			const trainerConflict = apt.trainer_id === assignmentForm.trainer_id;

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
	function toggleTrainee(traineeId: number) {
		const index = selectedTrainees.indexOf(traineeId);
		if (index === -1) {
			if (selectedPackage && selectedTrainees.length < selectedPackage.max_capacity) {
				selectedTrainees.push(traineeId);
			} else {
				toast.warning(`Maksimum ${selectedPackage?.max_capacity} öğrenci seçilebilir`);
			}
		} else {
			selectedTrainees.splice(index, 1);
		}
	}
</script>

<div class="min-h-screen bg-base-200 p-4">
	<div class="mx-auto max-w-6xl">
		<!-- Header -->
		<div class="mb-6">
			<h1 class="flex items-center gap-2 text-2xl font-bold">
				<Plus class="h-6 w-6 text-accent" />
				Yeni Randevu Atama
			</h1>
			<p class="mt-1 text-sm text-base-content/60">
				Ders seçin, zaman dilimlerini belirleyin ve öğrencileri atayın
			</p>
		</div>

		<!-- Progress Bar -->
		<div class="card mb-6 bg-base-100 shadow-sm">
			<div class="card-body p-4">
				<div class="mb-4 flex items-center justify-between">
					<div class="text-sm text-base-content/60">
						Adım {currentStep} / {totalSteps}
					</div>
					<div class="text-sm text-base-content/60">
						{Math.round(progress)}% tamamlandı
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
						<span class="ml-3 text-lg">Randevular oluşturuluyor...</span>
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
									<h4 class="font-medium text-base-content">Sabit Öğrencili Dersler</h4>
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
																		{#if pkg.weeks_duration}
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
																		{#if pkg.weeks_duration}
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
				{:else if currentStep === 2}
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
				{:else if currentStep === 3}
					<!-- Step 3: Trainee Selection -->
					<div class="space-y-6">
						<div class="flex items-center justify-between">
							<h2 class="flex items-center gap-2 text-xl font-semibold">
								<Users class="h-5 w-5 text-accent" />
								Öğrenci Seçimi
							</h2>
							{#if selectedPackage}
								<div class="text-sm text-base-content/60">
									{selectedTrainees.length} / {selectedPackage.max_capacity} seçildi
								</div>
							{/if}
						</div>

						{#if selectedPackage}
							<div class="space-y-4">
								<div class="alert alert-info">
									<div class="text-sm">
										{#if selectedPackage.package_type === 'group'}
											<strong>Grup Dersi:</strong> Öğrenci seçimi isteğe bağlıdır. Daha sonra öğrenci
											ekleyip çıkarabilirsiniz.
										{:else}
											<strong>Özel Ders:</strong> Bu ders sadece seçilen öğrenciler için olacaktır.
										{/if}
									</div>
								</div>

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
										<label class="cursor-pointer">
											<div
												class="hover:bg-base-50 card border transition-colors {selectedTrainees.includes(
													trainee.id
												)
													? 'border-success bg-success/5'
													: ''}"
											>
												<div class="card-body p-4">
													<div class="flex items-center">
														<input
															type="checkbox"
															class="checkbox checkbox-sm checkbox-success"
															checked={selectedTrainees.includes(trainee.id)}
															onchange={() => toggleTrainee(trainee.id)}
														/>
														<div class="ml-3 flex-1">
															<div class="text-sm font-medium">{trainee.name}</div>
															{#if trainee.phone}
																<div class="text-xs text-base-content/60">{trainee.phone}</div>
															{/if}
														</div>
													</div>
												</div>
											</div>
										</label>
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
								onclick={currentStep === 1 ? handleStep1Submit : handleStep2Submit}
							>
								Sonraki
								<ArrowRight class="h-4 w-4" />
							</button>
						{:else}
							<button class="btn btn-accent" disabled={!canProceed()} onclick={handleFinalSubmit}>
								<Check class="h-4 w-4" />
								Randevuları Oluştur
							</button>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
