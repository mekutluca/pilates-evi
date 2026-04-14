<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import Plus from '@lucide/svelte/icons/plus';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Dumbbell from '@lucide/svelte/icons/dumbbell';
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
	import CheckCircle from '@lucide/svelte/icons/check-circle';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import type { DayOfWeek } from '$lib/types/Schedule';
	import { DAY_NAMES } from '$lib/types/Schedule';
	import { getDateForDayOfWeek, getWeekStart } from '$lib/utils/date-utils';
	import { getActionErrorMessage } from '$lib/utils/form-utils';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Card from '$lib/components/ui/card/index.js';

	let { data } = $props();
	let { purchaseInfo, suggestedStartDate, lastAppointmentDate, purchaseChain } = $derived(data);

	let packageCount = $state(1); // For private packages
	let assignmentWeeks = $state(4); // For group packages
	let isSubmitting = $state(false);

	const isGroupPackage = $derived(purchaseInfo.package_type === 'group');
	const isPrivatePackage = $derived(purchaseInfo.package_type === 'private');

	const totalWeeks = $derived(() => {
		if (isPrivatePackage) {
			return packageCount * purchaseInfo.weeks_duration;
		} else {
			return assignmentWeeks;
		}
	});

	const appointmentPreviews = $derived.by(() => {
		const previews: Array<{ date: string; hour: number; day: DayOfWeek; weekNumber: number }> = [];
		// Parse date string as local date to avoid timezone issues
		const [year, month, day] = suggestedStartDate.split('-').map(Number);
		const startDate = new Date(year, month - 1, day);

		// Get the Monday of the week containing the start date
		const firstWeekMonday = getWeekStart(startDate);

		// For each timeslot, find its first valid date and generate totalWeeks appointments
		for (const slot of purchaseInfo.time_slots) {
			// Get the date for this slot's day in the first week
			let firstSlotDate = getDateForDayOfWeek(firstWeekMonday, slot.day);

			// If this date is before start date, move to next week
			if (firstSlotDate < startDate) {
				// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Local computation, not reactive state
				firstSlotDate = new Date(firstSlotDate);
				firstSlotDate.setDate(firstSlotDate.getDate() + 7);
			}

			// Generate totalWeeks appointments starting from this first valid date
			for (let week = 0; week < totalWeeks(); week++) {
				// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Local computation, not reactive state
				const slotDate = new Date(firstSlotDate);
				slotDate.setDate(firstSlotDate.getDate() + week * 7);

				// Format date as YYYY-MM-DD using local date components
				const slotYear = slotDate.getFullYear();
				const slotMonth = String(slotDate.getMonth() + 1).padStart(2, '0');
				const slotDay = String(slotDate.getDate()).padStart(2, '0');
				const dateString = `${slotYear}-${slotMonth}-${slotDay}`;

				previews.push({
					date: dateString,
					hour: slot.hour,
					day: slot.day,
					weekNumber: week + 1
				});
			}
		}

		// Sort by date and hour for consistent display
		previews.sort((a, b) => {
			const dateCompare = a.date.localeCompare(b.date);
			if (dateCompare !== 0) return dateCompare;
			return a.hour - b.hour;
		});

		return previews;
	});

	let conflicts = $state<Array<{ date: string; hour: number; reason: string }>>([]);
	let capacityIssues = $state<
		Array<{ date: string; hour: number; currentCapacity: number; maxCapacity: number }>
	>([]);
	let isCheckingConflicts = $state(false);

	$effect(() => {
		if (appointmentPreviews.length > 0) {
			if (isPrivatePackage) {
				checkConflicts();
			} else if (isGroupPackage) {
				checkCapacity();
			}
		}
	});

	async function checkConflicts() {
		isCheckingConflicts = true;
		conflicts = [];

		try {
			// Fetch existing appointments for conflict checking
			const dateStrings = appointmentPreviews.map((a) => a.date);
			const minDate = dateStrings[0];
			const maxDate = dateStrings[dateStrings.length - 1];

			const response = await fetch(
				`/api/check-conflicts?room_id=${purchaseInfo.room_id}&trainer_id=${purchaseInfo.trainer_id}&start_date=${minDate}&end_date=${maxDate}`
			);

			if (response.ok) {
				const result = await response.json();
				const existingAppointments = result.appointments || [];

				for (const preview of appointmentPreviews) {
					const conflict = existingAppointments.find(
						(apt: { date: string; hour: number; room_id: string; trainer_id: string }) =>
							apt.date === preview.date && apt.hour === preview.hour
					);

					if (conflict) {
						const isRoomConflict = conflict.room_id === purchaseInfo.room_id;

						conflicts.push({
							date: preview.date,
							hour: preview.hour,
							reason: isRoomConflict ? 'Oda bu saatte dolu' : 'Eğitmen bu saatte dolu'
						});
					}
				}
			}
		} catch {
			// Silently handle conflict check errors
		} finally {
			isCheckingConflicts = false;
		}
	}

	async function checkCapacity() {
		isCheckingConflicts = true;
		capacityIssues = [];

		try {
			const dateStrings = appointmentPreviews.map((a) => a.date);
			const minDate = dateStrings[0];
			const maxDate = dateStrings[dateStrings.length - 1];

			const response = await fetch(
				`/api/check-group-capacity?room_id=${purchaseInfo.room_id}&trainer_id=${purchaseInfo.trainer_id}&start_date=${minDate}&end_date=${maxDate}&max_capacity=${purchaseInfo.max_capacity}`
			);

			if (response.ok) {
				const result = await response.json();
				capacityIssues = result.capacityIssues || [];
			}
		} catch {
			// Silently handle capacity check errors
		} finally {
			isCheckingConflicts = false;
		}
	}

	const hasConflicts = $derived(conflicts.length > 0);
	const hasCapacityIssues = $derived(capacityIssues.length > 0);
	const canSubmit = $derived(() => {
		if (isCheckingConflicts) return false;
		if (isPrivatePackage && (hasConflicts || packageCount <= 0)) return false;
		if (isGroupPackage && (hasCapacityIssues || assignmentWeeks <= 0)) return false;
		return true;
	});

	async function handleSubmit() {
		if (!canSubmit()) return;

		isSubmitting = true;

		try {
			const formData = new FormData();
			formData.append('purchase_id', purchaseInfo.id);

			let actionUrl = '';
			if (isPrivatePackage) {
				formData.append('package_count', packageCount.toString());
				actionUrl = '?/extendPrivate';
			} else if (isGroupPackage) {
				formData.append('assignment_weeks', assignmentWeeks.toString());
				actionUrl = '?/extendGroup';
			}

			const response = await fetch(actionUrl, {
				method: 'POST',
				body: formData
			});

			const result = await response.json();

			if (result.type === 'success') {
				toast.success(result.data?.message || 'Uzatma başarıyla oluşturuldu');
				goto('/schedule');
			} else if (result.type === 'failure') {
				toast.error(getActionErrorMessage(result));
				console.error('Extension failed:', result);
			} else {
				toast.error('Beklenmeyen bir hata oluştu');
				console.error('Unexpected result type:', result);
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Bilinmeyen hata oluştu';
			toast.error(`Bir hata oluştu: ${errorMessage}`);
		} finally {
			isSubmitting = false;
		}
	}

	// Format date for display
	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleDateString('tr-TR', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}
</script>

<div class="p-4">
	<div class="mx-auto max-w-7xl">
		<!-- Header with Submit Button -->
		<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
			<div>
				<h1 class="flex items-center gap-2 text-2xl font-bold">
					<Plus class="h-6 w-6 text-warning" />
					Paket Uzatma
				</h1>
				<p class="mt-1 text-sm text-muted-foreground">
					Mevcut paketi uzatın ve randevuları otomatik oluşturun
				</p>
			</div>
			<Button
				class="bg-warning text-warning-foreground hover:bg-warning/80"
				disabled={!canSubmit() || isSubmitting}
				onclick={handleSubmit}
			>
				{#if isSubmitting}
					<LoaderCircle class="h-4 w-4 animate-spin" />
				{:else}
					<Plus class="h-4 w-4" />
				{/if}
				Uzatmayı Onayla
			</Button>
		</div>

		<!-- 3-Column Layout -->
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
			<!-- Column 1: Duration Settings -->
			<Card.Root>
				<Card.Header>
					<Card.Title class="flex items-center gap-2 text-lg">
						<Calendar class="h-5 w-5 text-warning" />
						Uzatma Süresi
					</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-4">
					<!-- Package Info Summary -->
					<div class="rounded-lg border border-border bg-muted/40 p-4">
						<div class="text-sm text-muted-foreground">
							{#if isPrivatePackage}
								<strong class="text-foreground">{purchaseInfo.package_name}</strong> paketi
								<strong class="text-foreground">{purchaseInfo.weeks_duration} hafta</strong>
								sürer ve haftada
								<strong class="text-foreground">{purchaseInfo.lessons_per_week} ders</strong>
								içerir (toplam
								<strong class="text-foreground"
									>{purchaseInfo.weeks_duration * purchaseInfo.lessons_per_week} ders</strong
								>).
							{:else if isGroupPackage}
								<strong class="text-foreground">{purchaseInfo.package_name}</strong> paketi haftada
								<strong class="text-foreground">{purchaseInfo.lessons_per_week} ders</strong>
								içerir.
							{/if}
						</div>
					</div>

					<!-- Duration input - differs for private vs group -->
					{#if isPrivatePackage}
						<div class="grid gap-2">
							<Label for="package-count" class="font-medium">Kaç Paket Uzatılacak?</Label>
							<Input id="package-count" type="number" min="1" max="10" bind:value={packageCount} />
							<div class="text-xs text-muted-foreground">
								Toplam: <strong>{totalWeeks()} hafta</strong>
								({totalWeeks() * purchaseInfo.lessons_per_week} ders)
							</div>
						</div>
					{:else if isGroupPackage}
						<div class="grid gap-2">
							<Label for="assignment-weeks" class="font-medium">Kaç Hafta Uzatılacak?</Label>
							<Input
								id="assignment-weeks"
								type="number"
								min="1"
								max="52"
								bind:value={assignmentWeeks}
							/>
							<div class="text-xs text-muted-foreground">
								Toplam: <strong>{assignmentWeeks} hafta</strong>
								({assignmentWeeks * purchaseInfo.lessons_per_week} ders)
							</div>
						</div>
					{/if}
				</Card.Content>
			</Card.Root>

			<!-- Column 2: Current Purchase Details -->
			<Card.Root>
				<Card.Header>
					<Card.Title class="flex items-center gap-2 text-lg">
						<Dumbbell class="h-5 w-5 text-warning" />
						Mevcut Kayıt Bilgileri
					</Card.Title>
				</Card.Header>
				<Card.Content>
					<div class="space-y-3">
						<!-- Package -->
						<div>
							<div class="text-xs text-muted-foreground">Paket</div>
							<div class="font-medium">{purchaseInfo.package_name}</div>
						</div>

						<!-- Trainees -->
						<div>
							<div class="text-xs text-muted-foreground">Öğrenciler</div>
							<div class="font-medium">
								{purchaseInfo.trainees.map((t) => t.name).join(', ')}
							</div>
						</div>

						<!-- Room -->
						<div>
							<div class="text-xs text-muted-foreground">Oda</div>
							<div class="font-medium">{purchaseInfo.room_name}</div>
						</div>

						<!-- Trainer -->
						<div>
							<div class="text-xs text-muted-foreground">Eğitmen</div>
							<div class="font-medium">{purchaseInfo.trainer_name}</div>
						</div>

						<!-- Time Slots -->
						<div>
							<div class="text-xs text-muted-foreground">Ders Saatleri</div>
							<div class="font-medium">
								{purchaseInfo.time_slots
									.map((slot) => `${DAY_NAMES[slot.day]} ${slot.hour}:00`)
									.join(', ')}
							</div>
						</div>

						<!-- Last Appointment -->
						{#if lastAppointmentDate}
							<div class="border-t border-border pt-2">
								<div class="text-xs text-muted-foreground">Son Randevu</div>
								<div class="font-medium">{formatDate(lastAppointmentDate)}</div>
							</div>
						{/if}

						<!-- Purchase Chain (if extended) -->
						{#if purchaseChain && purchaseChain.length > 1}
							<div class="border-t border-border pt-4">
								<div class="mb-1 text-xs text-muted-foreground">Uzatma Geçmişi</div>
								<div class="mb-3 text-xs text-muted-foreground/80">
									{#if isPrivatePackage}
										Seçtiğiniz dersten itibaren yapılan uzatmalar
									{:else}
										Seçtiğiniz öğrenciye ait uzatmalar
									{/if}
								</div>
								<ol class="relative ml-1 border-l-2 border-warning/40">
									{#each purchaseChain as purchase, index (purchase.id)}
										<li class="mb-3 ml-4">
											<span
												class="absolute -left-[7px] flex h-3 w-3 items-center justify-center rounded-full bg-warning"
											></span>
											<div class="text-xs">
												{#if purchase.start_date && purchase.end_date}
													{formatDate(purchase.start_date)} - {formatDate(purchase.end_date)}
												{:else if purchase.start_date}
													{formatDate(purchase.start_date)}
												{:else if purchase.end_date}
													{formatDate(purchase.end_date)}
												{/if}
												{#if index === 0}
													<div class="text-xs text-muted-foreground/80">
														{#if isPrivatePackage}
															(Seçtiğiniz dersin paketi)
														{:else}
															(Mevcut paket)
														{/if}
													</div>
												{/if}
											</div>
										</li>
									{/each}
								</ol>
							</div>
						{/if}
					</div>
				</Card.Content>
			</Card.Root>

			<!-- Column 3: Appointment Previews (Private) or Capacity Check (Group) -->
			<Card.Root>
				<Card.Header>
					<Card.Title class="flex items-center gap-2 text-lg">
						<Calendar class="h-5 w-5 text-warning" />
						{#if isPrivatePackage}
							Oluşturulacak Randevular
						{:else}
							Katılınacak Dersler
						{/if}
					</Card.Title>
				</Card.Header>
				<Card.Content>
					{#if isCheckingConflicts}
						<div class="flex items-center justify-center py-12">
							<LoaderCircle class="h-8 w-8 animate-spin text-warning" />
							<span class="ml-2 text-sm">
								{#if isPrivatePackage}
									Çakışmalar kontrol ediliyor...
								{:else}
									Kapasite kontrol ediliyor...
								{/if}
							</span>
						</div>
					{:else}
						<!-- Status Banner -->
						<div class="mb-4">
							{#if isPrivatePackage && hasConflicts}
								<div class="flex flex-col items-center justify-center py-8">
									<AlertTriangle class="mb-3 h-12 w-12 text-destructive" />
									<div class="text-center">
										<div class="font-semibold text-destructive">Çakışma Tespit Edildi</div>
										<div class="mt-2 max-w-md text-sm text-muted-foreground">
											Bazı randevu saatlerinde çakışma tespit edildi. Ya çakışmaya sebep olan
											randevuları değiştirip uzatmayı tekrar deneyin, ya da yeni kayıt oluşturun.
										</div>
									</div>
								</div>
							{:else if isGroupPackage && hasCapacityIssues}
								<div class="flex flex-col items-center justify-center py-8">
									<AlertTriangle class="mb-3 h-12 w-12 text-destructive" />
									<div class="text-center">
										<div class="font-semibold text-destructive">Kapasite Dolmuş</div>
										<div class="mt-2 max-w-md text-sm text-muted-foreground">
											Bazı derslerde kapasite dolmuş durumda. Lütfen başka bir grup dersi seçin.
										</div>
									</div>
								</div>
							{:else if appointmentPreviews.length > 0}
								<div class="flex flex-col items-center justify-center py-8">
									<CheckCircle class="mb-3 h-12 w-12 text-success" />
									<div class="text-center">
										<div class="font-semibold text-success">
											{#if isPrivatePackage}
												Çakışma Yok
											{:else}
												Kapasite Uygun
											{/if}
										</div>
										<div class="mt-1 text-sm text-muted-foreground">
											{#if isPrivatePackage}
												Tüm randevular uygun
											{:else}
												Tüm dersler uygun
											{/if}
										</div>
									</div>
								</div>
							{/if}
						</div>

						{#if appointmentPreviews.length === 0}
							<div class="py-8 text-center text-sm text-muted-foreground">
								{#if isPrivatePackage}
									Henüz randevu oluşturulmadı
								{:else}
									Henüz ders seçilmedi
								{/if}
							</div>
						{:else}
							<div class="space-y-3">
								<div class="text-sm text-muted-foreground">
									{#if isPrivatePackage}
										Toplam {appointmentPreviews.length} randevu oluşturulacak
									{:else}
										Toplam {appointmentPreviews.length} derse katılınacak
									{/if}
								</div>

								<div class="max-h-[500px] space-y-2 overflow-y-auto">
									{#each appointmentPreviews as appointment, i (`${appointment.date}-${appointment.hour}-${i}`)}
										{@const conflictInfo = conflicts.find(
											(c) => c.date === appointment.date && c.hour === appointment.hour
										)}
										{@const capacityInfo = capacityIssues.find(
											(c) => c.date === appointment.date && c.hour === appointment.hour
										)}
										{@const hasIssue = isPrivatePackage ? !!conflictInfo : !!capacityInfo}
										<div
											class="rounded-lg border p-3 transition-colors {hasIssue
												? 'border-destructive bg-destructive/5'
												: 'border-border'}"
										>
											<div class="flex items-start justify-between">
												<div class="flex-1">
													<div class="text-sm font-medium">
														{formatDate(appointment.date)}
													</div>
													<div class="mt-1 text-xs text-muted-foreground">
														{DAY_NAMES[appointment.day]} • {appointment.hour}:00 • Hafta {appointment.weekNumber}
													</div>
													{#if hasIssue}
														<div class="mt-2">
															{#if isPrivatePackage && conflictInfo}
																<Badge variant="destructive">{conflictInfo.reason}</Badge>
															{:else if isGroupPackage && capacityInfo}
																<Badge variant="destructive">
																	Dolu ({capacityInfo.currentCapacity}/{capacityInfo.maxCapacity})
																</Badge>
															{/if}
														</div>
													{/if}
												</div>
												{#if hasIssue}
													<AlertTriangle class="h-4 w-4 text-destructive" />
												{/if}
											</div>
										</div>
									{/each}
								</div>
							</div>
						{/if}
					{/if}
				</Card.Content>
			</Card.Root>
		</div>
	</div>
</div>
