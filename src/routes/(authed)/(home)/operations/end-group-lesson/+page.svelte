<script lang="ts">
	import type { ActionResult } from '@sveltejs/kit';
	import type { PageData } from './$types';
	import PageHeader from '$lib/components/page-header.svelte';
	import Modal from '$lib/components/modal.svelte';
	import ModalFooter from '$lib/components/modal-footer.svelte';
	import DatePicker from '$lib/components/date-picker.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import CalendarOff from '@lucide/svelte/icons/calendar-off';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { cn } from '$lib/utils';
	import { formatDateForDB, formatTurkishDate, parseLocalDate } from '$lib/utils/date-utils';
	import { getActionErrorMessage } from '$lib/utils/form-utils';
	import { DAYS_OF_WEEK, DAY_NAMES, type DayOfWeek } from '$lib/types/Schedule';
	import type { EndableGroupLesson } from '$lib/types/Operation';

	const { data }: { data: PageData } = $props();

	// Streamed data resolved into local state. `undefined` = loading, `null` =
	// failed. Stale values are kept during invalidation to avoid flashing
	// skeletons after form actions.
	let groupLessons = $state<EndableGroupLesson[] | null | undefined>(undefined);

	$effect(() => {
		const promise = data.groupLessons;
		promise.then((result) => {
			if (data.groupLessons === promise) groupLessons = result;
		});
	});

	let selectedLessonId = $state('');
	let selectedDate = $state<Date | null>(null);
	let showDatePicker = $state(false);
	let showConfirm = $state(false);
	let formLoading = $state(false);

	let selectedLesson = $derived((groupLessons ?? []).find((gl) => gl.id === selectedLessonId));
	let dateForDB = $derived(selectedDate ? formatDateForDB(selectedDate) : '');
	let formattedDate = $derived(dateForDB ? formatTurkishDate(dateForDB) : '');

	function lessonLabel(lesson: EndableGroupLesson): string {
		return `${lesson.packageName} — ${lesson.trainerName} — ${lesson.roomName}`;
	}

	// One chip per weekly slot ("Pazartesi 10:00"), in week order — the
	// schedule is what tells two lessons of the same package apart.
	function scheduleChips(timeslots: EndableGroupLesson['timeslots']): string[] {
		return [...timeslots]
			.sort(
				(a, b) =>
					DAYS_OF_WEEK.indexOf(a.day as DayOfWeek) - DAYS_OF_WEEK.indexOf(b.day as DayOfWeek)
			)
			.flatMap((slot) =>
				[...slot.hours]
					.sort((a, b) => a - b)
					.map((hour) => `${DAY_NAMES[slot.day as DayOfWeek] ?? slot.day} ${hour}:00`)
			);
	}

	// Each lesson has its own earliest end date, so the picker resets to it
	// whenever another lesson is selected.
	function selectLesson(lesson: EndableGroupLesson) {
		selectedLessonId = lesson.id;
		selectedDate = parseLocalDate(lesson.minEndDate);
	}

	function handleDateSelect(date: Date) {
		selectedDate = date;
		showDatePicker = false;
	}

	$effect(() => {
		function handleClickOutside(event: MouseEvent) {
			const target = event.target as Element;
			if (!target.closest('.date-picker-container') && showDatePicker) {
				showDatePicker = false;
			}
		}
		if (showDatePicker) {
			document.addEventListener('click', handleClickOutside);
			return () => document.removeEventListener('click', handleClickOutside);
		}
	});

	function handleSubmit() {
		formLoading = true;
		return async ({ result, update }: { result: ActionResult; update: () => Promise<void> }) => {
			formLoading = false;
			if (result.type === 'success') {
				const data = result.data as { message?: string } | undefined;
				toast.success(data?.message || 'Grup dersi sonlandırıldı');
				showConfirm = false;
				selectedLessonId = '';
				selectedDate = null;
			} else if (result.type === 'failure') {
				toast.error(getActionErrorMessage(result));
			}
			await update();
		};
	}
</script>

<svelte:head>
	<title>Grup Dersini Sonlandır · Pilates Evi</title>
</svelte:head>

<div class="space-y-6 p-6">
	<div>
		<Button variant="ghost" size="sm" href="/operations" class="mb-2 -ml-2">
			<ChevronLeft size={16} />
			Operasyonlar
		</Button>
		<PageHeader
			title="Grup Dersini Sonlandır"
			subtitle="Seçilen grup dersi belirtilen tarihte sonlandırılır; o tarihten itibaren oluşturulmuş boş randevular silinir."
		/>
	</div>

	<div class="grid gap-2">
		<Label id="group-lesson-label" class="font-semibold">Grup Dersi</Label>
		{#if groupLessons === undefined}
			<div class="grid gap-3 lg:grid-cols-2">
				{#each { length: 4 }, i (i)}
					<Skeleton class="h-36 w-full rounded-xl" />
				{/each}
			</div>
		{:else if groupLessons === null}
			<p class="text-sm text-destructive">
				Grup dersleri yüklenemedi. Lütfen sayfayı yenileyip tekrar deneyin.
			</p>
		{:else if groupLessons.length === 0}
			<p class="text-sm text-muted-foreground">Sonlandırılabilecek aktif grup dersi yok.</p>
		{:else}
			<div class="grid gap-3 lg:grid-cols-2" role="radiogroup" aria-labelledby="group-lesson-label">
				{#each groupLessons as lesson (lesson.id)}
					<button
						type="button"
						role="radio"
						aria-checked={selectedLessonId === lesson.id}
						class={cn(
							'rounded-xl border bg-card p-4 text-left text-card-foreground shadow-sm transition-colors',
							'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none',
							selectedLessonId === lesson.id
								? 'border-primary ring-1 ring-primary'
								: 'hover:bg-muted/50'
						)}
						onclick={() => selectLesson(lesson)}
					>
						<div class="flex items-start justify-between gap-2">
							<span class="font-semibold">{lesson.packageName}</span>
							<Badge variant={lesson.traineeCount > 0 ? 'secondary' : 'outline'}>
								{lesson.traineeCount > 0 ? `${lesson.traineeCount} öğrenci` : 'Öğrenci yok'}
							</Badge>
						</div>
						<div class="mt-3 flex flex-wrap gap-1.5">
							{#each scheduleChips(lesson.timeslots) as chip (chip)}
								<Badge variant="outline">{chip}</Badge>
							{/each}
						</div>
						<div class="mt-3 text-sm text-muted-foreground">
							{lesson.trainerName} · {lesson.roomName}
						</div>
						<div class="mt-1 text-xs text-muted-foreground">
							{lesson.lastEnrolledDate
								? `Son dolu randevu: ${formatTurkishDate(lesson.lastEnrolledDate)}`
								: 'Kayıtlı öğrenci randevusu yok'}
						</div>
					</button>
				{/each}
			</div>
		{/if}
	</div>

	{#if selectedLesson}
		<Card.Root class="overflow-visible">
			<Card.Content class="space-y-6">
				<div class="grid gap-2">
					<Label class="font-semibold">Bitiş Tarihi</Label>
					<div class="date-picker-container relative w-fit">
						<Button variant="outline" onclick={() => (showDatePicker = !showDatePicker)}>
							<CalendarIcon size={16} />
							{formattedDate}
						</Button>
						{#if showDatePicker && selectedDate}
							<div class="absolute top-full left-0 z-50 mt-2">
								<DatePicker
									value={selectedDate}
									onDateSelect={handleDateSelect}
									onClose={() => (showDatePicker = false)}
									minDate={parseLocalDate(selectedLesson.minEndDate)}
								/>
							</div>
						{/if}
					</div>
					<p class="text-xs text-muted-foreground">
						Bu tarihten itibaren ders yapılmaz. En erken tarih {formatTurkishDate(
							selectedLesson.minEndDate
						)} — son dolu randevunun ertesi günü.
					</p>
				</div>

				<div class="flex justify-end">
					<Button variant="destructive" disabled={!dateForDB} onclick={() => (showConfirm = true)}>
						<CalendarOff size={16} />
						Grup Dersini Sonlandır
					</Button>
				</div>
			</Card.Content>
		</Card.Root>
	{/if}
</div>

<Modal bind:open={showConfirm} title="Grup Dersini Sonlandır" size="md">
	<div class="space-y-4">
		<Alert.Root variant="destructive">
			<TriangleAlert size={16} />
			<Alert.Description>
				Bu grup dersi sonlandırılacak ve bitiş tarihinden itibaren oluşturulmuş boş randevular
				silinecek. Bu işlem geri alınamaz.
			</Alert.Description>
		</Alert.Root>

		{#if selectedLesson}
			<div class="rounded bg-muted p-4 text-sm">
				<div><strong>Grup Dersi:</strong> {lessonLabel(selectedLesson)}</div>
				<div class="mt-1">
					<strong>Program:</strong>
					{scheduleChips(selectedLesson.timeslots).join(' · ')}
				</div>
				<div class="mt-1"><strong>Bitiş Tarihi:</strong> {formattedDate}</div>
			</div>
		{/if}

		<form method="POST" action="?/endGroupLesson" use:enhance={handleSubmit}>
			<input type="hidden" name="groupLessonId" value={selectedLessonId} />
			<input type="hidden" name="endDate" value={dateForDB} />
			<ModalFooter>
				<Button type="button" variant="outline" onclick={() => (showConfirm = false)}>Vazgeç</Button
				>
				<Button type="submit" variant="destructive" disabled={formLoading}>
					{#if formLoading}
						<LoaderCircle size={16} class="animate-spin" />
					{:else}
						<CalendarOff size={16} />
						Onayla
					{/if}
				</Button>
			</ModalFooter>
		</form>
	</div>
</Modal>
