<script lang="ts">
	import type { WaImportDialogProps } from '$lib/types/ComponentProps';
	import type { WaImportCandidatesPayload } from '$lib/types/Api';
	import type { WaImportListing } from '$lib/types/WhatsAppTemplate';
	import { enhance } from '$app/forms';
	import { onMount } from 'svelte';
	import { enhanceForm } from '$lib/utils/enhance';
	import { actionResultMessage, postAction } from '$lib/utils/api-client';
	import Modal from '$lib/components/modal.svelte';
	import ModalFooter from '$lib/components/modal-footer.svelte';
	import LoadError from '$lib/components/load-error.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
	import WaTemplateStatusBadge from './wa-template-status-badge.svelte';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';

	// Templates already in the WhatsApp account (made in Chakra, or by another studio on the
	// same number) that this studio can start using
	let { open = $bindable(false) }: WaImportDialogProps = $props();

	let listing = $state<WaImportListing>({ status: 'loading' });
	let selected = $state<string[]>([]);
	let busy = $state(false);

	async function load() {
		listing = { status: 'loading' };
		selected = [];
		const result = await postAction<WaImportCandidatesPayload>('importCandidates', new FormData());
		listing =
			result.type === 'success' && result.data
				? { status: 'ready', candidates: result.data.candidates }
				: { status: 'error', message: actionResultMessage(result) };
	}

	// The parent remounts this dialog each time it opens ({#key})
	onMount(load);

	function toggle(id: string, checked: boolean) {
		selected = checked ? [...selected, id] : selected.filter((s) => s !== id);
	}
</script>

<Modal bind:open title="WhatsApp’tan şablon ekle" size="lg">
	<form
		method="POST"
		action="?/importTemplates"
		class="space-y-4"
		use:enhance={enhanceForm({
			busy: (b) => (busy = b),
			onSuccess: () => (open = false)
		})}
	>
		<input type="hidden" name="vendorTemplateIds" value={selected.join(',')} />
		<p class="text-sm text-muted-foreground">
			WhatsApp hesabında olup bu stüdyonun listesinde olmayan şablonlar.
		</p>

		{#if listing.status === 'loading'}
			<div class="space-y-2" aria-busy="true">
				{#each { length: 3 }, i (i)}
					<Skeleton class="h-16 w-full rounded-xl" />
				{/each}
			</div>
		{:else if listing.status === 'error'}
			<LoadError message={listing.message} onRetry={load} />
		{:else if listing.candidates.length === 0}
			<p class="rounded-xl bg-muted/70 px-4 py-6 text-center text-sm text-muted-foreground">
				Hesaptaki bütün şablonlar zaten listede.
			</p>
		{:else}
			<ul class="max-h-[50dvh] divide-y overflow-y-auto rounded-xl ring-1 ring-foreground/10">
				{#each listing.candidates as candidate (candidate.vendorTemplateId)}
					<li>
						<label
							class="flex gap-3 px-3 py-2.5 {candidate.importable
								? 'cursor-pointer hover:bg-muted/60'
								: 'opacity-60'}"
						>
							<Checkbox
								class="mt-0.5"
								checked={selected.includes(candidate.vendorTemplateId)}
								onCheckedChange={(c) => toggle(candidate.vendorTemplateId, c === true)}
								disabled={!candidate.importable}
							/>
							<span class="min-w-0 flex-1">
								<span class="flex flex-wrap items-center gap-2">
									<span class="font-mono text-sm">{candidate.name}</span>
									<WaTemplateStatusBadge status={candidate.status} />
								</span>
								<span class="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
									{candidate.body}
								</span>
								{#if !candidate.importable}
									<span class="mt-0.5 block text-xs text-muted-foreground">
										Numaralı değişken kullanıyor ({'{{1}}'}); öğrenci bilgisiyle doldurulamaz.
									</span>
								{/if}
							</span>
						</label>
					</li>
				{/each}
			</ul>
		{/if}

		<ModalFooter>
			<Button type="button" variant="outline" onclick={() => (open = false)}>Vazgeç</Button>
			<Button type="submit" disabled={busy || selected.length === 0}>
				{#if busy}
					<LoaderCircle class="animate-spin" />
				{/if}
				{selected.length > 0 ? `${selected.length} şablonu ekle` : 'Ekle'}
			</Button>
		</ModalFooter>
	</form>
</Modal>
