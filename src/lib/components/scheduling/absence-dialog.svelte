<script lang="ts">
	import type { AbsenceDialogProps } from '$lib/types/ComponentProps';
	import type { AbsenceOutcome } from '$lib/types/Schedule';
	import type { MakeupCandidatesPayload, ShiftPreviewPayload } from '$lib/types/Api';
	import Modal from '$lib/components/modal.svelte';
	import ModalFooter from '$lib/components/modal-footer.svelte';
	import MoveArrow from './move-arrow.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { toast } from 'svelte-sonner';
	import { actionResource } from '$lib/utils/action-resource.svelte';
	import { actionResultMessage, postAction } from '$lib/utils/api-client';
	import { asAbsenceOutcome, creditLabel } from '$lib/utils/attendance-utils';
	import { formatSlotLabel } from '$lib/utils/date-utils';

	let { open = $bindable(), target, userRole, onDone }: AbsenceDialogProps = $props();

	const isAdmin = $derived(userRole === 'admin');
	const isMove = $derived(target?.mode === 'move');

	// The decision: a make-up (group kayıtlar), a shift, or burning the lesson
	let outcome = $state<AbsenceOutcome>('makeup');
	let targetAppointmentId = $state<number | null>(null);
	// A replacement is agreed with the client; the message is on by default
	let notify = $state(true);
	let submitting = $state(false);

	// Coordinators stop at zero; admins never spend a credit
	const makeupBlocked = $derived(!isAdmin && (target?.makeupLeft ?? 0) <= 0);
	const shiftBlocked = $derived(!isAdmin && (target?.rescheduleLeft ?? 0) <= 0);

	function enrollmentForm(): FormData {
		const fd = new FormData();
		fd.set('enrollmentId', String(target?.enrollmentId ?? ''));
		return fd;
	}

	// Loaded for the choice on screen: where a shift would go, which sessions have room
	const shiftPlan = actionResource<ShiftPreviewPayload>('previewShift', () =>
		open && target && !isMove && outcome === 'shifted' ? enrollmentForm() : null
	);
	const candidates = actionResource<MakeupCandidatesPayload>('makeupCandidates', () =>
		open && target && (isMove || outcome === 'makeup') ? enrollmentForm() : null
	);

	// A fresh target starts on its first allowed choice
	$effect(() => {
		if (!open || !target) return;
		targetAppointmentId = null;
		notify = true;
		outcome =
			isMove || (target.isGroup && !makeupBlocked) ? 'makeup' : shiftBlocked ? 'burned' : 'shifted';
	});

	const canSubmit = $derived.by(() => {
		if (submitting || !target) return false;
		if (outcome === 'makeup') return targetAppointmentId !== null && !makeupBlocked;
		if (outcome === 'shifted') return shiftPlan.current.status === 'ready' && !shiftBlocked;
		return true;
	});

	async function submit() {
		if (!target || !canSubmit) return;
		submitting = true;
		const fd = enrollmentForm();
		fd.set('notify', String(notify && outcome !== 'burned'));
		if (isMove) {
			fd.set('targetAppointmentId', String(targetAppointmentId));
		} else {
			fd.set('outcome', outcome);
			if (targetAppointmentId !== null) fd.set('targetAppointmentId', String(targetAppointmentId));
		}
		const result = await postAction(isMove ? 'moveMakeup' : 'resolveAbsence', fd);
		submitting = false;
		if (result.type === 'success') {
			toast.success(result.data?.message ?? 'Kaydedildi');
			open = false;
			onDone(result.data?.week);
		} else {
			toast.error(actionResultMessage(result));
		}
	}
</script>

{#snippet sessionList()}
	{#if candidates.current.status === 'loading' || candidates.current.status === 'idle'}
		<div class="grid gap-2" role="status" aria-label="Dersler yükleniyor">
			<Skeleton class="h-10" />
			<Skeleton class="h-10" />
			<Skeleton class="h-10" />
		</div>
	{:else if candidates.current.status === 'failed'}
		<p class="text-sm text-destructive">{candidates.current.message}</p>
	{:else if candidates.current.value.candidates.length === 0}
		<p class="text-sm text-muted-foreground">
			Önümüzdeki dört haftada bu paketin yeri olan bir grup dersi yok.
		</p>
	{:else}
		{@const list = candidates.current.value.candidates}
		<RadioGroup
			aria-label="Telafi dersi"
			value={targetAppointmentId === null ? '' : String(targetAppointmentId)}
			onValueChange={(v) => (targetAppointmentId = v ? Number(v) : null)}
			class="max-h-64 gap-0 divide-y overflow-y-auto rounded-xl border"
		>
			{#each list as session (session.appointmentId)}
				<label class="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/60">
					<RadioGroupItem value={String(session.appointmentId)} />
					<span class="min-w-0 flex-1">
						<span class="block font-medium tabular-nums">
							{formatSlotLabel(session.date, session.hour)}
						</span>
						<span class="block truncate text-muted-foreground">
							{session.trainerName} · {session.roomName}
						</span>
					</span>
					<span class="shrink-0 text-xs text-muted-foreground tabular-nums">
						{session.taken}/{session.capacity}
					</span>
				</label>
			{/each}
		</RadioGroup>
	{/if}
{/snippet}

<Modal bind:open title={isMove ? 'Telafi dersini taşı' : 'Devamsızlık'} size="md">
	{#if target}
		<div class="space-y-4">
			<p class="text-sm">
				<span class="font-medium">{target.traineeName}</span>
				· {target.packageName}
				<span class="block text-muted-foreground">
					{isMove ? 'Telafi dersi' : 'Gelmediği ders'}: {formatSlotLabel(
						target.lesson.date,
						target.lesson.hour
					)}
				</span>
			</p>

			{#if isMove}
				{@render sessionList()}
			{:else}
				<div class="grid gap-2">
					<Label id="absence-outcome-label">Ne olsun?</Label>
					<RadioGroup
						aria-labelledby="absence-outcome-label"
						value={outcome}
						onValueChange={(v) => (outcome = asAbsenceOutcome(v) ?? 'burned')}
					>
						{#if target.isGroup}
							<label class="flex cursor-pointer items-start gap-3 text-sm">
								<RadioGroupItem value="makeup" class="mt-0.5" disabled={makeupBlocked} />
								<span class={makeupBlocked ? 'text-muted-foreground' : ''}>
									Telafi dersi
									<span class="block text-xs text-muted-foreground">
										Aynı paketin başka bir grup dersine katılır. Telafi hakkı: {creditLabel(
											target.makeupLeft
										)}{isAdmin ? ' (yönetici: hak düşmez)' : ''}
									</span>
								</span>
							</label>
						{/if}
						<label class="flex cursor-pointer items-start gap-3 text-sm">
							<RadioGroupItem value="shifted" class="mt-0.5" disabled={shiftBlocked} />
							<span class={shiftBlocked ? 'text-muted-foreground' : ''}>
								Kaydır
								<span class="block text-xs text-muted-foreground">
									Kaydın sonuna bir ders eklenir. Değişiklik hakkı: {creditLabel(
										target.rescheduleLeft
									)}{isAdmin ? ' (yönetici: hak düşmez)' : ''}
								</span>
							</span>
						</label>
						<label class="flex cursor-pointer items-start gap-3 text-sm">
							<RadioGroupItem value="burned" class="mt-0.5" />
							<span>
								Yak
								<span class="block text-xs text-muted-foreground">Öğrenci bu dersi kaybeder.</span>
							</span>
						</label>
					</RadioGroup>
				</div>

				{#if outcome === 'makeup'}
					{@render sessionList()}
				{:else if outcome === 'shifted'}
					<div class="rounded-md bg-muted p-3 text-sm" aria-live="polite">
						{#if shiftPlan.current.status === 'loading' || shiftPlan.current.status === 'idle'}
							<Skeleton class="h-5 w-48" />
						{:else if shiftPlan.current.status === 'failed'}
							<span class="text-destructive">{shiftPlan.current.message}</span>
						{:else}
							{@const plan = shiftPlan.current.value.plan}
							<span class="flex flex-wrap items-center gap-2">
								<span>{formatSlotLabel(target.lesson.date, target.lesson.hour)}</span>
								<MoveArrow label="yeni ders" />
								<span class="font-medium">{formatSlotLabel(plan.date, plan.hour)}</span>
							</span>
							<span class="block text-xs text-muted-foreground">
								{plan.kind === 'group'
									? 'Grup dersinin sıradaki seansı'
									: 'Kaydın düzenindeki ilk boş saat'}
								· {plan.trainerName} · {plan.roomName}
							</span>
						{/if}
					</div>
				{:else}
					<p class="rounded-md bg-muted p-3 text-sm">Ders hakkı düşer, başka bir şey değişmez.</p>
				{/if}
			{/if}

			{#if isMove || outcome !== 'burned'}
				<label class="flex cursor-pointer items-center gap-3 text-sm">
					<Checkbox bind:checked={notify} />
					{target.traineeName} adlı öğrenciye WhatsApp ile bildir
				</label>
			{/if}
		</div>

		<ModalFooter>
			<Button variant="outline" onclick={() => (open = false)}>Vazgeç</Button>
			<Button onclick={submit} disabled={!canSubmit}>
				{#if submitting}
					<LoaderCircle class="animate-spin" />
				{/if}
				{isMove
					? 'Taşı'
					: outcome === 'makeup'
						? 'Telafi dersi ekle'
						: outcome === 'shifted'
							? 'Kaydır'
							: 'Yak'}
			</Button>
		</ModalFooter>
	{/if}
</Modal>
