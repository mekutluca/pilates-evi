<script lang="ts">
	import type { WaTemplateSheetProps } from '$lib/types/ComponentProps';
	import { enhance } from '$app/forms';
	import { tick, untrack } from 'svelte';
	import { enhanceForm } from '$lib/utils/enhance';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';
	import WaMessagePreview from './wa-message-preview.svelte';
	import WaTemplateStatusBadge from './wa-template-status-badge.svelte';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Plus from '@lucide/svelte/icons/plus';
	import Info from '@lucide/svelte/icons/info';
	import Send from '@lucide/svelte/icons/send';
	import {
		BODY_MAX_LENGTH,
		HEADER_MAX_LENGTH,
		WA_DATA_FIELDS,
		WA_FLOWS,
		WA_FLOW_KEYS,
		bodyProblem,
		isWaDataKey,
		syncParams
	} from '$lib/whatsapp/template-params';
	import type { WaDataKey } from '$lib/types/WhatsAppTemplate';

	let { open = $bindable(false), template, usedBy, submitBlocked }: WaTemplateSheetProps = $props();

	// The parent remounts this sheet each time it opens ({#key}), so the form starts from
	// the template
	let displayName = $state(untrack(() => template?.displayName ?? ''));
	let header = $state(untrack(() => template?.header ?? ''));
	let body = $state(untrack(() => template?.body ?? ''));
	let examples = $state<Record<string, string>>(
		untrack(() => Object.fromEntries((template?.params ?? []).map((p) => [p.name, p.example])))
	);
	let busy = $state(false);
	let textarea = $state<HTMLTextAreaElement | null>(null);

	const isNew = $derived(template === null);
	const params = $derived(
		syncParams(
			body,
			Object.entries(examples).map(([n, example]) => ({ name: n, example }))
		)
	);
	const problem = $derived(body.trim() ? bodyProblem(body) : null);
	const missingExample = $derived(params.find((p) => !p.example.trim()));

	// Meta keeps approved content under review and closed ones closed
	const locked = $derived(template?.status === 'pending' || template?.status === 'disabled');
	const contentChanged = $derived(
		!template ||
			(template.header ?? '') !== header.trim() ||
			template.body !== body.trim() ||
			JSON.stringify(template.params) !==
				JSON.stringify(params.map((p) => ({ name: p.name, example: p.example.trim() })))
	);
	// Content goes to WhatsApp; the display name alone stays here
	const needsAccount = $derived(isNew || contentChanged);
	const contentDisabled = $derived(locked || Boolean(submitBlocked));
	const canSubmit = $derived(
		!busy &&
			displayName.trim().length > 0 &&
			(!needsAccount || (!contentDisabled && body.trim().length > 0 && !problem && !missingExample))
	);

	const submitLabel = $derived(
		isNew ? 'Onaya gönder' : contentChanged ? 'Kaydet ve onaya gönder' : 'Kaydet'
	);

	// The data the app can put into a message, grouped as the messages offer it; a group
	// only some messages have says which
	const SHORT_FLOW: Record<string, string> = {
		schedule_change_studio: 'stüdyo değişikliği',
		schedule_change_request: 'talep üzerine değişiklik',
		daily_reminder: 'hatırlatma'
	};
	const dataGroups = (() => {
		const groups: { group: string; keys: WaDataKey[]; only: string }[] = [];
		for (const flowKey of WA_FLOW_KEYS) {
			for (const g of WA_FLOWS[flowKey].fields) {
				if (groups.some((x) => x.group === g.group)) continue;
				const flows = WA_FLOW_KEYS.filter((k) =>
					WA_FLOWS[k].fields.some((f) => f.group === g.group)
				);
				groups.push({
					group: g.group,
					keys: g.keys,
					only:
						flows.length === WA_FLOW_KEYS.length
							? ''
							: `Yalnızca ${flows.map((k) => SHORT_FLOW[k]).join(', ')}`
				});
			}
		}
		return groups;
	})();

	async function insert(token: string, selectInside = false) {
		const el = textarea;
		const start = el?.selectionStart ?? body.length;
		const end = el?.selectionEnd ?? start;
		body = body.slice(0, start) + token + body.slice(end);
		await tick();
		if (!el) return;
		el.focus();
		if (selectInside) el.setSelectionRange(start + 2, start + token.length - 2);
		else el.setSelectionRange(start + token.length, start + token.length);
	}

	function paramLabel(paramName: string): string {
		return isWaDataKey(paramName) ? WA_DATA_FIELDS[paramName].label : 'Kendi değişkeniniz';
	}

	const previewValues = $derived(Object.fromEntries(params.map((p) => [p.name, p.example])));
</script>

<Sheet.Root bind:open>
	<Sheet.Content
		side="right"
		class="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
	>
		<form
			method="POST"
			action={isNew ? '?/createTemplate' : '?/updateTemplate'}
			class="flex min-h-full flex-col"
			use:enhance={enhanceForm({
				busy: (b) => (busy = b),
				reset: false,
				onSuccess: () => (open = false)
			})}
		>
			<Sheet.Header class="border-b pr-12">
				<Sheet.Title>{isNew ? 'Yeni şablon' : 'Şablonu düzenle'}</Sheet.Title>
				<Sheet.Description>
					{#if isNew}
						WhatsApp her yeni şablonu onaylar; onay genelde birkaç dakika sürer.
					{:else if template}
						<span class="inline-flex flex-wrap items-center gap-2">
							<WaTemplateStatusBadge status={template.status} />
							<span class="font-mono text-xs" title="WhatsApp’taki adı">{template.name}</span>
						</span>
					{/if}
				</Sheet.Description>
			</Sheet.Header>

			<div class="flex-1 space-y-6 px-6 py-5">
				{#if template}
					<input type="hidden" name="templateId" value={template.id} />
				{/if}
				<!-- Posted from here: the visible fields may be disabled while a template is locked -->
				<input type="hidden" name="displayName" value={displayName} />
				<input type="hidden" name="header" value={header} />
				<input type="hidden" name="body" value={body} />
				<input type="hidden" name="params" value={JSON.stringify(params)} />

				{#if submitBlocked && (isNew || !locked)}
					<p class="flex gap-2 rounded-xl bg-muted/70 px-3 py-2.5 text-sm text-muted-foreground">
						<Info class="mt-0.5 size-4 shrink-0" />
						<span>{submitBlocked}{isNew ? '' : ' Adı yine de değiştirebilirsiniz.'}</span>
					</p>
				{:else if template?.status === 'pending'}
					<p class="flex gap-2 rounded-xl bg-muted/70 px-3 py-2.5 text-sm text-muted-foreground">
						<Info class="mt-0.5 size-4 shrink-0" />
						<span>
							WhatsApp bu şablonu inceliyor. Metni onay sonuçlanınca değiştirebilirsiniz; adı şimdi
							de değişebilir.
						</span>
					</p>
				{:else if template?.status === 'disabled'}
					<p class="flex gap-2 rounded-xl bg-muted/70 px-3 py-2.5 text-sm text-muted-foreground">
						<Info class="mt-0.5 size-4 shrink-0" />
						<span>WhatsApp bu şablonu kapattı. Yerine yeni bir şablon oluşturun.</span>
					</p>
				{:else if template?.status === 'rejected' && template.rejectionReason}
					<p class="rounded-xl bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
						WhatsApp’ın ret sebebi: {template.rejectionReason}. Metni düzeltip yeniden gönderin.
					</p>
				{/if}

				<div class="grid gap-4 sm:grid-cols-2">
					<div class="grid content-start gap-1.5">
						<Label for="wt-display-name">Ad</Label>
						<Input
							id="wt-display-name"
							bind:value={displayName}
							maxlength={120}
							placeholder="ör. Ders hatırlatması"
							required
						/>
						<p class="text-xs text-muted-foreground">Yalnızca bu sayfada görünür.</p>
					</div>
					<div class="grid content-start gap-1.5">
						<Label for="wt-header">
							Mesaj başlığı <span class="text-muted-foreground">(isteğe bağlı)</span>
						</Label>
						<Input
							id="wt-header"
							bind:value={header}
							maxlength={HEADER_MAX_LENGTH}
							placeholder="ör. Hatırlatma"
							disabled={contentDisabled}
						/>
					</div>
				</div>

				<div class="grid gap-1.5">
					<div class="flex items-end justify-between gap-2">
						<Label for="wt-body">Mesaj</Label>
						<DropdownMenu.Root>
							<DropdownMenu.Trigger disabled={contentDisabled}>
								{#snippet child({ props })}
									<Button {...props} variant="outline" size="xs">
										<Plus />
										Bilgi ekle
									</Button>
								{/snippet}
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="end" class="max-h-80 w-72 overflow-y-auto">
								{#each dataGroups as group (group.group)}
									<DropdownMenu.Group>
										<DropdownMenu.Label class="pb-0.5">
											{group.group}
											{#if group.only}
												<span class="block text-xs font-normal text-muted-foreground">
													{group.only}
												</span>
											{/if}
										</DropdownMenu.Label>
										{#each group.keys as key (key)}
											<DropdownMenu.Item onSelect={() => insert(`{{${key}}}`)}>
												<span class="flex-1">{WA_DATA_FIELDS[key].label}</span>
												<span class="font-mono text-xs text-muted-foreground">{key}</span>
											</DropdownMenu.Item>
										{/each}
									</DropdownMenu.Group>
									<DropdownMenu.Separator />
								{/each}
								<DropdownMenu.Item onSelect={() => insert('{{degisken}}', true)}>
									Kendi değişkeniniz…
								</DropdownMenu.Item>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					</div>
					<Textarea
						id="wt-body"
						bind:ref={textarea}
						bind:value={body}
						rows={6}
						maxlength={BODY_MAX_LENGTH}
						placeholder={'ör. Merhaba {{first_name}}, {{package}} dersiniz yarın saat {{time}}’da.'}
						aria-invalid={problem ? 'true' : undefined}
						aria-describedby="wt-body-hint"
						disabled={contentDisabled}
					/>
					<div id="wt-body-hint" class="flex items-start justify-between gap-3 text-xs">
						{#if problem}
							<p class="text-destructive">{problem}</p>
						{:else}
							<p class="text-muted-foreground">
								Öğrenciye göre değişen yerler için "Bilgi ekle"yi kullanın.
							</p>
						{/if}
						<p class="shrink-0 text-muted-foreground tabular-nums">
							{body.length} / {BODY_MAX_LENGTH}
						</p>
					</div>
				</div>

				{#if params.length > 0}
					<section class="grid gap-3" aria-labelledby="wt-examples">
						<div>
							<h3 id="wt-examples" class="text-sm font-semibold">Örnekler</h3>
							<p class="text-xs text-muted-foreground">
								WhatsApp onay için her bilgiye bir örnek ister. Gerçek değerleri otomatik mesaj
								doldurur.
							</p>
						</div>
						<div class="grid gap-2.5">
							{#each params as param (param.name)}
								<div class="grid items-center gap-1.5 sm:grid-cols-[minmax(0,13rem)_1fr] sm:gap-3">
									<label for="wt-ex-{param.name}" class="min-w-0">
										<span class="block truncate text-sm font-medium">{paramLabel(param.name)}</span>
										<span class="block truncate font-mono text-xs text-muted-foreground">
											{param.name}
										</span>
									</label>
									<Input
										id="wt-ex-{param.name}"
										value={param.example}
										oninput={(e) => (examples[param.name] = e.currentTarget.value)}
										aria-invalid={!param.example.trim() ? 'true' : undefined}
										disabled={contentDisabled}
									/>
								</div>
							{/each}
						</div>
					</section>
				{/if}

				{#if body.trim()}
					<WaMessagePreview
						caption="Önizleme · örneklerle"
						header={header.trim() || null}
						{body}
						values={previewValues}
					/>
				{/if}

				{#if !isNew && contentChanged && !contentDisabled && template?.status === 'approved' && usedBy.length > 0}
					<p class="flex gap-2 rounded-xl bg-muted/70 px-3 py-2.5 text-sm text-muted-foreground">
						<Info class="mt-0.5 size-4 shrink-0" />
						<span>
							Değişiklik WhatsApp onayına gider. Onaylanana kadar şu mesaj gönderilmez:
							<strong class="font-medium text-foreground">{usedBy.join(', ')}</strong>.
						</span>
					</p>
				{/if}
			</div>

			<Sheet.Footer class="sticky bottom-0 flex-row justify-end gap-2 border-t bg-popover">
				<Button type="button" variant="outline" onclick={() => (open = false)}>Vazgeç</Button>
				<Button type="submit" disabled={!canSubmit}>
					{#if busy}
						<LoaderCircle class="animate-spin" />
					{:else if needsAccount}
						<Send />
					{/if}
					{submitLabel}
				</Button>
			</Sheet.Footer>
		</form>
	</Sheet.Content>
</Sheet.Root>
