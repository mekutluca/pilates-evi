<script lang="ts">
	import { DAYS_OF_WEEK, DAY_NAMES, SCHEDULE_HOURS, getTimeRangeString } from '$lib/types/Schedule';
	import { getDateForDayOfWeek, formatDayMonth } from '$lib/utils';
	import { cn } from '$lib/utils';
	import ClockAlert from '@lucide/svelte/icons/clock-alert';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import type { ScheduleSlot, DayOfWeek, SlotColor } from '$lib/types/Schedule';
	import type { Snippet } from 'svelte';

	// Component props
	interface Props {
		// Week to display
		weekStart: Date;

		// Header info (shown above the schedule grid)
		entityName: string;
		entityBadge?: {
			text: string;
			color?: SlotColor;
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

	const colorClasses: Record<SlotColor, { solid: string; soft: string; text: string }> = {
		primary: {
			solid: 'bg-primary text-primary-foreground',
			soft: 'bg-primary/15 hover:bg-primary/25',
			text: 'text-primary'
		},
		secondary: {
			solid: 'bg-secondary text-secondary-foreground',
			soft: 'bg-secondary/15 hover:bg-secondary/25',
			text: 'text-secondary'
		},
		accent: {
			solid: 'bg-accent text-accent-foreground',
			soft: 'bg-accent/15 hover:bg-accent/25',
			text: 'text-accent'
		},
		info: {
			solid: 'bg-info text-info-foreground',
			soft: 'bg-info/15 hover:bg-info/25',
			text: 'text-info'
		},
		success: {
			solid: 'bg-success text-success-foreground',
			soft: 'bg-success/15 hover:bg-success/25',
			text: 'text-success'
		},
		warning: {
			solid: 'bg-warning text-warning-foreground',
			soft: 'bg-warning/15 hover:bg-warning/25',
			text: 'text-warning'
		},
		destructive: {
			solid: 'bg-destructive text-destructive-foreground',
			soft: 'bg-destructive/15 hover:bg-destructive/25',
			text: 'text-destructive'
		}
	};

	function getColor(color: string | undefined): SlotColor {
		if (!color) return 'primary';
		if (color in colorClasses) return color as SlotColor;
		return 'primary';
	}

	function handleSlotClick(slot: ScheduleSlot) {
		const clickable =
			slot.variant === 'appointment' || slot.variant === 'available' || slot.variant === 'custom';
		if (clickable && onSlotClick) {
			onSlotClick(slot);
		}
	}
</script>

<Card.Root>
	<Card.Content>
		<div class="mb-4 flex items-center justify-between">
			<h2 class="flex items-center gap-2 text-xl font-semibold">
				{#if entityBadge}
					{@const badgeColor = getColor(entityBadge.color)}
					<Badge class={colorClasses[badgeColor].solid}>
						{entityBadge.text}
					</Badge>
				{/if}
				{entityName}
			</h2>

			{#if alertBanner}
				{@render alertBanner()}
			{/if}
		</div>

		<div class="overflow-x-auto">
			<Table.Root class="md:table-fixed">
				<Table.Header>
					<Table.Row>
						<Table.Head class="sticky left-0 z-10 w-28 bg-card">Saat</Table.Head>
						{#each DAYS_OF_WEEK as day (day)}
							{@const dayDate = getDateForDayOfWeek(weekStart, day)}
							<Table.Head class="min-w-28 text-center md:w-[calc((100%-7rem)/7)]">
								<div class="text-xs text-muted-foreground">{formatDayMonth(dayDate)}</div>
								<div class="font-semibold">{DAY_NAMES[day]}</div>
							</Table.Head>
						{/each}
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#each SCHEDULE_HOURS as hour (hour)}
						<Table.Row>
							<Table.Cell
								class="sticky left-0 z-10 w-28 bg-card text-sm font-semibold whitespace-nowrap"
							>
								{getTimeRangeString(hour)}
							</Table.Cell>
							{#each DAYS_OF_WEEK as day (day)}
								{@const dayDate = getDateForDayOfWeek(weekStart, day)}
								{@const year = dayDate.getFullYear()}
								{@const month = String(dayDate.getMonth() + 1).padStart(2, '0')}
								{@const dayOfMonth = String(dayDate.getDate()).padStart(2, '0')}
								{@const dateString = `${year}-${month}-${dayOfMonth}`}
								{@const slot = getSlotData(day, hour, dateString)}
								<Table.Cell class="p-1 text-center">
									{#if slot.variant === 'empty'}
										<div
											class="flex min-h-12 items-center justify-center rounded bg-muted p-2 text-muted-foreground"
										>
											<span class="text-xs">{slot.label || '-'}</span>
										</div>
									{:else if slot.variant === 'appointment'}
										{@const apptColor = getColor(slot.color)}
										<button
											type="button"
											class={cn(
												'min-h-12 w-full rounded p-2 text-xs transition-colors',
												colorClasses[apptColor].solid,
												slot.dimmed && 'opacity-60',
												slot.clickable !== false
													? 'cursor-pointer hover:opacity-80'
													: 'cursor-default'
											)}
											onclick={() => slot.clickable !== false && handleSlotClick(slot)}
											disabled={slot.clickable === false}
										>
											<div class="truncate font-semibold">
												{slot.title}
											</div>
											{#if slot.subtitle}
												<div class="truncate text-xs opacity-80">
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
											{#if slot.warning}
												<div
													class="mt-1 flex items-center justify-center gap-1 text-xs font-semibold"
												>
													<TriangleAlert size={12} />
													<span>{slot.warning}</span>
												</div>
											{/if}
										</button>
									{:else if slot.variant === 'available'}
										{#if slot.clickable && !slot.disabled}
											{@const isSelected = slot.label?.includes('Seçili')}
											{@const availColor = getColor(slot.color || 'success')}
											<button
												type="button"
												class={cn(
													'group flex min-h-12 w-full cursor-pointer items-center justify-center rounded p-2 transition-colors',
													isSelected
														? cn(
																'border-2',
																colorClasses[availColor].solid,
																availColor === 'primary' && 'border-primary',
																availColor === 'secondary' && 'border-secondary',
																availColor === 'accent' && 'border-accent',
																availColor === 'info' && 'border-info',
																availColor === 'success' && 'border-success',
																availColor === 'warning' && 'border-warning',
																availColor === 'destructive' && 'border-destructive'
															)
														: colorClasses[availColor].soft
												)}
												onclick={() => handleSlotClick(slot)}
											>
												<span
													class={cn(
														'text-xs font-medium',
														isSelected ? '' : colorClasses[availColor].text
													)}
												>
													{slot.label || 'Seç'}
												</span>
											</button>
										{:else if slot.disabled}
											<div
												class="flex min-h-12 items-center justify-center rounded bg-muted p-2 text-muted-foreground"
											>
												<span class="text-xs">{slot.label || '-'}</span>
											</div>
										{:else}
											<div
												class="flex min-h-12 items-center justify-center rounded bg-muted p-2 text-muted-foreground"
											>
												<span class="text-xs">{slot.label || 'Müsait'}</span>
											</div>
										{/if}
									{:else if slot.variant === 'disabled'}
										<div
											class="flex min-h-12 items-center justify-center rounded bg-warning/15 p-2 text-warning"
											title={slot.reason}
										>
											<span class="text-xs">{slot.label || '-'}</span>
										</div>
									{:else if slot.variant === 'custom' && customSlotRenderer}
										{@render customSlotRenderer(slot)}
									{/if}
								</Table.Cell>
							{/each}
						</Table.Row>
					{/each}
				</Table.Body>
			</Table.Root>
		</div>
	</Card.Content>
</Card.Root>
