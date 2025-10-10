<script lang="ts">
	import { DAYS_OF_WEEK, DAY_NAMES, SCHEDULE_HOURS, getTimeRangeString } from '$lib/types/Schedule';
	import { getDateForDayOfWeek, formatDayMonth } from '$lib/utils/date-utils';
	import ClockAlert from '@lucide/svelte/icons/clock-alert';
	import type { ScheduleSlot } from './schedule.types';
	import type { DayOfWeek } from '$lib/types/Schedule';
	import type { Snippet } from 'svelte';

	// Component props
	interface Props {
		// Week to display
		weekStart: Date;

		// Header info (shown above the schedule grid)
		entityName: string; // e.g., "Giriş" for room, "Eğitmen Ali" for trainer
		entityBadge?: {
			text: string; // e.g., "Oda" or "Eğitmen"
			color?: 'primary' | 'secondary' | 'accent' | 'info' | 'success' | 'warning' | 'error';
		};

		// Slot data provider - called for each day/hour combination
		getSlotData: (day: DayOfWeek, hour: number, date: string) => ScheduleSlot;

		// Event handlers
		onSlotClick?: (slot: ScheduleSlot) => void;

		// Optional custom slot renderer (for 'custom' variant)
		customSlotRenderer?: Snippet<[ScheduleSlot]>;

		// Optional alert banner above schedule (for reschedule mode, etc.)
		alertBanner?: Snippet;
	}

	let {
		weekStart,
		entityName,
		entityBadge,
		getSlotData,
		onSlotClick,
		customSlotRenderer,
		alertBanner
	}: Props = $props();

	function handleSlotClick(slot: ScheduleSlot) {
		const clickable =
			slot.variant === 'appointment' || slot.variant === 'available' || slot.variant === 'custom';
		if (clickable && onSlotClick) {
			onSlotClick(slot);
		}
	}
</script>

<div class="card bg-base-100 shadow-xl">
	<div class="card-body">
		<div class="mb-4 flex items-center justify-between">
			<h2 class="card-title text-xl">
				{#if entityBadge}
					<span class="mr-2 badge badge-sm badge-{entityBadge.color || 'primary'}">
						{entityBadge.text}
					</span>
				{/if}
				{entityName}
			</h2>

			{#if alertBanner}
				{@render alertBanner()}
			{/if}
		</div>

		<div class="overflow-x-auto">
			<table class="table table-xs md:table-fixed">
				<thead>
					<tr>
						<th class="sticky left-0 w-20 bg-base-100">Saat</th>
						{#each DAYS_OF_WEEK as day (day)}
							{@const dayDate = getDateForDayOfWeek(weekStart, day)}
							<th class="min-w-28 text-center md:w-[calc((100%-5rem)/7)]">
								<div class="text-xs text-base-content/60">{formatDayMonth(dayDate)}</div>
								<div class="font-semibold">{DAY_NAMES[day]}</div>
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each SCHEDULE_HOURS as hour (hour)}
						<tr>
							<td class="sticky left-0 bg-base-100 text-sm font-semibold">
								{getTimeRangeString(hour)}
							</td>
							{#each DAYS_OF_WEEK as day (day)}
								{@const dayDate = getDateForDayOfWeek(weekStart, day)}
								{@const year = dayDate.getFullYear()}
								{@const month = String(dayDate.getMonth() + 1).padStart(2, '0')}
								{@const dayOfMonth = String(dayDate.getDate()).padStart(2, '0')}
								{@const dateString = `${year}-${month}-${dayOfMonth}`}
								{@const slot = getSlotData(day, hour, dateString)}
								<td class="p-1 text-center">
									{#if slot.variant === 'empty'}
										<div
											class="flex min-h-12 items-center justify-center rounded bg-base-200 p-2 text-base-content/40"
										>
											<span class="text-xs">{slot.label || '-'}</span>
										</div>
									{:else if slot.variant === 'appointment'}
										<button
											class="min-h-12 w-full rounded p-2 text-xs transition-colors"
											class:cursor-pointer={slot.clickable !== false}
											class:cursor-default={slot.clickable === false}
											class:hover:opacity-80={slot.clickable !== false}
											class:bg-primary={slot.color === 'primary'}
											class:text-primary-content={slot.color === 'primary'}
											class:bg-secondary={slot.color === 'secondary'}
											class:text-secondary-content={slot.color === 'secondary'}
											class:bg-accent={slot.color === 'accent'}
											class:text-accent-content={slot.color === 'accent'}
											class:bg-info={slot.color === 'info'}
											class:text-info-content={slot.color === 'info'}
											class:bg-success={slot.color === 'success'}
											class:text-success-content={slot.color === 'success'}
											class:bg-warning={slot.color === 'warning'}
											class:text-warning-content={slot.color === 'warning'}
											class:bg-error={slot.color === 'error'}
											class:text-error-content={slot.color === 'error'}
											onclick={() => slot.clickable !== false && handleSlotClick(slot)}
											disabled={slot.clickable === false}
										>
											<div class="truncate font-semibold">
												{slot.title}
											</div>
											{#if slot.subtitle}
												<div
													class="truncate text-xs opacity-70"
													class:text-primary-content={slot.color === 'primary'}
													class:text-secondary-content={slot.color === 'secondary'}
													class:text-accent-content={slot.color === 'accent'}
													class:text-info-content={slot.color === 'info'}
													class:text-success-content={slot.color === 'success'}
													class:text-warning-content={slot.color === 'warning'}
													class:text-error-content={slot.color === 'error'}
												>
													{slot.subtitle}
												</div>
											{/if}
											{#if slot.badge}
												<div
													class="mt-1 flex items-center justify-center gap-1 text-xs font-semibold"
												>
													<ClockAlert size={12} />
													<span>{slot.badge}</span>
												</div>
											{/if}
										</button>
									{:else if slot.variant === 'available'}
										{#if slot.clickable && !slot.disabled}
											{@const isSelected = slot.label === 'Seçili'}
											<button
												class="group flex min-h-12 w-full cursor-pointer items-center justify-center rounded p-2 transition-colors {isSelected
													? 'border-2 border-success bg-success'
													: 'bg-success/20 hover:bg-success/30'}"
												onclick={() => handleSlotClick(slot)}
											>
												<span
													class="text-xs font-medium {isSelected
														? 'text-success-content'
														: 'text-success'}"
												>
													{slot.label || 'Seç'}
												</span>
											</button>
										{:else if slot.disabled}
											<div
												class="flex min-h-12 items-center justify-center rounded bg-base-200 p-2 text-base-content/40"
											>
												<span class="text-xs">{slot.label || '-'}</span>
											</div>
										{:else}
											<div
												class="flex min-h-12 items-center justify-center rounded bg-base-200 p-2 text-base-content/40"
											>
												<span class="text-xs">{slot.label || 'Müsait'}</span>
											</div>
										{/if}
									{:else if slot.variant === 'disabled'}
										<div
											class="flex min-h-12 items-center justify-center rounded bg-warning/20 p-2 text-warning"
											title={slot.reason}
										>
											<span class="text-xs">{slot.label || '-'}</span>
										</div>
									{:else if slot.variant === 'custom' && customSlotRenderer}
										{@render customSlotRenderer(slot)}
									{/if}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>
