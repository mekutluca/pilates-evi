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
	import type { Trainee } from '$lib/types';
	import SortableTable from '$lib/components/sortable-table.svelte';
	import type { ActionItem } from '$lib/types';
	import { getActionErrorMessage } from '$lib/utils/form-utils';
	import Modal from '$lib/components/modal.svelte';
	import ModalFooter from '$lib/components/modal-footer.svelte';
	import { validation } from '$lib/utils/validation';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';

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
					const t = trainees.find((t) => t.id === String(id));
					if (t) openEditModal(t);
				},
				icon: Edit
			}
		];

		if (trainee.is_active) {
			baseActions.push({
				label: 'Arşivle',
				handler: (id?: string | number) => {
					const t = trainees.find((t) => t.id === String(id));
					if (t) openArchiveModal(t);
				},
				class: 'text-destructive',
				icon: Archive
			});
		} else {
			baseActions.push({
				label: 'Geri Yükle',
				handler: (id?: string | number) => {
					const t = trainees.find((t) => t.id === String(id));
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
			key: 'email',
			title: 'Email',
			render: (trainee: Trainee) =>
				`<a href="mailto:${trainee.email}" class="text-sm underline text-muted-foreground hover:text-foreground transition-colors">${trainee.email}</a>`
		},
		{
			key: 'phone',
			title: 'Telefon',
			render: (trainee: Trainee) =>
				`<a href="tel:+90${trainee.phone}" class="text-sm underline text-muted-foreground hover:text-foreground transition-colors">${trainee.phone}</a>`
		},
		{
			key: 'created_at',
			title: 'Kayıt Tarihi',
			render: (trainee: Trainee) => (trainee.created_at ? formatDate(trainee.created_at) : '-')
		}
	];

	function openEditModal(trainee: Trainee) {
		selectedTrainee = trainee;
		name = trainee.name ?? '';
		email = trainee.email ?? '';
		phone = trainee.phone ?? '';
		notes = trainee.notes ?? '';
		showEditModal = true;
	}

	function openArchiveModal(trainee: Trainee) {
		selectedTrainee = trainee;
		showArchiveModal = true;
	}

	function openRestoreModal(trainee: Trainee) {
		selectedTrainee = trainee;
		showRestoreModal = true;
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

<svelte:head>
	<title>Öğrenciler · Pilates Evi</title>
</svelte:head>

<div class="p-6">
	<PageHeader title="Öğrenciler" subtitle="Bu sayfada öğrencileri yönetin" />

	<div class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
		<div class="w-full lg:max-w-xs">
			<SearchInput bind:value={searchTerm} placeholder="Öğrenci ara..." />
			{#if hasArchivedTrainees}
				<label class="mt-2 flex cursor-pointer items-center gap-2">
					<Switch bind:checked={showArchived} class="scale-75" />
					<span class="text-sm text-muted-foreground">Arşivlenenleri göster</span>
				</label>
			{/if}
		</div>

		<Button
			onclick={() => {
				resetForm();
				showAddModal = true;
			}}
		>
			<GraduationCap size={16} />
			Yeni Öğrenci
		</Button>
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
		<div class="grid gap-2">
			<Label for="add-trainee-name">Öğrenci Adı</Label>
			<Input id="add-trainee-name" type="text" name="name" bind:value={name} required />
		</div>

		<div class="grid gap-2">
			<Label for="add-trainee-email">Email</Label>
			<Input
				id="add-trainee-email"
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
			<Label for="add-trainee-phone">Telefon</Label>
			<Input
				id="add-trainee-phone"
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
			<Label for="add-trainee-notes">Notlar (İsteğe bağlı)</Label>
			<Textarea
				id="add-trainee-notes"
				name="notes"
				bind:value={notes}
				placeholder="Öğrenci hakkında notlar..."
				rows={3}
			/>
		</div>

		<ModalFooter>
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
		</ModalFooter>
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

		<div class="grid gap-2">
			<Label for="edit-trainee-name">Öğrenci Adı</Label>
			<Input id="edit-trainee-name" type="text" name="name" bind:value={name} required />
		</div>

		<div class="grid gap-2">
			<Label for="edit-trainee-email">Email</Label>
			<Input
				id="edit-trainee-email"
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
			<Label for="edit-trainee-phone">Telefon</Label>
			<Input
				id="edit-trainee-phone"
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
			<Label for="edit-trainee-notes">Notlar (İsteğe bağlı)</Label>
			<Textarea
				id="edit-trainee-notes"
				name="notes"
				bind:value={notes}
				placeholder="Öğrenci hakkında notlar..."
				rows={3}
			/>
		</div>

		<ModalFooter>
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
		</ModalFooter>
	</form>
</Modal>

<Modal bind:open={showArchiveModal} title="Öğrenciyi Arşivle" onClose={resetForm}>
	<p class="mb-4">
		<strong>{selectedTrainee?.name}</strong> adlı öğrenciyi arşivlemek istediğinizden emin misiniz? Arşivlenen
		öğrenciler listede görünmez hale gelecektir.
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

		<ModalFooter>
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
		</ModalFooter>
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

		<ModalFooter>
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
		</ModalFooter>
	</form>
</Modal>
