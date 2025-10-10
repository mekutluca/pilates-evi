<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import Mail from '@lucide/svelte/icons/mail';
	import Phone from '@lucide/svelte/icons/phone';
	import Calendar from '@lucide/svelte/icons/calendar';
	import PackageIcon from '@lucide/svelte/icons/package';
	import StickyNote from '@lucide/svelte/icons/sticky-note';
	import User from '@lucide/svelte/icons/user';
	import Edit from '@lucide/svelte/icons/edit';
	import Save from '@lucide/svelte/icons/save';
	import X from '@lucide/svelte/icons/x';
	import Archive from '@lucide/svelte/icons/archive';
	import ArchiveRestore from '@lucide/svelte/icons/archive-restore';
	import PageHeader from '$lib/components/page-header.svelte';
	import Modal from '$lib/components/modal.svelte';
	import ActionMenu from '$lib/components/action-menu.svelte';
	import type { ActionItem } from '$lib/types/ActionItem';
	import type { TraineePurchaseMembership } from '$lib/types';
	import { formatDisplayDate, calculatePackageEndDate } from '$lib/utils';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { getActionErrorMessage } from '$lib/utils/form-utils';

	let { data } = $props();
	let { trainee, groupMemberships } = $derived(data);

	// Edit mode state
	let editMode = $state(false);
	let saving = $state(false);

	// Archive/restore state
	let showArchiveModal = $state(false);
	let showRestoreModal = $state(false);
	let archiving = $state(false);

	// Action menu items
	const menuActions = $derived<ActionItem[]>(
		trainee
			? trainee.is_active
				? [
						{
							label: 'Arşivle',
							handler: () => {
								showArchiveModal = true;
							},
							icon: Archive,
							class: 'text-error'
						}
					]
				: [
						{
							label: 'Geri Yükle',
							handler: () => {
								showRestoreModal = true;
							},
							icon: ArchiveRestore,
							class: 'text-success'
						}
					]
			: []
	);

	// Filter memberships with packages and sort by start date (descending)
	const sortedPurchases = $derived(
		groupMemberships
			.filter((membership) => membership.package)
			.sort((a, b) => new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime())
	);

	function toggleEditMode() {
		editMode = !editMode;
	}

	function cancelEdit() {
		editMode = false;
	}

	// Get the display date for a membership based on package type
	function getMembershipDisplayDate(membership: TraineePurchaseMembership): string {
		// Use purchase end date if available (works for both group and private)
		if (membership.purchase_end_date) {
			return formatDisplayDate(membership.purchase_end_date);
		}

		// For group packages without end date, show "Devam ediyor"
		if (membership.package?.package_type === 'group') {
			return membership.left_at ? formatDisplayDate(membership.left_at) : 'Devam ediyor';
		}

		// For private packages, calculate based on duration
		return calculatePackageEndDate(
			membership.joined_at,
			membership.package?.weeks_duration ?? null
		);
	}

</script>

<div class="space-y-6 p-6">
	<!-- Back button -->
	<button onclick={() => history.back()} class="btn btn-ghost btn-sm">
		<ChevronLeft size={20} />
	</button>

	{#if trainee}
		<!-- Header -->
		<div class="flex items-center justify-between">
			<div class="flex items-center gap-3">
				<PageHeader title={trainee.name} subtitle="Öğrenci Detayları" />
				{#if !trainee.is_active}
					<span class="badge badge-lg badge-error">Arşivlendi</span>
				{/if}
			</div>
			<div class="flex gap-2">
				{#if editMode}
					<button onclick={cancelEdit} class="btn btn-ghost btn-sm" disabled={saving}>
						<X size={16} />
						İptal
					</button>
					<button
						type="submit"
						form="trainee-form"
						class="btn btn-sm btn-success"
						disabled={saving}
					>
						{#if saving}
							<span class="loading loading-sm loading-spinner"></span>
						{:else}
							<Save size={16} />
						{/if}
						Kaydet
					</button>
				{:else}
					<button onclick={toggleEditMode} class="btn btn-sm btn-success" disabled={saving}>
						<Edit size={16} />
						Düzenle
					</button>
				{/if}

				<ActionMenu actions={menuActions} />
			</div>
		</div>
	{:else}
		<!-- Loading header or trainee not found -->
		<PageHeader title="Öğrenci" subtitle="Yükleniyor..." />
	{/if}

	{#if trainee}
		<!-- Personal Details and Notes Row -->
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
			<!-- Personal Details Card -->
			<div class="card bg-base-100 shadow lg:col-span-2">
				<div class="card-body">
					<h3 class="card-title flex items-center gap-2 text-lg">
						<User size={20} class="text-success" />
						Kişisel Bilgiler
					</h3>

					{#if editMode}
						<!-- Edit Form -->
						<form
							id="trainee-form"
							method="POST"
							action="?/update"
							use:enhance={() => {
								saving = true;
								return async ({ result, update }) => {
									if (result.type === 'success') {
										editMode = false;
									}
									saving = false;
									await update();
								};
							}}
							class="mt-4 space-y-4"
						>
							<div class="space-y-4">
								<div class="form-control w-full">
									<label class="label" for="name">
										<span class="label-text">Ad Soyad</span>
									</label>
									<input
										type="text"
										name="name"
										id="name"
										class="input-bordered input w-full"
										value={trainee.name}
										required
									/>
								</div>

								<div class="form-control w-full">
									<label class="label" for="email">
										<span class="label-text">Email</span>
									</label>
									<input
										type="email"
										name="email"
										id="email"
										class="input-bordered input w-full"
										value={trainee.email || ''}
									/>
								</div>

								<div class="form-control w-full">
									<label class="label" for="phone">
										<span class="label-text">Telefon</span>
									</label>
									<input
										type="tel"
										name="phone"
										id="phone"
										class="input-bordered input w-full"
										value={trainee.phone}
										required
									/>
								</div>
							</div>
						</form>
					{:else}
						<!-- Display Mode -->
						<div class="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
							<div class="flex items-center gap-3 rounded-lg bg-base-200 p-3">
								<Mail size={16} class="text-success" />
								<div>
									<p class="text-xs text-base-content/70">Email</p>
									<a
										href="mailto:{trainee.email}"
										class="font-medium transition-colors hover:text-success"
									>
										{trainee.email}
									</a>
								</div>
							</div>

							<div class="flex items-center gap-3 rounded-lg bg-base-200 p-3">
								<Phone size={16} class="text-success" />
								<div>
									<p class="text-xs text-base-content/70">Telefon</p>
									<a
										href="tel:{trainee.phone}"
										class="font-medium transition-colors hover:text-success"
									>
										{trainee.phone}
									</a>
								</div>
							</div>

							<div class="flex items-center gap-3 rounded-lg bg-base-200 p-3 md:col-span-2">
								<Calendar size={16} class="text-success" />
								<div>
									<p class="text-xs text-base-content/70">Kayıt Tarihi</p>
									<p class="font-medium">{formatDisplayDate(trainee.created_at)}</p>
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Notes Section -->
			<div class="card bg-base-100 shadow">
				<div class="card-body">
					<h3 class="card-title flex items-center gap-2 text-lg">
						<StickyNote size={20} class="text-success" />
						Notlar
					</h3>

					{#if editMode}
						<!-- Edit Notes Form -->
						<div class="mt-4">
							<textarea
								name="notes"
								class="textarea-bordered textarea w-full"
								placeholder="Öğrenci notları..."
								rows="4"
								form="trainee-form"
								value={trainee.notes || ''}
							></textarea>
						</div>
					{:else}
						<!-- Display Notes -->
						<div class="mt-4 rounded-lg bg-base-200 p-3">
							{#if trainee.notes}
								<p class="text-sm whitespace-pre-wrap">{trainee.notes}</p>
							{:else}
								<p class="text-sm text-base-content/50 italic">Henüz not eklenmemiş</p>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}

	<!-- All Purchases -->
	{#if sortedPurchases.length > 0}
		<div class="card bg-base-100 shadow">
			<div class="card-body">
				<h3 class="card-title flex items-center gap-2 text-lg">
					<PackageIcon size={20} class="text-success" />
					Satın Alımlar
				</h3>

				<div class="mt-4 space-y-3">
					{#each sortedPurchases as purchase (purchase.id)}
						<div class="collapse-arrow collapse border border-base-300 bg-base-100">
							<input type="checkbox" />
							<div class="collapse-title">
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-3">
										<h4 class="font-semibold">{purchase.package?.name}</h4>
										<span class="badge badge-secondary">
											{purchase.package?.package_type === 'private' ? 'Özel' : 'Grup'}
										</span>
									</div>
									<div class="flex items-center gap-2">
										<span class="text-sm text-base-content/70">
											{purchase.purchase_start_date
												? formatDisplayDate(purchase.purchase_start_date)
												: formatDisplayDate(purchase.joined_at)}
											-
											{getMembershipDisplayDate(purchase)}
										</span>
									</div>
								</div>
							</div>
							<div class="collapse-content">
								<div class="pt-2">
									<!-- Appointments List -->
									{#if purchase.appointments && purchase.appointments.length > 0}
										<div class="rounded-lg border border-base-300 bg-base-100">
											<div class="border-b border-base-300 bg-base-200 px-4 py-2">
												<h5 class="text-sm font-semibold">Randevular</h5>
											</div>
											<div class="max-h-60 overflow-y-auto">
												<div class="divide-y divide-base-300">
													{#each purchase.appointments as appointment}
														<div class="flex items-center justify-between px-4 py-2 hover:bg-base-200">
															<div class="flex items-center gap-3">
																<Calendar size={14} class="text-base-content/50" />
																<span class="text-sm">
																	{formatDisplayDate(appointment.date)} - {appointment.hour}:00
																</span>
															</div>
															{#if new Date(appointment.date) < new Date()}
																<span class="badge badge-neutral badge-sm">Geçmiş</span>
															{:else}
																<span class="badge badge-success badge-sm">Gelecek</span>
															{/if}
														</div>
													{/each}
												</div>
											</div>
										</div>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{:else}
		<!-- Empty State -->
		<div class="card bg-base-100 shadow">
			<div class="card-body py-12 text-center">
				<PackageIcon size={48} class="mx-auto mb-4 text-base-content/30" />
				<h3 class="mb-2 text-lg font-semibold text-base-content/70">
					Henüz satın alım yapılmamış
				</h3>
				<p class="text-base-content/50">Bu öğrenci henüz herhangi bir paket satın almamış.</p>
			</div>
		</div>
	{/if}
</div>

<!-- Archive Confirmation Modal -->
<Modal bind:open={showArchiveModal} title="Öğrenciyi Arşivle">
	<p class="mb-4">
		<strong>{trainee?.name}</strong> adlı öğrenciyi arşivlemek istediğinizden emin misiniz? Arşivlenen
		öğrenciler listede görünmez hale gelecektir.
	</p>
	<form
		method="POST"
		action="?/archiveTrainee"
		use:enhance={() => {
			archiving = true;
			return async ({ result, update }) => {
				archiving = false;
				if (result.type === 'success') {
					toast.success('Öğrenci başarıyla arşivlendi');
					showArchiveModal = false;
				} else if (result.type === 'failure') {
					toast.error(getActionErrorMessage(result));
				}
				await update();
			};
		}}
	>
		<div class="modal-action">
			<button type="button" class="btn" onclick={() => (showArchiveModal = false)}> İptal </button>
			<button type="submit" class="btn btn-error" disabled={archiving}>
				{#if archiving}
					<span class="loading loading-sm loading-spinner"></span>
				{:else}
					<Archive size={16} />
				{/if}
				Arşivle
			</button>
		</div>
	</form>
</Modal>

<!-- Restore Confirmation Modal -->
<Modal bind:open={showRestoreModal} title="Öğrenciyi Geri Yükle">
	<p class="mb-4">
		<strong>{trainee?.name}</strong> adlı öğrenciyi geri yüklemek istediğinizden emin misiniz? Öğrenci
		aktif öğrenciler listesinde görünür hale gelecektir.
	</p>
	<form
		method="POST"
		action="?/restoreTrainee"
		use:enhance={() => {
			archiving = true;
			return async ({ result, update }) => {
				archiving = false;
				if (result.type === 'success') {
					toast.success('Öğrenci başarıyla geri yüklendi');
					showRestoreModal = false;
				} else if (result.type === 'failure') {
					toast.error(getActionErrorMessage(result));
				}
				await update();
			};
		}}
	>
		<div class="modal-action">
			<button type="button" class="btn" onclick={() => (showRestoreModal = false)}> İptal </button>
			<button type="submit" class="btn btn-success" disabled={archiving}>
				{#if archiving}
					<span class="loading loading-sm loading-spinner"></span>
				{:else}
					<ArchiveRestore size={16} />
				{/if}
				Geri Yükle
			</button>
		</div>
	</form>
</Modal>
