<script lang="ts">
	import LoginForm from '$lib/components/login-form.svelte';
	import BrandMark from '$lib/components/brand-mark.svelte';

	let { data } = $props();
	let { supabase } = $derived(data);
</script>

<svelte:head>
	<title>Giriş Yap · Pilates Evi</title>
</svelte:head>

<div class="grid min-h-svh lg:grid-cols-1">
	<div class="flex flex-col gap-4 p-6 md:p-10">
		<div class="flex justify-center gap-2 md:justify-start">
			<a href="/login" class="flex items-center gap-2 font-medium">
				<BrandMark class="size-7" />
				<span class="text-lg font-semibold">Pilates Evi</span>
			</a>
		</div>
		<main class="flex flex-1 items-center justify-center">
			<div class="w-full max-w-xs">
				<LoginForm {supabase} />
			</div>
		</main>
	</div>
</div>
