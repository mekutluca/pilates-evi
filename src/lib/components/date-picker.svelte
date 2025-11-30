<script lang="ts">
	import { onMount } from 'svelte';
	import { formatDateParam } from '$lib/utils/date-utils';
	import { browser } from '$app/environment';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	interface Props {
		value: Date;
		onDateSelect: (date: Date) => void;
		onClose?: () => void;
	}

	interface CalendarChangeEvent extends Event {
		target: HTMLElement & { value: string };
	}

	let { value, onDateSelect, onClose }: Props = $props();

	// Convert Date to ISO format for Cally
	let selectedDate = $state(formatDateParam(value));
	let callyLoaded = $state(false);
	let calendarElement = $state<HTMLElement | null>(null);

	// Import Cally only in browser
	onMount(async () => {
		if (browser) {
			await import('cally');
			callyLoaded = true;
		}
	});

	// Watch for changes when Cally is loaded and set up event listener
	$effect(() => {
		if (callyLoaded && calendarElement) {
			const handleChange = (event: Event): void => {
				// Type guard to ensure event has the expected structure
				if (
					event.target &&
					typeof (event.target as HTMLElement & { value?: string }).value === 'string'
				) {
					const target = event.target as CalendarChangeEvent['target'];
					const date = new Date(target.value);
					if (!isNaN(date.getTime())) {
						selectedDate = target.value;
						onDateSelect(date);
					}
				}
			};

			calendarElement.addEventListener('change', handleChange);

			return (): void => {
				calendarElement?.removeEventListener('change', handleChange);
			};
		}
	});

	function handleTodayClick(): void {
		const today = new Date();
		selectedDate = formatDateParam(today);
		onDateSelect(today);
	}

	function handleCancelClick(): void {
		onClose?.();
	}
</script>

<div class="rounded-lg border border-base-300 bg-base-100 p-4 shadow-lg">
	<div class="mb-3 flex items-center justify-between">
		<span class="text-sm font-medium text-base-content/70">Tarih seçin:</span>
		<div class="flex gap-2">
			<button type="button" class="btn btn-ghost btn-xs" onclick={handleTodayClick}> Bugün </button>
			{#if onClose}
				<button type="button" class="btn btn-ghost btn-xs" onclick={handleCancelClick}>
					İptal
				</button>
			{/if}
		</div>
	</div>

	{#if callyLoaded}
		<calendar-date class="cally" value={selectedDate} locale="tr-TR" bind:this={calendarElement}>
			<button slot="previous" type="button" aria-label="Önceki ay">
				<ChevronLeft size={20} />
			</button>
			<button slot="next" type="button" aria-label="Sonraki ay">
				<ChevronRight size={20} />
			</button>
			<calendar-month></calendar-month>
		</calendar-date>
	{:else}
		<div class="flex h-64 items-center justify-center">
			<span class="loading loading-md loading-spinner"></span>
		</div>
	{/if}
</div>

<style>
	:global(.cally) {
		width: 100%;
	}
</style>
