<script lang="ts">
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

	let { data } = $props();

	const subtitle = $derived(
		data.running.length === 0
			? 'Devam eden grup dersi yok'
			: `${data.running.length} devam eden grup dersi, ${data.running.reduce((n, l) => n + l.traineeCount, 0)} öğrenci`
	);
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
					<Table.Head>Oda · Eğitmen</Table.Head>
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
						<Table.Cell class="text-muted-foreground">
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
	<PageHeader title="Grup Dersleri" {subtitle}>
		{#snippet actions()}
			<Button href="/group-lessons/new">
				<Plus />
				Yeni grup dersi
			</Button>
		{/snippet}
	</PageHeader>

	{#if data.running.length === 0}
		<Empty.Root class="surface">
			<Empty.Header>
				<Empty.Media variant="icon"><UsersRound /></Empty.Media>
				<Empty.Title>Henüz devam eden grup dersi yok</Empty.Title>
				<Empty.Description>
					Bir grup paketi, oda, eğitmen ve haftalık saatlerle grup dersi açın; öğrenciler sonra
					eklenir.
				</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{:else}
		{@render lessonTable(data.running, false)}
	{/if}

	{#if data.ended.length > 0}
		<Accordion.Root type="single">
			<Accordion.Item value="ended">
				<Accordion.Trigger>Sona eren grup dersleri ({data.ended.length})</Accordion.Trigger>
				<Accordion.Content>
					{@render lessonTable(data.ended, true)}
				</Accordion.Content>
			</Accordion.Item>
		</Accordion.Root>
	{/if}
</div>
