<script lang="ts">
	import LoadError from '$lib/components/load-error.svelte';
	import CauseField from './cause-field.svelte';
	import type { MoveSheetProps } from '$lib/types/ComponentProps';
	import type { Loadable, MovePreviewPayload, SeriesPatternPayload } from '$lib/types/Api';
	import type { WeeklySlot } from '$lib/types/Schedule';
	import type { MoveMode, TransferScope } from '$lib/types/Transfer';
	import ConflictList from './conflict-list.svelte';
	import MovePreviewList from './move-preview-list.svelte';
	import SlotChangesField from './slot-changes-field.svelte';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group/index.js';
	import MoveArrow from './move-arrow.svelte';
	import CalendarSearch from '@lucide/svelte/icons/calendar-search';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { toast } from 'svelte-sonner';
	import { untrack } from 'svelte';
	import { formatSlotLabel, getAppointmentDateTime } from '$lib/utils/date-utils';
	import { actionResultMessage, postAction } from '$lib/utils/api-client';
	import { actionResource } from '$lib/utils/action-resource.svelte';
	import { formatSlotChanges } from '$lib/utils/slot-utils';

	let {
		open = $bindable(),
		appointment,
		trainee,
		rooms,
		trainers,
		userRole,
		pickedSlot,
		onPickTime,
		onDone
	}: MoveSheetProps = $props();

	const MODE_LABELS: Record<MoveMode, string> = {
		time: 'Saat',
		pattern: 'Haftalık program',
		transfer: 'Oda / eğitmen',
		weeks: 'Hafta kaydır',
		slots: 'Ders kaydır'
	};
	const SCOPE_LABELS: Record<TransferScope, string> = {
		single: 'Sadece bu randevu',
		from_selected: 'Bu ve sonraki randevular',
		all_from_now: 'Bugünden itibaren tüm randevular'
	};

	// The parent remounts this panel per lesson/trainee ({#key}), so these start from it
	let mode = $state<MoveMode>(untrack(() => (trainee ? 'weeks' : 'time')));
	let pickedScope = $state<TransferScope>(untrack(() => (trainee ? 'from_selected' : 'single')));
	let amount = $state(1);
	let roomId = $state(untrack(() => appointment?.room_id ?? ''));
	let trainerId = $state(untrack(() => appointment?.trainer_id ?? ''));
	let source = $state<'trainee' | 'studio'>('trainee');
	let cause = $state('');
	// Defaults as before the redesign: a single move notifies, a series shift only once a
	// cause is given, a single trainee's move never; ticking or unticking the box wins
	let notifyChoice = $state<boolean | null>(null);
	const notify = $derived(
		notifyChoice ?? (trainee ? false : mode === 'time' ? true : cause.trim().length > 0)
	);
	let submitting = $state(false);

	const modes = $derived<MoveMode[]>(
		trainee ? ['weeks', 'slots'] : ['time', 'transfer', 'weeks', 'slots', 'pattern']
	);
	const changesTime = $derived(mode !== 'transfer');
	const isGroupLesson = $derived(!!appointment?.group_lesson_id);
	const roomNames = $derived(new Map(rooms.map((r) => [r.id, r.name ?? '-'])));

	// "Ders kaydır" and "Haftalık program" always cover the series from this lesson on
	const scope = $derived<TransferScope>(
		mode === 'slots' || mode === 'pattern' ? 'from_selected' : pickedScope
	);

	// Haftalık program: the series' current program, loaded when the mode is first chosen;
	// `targets` holds the new day and hour of each of its slots
	let program = $state<Loadable<WeeklySlot[]>>({ status: 'idle' });
	let targets = $state<WeeklySlot[]>([]);
	async function loadProgram() {
		if (!appointment || program.status === 'ready' || program.status === 'loading') return;
		program = { status: 'loading' };
		const fd = new FormData();
		fd.set('appointmentId', String(appointment.id));
		const result = await postAction<SeriesPatternPayload>('seriesPattern', fd);
		if (result.type === 'success' && result.data) {
			targets = result.data.slots.map((s) => ({ ...s }));
			program = { status: 'ready', value: result.data.slots };
		} else {
			program = { status: 'failed', message: actionResultMessage(result) };
		}
	}

	const slotChanges = $derived(
		program.status === 'ready' ? formatSlotChanges(program.value, targets) : ''
	);

	// A client's own request costs a coordinator a credit and needs 23 h notice
	const creditBlock = $derived.by(() => {
		if (!appointment || mode !== 'time' || source !== 'trainee' || userRole === 'admin') {
			return null;
		}
		if (!appointment.purchase_id || (appointment.reschedule_left ?? 0) <= 0) {
			return 'Bu kaydın değişiklik hakkı kalmamış.';
		}
		const hoursUntil =
			(getAppointmentDateTime(appointment.date, appointment.hour).getTime() - Date.now()) /
			3_600_000;
		return hoursUntil < 23 ? 'Randevuya 23 saatten az kaldı.' : null;
	});

	// What moves where: the preview's input; submitting adds who asked and the message
	function moveForm(): FormData {
		const fd = new FormData();
		if (!appointment) return fd;
		fd.set('appointmentId', String(appointment.id));
		fd.set('kind', mode);
		fd.set('scope', scope);
		fd.set('amount', String(amount));
		if (trainee) fd.set('traineeId', trainee.id);
		if (mode === 'pattern') fd.set('slotChanges', slotChanges);
		if (mode === 'transfer') {
			if (roomId !== appointment.room_id) fd.set('roomId', roomId);
			if (trainerId !== appointment.trainer_id) fd.set('trainerId', trainerId);
		}
		return fd;
	}

	// Server-side dry run of the move, refreshed when the inputs change
	const preview = actionResource<MovePreviewPayload>('previewMove', () => {
		if (!open || !appointment || mode === 'time') return null;
		const unchangedTransfer =
			mode === 'transfer' && roomId === appointment.room_id && trainerId === appointment.trainer_id;
		const invalidAmount =
			(mode === 'weeks' && (!Number.isInteger(amount) || amount === 0)) ||
			(mode === 'slots' && (!Number.isInteger(amount) || amount < 1));
		const unchangedPattern = mode === 'pattern' && slotChanges === '';
		return unchangedTransfer || unchangedPattern || invalidAmount ? null : moveForm();
	});

	const timeReady = $derived(mode === 'time' && pickedSlot !== null);
	const recipients = $derived(
		mode === 'time'
			? (appointment?.trainee_count ?? 0)
			: preview.current.status === 'ready'
				? preview.current.value.recipientCount
				: 0
	);
	const canSubmit = $derived(
		!submitting &&
			!creditBlock &&
			(source === 'trainee' || !changesTime || cause.trim().length > 0) &&
			(mode === 'time'
				? timeReady
				: preview.current.status === 'ready' &&
					preview.current.value.conflicts.length === 0 &&
					preview.current.value.rows.length > 0)
	);

	async function submit() {
		if (!appointment || !canSubmit) return;
		submitting = true;
		const fd = moveForm();
		fd.set('source', source);
		fd.set('cause', cause);
		fd.set('notify', String(notify && changesTime));
		let result;
		if (mode === 'time' && pickedSlot) {
			fd.set('newRoomId', pickedSlot.roomId);
			fd.set('newDate', pickedSlot.date);
			fd.set('newHour', String(pickedSlot.hour));
			result = await postAction('rescheduleAppointment', fd);
		} else {
			result = await postAction('move', fd);
		}
		submitting = false;

		if (result.type === 'success') {
			toast.success(result.data?.message ?? 'Randevu taşındı');
			open = false;
			onDone(result.data?.week);
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
		{#if appointment}
			<Sheet.Header class="border-b pr-12">
				<Sheet.Title>Taşı{trainee ? `: ${trainee.name}` : ''}</Sheet.Title>
				<Sheet.Description>
					{appointment.package_name} · {formatSlotLabel(appointment.date, appointment.hour)}
				</Sheet.Description>
			</Sheet.Header>

			<div class="space-y-6 px-6 py-5">
				<div class="grid gap-2">
					<Label id="move-mode-label">Ne değişsin?</Label>
					<ToggleGroup.Root
						aria-labelledby="move-mode-label"
						type="single"
						variant="outline"
						spacing={1}
						value={mode}
						onValueChange={(v) => {
							if (!v) return;
							mode = v as MoveMode;
							if (mode === 'pattern') loadProgram();
						}}
						class="grid w-full grid-cols-2"
					>
						{#each modes as m (m)}
							<ToggleGroup.Item value={m} class="w-full last:odd:col-span-2">
								{MODE_LABELS[m]}
							</ToggleGroup.Item>
						{/each}
					</ToggleGroup.Root>
				</div>

				{#if mode === 'time'}
					<div class="grid gap-2">
						{#if pickedSlot}
							<div class="flex items-center gap-3 rounded-xl border p-3 text-sm">
								<span>{formatSlotLabel(appointment.date, appointment.hour)}</span>
								<MoveArrow label="yeni saat" class="size-4" />
								<span class="font-medium">{formatSlotLabel(pickedSlot.date, pickedSlot.hour)}</span>
							</div>
							{#if pickedSlot.roomId !== appointment.room_id}
								<p class="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
									Oda: {roomNames.get(appointment.room_id) ?? '-'}
									<MoveArrow label="yeni oda" class="size-3" />
									{roomNames.get(pickedSlot.roomId) ?? '-'}
								</p>
							{/if}
						{/if}
						<Button variant="outline" onclick={onPickTime}>
							<CalendarSearch />
							{pickedSlot ? 'Başka saat seç' : 'Takvimde yeni saati seç'}
						</Button>
						<p class="text-xs text-muted-foreground">
							Sadece bu randevu taşınır. İstediğiniz haftaya geçip boş bir saate tıklayın.
						</p>
					</div>
				{:else if mode === 'transfer'}
					<div class="grid grid-cols-2 gap-3">
						<div class="grid gap-2">
							<Label for="move-room">Oda</Label>
							<NativeSelect class="w-full" id="move-room" bind:value={roomId}>
								{#each rooms as room (room.id)}
									<option value={room.id}>{room.name}</option>
								{/each}
							</NativeSelect>
						</div>
						<div class="grid gap-2">
							<Label for="move-trainer">Eğitmen</Label>
							<NativeSelect class="w-full" id="move-trainer" bind:value={trainerId}>
								{#each trainers as t (t.id)}
									<option value={t.id}>{t.name}</option>
								{/each}
							</NativeSelect>
						</div>
					</div>
				{:else if mode === 'pattern'}
					{#if program.status === 'ready'}
						<SlotChangesField
							from={program.value}
							bind:targets
							legend="Ders saatleri"
							hint={isGroupLesson
								? 'Grup dersinin programı bu randevunun gününden itibaren değişir. Tüm öğrenciler taşınır, yeni haftalar da bu programla açılır.'
								: 'Bu randevudan itibaren her ders aynı haftanın yeni gün ve saatine taşınır. Kayıt yenilenirken de yeni program kullanılır.'}
						/>
					{:else if program.status === 'failed'}
						<LoadError message={program.message} onRetry={loadProgram} />
					{:else}
						<p class="flex items-center gap-2 text-sm text-muted-foreground">
							<LoaderCircle class="size-4 animate-spin" />
							Program yükleniyor…
						</p>
					{/if}
				{:else if mode === 'weeks'}
					<div class="grid gap-2">
						<Label for="move-weeks">Kaç hafta?</Label>
						<Input id="move-weeks" type="number" min={-52} max={52} bind:value={amount} />
						<p class="text-xs text-muted-foreground">
							Her ders aynı gün ve saatte, bu kadar hafta sonraya taşınır. Eksi değer öne alır.
						</p>
					</div>
				{:else}
					<div class="grid gap-2">
						<Label for="move-slots">Kaç ders?</Label>
						<Input id="move-slots" type="number" min={1} max={20} bind:value={amount} />
						<p class="text-xs text-muted-foreground">
							Her ders, haftalık programındaki sıradaki {amount > 1 ? `${amount}.` : ''} derse kayar.
						</p>
					</div>
				{/if}

				{#if !trainee && (mode === 'transfer' || mode === 'weeks')}
					<div class="grid gap-2">
						<Label id="move-scope-label">Hangi randevular?</Label>
						<RadioGroup
							aria-labelledby="move-scope-label"
							value={scope}
							onValueChange={(v) => (pickedScope = v as TransferScope)}
						>
							{#each Object.entries(SCOPE_LABELS) as [value, label] (value)}
								<label class="flex cursor-pointer items-center gap-3 text-sm">
									<RadioGroupItem {value} />
									{label}
								</label>
							{/each}
						</RadioGroup>
					</div>
				{:else if mode === 'weeks' || mode === 'slots'}
					<p class="text-sm text-muted-foreground">
						Bu randevu ve {trainee ? 'öğrencinin ' : ''}sonraki randevuları taşınır.
					</p>
				{/if}

				{#if changesTime}
					<div class="grid gap-2">
						<Label id="move-source-label">Değişikliği kim istedi?</Label>
						<RadioGroup
							aria-labelledby="move-source-label"
							value={source}
							onValueChange={(v) => (source = v as 'trainee' | 'studio')}
						>
							<label class="flex cursor-pointer items-start gap-3 text-sm">
								<RadioGroupItem value="trainee" class="mt-0.5" />
								<span>
									Öğrenci talebi
									{#if mode === 'time' && userRole !== 'admin'}
										<span class="block text-xs text-muted-foreground">
											Değişiklik hakkından 1 düşer. En az 23 saat önceden yapılabilir.
										</span>
									{/if}
								</span>
							</label>
							<label class="flex cursor-pointer items-start gap-3 text-sm">
								<RadioGroupItem value="studio" class="mt-0.5" />
								<span>
									Stüdyo
									<span class="block text-xs text-muted-foreground">
										Eğitmen izni, tatil vb. Değişiklik hakkı kullanılmaz.
									</span>
								</span>
							</label>
						</RadioGroup>
						{#if source === 'studio'}
							<CauseField bind:value={cause} id="cause-move" />
						{/if}
						{#if creditBlock}
							<p class="text-sm text-destructive">{creditBlock}</p>
						{/if}
					</div>

					<label class="flex cursor-pointer items-center gap-3 text-sm">
						<Checkbox bind:checked={() => notify, (checked) => (notifyChoice = checked)} />
						Öğrencilere WhatsApp ile bildir{recipients > 0 ? ` (${recipients} kişi)` : ''}
					</label>
				{/if}

				{#if mode !== 'time'}
					<section aria-live="polite" class="grid gap-2">
						<h3 class="text-sm font-semibold">Önizleme</h3>
						{#if preview.current.status === 'idle'}
							<p class="text-sm text-muted-foreground">
								{mode === 'transfer'
									? 'Yeni oda veya eğitmen seçin.'
									: mode === 'pattern'
										? 'Yeni gün veya saat seçin.'
										: 'Geçerli bir sayı girin.'}
							</p>
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
				{/if}
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
		{/if}
	</Sheet.Content>
</Sheet.Root>
