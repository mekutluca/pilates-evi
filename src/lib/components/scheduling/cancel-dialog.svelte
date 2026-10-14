<script lang="ts">
	import type { CancelDialogProps } from '$lib/types/ComponentProps';
	import type { CancelTraineeAction } from '$lib/types/Schedule';
	import Modal from '$lib/components/modal.svelte';
	import ModalFooter from '$lib/components/modal-footer.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group/index.js';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { toast } from 'svelte-sonner';
	import { formatSlotLabel } from '$lib/utils/date-utils';
	import { actionResultMessage, postAction } from '$lib/utils/api-client';

	let { open = $bindable(), appointment, onDone }: CancelDialogProps = $props();

	let traineeAction = $state<CancelTraineeAction>('shift');
	// Cancelling never messaged clients before; it stays opt-in
	let notify = $state(false);
	let cause = $state('');
	let submitting = $state(false);

	const traineeCount = $derived(appointment?.trainee_count ?? 0);
	const consequence = $derived(
		traineeCount === 0
			? 'Boş randevu silinir.'
			: traineeAction === 'shift'
				? 'Randevu silinir; öğrencilerin bu dersi ve sonraki dersleri bir sonraki ders saatine kayar. Ders sayıları değişmez.'
				: 'Randevu silinir; öğrenciler bu dersi kaybeder. Diğer dersleri değişmez.'
	);
	const canNotify = $derived(traineeCount > 0 && traineeAction === 'shift');
	const canSubmit = $derived(!submitting && (!canNotify || !notify || cause.trim().length > 0));

	async function submit() {
		if (!appointment || !canSubmit) return;
		submitting = true;
		const fd = new FormData();
		fd.set('appointmentId', String(appointment.id));
		if (traineeCount > 0) fd.set('traineeAction', traineeAction);
		fd.set('notify', String(canNotify && notify));
		fd.set('cause', cause);
		const result = await postAction('cancelAppointment', fd);
		submitting = false;
		if (result.type === 'success') {
			toast.success(result.data?.message ?? 'Randevu iptal edildi');
			open = false;
			onDone();
		} else {
			toast.error(actionResultMessage(result));
		}
	}
</script>

<Modal bind:open title="Randevuyu iptal et" size="md">
	{#if appointment}
		<div class="space-y-4">
			<p class="text-sm">
				<span class="font-medium">{appointment.package_name}</span>
				· {formatSlotLabel(appointment.date, appointment.hour)}
				<span class="block text-muted-foreground">
					{appointment.room_name} · {appointment.trainer_name}
					{#if traineeCount > 0}
						· {appointment.trainee_names?.join(', ')}
					{/if}
				</span>
			</p>

			{#if traineeCount > 0}
				<div class="grid gap-2">
					<Label>Öğrencilerin dersi ne olsun?</Label>
					<RadioGroup
						value={traineeAction}
						onValueChange={(v) => (traineeAction = v as CancelTraineeAction)}
					>
						<label class="flex cursor-pointer items-start gap-3 text-sm">
							<RadioGroupItem value="shift" class="mt-0.5" />
							<span>
								Bir sonraki derse kaydır
								<span class="block text-xs text-muted-foreground">Öğrenci dersini kaybetmez.</span>
							</span>
						</label>
						<label class="flex cursor-pointer items-start gap-3 text-sm">
							<RadioGroupItem value="remove" class="mt-0.5" />
							<span>
								Ders hakkı düşsün
								<span class="block text-xs text-muted-foreground">Bu ders yapılmamış sayılır.</span>
							</span>
						</label>
					</RadioGroup>
				</div>
			{/if}

			<p class="rounded-md bg-muted p-3 text-sm">{consequence}</p>

			{#if canNotify}
				<label class="flex cursor-pointer items-center gap-3 text-sm">
					<Checkbox bind:checked={notify} />
					Öğrencilere WhatsApp ile bildir ({traineeCount} kişi)
				</label>
				{#if notify}
					<Textarea
						bind:value={cause}
						rows={2}
						placeholder="Sebep (mesajda yer alır)"
						aria-label="Sebep"
					/>
				{/if}
			{/if}
		</div>

		<ModalFooter>
			<Button variant="outline" onclick={() => (open = false)}>Vazgeç</Button>
			<Button variant="destructive" onclick={submit} disabled={!canSubmit}>
				{#if submitting}
					<LoaderCircle class="animate-spin" />
				{/if}
				Randevuyu iptal et
			</Button>
		</ModalFooter>
	{/if}
</Modal>
