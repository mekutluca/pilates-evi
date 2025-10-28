<script lang="ts">
	import type { PageData } from './$types';
	import type {
		TransferScope,
		TransferConflict,
		ExistingAppointment,
		TransferOperation,
		ShiftMode
	} from '$lib/types/Transfer';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
	import Calendar from '@lucide/svelte/icons/calendar';
	import CalendarArrowUp from '@lucide/svelte/icons/calendar-arrow-up';
	import Package from '@lucide/svelte/icons/package';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import CheckCircle from '@lucide/svelte/icons/check-circle';
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
	import { DAY_NAMES, getTimeRangeString, type DayOfWeek } from '$lib/types/Schedule';
	import {
		getDayOfWeekFromDate,
		addWeeksToDate,
		buildAppointmentSlots
	} from '$lib/utils/date-utils';

	const { data }: { data: PageData } = $props();

	// Form state
	let operation = $state<TransferOperation>('transfer');
	let shiftMode = $state<ShiftMode>('by_time');
	let scope = $state<TransferScope>('single');
	let selectedRoomId = $state('');
	let selectedTrainerId = $state('');
	let weeksToShift = $state(1);
	let slotsToShift = $state(1);
	let checking = $state(false);
	let conflicts = $state<TransferConflict[]>([]);
	let appointmentsChecked = $state(0);
	let hasChecked = $state(false);
	let transferring = $state(false);

	// Computed values
	const packageName = $derived(
		data.appointment.pe_purchases?.pe_packages?.name ||
			data.appointment.pe_group_lessons?.pe_packages?.name ||
			'Paket bilgisi yok'
	);

	const traineeNames = $derived(
		data.appointment.pe_appointment_trainees.map((at) => at.pe_trainees?.name || '-').join(', ')
	);

	const hasRoomSelected = $derived(selectedRoomId !== '');
	const hasTrainerSelected = $derived(selectedTrainerId !== '');
	const hasBothSelected = $derived(hasRoomSelected && hasTrainerSelected);
	const hasConflicts = $derived(conflicts.length > 0);
	const isTransferMode = $derived(operation === 'transfer');
	const isShiftMode = $derived(operation === 'shift');
	const isShiftByTimeMode = $derived(isShiftMode && shiftMode === 'by_time');
	const isShiftBySlotMode = $derived(isShiftMode && shiftMode === 'by_slot');
	const hasValidWeeks = $derived(weeksToShift !== 0 && !isNaN(weeksToShift));
	const hasValidSlots = $derived(slotsToShift > 0 && !isNaN(slotsToShift));
	const canProceed = $derived(
		hasChecked &&
			!hasConflicts &&
			!checking &&
			!transferring &&
			((isShiftByTimeMode && hasValidWeeks) ||
				(isShiftBySlotMode && hasValidSlots) ||
				(isTransferMode && hasBothSelected))
	);

	// Auto-set scope to 'from_selected' when switching to shift mode
	$effect(() => {
		if (isShiftMode && scope !== 'from_selected') {
			untrack(() => {
				scope = 'from_selected';
			});
		}
	});

	// Auto-check conflicts when selections change
	$effect(() => {
		operation;
		shiftMode;
		scope;
		selectedRoomId;
		selectedTrainerId;
		weeksToShift;
		slotsToShift;

		const bothSelected = untrack(() => hasBothSelected);
		const shiftByTime = untrack(() => isShiftByTimeMode);
		const shiftBySlot = untrack(() => isShiftBySlotMode);
		const validWeeks = untrack(() => hasValidWeeks);
		const validSlots = untrack(() => hasValidSlots);

		// Reset check status if conditions aren't met
		if (
			(shiftByTime && !validWeeks) ||
			(shiftBySlot && !validSlots) ||
			(isTransferMode && !bothSelected)
		) {
			untrack(() => {
				hasChecked = false;
				conflicts = [];
				appointmentsChecked = 0;
			});
		} else {
			checkConflicts();
		}
	});

	function getAppointmentsToCheck() {
		if (scope === 'single') {
			return [
				{
					date: data.appointment.date,
					hour: data.appointment.hour,
					id: data.appointment.id
				}
			];
		} else if (scope === 'from_selected') {
			return data.futureAppointments;
		} else {
			return data.allFromNowAppointments;
		}
	}

	async function checkConflicts() {
		untrack(() => {
			checking = true;
		});

		try {
			const appointmentsToCheck = getAppointmentsToCheck();
			const validAppointments = appointmentsToCheck.filter(
				(a) => a.date !== null && a.hour !== null
			) as Array<{ date: string; hour: number; id: number }>;

			if (validAppointments.length === 0) {
				untrack(() => {
					hasChecked = true;
					conflicts = [];
					appointmentsChecked = 0;
				});
				return;
			}

			// For shift by time mode, adjust the dates
			// For shift by slot mode, shift each appointment to the next slot
			let appointmentsToCheckWithDates;
			if (isShiftByTimeMode) {
				appointmentsToCheckWithDates = validAppointments.map((a) => ({
					...a,
					date: addWeeksToDate(a.date, weeksToShift)
				}));
			} else if (isShiftBySlotMode) {
				// Extract the time slot pattern (day of week + hour) from existing appointments
				const timeSlots: Array<{ day: DayOfWeek; hour: number }> = [];
				const seenSlots = new Set<string>();

				for (const apt of validAppointments) {
					const day = getDayOfWeekFromDate(apt.date) as DayOfWeek;
					const slotKey = `${day}-${apt.hour}`;

					if (!seenSlots.has(slotKey)) {
						seenSlots.add(slotKey);
						timeSlots.push({ day, hour: apt.hour });
					}
				}

				// Sort time slots by day of week and hour to ensure consistent ordering
				const dayOrder = {
					sunday: 0,
					monday: 1,
					tuesday: 2,
					wednesday: 3,
					thursday: 4,
					friday: 5,
					saturday: 6
				};
				timeSlots.sort((a, b) => {
					const dayDiff = dayOrder[a.day] - dayOrder[b.day];
					if (dayDiff !== 0) return dayDiff;
					return a.hour - b.hour;
				});

				// Build slots: existing + enough new ones to cover the shift
				const firstAppointmentDate = new Date(validAppointments[0].date);
				const totalSlotsNeeded = validAppointments.length + slotsToShift;
				const allSlots = buildAppointmentSlots(timeSlots, firstAppointmentDate, totalSlotsNeeded);

				// Each appointment shifts to the slot N positions ahead
				appointmentsToCheckWithDates = validAppointments.map((a, index) => {
					const targetIndex = index + slotsToShift;
					const targetSlot = allSlots[targetIndex];

					return {
						...a,
						date: targetSlot.date,
						hour: targetSlot.hour
					};
				});
			} else {
				appointmentsToCheckWithDates = validAppointments;
			}

			const dates = appointmentsToCheckWithDates.map((a) => a.date);
			const minDate = dates[0];
			const maxDate = dates[dates.length - 1];

			// For shift mode, use the original room and trainer IDs
			const roomIdToCheck = isShiftMode ? data.appointment.room_id || '' : selectedRoomId;
			const trainerIdToCheck = isShiftMode ? data.appointment.trainer_id || '' : selectedTrainerId;

			const response = await fetch(
				`/api/check-conflicts?room_id=${roomIdToCheck}&trainer_id=${trainerIdToCheck}&start_date=${minDate}&end_date=${maxDate}`
			);

			if (!response.ok) {
				throw new Error('Failed to check conflicts');
			}

			const result = await response.json();
			const existingAppointments = (result.appointments || []) as ExistingAppointment[];

			// Get all appointment IDs in the series that will be shifted (to exclude from conflicts)
			const appointmentIdsInSeries = new Set(validAppointments.map((a) => a.id));

			const foundConflicts: TransferConflict[] = [];
			for (let i = 0; i < validAppointments.length; i++) {
				const originalAppt = validAppointments[i];
				const checkAppt = appointmentsToCheckWithDates[i];

				const conflict = existingAppointments.find(
					(existing) =>
						existing.date === checkAppt.date &&
						existing.hour === checkAppt.hour &&
						existing.id !== originalAppt.id &&
						!appointmentIdsInSeries.has(existing.id) // Exclude appointments in the same series
				);

				if (conflict) {
					const isRoomConflict = conflict.room_id === roomIdToCheck;
					const isTrainerConflict = conflict.trainer_id === trainerIdToCheck;

					if (isRoomConflict || isTrainerConflict) {
						foundConflicts.push({
							appointmentId: originalAppt.id,
							date: checkAppt.date,
							hour: checkAppt.hour,
							roomConflict: isRoomConflict,
							trainerConflict: isTrainerConflict
						});
					}
				}
			}

			untrack(() => {
				conflicts = foundConflicts;
				appointmentsChecked = validAppointments.length;
				hasChecked = true;
			});
		} catch (error) {
			console.error('Conflict check error:', error);
			untrack(() => {
				hasChecked = false;
				conflicts = [];
				appointmentsChecked = 0;
			});
		} finally {
			untrack(() => {
				checking = false;
			});
		}
	}

	async function handleTransfer() {
		if (!canProceed) return;

		transferring = true;

		try {
			const formData = new FormData();
			formData.append('appointment_id', data.appointment.id.toString());
			formData.append('scope', scope);

			let actionName = 'transfer';
			let successMessage = 'Değişiklik başarıyla tamamlandı';

			if (isShiftByTimeMode) {
				actionName = 'shift_by_time';
				formData.append('weeks', weeksToShift.toString());
				successMessage = 'Zamana göre kaydırma başarıyla tamamlandı';
			} else if (isShiftBySlotMode) {
				actionName = 'shift_by_slot';
				formData.append('slots', slotsToShift.toString());
				successMessage = 'Tekli kaydırma başarıyla tamamlandı';
			} else {
				formData.append('new_room_id', selectedRoomId);
				formData.append('new_trainer_id', selectedTrainerId);
				formData.append('change_room', hasRoomSelected.toString());
				formData.append('change_trainer', hasTrainerSelected.toString());
			}

			const response = await fetch(`?/${actionName}`, {
				method: 'POST',
				body: formData
			});

			const result = await response.json();

			if (result.type === 'redirect' || result.type === 'success') {
				toast.success(successMessage);
				goto(result.location || '/schedule');
			} else if (result.type === 'failure') {
				toast.error(result.data?.message || 'Bir hata oluştu');
			} else {
				toast.error('Bir hata oluştu');
				console.error('Unexpected result type:', result);
			}
		} catch (error) {
			console.error('Transfer error:', error);
			toast.error('Bir hata oluştu');
		} finally {
			transferring = false;
		}
	}

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleDateString('tr-TR', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}

	function formatDateWithDay(dateString: string): string {
		const dayOfWeek = getDayOfWeekFromDate(dateString);
		const formattedDate = formatDate(dateString);
		return dayOfWeek ? `${formattedDate}, ${DAY_NAMES[dayOfWeek as DayOfWeek]}` : formattedDate;
	}
</script>

<div class="p-4">
	<div class="mx-auto max-w-7xl">
		<!-- Header with Action Button -->
		<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
			<div>
				<h1 class="flex items-center gap-2 text-2xl font-bold">
					{#if isShiftMode}
						<CalendarArrowUp class="h-6 w-6 text-warning" />
						Randevu Kaydır
					{:else}
						<ArrowLeftRight class="h-6 w-6 text-warning" />
						Randevu Değiştir
					{/if}
				</h1>
				<p class="mt-1 text-sm text-base-content/60">
					{#if isShiftMode}
						Randevuları ileri veya geri kaydırın
					{:else}
						Oda ve/veya eğitmen değiştirerek randevuyu aktarın
					{/if}
				</p>
			</div>
			<div class="flex gap-3">
				<a href="/schedule" class="btn btn-ghost">İptal</a>
				<button class="btn btn-warning" disabled={!canProceed} onclick={handleTransfer}>
					{#if transferring}
						<LoaderCircle class="h-4 w-4 animate-spin" />
					{:else if isShiftMode}
						<CalendarArrowUp class="h-4 w-4" />
					{:else}
						<ArrowLeftRight class="h-4 w-4" />
					{/if}
					{isShiftMode ? 'Kaydırmayı Onayla' : 'Değişikliği Onayla'}
				</button>
			</div>
		</div>

		<!-- 3-Column Layout -->
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
			<!-- Column 1: Transfer Settings -->
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body">
					<h2 class="card-title text-lg">
						<Calendar class="h-5 w-5 text-warning" />
						İşlem Tipi
					</h2>

					<!-- Operation Selection -->
					<div class="space-y-2">
						<div class="form-control">
							<label class="label cursor-pointer justify-start gap-3">
								<input
									type="radio"
									name="operation"
									class="radio radio-warning"
									value="transfer"
									checked={operation === 'transfer'}
									onchange={() => (operation = 'transfer')}
								/>
								<div class="flex flex-col">
									<span class="text-sm text-base-content">Oda/Eğitmen Değiştir</span>
									<span class="text-xs text-base-content/60"
										>Randevuyu farklı oda veya eğitmene aktar</span
									>
								</div>
							</label>
						</div>

						<div class="form-control">
							<label class="label cursor-pointer justify-start gap-3">
								<input
									type="radio"
									name="operation"
									class="radio radio-warning"
									value="shift"
									checked={operation === 'shift'}
									onchange={() => (operation = 'shift')}
								/>
								<div class="flex flex-col">
									<span class="text-sm text-base-content">Tarih Kaydır</span>
									<span class="text-xs text-base-content/60">Randevuları ileri kaydır</span>
								</div>
							</label>
						</div>
					</div>

					<!-- Shift Mode Selection (only show when in shift mode) -->
					{#if isShiftMode}
						<div class="mt-4">
							<h3 class="mb-2 text-sm font-medium text-base-content/70">Kaydırma Tipi</h3>
							<div class="space-y-2">
								<div class="form-control">
									<label class="label cursor-pointer justify-start gap-3">
										<input
											type="radio"
											name="shiftMode"
											class="radio radio-sm radio-warning"
											value="by_time"
											checked={shiftMode === 'by_time'}
											onchange={() => (shiftMode = 'by_time')}
										/>
										<div class="flex flex-col">
											<span class="text-sm text-base-content">Haftalık</span>
											<span class="text-xs text-base-content/60"
												>Tüm randevuları belirtilen hafta kadar kaydır</span
											>
										</div>
									</label>
								</div>

								<div class="form-control">
									<label class="label cursor-pointer justify-start gap-3">
										<input
											type="radio"
											name="shiftMode"
											class="radio radio-sm radio-warning"
											value="by_slot"
											checked={shiftMode === 'by_slot'}
											onchange={() => (shiftMode = 'by_slot')}
										/>
										<div class="flex flex-col">
											<span class="text-sm text-base-content">Tekli</span>
											<span class="text-xs text-base-content/60"
												>Her randevuyu bir sonraki randevunun yerine kaydır</span
											>
										</div>
									</label>
								</div>
							</div>
						</div>
					{/if}

					<div class="divider"></div>

					<h2 class="text-sm font-medium text-base-content/70">Kapsam</h2>

					<!-- Scope Selection -->
					<div class="space-y-2">
						{#if isTransferMode}
							<div class="form-control">
								<label class="label cursor-pointer justify-start gap-3">
									<input
										type="radio"
										name="scope"
										class="radio radio-warning"
										value="single"
										checked={scope === 'single'}
										onchange={() => (scope = 'single')}
									/>
									<span class="text-sm text-base-content">Sadece bu randevu</span>
								</label>
							</div>
						{/if}

						{#if data.futureAppointmentCount > 1}
							<div class="form-control">
								<label class="label cursor-pointer justify-start gap-3">
									<input
										type="radio"
										name="scope"
										class="radio radio-warning"
										value="from_selected"
										checked={scope === 'from_selected'}
										onchange={() => (scope = 'from_selected')}
									/>
									<span class="text-sm text-base-content"
										>Seçilen ve sonraki tüm randevular ({data.futureAppointmentCount})</span
									>
								</label>
							</div>
						{/if}

						{#if isTransferMode && data.allFromNowCount > 1}
							<div class="form-control">
								<label class="label cursor-pointer justify-start gap-3">
									<input
										type="radio"
										name="scope"
										class="radio radio-warning"
										value="all_from_now"
										checked={scope === 'all_from_now'}
										onchange={() => (scope = 'all_from_now')}
									/>
									<span class="text-sm text-base-content"
										>Bugünden itibaren tüm randevular ({data.allFromNowCount})</span
									>
								</label>
							</div>
						{/if}
					</div>

					<div class="divider"></div>

					{#if isShiftByTimeMode}
						<!-- Weeks Selection -->
						<div class="form-control">
							<label class="label" for="weeks-input">
								<span class="label-text font-medium">Kaydırma Süresi</span>
							</label>
							<div class="flex gap-2">
								<input
									id="weeks-input"
									type="number"
									class="input-bordered input flex-1 input-warning"
									min="-52"
									max="52"
									bind:value={weeksToShift}
								/>
								<span class="flex items-center text-sm text-base-content/60">hafta</span>
							</div>
							<div class="label">
								<span class="label-text-alt text-base-content/60">
									{#if weeksToShift > 0}
										İleri kaydır: {weeksToShift} hafta sonraya
									{:else if weeksToShift < 0}
										Geri kaydır: {Math.abs(weeksToShift)} hafta öncesine
									{:else}
										Değişiklik yok
									{/if}
								</span>
							</div>
						</div>
					{:else if isShiftBySlotMode}
						<!-- Slots Selection -->
						<div class="form-control">
							<label class="label" for="slots-input">
								<span class="label-text font-medium">Kaydırma Sayısı</span>
							</label>
							<div class="flex gap-2">
								<input
									id="slots-input"
									type="number"
									class="input-bordered input flex-1 input-warning"
									min="1"
									max="20"
									bind:value={slotsToShift}
								/>
								<span class="flex items-center text-sm text-base-content/60">randevu</span>
							</div>
							<div class="label">
								<span class="label-text-alt text-base-content/60">
									Her randevu {slotsToShift} randevu ileri kayacak
								</span>
							</div>
						</div>
					{:else if isTransferMode}
						<!-- Room Selection -->
						<div class="form-control">
							<label class="label" for="room-select">
								<span class="label-text font-medium">Oda</span>
							</label>
							<select
								id="room-select"
								class="select-bordered select w-full"
								class:select-warning={hasRoomSelected}
								bind:value={selectedRoomId}
							>
								<option value="" disabled>Oda seçin</option>
								{#each data.rooms as room (room.id)}
									<option value={room.id}>{room.name}</option>
								{/each}
							</select>
						</div>

						<!-- Trainer Selection -->
						<div class="form-control">
							<label class="label" for="trainer-select">
								<span class="label-text font-medium">Eğitmen</span>
							</label>
							<select
								id="trainer-select"
								class="select-bordered select w-full"
								class:select-warning={hasTrainerSelected}
								bind:value={selectedTrainerId}
							>
								<option value="" disabled>Eğitmen seçin</option>
								{#each data.trainers as trainer (trainer.id)}
									<option value={trainer.id}>{trainer.name}</option>
								{/each}
							</select>
						</div>
					{/if}
				</div>
			</div>

			<!-- Column 2: Current Appointment Details -->
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body">
					<h2 class="card-title text-lg">
						<Package class="h-5 w-5 text-warning" />
						Mevcut Randevu Bilgileri
					</h2>

					<div class="space-y-3">
						<!-- Trainees -->
						<div>
							<div class="text-xs text-base-content/60">Öğrenciler</div>
							<div class="font-medium">{traineeNames}</div>
						</div>

						<!-- Package -->
						<div>
							<div class="text-xs text-base-content/60">Paket</div>
							<div class="font-medium">{packageName}</div>
						</div>
					</div>

					<div class="divider my-2"></div>

					<!-- Affected Appointments List -->
					<div>
						<div class="mb-2 text-xs font-medium text-base-content/60">
							Etkilenecek Randevular
							{#if scope === 'single'}
								(1 randevu)
							{:else if scope === 'from_selected'}
								({data.futureAppointmentCount} randevu)
							{:else}
								({data.allFromNowCount} randevu)
							{/if}
						</div>

						<div class="max-h-[300px] space-y-1 overflow-y-auto">
							{#if scope === 'single'}
								{@const appt = data.appointment}
								<div class="rounded bg-base-200 px-3 py-2 text-sm">
									<div class="font-medium">
										{#if appt.date}
											{#if isShiftByTimeMode && weeksToShift !== 0}
												<span class="text-base-content/50 line-through"
													>{formatDateWithDay(appt.date)}</span
												>
												<span class="mx-1">→</span>
												<span>{formatDateWithDay(addWeeksToDate(appt.date, weeksToShift))}</span>
											{:else}
												{formatDateWithDay(appt.date)}
											{/if}
										{/if}
									</div>
									<div class="text-xs text-base-content/60">
										{#if appt.hour !== null}
											{getTimeRangeString(appt.hour)}
										{/if}
									</div>
									<div class="mt-1 flex gap-2 text-xs">
										<span class="text-base-content/50">Oda: {appt.pe_rooms?.name || '-'}</span>
										<span class="text-base-content/50">•</span>
										<span class="text-base-content/50"
											>Eğitmen: {appt.pe_trainers?.name || '-'}</span
										>
									</div>
								</div>
							{:else}
								{@const appointments =
									scope === 'from_selected' ? data.futureAppointments : data.allFromNowAppointments}
								{@const allSlotsForPreview = (() => {
									if (!isShiftBySlotMode || slotsToShift <= 0) return null;

									// Extract time slot pattern
									const timeSlots: Array<{ day: DayOfWeek; hour: number }> = [];
									const seenSlots = new Set<string>();

									for (const apt of appointments) {
										if (!apt.date || apt.hour === null) continue;
										const day = getDayOfWeekFromDate(apt.date) as DayOfWeek;
										const slotKey = `${day}-${apt.hour}`;

										if (!seenSlots.has(slotKey)) {
											seenSlots.add(slotKey);
											timeSlots.push({ day, hour: apt.hour });
										}
									}

									// Sort time slots
									const dayOrder = {
										sunday: 0,
										monday: 1,
										tuesday: 2,
										wednesday: 3,
										thursday: 4,
										friday: 5,
										saturday: 6
									};
									timeSlots.sort((a, b) => {
										const dayDiff = dayOrder[a.day] - dayOrder[b.day];
										if (dayDiff !== 0) return dayDiff;
										return a.hour - b.hour;
									});

									// Build full schedule using utility function
									const firstDate = new Date(appointments[0].date!);
									const totalSlotsNeeded = appointments.length + slotsToShift;
									return buildAppointmentSlots(timeSlots, firstDate, totalSlotsNeeded);
								})()}
								{#each appointments as appt, index (appt.id)}
									{@const targetAppt =
										isShiftBySlotMode && allSlotsForPreview
											? allSlotsForPreview[index + slotsToShift]
											: null}
									<div class="rounded bg-base-200 px-3 py-2 text-sm">
										<div class="font-medium">
											{#if appt.date}
												{#if isShiftByTimeMode && weeksToShift !== 0}
													<span class="text-base-content/50 line-through"
														>{formatDateWithDay(appt.date)}</span
													>
													<span class="mx-1">→</span>
													<span>{formatDateWithDay(addWeeksToDate(appt.date, weeksToShift))}</span>
												{:else if isShiftBySlotMode && slotsToShift > 0 && targetAppt?.date}
													<span class="text-base-content/50 line-through"
														>{formatDateWithDay(appt.date)}</span
													>
													<span class="mx-1">→</span>
													<span>{formatDateWithDay(targetAppt.date)}</span>
												{:else}
													{formatDateWithDay(appt.date)}
												{/if}
											{/if}
										</div>
										<div class="text-xs text-base-content/60">
											{#if isShiftBySlotMode && targetAppt && targetAppt.hour !== null && targetAppt.hour !== appt.hour}
												<span class="text-base-content/40 line-through">
													{#if appt.hour !== null}
														{getTimeRangeString(appt.hour)}
													{/if}
												</span>
												<span class="mx-1">→</span>
												<span>{getTimeRangeString(targetAppt.hour)}</span>
											{:else if appt.hour !== null}
												{getTimeRangeString(appt.hour)}
											{/if}
										</div>
										<div class="mt-1 flex gap-2 text-xs">
											<span class="text-base-content/50">Oda: {appt.room_name || '-'}</span>
											<span class="text-base-content/50">•</span>
											<span class="text-base-content/50">Eğitmen: {appt.trainer_name || '-'}</span>
										</div>
									</div>
								{/each}
							{/if}
						</div>
					</div>
				</div>
			</div>

			<!-- Column 3: Conflict Check Results -->
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body">
					<h2 class="card-title text-lg">
						<Calendar class="h-5 w-5 text-warning" />
						Çakışma Kontrolü
					</h2>

					<div class="relative min-h-[200px]">
						{#if !hasBothSelected && !isShiftMode}
							<div class="flex flex-col items-center justify-center py-12 text-center">
								<ArrowLeftRight class="h-12 w-12 text-base-content/30" />
								<p class="mt-3 text-sm text-base-content/60">
									Oda ve eğitmen seçtiğinizde<br />çakışma kontrolü yapılacak
								</p>
							</div>
						{:else if isShiftMode && !hasValidWeeks}
							<div class="flex flex-col items-center justify-center py-12 text-center">
								<CalendarArrowUp class="h-12 w-12 text-base-content/30" />
								<p class="mt-3 text-sm text-base-content/60">
									Kaydırma süresi giriniz<br />çakışma kontrolü yapılacak
								</p>
							</div>
						{:else if hasChecked}
							<!-- Status Banner -->
							<div class="mb-4">
								{#if hasConflicts}
									<div class="flex flex-col items-center justify-center py-8">
										<AlertTriangle class="mb-3 h-12 w-12 text-error" />
										<div class="text-center">
											<div class="text-lg font-bold text-error">Çakışma Tespit Edildi</div>
											<div class="mt-1 text-sm text-base-content/60">
												{conflicts.length} randevuda çakışma var
											</div>
										</div>
									</div>
								{:else}
									<div class="flex flex-col items-center justify-center py-8">
										<CheckCircle class="mb-3 h-12 w-12 text-success" />
										<div class="text-center">
											<div class="text-lg font-bold text-success">
												{isShiftMode ? 'Kaydırma Hazır' : 'Aktarma Hazır'}
											</div>
											<div class="mt-1 text-sm text-base-content/60">
												{appointmentsChecked} randevu kontrol edildi
											</div>
										</div>
									</div>
								{/if}
							</div>

							<!-- Conflicts Table -->
							{#if hasConflicts}
								<div class="overflow-x-auto">
									<table class="table table-xs">
										<thead>
											<tr>
												<th>Tarih</th>
												<th>Saat</th>
												<th>Durum</th>
											</tr>
										</thead>
										<tbody>
											{#each conflicts as conflict (conflict.appointmentId)}
												<tr>
													<td class="text-xs">
														{#if conflict.date}
															{formatDate(conflict.date)}
														{:else}
															-
														{/if}
													</td>
													<td class="text-xs">
														{#if conflict.hour !== null}
															{getTimeRangeString(conflict.hour)}
														{:else}
															-
														{/if}
													</td>
													<td>
														{#if conflict.roomConflict && conflict.trainerConflict}
															<div class="flex flex-col gap-1">
																<span class="badge badge-xs badge-error">Oda Dolu</span>
																<span class="badge badge-xs badge-error">Eğitmen Dolu</span>
															</div>
														{:else if conflict.roomConflict}
															<span class="badge badge-xs badge-error">Oda Dolu</span>
														{:else if conflict.trainerConflict}
															<span class="badge badge-xs badge-error">Eğitmen Dolu</span>
														{/if}
													</td>
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							{/if}
						{:else}
							<!-- Empty state while checking for the first time -->
							<div class="flex flex-col items-center justify-center py-12 text-center">
								<div class="h-12 w-12"></div>
							</div>
						{/if}

						<!-- Loading overlay -->
						{#if checking}
							<div
								class="absolute inset-0 flex items-center justify-center rounded-2xl bg-base-100/80 backdrop-blur-sm"
							>
								<div class="flex flex-col items-center">
									<LoaderCircle class="h-8 w-8 animate-spin text-warning" />
									<span class="mt-2 text-sm text-base-content/70">Kontrol ediliyor...</span>
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
