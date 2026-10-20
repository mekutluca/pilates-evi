<script lang="ts">
	import type { ScheduleProps } from '$lib/types/ComponentProps';
	import type { ScheduleSlot, SlotColor } from '$lib/types/Schedule';
	import { DAYS_OF_WEEK, DAY_NAMES, SCHEDULE_HOURS, getTimeString } from '$lib/types/Schedule';
	import ActionMenu from '$lib/components/action-menu.svelte';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import ClockAlert from '@lucide/svelte/icons/clock-alert';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import NotepadText from '@lucide/svelte/icons/notepad-text';
	import UsersRound from '@lucide/svelte/icons/users-round';
	import { cn } from '$lib/utils';
	import { formatDateForDB, formatShortDate, getDateForDayOfWeek } from '$lib/utils/date-utils';

	// The week board: one row per hour, one column per day. Booked lessons are orange-tinted
	// blocks (package, trainees, the other dimension), a group at capacity a step deeper;
	// free future hours are quiet cells that show their action on hover.
	let { weekStart, entityName, getSlotData, onSlotClick, dayActions }: ScheduleProps = $props();

	const today = formatDateForDB(new Date());
	const days = $derived(
		DAYS_OF_WEEK.map((day) => {
			const date = formatDateForDB(getDateForDayOfWeek(weekStart, day));
			return { day, date, label: formatShortDate(date) };
		})
	);

	const TONES: Record<SlotColor, string> = {
		primary: 'bg-primary/10 ring-primary/25 hover:bg-primary/15',
		full: 'bg-primary/20 ring-primary/50 hover:bg-primary/25',
		muted: 'bg-muted ring-foreground/10 text-muted-foreground hover:bg-muted/70',
		destructive: 'bg-destructive/10 ring-destructive/30 hover:bg-destructive/15'
	};

	// On a narrow screen the board scrolls sideways; open it on today's column
	function revealToday(scroller: HTMLElement) {
		const column = scroller.querySelector<HTMLElement>('[data-today]');
		if (!column || scroller.scrollWidth <= scroller.clientWidth) return;
		scroller.scrollLeft = Math.max(column.offsetLeft - 64, 0);
	}

	function handleSlotClick(slot: ScheduleSlot) {
		if (slot.variant !== 'empty' && onSlotClick) onSlotClick(slot);
	}
</script>

<section class="overflow-hidden surface" aria-label={`${entityName} haftalık takvim`}>
	<header class="flex items-center gap-2 border-b px-4 py-3">
		<h2 class="truncate text-base font-semibold">{entityName}</h2>
	</header>

	<div class="overflow-x-auto" {@attach revealToday}>
		<table class="w-full min-w-[56rem] table-fixed border-separate border-spacing-0 text-xs">
			<thead>
				<tr>
					<th
						scope="col"
						class="sticky left-0 z-10 w-16 border-b bg-card px-3 py-2 text-left font-medium text-muted-foreground"
					>
						Saat
					</th>
					{#each days as { day, date, label } (day)}
						{@const actions = dayActions?.(date) ?? []}
						{@const isToday = date === today}
						<th
							scope="col"
							data-today={isToday || undefined}
							class={cn('border-b px-1 py-2 font-normal', isToday && 'bg-primary/[0.035]')}
						>
							<div class="flex items-center justify-center gap-1">
								<div class="text-center">
									<div
										class={cn('font-semibold', isToday ? 'text-primary-ink' : 'text-foreground')}
									>
										{DAY_NAMES[day]}
									</div>
									<div class="text-muted-foreground tabular-nums">
										{isToday ? `Bugün · ${label}` : label}
									</div>
								</div>
								{#if actions.length > 0}
									<ActionMenu
										{actions}
										trigger={Ellipsis}
										label={undefined}
										ariaLabel={`${DAY_NAMES[day]} işlemleri`}
									/>
								{/if}
							</div>
						</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each SCHEDULE_HOURS as hour (hour)}
					<tr>
						<th
							scope="row"
							class="sticky left-0 z-10 border-b bg-card px-3 py-1 text-left align-top font-semibold tabular-nums"
						>
							{getTimeString(hour)}
						</th>
						{#each days as { day, date } (day)}
							{@const slot = getSlotData(day, hour, date)}
							{@const slotName = `${DAY_NAMES[day]} ${getTimeString(hour)}`}
							<td
								class={cn('h-16 border-b p-0.5 align-top', date === today && 'bg-primary/[0.035]')}
							>
								{#if slot.variant === 'appointment'}
									<button
										type="button"
										class={cn(
											'flex h-full w-full flex-col items-start gap-px overflow-hidden rounded-md px-2 py-1.5 text-left ring-1 transition-colors outline-none ring-inset focus-visible:ring-[3px] focus-visible:ring-ring',
											TONES[slot.dimmed ? 'muted' : (slot.color ?? 'primary')],
											slot.clickable === false && 'cursor-default'
										)}
										disabled={slot.clickable === false}
										onclick={() => handleSlotClick(slot)}
										aria-label={[
											slotName,
											slot.title,
											slot.subtitle,
											slot.meta,
											slot.hasNotes && 'Öğrenci notu var',
											slot.badge,
											slot.warning,
											slot.color === 'full' && 'Dolu'
										]
											.filter(Boolean)
											.join(', ')}
									>
										<span class="flex w-full items-center gap-1">
											<span class="min-w-0 flex-1 truncate font-semibold">{slot.title}</span>
											{#if slot.hasNotes}
												<NotepadText class="size-3 shrink-0 text-foreground/70" />
											{/if}
										</span>
										{#if slot.subtitle}
											<span class="w-full truncate">{slot.subtitle}</span>
										{/if}
										{#if slot.meta}
											<span class="w-full truncate text-foreground/70">{slot.meta}</span>
										{/if}
										{#if slot.warning}
											<span class="flex items-center gap-1 font-semibold text-destructive">
												<TriangleAlert class="size-3" />
												{slot.warning}
											</span>
										{:else if slot.badge}
											<span class="flex items-center gap-1 font-semibold text-warning-foreground">
												<ClockAlert class="size-3" />
												{slot.badge}
											</span>
										{:else if slot.color === 'full'}
											<span class="flex items-center gap-1 font-semibold">
												<UsersRound class="size-3 text-primary-ink" />
												Dolu
											</span>
										{/if}
									</button>
								{:else if slot.variant === 'available' && slot.clickable !== false}
									<button
										type="button"
										class={cn(
											'group flex h-full w-full items-center justify-center rounded-md transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring',
											slot.selected
												? cn(
														'font-semibold ring-2 ring-inset',
														TONES[slot.color ?? 'primary'],
														'ring-primary'
													)
												: slot.label
													? 'bg-primary/5 text-primary-ink ring-1 ring-primary/30 ring-inset hover:bg-primary/10'
													: 'hover:bg-muted'
										)}
										onclick={() => handleSlotClick(slot)}
										aria-label={`${slotName}: ${slot.label || slot.hoverLabel || 'Seç'}`}
										aria-pressed={slot.selected}
									>
										{#if slot.label}
											<span class="font-medium">{slot.label}</span>
										{:else if slot.hoverLabel}
											<span
												class="font-medium text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:opacity-40"
											>
												{slot.hoverLabel}
											</span>
										{/if}
									</button>
								{:else if slot.variant === 'empty' && slot.label}
									<div class="flex h-full items-center justify-center text-muted-foreground">
										{slot.label}
									</div>
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>
