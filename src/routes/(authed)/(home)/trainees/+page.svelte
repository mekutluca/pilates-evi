<script lang="ts">
	import { toast } from 'svelte-sonner';
	import Plus from '@lucide/svelte/icons/plus';
	import Edit from '@lucide/svelte/icons/edit';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import SearchInput from '$lib/components/search-input.svelte';
	import PageHeader from '$lib/components/page-header.svelte';
	import Archive from '@lucide/svelte/icons/archive';
	import ArchiveRestore from '@lucide/svelte/icons/archive-restore';
	import GraduationCap from '@lucide/svelte/icons/graduation-cap';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import type { Trainee } from '$lib/types/Trainee';
	import SortableTable from '$lib/components/sortable-table.svelte';
	import type { ActionItem } from '$lib/types/ActionItem.js';
	import { getActionErrorMessage } from '$lib/utils/form-utils';
	import Modal from '$lib/components/modal.svelte';

	let { data } = $props();
	let { trainees: initialTrainees, userRole } = $derived(data);

	let showArchived = $state(false);
	let hasArchivedTrainees = $derived((initialTrainees || []).some((t) => !t.is_active));
	let trainees = $derived<Trainee[]>(
		showArchived ? initialTrainees || [] : (initialTrainees || []).filter((t) => t.is_active)
	);
	let searchTerm = $state('');
	let showAddModal = $state(false);
	let showEditModal = $state(false);
	let showArchiveModal = $state(false);
	let showRestoreModal = $state(false);
	let selectedTrainee = $state<Trainee | null>(null);
	let formLoading = $state(false);

	let name = $state('');
	let email = $state('');
	let phone = $state('');
	let notes = $state('');

	const getTableActions = (trainee: Trainee): ActionItem[] => {
		if (userRole !== 'admin' && userRole !== 'coordinator') return [];

		const baseActions: ActionItem[] = [
			{
				label: 'Düzenle',
				handler: (id?: string | number) => {
					const t = trainees.find((t) => t.id === Number(id));
					if (t) openEditModal(t);
				},
				icon: Edit
			}
		];

		if (trainee.is_active) {
			baseActions.push({
				label: 'Arşivle',
				handler: (id?: string | number) => {
					const t = trainees.find((t) => t.id === Number(id));
					if (t) openArchiveModal(t);
				},
				class: 'text-error',
				icon: Archive
			});
		} else {
			baseActions.push({
				label: 'Geri Yükle',
				handler: (id?: string | number) => {
					const t = trainees.find((t) => t.id === Number(id));
					if (t) openRestoreModal(t);
				},
				class: 'text-success',
				icon: ArchiveRestore
			});
		}

		return baseActions;
	};

	const tableColumns = [
		{
			key: 'name',
			title: 'Ad'
		},
		{
			key: 'email',
			title: 'Email',
			render: (trainee: Trainee) =>
				`<a href="mailto:${trainee.email}" class="text-sm underline text-base-content/70 hover:text-info transition-colors">${trainee.email}</a>`
		},
		{
			key: 'phone',
			title: 'Telefon',
			render: (trainee: Trainee) =>
				`<a href="tel:${trainee.phone}" class="text-sm underline text-base-content/70 hover:text-info transition-colors">${trainee.phone}</a>`
		},
		{
			key: 'created_at',
			title: 'Kayıt Tarihi',
			render: (trainee: Trainee) => (trainee.created_at ? formatDate(trainee.created_at) : '-')
		}
	];

	function closeDropdown() {
		const activeElement = document?.activeElement as HTMLElement | null;
		activeElement?.blur();
	}

	function openEditModal(trainee: Trainee) {
		selectedTrainee = trainee;
		name = trainee.name ?? '';
		email = trainee.email ?? '';
		phone = trainee.phone ?? '';
		notes = trainee.notes ?? '';
		showEditModal = true;
		closeDropdown();
	}

	function openArchiveModal(trainee: Trainee) {
		selectedTrainee = trainee;
		showArchiveModal = true;
		closeDropdown();
	}

	function openRestoreModal(trainee: Trainee) {
		selectedTrainee = trainee;
		showRestoreModal = true;
		closeDropdown();
	}

	function resetForm() {
		name = '';
		email = '';
		phone = '';
		notes = '';
		selectedTrainee = null;
	}

	function formatDate(dateString: string) {
		return new Date(dateString).toLocaleDateString('tr-TR', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<div class="p-6">
	<PageHeader title="Öğrenciler" subtitle="Bu sayfada öğrencileri yönetin" />

	<div class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
		<div class="form-control w-full lg:max-w-xs">
			<SearchInput bind:value={searchTerm} placeholder="Öğrenci ara..." />
			{#if hasArchivedTrainees}
				<label class="mt-2 flex items-center gap-2 cursor-pointer">
					<input type="checkbox" class="toggle toggle-xs" bind:checked={showArchived} />
					<span class="text-sm text-base-content/70">Arşivlenenleri göster</span>
				</label>
			{/if}
		</div>

		<button
			class="btn btn-success"
			onclick={() => {
				resetForm();
				showAddModal = true;
			}}
		>
			<GraduationCap size={16} />
			Yeni Öğrenci
		</button>
	</div>

	<SortableTable
		data={trainees}
		columns={tableColumns}
		{searchTerm}
		emptyMessage="Henüz öğrenci bulunmuyor"
		defaultSortKey="id"
		defaultSortOrder="asc"
		actions={getTableActions}
		onRowClick={(trainee) => goto(`/trainees/${trainee.id}`)}
	/>
</div>

<Modal bind:open={showAddModal} title="Yeni Öğrenci Ekle" onClose={resetForm}>
	<form
		method="POST"
		action="?/createTrainee"
		class="space-y-4"
		use:enhance={() => {
			formLoading = true;
			return async ({ result, update }) => {
				formLoading = false;
				if (result.type === 'success') {
					toast.success('Öğrenci başarıyla oluşturuldu');
					showAddModal = false;
					resetForm();
				} else if (result.type === 'failure') {
					toast.error(getActionErrorMessage(result));
				}
				await update();
			};
		}}
	>
		<fieldset class="fieldset">
			<legend class="fieldset-legend">Öğrenci Adı</legend>
			<input type="text" name="name" class="input w-full" bind:value={name} required />
		</fieldset>

		<fieldset class="fieldset">
			<legend class="fieldset-legend">Email</legend>
			<input
				type="email"
				name="email"
				class="input w-full"
				bind:value={email}
				placeholder="ornek@email.com"
				required
			/>
		</fieldset>

		<fieldset class="fieldset">
			<legend class="fieldset-legend">Telefon</legend>
			<input
				type="tel"
				name="phone"
				class="input w-full"
				bind:value={phone}
				placeholder="5xx xxx xx xx"
				required
			/>
		</fieldset>

		<fieldset class="fieldset">
			<legend class="fieldset-legend">Notlar (İsteğe bağlı)</legend>
			<textarea
				name="notes"
				class="textarea w-full"
				bind:value={notes}
				placeholder="Öğrenci hakkında notlar..."
				rows="3"
			></textarea>
		</fieldset>

		<div class="modal-action">
			<button
				type="button"
				class="btn"
				onclick={() => {
					showAddModal = false;
					resetForm();
				}}
			>
				İptal
			</button>
			<button type="submit" class="btn btn-success" disabled={formLoading}>
				{#if formLoading}
					<LoaderCircle size={16} class="animate-spin" />
				{:else}
					<Plus size={16} />
				{/if}
				Ekle
			</button>
		</div>
	</form>
</Modal>

<Modal bind:open={showEditModal} title="Öğrenci Düzenle" onClose={resetForm}>
	<form
		method="POST"
		action="?/updateTrainee"
		class="space-y-4"
		use:enhance={() => {
			formLoading = true;
			return async ({ result, update }) => {
				formLoading = false;
				if (result.type === 'success') {
					toast.success('Öğrenci başarıyla güncellendi');
					showEditModal = false;
					resetForm();
				} else if (result.type === 'failure') {
					toast.error(getActionErrorMessage(result));
				}
				await update();
			};
		}}
	>
		<input type="hidden" name="traineeId" value={selectedTrainee?.id} />

		<fieldset class="fieldset">
			<legend class="fieldset-legend">Öğrenci Adı</legend>
			<input type="text" name="name" class="input w-full" bind:value={name} required />
		</fieldset>

		<fieldset class="fieldset">
			<legend class="fieldset-legend">Email</legend>
			<input
				type="email"
				name="email"
				class="input w-full"
				bind:value={email}
				placeholder="ornek@email.com"
				required
			/>
		</fieldset>

		<fieldset class="fieldset">
			<legend class="fieldset-legend">Telefon</legend>
			<input
				type="tel"
				name="phone"
				class="input w-full"
				bind:value={phone}
				placeholder="5xx xxx xx xx"
				required
			/>
		</fieldset>

		<fieldset class="fieldset">
			<legend class="fieldset-legend">Notlar (İsteğe bağlı)</legend>
			<textarea
				name="notes"
				class="textarea w-full"
				bind:value={notes}
				placeholder="Öğrenci hakkında notlar..."
				rows="3"
			></textarea>
		</fieldset>

		<div class="modal-action">
			<button
				type="button"
				class="btn"
				onclick={() => {
					showEditModal = false;
					resetForm();
				}}
			>
				İptal
			</button>
			<button type="submit" class="btn btn-success" disabled={formLoading}>
				{#if formLoading}
					<LoaderCircle size={16} class="animate-spin" />
				{:else}
					<Edit size={16} />
				{/if}
				Güncelle
			</button>
		</div>
	</form>
</Modal>

<Modal bind:open={showArchiveModal} title="Öğrenciyi Arşivle" onClose={resetForm}>
	<p class="mb-4">
		<strong>{selectedTrainee?.name}</strong> adlı öğrenciyi arşivlemek istediğinizden emin misiniz?
		Arşivlenen öğrenciler listede görünmez hale gelecektir.
	</p>
	<form
		method="POST"
		action="?/archiveTrainee"
		class="space-y-4"
		use:enhance={() => {
			formLoading = true;
			return async ({ result, update }) => {
				formLoading = false;
				if (result.type === 'success') {
					toast.success('Öğrenci başarıyla arşivlendi');
					showArchiveModal = false;
					resetForm();
				} else if (result.type === 'failure') {
					toast.error(getActionErrorMessage(result));
				}
				await update();
			};
		}}
	>
		<input type="hidden" name="traineeId" value={selectedTrainee?.id} />

		<div class="modal-action">
			<button
				type="button"
				class="btn"
				onclick={() => {
					showArchiveModal = false;
					resetForm();
				}}
			>
				İptal
			</button>
			<button type="submit" class="btn btn-error" disabled={formLoading}>
				{#if formLoading}
					<LoaderCircle size={16} class="animate-spin" />
				{:else}
					<Archive size={16} />
				{/if}
				Arşivle
			</button>
		</div>
	</form>
</Modal>

<Modal bind:open={showRestoreModal} title="Öğrenciyi Geri Yükle" onClose={resetForm}>
	<p class="mb-4">
		<strong>{selectedTrainee?.name}</strong> adlı öğrenciyi geri yüklemek istediğinizden emin misiniz?
		Öğrenci aktif öğrenciler listesinde görünür hale gelecektir.
	</p>
	<form
		method="POST"
		action="?/restoreTrainee"
		class="space-y-4"
		use:enhance={() => {
			formLoading = true;
			return async ({ result, update }) => {
				formLoading = false;
				if (result.type === 'success') {
					toast.success('Öğrenci başarıyla geri yüklendi');
					showRestoreModal = false;
					resetForm();
				} else if (result.type === 'failure') {
					toast.error(getActionErrorMessage(result));
				}
				await update();
			};
		}}
	>
		<input type="hidden" name="traineeId" value={selectedTrainee?.id} />

		<div class="modal-action">
			<button
				type="button"
				class="btn"
				onclick={() => {
					showRestoreModal = false;
					resetForm();
				}}
			>
				İptal
			</button>
			<button type="submit" class="btn btn-success" disabled={formLoading}>
				{#if formLoading}
					<LoaderCircle size={16} class="animate-spin" />
				{:else}
					<ArchiveRestore size={16} />
				{/if}
				Geri Yükle
			</button>
		</div>
	</form>
</Modal>
