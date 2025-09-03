<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { enhance } from '$app/forms';
	import Plus from '@lucide/svelte/icons/plus';
	import Users from '@lucide/svelte/icons/users';
	import Calendar from '@lucide/svelte/icons/calendar';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Edit from '@lucide/svelte/icons/edit';
	import Dumbbell from '@lucide/svelte/icons/dumbbell';
	import PageHeader from '$lib/components/page-header.svelte';
	import SearchInput from '$lib/components/search-input.svelte';
	import SortableTable from '$lib/components/sortable-table.svelte';
	import PackageCreationForm from '$lib/components/package-creation-form.svelte';
	import type { ActionItem } from '$lib/types/ActionItem.js';
	import type { CreatePackageForm, PackageWithGroup } from '$lib/types/Package';
	import type { TraineeGroupWithTrainee, GroupWithMembers } from '$lib/types/Group';
	import { getActionErrorMessage } from '$lib/utils/form-utils';

	let { data } = $props();
	let { packages: initialPackages } = $derived(data);

	let packages = $derived(initialPackages || []);
	let searchTerm = $state('');
	let showCreateModal = $state(false);
	let showEditModal = $state(false);
	let selectedPackage = $state<PackageWithGroup | null>(null);
	let formLoading = $state(false);

	// Edit form data
	let editName = $state('');
	let editDescription = $state('');
	let editWeeksDuration = $state(1);
	let editLessonsPerWeek = $state(1);
	let editMaxCapacity = $state(1);
	let editPackageType = $state<'private' | 'group'>('private');
	let editReschedulable = $state(true);
	let editRescheduleLimit = $state<number | null>(null);

	// Package management actions
	const tableActions: ActionItem[] = [
		{
			label: 'Düzenle',
			handler: (id) => {
				const pkg = packages.find((p) => p.id === Number(id));
				if (pkg) openEditModal(pkg);
			},
			icon: Edit
		}
	];

	const tableColumns = [
		{
			key: 'name',
			title: 'Ders Adı'
		},
		{
			key: 'weeks_duration',
			title: 'Süre',
			render: (pkg: PackageWithGroup) => {
				return `${pkg.weeks_duration} hafta`;
			}
		},
		{
			key: 'package_type',
			title: 'Ders Türü',
			render: (pkg: PackageWithGroup) => {
				const type = pkg.package_type === 'private' ? 'Özel' : 'Grup';
				const color = pkg.package_type === 'private' ? 'badge-info' : 'badge-warning';
				return `<div class="badge ${color} badge-sm">${type}</div>`;
			}
		},
		{
			key: 'lessons_per_week',
			title: 'Haftalık Ders',
			render: (pkg: PackageWithGroup) => {
				return `${pkg.lessons_per_week} ders/hafta`;
			}
		},
		{
			key: 'max_capacity',
			title: 'Maksimum Kapasite',
			render: (pkg: PackageWithGroup) => {
				return `${pkg.max_capacity} kişi`;
			}
		}
	];

	function openEditModal(pkg: PackageWithGroup) {
		selectedPackage = pkg;
		// Populate form with current values
		editName = pkg.name;
		editDescription = pkg.description || '';
		editWeeksDuration = pkg.weeks_duration || 1;
		editLessonsPerWeek = pkg.lessons_per_week || 1;
		editMaxCapacity = pkg.max_capacity || 1;
		editPackageType = (pkg.package_type as 'private' | 'group') || 'private';
		editReschedulable = pkg.reschedulable ?? true;
		editRescheduleLimit = pkg.reschedule_limit;
		showEditModal = true;
	}

	function closeEditModal() {
		showEditModal = false;
		selectedPackage = null;
		// Reset form
		editName = '';
		editDescription = '';
		editWeeksDuration = 1;
		editLessonsPerWeek = 1;
		editMaxCapacity = 1;
		editPackageType = 'private';
		editReschedulable = true;
		editRescheduleLimit = null;
	}

	function handleEditPackage() {
		if (!selectedPackage) return;

		// Submit the edit form
		const form = document.createElement('form');
		form.method = 'POST';
		form.action = '?/editPackage';
		form.style.display = 'none';

		// Create form data (excluding non-editable fields: weeks_duration, lessons_per_week, package_type)
		const formFields = [
			{ name: 'packageId', value: selectedPackage.id.toString() },
			{ name: 'name', value: editName },
			{ name: 'description', value: editDescription },
			{ name: 'max_capacity', value: editMaxCapacity.toString() },
			{ name: 'reschedulable', value: editReschedulable.toString() },
			{ name: 'reschedule_limit', value: editRescheduleLimit?.toString() || '' }
		];

		formFields.forEach(({ name, value }) => {
			const input = document.createElement('input');
			input.name = name;
			input.value = value;
			form.appendChild(input);
		});

		document.body.appendChild(form);

		// Use form submission with enhance
		enhance(form, () => {
			formLoading = true;
			return async ({ result, update }) => {
				formLoading = false;

				if (result.type === 'success') {
					toast.success('Ders başarıyla güncellendi');
					closeEditModal();
				} else if (result.type === 'failure') {
					toast.error(getActionErrorMessage(result));
				}

				await update();
				document.body.removeChild(form);
			};
		});

		// Trigger form submission
		form.dispatchEvent(new Event('submit', { bubbles: true }));
	}

	function handleCreatePackage(packageForm: CreatePackageForm) {
		// Submit the form data
		const form = document.createElement('form');
		form.method = 'POST';
		form.action = '?/createPackage';
		form.style.display = 'none';

		const packageDataInput = document.createElement('input');
		packageDataInput.name = 'packageData';
		packageDataInput.value = JSON.stringify(packageForm);

		form.appendChild(packageDataInput);
		document.body.appendChild(form);

		// Use form submission with enhance
		enhance(form, () => {
			formLoading = true;
			return async ({ result, update }) => {
				formLoading = false;

				if (result.type === 'success') {
					toast.success('Ders başarıyla oluşturuldu');
					showCreateModal = false;
				} else if (result.type === 'failure') {
					toast.error(getActionErrorMessage(result));
				}

				await update();
				document.body.removeChild(form);
			};
		});

		// Trigger form submission
		form.dispatchEvent(new Event('submit', { bubbles: true }));
	}

	function handleCancelCreate() {
		showCreateModal = false;
		// The wizard will handle the reset via the isVisible effect
	}
</script>

<div class="p-6">
	<PageHeader title="Dersler" subtitle="Kurumunuzda verilen dersler ekleyin ve yönetin" />

	<!-- Search and Add Package Section -->
	<div class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
		<div class="form-control w-full lg:max-w-xs">
			<SearchInput bind:value={searchTerm} placeholder="Ders ara..." />
		</div>

		<button
			class="btn btn-accent"
			onclick={() => {
				showCreateModal = true;
			}}
		>
			<Plus size={16} />
			Yeni Ders
		</button>
	</div>

	<!-- Packages Table -->
	<SortableTable
		data={packages}
		columns={tableColumns}
		{searchTerm}
		emptyMessage="Henüz Ders bulunmuyor"
		defaultSortKey="created_at"
		defaultSortOrder="desc"
		actions={tableActions}
	/>
</div>

<!-- Create Package Modal -->
<dialog class="modal" class:modal-open={showCreateModal}>
	<div class="modal-box w-11/12 max-w-5xl">
		<div class="mb-4 flex items-center justify-between">
			<h3 class="flex items-center gap-2 text-lg font-bold">
				<Dumbbell size={20} />
				Yeni Ders
			</h3>
			<button class="btn btn-circle btn-ghost btn-sm" onclick={handleCancelCreate}> ✕ </button>
		</div>

		{#if formLoading}
			<div class="flex items-center justify-center py-8">
				<LoaderCircle size={32} class="animate-spin text-accent" />
				<span class="ml-2">Ders oluşturuluyor...</span>
			</div>
		{:else}
			<PackageCreationForm
				onSubmit={handleCreatePackage}
				onCancel={handleCancelCreate}
				isVisible={showCreateModal}
			/>
		{/if}
	</div>
	<form method="dialog" class="modal-backdrop">
		<button onclick={handleCancelCreate}>kapat</button>
	</form>
</dialog>

<!-- Package Statistics -->
{#if packages.length > 0}
	<div class="mt-8">
		<div class="stats stats-vertical shadow lg:stats-horizontal">
			<div class="stat">
				<div class="stat-figure text-accent">
					<Dumbbell size={32} />
				</div>
				<div class="stat-title">Toplam Ders</div>
				<div class="stat-value text-accent">{packages.length}</div>
				<div class="stat-desc">kayıtlı</div>
			</div>

			<div class="stat">
				<div class="stat-figure text-success">
					<Calendar size={32} />
				</div>
				<div class="stat-title">Aktif Ders</div>
				<div class="stat-value text-success">
					{packages.filter((p) => p.is_active).length}
				</div>
				<div class="stat-desc">çalışıyor</div>
			</div>

			<div class="stat">
				<div class="stat-figure text-info">
					<Users size={32} />
				</div>
				<div class="stat-title">Toplam Öğrenci</div>
				<div class="stat-value text-info">
					{packages.reduce((sum, p) => {
						const totalActiveMembers =
							p.pe_package_groups?.reduce(
								(groupSum: number, pg: { pe_groups: GroupWithMembers }) => {
									const activeMembers =
										pg.pe_groups?.pe_trainee_groups?.filter(
											(tg: TraineeGroupWithTrainee) => !tg.left_at
										) || [];
									return groupSum + activeMembers.length;
								},
								0
							) || 0;
						return sum + totalActiveMembers;
					}, 0)}
				</div>
				<div class="stat-desc">Derste</div>
			</div>
		</div>
	</div>
{/if}

<!-- Edit Package Modal -->
<dialog class="modal" class:modal-open={showEditModal}>
	<div class="modal-box w-11/12 max-w-5xl">
		<div class="mb-4 flex items-center justify-between">
			<h3 class="flex items-center gap-2 text-lg font-bold">
				<Dumbbell size={20} />
				Dersi Düzenle
			</h3>
			<button
				class="btn btn-circle btn-ghost btn-sm"
				onclick={closeEditModal}
				disabled={formLoading}>✕</button
			>
		</div>

		{#if formLoading}
			<div class="flex items-center justify-center py-8">
				<LoaderCircle size={32} class="animate-spin text-accent" />
				<span class="ml-2">Ders güncelleniyor...</span>
			</div>
		{:else}
			<div class="space-y-4">
				<!-- Package Name -->
				<div>
					<label class="label" for="edit-name">
						<span class="label-text font-medium">Ders Adı *</span>
					</label>
					<input
						id="edit-name"
						type="text"
						class="input-bordered input w-full"
						bind:value={editName}
						placeholder="Ders adını girin"
						required
					/>
				</div>

				<!-- Description -->
				<div>
					<label class="label" for="edit-description">
						<span class="label-text font-medium">Açıklama</span>
					</label>
					<textarea
						id="edit-description"
						class="textarea-bordered textarea w-full"
						bind:value={editDescription}
						placeholder="Ders açıklaması (isteğe bağlı)"
						rows="3"
					></textarea>
				</div>

				<!-- Duration and Lessons per week (Non-editable) -->
				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div
						class="tooltip tooltip-top"
						data-tip="Bu değer değiştirilemez. Farklı süre için yeni ders oluşturun."
					>
						<label class="label" for="edit-weeks-duration">
							<span class="label-text font-medium">Süre (Hafta)</span>
							<span class="label-text-alt text-warning">Değiştirilemez</span>
						</label>
						<input
							id="edit-weeks-duration"
							type="number"
							class="input-bordered input w-full"
							value={editWeeksDuration}
							disabled
							readonly
						/>
					</div>

					<div
						class="tooltip tooltip-top"
						data-tip="Bu değer değiştirilemez. Farklı ders sayısı için yeni ders oluşturun."
					>
						<label class="label" for="edit-lessons-per-week">
							<span class="label-text font-medium">Haftalık Ders Sayısı</span>
							<span class="label-text-alt text-warning">Değiştirilemez</span>
						</label>
						<input
							id="edit-lessons-per-week"
							type="number"
							class="input-bordered input w-full"
							value={editLessonsPerWeek}
							disabled
							readonly
						/>
					</div>
				</div>

				<!-- Capacity and Trainee Type -->
				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					<div>
						<label class="label" for="edit-max-capacity">
							<span class="label-text font-medium">Maksimum Kapasite *</span>
						</label>
						<input
							id="edit-max-capacity"
							type="number"
							class="input-bordered input w-full"
							bind:value={editMaxCapacity}
							min="1"
							max="50"
							required
						/>
					</div>

					<div
						class="tooltip tooltip-top"
						data-tip="Bu değer değiştirilemez. Farklı öğrenci türü için yeni ders oluşturun."
					>
						<label class="label" for="edit-trainee-type">
							<span class="label-text font-medium">Öğrenci Türü</span>
							<span class="label-text-alt text-warning">Değiştirilemez</span>
						</label>
						<input
							id="edit-trainee-type"
							type="text"
							class="input-bordered input w-full"
							value={editPackageType === 'private'
								? 'Özel - Belirli öğrencilerle'
								: 'Grup - Esnek öğrenci katılımı'}
							disabled
							readonly
						/>
					</div>
				</div>

				<!-- Rescheduling Options -->
				<div class="space-y-3">
					<div class="flex items-center gap-3">
						<input
							id="edit-reschedulable"
							type="checkbox"
							class="checkbox checkbox-primary"
							bind:checked={editReschedulable}
						/>
						<label for="edit-reschedulable" class="label-text cursor-pointer font-medium">
							Randevu değişikliğine izin ver
						</label>
					</div>

					{#if editReschedulable}
						<div>
							<label class="label" for="edit-reschedule-limit">
								<span class="label-text">Değişiklik Limiti</span>
								<span class="label-text-alt">Boş bırakırsanız sınırsız</span>
							</label>
							<input
								id="edit-reschedule-limit"
								type="number"
								class="input-bordered input w-full md:w-48"
								bind:value={editRescheduleLimit}
								min="1"
								placeholder="Örn: 3"
							/>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<div class="modal-action">
			<button class="btn btn-ghost" onclick={closeEditModal} disabled={formLoading}> İptal </button>
			<button
				class="btn btn-primary"
				onclick={handleEditPackage}
				disabled={formLoading || !editName.trim()}
			>
				{#if formLoading}
					<LoaderCircle size={16} class="animate-spin" />
				{:else}
					<Dumbbell size={16} />
				{/if}
				Güncelle
			</button>
		</div>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button onclick={closeEditModal}>kapat</button>
	</form>
</dialog>
