<script lang="ts">
	import { toast } from 'svelte-sonner';
	import Plus from '@lucide/svelte/icons/plus';
	import Edit from '@lucide/svelte/icons/edit';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import SearchInput from '$lib/components/search-input.svelte';
	import PageHeader from '$lib/components/page-header.svelte';
	import Key from '@lucide/svelte/icons/key';
	import UserMinus from '@lucide/svelte/icons/user-minus';
	import { enhance } from '$app/forms';
	import type { User } from '$lib/types';
	import { roleLabels, type Role } from '$lib/types/Role';
	import SortableTable from '$lib/components/sortable-table.svelte';
	import type { ActionItem } from '$lib/types';
	import { getActionErrorMessage } from '$lib/utils/form-utils';
	import Modal from '$lib/components/modal.svelte';
	import { validation } from '$lib/utils/validation';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';

	let { data } = $props();
	let { users: initialUsers } = $derived(data);

	// Get current user from parent layout data (available from authed layout)
	let currentUser = $derived(data.user || data.session?.user);

	let users = $derived<User[]>(initialUsers || []);
	let searchTerm = $state('');
	let showAddModal = $state(false);
	let showEditModal = $state(false);
	let showResetPasswordModal = $state(false);
	let showRemoveModal = $state(false);
	let selectedUser = $state<User | null>(null);
	let formLoading = $state(false);

	// Form data for add/edit user
	let email = $state('');
	let fullName = $state('');
	let password = $state('');
	let role = $state('coordinator');
	let newPassword = $state('');

	const getTableActions = (user: User): ActionItem[] => {
		const baseActions: ActionItem[] = [
			{
				label: 'Düzenle',
				handler: (id) => {
					const u = users.find((u) => u.id === String(id));
					if (u) openEditModal(u);
				},
				icon: Edit
			},
			{
				label: 'Şifre Sıfırla',
				handler: (id) => {
					const u = users.find((u) => u.id === String(id));
					if (u) openResetPasswordModal(u);
				},
				icon: Key
			}
		];

		// Users can't remove themselves from the organization
		if (user.id !== currentUser?.id) {
			baseActions.push({
				label: 'Kaldır',
				handler: (id) => {
					const u = users.find((u) => u.id === String(id));
					if (u) openRemoveModal(u);
				},
				class: 'text-destructive',
				icon: UserMinus
			});
		}

		return baseActions;
	};

	const tableColumns = [
		{
			key: 'fullName',
			title: 'Ad Soyad',
			render: (user: User) => {
				const isCurrentUser = user.id === currentUser?.id;
				const badge = isCurrentUser
					? '<span class="ml-2 inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">Siz</span>'
					: '';
				return `<span class="font-medium">${user.fullName || '-'}</span>${badge}`;
			}
		},
		{
			key: 'email',
			title: 'Email',
			render: (user: User) => `<div class="text-sm text-muted-foreground">${user.email}</div>`
		},
		{
			key: 'role',
			title: 'Rol',
			render: (user: User) => {
				return `<span class="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium">${getRoleDisplayName(user.role)}</span>`;
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

	function openEditModal(user: User) {
		selectedUser = user;
		email = user.email;
		fullName = user.fullName || '';
		role = user.role;
		password = '';
		showEditModal = true;
	}

	function openResetPasswordModal(user: User) {
		selectedUser = user;
		email = user.email;
		newPassword = '';
		showResetPasswordModal = true;
	}

	function openRemoveModal(user: User) {
		selectedUser = user;
		showRemoveModal = true;
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
		return roleLabels[role as Role] ?? role;
	}

	const roleOptions = [
		{ value: 'admin', label: roleLabels.admin },
		{ value: 'coordinator', label: roleLabels.coordinator }
	];
</script>

<svelte:head>
	<title>Yetkili Kullanıcılar · Pilates Evi</title>
</svelte:head>

<div class="p-6">
	<PageHeader
		title="Yetkili Kullanıcılar"
		subtitle="Bu sayfada adminleri ve koordinatörleri yönetin"
	/>

	<!-- Search and Add User Section -->
	<div class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
		<div class="w-full lg:max-w-xs">
			<SearchInput bind:value={searchTerm} placeholder="Kullanıcı ara..." />
		</div>

		<Button
			onclick={() => {
				resetForm();
				showAddModal = true;
			}}
		>
			<UserPlus size={16} />
			Yeni Kullanıcı
		</Button>
	</div>

	<SortableTable
		data={users}
		columns={tableColumns}
		{searchTerm}
		emptyMessage="Henüz kullanıcı bulunmuyor"
		defaultSortKey="id"
		defaultSortOrder="asc"
		actions={getTableActions}
	/>
</div>

<!-- Add User Modal -->
<Modal bind:open={showAddModal} title="Yeni Kullanıcı Ekle" onClose={resetForm}>
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
		<div class="grid gap-2">
			<Label for="add-user-fullname">Ad Soyad</Label>
			<Input id="add-user-fullname" type="text" name="fullName" bind:value={fullName} required />
		</div>

		<div class="grid gap-2">
			<Label for="add-user-email">Email</Label>
			<Input
				id="add-user-email"
				type="email"
				name="email"
				bind:value={email}
				pattern={validation.email.pattern}
				title={validation.email.title}
				required
			/>
		</div>

		<div class="grid gap-2">
			<Label for="add-user-password">Şifre</Label>
			<Input
				id="add-user-password"
				type="password"
				name="password"
				bind:value={password}
				required
			/>
		</div>

		<div class="grid gap-2">
			<Label for="add-user-role">Rol</Label>
			<NativeSelect id="add-user-role" name="role" bind:value={role} required>
				{#each roleOptions as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</NativeSelect>
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

<!-- Edit User Modal -->
<Modal bind:open={showEditModal} title="Kullanıcı Düzenle" onClose={resetForm}>
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

		<div class="grid gap-2">
			<Label for="edit-user-fullname">Ad Soyad</Label>
			<Input
				id="edit-user-fullname"
				type="text"
				name="fullName"
				bind:value={fullName}
				placeholder="Ad Soyad"
			/>
		</div>

		<div class="grid gap-2">
			<Label for="edit-user-email">Email</Label>
			<Input id="edit-user-email" type="email" bind:value={email} disabled />
			<input type="hidden" name="email" value={email} />
		</div>

		<div class="grid gap-2">
			<Label for="edit-user-role">Rol</Label>
			<NativeSelect id="edit-user-role" name="role" bind:value={role}>
				{#each roleOptions as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</NativeSelect>
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

<!-- Reset Password Modal -->
<Modal bind:open={showResetPasswordModal} title="Şifre Sıfırla" onClose={resetForm}>
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

		<div class="grid gap-2">
			<Label>Email</Label>
			<div
				class="flex h-9 w-full items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground"
			>
				{email}
			</div>
		</div>

		<div class="grid gap-2">
			<Label for="reset-new-password">Yeni Şifre</Label>
			<Input
				id="reset-new-password"
				type="password"
				name="newPassword"
				bind:value={newPassword}
				placeholder="Yeni şifre girin"
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
			<Button type="submit" disabled={formLoading}>
				{#if formLoading}
					<LoaderCircle size={16} class="animate-spin" />
				{:else}
					<Key size={16} />
				{/if}
				Şifreyi Sıfırla
			</Button>
		</div>
	</form>
</Modal>

<!-- Remove User Modal -->
<Modal bind:open={showRemoveModal} title="Kullanıcıyı Kaldır" onClose={resetForm}>
	<p class="mb-4">
		<strong>{selectedUser?.fullName}</strong> adlı kullanıcıyı organizasyondan kaldırmak istediğinizden
		emin misiniz? Kullanıcı artık bu organizasyona giriş yapamayacak.
	</p>
	<form
		method="POST"
		action="?/removeUser"
		class="space-y-4"
		use:enhance={() => {
			formLoading = true;
			return async ({ result, update }) => {
				formLoading = false;

				if (result.type === 'success') {
					toast.success('Kullanıcı organizasyondan kaldırıldı');
					showRemoveModal = false;
					resetForm();
				} else if (result.type === 'failure') {
					toast.error(getActionErrorMessage(result));
				}

				await update();
			};
		}}
	>
		<input type="hidden" name="userId" value={selectedUser?.id} />

		<div class="flex justify-end gap-2">
			<Button
				type="button"
				variant="outline"
				onclick={() => {
					showRemoveModal = false;
					resetForm();
				}}
			>
				İptal
			</Button>
			<Button type="submit" variant="destructive" disabled={formLoading}>
				{#if formLoading}
					<LoaderCircle size={16} class="animate-spin" />
				{:else}
					<UserMinus size={16} />
				{/if}
				Kaldır
			</Button>
		</div>
	</form>
</Modal>
