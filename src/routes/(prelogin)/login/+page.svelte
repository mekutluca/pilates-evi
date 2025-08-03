<script lang="ts">
	import LoginForm from '$lib/components/login-form.svelte';

	let { data } = $props();
	let { supabase } = $derived(data);
</script>

<div class="grid min-h-svh lg:grid-cols-1">
	<div class="flex flex-col gap-4 p-6 md:p-10">
		<div class="flex justify-center gap-2 md:justify-start">
			<a href="/login" class="flex items-center gap-2 font-medium">
				<div class="text-primary-foreground flex size-6 items-center justify-center rounded-md">
					<img src="/favicon.png" alt="Site Logo" class="h-4 w-4" />
				</div>
				Pilates Evi
			</a>
		</div>
		<div class="flex flex-1 items-center justify-center">
			<div class="w-full max-w-xs">
				<LoginForm formType="login" {supabase} />
			</div>
		</div>
	</div>
</div>
