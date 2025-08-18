<script lang="ts">
	import { toast } from 'svelte-sonner';
	import Plus from '@lucide/svelte/icons/plus';
	import Edit from '@lucide/svelte/icons/edit';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import SearchInput from '$lib/components/search-input.svelte';
	import PageHeader from '$lib/components/page-header.svelte';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Check from '@lucide/svelte/icons/check';
	import { enhance } from '$app/forms';
	import type { Trainer } from '$lib/types/Trainer';
	import type { Training } from '$lib/types/Training';
	import type { Database } from '$lib/database.types';
	import SortableTable from '$lib/components/sortable-table.svelte';
	import type { ActionItem } from '$lib/types/ActionItem';
	import { getActionErrorMessage } from '$lib/utils/form-utils';

	type TrainerTraining = Database['public']['Tables']['pe_trainer_trainings']['Row'];

	let { data } = $props();
	let { trainers: initialTrainers, trainings, trainerTrainings } = $derived(data);

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
	let selectedTrainingIds = $state<number[]>([]);

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
			key: 'trainings',
			title: 'Verebildiği Dersler',
			sortable: false,
			render: (trainer: Trainer) => {
				try {
					if (!trainerTrainings || !trainings) {
						return '<span class="text-base-content/50 text-sm">-</span>';
					}

					const trainerTrainingIds =
						(trainerTrainings as TrainerTraining[])
							.filter((tt: TrainerTraining) => tt.trainer_id === trainer.id)
							.map((tt: TrainerTraining) => tt.training_id) || [];

					if (trainerTrainingIds.length === 0) {
						return '<span class="text-base-content/50 text-sm">-</span>';
					}

					const trainerTrainingNames =
						trainings
							.filter((training) => trainerTrainingIds.includes(training.id))
							.map(
								(training) => `<span class="badge badge-secondary badge-sm">${training.name}</span>`
							)
							.join(' ') || '';

					return `<div class="flex flex-wrap gap-1">${trainerTrainingNames}</div>`;
				} catch (error) {
					console.error('Error rendering trainings column:', error);
					return '<span class="text-base-content/50 text-sm">-</span>';
				}
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
		selectedTrainingIds = getTrainerTrainings(trainer.id).map((t) => t.id);
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
		selectedTrainingIds = []; // Default: no trainings selected
	}

	function getTrainerTrainings(trainerId: number): Training[] {
		const trainerTrainingIds = (trainerTrainings as TrainerTraining[])
			.filter((tt) => tt.trainer_id === trainerId)
			.map((tt) => tt.training_id);
		return trainings.filter((t) => trainerTrainingIds.includes(t.id));
	}

	function toggleTraining(trainingId: number) {
		if (selectedTrainingIds.includes(trainingId)) {
			selectedTrainingIds = selectedTrainingIds.filter((id) => id !== trainingId);
		} else {
			selectedTrainingIds = [...selectedTrainingIds, trainingId];
		}
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

			<fieldset class="fieldset">
				<legend class="fieldset-legend">Verebildiği Dersler</legend>
				<div class="mb-2 text-xs text-base-content/60">
					Egzersizlere tıklayarak atamasını değiştirebilirsiniz
				</div>
				<div class="flex flex-wrap gap-2">
					{#each trainings as training (training.id)}
						{@const isSelected = selectedTrainingIds.includes(training.id)}
						<input
							type="hidden"
							name="selectedTrainingIds"
							value={training.id}
							disabled={!isSelected}
						/>
						<button
							type="button"
							class="badge {isSelected
								? 'badge-secondary'
								: 'badge-outline badge-secondary'} flex cursor-pointer items-center gap-2 transition-all duration-200 hover:scale-105"
							onclick={() => toggleTraining(training.id)}
						>
							<div class="swap swap-rotate">
								<input type="checkbox" checked={isSelected} readonly />
								<Check size={14} class="swap-on" />
								<Plus size={14} class="swap-off" />
							</div>
							{training.name}
						</button>
					{/each}
				</div>
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

			<fieldset class="fieldset">
				<legend class="fieldset-legend">Verebildiği Dersler</legend>
				<div class="mb-2 text-xs text-base-content/60">
					Egzersizlere tıklayarak atamasını değiştirebilirsiniz
				</div>
				<div class="flex flex-wrap gap-2">
					{#each trainings as training (training.id)}
						{@const isSelected = selectedTrainingIds.includes(training.id)}
						<input
							type="hidden"
							name="selectedTrainingIds"
							value={training.id}
							disabled={!isSelected}
						/>
						<button
							type="button"
							class="badge {isSelected
								? 'badge-secondary'
								: 'badge-outline badge-secondary'} flex cursor-pointer items-center gap-2 transition-all duration-200 hover:scale-105"
							onclick={() => toggleTraining(training.id)}
						>
							<div class="swap swap-rotate">
								<input type="checkbox" checked={isSelected} readonly />
								<Check size={14} class="swap-on" />
								<Plus size={14} class="swap-off" />
							</div>
							{training.name}
						</button>
					{/each}
				</div>
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
