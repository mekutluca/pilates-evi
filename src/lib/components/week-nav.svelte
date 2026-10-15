<script lang="ts">
	import type { WeekNavProps } from '$lib/types/ComponentProps';
	import DatePicker from '$lib/components/date-picker.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import { addDays, formatWeekRange, getWeekStart } from '$lib/utils/date-utils';
	import { clickOutside } from '$lib/utils/click-outside';
	import { tick } from 'svelte';

	let { weekStart, onNavigate }: WeekNavProps = $props();

	let showDatePicker = $state(false);
	let trigger = $state<HTMLButtonElement | null>(null);
	let panel = $state<HTMLElement | null>(null);
	const isCurrentWeek = $derived(weekStart.getTime() === getWeekStart(new Date()).getTime());

	// Opening moves focus to the selected day; closing returns it to the week button
	async function open() {
		showDatePicker = true;
		await tick();
		(
			panel?.querySelector<HTMLElement>('[data-selected]') ?? panel?.querySelector('button')
		)?.focus();
	}

	function close(restoreFocus = true) {
		showDatePicker = false;
		if (restoreFocus) trigger?.focus();
	}
</script>

<div class="flex items-center gap-2">
	<Button
		variant="outline"
		size="icon-sm"
		class="max-md:size-11"
		aria-label="Önceki hafta"
		onclick={() => onNavigate(addDays(weekStart, -7))}
	>
		<ChevronLeft />
	</Button>
	<div class="relative text-center" use:clickOutside={() => (showDatePicker = false)}>
		<button
			bind:this={trigger}
			type="button"
			class="min-h-11 min-w-44 cursor-pointer rounded-full px-2 text-sm font-semibold hover:underline"
			aria-haspopup="dialog"
			aria-expanded={showDatePicker}
			onclick={() => (showDatePicker ? close() : open())}
		>
			<span class="sr-only">Hafta seç:</span>
			<!-- Announced when the arrows change the week -->
			<span aria-live="polite">{formatWeekRange(weekStart)}</span>
		</button>
		{#if showDatePicker}
			<div
				bind:this={panel}
				class="absolute top-full left-1/2 z-50 mt-2 -translate-x-1/2"
				role="dialog"
				aria-label="Hafta seç"
				tabindex="-1"
				onkeydown={(e) => {
					if (e.key === 'Escape') {
						e.stopPropagation();
						close();
					}
				}}
			>
				<DatePicker
					value={weekStart}
					onDateSelect={(date) => {
						close(false);
						onNavigate(date);
					}}
					onClose={() => close()}
				/>
			</div>
		{/if}
	</div>
	<Button
		variant="outline"
		size="icon-sm"
		class="max-md:size-11"
		aria-label="Sonraki hafta"
		onclick={() => onNavigate(addDays(weekStart, 7))}
	>
		<ChevronRight />
	</Button>
	{#if !isCurrentWeek}
		<Button variant="ghost" size="sm" onclick={() => onNavigate(new Date())}>Bu hafta</Button>
	{/if}
</div>
