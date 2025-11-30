<script lang="ts">
	import type { CreatePackageForm } from '$lib/types/Package';
	import Medal from '@lucide/svelte/icons/medal';
	import CalendarSync from '@lucide/svelte/icons/calendar-sync';

	// Props
	interface Props {
		onSubmit: (form: CreatePackageForm) => void;
		onCancel: () => void;
		isVisible?: boolean;
	}

	const { onSubmit, onCancel, isVisible = true }: Props = $props();

	// Local state for form fields
	let name = $state('');
	let description = $state('');
	let weeks_duration = $state(4);
	let lessons_per_week = $state(1);
	let max_capacity = $state(12);
	let package_type = $state<'private' | 'group'>('private');
	let reschedulable = $state(false);
	let reschedule_limit = $state<number | undefined>(undefined);

	// Reset function
	function resetFormState() {
		name = '';
		description = '';
		weeks_duration = 4;
		lessons_per_week = 1;
		max_capacity = 12;
		package_type = 'private';
		reschedulable = false;
		reschedule_limit = undefined;
	}

	// Track previous visibility state to only reset when closing
	let previouslyVisible = $state(isVisible);

	// Reset when modal becomes not visible (after close animation)
	$effect(() => {
		if (previouslyVisible && !isVisible) {
			// Delay to ensure modal close animation completes
			setTimeout(() => {
				resetFormState();
			}, 300);
		}
		previouslyVisible = isVisible;
	});

	// Form submission
	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		onSubmit({
			name,
			description,
			weeks_duration: package_type === 'group' ? null : weeks_duration,
			lessons_per_week,
			max_capacity,
			package_type,
			reschedulable,
			reschedule_limit: reschedulable ? reschedule_limit : undefined
		});
	}

	// Validation
	const showRescheduleLimit = $derived(reschedulable);

	// Local validation based on actual form state
	const canProceedLocal = $derived(
		name.trim().length > 0 &&
			lessons_per_week > 0 &&
			max_capacity > 0 &&
			package_type !== undefined &&
			(package_type === 'group' || (weeks_duration && weeks_duration > 0))
	);
</script>

<div class="space-y-6">
	<!-- Package Creation Form -->
	<div class="card bg-base-100 shadow-xl">
		<div class="card-body">
			<div class="space-y-6">
				<form class="space-y-4" onsubmit={handleSubmit}>
					<!-- Package Name -->
					<div class="form-control">
						<label class="label" for="package-name">
							<span class="label-text font-semibold">Ders Adı *</span>
						</label>
						<input
							id="package-name"
							type="text"
							class="input-bordered input w-full"
							placeholder="Örn: Başlangıç Pilates"
							bind:value={name}
							required
							autocomplete="off"
						/>
					</div>

					<!-- Package Description -->
					<div class="form-control">
						<label class="label" for="package-description">
							<span class="label-text font-semibold">Açıklama</span>
						</label>
						<textarea
							id="package-description"
							class="textarea-bordered textarea w-full"
							placeholder="Ders detayları..."
							rows="3"
							bind:value={description}
						></textarea>
					</div>

					<!-- Basic Configuration -->
					<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
						<!-- Weeks Duration -->
						<div class="form-control">
							<label class="label" for="weeks-duration">
								<span class="label-text font-semibold">
									Ders Süresi (Hafta) {#if package_type === 'private'}*{/if}
								</span>
							</label>
							{#if package_type === 'private'}
								<input
									id="weeks-duration"
									type="number"
									class="input-bordered input w-full"
									placeholder="Örn: 4"
									min="1"
									bind:value={weeks_duration}
									required
								/>
								<div class="label">
									<span class="label-text-alt text-base-content/60">Bu ders kaç hafta sürecek</span>
								</div>
							{:else}
								<div
									class="input-bordered input flex w-full items-center bg-base-200 text-base-content/60"
								>
									Devamlı
								</div>
								<div class="label">
									<span class="label-text-alt text-base-content/60"
										>Manuel olarak sonlandırılana kadar devam eder</span
									>
								</div>
							{/if}
						</div>

						<!-- Lessons per Week -->
						<div class="form-control">
							<label class="label" for="lessons-per-week">
								<span class="label-text font-semibold">Haftalık Ders Sayısı *</span>
							</label>
							<input
								id="lessons-per-week"
								type="number"
								class="input-bordered input w-full"
								placeholder="Örn: 2"
								min="1"
								max="7"
								bind:value={lessons_per_week}
								required
							/>
							<div class="label">
								<span class="label-text-alt text-base-content/60"
									>Bu derste hafta başına kaç ders yapılacak</span
								>
							</div>
						</div>

						<!-- Max Capacity -->
						<div class="form-control">
							<label class="label" for="max-capacity">
								<span class="label-text font-semibold">Maksimum Kapasite *</span>
							</label>
							<input
								id="max-capacity"
								type="number"
								class="input-bordered input w-full"
								placeholder="Örn: 12"
								min="1"
								max="50"
								bind:value={max_capacity}
								required
							/>
							<div class="label">
								<span class="label-text-alt text-base-content/60"
									>Bu derste aynı anda maksimum kaç kişi olabilir</span
								>
							</div>
						</div>
					</div>

					<!-- Advanced Configuration Cards -->
					<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
						<!-- Trainee Type Card -->
						<div class="card border border-base-300 bg-base-100">
							<div class="card-body p-4">
								<div class="flex items-center gap-2">
									<div class="flex h-8 w-8 items-center justify-center rounded-full bg-warning/10">
										<Medal class="h-4 w-4 text-warning" />
									</div>
									<h3 class="text-sm font-semibold">Öğrenci Yönetimi</h3>
								</div>
								<div class="divider m-0"></div>

								<div class="space-y-3">
									<div class="form-control">
										<label class="cursor-pointer">
											<div
												class="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-base-200"
											>
												<input
													type="radio"
													class="radio radio-sm radio-warning"
													bind:group={package_type}
													value="private"
												/>
												<div class="flex-1">
													<div class="text-sm font-medium">Özel ders</div>
													<div class="text-xs text-base-content/60">
														Bireysel veya özel grup dersi
													</div>
												</div>
											</div>
										</label>
									</div>

									<div class="form-control">
										<label class="cursor-pointer">
											<div
												class="flex items-center gap-3 rounded-lg p-2 transition-colors hover:bg-base-200"
											>
												<input
													type="radio"
													class="radio radio-sm radio-warning"
													bind:group={package_type}
													value="group"
												/>
												<div class="flex-1">
													<div class="text-sm font-medium">Grup dersi</div>
													<div class="text-xs text-base-content/60">Herkese açık grup dersi</div>
												</div>
											</div>
										</label>
									</div>
								</div>
							</div>
						</div>

						<!-- Rescheduling Card -->
						<div class="card border border-base-300 bg-base-100">
							<div class="card-body p-4">
								<div class="flex items-center gap-2">
									<div class="flex h-8 w-8 items-center justify-center rounded-full bg-warning/10">
										<CalendarSync class="h-4 w-4 text-warning" />
									</div>
									<h3 class="text-sm font-semibold">Randevu Değiştirme Ayarları</h3>
								</div>
								<div class="divider m-0"></div>

								<div class="space-y-3">
									<div class="form-control">
										<label
											class="flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors hover:bg-base-200"
										>
											<input
												type="checkbox"
												class="checkbox checkbox-sm checkbox-warning"
												bind:checked={reschedulable}
											/>
											<div class="flex-1">
												<div class="text-sm font-medium">Randevu Değiştirme İzni</div>
												<div class="text-xs text-base-content/60">
													Derslerin zamanı değiştirilebilir
												</div>
											</div>
										</label>
									</div>

									{#if showRescheduleLimit}
										<div class="rounded-lg bg-base-200 p-2">
											<div class="mb-2 text-xs text-base-content/70">Değiştirme Limiti</div>
											<div class="flex items-center gap-2">
												<input
													type="number"
													class="input-bordered input input-sm h-8 w-16"
													placeholder="∞"
													min="1"
													max="50"
													bind:value={reschedule_limit}
												/>
												<span class="text-xs text-base-content/70">kez</span>
											</div>
										</div>
									{/if}
								</div>
							</div>
						</div>
					</div>

					<!-- Form Actions -->
					<div class="flex justify-between pt-4">
						<button type="button" class="btn btn-outline" onclick={onCancel}> İptal </button>
						<button type="submit" class="btn btn-warning" disabled={!canProceedLocal}>
							Dersi Oluştur
						</button>
					</div>
				</form>
			</div>
		</div>
	</div>
</div>
