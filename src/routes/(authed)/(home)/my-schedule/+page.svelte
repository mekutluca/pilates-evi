<script lang="ts">
	import type { AppointmentWithDetails, DayOfWeek, ScheduleSlot } from '$lib/types/Schedule';
	import PageHeader from '$lib/components/page-header.svelte';
	import Schedule from '$lib/components/schedule.svelte';
	import WeekNav from '$lib/components/week-nav.svelte';
	import AppointmentSheet from '$lib/components/scheduling/appointment-sheet.svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { streamed } from '$lib/utils/streamed.svelte';
	import { ScheduleSkeleton } from '$lib/components/skeletons/index.js';
	import LoadError from '$lib/components/load-error.svelte';
	import { formatDateForDB, getWeekStart, parseLocalDate } from '$lib/utils/date-utils';
	import {
		computeAppointmentWarnings,
		createAppointmentDetails,
		lessonBlock
	} from '$lib/utils/appointment-utils';

	let { data } = $props();

	const weekStart = $derived(parseLocalDate(data.weekStart));
	// The week streams in: undefined while a new week loads (board skeleton)
	const week = streamed(
		() => data.appointments,
		() => data.weekStart
	);
	const appointments = $derived(week.current ?? []);
	// Capacity/collision flags, computed across the whole week
	const appointmentWarnings = $derived(computeAppointmentWarnings(appointments));
	const lessonCount = $derived(appointments.length);

	let selected = $state<AppointmentWithDetails | null>(null);
	let sheetOpen = $state(false);

	function getSlotData(day: DayOfWeek, hour: number, date: string): ScheduleSlot {
		const appointment = appointments.find((a) => a.date === date && a.hour === hour);
		if (!appointment) return { variant: 'empty', day, hour, date, label: '-' };

		const details = createAppointmentDetails(appointment);
		return {
			variant: 'appointment',
			day,
			hour,
			date,
			...lessonBlock(details, appointmentWarnings.get(appointment.id), 'room'),
			clickable: true,
			data: details
		};
	}

	function handleSlotClick(slot: ScheduleSlot) {
		if (slot.variant !== 'appointment' || !slot.data) return;
		const appointment = appointments.find((a) => a.id === slot.data?.id);
		if (!appointment) return;
		selected = createAppointmentDetails(appointment);
		sheetOpen = true;
	}

	// Opened from the Panel: ?appointment=<id>
	$effect(() => {
		const id = Number(page.url.searchParams.get('appointment'));
		const appointment = id ? appointments.find((a) => a.id === id) : undefined;
		if (!appointment) return;
		selected = createAppointmentDetails(appointment);
		sheetOpen = true;
	});

	const goToWeek = (date: Date) =>
		goto(`?week=${formatDateForDB(getWeekStart(date))}`, { keepFocus: true, noScroll: true });
</script>

<svelte:head>
	<title>Takvimim · Pilates Evi</title>
</svelte:head>

<div class="space-y-6 p-4 lg:p-6">
	<PageHeader
		title="Takvimim"
		subtitle={!week.current ? data.trainerName : `${data.trainerName} · ${lessonCount} ders`}
	/>

	<WeekNav {weekStart} onNavigate={goToWeek} />

	{#if week.current === undefined}
		<ScheduleSkeleton />
	{:else if week.current === null}
		<LoadError message="Haftanın dersleri yüklenemedi." />
	{:else}
		<Schedule
			{weekStart}
			entityName={data.trainerName}
			{getSlotData}
			onSlotClick={handleSlotClick}
		/>
	{/if}
</div>

<AppointmentSheet bind:open={sheetOpen} appointment={selected} userRole={data.userRole} />
