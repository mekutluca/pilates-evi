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
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import * as Table from '$lib/components/ui/table/index.js';

	const { data }: { data: PageData } = $props();

	// Trainee shift mode detection
	const isTraineeShiftMode = $derived(!!data.traineeInfo);

	// Form state - initialize based on trainee mode
	let operation = $state<TransferOperation>(data.traineeInfo ? 'shift' : 'transfer');
	let shiftMode = $state<ShiftMode>('by_time');
	let scope = $state<TransferScope>(data.traineeInfo ? 'from_selected' : 'single');
	let selectedRoomId = $state('');
	let selectedTrainerId = $state('');
	let weeksToShift = $state(1);
	let slotsToShift = $state(1);
	let checking = $state(false);
	let conflicts = $state<TransferConflict[]>([]);
	let appointmentsChecked = $state(0);
	let hasChecked = $state(false);
	let transferring = $state(false);
	let shiftCause = $state('');

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
		/* eslint-disable @typescript-eslint/no-unused-expressions -- Dependency tracking for Svelte 5 reactivity */
		operation;
		shiftMode;
		scope;
		selectedRoomId;
		selectedTrainerId;
		weeksToShift;
		slotsToShift;
		/* eslint-enable @typescript-eslint/no-unused-expressions */

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

	async function checkTraineeCapacity(
		validAppointments: Array<{ date: string; hour: number; id: number }>
	) {
		// Calculate target appointments based on shift mode
		let targetAppointments: Array<{ date: string; hour: number; appointmentId: number }> = [];

		if (isShiftByTimeMode) {
			// Shift by weeks - target appointments are at shifted dates
			targetAppointments = validAppointments.map((a) => ({
				date: addWeeksToDate(a.date, weeksToShift),
				hour: a.hour,
				appointmentId: a.id
			}));
		} else if (isShiftBySlotMode) {
			// Shift by slots - need to find target appointments N slots ahead
			// For now, we'll get all group appointments and find the targets
			const allGroupAppts = data.allFromNowAppointments
				.filter((a) => a.date && a.hour !== null)
				.sort((a, b) => {
					const dateCompare = (a.date ?? '').localeCompare(b.date ?? '');
					if (dateCompare !== 0) return dateCompare;
					return (a.hour ?? 0) - (b.hour ?? 0);
				});

			targetAppointments = validAppointments
				.map((a) => {
					const currentIndex = allGroupAppts.findIndex((g) => g.id === a.id);
					if (currentIndex === -1) return null;

					const targetIndex = currentIndex + slotsToShift;
					if (targetIndex >= allGroupAppts.length) return null;

					const target = allGroupAppts[targetIndex];
					return {
						date: target.date!,
						hour: target.hour!,
						appointmentId: a.id
					};
				})
				.filter((t): t is { date: string; hour: number; appointmentId: number } => t !== null);
		}

		if (targetAppointments.length === 0) {
			untrack(() => {
				hasChecked = true;
				conflicts = [];
				appointmentsChecked = 0;
				checking = false;
			});
			return;
		}

		// Get package capacity from group lesson
		const groupLesson = data.appointment.pe_group_lessons;
		const maxCapacity = groupLesson?.pe_packages?.max_capacity || 10;

		// Check capacity for each target appointment
		const minDate = targetAppointments[0].date;
		const maxDate = targetAppointments[targetAppointments.length - 1].date;

		const response = await fetch(
			`/api/check-group-capacity?room_id=${data.appointment.room_id}&trainer_id=${data.appointment.trainer_id}&start_date=${minDate}&end_date=${maxDate}&max_capacity=${maxCapacity}`
		);

		if (!response.ok) {
			throw new Error('Failed to check capacity');
		}

		const result = await response.json();
		const capacityIssues = result.capacityIssues || [];

		// Map capacity issues to conflicts
		const foundConflicts: TransferConflict[] = [];
		for (const target of targetAppointments) {
			const issue = capacityIssues.find(
				(i: { date: string; hour: number }) => i.date === target.date && i.hour === target.hour
			);

			if (issue) {
				foundConflicts.push({
					appointmentId: target.appointmentId,
					date: target.date,
					hour: target.hour,
					roomConflict: false, // Not relevant for capacity
					trainerConflict: false // Not relevant for capacity
				});
			}
		}

		untrack(() => {
			hasChecked = true;
			conflicts = foundConflicts;
			appointmentsChecked = validAppointments.length;
			checking = false;
		});
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

			// For trainee shift mode, check capacity instead of time conflicts
			if (isTraineeShiftMode) {
				await checkTraineeCapacity(validAppointments);
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
				// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Local computation, not reactive state
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

			// Trainee shift mode
			if (isTraineeShiftMode && data.traineeInfo) {
				formData.append('trainee_id', data.traineeInfo.id);

				if (isShiftByTimeMode) {
					actionName = 'shift_trainee_by_time';
					formData.append('weeks', weeksToShift.toString());
					successMessage = `${data.traineeInfo.name} başarıyla kaydırıldı`;
				} else if (isShiftBySlotMode) {
					actionName = 'shift_trainee_by_slot';
					formData.append('slots', slotsToShift.toString());
					successMessage = `${data.traineeInfo.name} başarıyla kaydırıldı`;
				}
			}
			// Regular shift mode
			else if (isShiftByTimeMode) {
				actionName = 'shift_by_time';
				formData.append('weeks', weeksToShift.toString());
				successMessage = 'Zamana göre kaydırma başarıyla tamamlandı';
			} else if (isShiftBySlotMode) {
				actionName = 'shift_by_slot';
				formData.append('slots', slotsToShift.toString());
				successMessage = 'Tekli kaydırma başarıyla tamamlandı';
			}
			// Transfer mode
			else {
				formData.append('new_room_id', selectedRoomId);
				formData.append('new_trainer_id', selectedTrainerId);
				formData.append('change_room', hasRoomSelected.toString());
				formData.append('change_trainer', hasTrainerSelected.toString());
			}

			if (isShiftMode && shiftCause) {
				formData.append('cause', shiftCause);
			}

			const response = await fetch(`?/${actionName}`, {
				method: 'POST',
				body: formData
			});

			const result = await response.json();

			if (result.type === 'redirect' || result.type === 'success') {
				const location = result.location || '/schedule';
				const url = new URL(location, window.location.origin);
				const notified = url.searchParams.get('notified');
				const notifiedMessage =
					notified && Number(notified) > 0
						? ` ${notified} öğrenciye bilgilendirme mesajı gönderildi.`
						: '';
				url.searchParams.delete('notified');
				toast.success(successMessage + notifiedMessage);
				goto(url.pathname + url.search);
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
				<p class="mt-1 text-sm text-muted-foreground">
					{#if isShiftMode}
						Randevuları ileri veya geri kaydırın
					{:else}
						Oda ve/veya eğitmen değiştirerek randevuyu aktarın
					{/if}
				</p>
			</div>
			<div class="flex gap-3">
				<Button href="/schedule" variant="ghost">İptal</Button>
				<Button
					class="bg-warning text-warning-foreground hover:bg-warning/80"
					disabled={!canProceed}
					onclick={handleTransfer}
				>
					{#if transferring}
						<LoaderCircle class="h-4 w-4 animate-spin" />
					{:else if isShiftMode}
						<CalendarArrowUp class="h-4 w-4" />
					{:else}
						<ArrowLeftRight class="h-4 w-4" />
					{/if}
					{isShiftMode ? 'Kaydırmayı Onayla' : 'Değişikliği Onayla'}
				</Button>
			</div>
		</div>

		<!-- 3-Column Layout -->
		<div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
			<!-- Column 1: Transfer Settings -->
			<Card.Root>
				<Card.Content class="space-y-4">
					<!-- Trainee Shift Mode Alert -->
					{#if isTraineeShiftMode}
						<Alert.Root class="border-info/40 bg-info/10">
							<Package class="h-5 w-5 text-info" />
							<Alert.Title>Öğrenci Kaydırma Modu</Alert.Title>
							<Alert.Description>
								<strong>{data.traineeInfo?.name}</strong> kaydırılıyor
							</Alert.Description>
						</Alert.Root>
					{/if}

					<h2 class="flex items-center gap-2 text-lg font-semibold">
						<Calendar class="h-5 w-5 text-warning" />
						İşlem Tipi
					</h2>

					<!-- Operation Selection -->
					<RadioGroup
						value={operation}
						onValueChange={(v) => (operation = v as TransferOperation)}
						class="space-y-2"
					>
						{#if !isTraineeShiftMode}
							<label class="flex cursor-pointer items-start gap-3">
								<RadioGroupItem value="transfer" class="mt-0.5" />
								<div class="flex flex-col">
									<span class="text-sm">Oda/Eğitmen Değiştir</span>
									<span class="text-xs text-muted-foreground">
										Randevuyu farklı oda veya eğitmene aktar
									</span>
								</div>
							</label>
						{/if}

						<label class="flex cursor-pointer items-start gap-3">
							<RadioGroupItem value="shift" class="mt-0.5" disabled={isTraineeShiftMode} />
							<div class="flex flex-col">
								<span class="text-sm">
									Tarih Kaydır {isTraineeShiftMode ? '(Otomatik seçili)' : ''}
								</span>
								<span class="text-xs text-muted-foreground">Randevuları ileri kaydır</span>
							</div>
						</label>
					</RadioGroup>

					<!-- Shift Mode Selection (only show when in shift mode) -->
					{#if isShiftMode}
						<div>
							<h3 class="mb-2 text-sm font-medium text-muted-foreground">Kaydırma Tipi</h3>
							<RadioGroup
								value={shiftMode}
								onValueChange={(v) => (shiftMode = v as ShiftMode)}
								class="space-y-2"
							>
								<label class="flex cursor-pointer items-start gap-3">
									<RadioGroupItem value="by_time" class="mt-0.5" />
									<div class="flex flex-col">
										<span class="text-sm">Haftalık</span>
										<span class="text-xs text-muted-foreground">
											Tüm randevuları belirtilen hafta kadar kaydır
										</span>
									</div>
								</label>

								<label class="flex cursor-pointer items-start gap-3">
									<RadioGroupItem value="by_slot" class="mt-0.5" />
									<div class="flex flex-col">
										<span class="text-sm">Tekli</span>
										<span class="text-xs text-muted-foreground">
											Her randevuyu bir sonraki randevunun yerine kaydır
										</span>
									</div>
								</label>
							</RadioGroup>
						</div>
					{/if}

					<Separator />

					<h2 class="text-sm font-medium text-muted-foreground">Kapsam</h2>

					<!-- Scope Selection -->
					<RadioGroup
						value={scope}
						onValueChange={(v) => (scope = v as TransferScope)}
						class="space-y-2"
					>
						{#if isTransferMode}
							<label class="flex cursor-pointer items-center gap-3">
								<RadioGroupItem value="single" />
								<span class="text-sm">Sadece bu randevu</span>
							</label>
						{/if}

						{#if data.futureAppointmentCount > 1}
							<label class="flex cursor-pointer items-center gap-3">
								<RadioGroupItem value="from_selected" />
								<span class="text-sm">
									Seçilen ve sonraki tüm randevular ({data.futureAppointmentCount})
								</span>
							</label>
						{/if}

						{#if isTransferMode && data.allFromNowCount > 1}
							<label class="flex cursor-pointer items-center gap-3">
								<RadioGroupItem value="all_from_now" />
								<span class="text-sm">
									Bugünden itibaren tüm randevular ({data.allFromNowCount})
								</span>
							</label>
						{/if}
					</RadioGroup>

					<Separator />

					{#if isShiftByTimeMode}
						<!-- Weeks Selection -->
						<div class="grid gap-2">
							<Label for="weeks-input" class="font-medium">Kaydırma Süresi</Label>
							<div class="flex gap-2">
								<Input
									id="weeks-input"
									type="number"
									class="flex-1"
									min="-52"
									max="52"
									bind:value={weeksToShift}
								/>
								<span class="flex items-center text-sm text-muted-foreground">hafta</span>
							</div>
							<div class="text-xs text-muted-foreground">
								{#if weeksToShift > 0}
									İleri kaydır: {weeksToShift} hafta sonraya
								{:else if weeksToShift < 0}
									Geri kaydır: {Math.abs(weeksToShift)} hafta öncesine
								{:else}
									Değişiklik yok
								{/if}
							</div>
						</div>
					{:else if isShiftBySlotMode}
						<!-- Slots Selection -->
						<div class="grid gap-2">
							<Label for="slots-input" class="font-medium">Kaydırma Sayısı</Label>
							<div class="flex gap-2">
								<Input
									id="slots-input"
									type="number"
									class="flex-1"
									min="1"
									max="20"
									bind:value={slotsToShift}
								/>
								<span class="flex items-center text-sm text-muted-foreground">randevu</span>
							</div>
							<div class="text-xs text-muted-foreground">
								Her randevu {slotsToShift} randevu ileri kayacak
							</div>
						</div>
					{/if}

					{#if isShiftMode}
						<!-- Shift Reason -->
						<div class="grid gap-2">
							<Label for="shift-cause" class="font-medium">Kaydırma Sebebi</Label>
							<Input
								id="shift-cause"
								type="text"
								placeholder="Örn: 23 Nisan tatili"
								bind:value={shiftCause}
							/>
						</div>
					{/if}

					{#if isTransferMode}
						<!-- Room Selection -->
						<div class="grid gap-2">
							<Label for="room-select" class="font-medium">Oda</Label>
							<NativeSelect id="room-select" bind:value={selectedRoomId}>
								<option value="" disabled>Oda seçin</option>
								{#each data.rooms as room (room.id)}
									<option value={room.id}>{room.name}</option>
								{/each}
							</NativeSelect>
						</div>

						<!-- Trainer Selection -->
						<div class="grid gap-2">
							<Label for="trainer-select" class="font-medium">Eğitmen</Label>
							<NativeSelect id="trainer-select" bind:value={selectedTrainerId}>
								<option value="" disabled>Eğitmen seçin</option>
								{#each data.trainers as trainer (trainer.id)}
									<option value={trainer.id}>{trainer.name}</option>
								{/each}
							</NativeSelect>
						</div>
					{/if}
				</Card.Content>
			</Card.Root>

			<!-- Column 2: Current Appointment Details -->
			<Card.Root>
				<Card.Content class="space-y-3">
					<h2 class="flex items-center gap-2 text-lg font-semibold">
						<Package class="h-5 w-5 text-warning" />
						Mevcut Randevu Bilgileri
					</h2>

					<div class="space-y-3">
						<!-- Trainees -->
						<div>
							<div class="text-xs text-muted-foreground">Öğrenciler</div>
							<div class="font-medium">{traineeNames}</div>
						</div>

						<!-- Package -->
						<div>
							<div class="text-xs text-muted-foreground">Paket</div>
							<div class="font-medium">{packageName}</div>
						</div>
					</div>

					<Separator class="my-2" />

					<!-- Affected Appointments List -->
					<div>
						<div class="mb-2 text-xs font-medium text-muted-foreground">
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
								<div class="rounded bg-muted px-3 py-2 text-sm">
									<div class="font-medium">
										{#if appt.date}
											{#if isShiftByTimeMode && weeksToShift !== 0}
												<span class="text-muted-foreground line-through">
													{formatDateWithDay(appt.date)}
												</span>
												<span class="mx-1">→</span>
												<span>{formatDateWithDay(addWeeksToDate(appt.date, weeksToShift))}</span>
											{:else}
												{formatDateWithDay(appt.date)}
											{/if}
										{/if}
									</div>
									<div class="text-xs text-muted-foreground">
										{#if appt.hour !== null}
											{getTimeRangeString(appt.hour)}
										{/if}
									</div>
									<div class="mt-1 flex gap-2 text-xs text-muted-foreground">
										<span>Oda: {appt.pe_rooms?.name || '-'}</span>
										<span>•</span>
										<span>Eğitmen: {appt.pe_trainers?.name || '-'}</span>
									</div>
								</div>
							{:else}
								{@const appointments =
									scope === 'from_selected' ? data.futureAppointments : data.allFromNowAppointments}
								{@const allSlotsForPreview = (() => {
									if (!isShiftBySlotMode || slotsToShift <= 0) return null;
									if (appointments.length === 0 || !appointments[0].date) return null;

									// Use the canonical schedule from pe_group_lessons.timeslots when available
									// (group lessons), otherwise infer from the appointment list (private). This
									// keeps one-off reschedules from polluting the slot-shift sequence.
									let timeSlots: Array<{ day: DayOfWeek; hour: number }>;
									if (data.canonicalTimeslots && data.canonicalTimeslots.length > 0) {
										timeSlots = [...data.canonicalTimeslots];
									} else {
										timeSlots = [];
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
									}

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

									const firstDate = new Date(appointments[0].date);
									const totalSlotsNeeded = appointments.length + slotsToShift;
									return buildAppointmentSlots(timeSlots, firstDate, totalSlotsNeeded);
								})()}
								{#each appointments as appt, index (appt.id)}
									{@const targetAppt =
										isShiftBySlotMode && allSlotsForPreview
											? allSlotsForPreview[index + slotsToShift]
											: null}
									<div class="rounded bg-muted px-3 py-2 text-sm">
										<div class="font-medium">
											{#if appt.date}
												{#if isShiftByTimeMode && weeksToShift !== 0}
													<span class="text-muted-foreground line-through">
														{formatDateWithDay(appt.date)}
													</span>
													<span class="mx-1">→</span>
													<span>{formatDateWithDay(addWeeksToDate(appt.date, weeksToShift))}</span>
												{:else if isShiftBySlotMode && slotsToShift > 0 && targetAppt?.date}
													<span class="text-muted-foreground line-through">
														{formatDateWithDay(appt.date)}
													</span>
													<span class="mx-1">→</span>
													<span>{formatDateWithDay(targetAppt.date)}</span>
												{:else}
													{formatDateWithDay(appt.date)}
												{/if}
											{/if}
										</div>
										<div class="text-xs text-muted-foreground">
											{#if isShiftBySlotMode && targetAppt && targetAppt.hour !== null && targetAppt.hour !== appt.hour}
												<span class="line-through opacity-60">
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
										<div class="mt-1 flex gap-2 text-xs text-muted-foreground">
											<span>Oda: {appt.room_name || '-'}</span>
											<span>•</span>
											<span>Eğitmen: {appt.trainer_name || '-'}</span>
										</div>
									</div>
								{/each}
							{/if}
						</div>
					</div>
				</Card.Content>
			</Card.Root>

			<!-- Column 3: Conflict Check Results -->
			<Card.Root>
				<Card.Content>
					<h2 class="mb-4 flex items-center gap-2 text-lg font-semibold">
						<Calendar class="h-5 w-5 text-warning" />
						Çakışma Kontrolü
					</h2>

					<div class="relative min-h-[200px]">
						{#if !hasBothSelected && !isShiftMode}
							<div class="flex flex-col items-center justify-center py-12 text-center">
								<ArrowLeftRight class="h-12 w-12 text-muted-foreground/40" />
								<p class="mt-3 text-sm text-muted-foreground">
									Oda ve eğitmen seçtiğinizde<br />çakışma kontrolü yapılacak
								</p>
							</div>
						{:else if isShiftMode && !hasValidWeeks}
							<div class="flex flex-col items-center justify-center py-12 text-center">
								<CalendarArrowUp class="h-12 w-12 text-muted-foreground/40" />
								<p class="mt-3 text-sm text-muted-foreground">
									Kaydırma süresi giriniz<br />çakışma kontrolü yapılacak
								</p>
							</div>
						{:else if hasChecked}
							<!-- Status Banner -->
							<div class="mb-4">
								{#if hasConflicts}
									<div class="flex flex-col items-center justify-center py-8">
										<AlertTriangle class="mb-3 h-12 w-12 text-destructive" />
										<div class="text-center">
											<div class="text-lg font-bold text-destructive">Çakışma Tespit Edildi</div>
											<div class="mt-1 text-sm text-muted-foreground">
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
											<div class="mt-1 text-sm text-muted-foreground">
												{appointmentsChecked} randevu kontrol edildi
											</div>
										</div>
									</div>
								{/if}
							</div>

							<!-- Conflicts Table -->
							{#if hasConflicts}
								<div class="overflow-x-auto">
									<Table.Root>
										<Table.Header>
											<Table.Row>
												<Table.Head>Tarih</Table.Head>
												<Table.Head>Saat</Table.Head>
												<Table.Head>Durum</Table.Head>
											</Table.Row>
										</Table.Header>
										<Table.Body>
											{#each conflicts as conflict (conflict.appointmentId)}
												<Table.Row>
													<Table.Cell class="text-xs">
														{#if conflict.date}
															{formatDate(conflict.date)}
														{:else}
															-
														{/if}
													</Table.Cell>
													<Table.Cell class="text-xs">
														{#if conflict.hour !== null}
															{getTimeRangeString(conflict.hour)}
														{:else}
															-
														{/if}
													</Table.Cell>
													<Table.Cell>
														{#if conflict.roomConflict && conflict.trainerConflict}
															<div class="flex flex-col gap-1">
																<Badge variant="destructive">Oda Dolu</Badge>
																<Badge variant="destructive">Eğitmen Dolu</Badge>
															</div>
														{:else if conflict.roomConflict}
															<Badge variant="destructive">Oda Dolu</Badge>
														{:else if conflict.trainerConflict}
															<Badge variant="destructive">Eğitmen Dolu</Badge>
														{/if}
													</Table.Cell>
												</Table.Row>
											{/each}
										</Table.Body>
									</Table.Root>
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
								class="absolute inset-0 flex items-center justify-center rounded-2xl bg-card/80 backdrop-blur-sm"
							>
								<div class="flex flex-col items-center">
									<LoaderCircle class="h-8 w-8 animate-spin text-warning" />
									<span class="mt-2 text-sm text-muted-foreground">Kontrol ediliyor...</span>
								</div>
							</div>
						{/if}
					</div>
				</Card.Content>
			</Card.Root>
		</div>
	</div>
</div>
