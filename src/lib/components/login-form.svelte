<script lang="ts">
	import type { LoginFormProps } from '$lib/types/ComponentProps';
	import { cn } from '$lib/utils/class-utils';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { isAuthRetryableFetchError } from '@supabase/supabase-js';
	import { goto, invalidateAll } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import Modal from './modal.svelte';
	import { validation } from '$lib/utils/validation';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';

	let { class: className = '', supabase }: LoginFormProps = $props();

	const UNREACHABLE = 'Sunucuya ulaşılamadı. Bağlantınızı kontrol edip tekrar deneyin.';
	const SIGN_IN_FAILED =
		'Giriş tamamlanamadı. Tekrar deneyin, sorun sürerse yöneticinize bildirin.';

	let inProgress = $state(false);
	let email = $state('');
	let password = $state('');
	let showForgotPasswordModal = $state(false);

	async function login(event: SubmitEvent) {
		event.preventDefault();
		inProgress = true;
		const message = await signIn();
		if (message) {
			toast.error(message);
			inProgress = false;
			return;
		}
		// Load functions rerun with the new session; the button keeps spinning until the page changes
		await invalidateAll();
		await goto('/');
	}

	// Signs in and selects the studio; returns what went wrong, or null
	async function signIn(): Promise<string | null> {
		const res = await supabase.auth.signInWithPassword({ email, password });
		if (res.error) {
			if (isAuthRetryableFetchError(res.error)) return UNREACHABLE;
			return res.error.code === 'invalid_credentials'
				? 'E-posta veya şifre hatalı.'
				: SIGN_IN_FAILED;
		}

		// Active memberships of active studios
		const { data: userOrgs, error: orgsError } = await supabase
			.from('pe_user_organizations')
			.select('organization_id, pe_organizations!inner(id)')
			.eq('user_id', res.data.user.id)
			.eq('is_active', true)
			.eq('pe_organizations.is_active', true);
		if (orgsError) {
			console.error('Error loading memberships:', orgsError);
			return SIGN_IN_FAILED;
		}
		if (!userOrgs || userOrgs.length === 0) {
			await supabase.auth.signOut({ scope: 'local' });
			return 'Bu hesap bir stüdyoya bağlı değil. Stüdyo yöneticinizle iletişime geçin.';
		}

		// One studio per account for now: the first active membership
		const { error: rpcError } = await supabase.rpc('pe_switch_organization', {
			p_org_id: userOrgs[0].organization_id
		});
		if (rpcError) {
			console.error('Error selecting studio:', rpcError);
			return SIGN_IN_FAILED;
		}

		// A new JWT carries the selected studio
		const { error: refreshError } = await supabase.auth.refreshSession();
		if (refreshError) {
			console.error('Error refreshing session:', refreshError);
			return SIGN_IN_FAILED;
		}
		return null;
	}
</script>

<form class={cn('flex flex-col gap-6', className)} onsubmit={login}>
	<div class="flex flex-col items-center gap-2 text-center">
		<h1 class="text-2xl font-bold">Giriş yap</h1>
		<p class="text-sm text-balance text-muted-foreground">E-posta ve şifrenizle giriş yapın</p>
	</div>
	<div class="grid gap-6">
		<div class="grid gap-2">
			<Label for="email">E-posta</Label>
			<Input
				id="email"
				type="email"
				autocomplete="email"
				pattern={validation.email.pattern}
				title={validation.email.title}
				required
				bind:value={email}
			/>
		</div>
		<div class="grid gap-2">
			<div class="flex items-center justify-between">
				<Label for="password">Şifre</Label>
				<Button
					variant="link"
					size="sm"
					class="h-auto p-0 text-xs"
					onclick={() => (showForgotPasswordModal = true)}
					type="button"
				>
					Şifremi unuttum
				</Button>
			</div>
			<Input
				id="password"
				type="password"
				autocomplete="current-password"
				required
				bind:value={password}
			/>
		</div>
		<Button type="submit" class="w-full" disabled={inProgress}>
			{#if inProgress}
				<LoaderCircle class="animate-spin" />
				Giriş yapılıyor…
			{:else}
				Giriş yap
			{/if}
		</Button>
	</div>
</form>

<Modal bind:open={showForgotPasswordModal} title="Şifremi unuttum">
	<p class="py-4">Şifrenizi unuttuysanız stüdyo yöneticinizle iletişime geçin.</p>
</Modal>
