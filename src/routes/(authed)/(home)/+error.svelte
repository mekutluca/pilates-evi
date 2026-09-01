<script lang="ts">
	import { page } from '$app/state';
	import ErrorState from '$lib/components/error-state.svelte';
</script>

<!-- Renders inside the authed shell so the nav stays usable. -->
<div class="flex min-h-full items-center justify-center p-4 sm:p-6">
	<ErrorState status={page.status} message={page.error?.message} />
</div>
