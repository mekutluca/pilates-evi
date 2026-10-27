<script lang="ts">
	import type { AppointmentSheetProps } from '$lib/types/ComponentProps';
	import type { AppointmentTraineeRelation, Attendance } from '$lib/types/Schedule';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as ToggleGroup from '$lib/components/ui/toggle-group/index.js';
	import MoveRight from '@lucide/svelte/icons/move-right';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import UsersRound from '@lucide/svelte/icons/users-round';
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';
	import TraineeNote from '$lib/components/trainee-note.svelte';
	import { toast } from 'svelte-sonner';
	import { getTimeString } from '$lib/types/Schedule';
	import { formatShortDate, formatSlotLabel, isAppointmentFuture } from '$lib/utils/date-utils';
	import {
		attendanceSummary,
		creditLabel,
		formatAttendanceSummary,
		isAttendanceOpen
	} from '$lib/utils/attendance-utils';
	import { actionResultMessage, postAction } from '$lib/utils/api-client';
	import { cn } from '$lib/utils';

	let {
		open = $bindable(),
		appointment,
		userRole,
		onMove,
		onCancel,
		onAbsence,
		onChanged
	}: AppointmentSheetProps = $props();

	const isStaff = $derived(userRole === 'admin' || userRole === 'coordinator');
	const isUpcoming = $derived(
		appointment ? isAppointmentFuture(appointment.date, appointment.hour) : false
	);
	const isGroup = $derived(appointment?.group_lesson_id !== null);
	const trainees = $derived(appointment?.appointment_trainees ?? []);

	// Yoklama: the package takes attendance and the lesson has started. Trainers mark their
	// own lessons (the server also holds them to the day after); staff mark any.
	const attendanceOn = $derived(
		!!appointment?.attendance_enabled &&
			!!appointment &&
			isAttendanceOpen(appointment.date, appointment.hour)
	);
	const canMark = $derived(attendanceOn && (isStaff || userRole === 'trainer'));
	const summary = $derived(attendanceSummary(trainees));
	let marking = $state<Set<number>>(new Set());

	// Saves one trainee's attendance at once; the row shows the new state while it posts
	async function mark(enrollment: AppointmentTraineeRelation, value: Attendance | null) {
		if (enrollment.attendance === value || marking.has(enrollment.id)) return;
		const previous = enrollment.attendance ?? null;
		enrollment.attendance = value;
		marking = new Set(marking).add(enrollment.id);
		const fd = new FormData();
		fd.set('enrollmentId', String(enrollment.id));
		fd.set('attendance', value ?? '');
		const result = await postAction('markAttendance', fd);
		marking = new Set([...marking].filter((id) => id !== enrollment.id));
		if (result.type === 'success') {
			await onChanged?.();
		} else {
			enrollment.attendance = previous;
			toast.error(actionResultMessage(result));
		}
	}

	async function markAllPresent() {
		for (const enrollment of trainees) {
			if (enrollment.attendance === null || enrollment.attendance === undefined) {
				await mark(enrollment, 'attended');
			}
		}
	}

	async function removeMakeup(enrollmentId: number) {
		const fd = new FormData();
		fd.set('enrollmentId', String(enrollmentId));
		const result = await postAction('removeMakeup', fd);
		if (result.type === 'success') {
			toast.success(result.data?.message ?? 'Telafi dersi kaldırıldı');
			await onChanged?.();
		} else {
			toast.error(actionResultMessage(result));
		}
	}

	function absenceTarget(enrollment: AppointmentTraineeRelation, mode: 'decide' | 'move') {
		if (!appointment || !enrollment.pe_trainees) return null;
		// A private lesson's credits sit on the appointment's purchase, a group member's on
		// their own
		const credits = isGroup ? enrollment.pe_purchases : null;
		return {
			mode,
			enrollmentId: enrollment.id,
			traineeName: enrollment.pe_trainees.name,
			packageName: appointment.package_name ?? '',
			isGroup,
			lesson: { date: appointment.date, hour: appointment.hour },
			rescheduleLeft: isGroup
				? (credits?.reschedule_left ?? null)
				: (appointment.reschedule_left ?? null),
			makeupLeft: isGroup ? (credits?.makeup_left ?? null) : (appointment.makeup_left ?? null),
			absenceOutcome: enrollment.absence_outcome ?? null
		};
	}

	function calendarHref(lesson: { appointmentId: number; date: string }): string {
		return `/schedule?week=${lesson.date}&appointment=${lesson.appointmentId}`;
	}
</script>

{#snippet outcomeLine(enrollment: AppointmentTraineeRelation)}
	{#if enrollment.absence_outcome === 'burned'}
		<span class="text-xs text-muted-foreground">Yakıldı</span>
	{:else if enrollment.absence_outcome === 'shifted' || enrollment.absence_outcome === 'makeup'}
		{@const link = enrollment.replacement}
		<span class="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
			{enrollment.absence_outcome === 'shifted' ? 'Kaydırıldı' : 'Telafi'}
			<MoveRight class="size-3" aria-hidden="true" />
			{#if link}
				{#if isStaff}
					<a href={calendarHref(link)} class="font-medium text-foreground hover:underline">
						{formatSlotLabel(link.date, link.hour)}
					</a>
				{:else}
					<span class="font-medium text-foreground">{formatSlotLabel(link.date, link.hour)}</span>
				{/if}
			{:else}
				<span>başka bir ders</span>
			{/if}
		</span>
	{:else}
		<span class="text-xs font-semibold">Karar bekliyor</span>
	{/if}
{/snippet}

<Sheet.Root bind:open>
	<Sheet.Content
		side="right"
		class="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md"
	>
		{#if appointment}
			<Sheet.Header class="border-b pr-12">
				<Sheet.Title>{appointment.package_name || 'Randevu'}</Sheet.Title>
				<Sheet.Description>
					{formatSlotLabel(appointment.date, appointment.hour)}–{getTimeString(
						appointment.hour + 1
					)}
				</Sheet.Description>
			</Sheet.Header>

			<div class="space-y-6 px-6 py-5">
				<dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
					<dt class="text-muted-foreground">Oda</dt>
					<dd class="font-medium">{appointment.room_name || '-'}</dd>
					<dt class="text-muted-foreground">Eğitmen</dt>
					<dd class="font-medium">{appointment.trainer_name || '-'}</dd>
					<dt class="text-muted-foreground">Tür</dt>
					<dd class="font-medium">{isGroup ? 'Grup dersi' : 'Özel ders'}</dd>
					{#if appointment.purchase_id}
						<dt class="text-muted-foreground">Değişiklik hakkı</dt>
						<dd class="font-medium tabular-nums">{creditLabel(appointment.reschedule_left)}</dd>
					{/if}
					{#if attendanceOn && trainees.length > 0}
						<dt class="text-muted-foreground">Yoklama</dt>
						<dd class="font-medium tabular-nums">{formatAttendanceSummary(summary)}</dd>
					{/if}
				</dl>

				<section aria-labelledby="appointment-trainees">
					<div class="mb-2 flex items-center justify-between gap-2">
						<h3 id="appointment-trainees" class="text-sm font-semibold">
							Öğrenciler ({trainees.length})
						</h3>
						{#if canMark && summary.unmarked > 0}
							<Button variant="ghost" size="sm" onclick={markAllPresent}>
								<Check />
								Hepsi geldi
							</Button>
						{/if}
					</div>
					{#if trainees.length === 0}
						<p class="text-sm text-muted-foreground">Bu randevuda öğrenci yok.</p>
					{:else}
						<ul class="divide-y rounded-xl border">
							{#each trainees as enrollment (enrollment.id)}
								{@const isLast =
									enrollment.session_number !== null &&
									enrollment.session_number === enrollment.total_sessions &&
									!enrollment.pe_purchases?.successor_id}
								{@const notes = enrollment.pe_trainees?.notes}
								{@const isMakeup = !!enrollment.makeup_for_id}
								{@const isAbsent = enrollment.attendance === 'absent'}
								<li class="grid gap-2 px-3 py-2">
									<div class="flex items-start gap-2">
										<div class="min-w-0 flex-1">
											{#if enrollment.pe_trainees && isStaff}
												<a
													href="/trainees/{enrollment.pe_trainees.id}"
													class="block truncate font-medium hover:underline"
												>
													{enrollment.pe_trainees.name}
												</a>
											{:else if enrollment.pe_trainees}
												<span class="block truncate font-medium">{enrollment.pe_trainees.name}</span
												>
											{/if}
											<span class="flex flex-wrap items-center gap-x-1.5 gap-y-1">
												<span class="text-xs text-muted-foreground tabular-nums">
													{enrollment.session_number}/{enrollment.total_sessions}. ders
												</span>
												{#if isMakeup}
													<Badge variant="outline">Telafi</Badge>
													{#if enrollment.origin}
														<span class="text-xs text-muted-foreground">
															{formatShortDate(enrollment.origin.date)} dersi yerine
														</span>
													{/if}
												{/if}
												{#if isLast}
													<Badge variant="outline">Son ders</Badge>
												{/if}
											</span>
											{#if notes}
												<TraineeNote note={notes} class="mt-1.5" />
											{/if}
										</div>
										{#if isStaff && isUpcoming && isGroup && enrollment.pe_trainees && !isMakeup}
											{@const trainee = enrollment.pe_trainees}
											<Button
												variant="ghost"
												size="sm"
												onclick={() => onMove?.({ id: trainee.id, name: trainee.name })}
											>
												Taşı<span class="sr-only">: {trainee.name}</span>
											</Button>
										{/if}
										<!-- Group members each have their own kayıt; a private lesson's kayıt is renewed from the footer -->
										{#if isStaff && isGroup && enrollment.pe_trainees && enrollment.purchase_id && !isMakeup}
											<Button
												variant="ghost"
												size="sm"
												href="/trainees/{enrollment.pe_trainees.id}/renew/{enrollment.purchase_id}"
											>
												Yenile<span class="sr-only">: {enrollment.pe_trainees.name}</span>
											</Button>
										{/if}
										{#if isStaff && isUpcoming && isMakeup && enrollment.pe_trainees}
											{@const target = absenceTarget(enrollment, 'move')}
											{#if isGroup && target}
												<Button variant="ghost" size="sm" onclick={() => onAbsence?.(target)}>
													Taşı<span class="sr-only"
														>: telafi dersi, {enrollment.pe_trainees.name}</span
													>
												</Button>
											{/if}
											<Button variant="ghost" size="sm" onclick={() => removeMakeup(enrollment.id)}>
												Kaldır<span class="sr-only"
													>: telafi dersi, {enrollment.pe_trainees.name}</span
												>
											</Button>
										{/if}
									</div>

									{#if attendanceOn && enrollment.pe_trainees}
										<div class="flex flex-wrap items-center justify-between gap-2">
											{#if canMark}
												<ToggleGroup.Root
													type="single"
													variant="outline"
													size="sm"
													value={enrollment.attendance ?? ''}
													onValueChange={(v) =>
														mark(enrollment, v === 'attended' || v === 'absent' ? v : null)}
													disabled={marking.has(enrollment.id)}
													aria-label={`${enrollment.pe_trainees.name} yoklaması`}
												>
													<ToggleGroup.Item
														value="attended"
														class="data-[state=on]:bg-secondary data-[state=on]:font-semibold data-[state=on]:text-secondary-foreground"
													>
														<Check />
														Geldi
													</ToggleGroup.Item>
													<ToggleGroup.Item
														value="absent"
														class="data-[state=on]:bg-secondary data-[state=on]:font-semibold data-[state=on]:text-secondary-foreground"
													>
														<X />
														Gelmedi
													</ToggleGroup.Item>
												</ToggleGroup.Root>
											{:else}
												<span class="text-sm">
													{enrollment.attendance === 'attended'
														? 'Geldi'
														: isAbsent
															? 'Gelmedi'
															: 'İşaretlenmedi'}
												</span>
											{/if}

											{#if isAbsent}
												{@const target = absenceTarget(enrollment, 'decide')}
												{@const decided =
													enrollment.absence_outcome === 'shifted' ||
													enrollment.absence_outcome === 'makeup'}
												<span class="flex items-center gap-2">
													{@render outcomeLine(enrollment)}
													{#if isStaff && target && !decided}
														<Button variant="outline" size="xs" onclick={() => onAbsence?.(target)}>
															{enrollment.absence_outcome === 'burned' ? 'Değiştir' : 'Karar ver'}
															<span class="sr-only">: {enrollment.pe_trainees.name}</span>
														</Button>
													{/if}
												</span>
											{/if}
										</div>
									{/if}
								</li>
							{/each}
						</ul>
						{#if appointment.attendance_enabled && !attendanceOn && isStaff}
							<p class="mt-2 text-xs text-muted-foreground">Yoklama ders başlayınca alınır.</p>
						{/if}
					{/if}
				</section>
			</div>

			{#if isStaff}
				<Sheet.Footer
					class="sticky bottom-0 flex-row flex-wrap items-center gap-2 border-t bg-popover"
				>
					{#if isUpcoming}
						<Button onclick={() => onMove?.(null)}>
							<MoveRight />
							Taşı
						</Button>
						<Button variant="outline" onclick={onCancel}>
							<Trash2 />
							İptal et
						</Button>
					{:else}
						<p class="text-sm text-muted-foreground">Geçmiş randevu, değiştirilemez.</p>
					{/if}
					{#if !isGroup && appointment.purchase_id && trainees[0]?.pe_trainees}
						<Button
							variant="outline"
							href="/trainees/{trainees[0].pe_trainees.id}/renew/{appointment.purchase_id}"
						>
							<RefreshCw />
							Yenile
						</Button>
					{/if}
					{#if appointment.group_lesson_id}
						<Button variant="outline" href="/group-lessons/{appointment.group_lesson_id}">
							<UsersRound />
							Grup dersi
						</Button>
					{/if}
				</Sheet.Footer>
			{/if}
		{/if}
	</Sheet.Content>
</Sheet.Root>
