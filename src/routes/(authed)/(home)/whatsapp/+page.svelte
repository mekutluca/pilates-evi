<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { toast } from 'svelte-sonner';
	import type { ActionItem } from '$lib/types';
	import type { WaFlowIssue } from '$lib/types/WhatsApp';
	import type { WaFlow, WaTemplate } from '$lib/types/WhatsAppTemplate';
	import { WA_FLOWS, bodySegments, previewValues } from '$lib/whatsapp/template-params';
	import { streamed } from '$lib/utils/streamed.svelte';
	import { enhanceForm } from '$lib/utils/enhance';
	import { actionResultMessage, postAction } from '$lib/utils/api-client';
	import PageHeader from '$lib/components/page-header.svelte';
	import LoadError from '$lib/components/load-error.svelte';
	import ActionMenu from '$lib/components/action-menu.svelte';
	import Modal from '$lib/components/modal.svelte';
	import ModalFooter from '$lib/components/modal-footer.svelte';
	import WaMessagePreview from '$lib/components/whatsapp/wa-message-preview.svelte';
	import WaTemplateStatusBadge from '$lib/components/whatsapp/wa-template-status-badge.svelte';
	import WaTemplateSheet from '$lib/components/whatsapp/wa-template-sheet.svelte';
	import WaFlowSheet from '$lib/components/whatsapp/wa-flow-sheet.svelte';
	import WaImportDialog from '$lib/components/whatsapp/wa-import-dialog.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import Plus from '@lucide/svelte/icons/plus';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import Download from '@lucide/svelte/icons/download';
	import Pencil from '@lucide/svelte/icons/pencil';
	import ListX from '@lucide/svelte/icons/list-x';
	import Clock from '@lucide/svelte/icons/clock';
	import BellOff from '@lucide/svelte/icons/bell-off';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import MessageCircleOff from '@lucide/svelte/icons/message-circle-off';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';

	let { data } = $props();

	const loaded = streamed(
		() => data.page,
		() => page.url.pathname
	);
	const whatsapp = $derived(loaded.current);

	let templateSheetOpen = $state(false);
	let editingTemplate = $state<WaTemplate | null>(null);
	let flowSheetOpen = $state(false);
	let editingFlow = $state<WaFlow | null>(null);
	let importOpen = $state(false);
	// Each opening remounts its sheet ({#key}) so the form starts from what was clicked
	let templateSession = $state(0);
	let flowSession = $state(0);
	let importSession = $state(0);
	let removing = $state<WaTemplate | null>(null);
	let removeOpen = $state(false);
	let busy = $state(false);

	const templateById = $derived(new Map((whatsapp?.templates ?? []).map((t) => [t.id, t])));

	// The new version waiting to replace a template, if any
	function waitingFor(templateId: string): WaTemplate | null {
		return whatsapp?.templates.find((t) => t.replacesId === templateId) ?? null;
	}

	function usedBy(templateId: string): string[] {
		return (whatsapp?.flows ?? [])
			.filter((f) => f.templateId === templateId)
			.map((f) => WA_FLOWS[f.key].title);
	}

	function openTemplate(template: WaTemplate | null) {
		editingTemplate = template;
		templateSession++;
		templateSheetOpen = true;
	}

	function openFlow(flow: WaFlow) {
		editingFlow = flow;
		flowSession++;
		flowSheetOpen = true;
	}

	function openImport() {
		importSession++;
		importOpen = true;
	}

	async function refreshStatuses() {
		const pending = toast.loading('Durumlar WhatsApp’tan alınıyor…');
		const result = await postAction('refresh', new FormData());
		if (result.type === 'success') {
			toast.success(result.data?.message ?? 'Şablonlar güncel.', { id: pending });
			await invalidateAll();
		} else {
			toast.error(actionResultMessage(result), { id: pending });
		}
	}

	const listActions: ActionItem[] = [
		{ label: 'WhatsApp’tan ekle', icon: Download, handler: openImport },
		{ label: 'Durumları yenile', icon: RefreshCw, handler: refreshStatuses }
	];

	function templateActions(template: WaTemplate): ActionItem[] {
		return [
			{ label: 'Düzenle', icon: Pencil, handler: () => openTemplate(template) },
			{
				label: 'Listeden kaldır',
				icon: ListX,
				class: 'text-destructive',
				handler: () => {
					removing = template;
					removeOpen = true;
				}
			}
		];
	}

	// A message that goes out says nothing extra; only one that doesn't gets a badge
	function flowIssue(template: WaTemplate | undefined): WaFlowIssue | null {
		if (!template) return { label: 'Gönderilmiyor', variant: 'outline', icon: BellOff };
		if (template.status === 'pending') {
			return { label: 'Şablon onay bekliyor', variant: 'outline', icon: Clock };
		}
		if (template.status !== 'approved') {
			return { label: 'Şablon kullanılamıyor', variant: 'destructive', icon: TriangleAlert };
		}
		return null;
	}
</script>

<svelte:head>
	<title>WhatsApp · Pilates Evi</title>
</svelte:head>

<div class="mx-auto w-full max-w-5xl space-y-8 p-4 lg:p-6">
	<PageHeader title="WhatsApp" subtitle="Öğrencilere giden otomatik mesajlar">
		{#snippet actions()}
			<Button onclick={() => openTemplate(null)} disabled={!whatsapp}>
				<Plus />
				Yeni şablon
			</Button>
		{/snippet}
	</PageHeader>

	{#if whatsapp === undefined}
		<div class="space-y-8" aria-busy="true" aria-label="Yükleniyor">
			<div class="divide-y surface px-4 sm:px-5">
				{#each { length: 3 }, i (i)}
					<div class="grid gap-4 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-8">
						<div class="space-y-2">
							<Skeleton class="h-5 w-52" />
							<Skeleton class="h-4 w-full max-w-sm" />
						</div>
						<Skeleton class="h-28 w-full rounded-xl" />
					</div>
				{/each}
			</div>
			<Skeleton class="h-40 w-full rounded-2xl" />
		</div>
	{:else if whatsapp === null}
		<LoadError message="WhatsApp ayarları yüklenemedi." />
	{:else}
		{#if !whatsapp.studioEnabled}
			<p class="flex items-start gap-2.5 surface px-4 py-3 text-sm">
				<MessageCircleOff class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
				<span>
					<strong class="font-semibold">Bu stüdyoda WhatsApp kapalı.</strong>
					<span class="text-muted-foreground">Öğrencilere mesaj gitmez.</span>
				</span>
			</p>
		{/if}

		<section class="space-y-3" aria-labelledby="flows-title">
			<h2 id="flows-title" class="text-base font-semibold">Otomatik mesajlar</h2>
			<ul class="divide-y surface px-4 py-1 sm:px-5">
				{#each whatsapp.flows as flow (flow.key)}
					{@const definition = WA_FLOWS[flow.key]}
					{@const template = flow.templateId ? templateById.get(flow.templateId) : undefined}
					{@const issue = flowIssue(template)}
					<li class="py-2">
						<!-- The whole row opens the message: the button's ::after stretches over the preview -->
						<div
							class="relative -mx-2 grid items-start gap-4 rounded-lg px-2 py-3 has-[button:focus-visible]:bg-muted/60 has-[button:focus-visible]:ring-2 has-[button:focus-visible]:ring-ring has-[button:hover]:bg-muted/60 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] lg:gap-8"
						>
							<button
								type="button"
								class="text-left after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none"
								onclick={() => openFlow(flow)}
							>
								<span class="flex flex-wrap items-center gap-x-2.5 gap-y-1">
									<span class="font-medium">{definition.title}</span>
									{#if issue}
										<Badge variant={issue.variant}>
											<issue.icon data-icon="inline-start" />
											{issue.label}
										</Badge>
									{/if}
								</span>
								<span class="mt-0.5 block max-w-prose text-sm text-muted-foreground">
									{definition.when}
								</span>
							</button>
							{#if template}
								<WaMessagePreview
									header={template.header}
									body={template.body}
									values={previewValues(template.params, flow.params, whatsapp.studioName)}
								/>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		</section>

		<section class="space-y-3" aria-labelledby="templates-title">
			<div class="flex items-center justify-between gap-3">
				<h2 id="templates-title" class="text-base font-semibold">Şablonlar</h2>
				<ActionMenu actions={listActions} ariaLabel="Şablon listesi işlemleri" />
			</div>

			{#if whatsapp.templates.length === 0}
				<div class="surface px-6 py-10 text-center">
					<p class="font-medium">Henüz şablon yok</p>
					<p class="mt-1 text-sm text-muted-foreground">
						Yeni bir şablon yazın ya da WhatsApp hesabındakilerden ekleyin.
					</p>
					<Button class="mt-4" variant="outline" size="sm" onclick={openImport}>
						<Download />
						WhatsApp’tan ekle
					</Button>
				</div>
			{:else}
				<ul class="divide-y surface px-4 py-1 sm:px-5">
					{#each whatsapp.templates as template (template.id)}
						<li class="flex items-center gap-2 py-2">
							<button
								type="button"
								class="row-link min-w-0 flex-1 py-2 text-left"
								onclick={() => openTemplate(template)}
							>
								<span class="flex flex-wrap items-center gap-x-2.5 gap-y-1">
									<span class="font-medium">{template.displayName}</span>
									{#if template.status !== 'approved'}
										<WaTemplateStatusBadge status={template.status} />
									{/if}
								</span>
								<span class="mt-0.5 block truncate text-sm text-muted-foreground">
									{#each bodySegments(template.body) as segment, i (i)}{#if segment.kind === 'text'}{segment.text}{:else}<span
												class="font-mono text-xs text-foreground/80">{segment.name}</span
											>{/if}{/each}
								</span>
								{#if template.replacesId}
									<span class="mt-1 block text-xs text-muted-foreground">
										{template.status === 'approved'
											? 'Yeni metin · geçiş için bazı mesajlarda bilgi seçilmeli'
											: 'Yeni metin · onaylanınca şu anki metnin yerine geçer'}
									</span>
								{/if}
							</button>
							<ActionMenu
								actions={templateActions(template)}
								ariaLabel="{template.displayName} işlemleri"
							/>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		{#key templateSession}
			<WaTemplateSheet
				bind:open={templateSheetOpen}
				template={editingTemplate}
				usedBy={editingTemplate ? usedBy(editingTemplate.id) : []}
				waiting={editingTemplate ? waitingFor(editingTemplate.id) : null}
				replaces={editingTemplate?.replacesId
					? (templateById.get(editingTemplate.replacesId) ?? null)
					: null}
				submitBlocked={whatsapp.submitBlocked}
			/>
		{/key}
		{#key flowSession}
			<WaFlowSheet
				bind:open={flowSheetOpen}
				flow={editingFlow}
				templates={whatsapp.templates}
				studioName={whatsapp.studioName}
			/>
		{/key}
		{#key importSession}
			{#if importSession > 0}
				<WaImportDialog bind:open={importOpen} />
			{/if}
		{/key}
	{/if}
</div>

<Modal bind:open={removeOpen} title="Şablonu listeden kaldır" onClose={() => (removing = null)}>
	<p class="mb-4 text-sm">
		<strong>{removing?.displayName}</strong> bu stüdyonun listesinden çıkar. WhatsApp hesabında kalır;
		"WhatsApp’tan ekle" ile geri alabilirsiniz.
	</p>
	<form
		method="POST"
		action="?/removeTemplate"
		use:enhance={enhanceForm({
			busy: (b) => (busy = b),
			onSuccess: () => {
				removeOpen = false;
				removing = null;
			}
		})}
	>
		<input type="hidden" name="templateId" value={removing?.id} />
		<ModalFooter>
			<Button type="button" variant="outline" onclick={() => (removeOpen = false)}>Vazgeç</Button>
			<Button type="submit" variant="destructive" disabled={busy}>
				{#if busy}
					<LoaderCircle class="animate-spin" />
				{:else}
					<ListX />
				{/if}
				Listeden kaldır
			</Button>
		</ModalFooter>
	</form>
</Modal>
