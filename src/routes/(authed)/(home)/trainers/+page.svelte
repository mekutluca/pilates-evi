<script lang="ts">
	import { toast } from 'svelte-sonner';
	import Plus from '@lucide/svelte/icons/plus';
	import Edit from '@lucide/svelte/icons/edit';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import SearchInput from '$lib/components/search-input.svelte';
	import PageHeader from '$lib/components/page-header.svelte';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Key from '@lucide/svelte/icons/key';
	import { enhance } from '$app/forms';
	import type { Trainer } from '$lib/types/Trainer';
	// Training system removed
	import SortableTable from '$lib/components/sortable-table.svelte';
	import type { ActionItem } from '$lib/types/ActionItem';
	import { getActionErrorMessage } from '$lib/utils/form-utils';
	import Modal from '$lib/components/modal.svelte';

	let { data } = $props();
	let { trainers: initialTrainers, userRole } = $derived(data);

	let trainers = $derived<Trainer[]>(initialTrainers || []);
	let searchTerm = $state('');
	let showAddModal = $state(false);
	let showEditModal = $state(false);
	let showDeleteModal = $state(false);
	let showResetPasswordModal = $state(false);
	let selectedTrainer = $state<Trainer | null>(null);
	let formLoading = $state(false);

	// Form data for add/edit trainer
	let name = $state('');
	let phone = $state('');
	let email = $state('');
	let password = $state('');
	let newPassword = $state('');
	// Training system removed

	const tableActions = $derived<ActionItem[]>([
		{
			label: 'Düzenle',
			handler: (id) => {
				if (!id) return;
				const trainer = trainers.find((t) => t.id === Number(id));
				if (trainer) openEditModal(trainer);
			},
			icon: Edit
		},
		...(userRole === 'admin'
			? [
					{
						label: 'Şifre Sıfırla',
						handler: (id?: string | number) => {
							if (!id) return;
							const trainer = trainers.find((t) => t.id === Number(id));
							if (trainer) openResetPasswordModal(trainer);
						},
						icon: Key
					}
				]
			: []),
		{
			label: 'Sil',
			handler: (id) => {
				if (!id) return;
				const trainer = trainers.find((t) => t.id === Number(id));
				if (trainer) openDeleteModal(trainer);
			},
			class: 'text-error',
			icon: Trash2
		}
	]);

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

	function openResetPasswordModal(trainer: Trainer) {
		selectedTrainer = trainer;
		newPassword = '';
		showResetPasswordModal = true;
		closeDropdown();
	}

	function resetForm() {
		name = '';
		phone = '';
		email = '';
		password = '';
		newPassword = '';
		selectedTrainer = null;
		// No training selection needed
	}
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
<Modal bind:open={showAddModal} title="Yeni Eğitmen Ekle" onClose={resetForm}>
	<form
		method="POST"
		action="?/createTrainer"
		class="space-y-4"
		use:enhance={() => {
			formLoading = true;
			return async ({ result, update }) => {
				formLoading = false;

				if (result.type === 'success') {
					toast.success('Eğitmen ve kullanıcı hesabı başarıyla oluşturuldu');
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

		<fieldset class="fieldset">
			<legend class="fieldset-legend">E-posta</legend>
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
			<legend class="fieldset-legend">Şifre</legend>
			<input
				type="password"
				name="password"
				class="input w-full"
				bind:value={password}
				placeholder="Minimum 6 karakter"
				minlength="6"
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
</Modal>

<!-- Edit Trainer Modal -->
<Modal bind:open={showEditModal} title="Eğitmen Düzenle" onClose={resetForm}>
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
</Modal>

<!-- Delete Trainer Modal -->
<Modal bind:open={showDeleteModal} title="Eğitmeni Sil" onClose={resetForm}>
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
</Modal>

<!-- Reset Password Modal -->
<Modal bind:open={showResetPasswordModal} title="Şifre Sıfırla" onClose={resetForm}>
	<p class="mb-4">
		<strong>{selectedTrainer?.name}</strong> adlı eğitmenin şifresini sıfırlamak istediğinizden emin
		misiniz?
	</p>
	<form
		method="POST"
		action="?/resetPassword"
		class="space-y-4"
		use:enhance={() => {
			formLoading = true;
			return async ({ result, update }) => {
				formLoading = false;

				if (result.type === 'success') {
					toast.success('Şifre başarıyla sıfırlandı');
					showResetPasswordModal = false;
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
			<legend class="fieldset-legend">Yeni Şifre</legend>
			<input
				type="password"
				name="newPassword"
				class="input w-full"
				bind:value={newPassword}
				placeholder="Minimum 6 karakter"
				minlength="6"
				required
			/>
		</fieldset>

		<div class="modal-action">
			<button
				type="button"
				class="btn"
				onclick={() => {
					showResetPasswordModal = false;
					resetForm();
				}}
			>
				İptal
			</button>
			<button type="submit" class="btn btn-warning" disabled={formLoading}>
				{#if formLoading}
					<LoaderCircle size={16} class="animate-spin" />
				{:else}
					<Key size={16} />
				{/if}
				Şifre Sıfırla
			</button>
		</div>
	</form>
</Modal>
