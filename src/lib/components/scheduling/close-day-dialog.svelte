<script lang="ts">
	import type { CloseDayDialogProps } from '$lib/types/ComponentProps';
	import type { CloseDayPayload, CloseDayPreviewPayload } from '$lib/types/Api';
	import type { CloseDayOutcome, DayCancellationConflict } from '$lib/types/Operation';
	import Modal from '$lib/components/modal.svelte';
	import ModalFooter from '$lib/components/modal-footer.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import ArrowRight from '@lucide/svelte/icons/arrow-right';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { toast } from 'svelte-sonner';
	import { getTimeString } from '$lib/types/Schedule';
	import { formatSlotLabel, formatTurkishDate } from '$lib/utils/date-utils';
	import { actionResultMessage, postAction } from '$lib/utils/api-client';
	import { actionResource } from '$lib/utils/action-resource.svelte';

	let { open = $bindable(), date, onDone }: CloseDayDialogProps = $props();

	const OUTCOME_LABELS: Record<CloseDayOutcome, string> = {
		shift: 'Kayacak',
		remove_empty: 'Boş, silinecek',
		conflict: 'Çakışma',
		error: 'Kaydırılamaz'
	};

	let cause = $state('');
	let notify = $state(true);
	let submitting = $state(false);
	// Appointments left over after a first pass, offered the closest free slot
	let leftovers = $state<DayCancellationConflict[]>([]);

	// What closing the day would do, loaded when the dialog opens
	const previewState = actionResource<CloseDayPreviewPayload>(
		'previewCloseDay',
		() => {
			if (!open || !date) return null;
			const fd = new FormData();
			fd.set('date', date);
			return fd;
		},
		0
	);

	const canSubmit = $derived(
		!submitting && previewState.current.status === 'ready' && cause.trim().length > 0
	);

	async function submit(strategy: 'shift' | 'closest') {
		if (!date || !canSubmit) return;
		submitting = true;
		const fd = new FormData();
		fd.set('date', date);
		fd.set('cause', cause);
		fd.set('notify', String(notify));
		fd.set('strategy', strategy);
		if (strategy === 'closest') {
			fd.set('appointmentIds', leftovers.map((c) => c.appointmentId).join(','));
		}
		const result = await postAction<CloseDayPayload>('closeDay', fd);
		submitting = false;
		if (result.type !== 'success') {
			toast.error(actionResultMessage(result));
			return;
		}
		toast.success(result.data?.message ?? 'Gün kapatıldı');
		result.data?.warnings.forEach((warning) => toast.warning(warning));
		leftovers = result.data?.conflicts ?? [];
		if (leftovers.length === 0) {
			open = false;
			onDone();
		}
	}
</script>

<Modal bind:open title="Günü kapat" size="lg">
	{#if date}
		<div class="space-y-4">
			<p class="text-sm">
				<span class="font-medium">{formatTurkishDate(date)}</span> kapatılır: dolu dersler serinin bir
				sonraki ders saatine kayar, boş saatler silinir. Öğrencilerin ders sayısı değişmez.
			</p>

			{#if leftovers.length > 0}
				<div class="rounded-md border border-destructive/40 p-3 text-sm">
					<p class="font-medium">{leftovers.length} ders çakışma nedeniyle kaydırılamadı</p>
					<ul class="mt-2 space-y-1 text-muted-foreground">
						{#each leftovers as conflict (conflict.appointmentId)}
							<li>
								{getTimeString(conflict.hour)} · {conflict.roomName} · {conflict.packageName}: {conflict.reason}
							</li>
						{/each}
					</ul>
					<p class="mt-2">Bunları serinin en yakın boş saatine kaydırabilirsiniz.</p>
				</div>
			{:else if previewState.current.status === 'idle' || previewState.current.status === 'loading'}
				<p class="flex items-center gap-2 text-sm text-muted-foreground">
					<LoaderCircle class="size-4 animate-spin" />
					Günün dersleri hesaplanıyor…
				</p>
			{:else if previewState.current.status === 'failed'}
				<p class="text-sm text-destructive">{previewState.current.message}</p>
			{:else if previewState.current.value.preview.rows.length === 0}
				<p class="rounded-md bg-muted p-3 text-sm">Bu günde yaklaşan ders yok.</p>
			{:else}
				<ul class="max-h-72 divide-y overflow-y-auto rounded-md border text-sm">
					{#each previewState.current.value.preview.rows as row (row.appointmentId)}
						<li class="grid gap-1 px-3 py-2">
							<div class="flex flex-wrap items-center gap-2">
								<span class="font-medium tabular-nums">{getTimeString(row.hour)}</span>
								<span>{row.packageName}</span>
								<span class="text-muted-foreground">· {row.roomName} · {row.trainerName}</span>
								<Badge
									variant={row.outcome === 'conflict' || row.outcome === 'error'
										? 'destructive'
										: 'outline'}
									class="ml-auto"
								>
									{OUTCOME_LABELS[row.outcome]}
								</Badge>
							</div>
							{#if row.traineeNames.length > 0}
								<div class="text-xs text-muted-foreground">{row.traineeNames.join(', ')}</div>
							{/if}
							{#if row.outcome === 'shift' && row.newDate && row.newHour !== undefined}
								<div class="flex items-center gap-1 text-xs">
									<ArrowRight class="size-3 text-muted-foreground" />
									{formatSlotLabel(row.newDate, row.newHour)}
								</div>
							{:else if row.note}
								<div class="text-xs text-destructive">{row.note}</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}

			{#if previewState.current.status === 'ready' && previewState.current.value.preview.rows.length > 0}
				<Textarea
					bind:value={cause}
					rows={2}
					placeholder="Sebep, ör. 29 Ekim tatili (mesajda yer alır)"
					aria-label="Sebep"
				/>
				<label class="flex cursor-pointer items-center gap-3 text-sm">
					<Checkbox bind:checked={notify} />
					Öğrencilere WhatsApp ile bildir ({previewState.current.value.preview.recipientCount} kişi)
				</label>
			{/if}
		</div>

		<ModalFooter>
			<Button variant="outline" onclick={() => (open = false)}>Vazgeç</Button>
			{#if leftovers.length > 0}
				<Button onclick={() => submit('closest')} disabled={!canSubmit}>
					{#if submitting}<LoaderCircle class="animate-spin" />{/if}
					En yakın boş saate kaydır
				</Button>
			{:else}
				<Button
					variant="destructive"
					onclick={() => submit('shift')}
					disabled={!canSubmit ||
						(previewState.current.status === 'ready' &&
							previewState.current.value.preview.rows.length === 0)}
				>
					{#if submitting}<LoaderCircle class="animate-spin" />{/if}
					Günü kapat
				</Button>
			{/if}
		</ModalFooter>
	{/if}
</Modal>
