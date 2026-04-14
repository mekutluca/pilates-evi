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
	import type { Room } from '$lib/types';
	import SortableTable from '$lib/components/sortable-table.svelte';
	import type { ActionItem } from '$lib/types';
	import { getActionErrorMessage } from '$lib/utils/form-utils';
	import Modal from '$lib/components/modal.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';

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
					const r = rooms.find((r) => r.id === String(id));
					if (r) openEditModal(r);
				},
				icon: Edit
			}
		];

		if (room.is_active) {
			baseActions.push({
				label: 'Arşivle',
				handler: (id?: string | number) => {
					const r = rooms.find((r) => r.id === String(id));
					if (r) openArchiveModal(r);
				},
				class: 'text-destructive',
				icon: Archive
			});
		} else {
			baseActions.push({
				label: 'Geri Yükle',
				handler: (id?: string | number) => {
					const r = rooms.find((r) => r.id === String(id));
					if (r) openRestoreModal(r);
				},
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

	function openEditModal(room: Room) {
		selectedRoom = room;
		name = room.name ?? '';
		capacity = room.capacity;
		showEditModal = true;
	}

	function openArchiveModal(room: Room) {
		selectedRoom = room;
		showArchiveModal = true;
	}

	function openRestoreModal(room: Room) {
		selectedRoom = room;
		showRestoreModal = true;
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
		<div class="w-full lg:max-w-xs">
			<SearchInput bind:value={searchTerm} placeholder="Oda ara..." />
			{#if hasArchivedRooms}
				<label class="mt-2 flex cursor-pointer items-center gap-2">
					<Switch bind:checked={showArchived} class="scale-75" />
					<span class="text-sm text-muted-foreground">Arşivlenenleri göster</span>
				</label>
			{/if}
		</div>

		{#if userRole === 'admin'}
			<Button
				onclick={() => {
					resetForm();
					showAddModal = true;
				}}
			>
				<Plus size={16} />
				Yeni Oda
			</Button>
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
		<div class="grid gap-2">
			<Label for="add-room-name">Oda Adı</Label>
			<Input id="add-room-name" type="text" name="name" bind:value={name} required />
		</div>

		<div class="grid gap-2">
			<Label for="add-room-capacity">Kapasite</Label>
			<Input id="add-room-capacity" type="number" name="capacity" bind:value={capacity} min="0" />
		</div>

		<div class="flex justify-end gap-2">
			<Button
				type="button"
				variant="outline"
				onclick={() => {
					showAddModal = false;
					resetForm();
				}}
			>
				İptal
			</Button>
			<Button type="submit" disabled={formLoading}>
				{#if formLoading}
					<LoaderCircle size={16} class="animate-spin" />
				{:else}
					<Plus size={16} />
				{/if}
				Ekle
			</Button>
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

		<div class="grid gap-2">
			<Label for="edit-room-name">Oda Adı</Label>
			<Input id="edit-room-name" type="text" name="name" bind:value={name} required />
		</div>

		<div class="grid gap-2">
			<Label for="edit-room-capacity">Kapasite</Label>
			<Input id="edit-room-capacity" type="number" name="capacity" bind:value={capacity} min="0" />
		</div>

		<div class="flex justify-end gap-2">
			<Button
				type="button"
				variant="outline"
				onclick={() => {
					showEditModal = false;
					resetForm();
				}}
			>
				İptal
			</Button>
			<Button type="submit" disabled={formLoading}>
				{#if formLoading}
					<LoaderCircle size={16} class="animate-spin" />
				{:else}
					<Edit size={16} />
				{/if}
				Güncelle
			</Button>
		</div>
	</form>
</Modal>

<Modal bind:open={showArchiveModal} title="Odayı Arşivle" onClose={resetForm}>
	<p class="mb-4">
		<strong>{selectedRoom?.name}</strong> adlı odayı arşivlemek istediğinizden emin misiniz? Arşivlenen
		odalar listede görünmez hale gelecektir.
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

		<div class="flex justify-end gap-2">
			<Button
				type="button"
				variant="outline"
				onclick={() => {
					showArchiveModal = false;
					resetForm();
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
		</div>
	</form>
</Modal>

<Modal bind:open={showRestoreModal} title="Odayı Geri Yükle" onClose={resetForm}>
	<p class="mb-4">
		<strong>{selectedRoom?.name}</strong> adlı odayı geri yüklemek istediğinizden emin misiniz? Oda aktif
		odalar listesinde görünür hale gelecektir.
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

		<div class="flex justify-end gap-2">
			<Button
				type="button"
				variant="outline"
				onclick={() => {
					showRestoreModal = false;
					resetForm();
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
		</div>
	</form>
</Modal>
