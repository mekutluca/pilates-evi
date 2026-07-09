<script lang="ts">
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
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
	import PageHeader from '$lib/components/page-header.svelte';
	import Modal from '$lib/components/modal.svelte';
	import ActionMenu from '$lib/components/action-menu.svelte';
	import type { ActionItem, Trainee } from '$lib/types';
	import type { TraineePurchaseMembership } from '$lib/types';
	import { formatDisplayDate, calculatePackageEndDate } from '$lib/utils';
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
			return membership.left_at ? formatDisplayDate(membership.left_at) : 'Devam ediyor';
		}

		return calculatePackageEndDate(
			membership.joined_at,
			membership.package?.weeks_duration ?? null
		);
	}
</script>

<div class="space-y-6 p-6">
	<!-- Back button -->
	<Button variant="ghost" size="sm" onclick={() => history.back()}>
		<ChevronLeft size={20} />
	</Button>

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
						<Accordion.Item
							value={String(purchase.id)}
							class="rounded-lg border border-border px-4"
						>
							<Accordion.Trigger class="hover:no-underline">
								<div class="flex w-full items-center justify-between pr-2">
									<div class="flex items-center gap-3">
										<h4 class="font-semibold">{purchase.package?.name}</h4>
										<Badge variant="secondary">
											{purchase.package?.package_type === 'private' ? 'Özel' : 'Grup'}
										</Badge>
									</div>
									<span class="text-sm text-muted-foreground">
										{purchase.purchase_start_date
											? formatDisplayDate(purchase.purchase_start_date)
											: formatDisplayDate(purchase.joined_at)}
										-
										{getMembershipDisplayDate(purchase)}
									</span>
								</div>
							</Accordion.Trigger>
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
														{#if new Date(appointment.date) < new Date()}
															<Badge variant="outline">Geçmiş</Badge>
														{:else}
															<Badge>Gelecek</Badge>
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
		<div class="flex justify-end gap-2">
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
		</div>
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
		<div class="flex justify-end gap-2">
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
		</div>
	</form>
</Modal>
