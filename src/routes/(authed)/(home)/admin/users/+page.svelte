<script lang="ts">
	import { toast } from 'svelte-sonner';
	import Plus from '@lucide/svelte/icons/plus';
	import Edit from '@lucide/svelte/icons/edit';
	import UserPlus from '@lucide/svelte/icons/user-plus';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import X from '@lucide/svelte/icons/x';
	import MoreVertical from '@lucide/svelte/icons/more-vertical';
	import Key from '@lucide/svelte/icons/key';
	import { enhance } from '$app/forms';
    import type { User } from '$lib/types/User';

	let { data } = $props();
	let { users: initialUsers } = $derived(data);
	
	// Get current user from parent layout data (available from authed layout)
	let currentUser = $derived(data.user || data.session?.user);

	let users = $derived<User[]>(initialUsers || []);
	let filteredUsers = $state<User[]>(users);
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

	$effect(() => {
		filterUsers();
	});


	function filterUsers() {
		if (!searchTerm.trim()) {
			filteredUsers = users;
		} else {
			filteredUsers = users.filter(
				(user) =>
					user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
					user.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
					false ||
					user.role.toLowerCase().includes(searchTerm.toLowerCase())
			);
		}
	}

	function clearSearch() {
		searchTerm = '';
	}

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
	<div class="mb-6">
		<h1 class="text-3xl font-bold">Yetkili Kullanıcılar</h1>
		<p class="text-base-content/70 mt-2">Bu sayfada adminleri ve koordinatörleri yönetin</p>
	</div>

	<!-- Search and Add User Section -->
	<div class="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
		<div class="form-control w-full max-w-xs">
			<div class="input-group flex flex-row items-center gap-2">
				<input
					type="text"
					placeholder="Kullanıcı ara..."
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
			<UserPlus size={16} />
			Yeni Kullanıcı
		</button>
	</div>

	<!-- Users Table -->
	<div class="card bg-base-100 shadow">
		<div class="card-body">
			{#if filteredUsers.length === 0}
				<div class="py-8 text-center">
					<p class="text-base-content/70">
						{searchTerm
							? 'Arama kriterlerine uygun kullanıcı bulunamadı'
							: 'Henüz kullanıcı bulunmuyor'}
					</p>
				</div>
			{:else}
				<div>
					<table class="table-zebra table">
						<thead>
							<tr>
								<th>Ad Soyad</th>
								<th>Email</th>
								<th>Rol</th>
								<th>Kayıt Tarihi</th>
								<th>Son Giriş</th>
								<th class="text-right">İşlemler</th>
							</tr>
						</thead>
						<tbody>
							{#each filteredUsers as user, i}
								<tr>
									<td>
										<div class="flex items-center gap-2">
											<span class="font-medium">{user.fullName || '-'}</span>
											{#if user.id === currentUser?.id}
												<div class="badge badge-accent badge-sm">Siz</div>
											{/if}
										</div>
									</td>
									<td>
										<div class="text-sm text-base-content/70">{user.email}</div>
									</td>
									<td>
										<div class="badge badge-{user.role === 'admin' ? 'error' : 'primary'}">
											{getRoleDisplayName(user.role)}
										</div>
									</td>
									<td>{formatDate(user.created_at)}</td>
									<td>
										{user.last_sign_in_at ? formatDate(user.last_sign_in_at) : 'Hiç giriş yapmamış'}
									</td>
									<td class="text-right">
										<div
											class="dropdown dropdown-end {i >= filteredUsers.length - 1
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
													<button onclick={() => openEditModal(user)}>
														<Edit size={14} />
														Düzenle
													</button>
												</li>
												<li>
													<button onclick={() => openResetPasswordModal(user)}>
														<Key size={14} />
														Şifre Sıfırla
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
					{#each roleOptions as option}
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
					{#each roleOptions as option}
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
			<input type="hidden" name="userId" value={selectedUser?.id} />

			<fieldset class="fieldset">
				<legend class="fieldset-legend">Email</legend>
				<div class="input bg-base-200 text-base-content/70 w-full">{email}</div>
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
				<button type="submit" class="btn btn-primary" disabled={formLoading}>
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
