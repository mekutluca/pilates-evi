<script lang="ts">
	import { cn } from '$lib/utils.js';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';

	let {
		class: className = '',
		formType = $bindable('login'),
		supabase,
		...restProps
	}: {
		class?: string;
		formType: 'login' | 'forgot-password' | 'reset-password';
		supabase: SupabaseClient<any, 'public', any>;
	} = $props();

	let inProgress = $state(false);
	let email = $state('');
	let password = $state('');

	async function login() {
		inProgress = true;

		const res = await supabase.auth.signInWithPassword({
			email,
			password
		});

		if (res.error) {
			toast.error('Giriş hatası: ' + res.error.message);
			inProgress = false;
		} else {
			goto('/');
		}
	}

	async function forgotPassword() {
		inProgress = true;
		const res = await supabase.auth.resetPasswordForEmail(email, {
			// redirectTo: dev
			// 	? 'http://localhost:5173/reset-password'
			// 	: 'https://sunsama.vercel.app/reset-password'
			redirectTo: '/reset-password'
		});

		if (res.error) {
			toast.error('Password reset failed: ' + res.error.message);
			inProgress = false;
		} else {
			goto('/reset-password-sent?email=' + encodeURIComponent(email));
		}
	}

	async function resetPassword() {
		inProgress = true;

		const res = await supabase.auth.updateUser({
			password
		});

		if (res.error) {
			let error = res.error.message;
			try {
				const parsedUrl = new URL(page.url);
				const hashParams = new URLSearchParams(parsedUrl.hash.substring(1));
				let desc = hashParams.get('error_description');
				if (desc) {
					error = desc;
				}
			} catch (e) {}
			toast.error('Password reset failed: ' + error);
			inProgress = false;
		} else {
			toast.success('Password updated successfully!');
			goto('/login');
		}
	}

	function showModal() {
		const modal = document.getElementById('my_modal_2') as HTMLDialogElement;
		if (modal) {
			modal.showModal();
		}
	}
</script>

<form
	class={cn('flex flex-col gap-6', className)}
	{...restProps}
	onsubmit={() => {
		if (formType === 'login') {
			login();
		} else if (formType === 'forgot-password') {
			forgotPassword();
		} else if (formType === 'reset-password') {
			resetPassword();
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
		<p class="text-muted-foreground text-sm text-balance">
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
			<fieldset class="fieldset">
				<legend class="fieldset-legend">Email</legend>
				<input class="input" id="email" type="email" placeholder="" required bind:value={email} />
			</fieldset>
		{/if}
		{#if formType === 'login' || formType === 'reset-password'}
			<fieldset class="fieldset">
				<div class="flex place-content-between">
					<legend class="fieldset-legend">Şifre</legend>
					{#if formType === 'login'}
						<button
							class="btn btn-sm btn-ghost hover:underline!"
							tabindex="-1"
							onclick={showModal}
							type="button"
						>
							Şifremi unuttum
						</button>
					{/if}
				</div>
				<input class="input" id="password" type="password" required bind:value={password} />
			</fieldset>
		{/if}
		<button type="submit" class="btn btn-primary w-full" disabled={inProgress}>
			{#if inProgress}
				<div class="flex items-center">
					<LoaderCircle size={16} class="animation--rotate opacity-50" />
				</div>
			{:else if formType === 'login'}
				Giriş yap
			{:else if formType === 'forgot-password'}
				Sıfırlama bağlantısı gönder
			{:else if formType === 'reset-password'}
				Şifremi güncelle
			{/if}
		</button>
	</div>
	<div class="text-center text-sm">
		{#if formType === 'forgot-password'}
			Hata?
			<a href="/login" class="underline! underline-offset-4"> Giriş yap. </a>
		{:else if formType === 'reset-password'}
			Hata?
			<a href="/login" class="underline! underline-offset-4"> Giriş yap. </a>
		{/if}
	</div>
</form>

<dialog id="my_modal_2" class="modal">
	<div class="modal-box">
		<h3 class="text-lg font-bold">Şifremi unuttum</h3>
		<!-- https://www.reddit.com/r/Supabase/comments/1c257cg/reset_password_and_update_user_without_clientside/ -->
		<p class="py-4">Eğer şifrenizi unuttuysanız lütfen adminler ile iletişime geçiniz.</p>
	</div>
	<form method="dialog" class="modal-backdrop">
		<button>kapat</button>
	</form>
</dialog>
