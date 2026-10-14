<script lang="ts">
	import type { AppointmentSheetProps } from '$lib/types/ComponentProps';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import MoveRight from '@lucide/svelte/icons/move-right';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import UsersRound from '@lucide/svelte/icons/users-round';
	import { getTimeString } from '$lib/types/Schedule';
	import { formatSlotLabel, isAppointmentFuture } from '$lib/utils/date-utils';

	let {
		open = $bindable(),
		appointment,
		userRole,
		onMove,
		onCancel
	}: AppointmentSheetProps = $props();

	const isStaff = $derived(userRole === 'admin' || userRole === 'coordinator');
	const isUpcoming = $derived(
		appointment ? isAppointmentFuture(appointment.date, appointment.hour) : false
	);
	const isGroup = $derived(appointment?.group_lesson_id !== null);
	const trainees = $derived(appointment?.appointment_trainees ?? []);

	function creditsLabel(left: number | undefined): string {
		if (left === undefined) return '-';
		return left >= 999 ? 'Sınırsız' : `${left} kaldı`;
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content side="right" class="w-full gap-0 overflow-y-auto sm:max-w-md">
		{#if appointment}
			<Sheet.Header class="border-b">
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
						<dd class="font-medium tabular-nums">{creditsLabel(appointment.reschedule_left)}</dd>
					{/if}
				</dl>

				<section aria-labelledby="appointment-trainees">
					<h3 id="appointment-trainees" class="mb-2 text-sm font-semibold">
						Öğrenciler ({trainees.length})
					</h3>
					{#if trainees.length === 0}
						<p class="text-sm text-muted-foreground">Bu randevuda öğrenci yok.</p>
					{:else}
						<ul class="divide-y rounded-xl border">
							{#each trainees as enrollment (enrollment.id)}
								{@const isLast =
									enrollment.session_number !== null &&
									enrollment.session_number === enrollment.total_sessions &&
									!enrollment.pe_purchases?.successor_id}
								<li class="flex items-center gap-2 px-3 py-2">
									<div class="min-w-0 flex-1">
										{#if enrollment.pe_trainees && isStaff}
											<a
												href="/trainees/{enrollment.pe_trainees.id}"
												class="block truncate font-medium hover:underline"
											>
												{enrollment.pe_trainees.name}
											</a>
										{:else if enrollment.pe_trainees}
											<span class="block truncate font-medium">{enrollment.pe_trainees.name}</span>
										{/if}
										<span class="text-xs text-muted-foreground tabular-nums">
											{enrollment.session_number}/{enrollment.total_sessions}. ders
										</span>
										{#if isLast}
											<Badge variant="outline" class="ml-1">Son ders</Badge>
										{/if}
									</div>
									{#if isStaff && isUpcoming && isGroup && enrollment.pe_trainees}
										{@const trainee = enrollment.pe_trainees}
										<Button
											variant="ghost"
											size="sm"
											onclick={() => onMove?.({ id: trainee.id, name: trainee.name })}
										>
											Taşı
										</Button>
									{/if}
									{#if isStaff && enrollment.pe_trainees && enrollment.purchase_id}
										<Button
											variant="ghost"
											size="sm"
											href="/trainees/{enrollment.pe_trainees.id}/renew/{enrollment.purchase_id}"
										>
											Yenile
										</Button>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</section>
			</div>

			{#if isStaff}
				<Separator />
				<Sheet.Footer class="flex-row flex-wrap gap-2">
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
						<p class="text-sm text-muted-foreground">Geçmiş randevu; değiştirilemez.</p>
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
