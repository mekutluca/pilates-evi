<script lang="ts">
    import { toast } from 'svelte-sonner';
    import Plus from '@lucide/svelte/icons/plus';
    import Edit from '@lucide/svelte/icons/edit';
    import LoaderCircle from '@lucide/svelte/icons/loader-circle';
    import SearchInput from '$lib/components/search-input.svelte';
    import PageHeader from '$lib/components/page-header.svelte';
    import MoreVertical from '@lucide/svelte/icons/more-vertical';
    import Trash2 from '@lucide/svelte/icons/trash-2';
    import GraduationCap from '@lucide/svelte/icons/graduation-cap';
    import X from '@lucide/svelte/icons/x';
    import { enhance } from '$app/forms';
    import type { Trainee } from '$lib/types/Trainee';
    import Combobox from '$lib/components/combobox.svelte';

    let { data } = $props();
    let { trainees: initialTrainees } = $derived(data);

    let trainees = $derived<Trainee[]>(initialTrainees || []);
    let filteredTrainees = $state<Trainee[]>([]);
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
    let selectedTraineeIds = $state<number[]>([]);

    $effect(() => {
        filterTrainees();
    });

    function filterTrainees() {
        if (!searchTerm.trim()) {
            filteredTrainees = trainees;
        } else {
            const term = searchTerm.toLowerCase();
            filteredTrainees = trainees.filter((trainee) => {
                const traineeName = (trainee.name ?? '').toLowerCase();
                const traineeEmail = (trainee.email ?? '').toLowerCase();
                const traineePhone = (trainee.phone ?? '').toLowerCase();
                return traineeName.includes(term) || traineeEmail.includes(term) || traineePhone.includes(term);
            });
        }
    }

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
        selectedTraineeIds = trainee.related_trainee_ids || [];
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
        selectedTraineeIds = [];
        selectedTrainee = null;
    }

    function getTraineeRelations(traineeId: number): Trainee[] {
        const trainee = trainees.find(t => t.id === traineeId);
        if (!trainee || !trainee.related_trainee_ids) return [];
        return trainees.filter(t => trainee.related_trainee_ids.includes(t.id));
    }

    function addTraineeRelation(traineeId: number) {
        if (!selectedTraineeIds.includes(traineeId)) {
            selectedTraineeIds = [...selectedTraineeIds, traineeId];
        }
    }

    function removeTraineeRelation(traineeId: number) {
        selectedTraineeIds = selectedTraineeIds.filter(id => id !== traineeId);
    }

    function getAvailableTrainees() {
        if (!selectedTrainee) {
            // For add modal: exclude already selected trainees
            return trainees.filter(t => !selectedTraineeIds.includes(t.id));
        }
        // For edit modal: exclude current trainee and already selected trainees
        return trainees.filter(t => t.id !== selectedTrainee!.id && !selectedTraineeIds.includes(t.id));
    }

    function getSelectedTrainees(): Trainee[] {
        return trainees.filter(t => selectedTraineeIds.includes(t.id));
    }

    function getSelectedTraineeObjects(): Trainee[] {
        return trainees.filter(t => selectedTraineeIds.includes(t.id));
    }

    function handleTraineeSelect(trainee: Trainee) {
        addTraineeRelation(trainee.id);
    }

    function handleTraineeRemove(trainee: Trainee) {
        removeTraineeRelation(trainee.id);
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
        <div class="form-control w-full max-w-xs">
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

    <div class="card bg-base-100 shadow">
        <div class="card-body">
            {#if filteredTrainees.length === 0}
                <div class="py-8 text-center">
                    <p class="text-base-content/70">
                        {searchTerm
                            ? 'Arama kriterlerine uygun öğrenci bulunamadı'
                            : 'Henüz öğrenci bulunmuyor'}
                    </p>
                </div>
            {:else}
                <div>
                    <table class="table-zebra table">
                        <thead>
                            <tr>
                                <th>Ad</th>
                                <th>Email</th>
                                <th>Telefon</th>
                                <th>Bağlantılı Öğrenciler</th>
                                <th>Kayıt Tarihi</th>
                                <th class="text-right">İşlemler</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each filteredTrainees as trainee, i}
                                <tr>
                                    <td>
                                        <div class="flex items-center gap-2">
                                            <span class="font-medium">{trainee.name}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <a href="mailto:{trainee.email}" class="text-sm underline text-base-content/70 hover:text-info transition-colors">
                                            {trainee.email}
                                        </a>
                                    </td>
                                    <td>
                                        <a href="tel:{trainee.phone}" class="text-sm underline text-base-content/70 hover:text-info transition-colors">
                                            {trainee.phone}
                                        </a>
                                    </td>
                                    <td>
                                        {#each [getTraineeRelations(trainee.id)] as relatedTrainees}
                                            {#if relatedTrainees.length === 0}
                                                <span class="text-base-content/50 text-sm">-</span>
                                            {:else}
                                                <div class="flex flex-wrap gap-1">
                                                    {#each relatedTrainees as relatedTrainee}
                                                        <span class="badge badge-success badge-sm">{relatedTrainee.name}</span>
                                                    {/each}
                                                </div>
                                            {/if}
                                        {/each}
                                    </td>
                                    <td>{formatDate(trainee.created_at)}</td>
                                    <td class="text-right">
                                        <div
                                            class="dropdown dropdown-end {i >= filteredTrainees.length - 1
                                                ? 'dropdown-top'
                                                : ''}"
                                        >
                                            <div tabindex="0" role="button" class="btn btn-sm btn-ghost">
                                                <MoreVertical size={14} />
                                            </div>
                                            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
                                            <ul
                                                tabindex="0"
                                                class="dropdown-content menu rounded-box bg-base-100 z-[1] w-52 border p-2 shadow-lg"
                                            >
                                                <li>
                                                    <button onclick={() => openEditModal(trainee)}>
                                                        <Edit size={14} />
                                                        Düzenle
                                                    </button>
                                                </li>
                                                <li>
                                                    <button onclick={() => openDeleteModal(trainee)} class="text-error">
                                                        <Trash2 size={14} />
                                                        Sil
                                                    </button>
                                                </li>
                                            </ul>
                                        </div>
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {/if}
        </div>
    </div>
</div>

<dialog class="modal" class:modal-open={showAddModal}>
    <div class="modal-box">
        <h3 class="mb-4 text-lg font-bold">Yeni Öğrenci Ekle</h3>
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
                    } else if (result.type === 'failure' && result.data) {
                        const errorData = result.data as any;
                        if (errorData.message) {
                            toast.error(errorData.message);
                        }
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
                <input type="email" name="email" class="input w-full" bind:value={email} placeholder="ornek@email.com" required />
            </fieldset>

            <fieldset class="fieldset">
                <legend class="fieldset-legend">Telefon</legend>
                <input type="tel" name="phone" class="input w-full" bind:value={phone} placeholder="5xx xxx xx xx" required />
            </fieldset>

            <fieldset class="fieldset">
                <legend class="fieldset-legend">Notlar (İsteğe bağlı)</legend>
                <textarea name="notes" class="textarea w-full" bind:value={notes} placeholder="Öğrenci hakkında notlar..." rows="3"></textarea>
            </fieldset>

            <fieldset class="fieldset">
                <legend class="fieldset-legend">Bağlantılı Öğrenciler (İsteğe bağlı)</legend>
                <div class="text-xs text-base-content/60 mb-2">
                    Listeden öğrenci seçerek ilişki ekleyebilirsiniz
                </div>
                
                <!-- Hidden inputs for selected trainees -->
                {#each selectedTraineeIds as traineeId}
                    <input type="hidden" name="selectedTraineeIds" value={traineeId} />
                {/each}
                
                <!-- Selected trainees as removable badges -->
                {#if getSelectedTrainees().length > 0}
                    <div class="mb-3">
                        <div class="text-sm font-medium mb-2">Seçili öğrenciler:</div>
                        <div class="flex flex-wrap gap-2">
                            {#each getSelectedTrainees() as selectedTrainee}
                                <div class="badge badge-success gap-2">
                                    <span>{selectedTrainee.name}</span>
                                    <button
                                        type="button"
                                        class="hover:text-error transition-colors cursor-pointer"
                                        onclick={() => removeTraineeRelation(selectedTrainee.id)}
                                        aria-label="Remove {selectedTrainee.name}"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}
                
                <!-- Trainee selection combobox -->
                <Combobox
                    items={getAvailableTrainees()}
                    selectedItems={getSelectedTraineeObjects()}
                    placeholder="Bağlantılı öğrenci seçin..."
                    searchPlaceholder="Öğrenci ara..."
                    emptyMessage="Öğrenci bulunamadı"
                    multiple={true}
                    getDisplayText={(trainee) => trainee.name}
                    getSearchText={(trainee) => `${trainee.name} ${trainee.email}`}
                    onSelect={handleTraineeSelect}
                    onRemove={handleTraineeRemove}
                />
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
        <h3 class="mb-4 text-lg font-bold">Öğrenci Düzenle</h3>
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
                    } else if (result.type === 'failure' && result.data) {
                        const errorData = result.data as any;
                        if (errorData.message) {
                            toast.error(errorData.message);
                        }
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
                <input type="email" name="email" class="input w-full" bind:value={email} placeholder="ornek@email.com" required />
            </fieldset>

            <fieldset class="fieldset">
                <legend class="fieldset-legend">Telefon</legend>
                <input type="tel" name="phone" class="input w-full" bind:value={phone} placeholder="5xx xxx xx xx" required />
            </fieldset>

            <fieldset class="fieldset">
                <legend class="fieldset-legend">Notlar (İsteğe bağlı)</legend>
                <textarea name="notes" class="textarea w-full" bind:value={notes} placeholder="Öğrenci hakkında notlar..." rows="3"></textarea>
            </fieldset>

            <fieldset class="fieldset">
                <legend class="fieldset-legend">Bağlantılı Öğrenciler (İsteğe bağlı)</legend>
                <div class="text-xs text-base-content/60 mb-2">
                    Listeden öğrenci seçerek ilişki ekleyebilirsiniz
                </div>
                
                <!-- Hidden inputs for selected trainees -->
                {#each selectedTraineeIds as traineeId}
                    <input type="hidden" name="selectedTraineeIds" value={traineeId} />
                {/each}
                
                <!-- Selected trainees as removable badges -->
                {#if getSelectedTrainees().length > 0}
                    <div class="mb-3">
                        <div class="text-sm font-medium mb-2">Seçili öğrenciler:</div>
                        <div class="flex flex-wrap gap-2">
                            {#each getSelectedTrainees() as selectedTrainee}
                                <div class="badge badge-success gap-2">
                                    <span>{selectedTrainee.name}</span>
                                    <button
                                        type="button"
                                        class="hover:text-error transition-colors cursor-pointer"
                                        onclick={() => removeTraineeRelation(selectedTrainee.id)}
                                        aria-label="Remove {selectedTrainee.name}"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            {/each}
                        </div>
                    </div>
                {/if}
                
                <!-- Trainee selection combobox -->
                <Combobox
                    items={getAvailableTrainees()}
                    selectedItems={getSelectedTraineeObjects()}
                    placeholder="Bağlantılı öğrenci seçin..."
                    searchPlaceholder="Öğrenci ara..."
                    emptyMessage="Öğrenci bulunamadı"
                    multiple={true}
                    getDisplayText={(trainee) => trainee.name}
                    getSearchText={(trainee) => `${trainee.name} ${trainee.email}`}
                    onSelect={handleTraineeSelect}
                    onRemove={handleTraineeRemove}
                />
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
        <h3 class="mb-4 text-lg font-bold">Öğrenciyi Sil</h3>
        <p class="mb-4">
            <strong>{selectedTrainee?.name}</strong> adlı öğrenciyi silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
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
                    } else if (result.type === 'failure' && result.data) {
                        const errorData = result.data as any;
                        if (errorData.message) {
                            toast.error(errorData.message);
                        }
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