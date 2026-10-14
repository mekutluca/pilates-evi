<script lang="ts">
	import GroupLessonDetail from '$lib/components/group-lessons/group-lesson-detail.svelte';
	import LoadError from '$lib/components/load-error.svelte';
	import { CardSkeleton, PageHeaderSkeleton } from '$lib/components/skeletons/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import { page } from '$app/state';
	import { streamed } from '$lib/utils/streamed.svelte';

	let { data } = $props();

	// The detail streams in; after a Taşı / Sonlandır the loaded one stays until the update lands
	const detail = streamed(
		() => data.lesson,
		() => page.params.id ?? ''
	);
</script>

<svelte:head>
	<title
		>{detail.current ? `${detail.current.packageName} · ` : ''}Grup Dersleri · Pilates Evi</title
	>
</svelte:head>

<div class="mx-auto w-full max-w-6xl space-y-6 p-4 lg:p-6">
	{#if detail.current === undefined}
		<PageHeaderSkeleton actions />
		<Skeleton class="h-26 w-full rounded-2xl" />
		<div class="grid gap-6 lg:grid-cols-5">
			<CardSkeleton rows={5} rowClass="h-12" class="lg:col-span-3" />
			<CardSkeleton rows={3} rowClass="h-12" class="h-fit lg:col-span-2" />
		</div>
	{:else if detail.current === null}
		<LoadError message="Grup dersi yüklenemedi." />
	{:else}
		<GroupLessonDetail lesson={detail.current} rooms={data.rooms} trainers={data.trainers} />
	{/if}
</div>
