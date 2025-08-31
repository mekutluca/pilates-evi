<script lang="ts">
	import { toast } from 'svelte-sonner';
	import Plus from '@lucide/svelte/icons/plus';
	import Edit from '@lucide/svelte/icons/edit';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import SearchInput from '$lib/components/search-input.svelte';
	import PageHeader from '$lib/components/page-header.svelte';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { enhance } from '$app/forms';
	import type { Trainer } from '$lib/types/Trainer';
	// Training system removed
	import SortableTable from '$lib/components/sortable-table.svelte';
	import type { ActionItem } from '$lib/types/ActionItem';
	import { getActionErrorMessage } from '$lib/utils/form-utils';

	let { data } = $props();
	let { trainers: initialTrainers } = $derived(data);

	let trainers = $derived<Trainer[]>(initialTrainers || []);
	let searchTerm = $state('');
	let showAddModal = $state(false);
	let showEditModal = $state(false);
	let showDeleteModal = $state(false);
	let selectedTrainer = $state<Trainer | null>(null);
	let formLoading = $state(false);

	// Form data for add/edit trainer
	let name = $state('');
	let phone = $state('');
	// Training system removed

	const tableActions: ActionItem[] = [
		{
			label: 'Düzenle',
			handler: (id) => {
				const trainer = trainers.find((t) => t.id === Number(id));
				if (trainer) openEditModal(trainer);
			},
			icon: Edit
		},
		{
			label: 'Sil',
			handler: (id) => {
				const trainer = trainers.find((t) => t.id === Number(id));
				if (trainer) openDeleteModal(trainer);
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
			key: 'phone',
			title: 'Telefon',
			render: (trainer: Trainer) =>
				`<a href="tel:${trainer.phone}" class="text-sm underline text-base-content/70 hover:text-info transition-colors">${trainer.phone}</a>`
		},
		{
			key: 'active_appointments',
			title: 'Durum',
			sortable: false,
			render: (trainer: Trainer) => {
				return trainer.is_active
					? '<span class="badge badge-success badge-sm">Aktif</span>'
					: '<span class="badge badge-error badge-sm">Pasif</span>';
			}
		}
	];

	// clear handled inside SearchInput component via bind:value

	function closeDropdown() {
		const activeElement = document?.activeElement as HTMLElement | null;
		activeElement?.blur();
	}

	function openEditModal(trainer: Trainer) {
		selectedTrainer = trainer;
		name = trainer.name ?? '';
		phone = trainer.phone;
		// Training assignment removed
		showEditModal = true;
		closeDropdown();
	}

	function openDeleteModal(trainer: Trainer) {
		selectedTrainer = trainer;
		showDeleteModal = true;
		closeDropdown();
	}

	function resetForm() {
		name = '';
		phone = '';
		selectedTrainer = null;
		// No training selection needed
	}

	// Training-related functions removed - no longer needed with package-based system
</script>

<div class="p-6">
	<PageHeader title="Eğitmenler" subtitle="Bu sayfada eğitmenleri yönetin" />

	<!-- Search and Add Trainer Section -->
	<div class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
		<div class="form-control w-full lg:max-w-xs">
			<SearchInput bind:value={searchTerm} placeholder="Eğitmen ara..." />
		</div>

		<button
			class="btn btn-info"
			onclick={() => {
				resetForm();
				showAddModal = true;
			}}
		>
			<UserPlus size={16} />
			Yeni Eğitmen
		</button>
	</div>

	<SortableTable
		data={trainers}
		columns={tableColumns}
		{searchTerm}
		emptyMessage="Henüz eğitmen bulunmuyor"
		defaultSortKey="id"
		defaultSortOrder="asc"
		actions={tableActions}
	/>
</div>

<!-- Add Trainer Modal -->
<dialog class="modal" class:modal-open={showAddModal}>
	<div class="modal-box">
		<h3 class="mb-4 text-lg font-bold">Yeni Eğitmen Ekle</h3>
		<form
			method="POST"
			action="?/createTrainer"
			class="space-y-4"
			use:enhance={() => {
				formLoading = true;
				return async ({ result, update }) => {
					formLoading = false;

					if (result.type === 'success') {
						toast.success('Eğitmen başarıyla oluşturuldu');
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
				<legend class="fieldset-legend">Eğitmen Adı</legend>
				<input type="text" name="name" class="input w-full" bind:value={name} required />
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

			<!-- Training assignment section removed - no longer needed in package-based system -->

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
				<button type="submit" class="btn btn-info" disabled={formLoading}>
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

<!-- Edit Trainer Modal -->
<dialog class="modal" class:modal-open={showEditModal}>
	<div class="modal-box">
		<h3 class="mb-4 text-lg font-bold">Eğitmen Düzenle</h3>
		<form
			method="POST"
			action="?/updateTrainer"
			class="space-y-4"
			use:enhance={() => {
				formLoading = true;
				return async ({ result, update }) => {
					formLoading = false;

					if (result.type === 'success') {
						toast.success('Eğitmen başarıyla güncellendi');
						showEditModal = false;
						resetForm();
					} else if (result.type === 'failure') {
						toast.error(getActionErrorMessage(result));
					}

					await update();
				};
			}}
		>
			<input type="hidden" name="trainerId" value={selectedTrainer?.id} />

			<fieldset class="fieldset">
				<legend class="fieldset-legend">Eğitmen Adı</legend>
				<input type="text" name="name" class="input w-full" bind:value={name} required />
			</fieldset>

			<fieldset class="fieldset">
				<legend class="fieldset-legend">Telefon</legend>
				<input
					type="tel"
					name="phone"
					class="input w-full"
					bind:value={phone}
					placeholder="05xx xxx xx xx"
					required
				/>
			</fieldset>

			<!-- Training assignment section removed - no longer needed in package-based system -->

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
				<button type="submit" class="btn btn-info" disabled={formLoading}>
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

<!-- Delete Trainer Modal -->
<dialog class="modal" class:modal-open={showDeleteModal}>
	<div class="modal-box">
		<h3 class="mb-4 text-lg font-bold">Eğitmeni Sil</h3>
		<p class="mb-4">
			<strong>{selectedTrainer?.name}</strong> adlı eğitmeni silmek istediğinizden emin misiniz? Bu işlem
			geri alınamaz.
		</p>
		<form
			method="POST"
			action="?/deleteTrainer"
			class="space-y-4"
			use:enhance={() => {
				formLoading = true;
				return async ({ result, update }) => {
					formLoading = false;

					if (result.type === 'success') {
						toast.success('Eğitmen başarıyla silindi');
						showDeleteModal = false;
						resetForm();
					} else if (result.type === 'failure') {
						toast.error(getActionErrorMessage(result));
					}

					await update();
				};
			}}
		>
			<input type="hidden" name="trainerId" value={selectedTrainer?.id} />

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
