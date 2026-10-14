<script lang="ts">
	import type { TraineePickerProps } from '$lib/types/ComponentProps';
	import type { CreatedTraineePayload } from '$lib/types/Api';
	import SearchInput from '$lib/components/search-input.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import Check from '@lucide/svelte/icons/check';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { toast } from 'svelte-sonner';
	import { cn } from '$lib/utils';
	import { actionResultMessage, postAction } from '$lib/utils/api-client';

	const MAX_RESULTS = 8;

	let { trainees, selected = $bindable(), onCreated }: TraineePickerProps = $props();

	let search = $state('');
	let creating = $state(false);
	let saving = $state(false);
	let name = $state('');
	let phone = $state('');
	let email = $state('');

	const byId = $derived(new Map(trainees.map((t) => [t.id, t])));
	const matches = $derived.by(() => {
		const term = search.trim().toLocaleLowerCase('tr');
		const digits = search.replace(/\D/g, '');
		const found = term
			? trainees.filter(
					(t) =>
						t.name.toLocaleLowerCase('tr').includes(term) ||
						(digits.length > 0 && t.phone.includes(digits))
				)
			: trainees;
		return found.slice(0, MAX_RESULTS);
	});

	function toggle(id: string) {
		selected = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
	}

	function openCreate() {
		// A search that isn't a phone number is most likely the new trainee's name
		name = /\d/.test(search) ? '' : search.trim();
		phone = /\d/.test(search) ? search.trim() : '';
		email = '';
		creating = true;
	}

	async function create() {
		saving = true;
		const fd = new FormData();
		fd.set('name', name);
		fd.set('phone', phone);
		fd.set('email', email);
		const result = await postAction<CreatedTraineePayload>('createTrainee', fd);
		saving = false;
		if (result.type === 'success' && result.data) {
			onCreated(result.data.trainee);
			selected = [...selected, result.data.trainee.id];
			creating = false;
			search = '';
			toast.success(result.data.message ?? 'Öğrenci eklendi');
		} else {
			toast.error(actionResultMessage(result));
		}
	}
</script>

<div class="space-y-4">
	{#if selected.length > 0}
		<div class="flex flex-wrap gap-2" aria-label="Seçilen öğrenciler">
			{#each selected as id (id)}
				<Badge variant="secondary" class="gap-1 py-1 pr-1 pl-2.5 text-sm">
					{byId.get(id)?.name ?? '-'}
					<button
						type="button"
						class="rounded-full p-0.5 hover:bg-muted-foreground/20"
						aria-label={`${byId.get(id)?.name ?? ''} seçimini kaldır`}
						onclick={() => toggle(id)}
					>
						<X class="size-3.5" />
					</button>
				</Badge>
			{/each}
		</div>
	{/if}

	{#if creating}
		<form
			class="grid gap-4 rounded-md border p-4"
			onsubmit={(e) => {
				e.preventDefault();
				create();
			}}
		>
			<p class="text-sm font-medium">Yeni öğrenci</p>
			<div class="grid gap-4 sm:grid-cols-2">
				<div class="grid gap-2">
					<Label for="new-trainee-name">Ad soyad</Label>
					<Input id="new-trainee-name" bind:value={name} required autocomplete="off" />
				</div>
				<div class="grid gap-2">
					<Label for="new-trainee-phone">Telefon</Label>
					<Input
						id="new-trainee-phone"
						type="tel"
						bind:value={phone}
						required
						placeholder="555 123 45 67"
						autocomplete="off"
					/>
				</div>
			</div>
			<div class="grid gap-2 sm:max-w-sm">
				<Label for="new-trainee-email">E-posta (isteğe bağlı)</Label>
				<Input id="new-trainee-email" type="email" bind:value={email} autocomplete="off" />
			</div>
			<div class="flex justify-end gap-2">
				<Button type="button" variant="outline" onclick={() => (creating = false)}>Vazgeç</Button>
				<Button type="submit" disabled={saving || !name.trim() || !phone.trim()}>
					{#if saving}<LoaderCircle class="animate-spin" />{/if}
					Öğrenciyi ekle
				</Button>
			</div>
		</form>
	{:else}
		<div class="flex flex-col gap-2 sm:flex-row">
			<div class="flex-1">
				<SearchInput bind:value={search} placeholder="Ad veya telefon ile ara" />
			</div>
			<Button variant="outline" onclick={openCreate}>
				<Plus />
				Yeni öğrenci
			</Button>
		</div>

		{#if matches.length === 0}
			<p class="py-4 text-sm text-muted-foreground">
				"{search}" ile eşleşen öğrenci yok. Yeni öğrenci olarak ekleyebilirsiniz.
			</p>
		{:else}
			<ul class="divide-y rounded-md border">
				{#each matches as trainee (trainee.id)}
					{@const isSelected = selected.includes(trainee.id)}
					<li>
						<button
							type="button"
							aria-pressed={isSelected}
							class={cn(
								'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none',
								isSelected && 'bg-muted/50'
							)}
							onclick={() => toggle(trainee.id)}
						>
							<span>
								<span class="font-medium">{trainee.name}</span>
								<span class="block text-muted-foreground tabular-nums">{trainee.phone}</span>
							</span>
							{#if isSelected}
								<Check class="size-4 text-primary" />
							{/if}
						</button>
					</li>
				{/each}
			</ul>
			{#if !search}
				<p class="text-xs text-muted-foreground">
					İlk {MAX_RESULTS} öğrenci gösteriliyor; aramak için yazın.
				</p>
			{/if}
		{/if}
	{/if}
</div>
