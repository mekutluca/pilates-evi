<script lang="ts">
	import type { LessonPlanPreviewPayload } from '$lib/types/Api';
	import type { WeeklySlot } from '$lib/types/Schedule';
	import PageHeader from '$lib/components/page-header.svelte';
	import LessonPlanSummary from '$lib/components/scheduling/lesson-plan-summary.svelte';
	import WeeklySlotsField from '$lib/components/scheduling/weekly-slots-field.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import { formatDateForDB } from '$lib/utils/date-utils';
	import { formatWeeklyPattern, weeklySlotKey } from '$lib/utils/slot-utils';
	import { actionResultMessage, canConfirmPlan, postAction } from '$lib/utils/api-client';
	import { actionResource } from '$lib/utils/action-resource.svelte';

	let { data } = $props();

	let packageId = $state(untrack(() => data.initial.packageId));
	let roomId = $state(untrack(() => data.initial.roomId));
	let trainerId = $state(untrack(() => data.initial.trainerId));
	let startDate = $state(untrack(() => data.initial.startDate));
	let slots = $state<WeeklySlot[]>([]);
	let submitting = $state(false);

	const pkg = $derived(data.packages.find((p) => p.id === packageId));
	const ready = $derived(
		data.packages.length > 0 && data.rooms.length > 0 && data.trainers.length > 0
	);

	function groupLessonForm(): FormData {
		const fd = new FormData();
		fd.set('packageId', packageId);
		fd.set('roomId', roomId);
		fd.set('trainerId', trainerId);
		fd.set('startDate', startDate);
		fd.set('timeSlots', slots.map(weeklySlotKey).join(','));
		return fd;
	}

	// Server-side plan, refreshed when the form changes
	const preview = actionResource<LessonPlanPreviewPayload>('preview', () =>
		slots.length > 0 ? groupLessonForm() : null
	);
	const blocked = $derived(!canConfirmPlan(preview.current));

	async function submit() {
		if (blocked) return;
		submitting = true;
		const result = await postAction('create', groupLessonForm());
		submitting = false;
		if (result.type === 'success') {
			toast.success(result.data?.message ?? 'Grup dersi açıldı');
			goto(result.data?.redirectTo ?? '/group-lessons');
		} else {
			toast.error(actionResultMessage(result));
		}
	}

	const roomName = (id: string) => data.rooms.find((r) => r.id === id)?.name ?? '-';
	const trainerName = (id: string) => data.trainers.find((t) => t.id === id)?.name ?? '-';
</script>

<svelte:head>
	<title>Yeni grup dersi · Pilates Evi</title>
</svelte:head>

<div class="space-y-6 p-4 md:p-6">
	<PageHeader
		title="Yeni grup dersi"
		subtitle="Her hafta aynı gün ve saatlerde yapılan ders; öğrenciler açıldıktan sonra eklenir."
		back={{ href: '/group-lessons', label: 'Grup Dersleri' }}
	/>

	{#if !ready}
		<div class="rounded-md border border-dashed p-8 text-sm">
			{#if data.packages.length === 0}
				<p class="font-medium">Aktif grup paketi yok.</p>
				<p class="mt-1 text-muted-foreground">
					{#if data.userRole === 'admin'}
						Önce <a href="/packages" class="underline">Paketler</a> sayfasından bir grup paketi ekleyin.
					{:else}
						Yöneticinizden bir grup paketi eklemesini isteyin.
					{/if}
				</p>
			{:else}
				<p class="font-medium">Aktif oda veya eğitmen yok.</p>
				<p class="mt-1 text-muted-foreground">
					Grup dersi açmak için en az bir oda ve eğitmen gerekli.
				</p>
			{/if}
		</div>
	{:else}
		<div class="grid gap-6 lg:grid-cols-5">
			<Card.Root class="lg:col-span-3">
				<Card.Content class="space-y-6">
					<div class="grid gap-2">
						<Label for="gl-package">Paket</Label>
						<NativeSelect id="gl-package" bind:value={packageId}>
							{#each data.packages as p (p.id)}
								<option value={p.id}>{p.name} (en fazla {p.max_capacity} kişi)</option>
							{/each}
						</NativeSelect>
					</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<div class="grid gap-2">
							<Label for="gl-room">Oda</Label>
							<NativeSelect id="gl-room" bind:value={roomId}>
								{#each data.rooms as room (room.id)}
									<option value={room.id}>{room.name}</option>
								{/each}
							</NativeSelect>
						</div>
						<div class="grid gap-2">
							<Label for="gl-trainer">Eğitmen</Label>
							<NativeSelect id="gl-trainer" bind:value={trainerId}>
								{#each data.trainers as trainer (trainer.id)}
									<option value={trainer.id}>{trainer.name}</option>
								{/each}
							</NativeSelect>
						</div>
					</div>

					<WeeklySlotsField bind:slots legend="Haftalık ders saatleri" min={0} />

					<div class="grid gap-2 sm:max-w-56">
						<Label for="gl-start">Başlangıç</Label>
						<Input
							id="gl-start"
							type="date"
							min={formatDateForDB(new Date())}
							bind:value={startDate}
						/>
						<p class="text-xs text-muted-foreground">
							İlk ders bu tarihten sonraki ilk uygun gün ve saatte.
						</p>
					</div>
				</Card.Content>
			</Card.Root>

			<Card.Root class="h-fit lg:col-span-2">
				<Card.Header>
					<Card.Title>Özet</Card.Title>
				</Card.Header>
				<Card.Content class="space-y-3 text-sm">
					<p class="font-medium">{pkg?.name}</p>
					{#if slots.length > 0}
						<p>{formatWeeklyPattern(slots)} · {roomName(roomId)} · {trainerName(trainerId)}</p>
					{/if}
					<LessonPlanSummary
						plan={preview.current}
						idleMessage="Haftalık ders saatlerini ekleyin."
					/>
					<p class="text-muted-foreground">
						İlk 26 haftanın dersleri şimdi oluşturulur; sonraki haftalar her pazartesi otomatik
						eklenir.
					</p>
				</Card.Content>
				<Card.Footer class="flex justify-end gap-2">
					<Button variant="outline" href="/group-lessons">Vazgeç</Button>
					<Button onclick={submit} disabled={blocked || submitting}>
						{#if submitting}<LoaderCircle class="animate-spin" />{/if}
						Grup dersini aç
					</Button>
				</Card.Footer>
			</Card.Root>
		</div>
	{/if}
</div>
