<script lang="ts">
	import { enhanceForm } from '$lib/utils/enhance';
	import { cn } from '$lib/utils';
	import { page } from '$app/state';
	import { streamed } from '$lib/utils/streamed.svelte';
	import LoadError from '$lib/components/load-error.svelte';
	import Mail from '@lucide/svelte/icons/mail';
	import Phone from '@lucide/svelte/icons/phone';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import MoveRight from '@lucide/svelte/icons/move-right';
	import Archive from '@lucide/svelte/icons/archive';
	import ArchiveRestore from '@lucide/svelte/icons/archive-restore';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import PageHeader from '$lib/components/page-header.svelte';
	import Modal from '$lib/components/modal.svelte';
	import ModalFooter from '$lib/components/modal-footer.svelte';
	import ActionMenu from '$lib/components/action-menu.svelte';
	import PatternChip from '$lib/components/pattern-chip.svelte';
	import LessonMeter from '$lib/components/lesson-meter.svelte';
	import { isRenewalDue } from '$lib/utils/appointment-utils';
	import { formatPhoneDisplay } from '$lib/utils/phone-utils';
	import type { ActionItem, KayitLesson, RemainingLessonsScope, TraineeKayit } from '$lib/types';
	import { formatDisplayDate, formatSlotLabel } from '$lib/utils/date-utils';
	import { enhance } from '$app/forms';
	import { validation } from '$lib/utils/validation';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Accordion from '$lib/components/ui/accordion/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group/index.js';
	import { CardSkeleton, PageHeaderSkeleton } from '$lib/components/skeletons/index.js';

	let { data } = $props();

	// Streamed: `undefined` = loading, `null` = failed; the loaded trainee stays on screen
	// while an action refreshes it
	const traineeData = streamed(
		() => data.trainee,
		() => page.params.id ?? ''
	);
	const kayitData = streamed(
		() => data.kayitlar,
		() => page.params.id ?? ''
	);
	// null: no such trainee
	const trainee = $derived(traineeData.current?.trainee);
	const kayitlar = $derived(kayitData.current);

	const active = $derived((kayitlar ?? []).filter((k) => k.upcoming.length > 0));
	const finished = $derived((kayitlar ?? []).filter((k) => k.upcoming.length === 0));

	let editMode = $state(false);
	let saving = $state(false);
	let showArchiveModal = $state(false);
	let showRestoreModal = $state(false);
	let archiving = $state(false);
	let expanded = $state<Record<string, boolean>>({});

	let deleteTarget = $state<TraineeKayit | null>(null);
	let deleteScope = $state<RemainingLessonsScope>('trainee');
	let deletingLessons = $state(false);
	let showDeleteModal = $state(false);

	const VISIBLE_LESSONS = 5;

	function openDelete(kayit: TraineeKayit) {
		deleteTarget = kayit;
		deleteScope = 'trainee';
		showDeleteModal = true;
	}

	function kayitActions(kayit: TraineeKayit): ActionItem[] {
		return [
			{
				label: 'Kalan dersleri sil',
				handler: () => openDelete(kayit),
				icon: Trash2,
				class: 'text-destructive'
			}
		];
	}

	// The calendar opens on the lesson's week and room with its panel ready
	function calendarLink(
		lesson: KayitLesson,
		action: 'move' | 'cancel',
		kayit: TraineeKayit
	): string {
		const params = new URLSearchParams({
			week: lesson.date,
			room: lesson.roomId,
			appointment: String(lesson.appointmentId),
			action
		});
		// In a group lesson only this trainee moves
		if (kayit.isGroup && trainee) params.set('trainee', trainee.id);
		return `/schedule?${params}`;
	}

	function formatNames(names: string[]): string {
		if (names.length <= 1) return names[0] ?? '';
		return `${names.slice(0, -1).join(', ')} ve ${names[names.length - 1]}`;
	}

	const menuActions = $derived<ActionItem[]>(
		trainee
			? trainee.is_active
				? [
						{
							label: 'Arşivle',
							handler: () => {
								showArchiveModal = true;
							},
							icon: Archive,
							class: 'text-destructive'
						}
					]
				: [
						{
							label: 'Geri yükle',
							handler: () => {
								showRestoreModal = true;
							},
							icon: ArchiveRestore
						}
					]
			: []
	);
</script>

<svelte:head>
	<title>{trainee ? `${trainee.name} · ` : ''}Öğrenci · Pilates Evi</title>
</svelte:head>

<div class="mx-auto w-full max-w-6xl space-y-6 p-4 lg:p-6">
	{#if trainee}
		<PageHeader title={trainee.name} back={{ href: '/trainees', label: 'Öğrenciler' }}>
			{#snippet actions()}
				{#if trainee?.is_active}
					<Button href="/new-assignment?trainee_id={trainee.id}">
						<Plus />
						Yeni kayıt
					</Button>
				{/if}
				<Button variant="outline" onclick={() => (editMode = !editMode)} disabled={saving}>
					<Pencil />
					Düzenle
				</Button>
				<ActionMenu actions={menuActions} ariaLabel="Öğrenci işlemleri" />
			{/snippet}
			<div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
				{#if !trainee.is_active}
					<Badge variant="outline">Arşivde</Badge>
				{/if}
				<a
					href="tel:+90{trainee.phone}"
					class="inline-flex items-center gap-1.5 hover:text-foreground"
				>
					<Phone class="size-3.5" />
					<span class="tabular-nums">{formatPhoneDisplay(trainee.phone)}</span>
				</a>
				{#if trainee.email}
					<a
						href="mailto:{trainee.email}"
						class="inline-flex min-w-0 items-center gap-1.5 break-all hover:text-foreground"
					>
						<Mail class="size-3.5" />
						{trainee.email}
					</a>
				{/if}
			</div>
		</PageHeader>
	{:else if traineeData.current === undefined}
		<PageHeaderSkeleton actions />
	{:else if traineeData.current === null}
		<LoadError message="Öğrenci yüklenemedi." />
	{:else}
		<Empty.Root class="border">
			<Empty.Header>
				<Empty.Title>Öğrenci bulunamadı</Empty.Title>
				<Empty.Description>Bu öğrenci mevcut değil veya kaldırılmış olabilir.</Empty.Description>
			</Empty.Header>
			<Empty.Content>
				<Button variant="outline" href="/trainees">Öğrencilere dön</Button>
			</Empty.Content>
		</Empty.Root>
	{/if}

	{#if trainee}
		<div class="grid gap-6 lg:grid-cols-3">
			<div class="space-y-4 lg:col-span-2">
				<h2 class="text-lg font-semibold">Kayıtlar</h2>
				{#if kayitlar === undefined}
					<CardSkeleton rows={3} rowClass="h-12" />
				{:else if kayitlar === null}
					<LoadError message="Kayıtlar yüklenemedi." />
				{:else if active.length === 0}
					<Empty.Root class="border">
						<Empty.Header>
							<Empty.Title>Devam eden kayıt yok</Empty.Title>
							<Empty.Description>
								{finished.length > 0
									? 'Önceki bir kaydı yenileyebilir ya da yeni kayıt açabilirsiniz.'
									: 'Bu öğrenciyi bir pakete kaydedin.'}
							</Empty.Description>
						</Empty.Header>
						{#if trainee.is_active}
							<Empty.Content>
								<Button href="/new-assignment?trainee_id={trainee.id}">
									<Plus />
									Yeni kayıt
								</Button>
							</Empty.Content>
						{/if}
					</Empty.Root>
				{/if}

				{#each active as kayit (kayit.id)}
					{@const next = kayit.upcoming[0]}
					{@const done = kayit.lessons.length - kayit.upcoming.length}
					{@const visible = expanded[kayit.id]
						? kayit.upcoming
						: kayit.upcoming.slice(0, VISIBLE_LESSONS)}
					<Card.Root>
						<Card.Header>
							<Card.Title class="flex flex-wrap items-center gap-2">
								{kayit.packageName}
								<Badge variant="outline">{kayit.isGroup ? 'Grup' : 'Özel'}</Badge>
							</Card.Title>
							<Card.Description class="flex flex-wrap items-center gap-x-3 gap-y-1">
								<PatternChip slots={kayit.slots} />
								<span>{kayit.roomName} · {kayit.trainerName}</span>
							</Card.Description>
							<Card.Action>
								<ActionMenu
									actions={kayitActions(kayit)}
									ariaLabel={`${kayit.packageName} işlemleri`}
								/>
							</Card.Action>
						</Card.Header>
						<Card.Content class="space-y-4">
							<LessonMeter
								{done}
								total={kayit.lessonCount}
								renewalDue={isRenewalDue(kayit.upcoming[kayit.upcoming.length - 1].date)}
							/>
							<dl class="flex flex-wrap gap-x-6 gap-y-1 text-sm">
								<div class="flex gap-1.5">
									<dt class="text-muted-foreground">Sıradaki</dt>
									<dd class="font-medium tabular-nums">{formatSlotLabel(next.date, next.hour)}</dd>
								</div>
								<div class="flex gap-1.5">
									<dt class="text-muted-foreground">Son ders</dt>
									<dd class="font-medium tabular-nums">
										{formatDisplayDate(kayit.upcoming[kayit.upcoming.length - 1].date)}
									</dd>
								</div>
								{#if !kayit.isGroup}
									<div class="flex gap-1.5">
										<dt class="text-muted-foreground">Değişiklik hakkı</dt>
										<dd class="font-medium tabular-nums">
											{kayit.creditsLeft >= 999 ? 'Sınırsız' : kayit.creditsLeft}
										</dd>
									</div>
								{/if}
							</dl>

							{#if kayit.sharedTrainees.length > 0}
								<p class="text-sm text-muted-foreground">
									Birlikte: {formatNames(kayit.sharedTrainees.map((t) => t.name))}
								</p>
							{/if}

							<div class="flex flex-wrap gap-2">
								<Button
									variant="outline"
									size="sm"
									href="/trainees/{trainee.id}/renew/{kayit.currentPurchaseId}"
								>
									<RefreshCw />
									Yenile<span class="sr-only">: {kayit.packageName}</span>
								</Button>
								<Button variant="outline" size="sm" href={calendarLink(next, 'move', kayit)}>
									<MoveRight />
									Taşı<span class="sr-only">: {kayit.packageName}</span>
								</Button>
							</div>

							<section aria-labelledby="upcoming-{kayit.id}">
								<h3 id="upcoming-{kayit.id}" class="mb-1 text-sm font-semibold">
									Yaklaşan randevular
								</h3>
								<ul class="divide-y text-sm">
									{#each visible as lesson (lesson.appointmentId)}
										<li class="flex items-center gap-3 py-1.5">
											<span class="min-w-0 flex-1 sm:flex sm:gap-3">
												<span class="block font-medium tabular-nums">
													{formatSlotLabel(lesson.date, lesson.hour)}
												</span>
												<span class="block truncate text-muted-foreground">
													{lesson.roomName} · {lesson.trainerName}
												</span>
											</span>
											<span class="flex shrink-0 gap-1">
												<Button
													variant="ghost"
													size="sm"
													href={calendarLink(lesson, 'move', kayit)}
												>
													Taşı<span class="sr-only"
														>: {formatSlotLabel(lesson.date, lesson.hour)}</span
													>
												</Button>
												{#if !kayit.isGroup}
													<Button
														variant="ghost"
														size="sm"
														href={calendarLink(lesson, 'cancel', kayit)}
													>
														İptal et<span class="sr-only"
															>: {formatSlotLabel(lesson.date, lesson.hour)}</span
														>
													</Button>
												{/if}
											</span>
										</li>
									{/each}
								</ul>
								{#if kayit.upcoming.length > VISIBLE_LESSONS}
									<Button
										variant="link"
										size="sm"
										class="px-0"
										onclick={() => (expanded[kayit.id] = !expanded[kayit.id])}
									>
										{expanded[kayit.id]
											? 'Daha az göster'
											: `Tüm yaklaşan randevular (${kayit.upcoming.length})`}
									</Button>
								{/if}
							</section>
						</Card.Content>
					</Card.Root>
				{/each}

				{#if finished.length > 0}
					<Accordion.Root type="single">
						<Accordion.Item value="finished" class="rounded-xl border px-4">
							<Accordion.Trigger>Geçmiş kayıtlar ({finished.length})</Accordion.Trigger>
							<Accordion.Content>
								<ul class="divide-y text-sm">
									{#each finished as kayit (kayit.id)}
										<li class="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
											<span class="font-medium">{kayit.packageName}</span>
											<PatternChip slots={kayit.slots} />
											<span class="text-muted-foreground">
												{kayit.lessons.length} ders
												{#if kayit.lessons.length > 0}
													· {formatDisplayDate(kayit.lessons[0].date)} – {formatDisplayDate(
														kayit.lessons[kayit.lessons.length - 1].date
													)}
												{/if}
											</span>
											{#if trainee.is_active}
												<Button
													variant="ghost"
													size="sm"
													class="ml-auto"
													href="/trainees/{trainee.id}/renew/{kayit.currentPurchaseId}"
												>
													Yenile<span class="sr-only">: {kayit.packageName}</span>
												</Button>
											{/if}
										</li>
									{/each}
								</ul>
							</Accordion.Content>
						</Accordion.Item>
					</Accordion.Root>
				{/if}
			</div>

			<!-- Editing on a phone brings the form above the kayıt cards -->
			<Card.Root class={cn('h-fit', editMode && 'max-lg:order-first')}>
				<Card.Header>
					<Card.Title>Bilgiler</Card.Title>
				</Card.Header>
				<Card.Content>
					{#if editMode}
						<form
							method="POST"
							action="?/update"
							class="space-y-4"
							use:enhance={enhanceForm({
								busy: (b) => (saving = b),
								success: 'Öğrenci güncellendi',
								onSuccess: () => {
									editMode = false;
								}
							})}
						>
							<div class="grid gap-2">
								<Label for="name">Ad soyad</Label>
								<Input name="name" id="name" value={trainee.name} required />
							</div>
							<div class="grid gap-2">
								<Label for="phone">Telefon</Label>
								<Input type="tel" name="phone" id="phone" value={trainee.phone} required />
							</div>
							<div class="grid gap-2">
								<Label for="email">E-posta</Label>
								<Input
									type="email"
									name="email"
									id="email"
									value={trainee.email ?? ''}
									pattern={validation.email.pattern}
									title={validation.email.title}
								/>
							</div>
							<div class="grid gap-2">
								<Label for="notes">Notlar</Label>
								<Textarea name="notes" id="notes" rows={4} value={trainee.notes ?? ''} />
							</div>
							<div class="flex justify-end gap-2">
								<Button type="button" variant="outline" onclick={() => (editMode = false)}>
									Vazgeç
								</Button>
								<Button type="submit" disabled={saving}>
									{#if saving}<LoaderCircle class="animate-spin" />{/if}
									Kaydet
								</Button>
							</div>
						</form>
					{:else}
						<dl class="space-y-3 text-sm">
							<div>
								<dt class="text-muted-foreground">Kayıt tarihi</dt>
								<dd class="font-medium">{formatDisplayDate(trainee.created_at)}</dd>
							</div>
							<div>
								<dt class="text-muted-foreground">Notlar</dt>
								<dd class="whitespace-pre-wrap">
									{trainee.notes || 'Not yok'}
								</dd>
							</div>
						</dl>
					{/if}
				</Card.Content>
			</Card.Root>
		</div>
	{/if}
</div>

<Modal bind:open={showArchiveModal} title="Öğrenciyi arşivle">
	<p class="mb-4 text-sm">
		<strong>{trainee?.name}</strong> arşivlenir ve öğrenci listesinde gizlenir. Yaklaşan dersleri takvimde
		kalır; gerekiyorsa önce "Kalan dersleri sil" ile kaldırın.
	</p>
	<form
		method="POST"
		action="?/archiveTrainee"
		use:enhance={enhanceForm({
			busy: (b) => (archiving = b),
			success: 'Öğrenci arşivlendi',
			onSuccess: () => {
				showArchiveModal = false;
			}
		})}
	>
		<ModalFooter>
			<Button type="button" variant="outline" onclick={() => (showArchiveModal = false)}>
				Vazgeç
			</Button>
			<Button type="submit" variant="destructive" disabled={archiving}>
				{#if archiving}<LoaderCircle class="animate-spin" />{:else}<Archive />{/if}
				Öğrenciyi arşivle
			</Button>
		</ModalFooter>
	</form>
</Modal>

<Modal bind:open={showRestoreModal} title="Öğrenciyi geri yükle">
	<p class="mb-4 text-sm">
		<strong>{trainee?.name}</strong> yeniden öğrenci listesinde görünür.
	</p>
	<form
		method="POST"
		action="?/restoreTrainee"
		use:enhance={enhanceForm({
			busy: (b) => (archiving = b),
			success: 'Öğrenci geri yüklendi',
			onSuccess: () => {
				showRestoreModal = false;
			}
		})}
	>
		<ModalFooter>
			<Button type="button" variant="outline" onclick={() => (showRestoreModal = false)}>
				Vazgeç
			</Button>
			<Button type="submit" disabled={archiving}>
				{#if archiving}<LoaderCircle class="animate-spin" />{:else}<ArchiveRestore />{/if}
				Öğrenciyi geri yükle
			</Button>
		</ModalFooter>
	</form>
</Modal>

<Modal bind:open={showDeleteModal} title="Kalan dersleri sil">
	{#if deleteTarget}
		{@const remaining = deleteTarget.upcoming}
		{@const teammates = deleteTarget.sharedTrainees}
		{@const teammateNames = formatNames(teammates.map((t) => t.name))}
		{@const isShared = !deleteTarget.isGroup && teammates.length > 0}
		<div class="space-y-4 text-sm">
			<div class="rounded-md bg-muted p-3">
				<div class="flex items-center justify-between gap-3">
					<span class="font-medium">{deleteTarget.packageName}</span>
					<span class="font-medium tabular-nums">{remaining.length} ders</span>
				</div>
				{#if remaining.length > 0}
					<p class="mt-1 text-muted-foreground">
						{formatSlotLabel(remaining[0].date, remaining[0].hour)}
						{#if remaining.length > 1}
							– {formatSlotLabel(
								remaining[remaining.length - 1].date,
								remaining[remaining.length - 1].hour
							)}
						{/if}
					</p>
				{/if}
			</div>
			<p class="text-muted-foreground">Geri alınamaz. Geçmiş dersler etkilenmez.</p>

			<form
				method="POST"
				action="?/deleteRemainingLessons"
				class="space-y-4"
				use:enhance={enhanceForm({
					// The action's own message carries the count ("N ders silindi")
					busy: (b) => (deletingLessons = b),
					onSuccess: () => {
						showDeleteModal = false;
					}
				})}
			>
				<input type="hidden" name="purchaseIds" value={deleteTarget.purchaseIds.join(',')} />
				{#if isShared}
					<input type="hidden" name="scope" value={deleteScope} />
					<div class="grid gap-2">
						<Label id="delete-scope-label">Bu derslere {teammateNames} de katılıyor</Label>
						<RadioGroup
							aria-labelledby="delete-scope-label"
							value={deleteScope}
							onValueChange={(v) => (deleteScope = v as RemainingLessonsScope)}
						>
							<label class="flex cursor-pointer items-start gap-3">
								<RadioGroupItem value="trainee" class="mt-0.5" />
								<span>
									Yalnızca {trainee?.name} çıkarılsın
									<span class="block text-xs text-muted-foreground">
										Dersler {teammateNames} için takvimde kalır
									</span>
								</span>
							</label>
							<label class="flex cursor-pointer items-start gap-3">
								<RadioGroupItem value="all" class="mt-0.5" />
								<span>
									Dersler tamamen silinsin
									<span class="block text-xs text-muted-foreground">
										{teammateNames} de bu dersleri kaybeder; oda ve eğitmen saatleri boşalır
									</span>
								</span>
							</label>
						</RadioGroup>
					</div>
				{:else if deleteTarget.isGroup}
					<p class="text-muted-foreground">
						{trainee?.name} kalan grup derslerinden çıkarılır; grup dersi diğerleri için devam eder.
					</p>
				{:else}
					<p class="text-muted-foreground">
						Dersler takvimden silinir; oda ve eğitmen saatleri boşalır.
					</p>
				{/if}
				<ModalFooter>
					<Button type="button" variant="outline" onclick={() => (showDeleteModal = false)}>
						Vazgeç
					</Button>
					<Button type="submit" variant="destructive" disabled={deletingLessons}>
						{#if deletingLessons}<LoaderCircle class="animate-spin" />{:else}<Trash2 />{/if}
						{remaining.length} dersi sil
					</Button>
				</ModalFooter>
			</form>
		</div>
	{/if}
</Modal>
