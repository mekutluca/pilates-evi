<script lang="ts">
	import type { CreatePackageForm } from '$lib/types';
	import Medal from '@lucide/svelte/icons/medal';
	import CalendarSync from '@lucide/svelte/icons/calendar-sync';
	import ModalFooter from '$lib/components/modal-footer.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Card from '$lib/components/ui/card/index.js';

	// Props
	interface Props {
		onSubmit: (form: CreatePackageForm) => void;
		onCancel: () => void;
		isVisible?: boolean;
	}

	const { onSubmit, onCancel, isVisible = true }: Props = $props();

	// Local state for form fields
	let name = $state('');
	let description = $state('');
	let weeks_duration = $state(4);
	let min_lessons_per_week = $state(1);
	let max_lessons_per_week = $state(1);
	let max_capacity = $state(12);
	let package_type = $state<'private' | 'group'>('private');
	let reschedulable = $state(false);
	let reschedule_limit = $state<number | undefined>(undefined);

	function resetFormState() {
		name = '';
		description = '';
		weeks_duration = 4;
		min_lessons_per_week = 1;
		max_lessons_per_week = 1;
		max_capacity = 12;
		package_type = 'private';
		reschedulable = false;
		reschedule_limit = undefined;
	}

	let previouslyVisible = $state(isVisible);

	$effect(() => {
		if (previouslyVisible && !isVisible) {
			setTimeout(() => {
				resetFormState();
			}, 300);
		}
		previouslyVisible = isVisible;
	});

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		onSubmit({
			name,
			description,
			weeks_duration: package_type === 'group' ? null : weeks_duration,
			min_lessons_per_week,
			max_lessons_per_week,
			max_capacity,
			package_type,
			reschedulable,
			reschedule_limit: reschedulable ? reschedule_limit : undefined
		});
	}

	const showRescheduleLimit = $derived(reschedulable);

	const canProceedLocal = $derived(
		name.trim().length > 0 &&
			min_lessons_per_week > 0 &&
			max_lessons_per_week > 0 &&
			min_lessons_per_week <= max_lessons_per_week &&
			max_capacity > 0 &&
			package_type !== undefined &&
			(package_type === 'group' || (weeks_duration && weeks_duration > 0))
	);
</script>

<form class="space-y-4" onsubmit={handleSubmit}>
	<!-- Package Name -->
	<div class="grid gap-2">
		<Label for="package-name" class="font-semibold">Ders Adı *</Label>
		<Input
			id="package-name"
			type="text"
			placeholder="Örn: Başlangıç Pilates"
			bind:value={name}
			required
			autocomplete="off"
		/>
	</div>

	<!-- Package Description -->
	<div class="grid gap-2">
		<Label for="package-description" class="font-semibold">Açıklama</Label>
		<Textarea
			id="package-description"
			placeholder="Ders detayları..."
			rows={3}
			bind:value={description}
		/>
	</div>

	<!-- Basic Configuration - Row 1: Duration & Capacity -->
	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		<!-- Weeks Duration -->
		<div class="grid gap-2">
			<Label for="weeks-duration" class="font-medium">
				Ders Süresi (Hafta) {#if package_type === 'private'}*{/if}
			</Label>
			{#if package_type === 'private'}
				<Input
					id="weeks-duration"
					type="number"
					placeholder="Örn: 4"
					min="1"
					bind:value={weeks_duration}
					required
				/>
			{:else}
				<div
					class="flex h-9 w-full items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground"
				>
					Devamlı
				</div>
			{/if}
		</div>

		<!-- Max Capacity -->
		<div class="grid gap-2">
			<Label for="max-capacity" class="font-medium">Maksimum Kapasite *</Label>
			<Input
				id="max-capacity"
				type="number"
				placeholder="Örn: 12"
				min="1"
				max="50"
				bind:value={max_capacity}
				required
			/>
		</div>
	</div>

	<!-- Basic Configuration - Row 2: Min/Max Lessons -->
	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		<div class="grid gap-2">
			<Label for="min-lessons-per-week" class="font-medium">Min Haftalık Ders *</Label>
			<Input
				id="min-lessons-per-week"
				type="number"
				placeholder="Örn: 2"
				min="1"
				max="7"
				bind:value={min_lessons_per_week}
				required
			/>
		</div>

		<div class="grid gap-2">
			<Label for="max-lessons-per-week" class="font-medium">Max Haftalık Ders *</Label>
			<Input
				id="max-lessons-per-week"
				type="number"
				placeholder="Örn: 3"
				min="1"
				max="7"
				bind:value={max_lessons_per_week}
				required
			/>
		</div>
	</div>

	<!-- Advanced Configuration Cards -->
	<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
		<!-- Trainee Type Card -->
		<Card.Root>
			<Card.Content class="p-4">
				<div class="flex items-center gap-2">
					<div class="flex h-8 w-8 items-center justify-center rounded-full bg-warning/15">
						<Medal class="size-4 text-warning" />
					</div>
					<h3 class="text-sm font-semibold">Öğrenci Yönetimi</h3>
				</div>
				<Separator class="my-3" />

				<RadioGroup bind:value={package_type} class="space-y-2">
					<label
						class="flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted"
					>
						<RadioGroupItem value="private" />
						<div class="flex-1">
							<div class="text-sm font-medium">Özel ders</div>
							<div class="text-xs text-muted-foreground">Bireysel veya özel grup dersi</div>
						</div>
					</label>

					<label
						class="flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted"
					>
						<RadioGroupItem value="group" />
						<div class="flex-1">
							<div class="text-sm font-medium">Grup dersi</div>
							<div class="text-xs text-muted-foreground">Herkese açık grup dersi</div>
						</div>
					</label>
				</RadioGroup>
			</Card.Content>
		</Card.Root>

		<!-- Rescheduling Card -->
		<Card.Root>
			<Card.Content class="p-4">
				<div class="flex items-center gap-2">
					<div class="flex h-8 w-8 items-center justify-center rounded-full bg-warning/15">
						<CalendarSync class="size-4 text-warning" />
					</div>
					<h3 class="text-sm font-semibold">Randevu Değiştirme Ayarları</h3>
				</div>
				<Separator class="my-3" />

				<div class="space-y-3">
					<label
						class="flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted"
					>
						<Checkbox bind:checked={reschedulable} />
						<div class="flex-1">
							<div class="text-sm font-medium">Randevu Değiştirme İzni</div>
							<div class="text-xs text-muted-foreground">Derslerin zamanı değiştirilebilir</div>
						</div>
					</label>

					{#if showRescheduleLimit}
						<div class="rounded-lg bg-muted p-2">
							<div class="mb-2 text-xs text-muted-foreground">Değiştirme Limiti</div>
							<div class="flex items-center gap-2">
								<Input
									type="number"
									class="h-8 w-16"
									placeholder="∞"
									min="1"
									max="50"
									bind:value={reschedule_limit}
								/>
								<span class="text-xs text-muted-foreground">kez</span>
							</div>
						</div>
					{/if}
				</div>
			</Card.Content>
		</Card.Root>
	</div>

	<!-- Form Actions -->
	<ModalFooter>
		<Button type="button" variant="ghost" onclick={onCancel}>İptal</Button>
		<Button type="submit" disabled={!canProceedLocal}>Dersi Oluştur</Button>
	</ModalFooter>
</form>
