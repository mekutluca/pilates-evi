<script lang="ts">
	import { toast } from 'svelte-sonner';
	import { enhance } from '$app/forms';
	import Plus from '@lucide/svelte/icons/plus';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Edit from '@lucide/svelte/icons/edit';
	import Dumbbell from '@lucide/svelte/icons/dumbbell';
	import Archive from '@lucide/svelte/icons/archive';
	import ArchiveRestore from '@lucide/svelte/icons/archive-restore';
	import PageHeader from '$lib/components/page-header.svelte';
	import SearchInput from '$lib/components/search-input.svelte';
	import SortableTable from '$lib/components/sortable-table.svelte';
	import PackageCreationForm from '$lib/components/package-creation-form.svelte';
	import type { ActionItem } from '$lib/types';
	import type { CreatePackageForm, PackageWithPurchases } from '$lib/types';
	import { getActionErrorMessage } from '$lib/utils/form-utils';
	import Modal from '$lib/components/modal.svelte';
	import ModalFooter from '$lib/components/modal-footer.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';

	let { data } = $props();
	let { packages: initialPackages, userRole } = $derived(data);

	let showArchived = $state(false);
	let hasArchivedPackages = $derived((initialPackages || []).some((p) => !p.is_active));
	let packages = $derived(
		showArchived ? initialPackages || [] : (initialPackages || []).filter((p) => p.is_active)
	);
	let searchTerm = $state('');
	let showCreateModal = $state(false);
	let showEditModal = $state(false);
	let showArchiveModal = $state(false);
	let showRestoreModal = $state(false);
	let selectedPackage = $state<PackageWithPurchases | null>(null);
	let formLoading = $state(false);

	// Edit form data
	let editName = $state('');
	let editDescription = $state('');
	let editWeeksDuration = $state(1);
	let editMinLessonsPerWeek = $state(1);
	let editMaxLessonsPerWeek = $state(1);
	let editMaxCapacity = $state(1);
	let editPackageType = $state<'private' | 'group'>('private');
	let editReschedulable = $state(true);
	let editRescheduleLimit = $state<number | null>(null);

	// Package management actions - only show for admins
	const getTableActions = (pkg: PackageWithPurchases): ActionItem[] => {
		if (userRole !== 'admin') return [];

		const baseActions: ActionItem[] = [
			{
				label: 'Düzenle',
				handler: (id) => {
					const p = packages.find((p) => p.id === String(id));
					if (p) openEditModal(p);
				},
				icon: Edit
			}
		];

		if (pkg.is_active) {
			baseActions.push({
				label: 'Arşivle',
				handler: (id) => {
					const p = packages.find((p) => p.id === String(id));
					if (p) openArchiveModal(p);
				},
				class: 'text-destructive',
				icon: Archive
			});
		} else {
			baseActions.push({
				label: 'Geri Yükle',
				handler: (id) => {
					const p = packages.find((p) => p.id === String(id));
					if (p) openRestoreModal(p);
				},
				icon: ArchiveRestore
			});
		}

		return baseActions;
	};

	const tableColumns = [
		{
			key: 'name',
			title: 'Ders Adı'
		},
		{
			key: 'weeks_duration',
			title: 'Süre',
			render: (pkg: PackageWithPurchases) => {
				return pkg.weeks_duration ? `${pkg.weeks_duration} hafta` : 'Devamlı';
			}
		},
		{
			key: 'package_type',
			title: 'Ders Türü',
			render: (pkg: PackageWithPurchases) => {
				const type = pkg.package_type === 'private' ? 'Özel' : 'Grup';
				return `<span class="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-foreground">${type}</span>`;
			}
		},
		{
			key: 'min_lessons_per_week',
			title: 'Haftalık Ders',
			render: (pkg: PackageWithPurchases) => {
				const min = pkg.min_lessons_per_week;
				const max = pkg.max_lessons_per_week;
				return min === max ? `${min} ders/hafta` : `${min}-${max} ders/hafta`;
			}
		},
		{
			key: 'max_capacity',
			title: 'Maksimum Kapasite',
			render: (pkg: PackageWithPurchases) => {
				return `${pkg.max_capacity} kişi`;
			}
		}
	];

	function openEditModal(pkg: PackageWithPurchases) {
		selectedPackage = pkg;
		// Populate form with current values
		editName = pkg.name;
		editDescription = pkg.description || '';
		editWeeksDuration = pkg.weeks_duration || 1;
		editMinLessonsPerWeek = pkg.min_lessons_per_week || 1;
		editMaxLessonsPerWeek = pkg.max_lessons_per_week || 1;
		editMaxCapacity = pkg.max_capacity || 1;
		editPackageType = (pkg.package_type as 'private' | 'group') || 'private';
		editReschedulable = pkg.reschedulable ?? true;
		editRescheduleLimit = pkg.reschedule_limit;
		showEditModal = true;
	}

	function openArchiveModal(pkg: PackageWithPurchases) {
		selectedPackage = pkg;
		showArchiveModal = true;
	}

	function openRestoreModal(pkg: PackageWithPurchases) {
		selectedPackage = pkg;
		showRestoreModal = true;
	}

	function closeEditModal() {
		showEditModal = false;
		selectedPackage = null;
		// Reset form
		editName = '';
		editDescription = '';
		editWeeksDuration = 1;
		editMinLessonsPerWeek = 1;
		editMaxLessonsPerWeek = 1;
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

		// Create form data (excluding non-editable fields: weeks_duration, package_type)
		const formFields = [
			{ name: 'packageId', value: selectedPackage.id.toString() },
			{ name: 'name', value: editName },
			{ name: 'description', value: editDescription },
			{ name: 'min_lessons_per_week', value: editMinLessonsPerWeek.toString() },
			{ name: 'max_lessons_per_week', value: editMaxLessonsPerWeek.toString() },
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

<svelte:head>
	<title>Dersler · Pilates Evi</title>
</svelte:head>

<div class="p-6">
	<PageHeader title="Dersler" subtitle="Kurumunuzda verilen dersler ekleyin ve yönetin" />

	<!-- Search and Add Package Section -->
	<div class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
		<div class="w-full lg:max-w-xs">
			<SearchInput bind:value={searchTerm} placeholder="Ders ara..." />
			{#if hasArchivedPackages}
				<label class="mt-2 flex cursor-pointer items-center gap-2">
					<Switch bind:checked={showArchived} class="scale-75" />
					<span class="text-sm text-muted-foreground">Arşivlenenleri göster</span>
				</label>
			{/if}
		</div>

		{#if userRole === 'admin'}
			<Button
				onclick={() => {
					showCreateModal = true;
				}}
			>
				<Plus size={16} />
				Yeni Ders
			</Button>
		{/if}
	</div>

	<!-- Packages Table -->
	<SortableTable
		data={packages}
		columns={tableColumns}
		{searchTerm}
		emptyMessage="Henüz Ders bulunmuyor"
		defaultSortKey="created_at"
		defaultSortOrder="desc"
		actions={getTableActions}
	/>
</div>

<!-- Create Package Modal -->
<Modal bind:open={showCreateModal} title="Yeni Ders" size="xl" onClose={handleCancelCreate}>
	{#if formLoading}
		<div class="flex items-center justify-center py-8">
			<LoaderCircle size={32} class="animate-spin text-primary" />
			<span class="ml-2">Ders oluşturuluyor...</span>
		</div>
	{:else}
		<PackageCreationForm
			onSubmit={handleCreatePackage}
			onCancel={handleCancelCreate}
			isVisible={showCreateModal}
		/>
	{/if}
</Modal>

<!-- Edit Package Modal -->
<Modal bind:open={showEditModal} title="Dersi Düzenle" size="xl" onClose={closeEditModal}>
	{#if formLoading}
		<div class="flex items-center justify-center py-8">
			<LoaderCircle size={32} class="animate-spin text-primary" />
			<span class="ml-2">Ders güncelleniyor...</span>
		</div>
	{:else}
		<div class="space-y-4">
			<!-- Package Name -->
			<div class="grid gap-2">
				<Label for="edit-name" class="font-medium">Ders Adı *</Label>
				<Input
					id="edit-name"
					type="text"
					bind:value={editName}
					placeholder="Ders adını girin"
					required
				/>
			</div>

			<!-- Description -->
			<div class="grid gap-2">
				<Label for="edit-description" class="font-medium">Açıklama</Label>
				<Textarea
					id="edit-description"
					bind:value={editDescription}
					placeholder="Ders açıklaması (isteğe bağlı)"
					rows={3}
				/>
			</div>

			<!-- Duration (Non-editable) and Lessons per week (Editable) -->
			<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
				<div class="grid gap-2">
					<Label for="edit-weeks-duration" class="flex items-center justify-between font-medium">
						<span>Süre (Hafta)</span>
						<span class="text-xs text-warning">Değiştirilemez</span>
					</Label>
					<Input
						id="edit-weeks-duration"
						type="number"
						value={editWeeksDuration}
						disabled
						readonly
						title="Bu değer değiştirilemez. Farklı süre için yeni ders oluşturun."
					/>
				</div>

				<div class="grid gap-2">
					<Label for="edit-min-lessons-per-week" class="font-medium">Min Haftalık Ders *</Label>
					<Input
						id="edit-min-lessons-per-week"
						type="number"
						bind:value={editMinLessonsPerWeek}
						min="1"
						max="7"
						required
					/>
				</div>

				<div class="grid gap-2">
					<Label for="edit-max-lessons-per-week" class="font-medium">Max Haftalık Ders *</Label>
					<Input
						id="edit-max-lessons-per-week"
						type="number"
						bind:value={editMaxLessonsPerWeek}
						min="1"
						max="7"
						required
					/>
				</div>
			</div>

			<!-- Capacity and Trainee Type -->
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
				<div class="grid gap-2">
					<Label for="edit-max-capacity" class="font-medium">Maksimum Kapasite *</Label>
					<Input
						id="edit-max-capacity"
						type="number"
						bind:value={editMaxCapacity}
						min="1"
						max="50"
						required
					/>
				</div>

				<div class="grid gap-2">
					<Label for="edit-trainee-type" class="flex items-center justify-between font-medium">
						<span>Öğrenci Türü</span>
						<span class="text-xs text-warning">Değiştirilemez</span>
					</Label>
					<Input
						id="edit-trainee-type"
						type="text"
						value={editPackageType === 'private'
							? 'Özel - Belirli öğrencilerle'
							: 'Grup - Esnek öğrenci katılımı'}
						disabled
						readonly
						title="Bu değer değiştirilemez. Farklı öğrenci türü için yeni ders oluşturun."
					/>
				</div>
			</div>

			<!-- Rescheduling Options -->
			<div class="space-y-3">
				<div class="flex items-center gap-3">
					<Checkbox id="edit-reschedulable" bind:checked={editReschedulable} />
					<Label for="edit-reschedulable" class="cursor-pointer font-medium">
						Randevu değişikliğine izin ver
					</Label>
				</div>

				{#if editReschedulable}
					<div class="grid gap-2">
						<Label for="edit-reschedule-limit" class="flex items-center justify-between">
							<span>Değişiklik Limiti</span>
							<span class="text-xs text-muted-foreground">Boş bırakırsanız sınırsız</span>
						</Label>
						<Input
							id="edit-reschedule-limit"
							type="number"
							class="md:w-48"
							bind:value={editRescheduleLimit}
							min="1"
							placeholder="Örn: 3"
						/>
					</div>
				{/if}
			</div>
		</div>
	{/if}

	<ModalFooter>
		<Button variant="ghost" onclick={closeEditModal} disabled={formLoading}>İptal</Button>
		<Button onclick={handleEditPackage} disabled={formLoading || !editName.trim()}>
			{#if formLoading}
				<LoaderCircle size={16} class="animate-spin" />
			{:else}
				<Dumbbell size={16} />
			{/if}
			Güncelle
		</Button>
	</ModalFooter>
</Modal>

<!-- Archive Package Modal -->
<Modal bind:open={showArchiveModal} title="Dersi Arşivle">
	<p class="mb-4">
		<strong>{selectedPackage?.name}</strong> adlı dersi arşivlemek istediğinizden emin misiniz? Arşivlenen
		dersler listede görünmez hale gelecektir.
	</p>
	<form
		method="POST"
		action="?/archivePackage"
		class="space-y-4"
		use:enhance={() => {
			formLoading = true;
			return async ({ result, update }) => {
				formLoading = false;
				if (result.type === 'success') {
					toast.success('Ders başarıyla arşivlendi');
					showArchiveModal = false;
					selectedPackage = null;
				} else if (result.type === 'failure') {
					toast.error(getActionErrorMessage(result));
				}
				await update();
			};
		}}
	>
		<input type="hidden" name="packageId" value={selectedPackage?.id} />

		<ModalFooter>
			<Button
				type="button"
				variant="outline"
				onclick={() => {
					showArchiveModal = false;
					selectedPackage = null;
				}}
			>
				İptal
			</Button>
			<Button type="submit" variant="destructive" disabled={formLoading}>
				{#if formLoading}
					<LoaderCircle size={16} class="animate-spin" />
				{:else}
					<Archive size={16} />
				{/if}
				Arşivle
			</Button>
		</ModalFooter>
	</form>
</Modal>

<!-- Restore Package Modal -->
<Modal bind:open={showRestoreModal} title="Dersi Geri Yükle">
	<p class="mb-4">
		<strong>{selectedPackage?.name}</strong> adlı dersi geri yüklemek istediğinizden emin misiniz? Ders
		aktif dersler listesinde görünür hale gelecektir.
	</p>
	<form
		method="POST"
		action="?/restorePackage"
		class="space-y-4"
		use:enhance={() => {
			formLoading = true;
			return async ({ result, update }) => {
				formLoading = false;
				if (result.type === 'success') {
					toast.success('Ders başarıyla geri yüklendi');
					showRestoreModal = false;
					selectedPackage = null;
				} else if (result.type === 'failure') {
					toast.error(getActionErrorMessage(result));
				}
				await update();
			};
		}}
	>
		<input type="hidden" name="packageId" value={selectedPackage?.id} />

		<ModalFooter>
			<Button
				type="button"
				variant="outline"
				onclick={() => {
					showRestoreModal = false;
					selectedPackage = null;
				}}
			>
				İptal
			</Button>
			<Button type="submit" disabled={formLoading}>
				{#if formLoading}
					<LoaderCircle size={16} class="animate-spin" />
				{:else}
					<ArchiveRestore size={16} />
				{/if}
				Geri Yükle
			</Button>
		</ModalFooter>
	</form>
</Modal>
