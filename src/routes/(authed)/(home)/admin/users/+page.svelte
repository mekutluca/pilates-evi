<script lang="ts">
	import { toast } from 'svelte-sonner';
	import Plus from '@lucide/svelte/icons/plus';
	import Edit from '@lucide/svelte/icons/edit';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import SearchInput from '$lib/components/search-input.svelte';
	import PageHeader from '$lib/components/page-header.svelte';
	import Key from '@lucide/svelte/icons/key';
	import { enhance } from '$app/forms';
	import type { User } from '$lib/types/User';
	import SortableTable from '$lib/components/sortable-table.svelte';
	import type { ActionItem } from '$lib/types/ActionItem.js';
	import { getActionErrorMessage } from '$lib/utils/form-utils';

	let { data } = $props();
	let { users: initialUsers } = $derived(data);

	// Get current user from parent layout data (available from authed layout)
	let currentUser = $derived(data.user || data.session?.user);

	let users = $derived<User[]>(initialUsers || []);
	let searchTerm = $state('');
	let showAddModal = $state(false);
	let showEditModal = $state(false);
	let showResetPasswordModal = $state(false);
	let selectedUser = $state<User | null>(null);
	let formLoading = $state(false);

	// Form data for add/edit user
	let email = $state('');
	let fullName = $state('');
	let password = $state('');
	let role = $state('coordinator');
	let newPassword = $state('');

	const tableActions: ActionItem[] = [
		{
			label: 'Düzenle',
			handler: (id) => {
				const user = users.find((u) => u.id === String(id));
				if (user) openEditModal(user);
			},
			icon: Edit
		},
		{
			label: 'Şifre Sıfırla',
			handler: (id) => {
				const user = users.find((u) => u.id === String(id));
				if (user) openResetPasswordModal(user);
			},
			icon: Key
		}
	];

	const tableColumns = [
		{
			key: 'fullName',
			title: 'Ad Soyad',
			render: (user: User) => {
				const isCurrentUser = user.id === currentUser?.id;
				const badge = isCurrentUser
					? '<div class="badge badge-accent badge-sm ml-2">Siz</div>'
					: '';
				return `<span class="font-medium">${user.fullName || '-'}</span>${badge}`;
			}
		},
		{
			key: 'email',
			title: 'Email',
			render: (user: User) => `<div class="text-sm text-base-content/70">${user.email}</div>`
		},
		{
			key: 'role',
			title: 'Rol',
			render: (user: User) => {
				return `<div class="badge badge-neutral">${getRoleDisplayName(user.role)}</div>`;
			}
		},
		{
			key: 'created_at',
			title: 'Kayıt Tarihi',
			render: (user: User) => formatDate(user.created_at)
		},
		{
			key: 'last_sign_in_at',
			title: 'Son Giriş',
			render: (user: User) =>
				user.last_sign_in_at ? formatDate(user.last_sign_in_at) : 'Hiç giriş yapmamış'
		}
	];

	function closeDropdown() {
		const activeElement = document?.activeElement as HTMLElement | null;
		activeElement?.blur();
	}

	function openEditModal(user: User) {
		selectedUser = user;
		email = user.email;
		fullName = user.fullName || '';
		role = user.role;
		password = '';
		showEditModal = true;
		closeDropdown();
	}

	function openResetPasswordModal(user: User) {
		selectedUser = user;
		email = user.email;
		newPassword = '';
		showResetPasswordModal = true;
		closeDropdown();
	}

	function resetForm() {
		email = '';
		fullName = '';
		password = '';
		role = 'coordinator';
		newPassword = '';
		selectedUser = null;
	}

	function formatDate(dateString: string) {
		return new Date(dateString).toLocaleDateString('tr-TR', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function getRoleDisplayName(role: string): string {
		switch (role) {
			case 'admin':
				return 'Admin';
			case 'coordinator':
				return 'Koordinatör';
			default:
				return role;
		}
	}

	const roleOptions = [
		{ value: 'admin', label: 'Admin' },
		{ value: 'coordinator', label: 'Koordinatör' }
	];
</script>

<div class="p-6">
	<PageHeader
		title="Yetkili Kullanıcılar"
		subtitle="Bu sayfada adminleri ve koordinatörleri yönetin"
	/>

	<!-- Search and Add User Section -->
	<div class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
		<div class="form-control w-full lg:max-w-xs">
			<SearchInput bind:value={searchTerm} placeholder="Kullanıcı ara..." />
		</div>

		<button
			class="btn btn-accent"
			onclick={() => {
				resetForm();
				showAddModal = true;
			}}
		>
			<UserPlus size={16} />
			Yeni Kullanıcı
		</button>
	</div>

	<SortableTable
		data={users}
		columns={tableColumns}
		{searchTerm}
		emptyMessage="Henüz kullanıcı bulunmuyor"
		defaultSortKey="id"
		defaultSortOrder="asc"
		actions={tableActions}
	/>
</div>

<!-- Add User Modal -->
<dialog class="modal" class:modal-open={showAddModal}>
	<div class="modal-box">
		<h3 class="mb-4 text-lg font-bold">Yeni Kullanıcı Ekle</h3>
		<form
			method="POST"
			action="?/createUser"
			class="space-y-4"
			use:enhance={() => {
				formLoading = true;
				return async ({ result, update }) => {
					formLoading = false;

					if (result.type === 'success') {
						toast.success('Kullanıcı başarıyla oluşturuldu');
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
				<legend class="fieldset-legend">Ad Soyad</legend>
				<input type="text" name="fullName" class="input w-full" bind:value={fullName} required />
			</fieldset>

			<fieldset class="fieldset">
				<legend class="fieldset-legend">Email</legend>
				<input type="email" name="email" class="input w-full" bind:value={email} required />
			</fieldset>

			<fieldset class="fieldset">
				<legend class="fieldset-legend">Şifre</legend>
				<input
					type="password"
					name="password"
					class="input w-full"
					bind:value={password}
					required
				/>
			</fieldset>

			<fieldset class="fieldset">
				<legend class="fieldset-legend">Rol</legend>
				<select name="role" class="select w-full" bind:value={role} required>
					{#each roleOptions as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
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
				<button type="submit" class="btn btn-accent" disabled={formLoading}>
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

<!-- Edit User Modal -->
<dialog class="modal" class:modal-open={showEditModal}>
	<div class="modal-box">
		<h3 class="mb-4 text-lg font-bold">Kullanıcı Düzenle</h3>
		<form
			method="POST"
			action="?/updateUser"
			class="space-y-4"
			use:enhance={() => {
				formLoading = true;
				return async ({ result, update }) => {
					formLoading = false;

					if (result.type === 'success') {
						toast.success('Kullanıcı başarıyla güncellendi');
						showEditModal = false;
						resetForm();
					} else if (result.type === 'failure') {
						toast.error(getActionErrorMessage(result));
					}

					await update();
				};
			}}
		>
			<input type="hidden" name="userId" value={selectedUser?.id} />

			<fieldset class="fieldset">
				<legend class="fieldset-legend">Ad Soyad</legend>
				<input
					type="text"
					name="fullName"
					class="input w-full"
					bind:value={fullName}
					placeholder="Ad Soyad"
				/>
			</fieldset>

			<fieldset class="fieldset">
				<legend class="fieldset-legend">Email</legend>
				<input type="email" name="email" class="input w-full" bind:value={email} disabled />
				<input type="hidden" name="email" value={email} />
			</fieldset>

			<fieldset class="fieldset">
				<legend class="fieldset-legend">Rol</legend>
				<select name="role" class="select w-full" bind:value={role}>
					{#each roleOptions as option (option.value)}
						<option value={option.value}>{option.label}</option>
					{/each}
				</select>
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
				<button type="submit" class="btn btn-accent" disabled={formLoading}>
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

<!-- Reset Password Modal -->
<dialog class="modal" class:modal-open={showResetPasswordModal}>
	<div class="modal-box">
		<h3 class="mb-4 text-lg font-bold">Şifre Sıfırla</h3>
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
			<input type="hidden" name="userId" value={selectedUser?.id} />

			<fieldset class="fieldset">
				<legend class="fieldset-legend">Email</legend>
				<div class="input w-full bg-base-200 text-base-content/70">{email}</div>
			</fieldset>

			<fieldset class="fieldset">
				<legend class="fieldset-legend">Yeni Şifre</legend>
				<input
					type="password"
					name="newPassword"
					class="input w-full"
					bind:value={newPassword}
					placeholder="Yeni şifre girin"
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
				<button type="submit" class="btn btn-accent" disabled={formLoading}>
					{#if formLoading}
						<LoaderCircle size={16} class="animate-spin" />
					{:else}
						<Key size={16} />
					{/if}
					Şifreyi Sıfırla
				</button>
			</div>
		</form>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button
			onclick={() => {
				showResetPasswordModal = false;
				resetForm();
			}}>kapat</button
		>
	</form>
</dialog>
