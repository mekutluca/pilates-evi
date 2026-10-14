<script lang="ts">
	import RenewForm from '$lib/components/assignment/renew-form.svelte';
	import LoadError from '$lib/components/load-error.svelte';
	import { CardSkeleton, PageHeaderSkeleton } from '$lib/components/skeletons/index.js';
	import { page } from '$app/state';
	import { streamed } from '$lib/utils/streamed.svelte';

	let { data } = $props();

	const renewal = streamed(
		() => data.renewal,
		() => page.params.purchaseId ?? ''
	);
</script>

<svelte:head>
	<title>Yenile{renewal.current ? ` · ${renewal.current.package.name}` : ''} · Pilates Evi</title>
</svelte:head>

<div class="mx-auto w-full max-w-6xl space-y-6 p-4 lg:p-6">
	{#if renewal.current === undefined}
		<PageHeaderSkeleton />
		<div class="grid gap-6 lg:grid-cols-5">
			<CardSkeleton rows={4} rowClass="h-10" class="lg:col-span-3" />
			<CardSkeleton rows={2} rowClass="h-8" class="h-fit lg:col-span-2" />
		</div>
	{:else if renewal.current === null}
		<LoadError message="Kayıt bilgileri yüklenemedi." />
	{:else}
		<RenewForm renewal={renewal.current} rooms={data.rooms} trainers={data.trainers} />
	{/if}
</div>
