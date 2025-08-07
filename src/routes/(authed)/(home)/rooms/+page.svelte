<script lang="ts">
    import { toast } from 'svelte-sonner';
    import Plus from '@lucide/svelte/icons/plus';
    import Edit from '@lucide/svelte/icons/edit';
    import LoaderCircle from '@lucide/svelte/icons/loader-circle';
    import X from '@lucide/svelte/icons/x';
    import MoreVertical from '@lucide/svelte/icons/more-vertical';
    import Trash2 from '@lucide/svelte/icons/trash-2';
    import { enhance } from '$app/forms';
    import type { Room } from '$lib/types/Room';

    let { data } = $props();
    let { rooms: initialRooms } = $derived(data);

    let rooms = $derived<Room[]>(initialRooms || []);
    let filteredRooms = $state<Room[]>(initialRooms || []);
    let searchTerm = $state('');
    let showAddModal = $state(false);
    let showEditModal = $state(false);
    let showDeleteModal = $state(false);
    let selectedRoom = $state<Room | null>(null);
    let formLoading = $state(false);

    let name = $state('');
    let capacity = $state<number | null>(null);

    $effect(() => {
        filterRooms();
    });

    function filterRooms() {
        if (!searchTerm.trim()) {
            filteredRooms = rooms;
        } else {
            const term = searchTerm.toLowerCase();
            filteredRooms = rooms.filter((room) => {
                const name = (room.name ?? '').toLowerCase();
                const cap = String(room.capacity ?? '').toLowerCase();
                return name.includes(term) || cap.includes(term);
            });
        }
    }

    function clearSearch() {
        searchTerm = '';
    }

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
    <div class="mb-6">
        <h1 class="text-3xl font-bold">Odalar</h1>
        <p class="text-base-content/70 mt-2">Bu sayfada odaları yönetin</p>
    </div>

    <div class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div class="form-control w-full max-w-xs">
            <div class="input-group flex flex-row items-center gap-2">
                <input
                    type="text"
                    placeholder="Oda ara..."
                    class="input input-bordered w-full"
                    bind:value={searchTerm}
                />
                {#if searchTerm.trim()}
                    <button
                        class="btn btn-outline btn-accent btn-square btn-sm"
                        onclick={clearSearch}
                        title="Aramayı temizle"
                    >
                        <X size={14} />
                    </button>
                {/if}
            </div>
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

    <div class="card bg-base-100 shadow">
        <div class="card-body">
            {#if filteredRooms.length === 0}
                <div class="py-8 text-center">
                    <p class="text-base-content/70">
                        {searchTerm
                            ? 'Arama kriterlerine uygun oda bulunamadı'
                            : 'Henüz oda bulunmuyor'}
                    </p>
                </div>
            {:else}
                <div>
                    <table class="table-zebra table">
                        <thead>
                            <tr>
                                <th>Ad</th>
                                <th>Kapasite</th>
                                <th class="text-right">İşlemler</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each filteredRooms as room, i}
                                <tr>
                                    <td>
                                        <div class="flex items-center gap-2">
                                            <span class="font-medium">{room.name}</span>
                                        </div>
                                    </td>
                                    <td>{room.capacity ?? '-'}</td>
                                    <td class="text-right">
                                        <div
                                            class="dropdown dropdown-end {i >= filteredRooms.length - 1
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
                                                    <button onclick={() => openEditModal(room)}>
                                                        <Edit size={14} />
                                                        Düzenle
                                                    </button>
                                                </li>
                                                <li>
                                                    <button onclick={() => openDeleteModal(room)} class="text-error">
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
            <strong>{selectedRoom?.name}</strong> adlı odayı silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.
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

