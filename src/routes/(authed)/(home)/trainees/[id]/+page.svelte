<script lang="ts">
	import Mail from '@lucide/svelte/icons/mail';
	import Phone from '@lucide/svelte/icons/phone';
	import Calendar from '@lucide/svelte/icons/calendar';
	import PackageIcon from '@lucide/svelte/icons/package';
	import StickyNote from '@lucide/svelte/icons/sticky-note';
	import User from '@lucide/svelte/icons/user';
	import Edit from '@lucide/svelte/icons/edit';
	import Save from '@lucide/svelte/icons/save';
	import X from '@lucide/svelte/icons/x';
	import Archive from '@lucide/svelte/icons/archive';
	import ArchiveRestore from '@lucide/svelte/icons/archive-restore';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import PageHeader from '$lib/components/page-header.svelte';
	import BackButton from '$lib/components/back-button.svelte';
	import Modal from '$lib/components/modal.svelte';
	import ModalFooter from '$lib/components/modal-footer.svelte';
	import ActionMenu from '$lib/components/action-menu.svelte';
	import type { ActionItem, PurchaseAppointment, RemainingLessonsScope, Trainee } from '$lib/types';
	import type { TraineePurchaseMembership } from '$lib/types';
	import { formatDisplayDate, calculatePackageEndDate, isAppointmentFuture } from '$lib/utils';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { getActionErrorMessage } from '$lib/utils/form-utils';
	import { validation } from '$lib/utils/validation';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Accordion from '$lib/components/ui/accordion/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { RadioGroup, RadioGroupItem } from '$lib/components/ui/radio-group/index.js';
	import { CardSkeleton, PageHeaderSkeleton } from '$lib/components/skeletons/index.js';

	let { data } = $props();

	// Streamed data resolved into local state. `undefined` = loading, `null` = not
	// found / failed. Stale values are kept during invalidation to avoid flashing
	// skeletons after form actions.
	let trainee = $state<Trainee | null | undefined>(undefined);
	let groupMemberships = $state<TraineePurchaseMembership[] | null | undefined>(undefined);

	$effect(() => {
		const promise = data.trainee;
		promise.then((result) => {
			if (data.trainee === promise) trainee = result;
		});
	});

	$effect(() => {
		const promise = data.groupMemberships;
		promise.then((result) => {
			if (data.groupMemberships === promise) groupMemberships = result;
		});
	});

	// Edit mode state
	let editMode = $state(false);
	let saving = $state(false);

	// Archive/restore state
	let showArchiveModal = $state(false);
	let showRestoreModal = $state(false);
	let archiving = $state(false);

	// Delete remaining lessons state
	let showDeleteLessonsModal = $state(false);
	let deleteTarget = $state<TraineePurchaseMembership | null>(null);
	let deleteScope = $state<RemainingLessonsScope>('trainee');
	let deletingLessons = $state(false);

	// Upcoming appointments of a purchase: the ones "Kalan Dersleri Sil" removes.
	function getRemainingAppointments(membership: TraineePurchaseMembership): PurchaseAppointment[] {
		return (membership.appointments ?? []).filter((a) => isAppointmentFuture(a.date, a.hour));
	}

	function openDeleteLessons(membership: TraineePurchaseMembership) {
		deleteTarget = membership;
		deleteScope = 'trainee';
		showDeleteLessonsModal = true;
	}

	function closeDeleteLessons() {
		showDeleteLessonsModal = false;
		deleteTarget = null;
		deleteScope = 'trainee';
	}

	function getPurchaseActions(membership: TraineePurchaseMembership): ActionItem[] {
		return [
			{
				label: 'Kalan Dersleri Sil',
				handler: () => openDeleteLessons(membership),
				icon: Trash2,
				class: 'text-destructive'
			}
		];
	}

	function formatNames(names: string[]): string {
		if (names.length <= 1) return names[0] ?? '';
		return `${names.slice(0, -1).join(', ')} ve ${names[names.length - 1]}`;
	}

	// Action menu items
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
							label: 'Geri Yükle',
							handler: () => {
								showRestoreModal = true;
							},
							icon: ArchiveRestore
						}
					]
			: []
	);

	// Filter memberships with packages and sort by start date (descending)
	const sortedPurchases = $derived(
		(groupMemberships ?? [])
			.filter((membership) => membership.package)
			.sort((a, b) => new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime())
	);

	// When any row has actions, every row reserves the menu slot so chevrons stay in one column.
	const hasPurchaseActions = $derived(
		sortedPurchases.some((p) => getRemainingAppointments(p).length > 0)
	);

	function toggleEditMode() {
		editMode = !editMode;
	}

	function cancelEdit() {
		editMode = false;
	}

	// Get the display date for a membership based on package type
	function getMembershipDisplayDate(membership: TraineePurchaseMembership): string {
		if (membership.purchase_end_date) {
			return formatDisplayDate(membership.purchase_end_date);
		}

		if (membership.package?.package_type === 'group') {
			return 'Devam ediyor';
		}

		return calculatePackageEndDate(
			membership.joined_at,
			membership.package?.weeks_duration ?? null
		);
	}
</script>

<svelte:head>
	<title>{trainee ? `${trainee.name} · ` : ''}Öğrenci Detayları · Pilates Evi</title>
</svelte:head>

<div class="space-y-6 p-6">
	<div>
		<BackButton href="/trainees" label="Öğrenciler" />
		{#if trainee}
			<!-- Header -->
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-3">
					<PageHeader title={trainee.name} subtitle="Öğrenci Detayları" />
					{#if !trainee.is_active}
						<Badge variant="destructive">Arşivlendi</Badge>
					{/if}
				</div>
				<div class="flex gap-2">
					{#if editMode}
						<Button variant="ghost" size="sm" onclick={cancelEdit} disabled={saving}>
							<X size={16} />
							İptal
						</Button>
						<Button type="submit" form="trainee-form" size="sm" disabled={saving}>
							{#if saving}
								<LoaderCircle size={16} class="animate-spin" />
							{:else}
								<Save size={16} />
							{/if}
							Kaydet
						</Button>
					{:else}
						<Button size="sm" onclick={toggleEditMode} disabled={saving}>
							<Edit size={16} />
							Düzenle
						</Button>
					{/if}

					<ActionMenu actions={menuActions} />
				</div>
			</div>
		{:else if trainee === undefined}
			<PageHeaderSkeleton actions />
		{:else}
			<PageHeader title="Öğrenci" subtitle="Öğrenci Detayları" />
		{/if}
	</div>

	{#if trainee}
		<!-- Personal Details and Notes Row -->
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
			<!-- Personal Details Card -->
			<Card.Root class="lg:col-span-2">
				<Card.Header>
					<Card.Title class="flex items-center gap-2 text-lg">
						<User size={20} class="text-muted-foreground" />
						Kişisel Bilgiler
					</Card.Title>
				</Card.Header>
				<Card.Content>
					{#if editMode}
						<form
							id="trainee-form"
							method="POST"
							action="?/update"
							use:enhance={() => {
								saving = true;
								return async ({ result, update }) => {
									if (result.type === 'success') {
										editMode = false;
									}
									saving = false;
									await update();
								};
							}}
							class="space-y-4"
						>
							<div class="grid gap-2">
								<Label for="name">Ad Soyad</Label>
								<Input type="text" name="name" id="name" value={trainee.name} required />
							</div>

							<div class="grid gap-2">
								<Label for="email">Email</Label>
								<Input
									type="email"
									name="email"
									id="email"
									value={trainee.email || ''}
									pattern={validation.email.pattern}
									title={validation.email.title}
								/>
							</div>

							<div class="grid gap-2">
								<Label for="phone">Telefon</Label>
								<Input
									type="tel"
									name="phone"
									id="phone"
									value={trainee.phone}
									pattern={validation.phone.pattern}
									title={validation.phone.title}
									maxlength={validation.phone.maxlength}
									required
								/>
							</div>
						</form>
					{:else}
						<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
							<div class="flex items-center gap-3 rounded-lg bg-muted p-3">
								<Mail size={16} class="text-muted-foreground" />
								<div>
									<p class="text-xs text-muted-foreground">Email</p>
									<a
										href="mailto:{trainee.email}"
										class="font-medium transition-colors hover:text-foreground"
									>
										{trainee.email}
									</a>
								</div>
							</div>

							<div class="flex items-center gap-3 rounded-lg bg-muted p-3">
								<Phone size={16} class="text-muted-foreground" />
								<div>
									<p class="text-xs text-muted-foreground">Telefon</p>
									<a
										href="tel:+90{trainee.phone}"
										class="font-medium transition-colors hover:text-foreground"
									>
										{trainee.phone}
									</a>
								</div>
							</div>

							<div class="flex items-center gap-3 rounded-lg bg-muted p-3 md:col-span-2">
								<Calendar size={16} class="text-muted-foreground" />
								<div>
									<p class="text-xs text-muted-foreground">Kayıt Tarihi</p>
									<p class="font-medium">{formatDisplayDate(trainee.created_at)}</p>
								</div>
							</div>
						</div>
					{/if}
				</Card.Content>
			</Card.Root>

			<!-- Notes Section -->
			<Card.Root>
				<Card.Header>
					<Card.Title class="flex items-center gap-2 text-lg">
						<StickyNote size={20} class="text-muted-foreground" />
						Notlar
					</Card.Title>
				</Card.Header>
				<Card.Content>
					{#if editMode}
						<Textarea
							name="notes"
							placeholder="Öğrenci notları..."
							rows={4}
							form="trainee-form"
							value={trainee.notes || ''}
						/>
					{:else}
						<div class="rounded-lg bg-muted p-3">
							{#if trainee.notes}
								<p class="text-sm whitespace-pre-wrap">{trainee.notes}</p>
							{:else}
								<p class="text-sm text-muted-foreground italic">Henüz not eklenmemiş</p>
							{/if}
						</div>
					{/if}
				</Card.Content>
			</Card.Root>
		</div>
	{:else if trainee === undefined}
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
			<CardSkeleton class="lg:col-span-2" rows={3} />
			<CardSkeleton rows={1} rowClass="h-24" />
		</div>
	{:else}
		<Card.Root>
			<Card.Content class="py-12 text-center">
				<User size={48} class="mx-auto mb-4 text-muted-foreground/40" />
				<h3 class="mb-2 text-lg font-semibold text-muted-foreground">Öğrenci bulunamadı</h3>
				<p class="text-muted-foreground/70">Bu öğrenci mevcut değil veya kaldırılmış olabilir.</p>
			</Card.Content>
		</Card.Root>
	{/if}

	<!-- All Purchases -->
	{#if trainee === null}
		<!-- Trainee not found; skip purchases -->
	{:else if groupMemberships === undefined}
		<CardSkeleton rows={3} rowClass="h-12" />
	{:else if groupMemberships === null}
		<Card.Root>
			<Card.Content class="py-12 text-center">
				<PackageIcon size={48} class="mx-auto mb-4 text-muted-foreground/40" />
				<h3 class="mb-2 text-lg font-semibold text-muted-foreground">Satın alımlar yüklenemedi</h3>
				<p class="text-muted-foreground/70">Lütfen sayfayı yenileyip tekrar deneyin.</p>
			</Card.Content>
		</Card.Root>
	{:else if sortedPurchases.length > 0}
		<Card.Root>
			<Card.Header>
				<Card.Title class="flex items-center gap-2 text-lg">
					<PackageIcon size={20} class="text-muted-foreground" />
					Satın Alımlar
				</Card.Title>
			</Card.Header>
			<Card.Content>
				<Accordion.Root type="multiple" class="space-y-2">
					{#each sortedPurchases as purchase (purchase.id)}
						{@const remainingCount = getRemainingAppointments(purchase).length}
						<Accordion.Item
							value={String(purchase.id)}
							class="rounded-lg border border-border px-4"
						>
							<!-- The kebab sits beside the trigger, not inside it, so it stays a separate control.
							     bits-ui renders the accordion header as a div[role=heading]; stretch it to fill the row. -->
							<div
								class="flex items-center gap-1 [&>[role=heading]]:min-w-0 [&>[role=heading]]:flex-1"
							>
								<Accordion.Trigger class="min-w-0 items-center gap-3 hover:no-underline">
									<div
										class="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
									>
										<div class="flex min-w-0 items-center gap-3">
											<span class="truncate font-semibold">{purchase.package?.name}</span>
											<Badge variant="secondary">
												{purchase.package?.package_type === 'private' ? 'Özel' : 'Grup'}
											</Badge>
										</div>
										<div
											class="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground tabular-nums sm:shrink-0"
										>
											{#if remainingCount > 0}
												<span>{remainingCount} ders kaldı</span>
											{/if}
											<!-- Each date stays whole; a narrow row breaks only at the range dash -->
											<span>
												<span class="whitespace-nowrap">
													{purchase.purchase_start_date
														? formatDisplayDate(purchase.purchase_start_date)
														: formatDisplayDate(purchase.joined_at)}
												</span>
												-
												<span class="whitespace-nowrap">{getMembershipDisplayDate(purchase)}</span>
											</span>
										</div>
									</div>
								</Accordion.Trigger>
								{#if hasPurchaseActions}
									<!-- -mr-2 pulls the icon button into the row padding so the glyph mirrors the left inset -->
									<div class="-mr-2 flex size-8 shrink-0 items-center justify-center">
										{#if remainingCount > 0}
											<ActionMenu actions={getPurchaseActions(purchase)} />
										{/if}
									</div>
								{/if}
							</div>
							<Accordion.Content>
								{#if purchase.appointments && purchase.appointments.length > 0}
									<div class="rounded-lg border border-border">
										<div class="border-b border-border bg-muted px-4 py-2">
											<h5 class="text-sm font-semibold">Randevular</h5>
										</div>
										<div class="max-h-60 overflow-y-auto">
											<div class="divide-y divide-border">
												{#each purchase.appointments as appointment (appointment.id)}
													<div class="flex items-center justify-between px-4 py-2 hover:bg-muted">
														<div class="flex items-center gap-3">
															<Calendar size={14} class="text-muted-foreground" />
															<span class="text-sm">
																{formatDisplayDate(appointment.date)} - {appointment.hour}:00
															</span>
														</div>
														{#if isAppointmentFuture(appointment.date, appointment.hour)}
															<Badge>Gelecek</Badge>
														{:else}
															<Badge variant="outline">Geçmiş</Badge>
														{/if}
													</div>
												{/each}
											</div>
										</div>
									</div>
								{/if}
							</Accordion.Content>
						</Accordion.Item>
					{/each}
				</Accordion.Root>
			</Card.Content>
		</Card.Root>
	{:else}
		<Card.Root>
			<Card.Content class="py-12 text-center">
				<PackageIcon size={48} class="mx-auto mb-4 text-muted-foreground/40" />
				<h3 class="mb-2 text-lg font-semibold text-muted-foreground">
					Henüz satın alım yapılmamış
				</h3>
				<p class="text-muted-foreground/70">Bu öğrenci henüz herhangi bir paket satın almamış.</p>
			</Card.Content>
		</Card.Root>
	{/if}
</div>

<!-- Archive Confirmation Modal -->
<Modal bind:open={showArchiveModal} title="Öğrenciyi Arşivle">
	<p class="mb-4">
		<strong>{trainee?.name}</strong> adlı öğrenciyi arşivlemek istediğinizden emin misiniz? Arşivlenen
		öğrenciler listede görünmez hale gelecektir.
	</p>
	<form
		method="POST"
		action="?/archiveTrainee"
		use:enhance={() => {
			archiving = true;
			return async ({ result, update }) => {
				archiving = false;
				if (result.type === 'success') {
					toast.success('Öğrenci başarıyla arşivlendi');
					showArchiveModal = false;
				} else if (result.type === 'failure') {
					toast.error(getActionErrorMessage(result));
				}
				await update();
			};
		}}
	>
		<ModalFooter>
			<Button type="button" variant="outline" onclick={() => (showArchiveModal = false)}>
				İptal
			</Button>
			<Button type="submit" variant="destructive" disabled={archiving}>
				{#if archiving}
					<LoaderCircle size={16} class="animate-spin" />
				{:else}
					<Archive size={16} />
				{/if}
				Arşivle
			</Button>
		</ModalFooter>
	</form>
</Modal>

<!-- Restore Confirmation Modal -->
<Modal bind:open={showRestoreModal} title="Öğrenciyi Geri Yükle">
	<p class="mb-4">
		<strong>{trainee?.name}</strong> adlı öğrenciyi geri yüklemek istediğinizden emin misiniz? Öğrenci
		aktif öğrenciler listesinde görünür hale gelecektir.
	</p>
	<form
		method="POST"
		action="?/restoreTrainee"
		use:enhance={() => {
			archiving = true;
			return async ({ result, update }) => {
				archiving = false;
				if (result.type === 'success') {
					toast.success('Öğrenci başarıyla geri yüklendi');
					showRestoreModal = false;
				} else if (result.type === 'failure') {
					toast.error(getActionErrorMessage(result));
				}
				await update();
			};
		}}
	>
		<ModalFooter>
			<Button type="button" variant="outline" onclick={() => (showRestoreModal = false)}>
				İptal
			</Button>
			<Button type="submit" disabled={archiving}>
				{#if archiving}
					<LoaderCircle size={16} class="animate-spin" />
				{:else}
					<ArchiveRestore size={16} />
				{/if}
				Geri Yükle
			</Button>
		</ModalFooter>
	</form>
</Modal>

<!-- Delete Remaining Lessons Modal -->
<Modal bind:open={showDeleteLessonsModal} title="Kalan Dersleri Sil" onClose={closeDeleteLessons}>
	{#if deleteTarget}
		{@const remaining = getRemainingAppointments(deleteTarget)}
		{@const isGroup = deleteTarget.package?.package_type === 'group'}
		{@const teammates = deleteTarget.shared_trainees ?? []}
		{@const teammateNames = formatNames(teammates.map((t) => t.name))}
		{@const isShared = !isGroup && teammates.length > 0}
		{@const first = remaining[0]}
		{@const last = remaining[remaining.length - 1]}
		<div class="space-y-4">
			<Alert.Root variant="destructive">
				<TriangleAlert size={16} />
				<Alert.Description>Bu işlem geri alınamaz. Geçmiş dersler etkilenmez.</Alert.Description>
			</Alert.Root>

			<div class="rounded-lg bg-muted p-4 text-sm">
				<div class="flex items-center justify-between gap-3">
					<div class="flex min-w-0 items-center gap-2">
						<span class="truncate font-semibold">{deleteTarget.package?.name}</span>
						<Badge variant="secondary">{isGroup ? 'Grup' : 'Özel'}</Badge>
					</div>
					<span class="shrink-0 font-medium tabular-nums">{remaining.length} ders</span>
				</div>
				{#if first && last}
					<p class="mt-1 text-muted-foreground">
						{#if remaining.length === 1}
							{formatDisplayDate(first.date)} · {first.hour}:00
						{:else}
							{formatDisplayDate(first.date)} - {formatDisplayDate(last.date)}
						{/if}
					</p>
				{/if}
				{#if deleteTarget.pe_purchases?.successor_id}
					<p class="mt-2 text-xs text-muted-foreground">
						Bu satın alımın bir uzatması var; uzatmadaki dersler etkilenmez.
					</p>
				{/if}
			</div>

			<form
				method="POST"
				action="?/deleteRemainingLessons"
				class="space-y-4"
				use:enhance={() => {
					deletingLessons = true;
					return async ({ result, update }) => {
						deletingLessons = false;
						if (result.type === 'success') {
							const data = result.data as { message?: string } | undefined;
							toast.success(data?.message || 'Kalan dersler silindi');
							closeDeleteLessons();
						} else if (result.type === 'failure') {
							toast.error(getActionErrorMessage(result));
						}
						await update();
					};
				}}
			>
				<input type="hidden" name="purchaseId" value={deleteTarget.id} />
				{#if isShared}
					<input type="hidden" name="scope" value={deleteScope} />
					<div class="grid gap-2">
						<Label>Bu derslere {teammateNames} de katılıyor</Label>
						<RadioGroup
							value={deleteScope}
							onValueChange={(v) => (deleteScope = v as RemainingLessonsScope)}
							class="space-y-2"
						>
							<label class="flex cursor-pointer items-start gap-3">
								<RadioGroupItem value="trainee" class="mt-0.5" />
								<div class="flex flex-col">
									<span class="text-sm">Yalnızca {trainee?.name} çıkarılsın</span>
									<span class="text-xs text-muted-foreground">
										Randevular {teammateNames} için takvimde kalır
									</span>
								</div>
							</label>
							<label class="flex cursor-pointer items-start gap-3">
								<RadioGroupItem value="all" class="mt-0.5" />
								<div class="flex flex-col">
									<span class="text-sm">Randevular tamamen silinsin</span>
									<span class="text-xs text-muted-foreground">
										{teammateNames} de bu dersleri kaybeder; oda ve eğitmen saatleri boşalır
									</span>
								</div>
							</label>
						</RadioGroup>
					</div>
				{:else if isGroup}
					<p class="text-sm text-muted-foreground">
						{trainee?.name} kalan grup derslerinden çıkarılır. Grup dersi diğer öğrenciler için devam
						eder.
					</p>
				{:else}
					<p class="text-sm text-muted-foreground">
						Bu derslerde başka öğrenci yok. Randevular takvimden silinir; oda ve eğitmen saatleri
						boşalır.
					</p>
				{/if}
				<ModalFooter>
					<Button type="button" variant="outline" onclick={closeDeleteLessons}>Vazgeç</Button>
					<Button type="submit" variant="destructive" disabled={deletingLessons}>
						{#if deletingLessons}
							<LoaderCircle size={16} class="animate-spin" />
						{:else}
							<Trash2 size={16} />
						{/if}
						{remaining.length} Dersi Sil
					</Button>
				</ModalFooter>
			</form>
		</div>
	{/if}
</Modal>
