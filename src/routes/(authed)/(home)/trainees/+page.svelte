<script lang="ts">
	import { toast } from 'svelte-sonner';
	import Plus from '@lucide/svelte/icons/plus';
	import Edit from '@lucide/svelte/icons/edit';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import SearchInput from '$lib/components/search-input.svelte';
	import PageHeader from '$lib/components/page-header.svelte';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import GraduationCap from '@lucide/svelte/icons/graduation-cap';
	import { enhance } from '$app/forms';
	import type { Trainee } from '$lib/types/Trainee';
	import SortableTable from '$lib/components/sortable-table.svelte';
	import type { ActionItem } from '$lib/types/ActionItem.js';
	import { getActionErrorMessage } from '$lib/utils/form-utils';
	import Modal from '$lib/components/modal.svelte';

	let { data } = $props();
	let { trainees: initialTrainees } = $derived(data);

	let trainees = $derived<Trainee[]>(initialTrainees || []);
	let searchTerm = $state('');
	let showAddModal = $state(false);
	let showEditModal = $state(false);
	let showDeleteModal = $state(false);
	let selectedTrainee = $state<Trainee | null>(null);
	let formLoading = $state(false);

	let name = $state('');
	let email = $state('');
	let phone = $state('');
	let notes = $state('');

	const tableActions: ActionItem[] = [
		{
			label: 'Düzenle',
			handler: (id) => {
				const trainee = trainees.find((t) => t.id === Number(id));
				if (trainee) openEditModal(trainee);
			},
			icon: Edit
		},
		{
			label: 'Sil',
			handler: (id) => {
				const trainee = trainees.find((t) => t.id === Number(id));
				if (trainee) openDeleteModal(trainee);
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

	function openDeleteModal(trainee: Trainee) {
		selectedTrainee = trainee;
		showDeleteModal = true;
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
		actions={tableActions}
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

<Modal bind:open={showDeleteModal} title="Öğrenciyi Sil" onClose={resetForm}>
	<p class="mb-4">
		<strong>{selectedTrainee?.name}</strong> adlı öğrenciyi silmek istediğinizden emin misiniz? Bu işlem
		geri alınamaz.
	</p>
	<form
		method="POST"
		action="?/deleteTrainee"
		class="space-y-4"
		use:enhance={() => {
			formLoading = true;
			return async ({ result, update }) => {
				formLoading = false;
				if (result.type === 'success') {
					toast.success('Öğrenci başarıyla silindi');
					showDeleteModal = false;
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
</Modal>
