<script lang="ts">
	import type { ActionResult } from '@sveltejs/kit';
	import PageHeader from '$lib/components/page-header.svelte';
	import Modal from '$lib/components/modal.svelte';
	import ModalFooter from '$lib/components/modal-footer.svelte';
	import DatePicker from '$lib/components/date-picker.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import CalendarX2 from '@lucide/svelte/icons/calendar-x-2';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import {
		formatDateForDB,
		formatTurkishDate,
		formatShortTurkishDateTime,
		getTomorrow
	} from '$lib/utils/date-utils';
	import { getActionErrorMessage } from '$lib/utils/form-utils';
	import type { DayCancellationConflict } from '$lib/types/Operation';
	import { clickOutside } from '$lib/utils/click-outside';

	// A day cancellation only makes sense for future days — shifting in-progress or past sessions
	// is meaningless, so the picker starts on (and is bounded at) tomorrow.
	const minSelectableDate = getTomorrow();

	let selectedDate = $state(getTomorrow());
	let reason = $state('');
	let showDatePicker = $state(false);
	let showConfirm = $state(false);
	let formLoading = $state(false);

	let conflicts = $state<DayCancellationConflict[]>([]);
	let warnings = $state<string[]>([]);

	let dateForDB = $derived(formatDateForDB(selectedDate));
	let formattedDate = $derived(formatTurkishDate(dateForDB));
	let conflictIds = $derived(conflicts.map((c) => c.appointmentId).join(','));

	function handleDateSelect(date: Date) {
		selectedDate = date;
		showDatePicker = false;
	}

	function handleSubmit() {
		formLoading = true;
		conflicts = [];
		warnings = [];
		return async ({ result, update }: { result: ActionResult; update: () => Promise<void> }) => {
			formLoading = false;
			if (result.type === 'success') {
				const data = result.data as
					| { message?: string; conflicts?: DayCancellationConflict[]; warnings?: string[] }
					| undefined;
				toast.success(data?.message || 'Gün iptal edildi');
				conflicts = data?.conflicts ?? [];
				warnings = data?.warnings ?? [];
				showConfirm = false;
			} else if (result.type === 'failure') {
				toast.error(getActionErrorMessage(result));
			}
			await update();
		};
	}
</script>

<svelte:head>
	<title>Günü İptal Et · Pilates Evi</title>
</svelte:head>

<div class="space-y-6 p-6">
	<div>
		<Button variant="ghost" size="sm" href="/operations" class="mb-2 -ml-2">
			<ChevronLeft size={16} />
			Operasyonlar
		</Button>
		<PageHeader
			title="Günü İptal Et"
			subtitle="Seçilen gündeki tüm randevular bir sonraki uygun zamana kaydırılır ve öğrencilere bilgi mesajı gönderilir."
		/>
	</div>

	<Card.Root class="overflow-visible">
		<Card.Content class="space-y-6">
			<div class="grid gap-2">
				<Label class="font-semibold">Gün</Label>
				<div class="relative w-fit" use:clickOutside={() => (showDatePicker = false)}>
					<Button variant="outline" onclick={() => (showDatePicker = !showDatePicker)}>
						<CalendarIcon size={16} />
						{formattedDate}
					</Button>
					{#if showDatePicker}
						<div class="absolute top-full left-0 z-50 mt-2">
							<DatePicker
								value={selectedDate}
								onDateSelect={handleDateSelect}
								onClose={() => (showDatePicker = false)}
								minDate={minSelectableDate}
							/>
						</div>
					{/if}
				</div>
			</div>

			<div class="grid gap-2">
				<Label for="reason" class="font-semibold">İptal Sebebi</Label>
				<Textarea
					id="reason"
					bind:value={reason}
					rows={3}
					required
					placeholder="Örn: 23 Nisan tatili"
				/>
				<p class="text-xs text-muted-foreground">
					Bu sebep, kaydırılan derslerle ilgili öğrencilere gönderilen mesajda yer alır.
				</p>
			</div>

			<div class="flex justify-end">
				<Button
					variant="destructive"
					disabled={!reason.trim()}
					onclick={() => (showConfirm = true)}
				>
					<CalendarX2 size={16} />
					Günü İptal Et
				</Button>
			</div>
		</Card.Content>
	</Card.Root>

	{#if warnings.length > 0}
		<Alert.Root variant="destructive">
			<TriangleAlert size={16} />
			<Alert.Description>
				<div class="font-medium">Bazı randevular işlenemedi:</div>
				<ul class="mt-1 list-inside list-disc text-sm">
					{#each warnings as warning (warning)}
						<li>{warning}</li>
					{/each}
				</ul>
			</Alert.Description>
		</Alert.Root>
	{/if}

	{#if conflicts.length > 0}
		<Card.Root class="border-warning/40">
			<Card.Header>
				<Card.Title class="flex items-center gap-2 text-warning">
					<TriangleAlert size={18} />
					Çakışan Randevular ({conflicts.length})
				</Card.Title>
			</Card.Header>
			<Card.Content class="space-y-2">
				<p class="text-sm text-muted-foreground">
					Aşağıdaki randevular hedef zaman diliminde başka bir randevuyla çakıştığı için
					kaydırılamadı.
				</p>
				{#each conflicts as conflict (conflict.appointmentId)}
					<div class="rounded border p-3 text-sm">
						<div class="font-medium">
							{formatShortTurkishDateTime(conflict.date, conflict.hour)}
							{#if conflict.packageName}— {conflict.packageName}{/if}
						</div>
						<div class="text-muted-foreground">
							{conflict.roomName} · {conflict.trainerName} · {conflict.reason}
						</div>
						{#if conflict.traineeNames.length > 0}
							<div class="mt-2 flex flex-wrap gap-1">
								{#each conflict.traineeNames as traineeName (traineeName)}
									<Badge variant="secondary">{traineeName}</Badge>
								{/each}
							</div>
						{/if}
					</div>
				{/each}

				<div class="space-y-2 border-t pt-3">
					<p class="text-sm text-muted-foreground">Bu randevuları nasıl kaydıralım?</p>
					<div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
						<form method="POST" action="?/cancelDay" use:enhance={handleSubmit}>
							<input type="hidden" name="date" value={dateForDB} />
							<input type="hidden" name="reason" value={reason} />
							<input type="hidden" name="strategy" value="closest" />
							<input type="hidden" name="appointmentIds" value={conflictIds} />
							<Button type="submit" class="w-full sm:w-auto" disabled={formLoading}>
								{#if formLoading}
									<LoaderCircle size={16} class="animate-spin" />
								{:else}
									En yakın uygun randevuya kaydır
								{/if}
							</Button>
						</form>
						<form method="POST" action="?/cancelDay" use:enhance={handleSubmit}>
							<input type="hidden" name="date" value={dateForDB} />
							<input type="hidden" name="reason" value={reason} />
							<input type="hidden" name="strategy" value="force" />
							<input type="hidden" name="appointmentIds" value={conflictIds} />
							<Button
								type="submit"
								variant="outline"
								class="w-full sm:w-auto"
								disabled={formLoading}
							>
								Çakışmaya rağmen kaydır
							</Button>
						</form>
					</div>
				</div>
			</Card.Content>
		</Card.Root>
	{/if}
</div>

<Modal bind:open={showConfirm} title="Günü İptal Et" size="md">
	<div class="space-y-4">
		<Alert.Root variant="destructive">
			<TriangleAlert size={16} />
			<Alert.Description>
				Bu gündeki tüm dersler bir sonraki uygun zamana kaydırılacak ve öğrencilere bilgi mesajı
				gönderilecek.
			</Alert.Description>
		</Alert.Root>

		<div class="rounded bg-muted p-4 text-sm">
			<div><strong>Gün:</strong> {formattedDate}</div>
			<div class="mt-1"><strong>Sebep:</strong> {reason}</div>
		</div>

		<form method="POST" action="?/cancelDay" use:enhance={handleSubmit}>
			<input type="hidden" name="date" value={dateForDB} />
			<input type="hidden" name="reason" value={reason} />
			<ModalFooter>
				<Button type="button" variant="outline" onclick={() => (showConfirm = false)}>Vazgeç</Button
				>
				<Button type="submit" variant="destructive" disabled={formLoading}>
					{#if formLoading}
						<LoaderCircle size={16} class="animate-spin" />
					{:else}
						<CalendarX2 size={16} />
						Onayla
					{/if}
				</Button>
			</ModalFooter>
		</form>
	</div>
</Modal>
