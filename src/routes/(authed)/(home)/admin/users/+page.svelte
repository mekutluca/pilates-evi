<script lang="ts">
	import { enhanceForm } from '$lib/utils/enhance';
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
	import { badgeHtml, escapeHtml } from '$lib/utils/html-utils';
	import Modal from '$lib/components/modal.svelte';
	import ModalFooter from '$lib/components/modal-footer.svelte';
	import { MIN_PASSWORD_LENGTH, validation } from '$lib/utils/validation';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import { formatDisplayDate, formatShortDisplayDateTime } from '$lib/utils/date-utils';

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
	// Admins can't change their own role: the studio must keep an admin
	let editingSelf = $derived(selectedUser?.id === currentUser?.id);
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
				label: 'Şifreyi sıfırla',
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
				label: 'Stüdyodan çıkar',
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
			title: 'Ad soyad',
			render: (user: User) => {
				const isCurrentUser = user.id === currentUser?.id;
				const badge = isCurrentUser ? ` ${badgeHtml('Siz')}` : '';
				return `<span class="font-medium">${escapeHtml(user.fullName || '-')}</span>${badge}`;
			}
		},
		{
			key: 'email',
			title: 'E-posta',
			render: (user: User) =>
				`<div class="text-sm text-muted-foreground">${escapeHtml(user.email)}</div>`
		},
		{
			key: 'role',
			class: 'hidden md:table-cell',
			title: 'Rol',
			render: (user: User) => {
				return badgeHtml(getRoleDisplayName(user.role), 'outline');
			}
		},
		{
			key: 'created_at',
			class: 'hidden md:table-cell',
			title: 'Kayıt tarihi',
			render: (user: User) => formatDisplayDate(user.created_at)
		},
		{
			key: 'last_sign_in_at',
			class: 'hidden md:table-cell',
			title: 'Son giriş',
			render: (user: User) =>
				user.last_sign_in_at
					? formatShortDisplayDateTime(user.last_sign_in_at)
					: 'Hiç giriş yapmamış'
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

	function getRoleDisplayName(role: string): string {
		return roleLabels[role as Role] ?? role;
	}

	const roleOptions = [
		{ value: 'admin', label: roleLabels.admin },
		{ value: 'coordinator', label: roleLabels.coordinator }
	];
</script>

<svelte:head>
	<title>Personel · Pilates Evi</title>
</svelte:head>

<div class="mx-auto w-full max-w-6xl space-y-6 p-4 lg:p-6">
	<PageHeader
		title="Personel"
		subtitle={`${users.length} kişi · yöneticiler ve koordinatörler; eğitmen hesapları Eğitmenler sayfasında`}
	>
		{#snippet actions()}
			<Button
				onclick={() => {
					resetForm();
					showAddModal = true;
				}}
			>
				<UserPlus size={16} />
				Yeni personel
			</Button>
		{/snippet}
	</PageHeader>

	<!-- Search and Add User Section -->
	<div class="w-full lg:max-w-xs">
		<SearchInput bind:value={searchTerm} placeholder="Personel ara" />
	</div>

	<SortableTable
		data={users}
		columns={tableColumns}
		{searchTerm}
		emptyMessage="Henüz kullanıcı bulunmuyor"
		defaultSortKey="id"
		defaultSortOrder="asc"
		actions={getTableActions}
		rowLabel={(user) => user.fullName || user.email}
	/>
</div>

<!-- Add User Modal -->
<Modal bind:open={showAddModal} title="Yeni personel" onClose={resetForm}>
	<form
		method="POST"
		action="?/createUser"
		class="space-y-4"
		use:enhance={enhanceForm({
			busy: (b) => (formLoading = b),
			onSuccess: () => {
				showAddModal = false;
				resetForm();
			}
		})}
	>
		<div class="grid gap-2">
			<Label for="add-user-fullname">Ad Soyad</Label>
			<Input id="add-user-fullname" type="text" name="fullName" bind:value={fullName} required />
		</div>

		<div class="grid gap-2">
			<Label for="add-user-email">E-posta</Label>
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
				autocomplete="new-password"
				bind:value={password}
				minlength={MIN_PASSWORD_LENGTH}
				aria-describedby="add-user-password-hint"
				required
			/>
			<p id="add-user-password-hint" class="text-xs text-muted-foreground">
				En az {MIN_PASSWORD_LENGTH} karakter
			</p>
		</div>

		<div class="grid gap-2">
			<Label for="add-user-role">Rol</Label>
			<NativeSelect id="add-user-role" name="role" bind:value={role} required>
				{#each roleOptions as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</NativeSelect>
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
				Vazgeç
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

<!-- Edit User Modal -->
<Modal bind:open={showEditModal} title="Personeli düzenle" onClose={resetForm}>
	<form
		method="POST"
		action="?/updateUser"
		class="space-y-4"
		use:enhance={enhanceForm({
			busy: (b) => (formLoading = b),
			success: 'Kullanıcı başarıyla güncellendi',
			onSuccess: () => {
				showEditModal = false;
				resetForm();
			}
		})}
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
			<Label for="edit-user-email">E-posta</Label>
			<Input id="edit-user-email" type="email" bind:value={email} disabled />
			<input type="hidden" name="email" value={email} />
		</div>

		<div class="grid gap-2">
			<Label for="edit-user-role">Rol</Label>
			<NativeSelect
				id="edit-user-role"
				name="role"
				bind:value={role}
				disabled={editingSelf}
				aria-describedby={editingSelf ? 'edit-user-role-hint' : undefined}
			>
				{#each roleOptions as option (option.value)}
					<option value={option.value}>{option.label}</option>
				{/each}
			</NativeSelect>
			{#if editingSelf}
				<!-- A disabled select is not posted -->
				<input type="hidden" name="role" value={role} />
				<p id="edit-user-role-hint" class="text-xs text-muted-foreground">
					Kendi rolünüzü değiştiremezsiniz.
				</p>
			{/if}
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
				Vazgeç
			</Button>
			<Button type="submit" disabled={formLoading}>
				{#if formLoading}
					<LoaderCircle size={16} class="animate-spin" />
				{:else}
					<Edit size={16} />
				{/if}
				Kaydet
			</Button>
		</ModalFooter>
	</form>
</Modal>

<!-- Reset Password Modal -->
<Modal bind:open={showResetPasswordModal} title="Şifreyi sıfırla" onClose={resetForm}>
	<form
		method="POST"
		action="?/resetPassword"
		class="space-y-4"
		use:enhance={enhanceForm({
			busy: (b) => (formLoading = b),
			success: 'Şifre başarıyla sıfırlandı',
			onSuccess: () => {
				showResetPasswordModal = false;
				resetForm();
			}
		})}
	>
		<input type="hidden" name="userId" value={selectedUser?.id} />

		<div class="grid gap-2">
			<Label>E-posta</Label>
			<div
				class="flex h-9 w-full items-center rounded-4xl border border-input bg-muted px-3 text-sm text-muted-foreground"
			>
				{email}
			</div>
		</div>

		<div class="grid gap-2">
			<Label for="reset-new-password">Yeni şifre</Label>
			<Input
				id="reset-new-password"
				type="password"
				name="newPassword"
				autocomplete="new-password"
				bind:value={newPassword}
				minlength={MIN_PASSWORD_LENGTH}
				aria-describedby="reset-new-password-hint"
				required
			/>
			<p id="reset-new-password-hint" class="text-xs text-muted-foreground">
				En az {MIN_PASSWORD_LENGTH} karakter
			</p>
		</div>

		<ModalFooter>
			<Button
				type="button"
				variant="outline"
				onclick={() => {
					showResetPasswordModal = false;
					resetForm();
				}}
			>
				Vazgeç
			</Button>
			<Button type="submit" disabled={formLoading}>
				{#if formLoading}
					<LoaderCircle size={16} class="animate-spin" />
				{:else}
					<Key size={16} />
				{/if}
				Şifreyi Sıfırla
			</Button>
		</ModalFooter>
	</form>
</Modal>

<!-- Remove User Modal -->
<Modal bind:open={showRemoveModal} title="Stüdyodan çıkar" onClose={resetForm}>
	<p class="mb-4">
		<strong>{selectedUser?.fullName}</strong> adlı kullanıcıyı organizasyondan kaldırmak istediğinizden
		emin misiniz? Kullanıcı artık bu organizasyona giriş yapamayacak.
	</p>
	<form
		method="POST"
		action="?/removeUser"
		class="space-y-4"
		use:enhance={enhanceForm({
			busy: (b) => (formLoading = b),
			success: 'Kullanıcı organizasyondan kaldırıldı',
			onSuccess: () => {
				showRemoveModal = false;
				resetForm();
			}
		})}
	>
		<input type="hidden" name="userId" value={selectedUser?.id} />

		<ModalFooter>
			<Button
				type="button"
				variant="outline"
				onclick={() => {
					showRemoveModal = false;
					resetForm();
				}}
			>
				Vazgeç
			</Button>
			<Button type="submit" variant="destructive" disabled={formLoading}>
				{#if formLoading}
					<LoaderCircle size={16} class="animate-spin" />
				{:else}
					<UserMinus size={16} />
				{/if}
				Stüdyodan çıkar
			</Button>
		</ModalFooter>
	</form>
</Modal>
