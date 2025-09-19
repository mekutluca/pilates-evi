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
	import PageHeader from '$lib/components/page-header.svelte';
	import { formatDisplayDate, calculatePackageEndDate } from '$lib/utils';
	import { enhance } from '$app/forms';

	let { data } = $props();
	let { trainee, groupMemberships } = $derived(data);

	// Edit mode state
	let editMode = $state(false);
	let saving = $state(false);

	// Filter memberships with packages and separate by active status
	const packagesWithMemberships = $derived(
		groupMemberships.filter((membership) => membership.package)
	);

	const activePackages = $derived(
		packagesWithMemberships.filter((membership) => !membership.left_at)
	);

	const pastPackages = $derived(packagesWithMemberships.filter((membership) => membership.left_at));

	function toggleEditMode() {
		editMode = !editMode;
	}

	function cancelEdit() {
		editMode = false;
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
								<div class="form-control">
									<label class="label" for="name">
										<span class="label-text">Ad Soyad</span>
									</label>
									<input
										type="text"
										name="name"
										id="name"
										class="input-bordered input"
										value={trainee.name}
										required
									/>
								</div>

								<div class="form-control">
									<label class="label" for="email">
										<span class="label-text">Email</span>
									</label>
									<input
										type="email"
										name="email"
										id="email"
										class="input-bordered input"
										value={trainee.email || ''}
									/>
								</div>

								<div class="form-control">
									<label class="label" for="phone">
										<span class="label-text">Telefon</span>
									</label>
									<input
										type="tel"
										name="phone"
										id="phone"
										class="input-bordered input"
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

			{#if activePackages.length > 0}
				<div class="mt-4 space-y-3">
					{#each activePackages as item (item.id)}
						<div class="rounded-lg border border-base-300 p-4">
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-3">
									<h4 class="font-semibold">{item.package!.name}</h4>
									<span class="badge badge-secondary">
										{item.package!.package_type === 'private' ? 'Özel' : 'Grup'}
									</span>
								</div>
								<div class="flex items-center gap-4 text-sm text-base-content/70">
									<span
										>{formatDisplayDate(item.joined_at)} - {calculatePackageEndDate(
											item.joined_at,
											item.package!.weeks_duration
										)}</span
									>
									<div class="badge badge-sm badge-success">Aktif</div>
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
	{#if pastPackages.length > 0}
		<div class="card bg-base-100 shadow">
			<div class="card-body">
				<h3 class="card-title flex items-center gap-2 text-lg">
					<Package size={20} class="text-base-content/60" />
					Geçmiş Paketler
				</h3>

				<div class="mt-4 space-y-3">
					{#each pastPackages as item (item.id)}
						<div class="rounded-lg border border-base-300 p-4 opacity-75">
							<div class="flex items-center justify-between">
								<div class="flex items-center gap-3">
									<h4 class="font-semibold">{item.package!.name}</h4>
									<span class="badge badge-secondary">
										{item.package!.package_type === 'private' ? 'Özel' : 'Grup'}
									</span>
								</div>
								<div class="flex items-center gap-4 text-sm text-base-content/70">
									<span
										>{formatDisplayDate(item.joined_at)} - {item.left_at
											? formatDisplayDate(item.left_at)
											: 'Devam ediyor'}</span
									>
									<div class="badge badge-sm badge-neutral">Tamamlandı</div>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		</div>
	{/if}

	<!-- Empty State -->
	{#if groupMemberships.length === 0}
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
