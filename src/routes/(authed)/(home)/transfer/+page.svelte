<script lang="ts">
	import type { PageData } from './$types';
	import type { TransferScope, TransferConflict, ExistingAppointment } from '$lib/types/Transfer';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Package from '@lucide/svelte/icons/package';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import CheckCircle from '@lucide/svelte/icons/check-circle';
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
	import { DAY_NAMES, getTimeRangeString, type DayOfWeek } from '$lib/types/Schedule';
	import { getDayOfWeekFromDate } from '$lib/utils/date-utils';

	const { data }: { data: PageData } = $props();

	// Form state
	let scope = $state<TransferScope>('single');
	let selectedRoomId = $state('');
	let selectedTrainerId = $state('');
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
		data.appointment.pe_appointment_trainees
			.map((at) => at.pe_trainees?.name || '-')
			.join(', ')
	);

	const hasRoomSelected = $derived(selectedRoomId !== '');
	const hasTrainerSelected = $derived(selectedTrainerId !== '');
	const hasBothSelected = $derived(hasRoomSelected && hasTrainerSelected);
	const hasConflicts = $derived(conflicts.length > 0);
	const canTransfer = $derived(
		hasChecked && !hasConflicts && hasBothSelected && !checking && !transferring
	);

	// Auto-check conflicts when selections change
	$effect(() => {
		scope;
		selectedRoomId;
		selectedTrainerId;

		const bothSelected = untrack(() => hasBothSelected);

		if (!bothSelected) {
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

			const dates = validAppointments.map((a) => a.date);
			const minDate = dates[0];
			const maxDate = dates[dates.length - 1];

			const response = await fetch(
				`/api/check-conflicts?room_id=${selectedRoomId}&trainer_id=${selectedTrainerId}&start_date=${minDate}&end_date=${maxDate}`
			);

			if (!response.ok) {
				throw new Error('Failed to check conflicts');
			}

			const result = await response.json();
			const existingAppointments = (result.appointments || []) as ExistingAppointment[];

			const foundConflicts: TransferConflict[] = [];
			for (const appt of validAppointments) {
				const conflict = existingAppointments.find(
					(existing) =>
						existing.date === appt.date &&
						existing.hour === appt.hour &&
						existing.id !== appt.id
				);

				if (conflict) {
					const isRoomConflict = hasRoomSelected && conflict.room_id === selectedRoomId;
					const isTrainerConflict =
						hasTrainerSelected && conflict.trainer_id === selectedTrainerId;

					if (isRoomConflict || isTrainerConflict) {
						foundConflicts.push({
							appointmentId: appt.id,
							date: appt.date,
							hour: appt.hour,
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
		if (!canTransfer) return;

		transferring = true;

		try {
			const formData = new FormData();
			formData.append('appointment_id', data.appointment.id.toString());
			formData.append('scope', scope);
			formData.append('new_room_id', selectedRoomId);
			formData.append('new_trainer_id', selectedTrainerId);
			formData.append('change_room', hasRoomSelected.toString());
			formData.append('change_trainer', hasTrainerSelected.toString());

			const response = await fetch('?/transfer', {
				method: 'POST',
				body: formData
			});

			const result = await response.json();

			if (result.type === 'redirect' || result.type === 'success') {
				toast.success('Değişiklik başarıyla tamamlandı');
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
		<!-- Header with Transfer Button -->
		<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
			<div>
				<h1 class="flex items-center gap-2 text-2xl font-bold">
					<ArrowLeftRight class="h-6 w-6 text-warning" />
					Randevu Değiştir
				</h1>
				<p class="mt-1 text-sm text-base-content/60">
					Oda ve/veya eğitmen değiştirerek randevuyu aktarın
				</p>
			</div>
			<div class="flex gap-3">
				<a href="/schedule" class="btn btn-ghost">İptal</a>
				<button
					class="btn btn-warning"
					disabled={!canTransfer}
					onclick={handleTransfer}
				>
					{#if transferring}
						<LoaderCircle class="h-4 w-4 animate-spin" />
					{:else}
						<ArrowLeftRight class="h-4 w-4" />
					{/if}
					Değişikliği Onayla
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
						Aktarma Kapsamı
					</h2>

					<!-- Scope Selection -->
					<div class="space-y-2">
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

						{#if data.allFromNowCount > 1}
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

					<!-- Room Selection -->
					<div class="form-control">
						<label class="label" for="room-select">
							<span class="label-text font-medium">Oda</span>
						</label>
						<select
							id="room-select"
							class="select select-bordered w-full"
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
							class="select select-bordered w-full"
							class:select-warning={hasTrainerSelected}
							bind:value={selectedTrainerId}
						>
							<option value="" disabled>Eğitmen seçin</option>
							{#each data.trainers as trainer (trainer.id)}
								<option value={trainer.id}>{trainer.name}</option>
							{/each}
						</select>
					</div>
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

						<div class="max-h-[300px] overflow-y-auto space-y-1">
							{#if scope === 'single'}
								{@const appt = data.appointment}
								<div class="rounded bg-base-200 px-3 py-2 text-sm">
									<div class="font-medium">
										{#if appt.date}
											{formatDateWithDay(appt.date)}
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
									scope === 'from_selected'
										? data.futureAppointments
										: data.allFromNowAppointments}
								{#each appointments as appt (appt.id)}
									<div class="rounded bg-base-200 px-3 py-2 text-sm">
										<div class="font-medium">
											{#if appt.date}
												{formatDateWithDay(appt.date)}
											{/if}
										</div>
										<div class="text-xs text-base-content/60">
											{#if appt.hour !== null}
												{getTimeRangeString(appt.hour)}
											{/if}
										</div>
										<div class="mt-1 flex gap-2 text-xs">
											<span class="text-base-content/50">Oda: {appt.room_name || '-'}</span>
											<span class="text-base-content/50">•</span>
											<span class="text-base-content/50"
												>Eğitmen: {appt.trainer_name || '-'}</span
											>
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
						{#if !hasBothSelected}
							<div class="flex flex-col items-center justify-center py-12 text-center">
								<ArrowLeftRight class="h-12 w-12 text-base-content/30" />
								<p class="mt-3 text-sm text-base-content/60">
									Oda ve eğitmen seçtiğinizde<br />çakışma kontrolü yapılacak
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
											<div class="text-lg font-bold text-success">Aktarma Hazır</div>
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
																<span class="badge badge-error badge-xs">Oda Dolu</span>
																<span class="badge badge-error badge-xs">Eğitmen Dolu</span>
															</div>
														{:else if conflict.roomConflict}
															<span class="badge badge-error badge-xs">Oda Dolu</span>
														{:else if conflict.trainerConflict}
															<span class="badge badge-error badge-xs">Eğitmen Dolu</span>
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
							<div class="absolute inset-0 flex items-center justify-center bg-base-100/80 backdrop-blur-sm rounded-2xl">
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
