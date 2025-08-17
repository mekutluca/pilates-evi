<script lang="ts">
	import { toast } from 'svelte-sonner';
	import Plus from '@lucide/svelte/icons/plus';
	import Edit from '@lucide/svelte/icons/edit';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import SearchInput from '$lib/components/search-input.svelte';
	import PageHeader from '$lib/components/page-header.svelte';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { enhance } from '$app/forms';
	import type { Room } from '$lib/types/Room';
	import SortableTable from '$lib/components/sortable-table.svelte';
	import type { ActionItem } from '$lib/types/ActionItem';

	let { data } = $props();
	let { rooms: initialRooms } = $derived(data);

	let rooms = $derived<Room[]>(initialRooms || []);
	let searchTerm = $state('');
	let showAddModal = $state(false);
	let showEditModal = $state(false);
	let showDeleteModal = $state(false);
	let selectedRoom = $state<Room | null>(null);
	let formLoading = $state(false);

	let name = $state('');
	let capacity = $state<number | null>(null);

	const tableActions: ActionItem[] = [
		{
			label: 'Düzenle',
			handler: (id) => {
				const room = rooms.find((r) => r.id === Number(id));
				if (room) openEditModal(room);
			},
			icon: Edit
		},
		{
			label: 'Sil',
			handler: (id) => {
				const room = rooms.find((r) => r.id === Number(id));
				if (room) openDeleteModal(room);
			},
			class: 'text-error',
			icon: Trash2
		}
	];

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

	function openDeleteModal(room: Room) {
		selectedRoom = room;
		showDeleteModal = true;
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
		<div class="form-control w-full max-w-xs">
			<SearchInput bind:value={searchTerm} placeholder="Oda ara..." />
		</div>

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
	</div>

	<SortableTable
		data={rooms}
		columns={tableColumns}
		{searchTerm}
		emptyMessage="Henüz oda bulunmuyor"
		defaultSortKey="id"
		defaultSortOrder="asc"
		actions={tableActions}
	/>
</div>

<dialog class="modal" class:modal-open={showAddModal}>
	<div class="modal-box">
		<h3 class="mb-4 text-lg font-bold">Yeni Oda Ekle</h3>
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
					} else if (result.type === 'failure' && result.data && 'message' in result.data) {
						toast.error(result.data.message as string);
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
	</div>
	<form method="dialog" class="modal-backdrop">
		<button
			onclick={() => {
				showAddModal = false;
				resetForm();
			}}>kapat</button
		>
	</form>
</dialog>

<dialog class="modal" class:modal-open={showEditModal}>
	<div class="modal-box">
		<h3 class="mb-4 text-lg font-bold">Oda Düzenle</h3>
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
					} else if (result.type === 'failure' && result.data && 'message' in result.data) {
						toast.error(result.data.message as string);
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
	</div>
	<form method="dialog" class="modal-backdrop">
		<button
			onclick={() => {
				showEditModal = false;
				resetForm();
			}}>kapat</button
		>
	</form>
</dialog>

<dialog class="modal" class:modal-open={showDeleteModal}>
	<div class="modal-box">
		<h3 class="mb-4 text-lg font-bold">Odayı Sil</h3>
		<p class="mb-4">
			<strong>{selectedRoom?.name}</strong> adlı odayı silmek istediğinizden emin misiniz? Bu işlem geri
			alınamaz.
		</p>
		<form
			method="POST"
			action="?/deleteRoom"
			class="space-y-4"
			use:enhance={() => {
				formLoading = true;
				return async ({ result, update }) => {
					formLoading = false;
					if (result.type === 'success') {
						toast.success('Oda başarıyla silindi');
						showDeleteModal = false;
						resetForm();
					} else if (result.type === 'failure' && result.data && 'message' in result.data) {
						toast.error(result.data.message as string);
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
						showDeleteModal = false;
						resetForm();
					}}
				>
					İptal
				</button>
				<button type="submit" class="btn btn-error" disabled={formLoading}>
					{#if formLoading}
						<LoaderCircle size={16} class="animate-spin" />
					{:else}
						<Trash2 size={16} />
					{/if}
					Sil
				</button>
			</div>
		</form>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button
			onclick={() => {
				showDeleteModal = false;
				resetForm();
			}}>kapat</button
		>
	</form>
</dialog>
