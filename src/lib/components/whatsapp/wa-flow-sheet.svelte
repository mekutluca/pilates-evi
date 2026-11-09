<script lang="ts">
	import type { WaFlowSheetProps } from '$lib/types/ComponentProps';
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';
	import { enhanceForm } from '$lib/utils/enhance';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import WaMessagePreview from './wa-message-preview.svelte';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Info from '@lucide/svelte/icons/info';
	import {
		WA_DATA_FIELDS,
		WA_FLOWS,
		bindingsProblem,
		defaultBindings,
		isWaDataKey,
		previewValues
	} from '$lib/whatsapp/template-params';
	import type { WaParamBinding, WaParamBindings } from '$lib/types/WhatsAppTemplate';

	let { open = $bindable(false), flow, templates, studioName }: WaFlowSheetProps = $props();

	// Sabit metin: a fixed text instead of the trainee's data
	const TEXT = 'text';

	// The parent remounts this sheet each time it opens ({#key}), so it starts from the flow
	let templateId = $state(untrack(() => flow?.templateId ?? ''));
	let bindings = $state<WaParamBindings>(untrack(() => ({ ...(flow?.params ?? {}) })));
	let busy = $state(false);

	const definition = $derived(flow ? WA_FLOWS[flow.key] : null);
	const template = $derived(templates.find((t) => t.id === templateId) ?? null);
	// Choosing another template keeps what still fits and binds params named after data
	const effective = $derived(
		flow && template ? defaultBindings(flow.key, template.params, bindings) : {}
	);
	const problem = $derived(
		flow && template ? bindingsProblem(flow.key, template.params, effective) : null
	);
	const values = $derived(template ? previewValues(template.params, effective, studioName) : {});

	function sourceOf(name: string): string {
		return effective[name]?.source ?? '';
	}

	function setSource(name: string, source: string) {
		const next: WaParamBinding | null =
			source === TEXT
				? { source: 'text', text: textOf(name) }
				: isWaDataKey(source)
					? { source }
					: null;
		const rest = { ...effective };
		if (next) rest[name] = next;
		else delete rest[name];
		bindings = rest;
	}

	function textOf(name: string): string {
		const binding = effective[name];
		return binding?.source === 'text' ? binding.text : '';
	}

	function setText(name: string, text: string) {
		bindings = { ...effective, [name]: { source: 'text', text } };
	}

	function optionLabel(t: (typeof templates)[number]): string {
		const state =
			t.status === 'approved'
				? ''
				: t.status === 'pending'
					? ' · onay bekliyor'
					: t.status === 'rejected'
						? ' · reddedildi'
						: ' · kullanılamaz';
		return t.displayName + state;
	}
</script>

<Sheet.Root bind:open>
	<Sheet.Content
		side="right"
		class="gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
	>
		{#if flow && definition}
			<form
				method="POST"
				action="?/saveFlow"
				class="flex min-h-full flex-col"
				use:enhance={enhanceForm({
					busy: (b) => (busy = b),
					reset: false,
					onSuccess: () => (open = false)
				})}
			>
				<Sheet.Header class="border-b pr-12">
					<Sheet.Title>{definition.title}</Sheet.Title>
					<Sheet.Description>{definition.when}</Sheet.Description>
				</Sheet.Header>

				<div class="flex-1 space-y-6 px-6 py-5">
					<input type="hidden" name="flow" value={flow.key} />
					<input type="hidden" name="bindings" value={JSON.stringify(effective)} />

					<div class="grid gap-1.5">
						<Label for="wf-template">Şablon</Label>
						<NativeSelect id="wf-template" name="templateId" class="w-full" bind:value={templateId}>
							<option value="">Bu mesajı gönderme</option>
							{#each templates as t (t.id)}
								<option value={t.id} disabled={t.status === 'disabled'}>{optionLabel(t)}</option>
							{/each}
						</NativeSelect>
						{#if template && template.status !== 'approved'}
							<p class="flex gap-1.5 text-xs text-muted-foreground">
								<Info class="mt-px size-3.5 shrink-0" />
								{template.status === 'pending'
									? 'WhatsApp onaylayınca bu şablonla gönderilmeye başlar.'
									: 'Bu şablon onaylı değil; onaylanana kadar mesaj gönderilmez.'}
							</p>
						{:else if !template}
							<p class="text-xs text-muted-foreground">
								{flow.key === 'daily_reminder'
									? 'Kapalıyken öğrencilere hatırlatma gitmez.'
									: 'Takvimde "WhatsApp ile bildir" işaretlense de mesaj gitmez; personel bunu işlem sonucunda görür.'}
							</p>
						{/if}
					</div>

					{#if template && template.params.length > 0}
						<section class="grid gap-3" aria-labelledby="wf-params">
							<div>
								<h3 id="wf-params" class="text-sm font-semibold">Mesaja girecek bilgiler</h3>
								<p class="text-xs text-muted-foreground">
									Şablondaki her değişken için öğrencinin hangi bilgisi yazılsın?
								</p>
							</div>
							<div class="grid gap-3">
								{#each template.params as param (param.name)}
									<div class="grid items-start gap-1.5 sm:grid-cols-[minmax(0,10rem)_1fr] sm:gap-3">
										<label for="wf-src-{param.name}" class="min-w-0 sm:pt-2">
											<span class="block truncate font-mono text-sm">{param.name}</span>
											<span class="block truncate text-xs text-muted-foreground">
												örn. {param.example}
											</span>
										</label>
										<div class="grid gap-2">
											<NativeSelect
												id="wf-src-{param.name}"
												class="w-full"
												value={sourceOf(param.name)}
												onchange={(e) => setSource(param.name, e.currentTarget.value)}
												aria-invalid={!effective[param.name] ? 'true' : undefined}
											>
												<option value="" disabled>Seçin</option>
												{#each definition.fields as group (group.group)}
													<optgroup label={group.group}>
														{#each group.keys as key (key)}
															<option value={key}>{WA_DATA_FIELDS[key].label}</option>
														{/each}
													</optgroup>
												{/each}
												<optgroup label="Diğer">
													<option value={TEXT}>Sabit metin</option>
												</optgroup>
											</NativeSelect>
											{#if effective[param.name]?.source === TEXT}
												<Input
													aria-label="{param.name} için sabit metin"
													value={textOf(param.name)}
													oninput={(e) => setText(param.name, e.currentTarget.value)}
													placeholder="Her mesajda aynı yazı"
												/>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						</section>
					{/if}

					{#if template}
						<WaMessagePreview
							caption="Önizleme · örnek öğrenciyle"
							header={template.header}
							body={template.body}
							{values}
						/>
					{/if}

					{#if problem}
						<p class="text-sm text-destructive" role="status">{problem}</p>
					{/if}
				</div>

				<Sheet.Footer class="sticky bottom-0 flex-row justify-end gap-2 border-t bg-popover">
					<Button type="button" variant="outline" onclick={() => (open = false)}>Vazgeç</Button>
					<Button type="submit" disabled={busy || Boolean(problem)}>
						{#if busy}
							<LoaderCircle class="animate-spin" />
						{/if}
						Kaydet
					</Button>
				</Sheet.Footer>
			</form>
		{/if}
	</Sheet.Content>
</Sheet.Root>
