<script lang="ts">
	import { enhanceForm } from '$lib/utils/enhance';
	import Mail from '@lucide/svelte/icons/mail';
	import MailWarning from '@lucide/svelte/icons/mail-warning';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import PageHeader from '$lib/components/page-header.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { MIN_PASSWORD_LENGTH, validation } from '$lib/utils/validation';
	import { roleLabels } from '$lib/types/Role';

	let { data } = $props();

	const currentEmail = untrack(() => data.user?.email ?? '');
	const userMetadata = $derived(data.user?.user_metadata as { fullName?: string } | undefined);
	const fullName = $derived(userMetadata?.fullName ?? '');
	const pendingEmail = $derived(data.user?.new_email ?? '');

	let email = $state(currentEmail);
	let currentPassword = $state('');
	let newPassword = $state('');
	let newPasswordConfirm = $state('');
	let updatingEmail = $state(false);
	let updatingPassword = $state(false);

	const emailUnchanged = $derived(email.trim() === (data.user?.email ?? ''));
	const passwordMismatch = $derived(
		newPassword.length > 0 && newPasswordConfirm.length > 0 && newPassword !== newPasswordConfirm
	);

	const initials = $derived.by(() => {
		const source = fullName.trim() || currentEmail;
		const parts = source.split(/\s+/).filter(Boolean);
		if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
		return source.slice(0, 2).toUpperCase();
	});
</script>

<svelte:head>
	<title>Ayarlar · Pilates Evi</title>
</svelte:head>

<div class="mx-auto w-full max-w-3xl space-y-6 p-4 lg:p-6">
	<div class="mx-auto max-w-3xl">
		<PageHeader title="Ayarlar" subtitle="Hesap bilgilerinizi ve güvenlik ayarlarınızı yönetin" />

		<!-- Account identity -->
		<div class="mb-8 flex items-center gap-4 surface p-4">
			<div
				class="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary"
			>
				{initials}
			</div>
			<div class="min-w-0 flex-1">
				<p class="truncate font-medium">{fullName || currentEmail}</p>
				{#if fullName}
					<p class="truncate text-sm text-muted-foreground">{currentEmail}</p>
				{/if}
			</div>
			{#if data.userRole}
				<Badge variant="outline">{roleLabels[data.userRole]}</Badge>
			{/if}
		</div>

		<!-- Email section -->
		<section class="grid gap-4 md:grid-cols-[220px_1fr] md:gap-8">
			<div>
				<h2 class="flex items-center gap-2 font-semibold">
					<Mail size={16} class="text-muted-foreground" />
					E-posta Adresi
				</h2>
				<p class="mt-1 text-sm text-muted-foreground">
					Giriş için kullandığınız e-posta adresini değiştirin. Değişiklik, yeni adresinize
					gönderilen bağlantıyı onayladığınızda geçerli olur.
				</p>
			</div>
			<Card.Root>
				<form
					method="POST"
					action="?/updateEmail"
					use:enhance={enhanceForm({
						busy: (b) => (updatingEmail = b),
						success: 'Onay bağlantısı yeni e-posta adresinize gönderildi',
						reset: false
					})}
				>
					<Card.Content class="space-y-4">
						{#if pendingEmail}
							<div class="flex items-start gap-2 rounded-xl bg-muted px-3 py-2 text-sm">
								<MailWarning size={16} class="mt-0.5 shrink-0 text-muted-foreground" />
								<div>
									<p class="font-medium">Onay bekleyen e-posta değişikliği</p>
									<p class="text-xs text-muted-foreground">
										{pendingEmail} adresine gönderilen bağlantı onaylanana kadar mevcut adresiniz geçerli
										kalır.
									</p>
								</div>
							</div>
						{/if}
						<div class="grid gap-2">
							<Label for="email">E-posta</Label>
							<Input
								id="email"
								name="email"
								type="email"
								required
								pattern={validation.email.pattern}
								title={validation.email.title}
								bind:value={email}
							/>
						</div>
					</Card.Content>
					<Card.Footer class="justify-end pt-6">
						<Button type="submit" disabled={updatingEmail || emailUnchanged}>
							{#if updatingEmail}
								<LoaderCircle size={16} class="animate-spin" />
							{/if}
							Kaydet
						</Button>
					</Card.Footer>
				</form>
			</Card.Root>
		</section>

		<Separator class="my-8" />

		<!-- Password section -->
		<section class="grid gap-4 md:grid-cols-[220px_1fr] md:gap-8">
			<div>
				<h2 class="flex items-center gap-2 font-semibold">
					<KeyRound size={16} class="text-muted-foreground" />
					Şifre
				</h2>
				<p class="mt-1 text-sm text-muted-foreground">
					Hesabınızın güvenliği için mevcut şifrenizi doğrulayarak yeni bir şifre belirleyin.
				</p>
			</div>
			<Card.Root>
				<form
					method="POST"
					action="?/updatePassword"
					use:enhance={enhanceForm({
						busy: (b) => (updatingPassword = b),
						success: 'Şifreniz başarıyla güncellendi',
						onSuccess: () => {
							currentPassword = '';
							newPassword = '';
							newPasswordConfirm = '';
						},
						reset: false
					})}
				>
					<Card.Content class="space-y-4">
						<div class="grid gap-2">
							<Label for="currentPassword">Mevcut şifre</Label>
							<Input
								id="currentPassword"
								name="currentPassword"
								type="password"
								autocomplete="current-password"
								required
								bind:value={currentPassword}
							/>
						</div>
						<div class="grid gap-2">
							<Label for="newPassword">Yeni şifre</Label>
							<Input
								id="newPassword"
								name="newPassword"
								type="password"
								autocomplete="new-password"
								minlength={MIN_PASSWORD_LENGTH}
								aria-describedby="newPassword-hint"
								required
								bind:value={newPassword}
							/>
							<p id="newPassword-hint" class="text-xs text-muted-foreground">
								En az {MIN_PASSWORD_LENGTH} karakter
							</p>
						</div>
						<div class="grid gap-2">
							<Label for="newPasswordConfirm">Yeni şifre (tekrar)</Label>
							<Input
								id="newPasswordConfirm"
								name="newPasswordConfirm"
								type="password"
								autocomplete="new-password"
								minlength={MIN_PASSWORD_LENGTH}
								aria-invalid={passwordMismatch || undefined}
								aria-describedby={passwordMismatch ? 'newPasswordConfirm-error' : undefined}
								required
								bind:value={newPasswordConfirm}
							/>
							{#if passwordMismatch}
								<p id="newPasswordConfirm-error" class="text-sm text-destructive">
									Yeni şifreler eşleşmiyor
								</p>
							{/if}
						</div>
					</Card.Content>
					<Card.Footer class="justify-end pt-6">
						<Button
							type="submit"
							disabled={updatingPassword ||
								!currentPassword ||
								!newPassword ||
								!newPasswordConfirm ||
								passwordMismatch}
						>
							{#if updatingPassword}
								<LoaderCircle size={16} class="animate-spin" />
							{/if}
							Şifreyi kaydet
						</Button>
					</Card.Footer>
				</form>
			</Card.Root>
		</section>
	</div>
</div>
