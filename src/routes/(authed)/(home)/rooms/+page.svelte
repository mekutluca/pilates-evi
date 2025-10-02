<script lang="ts">
	import { toast } from 'svelte-sonner';
	import Plus from '@lucide/svelte/icons/plus';
	import Edit from '@lucide/svelte/icons/edit';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import SearchInput from '$lib/components/search-input.svelte';
	import PageHeader from '$lib/components/page-header.svelte';
	import Archive from '@lucide/svelte/icons/archive';
	import ArchiveRestore from '@lucide/svelte/icons/archive-restore';
	import { enhance } from '$app/forms';
	import type { Room } from '$lib/types/Room';
	// Training system removed
	import SortableTable from '$lib/components/sortable-table.svelte';
	import type { ActionItem } from '$lib/types/ActionItem';
	import { getActionErrorMessage } from '$lib/utils/form-utils';
	import Modal from '$lib/components/modal.svelte';

	let { data } = $props();
	let { rooms: initialRooms, userRole } = $derived(data);

	let showArchived = $state(false);
	let hasArchivedRooms = $derived((initialRooms || []).some((r) => !r.is_active));
	let rooms = $derived<Room[]>(
		showArchived ? initialRooms || [] : (initialRooms || []).filter((r) => r.is_active)
	);
	let searchTerm = $state('');
	let showAddModal = $state(false);
	let showEditModal = $state(false);
	let showArchiveModal = $state(false);
	let showRestoreModal = $state(false);
	let selectedRoom = $state<Room | null>(null);
	let formLoading = $state(false);

	let name = $state('');
	let capacity = $state<number | null>(null);

	const getTableActions = (room: Room): ActionItem[] => {
		if (userRole !== 'admin') return [];

		const baseActions: ActionItem[] = [
			{
				label: 'Düzenle',
				handler: (id?: string | number) => {
					const r = rooms.find((r) => r.id === Number(id));
					if (r) openEditModal(r);
				},
				icon: Edit
			}
		];

		if (room.is_active) {
			baseActions.push({
				label: 'Arşivle',
				handler: (id?: string | number) => {
					const r = rooms.find((r) => r.id === Number(id));
					if (r) openArchiveModal(r);
				},
				class: 'text-error',
				icon: Archive
			});
		} else {
			baseActions.push({
				label: 'Geri Yükle',
				handler: (id?: string | number) => {
					const r = rooms.find((r) => r.id === Number(id));
					if (r) openRestoreModal(r);
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
			key: 'capacity',
			title: 'Kapasite',
			render: (room: Room) => String(room.capacity ?? '-')
		}
	];

	function closeDropdown() {
		const activeElement = document?.activeElement as HTMLElement | null;
		activeElement?.blur();
	}

	function openEditModal(room: Room) {
		selectedRoom = room;
		name = room.name ?? '';
		capacity = room.capacity;
		showEditModal = true;
		closeDropdown();
	}

	function openArchiveModal(room: Room) {
		selectedRoom = room;
		showArchiveModal = true;
		closeDropdown();
	}

	function openRestoreModal(room: Room) {
		selectedRoom = room;
		showRestoreModal = true;
		closeDropdown();
	}

	function resetForm() {
		name = '';
		capacity = null;
		selectedRoom = null;
	}
</script>

<div class="p-6">
	<PageHeader title="Odalar" subtitle="Bu sayfada odaları yönetin" />

	<div class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
		<div class="form-control w-full lg:max-w-xs">
			<SearchInput bind:value={searchTerm} placeholder="Oda ara..." />
			{#if hasArchivedRooms}
				<label class="mt-2 flex items-center gap-2 cursor-pointer">
					<input type="checkbox" class="toggle toggle-xs" bind:checked={showArchived} />
					<span class="text-sm text-base-content/70">Arşivlenenleri göster</span>
				</label>
			{/if}
		</div>

		{#if userRole === 'admin'}
			<button
				class="btn btn-primary"
				onclick={() => {
					resetForm();
					showAddModal = true;
				}}
			>
				<Plus size={16} />
				Yeni Oda
			</button>
		{/if}
	</div>

	<SortableTable
		data={rooms}
		columns={tableColumns}
		{searchTerm}
		emptyMessage="Henüz oda bulunmuyor"
		defaultSortKey="id"
		defaultSortOrder="asc"
		actions={getTableActions}
	/>
</div>

<Modal bind:open={showAddModal} title="Yeni Oda Ekle" onClose={resetForm}>
	<form
		method="POST"
		action="?/createRoom"
		class="space-y-4"
		use:enhance={() => {
			formLoading = true;
			return async ({ result, update }) => {
				formLoading = false;
				if (result.type === 'success') {
					toast.success('Oda başarıyla oluşturuldu');
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
			<legend class="fieldset-legend">Oda Adı</legend>
			<input type="text" name="name" class="input w-full" bind:value={name} required />
		</fieldset>

		<fieldset class="fieldset">
			<legend class="fieldset-legend">Kapasite</legend>
			<input type="number" name="capacity" class="input w-full" bind:value={capacity} min="0" />
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
			<button type="submit" class="btn btn-primary" disabled={formLoading}>
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

<Modal bind:open={showEditModal} title="Oda Düzenle" onClose={resetForm}>
	<form
		method="POST"
		action="?/updateRoom"
		class="space-y-4"
		use:enhance={() => {
			formLoading = true;
			return async ({ result, update }) => {
				formLoading = false;
				if (result.type === 'success') {
					toast.success('Oda başarıyla güncellendi');
					showEditModal = false;
					resetForm();
				} else if (result.type === 'failure') {
					toast.error(getActionErrorMessage(result));
				}
				await update();
			};
		}}
	>
		<input type="hidden" name="roomId" value={selectedRoom?.id} />

		<fieldset class="fieldset">
			<legend class="fieldset-legend">Oda Adı</legend>
			<input type="text" name="name" class="input w-full" bind:value={name} required />
		</fieldset>

		<fieldset class="fieldset">
			<legend class="fieldset-legend">Kapasite</legend>
			<input type="number" name="capacity" class="input w-full" bind:value={capacity} min="0" />
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
			<button type="submit" class="btn btn-primary" disabled={formLoading}>
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

<Modal bind:open={showArchiveModal} title="Odayı Arşivle" onClose={resetForm}>
	<p class="mb-4">
		<strong>{selectedRoom?.name}</strong> adlı odayı arşivlemek istediğinizden emin misiniz?
		Arşivlenen odalar listede görünmez hale gelecektir.
	</p>
	<form
		method="POST"
		action="?/archiveRoom"
		class="space-y-4"
		use:enhance={() => {
			formLoading = true;
			return async ({ result, update }) => {
				formLoading = false;
				if (result.type === 'success') {
					toast.success('Oda başarıyla arşivlendi');
					showArchiveModal = false;
					resetForm();
				} else if (result.type === 'failure') {
					toast.error(getActionErrorMessage(result));
				}
				await update();
			};
		}}
	>
		<input type="hidden" name="roomId" value={selectedRoom?.id} />

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

<Modal bind:open={showRestoreModal} title="Odayı Geri Yükle" onClose={resetForm}>
	<p class="mb-4">
		<strong>{selectedRoom?.name}</strong> adlı odayı geri yüklemek istediğinizden emin misiniz?
		Oda aktif odalar listesinde görünür hale gelecektir.
	</p>
	<form
		method="POST"
		action="?/restoreRoom"
		class="space-y-4"
		use:enhance={() => {
			formLoading = true;
			return async ({ result, update }) => {
				formLoading = false;
				if (result.type === 'success') {
					toast.success('Oda başarıyla geri yüklendi');
					showRestoreModal = false;
					resetForm();
				} else if (result.type === 'failure') {
					toast.error(getActionErrorMessage(result));
				}
				await update();
			};
		}}
	>
		<input type="hidden" name="roomId" value={selectedRoom?.id} />

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
