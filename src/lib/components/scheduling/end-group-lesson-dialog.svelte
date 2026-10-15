<script lang="ts">
	import type { EndGroupLessonDialogProps } from '$lib/types/ComponentProps';
	import Modal from '$lib/components/modal.svelte';
	import ModalFooter from '$lib/components/modal-footer.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { toast } from 'svelte-sonner';
	import { untrack } from 'svelte';
	import { formatDisplayDate } from '$lib/utils/date-utils';
	import { actionResultMessage, postAction } from '$lib/utils/api-client';

	let { open = $bindable(), lesson, onDone }: EndGroupLessonDialogProps = $props();

	let endDate = $state(untrack(() => lesson.minEndDate));
	let submitting = $state(false);

	const valid = $derived(endDate >= lesson.minEndDate);

	async function submit() {
		if (!valid) return;
		submitting = true;
		const fd = new FormData();
		fd.set('endDate', endDate);
		const result = await postAction('end', fd);
		submitting = false;
		if (result.type === 'success') {
			toast.success(result.data?.message ?? 'Grup dersi sonlandırıldı');
			open = false;
			onDone();
		} else {
			toast.error(actionResultMessage(result));
		}
	}
</script>

<Modal bind:open title="Grup dersini sonlandır" size="md">
	<div class="space-y-4 text-sm">
		<p>
			<span class="font-medium">{lesson.packageName}</span>
			<span class="block text-muted-foreground">{lesson.roomName} · {lesson.trainerName}</span>
		</p>
		<div class="grid gap-2 sm:max-w-56">
			<Label for="end-date">Bitiş tarihi</Label>
			<Input id="end-date" type="date" min={lesson.minEndDate} bind:value={endDate} />
		</div>
		<p class="rounded-md bg-muted p-3">
			Bu tarihten sonra ders yapılmaz, sonraki boş randevular silinir. En erken {formatDisplayDate(
				lesson.minEndDate
			)}: {lesson.lastEnrolledDate
				? `son öğrencili randevu ${formatDisplayDate(lesson.lastEnrolledDate)}.`
				: 'öğrencisi olan randevu yok.'}
		</p>
		{#if !valid}
			<p class="text-destructive">
				Bitiş tarihi {formatDisplayDate(lesson.minEndDate)} veya sonrası olmalı.
			</p>
		{/if}
	</div>

	<ModalFooter>
		<Button variant="outline" onclick={() => (open = false)}>Vazgeç</Button>
		<Button variant="destructive" onclick={submit} disabled={!valid || submitting}>
			{#if submitting}
				<LoaderCircle class="animate-spin" />
			{/if}
			Grup dersini sonlandır
		</Button>
	</ModalFooter>
</Modal>
