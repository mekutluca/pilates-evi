<script lang="ts">
	import type { SupabaseClientType } from '$lib/types/Supabase';
	import { cn } from '$lib/utils/class-utils';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { goto, invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import Modal from './modal.svelte';
	import { validation } from '$lib/utils/validation';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	let {
		class: className = '',
		formType = $bindable('login'),
		supabase,
		...restProps
	}: {
		class?: string;
		formType: 'login' | 'forgot-password' | 'reset-password';
		supabase: SupabaseClientType;
	} = $props();

	let inProgress = $state(false);
	let email = $state('');
	let showForgotPasswordModal = $state(false);
	let password = $state('');

	async function login() {
		inProgress = true;

		const res = await supabase.auth.signInWithPassword({
			email,
			password
		});

		if (res.error) {
			toast.error(
				'Giriş hatası: ' +
					(res.error.message === 'Invalid login credentials'
						? 'Kullanıcı adı veya şifre yanlış'
						: res.error.message)
			);
			inProgress = false;
			return;
		}

		// Fetch user's active organizations (both membership and organization must be active)
		const { data: userOrgs, error: orgsError } = await supabase
			.from('pe_user_organizations')
			.select('organization_id, role, pe_organizations!inner(id, name)')
			.eq('user_id', res.data.user.id)
			.eq('is_active', true)
			.eq('pe_organizations.is_active', true);

		if (orgsError) {
			toast.error('Organizasyon bilgileri alınamadı: ' + orgsError.message);
			inProgress = false;
			return;
		}

		if (!userOrgs || userOrgs.length === 0) {
			toast.error('Aktif bir organizasyona üye değilsiniz. Lütfen yönetici ile iletişime geçin.');
			await supabase.auth.signOut({ scope: 'local' });
			inProgress = false;
			return;
		}

		// Select the first active organization TODO: Implement organization picker
		const selectedOrg = userOrgs[0];

		const { error: rpcError } = await supabase.rpc('pe_switch_organization', {
			p_org_id: selectedOrg.organization_id
		});

		if (rpcError) {
			toast.error('Organizasyon seçilemedi: ' + rpcError.message);
			inProgress = false;
			return;
		}

		// Refresh session to get a new JWT with updated organization claims
		const { error: refreshError } = await supabase.auth.refreshSession();
		if (refreshError) {
			toast.error('Error refreshing session: ' + refreshError.message);
		}

		// Invalidate all load functions to ensure server gets fresh session
		await invalidateAll();
		goto('/');
	}

	function showModal() {
		showForgotPasswordModal = true;
	}
</script>

<form
	class={cn('flex flex-col gap-6', className)}
	{...restProps}
	onsubmit={() => {
		if (formType === 'login') {
			login();
		}
	}}
>
	<div class="flex flex-col items-center gap-2 text-center">
		<h1 class="text-2xl font-bold">
			{#if formType === 'login'}
				Giriş yap
			{:else if formType === 'forgot-password'}
				Şifreni sıfırla
			{:else if formType === 'reset-password'}
				Şifreni sıfırla
			{/if}
		</h1>
		<p class="text-sm text-balance text-muted-foreground">
			{#if formType === 'login'}
				Email ve şifrenizle giriş yapın
			{:else if formType === 'forgot-password'}
				Şifre sıfırlama bağlantısı almak için emailinizi girin
			{:else if formType === 'reset-password'}
				Yeni şifrenizi girin
			{/if}
		</p>
	</div>
	<div class="grid gap-6">
		{#if formType === 'login' || formType === 'forgot-password'}
			<div class="grid gap-2">
				<Label for="email">Email</Label>
				<Input
					id="email"
					type="email"
					placeholder=""
					pattern={validation.email.pattern}
					title={validation.email.title}
					required
					bind:value={email}
				/>
			</div>
		{/if}
		{#if formType === 'login' || formType === 'reset-password'}
			<div class="grid gap-2">
				<div class="flex items-center justify-between">
					<Label for="password">Şifre</Label>
					{#if formType === 'login'}
						<Button
							variant="link"
							size="sm"
							class="h-auto p-0 text-xs"
							tabindex={-1}
							onclick={showModal}
							type="button"
						>
							Şifremi unuttum
						</Button>
					{/if}
				</div>
				<Input id="password" type="password" required bind:value={password} />
			</div>
		{/if}
		<Button type="submit" class="w-full" disabled={inProgress}>
			{#if inProgress}
				<LoaderCircle size={16} class="animate-spin" />
			{:else if formType === 'login'}
				Giriş yap
			{:else if formType === 'forgot-password'}
				Sıfırlama bağlantısı gönder
			{:else if formType === 'reset-password'}
				Şifremi güncelle
			{/if}
		</Button>
	</div>
	<div class="text-center text-sm">
		{#if formType === 'forgot-password'}
			Hata?
			<a href="/login" class="underline underline-offset-4"> Giriş yap. </a>
		{:else if formType === 'reset-password'}
			Hata?
			<a href="/login" class="underline underline-offset-4"> Giriş yap. </a>
		{/if}
	</div>
</form>

<Modal bind:open={showForgotPasswordModal} title="Şifremi unuttum">
	<p class="py-4">Eğer şifrenizi unuttuysanız lütfen adminler ile iletişime geçiniz.</p>
</Modal>
