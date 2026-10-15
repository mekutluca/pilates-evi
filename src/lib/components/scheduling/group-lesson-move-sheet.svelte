<script lang="ts">
	import LoadError from '$lib/components/load-error.svelte';
	import CauseField from './cause-field.svelte';
	import type { GroupLessonMoveSheetProps } from '$lib/types/ComponentProps';
	import type { MovePreviewPayload } from '$lib/types/Api';
	import type { WeeklySlot } from '$lib/types/Schedule';
	import { DAYS_OF_WEEK, DAY_NAMES, SCHEDULE_HOURS, getTimeString } from '$lib/types/Schedule';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import MoveArrow from './move-arrow.svelte';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { toast } from 'svelte-sonner';
	import { untrack } from 'svelte';
	import { formatDateForDB } from '$lib/utils/date-utils';
	import { formatWeeklyPattern, weeklySlotKey } from '$lib/utils/slot-utils';
	import { actionResultMessage, postAction } from '$lib/utils/api-client';
	import { actionResource } from '$lib/utils/action-resource.svelte';
	import ConflictList from './conflict-list.svelte';
	import MovePreviewList from './move-preview-list.svelte';

	let { open = $bindable(), lesson, rooms, trainers, onDone }: GroupLessonMoveSheetProps = $props();

	const today = formatDateForDB(new Date());
	// The parent remounts this sheet per lesson, so these start from it
	let fromDate = $state(today);
	let targets = $state<WeeklySlot[]>(untrack(() => lesson.slots.map((s) => ({ ...s }))));
	let roomId = $state(untrack(() => lesson.roomId));
	let trainerId = $state(untrack(() => lesson.trainerId));
	let cause = $state('');
	let notify = $state(true);
	let submitting = $state(false);

	const slotChanges = $derived(
		lesson.slots.flatMap((from, i) =>
			weeklySlotKey(from) === weeklySlotKey(targets[i])
				? []
				: [`${weeklySlotKey(from)}>${weeklySlotKey(targets[i])}`]
		)
	);
	const changed = $derived(
		slotChanges.length > 0 || roomId !== lesson.roomId || trainerId !== lesson.trainerId
	);
	// What moves where (the preview's input; the move adds the message)
	function planForm(): FormData {
		const fd = new FormData();
		fd.set('fromDate', fromDate);
		fd.set('slotChanges', slotChanges.join(','));
		if (roomId !== lesson.roomId) fd.set('roomId', roomId);
		if (trainerId !== lesson.trainerId) fd.set('trainerId', trainerId);
		return fd;
	}

	// Server-side dry run, refreshed when the inputs change
	const preview = actionResource<MovePreviewPayload>('previewMove', () =>
		open && changed && fromDate ? planForm() : null
	);
	const recipients = $derived(
		preview.current.status === 'ready' ? preview.current.value.recipientCount : 0
	);
	const needsCause = $derived(notify && recipients > 0);

	const canSubmit = $derived(
		!submitting &&
			preview.current.status === 'ready' &&
			preview.current.value.conflicts.length === 0 &&
			preview.current.value.rows.length > 0 &&
			(!needsCause || cause.trim().length > 0)
	);

	async function submit() {
		if (!canSubmit) return;
		submitting = true;
		const fd = planForm();
		fd.set('cause', cause);
		fd.set('notify', String(needsCause));
		const result = await postAction('move', fd);
		submitting = false;
		if (result.type === 'success') {
			toast.success(result.data?.message ?? 'Grup dersi taşındı');
			open = false;
			onDone();
		} else {
			toast.error(actionResultMessage(result));
		}
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content
		side="right"
		class="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-lg"
	>
		<Sheet.Header class="border-b pr-12">
			<Sheet.Title>Grup dersini taşı</Sheet.Title>
			<Sheet.Description>
				{lesson.packageName} · {formatWeeklyPattern(lesson.slots)}
			</Sheet.Description>
		</Sheet.Header>

		<div class="space-y-6 px-6 py-5">
			<div class="grid gap-2 sm:max-w-56">
				<Label for="glm-from">Hangi tarihten itibaren?</Label>
				<Input id="glm-from" type="date" min={today} bind:value={fromDate} />
			</div>

			<fieldset class="grid gap-2">
				<legend class="mb-2 text-sm font-medium">Ders saatleri</legend>
				{#each lesson.slots as from, i (weeklySlotKey(from))}
					<div class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 text-sm">
						<span class="tabular-nums">
							{DAY_NAMES[from.day]}
							{getTimeString(from.hour)}
							<MoveArrow label="yeni saat" class="ml-1 inline size-4" />
						</span>
						<NativeSelect bind:value={targets[i].day} aria-label="Yeni gün">
							{#each DAYS_OF_WEEK as day (day)}
								<option value={day}>{DAY_NAMES[day]}</option>
							{/each}
						</NativeSelect>
						<NativeSelect bind:value={targets[i].hour} aria-label="Yeni saat">
							{#each SCHEDULE_HOURS as hour (hour)}
								<option value={hour}>{getTimeString(hour)}</option>
							{/each}
						</NativeSelect>
					</div>
				{/each}
				<p class="text-xs text-muted-foreground">
					Her randevu aynı haftanın yeni gün ve saatine taşınır.
				</p>
			</fieldset>

			<div class="grid grid-cols-2 gap-3">
				<div class="grid gap-2">
					<Label for="glm-room">Oda</Label>
					<NativeSelect class="w-full" id="glm-room" bind:value={roomId}>
						{#each rooms as room (room.id)}
							<option value={room.id}>{room.name}</option>
						{/each}
					</NativeSelect>
				</div>
				<div class="grid gap-2">
					<Label for="glm-trainer">Eğitmen</Label>
					<NativeSelect class="w-full" id="glm-trainer" bind:value={trainerId}>
						{#each trainers as t (t.id)}
							<option value={t.id}>{t.name}</option>
						{/each}
					</NativeSelect>
				</div>
			</div>

			{#if recipients > 0}
				<div class="grid gap-2">
					<label class="flex cursor-pointer items-center gap-3 text-sm">
						<Checkbox bind:checked={notify} />
						Öğrencilere WhatsApp ile bildir ({recipients} kişi)
					</label>
					{#if notify}
						<CauseField bind:value={cause} id="cause-group-move" />
					{/if}
				</div>
			{/if}

			<section aria-live="polite" class="grid gap-2">
				<h3 class="text-sm font-semibold">Önizleme</h3>
				{#if preview.current.status === 'idle'}
					<p class="text-sm text-muted-foreground">Yeni saat, oda veya eğitmen seçin.</p>
				{:else if preview.current.status === 'loading'}
					<p class="flex items-center gap-2 text-sm text-muted-foreground">
						<LoaderCircle class="size-4 animate-spin" />
						Kontrol ediliyor…
					</p>
				{:else if preview.current.status === 'failed'}
					<LoadError message={preview.current.message} onRetry={preview.retry} />
				{:else}
					{#if preview.current.value.conflicts.length > 0}
						<ConflictList
							conflicts={preview.current.value.conflicts}
							title={`${preview.current.value.conflicts.length} çakışma var, taşınamaz.`}
						/>
					{/if}
					<p class="text-sm text-muted-foreground">
						{preview.current.value.rows.length} randevu taşınacak
					</p>
					<MovePreviewList rows={preview.current.value.rows} {rooms} {trainers} />
				{/if}
			</section>
		</div>

		<Sheet.Footer class="sticky bottom-0 flex-row justify-end gap-2 border-t bg-popover">
			<Button variant="outline" onclick={() => (open = false)}>Vazgeç</Button>
			<Button onclick={submit} disabled={!canSubmit}>
				{#if submitting}
					<LoaderCircle class="animate-spin" />
				{/if}
				Taşı
			</Button>
		</Sheet.Footer>
	</Sheet.Content>
</Sheet.Root>
