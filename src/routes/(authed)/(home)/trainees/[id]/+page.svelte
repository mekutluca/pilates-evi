<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import Mail from '@lucide/svelte/icons/mail';
	import Phone from '@lucide/svelte/icons/phone';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Package from '@lucide/svelte/icons/package';
	import StickyNote from '@lucide/svelte/icons/sticky-note';
	import User from '@lucide/svelte/icons/user';
	import Edit from '@lucide/svelte/icons/edit';
	import Save from '@lucide/svelte/icons/save';
	import X from '@lucide/svelte/icons/x';
	import UserMinus from '@lucide/svelte/icons/user-minus';
	import PageHeader from '$lib/components/page-header.svelte';
	import Modal from '$lib/components/modal.svelte';
	import { formatDisplayDate, calculatePackageEndDate } from '$lib/utils';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';

	let { data } = $props();
	let { trainee, groupMemberships, purchaseIdsWithFutureAppointments } = $derived(data);

	// Edit mode state
	let editMode = $state(false);
	let saving = $state(false);

	// Removal state - track which membership is being removed
	let removingMemberships = $state(new Set<string>());

	// Confirmation modal state
	let showRemovalConfirmation = $state(false);
	let membershipToRemove = $state<any>(null);

	// Filter memberships with packages and group by package
	const packagesWithMemberships = $derived(
		groupMemberships.filter((membership) => membership.package)
	);

	// Group memberships by package ID
	const membershipsByPackage = $derived(() => {
		const grouped = new Map<number, { package: any; memberships: any[] }>();
		packagesWithMemberships.forEach((membership) => {
			const packageId = membership.package!.id;
			if (!grouped.has(packageId)) {
				grouped.set(packageId, {
					package: membership.package!,
					memberships: []
				});
			}
			grouped.get(packageId)!.memberships.push(membership);
		});

		// Sort memberships within each package by joined date
		grouped.forEach((group) => {
			group.memberships.sort((a: any, b: any) => new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime());
		});

		return grouped;
	});

	// Determine if a package group is active or past
	const activePackageGroups = $derived(
		Array.from(membershipsByPackage().values()).filter((group) => {
			// A package group is active if any membership in it is active
			return group.memberships.some((membership: any) => {
				return getMembershipStatus(membership).text === 'Aktif';
			});
		})
	);

	const pastPackageGroups = $derived(
		Array.from(membershipsByPackage().values()).filter((group) => {
			// A package group is past if all memberships in it are past
			return group.memberships.every((membership: any) => {
				return getMembershipStatus(membership).text === 'Tamamlandı';
			});
		})
	);

	function toggleEditMode() {
		editMode = !editMode;
	}

	function cancelEdit() {
		editMode = false;
	}

	// Get the display date for a membership based on package type
	function getMembershipDisplayDate(membership: any): string {
		if (membership.package?.package_type === 'group') {
			// For group packages, show when trainee left or "Devam ediyor"
			return membership.left_at ? formatDisplayDate(membership.left_at) : 'Devam ediyor';
		} else {
			// For private packages, use purchase end date if available
			if (membership.purchase_end_date) {
				return formatDisplayDate(membership.purchase_end_date);
			}

			// Final fallback to calculated date
			return calculatePackageEndDate(membership.joined_at, membership.package?.weeks_duration);
		}
	}

	// Get membership status
	function getMembershipStatus(membership: any): { text: string; class: string } {
		const today = new Date();
		const startDate = new Date(membership.joined_at || membership.start_date);

		// Check if trainee has validly left the group
		let hasValidEndDate = false;
		if (membership.end_date) {
			const endDate = new Date(membership.end_date);
			// Only consider end_date valid if it's >= start_date and <= today
			hasValidEndDate = endDate >= startDate && endDate <= today;
		}

		const hasLeftGroup = membership.left_at || hasValidEndDate;

		// For active membership: must not have left AND have future appointments
		const isActive = !hasLeftGroup &&
			(membership.purchase_id && purchaseIdsWithFutureAppointments.includes(membership.purchase_id));

		return isActive
			? { text: 'Aktif', class: 'badge-success' }
			: { text: 'Tamamlandı', class: 'badge-neutral' };
	}

	// Check if a membership can be removed (only active group packages)
	function canRemoveMembership(membership: any): boolean {
		// Use the same logic as getMembershipStatus for consistency
		const status = getMembershipStatus(membership);
		return status.text === 'Aktif' &&
			   membership.package?.package_type === 'group' &&
			   membership.purchase_id; // Must have a purchase_id
	}

	// Show removal confirmation modal
	function showRemovalModal(membership: any) {
		membershipToRemove = membership;
		showRemovalConfirmation = true;
	}

	// Handle confirmed removal
	function handleConfirmedRemoval() {
		if (membershipToRemove) {
			// Trigger the form submission programmatically
			const form = document.getElementById(`remove-form-${membershipToRemove.id}`) as HTMLFormElement;
			if (form) {
				removingMemberships.add(membershipToRemove.id);
				form.requestSubmit();
			}
		}
		showRemovalConfirmation = false;
		membershipToRemove = null;
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
			<PageHeader title={trainee.name} subtitle="Öğrenci Detayları" />
			{#if editMode}
				<div class="flex gap-2">
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
				</div>
			{:else}
				<button onclick={toggleEditMode} class="btn btn-sm btn-success" disabled={saving}>
					<Edit size={16} />
					Düzenle
				</button>
			{/if}
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

	<!-- Active Packages -->
	<div class="card bg-base-100 shadow">
		<div class="card-body">
			<h3 class="card-title flex items-center gap-2 text-lg">
				<Package size={20} class="text-success" />
				Aktif Paketler
			</h3>

			{#if activePackageGroups.length > 0}
				<div class="mt-4 space-y-3">
					{#each activePackageGroups as group (group.package.id)}
						<div class="collapse collapse-arrow border border-base-300 bg-base-100">
							<input type="checkbox" />
							<div class="collapse-title">
								<div class="flex items-center gap-3">
									<h4 class="font-semibold">{group.package.name}</h4>
									<span class="badge badge-secondary">
										{group.package.package_type === 'private' ? 'Özel' : 'Grup'}
									</span>
									<span class="badge badge-sm badge-outline">
										{group.memberships.length} paket
									</span>
								</div>
							</div>
							<div class="collapse-content">
								<div class="space-y-2 pt-2">
									{#each group.memberships as membership (membership.id)}
										{@const status = getMembershipStatus(membership)}
										{@const canRemove = canRemoveMembership(membership)}
										{@const isRemoving = removingMemberships.has(membership.id)}
										<div class="flex items-center justify-between rounded-lg bg-base-200 p-3">
											<div class="flex items-center gap-3">
												<div>
													<p class="text-sm font-medium">
														{formatDisplayDate(membership.joined_at)} - {getMembershipDisplayDate(membership)}
													</p>
												</div>
											</div>
											<div class="flex items-center gap-2">
												<div class="badge badge-sm {status.class}">
													{status.text}
												</div>
												{#if canRemove}
													<form
														id="remove-form-{membership.id}"
														method="POST"
														action="?/removeFromGroup"
														use:enhance={({ formData }) => {
															formData.append('purchase_id', membership.purchase_id.toString());

															return async ({ result, update }) => {
																removingMemberships.delete(membership.id);

																if (result.type === 'success') {
																	const message = (result.data as any)?.message || 'Öğrenci gruptan başarıyla çıkarıldı';
																	toast.success(message);
																} else if (result.type === 'failure') {
																	const message = (result.data as any)?.message || 'Bir hata oluştu';
																	toast.error(message);
																}

																await update();
															};
														}}
													>
														<button
															type="button"
															class="btn btn-ghost btn-xs text-error hover:bg-error/10 gap-1"
															disabled={isRemoving}
															onclick={() => showRemovalModal(membership)}
															title="Gruptan çıkar"
														>
															{#if isRemoving}
																<span class="loading loading-xs loading-spinner"></span>
																<span class="text-xs">Çıkarılıyor...</span>
															{:else}
																<UserMinus size={14} />
																<span class="text-xs">Gruptan çıkar</span>
															{/if}
														</button>
													</form>
												{/if}
											</div>
										</div>
									{/each}
								</div>
							</div>
						</div>
					{/each}
				</div>
			{:else}
				<div class="py-8 text-center">
					<p class="text-base-content/70">Aktif paket bulunmuyor</p>
				</div>
			{/if}
		</div>
	</div>

	<!-- Past Packages -->
	{#if pastPackageGroups.length > 0}
		<div class="card bg-base-100 shadow">
			<div class="card-body">
				<h3 class="card-title flex items-center gap-2 text-lg">
					<Package size={20} class="text-base-content/60" />
					Geçmiş Paketler
				</h3>

				<div class="mt-4 space-y-3">
					{#each pastPackageGroups as group (group.package.id)}
						<div class="collapse collapse-arrow border border-base-300 bg-base-100 opacity-75">
							<input type="checkbox" />
							<div class="collapse-title">
								<div class="flex items-center justify-between">
									<div class="flex items-center gap-3">
										<h4 class="font-semibold">{group.package.name}</h4>
										<span class="badge badge-secondary">
											{group.package.package_type === 'private' ? 'Özel' : 'Grup'}
										</span>
										<span class="badge badge-sm badge-outline">
											{group.memberships.length} paket
										</span>
									</div>
									<div class="badge badge-sm badge-neutral">Tamamlandı</div>
								</div>
							</div>
							<div class="collapse-content">
								<div class="space-y-2 pt-2">
									{#each group.memberships as membership (membership.id)}
										{@const status = getMembershipStatus(membership)}
										<div class="flex items-center justify-between rounded-lg bg-base-200 p-3">
											<div class="flex items-center gap-3">
												<div>
													<p class="text-sm font-medium">
														{formatDisplayDate(membership.joined_at)} - {getMembershipDisplayDate(membership)}
													</p>
												</div>
											</div>
											<div class="badge badge-sm {status.class}">
												{status.text}
											</div>
										</div>
									{/each}
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- Empty State -->
	{#if packagesWithMemberships.length === 0}
		<div class="card bg-base-100 shadow">
			<div class="card-body py-12 text-center">
				<Package size={48} class="mx-auto mb-4 text-base-content/30" />
				<h3 class="mb-2 text-lg font-semibold text-base-content/70">
					Henüz paket ataması yapılmamış
				</h3>
				<p class="text-base-content/50">Bu öğrenci henüz herhangi bir pakete katılmamış.</p>
			</div>
		</div>
	{/if}
</div>

<!-- Removal Confirmation Modal -->
<Modal bind:open={showRemovalConfirmation} size="sm">
	{#snippet header()}
		<h3 class="text-lg font-semibold text-error">Gruptan Çıkar</h3>
	{/snippet}

	{#if membershipToRemove}
		<div class="space-y-6">
			<div class="space-y-4">
				<p class="text-base-content/80">
					<strong>{trainee?.name}</strong> adlı öğrenciyi <strong>{membershipToRemove.package?.name}</strong> dersinden çıkarmak istediğinize emin misiniz?
				</p>
				<div class="alert alert-warning">
					<svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
					</svg>
					<span class="text-sm">Bu işlem geri alınamaz. Öğrenci gruptan çıkarıldıktan sonra tekrar eklemek için yeni kayıt oluşturmanız gerekecek.</span>
				</div>
			</div>

			<div class="flex justify-end gap-3">
				<button
					type="button"
					class="btn btn-ghost"
					onclick={() => { showRemovalConfirmation = false; membershipToRemove = null; }}
				>
					İptal
				</button>
				<button
					type="button"
					class="btn btn-error"
					onclick={handleConfirmedRemoval}
				>
					Gruptan Çıkar
				</button>
			</div>
		</div>
	{/if}
</Modal>
