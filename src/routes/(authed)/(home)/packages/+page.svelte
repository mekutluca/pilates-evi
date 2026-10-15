<script lang="ts">
	import { actionResultMessage, postAction } from '$lib/utils/api-client';
	import { invalidateAll } from '$app/navigation';
	import { enhanceForm } from '$lib/utils/enhance';
	import { badgeHtml } from '$lib/utils/html-utils';
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
	const subtitle = $derived.by(() => {
		const active = (initialPackages || []).filter((x) => x.is_active).length;
		const archived = (initialPackages || []).length - active;
		return `${active} aktif paket` + (archived > 0 ? `, ${archived} arşivde` : '');
	});

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
				label: 'Geri yükle',
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
			title: 'Paket'
		},
		{
			key: 'weeks_duration',
			class: 'hidden md:table-cell',
			title: 'Süre',
			render: (pkg: PackageWithPurchases) => {
				return pkg.weeks_duration ? `${pkg.weeks_duration} hafta` : 'Devamlı';
			}
		},
		{
			key: 'package_type',
			title: 'Tür',
			render: (pkg: PackageWithPurchases) => {
				return badgeHtml(pkg.package_type === 'private' ? 'Özel' : 'Grup', 'outline');
			}
		},
		{
			key: 'min_lessons_per_week',
			class: 'hidden md:table-cell',
			title: 'Haftalık ders',
			render: (pkg: PackageWithPurchases) => {
				const min = pkg.min_lessons_per_week;
				const max = pkg.max_lessons_per_week;
				return min === max ? `${min} ders/hafta` : `${min}-${max} ders/hafta`;
			}
		},
		{
			key: 'max_capacity',
			class: 'hidden md:table-cell',
			title: 'En fazla kişi',
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

	async function handleEditPackage() {
		if (!selectedPackage) return;
		const counts = [editMinLessonsPerWeek, editMaxLessonsPerWeek, editMaxCapacity];
		if (counts.some((n) => !Number.isInteger(n) || n < 1)) {
			toast.error('Haftalık ders ve kişi sayısı alanlarını doldurun');
			return;
		}

		// weeks_duration and package_type are not editable
		const fd = new FormData();
		fd.set('packageId', selectedPackage.id);
		fd.set('name', editName);
		fd.set('description', editDescription);
		fd.set('min_lessons_per_week', String(editMinLessonsPerWeek));
		fd.set('max_lessons_per_week', String(editMaxLessonsPerWeek));
		fd.set('max_capacity', String(editMaxCapacity));
		fd.set('reschedulable', String(editReschedulable));
		fd.set('reschedule_limit', editRescheduleLimit === null ? '' : String(editRescheduleLimit));

		formLoading = true;
		const result = await postAction('editPackage', fd);
		formLoading = false;
		if (result.type === 'success') {
			toast.success('Paket kaydedildi');
			closeEditModal();
			await invalidateAll();
		} else {
			toast.error(actionResultMessage(result));
		}
	}

	async function handleCreatePackage(packageForm: CreatePackageForm) {
		const fd = new FormData();
		fd.set('packageData', JSON.stringify(packageForm));
		formLoading = true;
		const result = await postAction('createPackage', fd);
		formLoading = false;
		if (result.type === 'success') {
			toast.success('Paket oluşturuldu');
			showCreateModal = false;
			await invalidateAll();
		} else {
			toast.error(actionResultMessage(result));
		}
	}

	function handleCancelCreate() {
		showCreateModal = false;
		// The wizard will handle the reset via the isVisible effect
	}
</script>

<svelte:head>
	<title>Paketler · Pilates Evi</title>
</svelte:head>

<div class="mx-auto w-full max-w-6xl space-y-6 p-4 lg:p-6">
	<PageHeader title="Paketler" {subtitle}>
		{#snippet actions()}
			{#if userRole === 'admin'}
				<Button
					onclick={() => {
						showCreateModal = true;
					}}
				>
					<Plus size={16} />
					Yeni paket
				</Button>
			{/if}
		{/snippet}
	</PageHeader>

	<!-- Search and Add Package Section -->
	<div class="w-full lg:max-w-xs">
		<SearchInput bind:value={searchTerm} placeholder="Paket ara" />
		{#if hasArchivedPackages}
			<label class="mt-2 flex cursor-pointer items-center gap-2">
				<Switch bind:checked={showArchived} class="scale-75" />
				<span class="text-sm text-muted-foreground">Arşivlenenleri göster</span>
			</label>
		{/if}
	</div>

	<!-- Packages Table -->
	<SortableTable
		data={packages}
		columns={tableColumns}
		{searchTerm}
		emptyMessage="Henüz paket yok"
		defaultSortKey="created_at"
		defaultSortOrder="desc"
		actions={getTableActions}
		rowLabel={(pkg) => pkg.name}
	/>
</div>

<!-- Create Package Modal -->
<Modal bind:open={showCreateModal} title="Yeni paket" size="xl" onClose={handleCancelCreate}>
	<!-- Stays mounted while saving, so a failed save keeps what was typed -->
	<PackageCreationForm
		onSubmit={handleCreatePackage}
		onCancel={handleCancelCreate}
		isVisible={showCreateModal}
		submitting={formLoading}
	/>
</Modal>

<!-- Edit Package Modal -->
<Modal bind:open={showEditModal} title="Paketi düzenle" size="xl" onClose={closeEditModal}>
	<div class="space-y-4">
		<!-- Package Name -->
		<div class="grid gap-2">
			<Label for="edit-name" class="font-medium">Paket adı *</Label>
			<Input id="edit-name" type="text" bind:value={editName} placeholder="Paket adı" required />
		</div>

		<!-- Description -->
		<div class="grid gap-2">
			<Label for="edit-description" class="font-medium">Açıklama</Label>
			<Textarea
				id="edit-description"
				bind:value={editDescription}
				placeholder="Paket açıklaması (isteğe bağlı)"
				rows={3}
			/>
		</div>

		<!-- Duration (Non-editable) and Lessons per week (Editable) -->
		<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
			<div class="grid gap-2">
				<Label for="edit-weeks-duration" class="flex items-center justify-between font-medium">
					<span>Süre (hafta)</span>
					<span class="text-xs text-muted-foreground">Değiştirilemez</span>
				</Label>
				<Input
					id="edit-weeks-duration"
					type="number"
					value={editWeeksDuration}
					disabled
					readonly
					title="Bu değer değiştirilemez. Farklı süre için yeni paket oluşturun."
				/>
			</div>

			<div class="grid gap-2">
				<Label for="edit-min-lessons-per-week" class="font-medium">Haftada en az ders *</Label>
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
				<Label for="edit-max-lessons-per-week" class="font-medium">Haftada en fazla ders *</Label>
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
				<Label for="edit-max-capacity" class="font-medium">En fazla kişi *</Label>
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
					<span>Paket türü</span>
					<span class="text-xs text-muted-foreground">Değiştirilemez</span>
				</Label>
				<Input
					id="edit-trainee-type"
					type="text"
					value={editPackageType === 'private' ? 'Özel ders' : 'Grup dersi'}
					disabled
					readonly
					title="Bu değer değiştirilemez. Farklı tür için yeni paket oluşturun."
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
						<span>Değişiklik hakkı</span>
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

	<ModalFooter>
		<Button variant="ghost" onclick={closeEditModal} disabled={formLoading}>Vazgeç</Button>
		<Button onclick={handleEditPackage} disabled={formLoading || !editName.trim()}>
			{#if formLoading}
				<LoaderCircle size={16} class="animate-spin" />
			{:else}
				<Dumbbell size={16} />
			{/if}
			Kaydet
		</Button>
	</ModalFooter>
</Modal>

<!-- Archive Package Modal -->
<Modal bind:open={showArchiveModal} title="Paketi arşivle">
	<p class="mb-4">
		<strong>{selectedPackage?.name}</strong> paketi arşivlensin mi? Arşivdeki paketlerle yeni kayıt açılamaz,
		mevcut kayıtlar devam eder.
	</p>
	<form
		method="POST"
		action="?/archivePackage"
		class="space-y-4"
		use:enhance={enhanceForm({
			busy: (b) => (formLoading = b),
			success: 'Paket arşivlendi',
			onSuccess: () => {
				showArchiveModal = false;
				selectedPackage = null;
			}
		})}
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
				Vazgeç
			</Button>
			<Button type="submit" variant="destructive" disabled={formLoading}>
				{#if formLoading}
					<LoaderCircle size={16} class="animate-spin" />
				{:else}
					<Archive size={16} />
				{/if}
				Paketi arşivle
			</Button>
		</ModalFooter>
	</form>
</Modal>

<!-- Restore Package Modal -->
<Modal bind:open={showRestoreModal} title="Paketi geri yükle">
	<p class="mb-4">
		<strong>{selectedPackage?.name}</strong> paketi geri yüklensin mi? Yeni kayıtlarda yeniden seçilebilir.
	</p>
	<form
		method="POST"
		action="?/restorePackage"
		class="space-y-4"
		use:enhance={enhanceForm({
			busy: (b) => (formLoading = b),
			success: 'Paket geri yüklendi',
			onSuccess: () => {
				showRestoreModal = false;
				selectedPackage = null;
			}
		})}
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
				Vazgeç
			</Button>
			<Button type="submit" disabled={formLoading}>
				{#if formLoading}
					<LoaderCircle size={16} class="animate-spin" />
				{:else}
					<ArchiveRestore size={16} />
				{/if}
				Paketi geri yükle
			</Button>
		</ModalFooter>
	</form>
</Modal>
