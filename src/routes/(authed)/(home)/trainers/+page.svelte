<script lang="ts">
	import { toast } from 'svelte-sonner';
	import Plus from '@lucide/svelte/icons/plus';
	import Edit from '@lucide/svelte/icons/edit';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import SearchInput from '$lib/components/search-input.svelte';
	import PageHeader from '$lib/components/page-header.svelte';
	import Archive from '@lucide/svelte/icons/archive';
	import ArchiveRestore from '@lucide/svelte/icons/archive-restore';
	import Key from '@lucide/svelte/icons/key';
	import { enhance } from '$app/forms';
	import type { Trainer } from '$lib/types';
	import SortableTable from '$lib/components/sortable-table.svelte';
	import type { ActionItem } from '$lib/types';
	import { getActionErrorMessage } from '$lib/utils/form-utils';
	import Modal from '$lib/components/modal.svelte';
	import { validation } from '$lib/utils/validation';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';

	let { data } = $props();
	let { trainers: initialTrainers, userRole } = $derived(data);

	let showArchived = $state(false);
	let hasArchivedTrainers = $derived((initialTrainers || []).some((t) => !t.is_active));
	let trainers = $derived<Trainer[]>(
		showArchived ? initialTrainers || [] : (initialTrainers || []).filter((t) => t.is_active)
	);
	let searchTerm = $state('');
	let showAddModal = $state(false);
	let showEditModal = $state(false);
	let showArchiveModal = $state(false);
	let showRestoreModal = $state(false);
	let showResetPasswordModal = $state(false);
	let selectedTrainer = $state<Trainer | null>(null);
	let formLoading = $state(false);

	// Form data for add/edit trainer
	let name = $state('');
	let phone = $state('');
	let email = $state('');
	let password = $state('');
	let newPassword = $state('');

	const getTableActions = (trainer: Trainer): ActionItem[] => {
		if (userRole !== 'admin') return [];

		const baseActions: ActionItem[] = [
			{
				label: 'Düzenle',
				handler: (id?: string | number) => {
					if (!id) return;
					const t = trainers.find((t) => t.id === String(id));
					if (t) openEditModal(t);
				},
				icon: Edit
			},
			{
				label: 'Şifre Sıfırla',
				handler: (id?: string | number) => {
					if (!id) return;
					const t = trainers.find((t) => t.id === String(id));
					if (t) openResetPasswordModal(t);
				},
				icon: Key
			}
		];

		if (trainer.is_active) {
			baseActions.push({
				label: 'Arşivle',
				handler: (id?: string | number) => {
					if (!id) return;
					const t = trainers.find((t) => t.id === String(id));
					if (t) openArchiveModal(t);
				},
				class: 'text-destructive',
				icon: Archive
			});
		} else {
			baseActions.push({
				label: 'Geri Yükle',
				handler: (id?: string | number) => {
					if (!id) return;
					const t = trainers.find((t) => t.id === String(id));
					if (t) openRestoreModal(t);
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
			key: 'phone',
			title: 'Telefon',
			render: (trainer: Trainer) =>
				`<a href="tel:+90${trainer.phone}" class="text-sm underline text-muted-foreground hover:text-foreground transition-colors">${trainer.phone}</a>`
		},
		{
			key: 'active_appointments',
			title: 'Durum',
			sortable: false,
			render: (trainer: Trainer) => {
				return trainer.is_active
					? '<span class="inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">Aktif</span>'
					: '<span class="inline-flex items-center rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">Pasif</span>';
			}
		}
	];

	function openEditModal(trainer: Trainer) {
		selectedTrainer = trainer;
		name = trainer.name ?? '';
		phone = trainer.phone;
		showEditModal = true;
	}

	function openArchiveModal(trainer: Trainer) {
		selectedTrainer = trainer;
		showArchiveModal = true;
	}

	function openRestoreModal(trainer: Trainer) {
		selectedTrainer = trainer;
		showRestoreModal = true;
	}

	function openResetPasswordModal(trainer: Trainer) {
		selectedTrainer = trainer;
		newPassword = '';
		showResetPasswordModal = true;
	}

	function resetForm() {
		name = '';
		phone = '';
		email = '';
		password = '';
		newPassword = '';
		selectedTrainer = null;
	}
</script>

<div class="p-6">
	<PageHeader title="Eğitmenler" subtitle="Bu sayfada eğitmenleri yönetin" />

	<!-- Search and Add Trainer Section -->
	<div class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
		<div class="w-full lg:max-w-xs">
			<SearchInput bind:value={searchTerm} placeholder="Eğitmen ara..." />
			{#if hasArchivedTrainers}
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
				<UserPlus size={16} />
				Yeni Eğitmen
			</Button>
		{/if}
	</div>

	<SortableTable
		data={trainers}
		columns={tableColumns}
		{searchTerm}
		emptyMessage="Henüz eğitmen bulunmuyor"
		defaultSortKey="id"
		defaultSortOrder="asc"
		actions={getTableActions}
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
		<div class="grid gap-2">
			<Label for="add-trainer-name">Eğitmen Adı</Label>
			<Input id="add-trainer-name" type="text" name="name" bind:value={name} required />
		</div>

		<div class="grid gap-2">
			<Label for="add-trainer-phone">Telefon</Label>
			<Input
				id="add-trainer-phone"
				type="tel"
				name="phone"
				bind:value={phone}
				placeholder="5xx xxx xx xx"
				pattern={validation.phone.pattern}
				title={validation.phone.title}
				maxlength={validation.phone.maxlength}
				required
			/>
		</div>

		<div class="grid gap-2">
			<Label for="add-trainer-email">E-posta</Label>
			<Input
				id="add-trainer-email"
				type="email"
				name="email"
				bind:value={email}
				placeholder="ornek@email.com"
				pattern={validation.email.pattern}
				title={validation.email.title}
				required
			/>
		</div>

		<div class="grid gap-2">
			<Label for="add-trainer-password">Şifre</Label>
			<Input
				id="add-trainer-password"
				type="password"
				name="password"
				bind:value={password}
				placeholder="Minimum 6 karakter"
				minlength={6}
				required
			/>
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

		<div class="grid gap-2">
			<Label for="edit-trainer-name">Eğitmen Adı</Label>
			<Input id="edit-trainer-name" type="text" name="name" bind:value={name} required />
		</div>

		<div class="grid gap-2">
			<Label for="edit-trainer-phone">Telefon</Label>
			<Input
				id="edit-trainer-phone"
				type="tel"
				name="phone"
				bind:value={phone}
				placeholder="5xx xxx xx xx"
				pattern={validation.phone.pattern}
				title={validation.phone.title}
				maxlength={validation.phone.maxlength}
				required
			/>
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

<!-- Archive Trainer Modal -->
<Modal bind:open={showArchiveModal} title="Eğitmeni Arşivle" onClose={resetForm}>
	<p class="mb-4">
		<strong>{selectedTrainer?.name}</strong> adlı eğitmeni arşivlemek istediğinizden emin misiniz? Arşivlenen
		eğitmenler listede görünmez hale gelecektir.
	</p>
	<form
		method="POST"
		action="?/archiveTrainer"
		class="space-y-4"
		use:enhance={() => {
			formLoading = true;
			return async ({ result, update }) => {
				formLoading = false;

				if (result.type === 'success') {
					toast.success('Eğitmen başarıyla arşivlendi');
					showArchiveModal = false;
					resetForm();
				} else if (result.type === 'failure') {
					toast.error(getActionErrorMessage(result));
				}

				await update();
			};
		}}
	>
		<input type="hidden" name="trainerId" value={selectedTrainer?.id} />

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

<!-- Restore Trainer Modal -->
<Modal bind:open={showRestoreModal} title="Eğitmeni Geri Yükle" onClose={resetForm}>
	<p class="mb-4">
		<strong>{selectedTrainer?.name}</strong> adlı eğitmeni geri yüklemek istediğinizden emin misiniz?
		Eğitmen aktif eğitmenler listesinde görünür hale gelecektir.
	</p>
	<form
		method="POST"
		action="?/restoreTrainer"
		class="space-y-4"
		use:enhance={() => {
			formLoading = true;
			return async ({ result, update }) => {
				formLoading = false;

				if (result.type === 'success') {
					toast.success('Eğitmen başarıyla geri yüklendi');
					showRestoreModal = false;
					resetForm();
				} else if (result.type === 'failure') {
					toast.error(getActionErrorMessage(result));
				}

				await update();
			};
		}}
	>
		<input type="hidden" name="trainerId" value={selectedTrainer?.id} />

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

		<div class="grid gap-2">
			<Label for="reset-trainer-password">Yeni Şifre</Label>
			<Input
				id="reset-trainer-password"
				type="password"
				name="newPassword"
				bind:value={newPassword}
				placeholder="Minimum 6 karakter"
				minlength={6}
				required
			/>
		</div>

		<div class="flex justify-end gap-2">
			<Button
				type="button"
				variant="outline"
				onclick={() => {
					showResetPasswordModal = false;
					resetForm();
				}}
			>
				İptal
			</Button>
			<Button
				type="submit"
				class="bg-warning text-warning-foreground hover:bg-warning/80"
				disabled={formLoading}
			>
				{#if formLoading}
					<LoaderCircle size={16} class="animate-spin" />
				{:else}
					<Key size={16} />
				{/if}
				Şifre Sıfırla
			</Button>
		</div>
	</form>
</Modal>
