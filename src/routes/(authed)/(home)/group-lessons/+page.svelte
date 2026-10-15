<script lang="ts">
	import { streamed } from '$lib/utils/streamed.svelte';
	import type { GroupLessonSummary } from '$lib/types/GroupLesson';
	import PageHeader from '$lib/components/page-header.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Accordion from '$lib/components/ui/accordion/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import UsersRound from '@lucide/svelte/icons/users-round';
	import { formatDisplayDate } from '$lib/utils/date-utils';
	import PatternChip from '$lib/components/pattern-chip.svelte';
	import LoadError from '$lib/components/load-error.svelte';
	import { CardSkeleton } from '$lib/components/skeletons/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';

	let { data } = $props();

	// Streamed: `undefined` while loading, `null` when it failed
	const lessons = streamed(
		() => data.lessons,
		() => 'group-lessons'
	);

	function summary(running: GroupLessonSummary[]): string {
		return running.length === 0
			? 'Devam eden grup dersi yok'
			: `${running.length} devam eden grup dersi, ${running.reduce((n, l) => n + l.traineeCount, 0)} öğrenci`;
	}
</script>

<svelte:head>
	<title>Grup Dersleri · Pilates Evi</title>
</svelte:head>

{#snippet lessonTable(lessons: GroupLessonSummary[], ended: boolean)}
	<div class="overflow-x-auto surface">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>Paket</Table.Head>
					<Table.Head>Program</Table.Head>
					<Table.Head class="hidden md:table-cell">Oda · Eğitmen</Table.Head>
					<Table.Head class="text-right">{ended ? 'Bitiş' : 'Öğrenci'}</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each lessons as lesson (lesson.id)}
					<Table.Row class="relative">
						<Table.Cell class="font-medium">
							<a
								href={`/group-lessons/${lesson.id}`}
								class="after:absolute after:inset-0 focus-visible:outline-none after:focus-visible:ring-2 after:focus-visible:ring-ring"
							>
								{lesson.packageName}
							</a>
						</Table.Cell>
						<Table.Cell><PatternChip slots={lesson.slots} /></Table.Cell>
						<Table.Cell class="hidden text-muted-foreground md:table-cell">
							{lesson.roomName} · {lesson.trainerName}
						</Table.Cell>
						<Table.Cell class="text-right tabular-nums">
							{#if ended}
								{formatDisplayDate(lesson.endDate)}
							{:else}
								{lesson.traineeCount}
								<span class="text-muted-foreground">/ {lesson.maxCapacity}</span>
							{/if}
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
{/snippet}

<div class="mx-auto w-full max-w-6xl space-y-6 p-4 lg:p-6">
	<PageHeader title="Grup Dersleri">
		{#snippet actions()}
			<Button href="/group-lessons/new">
				<Plus />
				Yeni grup dersi
			</Button>
		{/snippet}
		{#if lessons.current === undefined}
			<Skeleton class="mt-2 h-4 w-56" />
		{:else if lessons.current}
			<p class="mt-1 text-sm text-muted-foreground">{summary(lessons.current.running)}</p>
		{/if}
	</PageHeader>

	{#if lessons.current === undefined}
		<CardSkeleton title={false} rows={4} rowClass="h-12" />
	{:else if lessons.current === null}
		<LoadError message="Grup dersleri yüklenemedi." />
	{:else}
		{@const list = lessons.current}
		{#if list.running.length === 0}
			<Empty.Root class="surface">
				<Empty.Header>
					<Empty.Media variant="icon"><UsersRound /></Empty.Media>
					<Empty.Title>Henüz devam eden grup dersi yok</Empty.Title>
					<Empty.Description>
						Bir grup paketi, oda, eğitmen ve haftalık saatlerle grup dersi açın. Öğrenciler sonra
						eklenir.
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{:else}
			{@render lessonTable(list.running, false)}
		{/if}

		{#if list.ended.length > 0}
			<Accordion.Root type="single">
				<Accordion.Item value="ended">
					<Accordion.Trigger>Sona eren grup dersleri ({list.ended.length})</Accordion.Trigger>
					<Accordion.Content>
						{@render lessonTable(list.ended, true)}
					</Accordion.Content>
				</Accordion.Item>
			</Accordion.Root>
		{/if}
	{/if}
</div>
