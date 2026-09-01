<script lang="ts">
	import { version } from '$app/environment';
	import { page } from '$app/state';
	import ErrorState from '$lib/components/error-state.svelte';
</script>

<!-- Mirrors the login page frame: this page renders outside the authed shell. -->
<div class="flex min-h-svh flex-col gap-4 p-6 md:p-10">
	<div class="flex justify-center gap-2 md:justify-start">
		<a href="/" class="font-medium">Pilates Evi</a>
	</div>
	<div class="flex flex-1 items-center justify-center">
		<ErrorState status={page.status} message={page.error?.message} />
	</div>
	<p class="text-center text-xs text-muted-foreground">Build {version}</p>
</div>
