<script lang="ts">
	import type { RenewFormProps } from '$lib/types/ComponentProps';
	import type { LessonPlanPreviewPayload } from '$lib/types/Api';
	import type { SelectedGroupTimeslot } from '$lib/types';
	import type { DayOfWeek, WeeklySlot } from '$lib/types/Schedule';
	import { DAY_NAMES, getTimeString } from '$lib/types/Schedule';
	import PageHeader from '$lib/components/page-header.svelte';
	import LessonPlanSummary from '$lib/components/scheduling/lesson-plan-summary.svelte';
	import PastStartHint from '$lib/components/scheduling/past-start-hint.svelte';
	import WeeklySlotsField from '$lib/components/scheduling/weekly-slots-field.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import { formatDateForDB, formatDisplayDate, isPastDate } from '$lib/utils/date-utils';
	import { formatWeeklyPattern, groupSlotKey, weeklySlotKey } from '$lib/utils/slot-utils';
	import { actionResultMessage, canConfirmPlan, postAction } from '$lib/utils/api-client';
	import { actionResource } from '$lib/utils/action-resource.svelte';

	// The Yenile form for a loaded kayıt (the page streams `renewal` in)
	let { renewal, rooms, trainers }: RenewFormProps = $props();

	const pkg = $derived(renewal.package);
	const traineeId = $derived(renewal.trainees[0]?.id ?? '');

	// Form state starts from the kayıt's current pattern
	let timeSlots = $state<WeeklySlot[]>(untrack(() => [...renewal.currentSlots]));
	let roomId = $state(untrack(() => renewal.currentRoomId));
	let trainerId = $state(untrack(() => renewal.currentTrainerId));
	let groupSlots = $state<SelectedGroupTimeslot[]>(untrack(() => [...renewal.currentGroupSlots]));
	// An ended kayıt renews from today by default; an earlier start back-dates the renewal
	const today = formatDateForDB(new Date());
	let startDate = $state(
		untrack(() => (renewal.earliestStart > today ? renewal.earliestStart : today))
	);
	let periods = $state(1);
	let weeks = $state(untrack(() => renewal.package.weeks_duration ?? 4));
	let submitting = $state(false);

	const selectedGroupKeys = $derived(new Set(groupSlots.map(groupSlotKey)));

	function renewalForm(): FormData {
		const fd = new FormData();
		fd.set('kind', renewal.isGroup ? 'group' : 'private');
		fd.set('startDate', startDate);
		if (renewal.isGroup) {
			fd.set('groupSlots', groupSlots.map(groupSlotKey).join(','));
			fd.set('weeks', String(weeks));
		} else {
			fd.set('timeSlots', timeSlots.map(weeklySlotKey).join(','));
			fd.set('roomId', roomId);
			fd.set('trainerId', trainerId);
			fd.set('periods', String(periods));
		}
		return fd;
	}

	// Server-side plan of the renewal, refreshed when the form changes
	const preview = actionResource<LessonPlanPreviewPayload>('preview', () =>
		(renewal.isGroup ? groupSlots.length : timeSlots.length) > 0 ? renewalForm() : null
	);
	const blocked = $derived(!canConfirmPlan(preview.current));

	function toggleGroupSlot(slot: SelectedGroupTimeslot, checked: boolean) {
		groupSlots = checked
			? [...groupSlots, slot]
			: groupSlots.filter((s) => groupSlotKey(s) !== groupSlotKey(slot));
	}

	async function submit() {
		if (blocked) return;
		submitting = true;
		const result = await postAction('renew', renewalForm());
		submitting = false;
		if (result.type === 'success') {
			toast.success(result.data?.message ?? 'Kayıt yenilendi');
			goto(result.data?.redirectTo ?? `/trainees/${traineeId}`);
		} else {
			toast.error(actionResultMessage(result));
		}
	}

	const roomName = (id: string) => rooms.find((r) => r.id === id)?.name ?? '-';
	const trainerName = (id: string) => trainers.find((t) => t.id === id)?.name ?? '-';
</script>

<div class="space-y-6">
	<PageHeader
		title="Kaydı yenile"
		subtitle={`${pkg.name} · ${renewal.trainees.map((t) => t.name).join(', ')}`}
		back={{ href: `/trainees/${traineeId}`, label: 'Öğrenci' }}
	/>

	<div class="grid gap-6 lg:grid-cols-5">
		<Card.Root class="lg:col-span-3">
			<Card.Header>
				<Card.Title>Yeni dönem</Card.Title>
				<Card.Description>
					Mevcut programla başlar. Gün, saat, oda veya eğitmeni değiştirebilirsiniz.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-6">
				{#if renewal.isGroup}
					<fieldset class="grid gap-2">
						<legend class="mb-2 text-sm font-medium">Grup saatleri</legend>
						{#if renewal.groupTimeslots.length === 0}
							<p class="text-sm text-muted-foreground">Bu paketin devam eden grup dersi yok.</p>
						{/if}
						{#each renewal.groupTimeslots as slot (groupSlotKey(slot))}
							{@const selection = {
								group_lesson_id: slot.group_lesson_id,
								day: slot.day,
								hour: slot.hour
							}}
							<label
								class="flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm"
							>
								<Checkbox
									checked={selectedGroupKeys.has(groupSlotKey(selection))}
									onCheckedChange={(checked) => toggleGroupSlot(selection, checked === true)}
								/>
								<span class="font-medium">
									{DAY_NAMES[slot.day as DayOfWeek] ?? slot.day}
									{getTimeString(slot.hour)}
								</span>
								<span class="text-muted-foreground">{slot.room_name} · {slot.trainer_name}</span>
								<span class="ml-auto text-muted-foreground tabular-nums">
									{slot.current_capacity}/{slot.max_capacity}
								</span>
							</label>
						{/each}
					</fieldset>
					<div class="grid gap-2 sm:max-w-48">
						<Label for="renew-weeks">Kaç hafta?</Label>
						<Input id="renew-weeks" type="number" min={1} max={26} bind:value={weeks} />
					</div>
				{:else}
					<WeeklySlotsField
						bind:slots={timeSlots}
						legend={`Ders saatleri (haftada ${
							pkg.min_lessons_per_week === pkg.max_lessons_per_week
								? pkg.min_lessons_per_week
								: `${pkg.min_lessons_per_week}–${pkg.max_lessons_per_week}`
						})`}
						min={pkg.min_lessons_per_week}
						max={pkg.max_lessons_per_week}
					/>

					<div class="grid gap-4 sm:grid-cols-2">
						<div class="grid gap-2">
							<Label for="renew-room">Oda</Label>
							<NativeSelect class="w-full" id="renew-room" bind:value={roomId}>
								{#each rooms as room (room.id)}
									<option value={room.id}>{room.name}</option>
								{/each}
							</NativeSelect>
						</div>
						<div class="grid gap-2">
							<Label for="renew-trainer">Eğitmen</Label>
							<NativeSelect class="w-full" id="renew-trainer" bind:value={trainerId}>
								{#each trainers as trainer (trainer.id)}
									<option value={trainer.id}>{trainer.name}</option>
								{/each}
							</NativeSelect>
						</div>
					</div>

					<div class="grid gap-2 sm:max-w-48">
						<Label for="renew-periods">Kaç dönem?</Label>
						<Input id="renew-periods" type="number" min={1} max={12} bind:value={periods} />
						<p class="text-xs text-muted-foreground">
							1 dönem = {pkg.weeks_duration} hafta = {(pkg.weeks_duration ?? 0) * timeSlots.length} ders
						</p>
					</div>
				{/if}

				<div class="grid gap-2 sm:max-w-56">
					<Label for="renew-start">Başlangıç</Label>
					<Input
						id="renew-start"
						type="date"
						min={renewal.earliestStart}
						bind:value={startDate}
						aria-describedby="renew-start-hint"
					/>
					<div id="renew-start-hint" class="grid gap-1">
						{#if isPastDate(startDate)}
							<PastStartHint>Geriye dönük yenileme, geçmiş dersler de eklenir.</PastStartHint>
						{/if}
						{#if renewal.lastLessonDate}
							<p class="text-xs text-muted-foreground">
								Mevcut son ders: {formatDisplayDate(renewal.lastLessonDate)}
							</p>
						{/if}
					</div>
				</div>
			</Card.Content>
		</Card.Root>

		<Card.Root class="h-fit lg:col-span-2">
			<Card.Header>
				<Card.Title>Özet</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-3 text-sm">
				{#if !renewal.isGroup}
					<p>
						{formatWeeklyPattern(timeSlots)} · {roomName(roomId)} · {trainerName(trainerId)}
					</p>
				{/if}
				<LessonPlanSummary
					plan={preview.current}
					idleMessage="En az bir ders saati seçin."
					onRetry={preview.retry}
				/>
			</Card.Content>
			<Card.Footer class="flex justify-end gap-2">
				<Button variant="outline" href={`/trainees/${traineeId}`}>Vazgeç</Button>
				<Button onclick={submit} disabled={blocked || submitting}>
					{#if submitting}<LoaderCircle class="animate-spin" />{/if}
					Kaydı yenile
				</Button>
			</Card.Footer>
		</Card.Root>
	</div>
</div>
