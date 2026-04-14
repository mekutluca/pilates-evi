<script lang="ts" generics="T">
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import X from '@lucide/svelte/icons/x';
	import * as Popover from '$lib/components/ui/popover/index.js';
	import * as Command from '$lib/components/ui/command/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { cn } from '$lib/utils/class-utils';

	type Item = T & { id: number | string; name: string };

	interface Props {
		items: Item[];
		selectedItems?: Item[];
		placeholder?: string;
		searchPlaceholder?: string;
		emptyMessage?: string;
		multiple?: boolean;
		disabled?: boolean;
		getDisplayText?: (item: Item) => string;
		getSearchText?: (item: Item) => string;
		onSelect?: (item: Item) => void;
		onRemove?: (item: Item) => void;
	}

	let {
		items,
		selectedItems = [],
		placeholder = 'Select item...',
		searchPlaceholder = 'Search...',
		emptyMessage = 'No items found.',
		multiple = false,
		disabled = false,
		getDisplayText = (item: Item) => item.name,
		getSearchText = (item: Item) => item.name,
		onSelect,
		onRemove
	}: Props = $props();

	let isOpen = $state(false);

	const displayText = $derived.by(() => {
		if (!multiple) {
			const selected = selectedItems[0];
			return selected ? getDisplayText(selected) : placeholder;
		}

		if (selectedItems.length === 0) return placeholder;
		if (selectedItems.length === 1) return getDisplayText(selectedItems[0]);
		return `${selectedItems.length} öğrenci seçildi`;
	});

	function isSelected(item: Item): boolean {
		return selectedItems.some((selected) => selected.id === item.id);
	}

	function handleSelect(item: Item) {
		if (disabled) return;

		if (isSelected(item)) {
			onRemove?.(item);
		} else {
			onSelect?.(item);
		}

		if (!multiple) {
			isOpen = false;
		}
	}
</script>

<Popover.Root bind:open={isOpen}>
	<Popover.Trigger {disabled}>
		{#snippet child({ props })}
			<button
				type="button"
				class={cn(
					'flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-muted/40 focus:border-ring focus:ring-3 focus:ring-ring/30 focus:outline-none',
					disabled && 'cursor-not-allowed opacity-50'
				)}
				aria-expanded={isOpen}
				aria-haspopup="listbox"
				{disabled}
				{...props}
			>
				<div class="min-w-0 flex-1">
					{#if multiple && selectedItems.length > 0}
						<div class="flex flex-wrap gap-1">
							{#each selectedItems as item (item.id)}
								<Badge variant="secondary" class="gap-1">
									{getDisplayText(item)}
									<span
										class="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-xs transition-colors hover:bg-destructive hover:text-destructive-foreground"
										onclick={(e) => {
											e.stopPropagation();
											onRemove?.(item);
										}}
										role="button"
										tabindex="0"
										onkeydown={(e) => {
											if (e.key === 'Enter' || e.key === ' ') {
												e.preventDefault();
												e.stopPropagation();
												onRemove?.(item);
											}
										}}
										aria-label="Remove {getDisplayText(item)}"
									>
										<X class="size-3" />
									</span>
								</Badge>
							{/each}
						</div>
					{:else}
						<span class="truncate text-left">{displayText}</span>
					{/if}
				</div>
				<ChevronDown
					class={cn(
						'ml-2 size-4 flex-shrink-0 transition-transform duration-200',
						isOpen && 'rotate-180'
					)}
				/>
			</button>
		{/snippet}
	</Popover.Trigger>

	<Popover.Content class="w-(--bits-popover-anchor-width) p-0" align="start">
		<Command.Root>
			<Command.Input placeholder={searchPlaceholder} />
			<Command.List>
				<Command.Empty>{emptyMessage}</Command.Empty>
				<Command.Group>
					{#each items as item (item.id)}
						<Command.Item value={getSearchText(item)} onSelect={() => handleSelect(item)}>
							<span class="flex-1 truncate">{getDisplayText(item)}</span>
							{#if isSelected(item)}
								<Check class="ml-2 size-4 flex-shrink-0 text-success" />
							{/if}
						</Command.Item>
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>
