<script lang="ts">
	import { toast } from 'svelte-sonner';
	import Plus from '@lucide/svelte/icons/plus';
	import Edit from '@lucide/svelte/icons/edit';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import SearchInput from '$lib/components/search-input.svelte';
	import PageHeader from '$lib/components/page-header.svelte';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { enhance } from '$app/forms';
	import type { Training } from '$lib/types/Training';
	import SortableTable from '$lib/components/sortable-table.svelte';
	import type { ActionItem } from '$lib/types/ActionItem';
	import { getActionErrorMessage } from '$lib/utils';

	let { data } = $props();
	let { trainings: initialTrainings } = $derived(data);

	let trainings = $derived<Training[]>(initialTrainings || []);
	let searchTerm = $state('');
	let showAddModal = $state(false);
	let showEditModal = $state(false);
	let showDeleteModal = $state(false);
	let selectedTraining = $state<Training | null>(null);
	let formLoading = $state(false);

	let name = $state('');
	let minCapacity = $state<number>(0);
	let maxCapacity = $state<number>(0);

	const tableActions: ActionItem[] = [
		{
			label: 'Düzenle',
			handler: (id) => {
				const training = trainings.find((t) => t.id === Number(id));
				if (training) openEditModal(training);
			},
			icon: Edit
		},
		{
			label: 'Sil',
			handler: (id) => {
				const training = trainings.find((t) => t.id === Number(id));
				if (training) openDeleteModal(training);
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
			key: 'min_capacity',
			title: 'Min. Öğrenci'
		},
		{
			key: 'max_capacity',
			title: 'Max. Öğrenci'
		}
	];

	function closeDropdown() {
		const activeElement = document?.activeElement as HTMLElement | null;
		activeElement?.blur();
	}

	function openEditModal(training: Training) {
		selectedTraining = training;
		name = training.name ?? '';
		minCapacity = training.min_capacity;
		maxCapacity = training.max_capacity;
		showEditModal = true;
		closeDropdown();
	}

	function openDeleteModal(training: Training) {
		selectedTraining = training;
		showDeleteModal = true;
		closeDropdown();
	}

	function resetForm() {
		name = '';
		minCapacity = 0;
		maxCapacity = 0;
		selectedTraining = null;
	}
</script>

<div class="p-6">
	<PageHeader title="Egzersizler" subtitle="Bu sayfada egzersiz türlerini yönetin" />

	<div class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
		<div class="form-control w-full max-w-xs">
			<SearchInput bind:value={searchTerm} placeholder="Egzersiz ara..." />
		</div>

		<button
			class="btn btn-secondary"
			onclick={() => {
				resetForm();
				showAddModal = true;
			}}
		>
			<Plus size={16} />
			Yeni Egzersiz
		</button>
	</div>

	<SortableTable
		data={trainings}
		columns={tableColumns}
		{searchTerm}
		emptyMessage="Henüz egzersiz bulunmuyor"
		defaultSortKey="id"
		defaultSortOrder="asc"
		actions={tableActions}
	/>
</div>

<dialog class="modal" class:modal-open={showAddModal}>
	<div class="modal-box">
		<h3 class="mb-4 text-lg font-bold">Yeni Egzersiz Ekle</h3>
		<form
			method="POST"
			action="?/createTraining"
			class="space-y-4"
			use:enhance={() => {
				formLoading = true;
				return async ({ result, update }) => {
					formLoading = false;
					if (result.type === 'success') {
						toast.success('Egzersiz başarıyla oluşturuldu');
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
				<legend class="fieldset-legend">Egzersiz Adı</legend>
				<input type="text" name="name" class="input w-full" bind:value={name} required />
			</fieldset>

			<div class="grid grid-cols-2 gap-4">
				<fieldset class="fieldset">
					<legend class="fieldset-legend">Min. Öğrenci</legend>
					<input
						type="number"
						name="min_capacity"
						class="input w-full"
						bind:value={minCapacity}
						min="0"
					/>
				</fieldset>

				<fieldset class="fieldset">
					<legend class="fieldset-legend">Max. Öğrenci</legend>
					<input
						type="number"
						name="max_capacity"
						class="input w-full"
						bind:value={maxCapacity}
						min="0"
					/>
				</fieldset>
			</div>

			<div class="form-control">
				<label class="cursor-pointer justify-start gap-3">
					<input
						type="checkbox"
						name="assignToAllTrainers"
						class="checkbox checkbox-secondary"
						checked
					/>
					<span class="label-text pl-3">Tüm eğitmenlere otomatik ata</span>
				</label>
				<div class="ml-7 pl-3 text-xs text-base-content/60">
					Bu egzersizi oluştururken tüm mevcut eğitmenlere otomatik olarak atar
				</div>
			</div>

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
				<button type="submit" class="btn btn-secondary" disabled={formLoading}>
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
		<h3 class="mb-4 text-lg font-bold">Egzersiz Düzenle</h3>
		<form
			method="POST"
			action="?/updateTraining"
			class="space-y-4"
			use:enhance={() => {
				formLoading = true;
				return async ({ result, update }) => {
					formLoading = false;
					if (result.type === 'success') {
						toast.success('Egzersiz başarıyla güncellendi');
						showEditModal = false;
						resetForm();
					} else if (result.type === 'failure') {
						toast.error(getActionErrorMessage(result));
					}
					await update();
				};
			}}
		>
			<input type="hidden" name="trainingId" value={selectedTraining?.id} />

			<fieldset class="fieldset">
				<legend class="fieldset-legend">Egzersiz Adı</legend>
				<input type="text" name="name" class="input w-full" bind:value={name} required />
			</fieldset>

			<div class="grid grid-cols-2 gap-4">
				<fieldset class="fieldset">
					<legend class="fieldset-legend">Min. Öğrenci</legend>
					<input
						type="number"
						name="min_capacity"
						class="input w-full"
						bind:value={minCapacity}
						min="0"
					/>
				</fieldset>

				<fieldset class="fieldset">
					<legend class="fieldset-legend">Max. Öğrenci</legend>
					<input
						type="number"
						name="max_capacity"
						class="input w-full"
						bind:value={maxCapacity}
						min="0"
					/>
				</fieldset>
			</div>

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
				<button type="submit" class="btn btn-secondary" disabled={formLoading}>
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
		<h3 class="mb-4 text-lg font-bold">Egzersizi Sil</h3>
		<p class="mb-4">
			<strong>{selectedTraining?.name}</strong> adlı egzersizi silmek istediğinizden emin misiniz? Bu
			işlem geri alınamaz.
		</p>
		<form
			method="POST"
			action="?/deleteTraining"
			class="space-y-4"
			use:enhance={() => {
				formLoading = true;
				return async ({ result, update }) => {
					formLoading = false;
					if (result.type === 'success') {
						toast.success('Egzersiz başarıyla silindi');
						showDeleteModal = false;
						resetForm();
					} else if (result.type === 'failure') {
						toast.error(getActionErrorMessage(result));
					}
					await update();
				};
			}}
		>
			<input type="hidden" name="trainingId" value={selectedTraining?.id} />

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
