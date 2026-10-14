<script lang="ts">
	import type { MoveSheetProps } from '$lib/types/ComponentProps';
	import type { MovePreviewPayload } from '$lib/types/Api';
	import type { MoveMode, TransferScope } from '$lib/types/Transfer';
	import ConflictList from './conflict-list.svelte';
	import MovePreviewList from './move-preview-list.svelte';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group/index.js';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import CalendarSearch from '@lucide/svelte/icons/calendar-search';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { toast } from 'svelte-sonner';
	import { untrack } from 'svelte';
	import { formatSlotLabel, getAppointmentDateTime } from '$lib/utils/date-utils';
	import { actionResultMessage, postAction } from '$lib/utils/api-client';
	import { actionResource } from '$lib/utils/action-resource.svelte';

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
	// Moving a single trainee never messaged anyone before; keep that the default
	let notify = $state(untrack(() => !trainee));
	let submitting = $state(false);

	const modes = $derived<MoveMode[]>(
		trainee ? ['weeks', 'slots'] : ['time', 'transfer', 'weeks', 'slots']
	);
	const changesTime = $derived(mode !== 'transfer');
	const roomNames = $derived(new Map(rooms.map((r) => [r.id, r.name ?? '-'])));

	// "Ders kaydır" always walks the series from this lesson on
	const scope = $derived<TransferScope>(mode === 'slots' ? 'from_selected' : pickedScope);

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
		return unchangedTransfer || invalidAmount ? null : moveForm();
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
	<Sheet.Content side="right" class="w-full gap-0 overflow-y-auto sm:max-w-lg">
		{#if appointment}
			<Sheet.Header class="border-b">
				<Sheet.Title>Taşı{trainee ? `: ${trainee.name}` : ''}</Sheet.Title>
				<Sheet.Description>
					{appointment.package_name} · {formatSlotLabel(appointment.date, appointment.hour)}
				</Sheet.Description>
			</Sheet.Header>

			<div class="space-y-6 p-4">
				<div class="grid gap-2">
					<Label>Ne değişsin?</Label>
					<ToggleGroup.Root
						type="single"
						variant="outline"
						value={mode}
						onValueChange={(v) => v && (mode = v as MoveMode)}
						class="w-full"
					>
						{#each modes as m (m)}
							<ToggleGroup.Item value={m} class="flex-1">{MODE_LABELS[m]}</ToggleGroup.Item>
						{/each}
					</ToggleGroup.Root>
				</div>

				{#if mode === 'time'}
					<div class="grid gap-2">
						{#if pickedSlot}
							<div class="flex items-center gap-3 rounded-md border p-3 text-sm">
								<span>{formatSlotLabel(appointment.date, appointment.hour)}</span>
								<ArrowRight class="size-4 text-muted-foreground" />
								<span class="font-medium">{formatSlotLabel(pickedSlot.date, pickedSlot.hour)}</span>
							</div>
							{#if pickedSlot.roomId !== appointment.room_id}
								<p class="text-xs text-muted-foreground">
									Oda: {roomNames.get(appointment.room_id) ?? '-'} → {roomNames.get(
										pickedSlot.roomId
									) ?? '-'}
								</p>
							{/if}
						{/if}
						<Button variant="outline" onclick={onPickTime}>
							<CalendarSearch />
							{pickedSlot ? 'Başka saat seç' : 'Takvimde yeni saati seç'}
						</Button>
						<p class="text-xs text-muted-foreground">
							Sadece bu randevu taşınır; istediğiniz haftaya geçip boş bir saate tıklayın.
						</p>
					</div>
				{:else if mode === 'transfer'}
					<div class="grid grid-cols-2 gap-3">
						<div class="grid gap-2">
							<Label for="move-room">Oda</Label>
							<NativeSelect id="move-room" bind:value={roomId}>
								{#each rooms as room (room.id)}
									<option value={room.id}>{room.name}</option>
								{/each}
							</NativeSelect>
						</div>
						<div class="grid gap-2">
							<Label for="move-trainer">Eğitmen</Label>
							<NativeSelect id="move-trainer" bind:value={trainerId}>
								{#each trainers as t (t.id)}
									<option value={t.id}>{t.name}</option>
								{/each}
							</NativeSelect>
						</div>
					</div>
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
						<Label>Hangi randevular?</Label>
						<RadioGroup value={scope} onValueChange={(v) => (pickedScope = v as TransferScope)}>
							{#each Object.entries(SCOPE_LABELS) as [value, label] (value)}
								<label class="flex cursor-pointer items-center gap-3 text-sm">
									<RadioGroupItem {value} />
									{label}
								</label>
							{/each}
						</RadioGroup>
					</div>
				{:else if mode !== 'time'}
					<p class="text-sm text-muted-foreground">
						Bu randevu ve {trainee ? 'öğrencinin ' : ''}sonraki randevuları taşınır.
					</p>
				{/if}

				{#if changesTime}
					<div class="grid gap-2">
						<Label>Değişikliği kim istedi?</Label>
						<RadioGroup value={source} onValueChange={(v) => (source = v as 'trainee' | 'studio')}>
							<label class="flex cursor-pointer items-start gap-3 text-sm">
								<RadioGroupItem value="trainee" class="mt-0.5" />
								<span>
									Öğrenci talebi
									{#if mode === 'time' && userRole !== 'admin'}
										<span class="block text-xs text-muted-foreground">
											Kaydın değişiklik hakkından 1 düşer; en az 23 saat önceden yapılır.
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
							<Textarea
								bind:value={cause}
								rows={2}
								placeholder="Sebep (öğrencilere gönderilen mesajda yer alır)"
								aria-label="Sebep"
							/>
						{/if}
						{#if creditBlock}
							<p class="text-sm text-destructive">{creditBlock}</p>
						{/if}
					</div>

					<label class="flex cursor-pointer items-center gap-3 text-sm">
						<Checkbox bind:checked={notify} />
						Öğrencilere WhatsApp ile bildir{recipients > 0 ? ` (${recipients} kişi)` : ''}
					</label>
				{/if}

				{#if mode !== 'time'}
					<section aria-live="polite" class="grid gap-2">
						<h3 class="text-sm font-semibold">Önizleme</h3>
						{#if preview.current.status === 'idle'}
							<p class="text-sm text-muted-foreground">
								{mode === 'transfer' ? 'Yeni oda veya eğitmen seçin.' : 'Geçerli bir sayı girin.'}
							</p>
						{:else if preview.current.status === 'loading'}
							<p class="flex items-center gap-2 text-sm text-muted-foreground">
								<LoaderCircle class="size-4 animate-spin" />
								Kontrol ediliyor…
							</p>
						{:else if preview.current.status === 'failed'}
							<p class="text-sm text-destructive">{preview.current.message}</p>
						{:else}
							{#if preview.current.value.conflicts.length > 0}
								<ConflictList
									conflicts={preview.current.value.conflicts}
									title={`${preview.current.value.conflicts.length} çakışma var; taşınamaz.`}
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

			<Sheet.Footer class="flex-row justify-end gap-2 border-t">
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
