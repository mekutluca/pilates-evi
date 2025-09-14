<script lang="ts">
	import { cn } from '$lib/utils/class-utils';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import Modal from './modal.svelte';

	let {
		class: className = '',
		formType = $bindable('login'),
		supabase,
		...restProps
	}: {
		class?: string;
		formType: 'login' | 'forgot-password' | 'reset-password';
		supabase: SupabaseClient;
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
		} else {
			goto('/');
		}
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
							class="btn btn-ghost btn-sm hover:underline!"
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
		<button type="submit" class="btn w-full btn-primary" disabled={inProgress}>
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

<Modal bind:open={showForgotPasswordModal} title="Şifremi unuttum">
	<!-- https://www.reddit.com/r/Supabase/comments/1c257cg/reset_password_and_update_user_without_clientside/ -->
	<p class="py-4">Eğer şifrenizi unuttuysanız lütfen adminler ile iletişime geçiniz.</p>
</Modal>
