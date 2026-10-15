<script lang="ts" generics="T">
	import type { SortableTableProps } from '$lib/types/ComponentProps';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { flip } from 'svelte/animate';
	import { prefersReducedMotion } from 'svelte/motion';
	import ActionMenu from './action-menu.svelte';
	import type { ActionItem, Column } from '$lib/types';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import { cn } from '$lib/utils/class-utils';

	let {
		data,
		columns,
		searchTerm = '',
		emptyMessage = 'Kayıt yok',
		defaultSortKey = 'id',
		defaultSortOrder = 'asc',
		actions = [],
		actionsTitle = 'İşlemler',
		rowHref,
		rowLabel,
		itemsPerPage = 10
	}: SortableTableProps<T> = $props();

	// svelte-ignore state_referenced_locally
	let sortKey = $state(defaultSortKey);
	// svelte-ignore state_referenced_locally
	let sortOrder = $state<'asc' | 'desc'>(defaultSortOrder);
	let currentPage = $state(1);
	// svelte-ignore state_referenced_locally
	let pageSize = $state(itemsPerPage);

	const filteredAndSortedData = $derived(() => {
		if (!data || !Array.isArray(data)) {
			return [];
		}

		let filtered = [...data];

		if (searchTerm && searchTerm.trim()) {
			const term = searchTerm.toLowerCase();
			filtered = filtered.filter((item) => {
				try {
					return columns.some((column) => {
						if (column.key === 'actions' || column.key === 'trainings') return false;

						const value = getPropertyValue(item, column.key);
						const searchableValue = String(value ?? '');
						return searchableValue.toLowerCase().includes(term);
					});
				} catch {
					return false;
				}
			});
		}

		try {
			const sorted = filtered.sort((a, b) => {
				const aVal = getPropertyValue(a, sortKey) ?? '';
				const bVal = getPropertyValue(b, sortKey) ?? '';

				let comparison = 0;

				if (typeof aVal === 'number' && typeof bVal === 'number') {
					comparison = aVal - bVal;
				} else {
					const aStr = String(aVal);
					const bStr = String(bVal);
					comparison = aStr.localeCompare(bStr);
				}

				return sortOrder === 'asc' ? comparison : -comparison;
			});

			return sorted;
		} catch {
			return filtered;
		}
	});

	const totalPages = $derived(Math.ceil(filteredAndSortedData().length / pageSize));
	const paginatedData = $derived(() => {
		const startIndex = (currentPage - 1) * pageSize;
		const endIndex = startIndex + pageSize;
		return filteredAndSortedData().slice(startIndex, endIndex);
	});

	function getPropertyValue(obj: T, path: string): string | number {
		try {
			if (!obj || !path) return '';
			// Simple property access - assume obj has the property
			const result = (obj as Record<string, string | number>)[path];
			return result ?? '';
		} catch {
			return '';
		}
	}

	function getColumnValue(item: T, column: Column<T>, index?: number): string {
		if (column.render) {
			return column.render(item, index);
		}
		const value = getPropertyValue(item, column.key);
		return String(value ?? '');
	}

	function handleSort(columnKey: string) {
		const column = columns.find((col) => col.key === columnKey);
		if (!column || column.sortable === false) return;

		if (sortKey === columnKey) {
			if (sortOrder === 'asc') {
				sortOrder = 'desc';
			} else if (sortOrder === 'desc') {
				sortKey = defaultSortKey;
				sortOrder = defaultSortOrder;
			}
		} else {
			sortKey = columnKey;
			sortOrder = 'asc';
		}
		currentPage = 1;
	}

	function goToPage(page: number) {
		if (page >= 1 && page <= totalPages) {
			currentPage = page;
		}
	}

	function getPageNumbers(): (number | string)[] {
		if (totalPages <= 7) {
			return Array.from({ length: totalPages }, (_, i) => i + 1);
		}

		const pages: (number | string)[] = [1];

		if (currentPage > 3) {
			pages.push('...');
		}

		const startPage = Math.max(2, currentPage - 1);
		const endPage = Math.min(totalPages - 1, currentPage + 1);

		for (let i = startPage; i <= endPage; i++) {
			pages.push(i);
		}

		if (currentPage < totalPages - 2) {
			pages.push('...');
		}

		if (totalPages > 1) {
			pages.push(totalPages);
		}

		return pages;
	}

	$effect(() => {
		searchTerm;
		currentPage = 1;
	});

	function getSortIcon(columnKey: string) {
		if (sortKey !== columnKey) return null;
		return sortOrder === 'asc' ? ChevronUp : ChevronDown;
	}

	function isColumnSortable(column: Column<T>): boolean {
		return column.sortable !== false;
	}

	function handlePageSizeChange(e: Event) {
		const target = e.target as HTMLSelectElement;
		pageSize = Number(target.value);
		currentPage = 1;
	}

	// Links and buttons inside a row (e.g. mailto/tel anchors injected via render)
	// handle their own click; don't also trigger the row action.
	function ariaSort(key: string): 'ascending' | 'descending' | 'none' {
		if (sortKey !== key) return 'none';
		return sortOrder === 'asc' ? 'ascending' : 'descending';
	}
</script>

{#snippet cellContent(item: T, column: Column<T>, globalIndex: number)}
	{#if column.renderComponent}
		{@const Component = column.renderComponent}
		<Component {item} index={globalIndex} />
	{:else if column.render}
		{@html getColumnValue(item, column, globalIndex)}
	{:else}
		{getColumnValue(item, column, globalIndex)}
	{/if}
{/snippet}

<Card.Root>
	<Card.Content class="p-0">
		{#if filteredAndSortedData().length === 0}
			<div class="py-8 text-center">
				<p class="text-muted-foreground">
					{searchTerm ? 'Aramayla eşleşen sonuç yok' : emptyMessage}
				</p>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							{#each columns as column (column.key)}
								<Table.Head
									class={cn(column.class || '', 'select-none')}
									aria-sort={isColumnSortable(column) ? ariaSort(column.key) : undefined}
								>
									{#if isColumnSortable(column)}
										{@const SortIcon = getSortIcon(column.key)}
										<button
											type="button"
											class="-mx-2 flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
											onclick={() => handleSort(column.key)}
										>
											<span>{column.title}</span>
											{#if SortIcon}
												<SortIcon size={14} class="text-muted-foreground" />
											{:else}
												<span class="w-[14px]"></span>
											{/if}
										</button>
									{:else}
										<span>{column.title}</span>
									{/if}
								</Table.Head>
							{/each}
							{#if actions && (typeof actions === 'function' || actions.length > 0)}
								<Table.Head class="w-24 text-right select-none">
									<span>{actionsTitle}</span>
								</Table.Head>
							{/if}
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each paginatedData() as item, index ((typeof item === 'object' && item && 'id' in item ? item.id : null) || index)}
							{@const globalIndex = (currentPage - 1) * pageSize + index}
							{@const href = rowHref?.(item)}
							<tr
								data-slot="table-row"
								class={cn(
									'border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted',
									href && 'relative'
								)}
								animate:flip={{ duration: prefersReducedMotion.current ? 0 : 220 }}
							>
								{#each columns as column, columnIndex (column.key)}
									<Table.Cell class={column.class || ''}>
										{#if href && columnIndex === 0}
											<!-- The row's link: its overlay makes the whole row clickable -->
											<a
												{href}
												class="font-medium after:absolute after:inset-0 hover:underline focus-visible:outline-none after:focus-visible:ring-2 after:focus-visible:ring-ring after:focus-visible:ring-inset"
											>
												{@render cellContent(item, column, globalIndex)}
											</a>
										{:else}
											{@render cellContent(item, column, globalIndex)}
										{/if}
									</Table.Cell>
								{/each}
								{#if actions && (typeof actions === 'function' ? actions(item).length > 0 : actions.length > 0)}
									{@const itemActions = typeof actions === 'function' ? actions(item) : actions}
									<Table.Cell class="relative z-10 text-right">
										<ActionMenu
											ariaLabel={rowLabel ? `${rowLabel(item)} işlemleri` : undefined}
											actions={itemActions.map((action): ActionItem => ({
												...action,
												handler: async () => {
													const id =
														typeof item === 'object' && item && 'id' in item
															? (item.id as number | string)
															: undefined;
													await action.handler(id);
												}
											}))}
										/>
									</Table.Cell>
								{/if}
							</tr>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>

			<div
				class="flex flex-col items-center gap-3 border-t px-4 py-3 sm:flex-row sm:justify-between"
			>
				<div class="text-sm text-muted-foreground">
					Toplam {filteredAndSortedData().length}
				</div>

				{#if totalPages > 1}
					<nav class="flex flex-wrap items-center justify-center gap-1" aria-label="Sayfalama">
						<Button
							variant="outline"
							size="sm"
							aria-label="Önceki sayfa"
							onclick={() => goToPage(currentPage - 1)}
							disabled={currentPage === 1}
						>
							«
						</Button>

						{#each getPageNumbers() as page, index (index)}
							{#if page === '...'}
								<span class="px-1 text-muted-foreground" aria-hidden="true">…</span>
							{:else}
								<Button
									variant={currentPage === page ? 'secondary' : 'outline'}
									size="sm"
									aria-current={currentPage === page ? 'page' : undefined}
									onclick={() => goToPage(page as number)}
								>
									{page}
								</Button>
							{/if}
						{/each}

						<Button
							variant="outline"
							size="sm"
							aria-label="Sonraki sayfa"
							onclick={() => goToPage(currentPage + 1)}
							disabled={currentPage === totalPages}
						>
							»
						</Button>
					</nav>
				{/if}

				<div class="flex items-center gap-2">
					{#if totalPages > 1}
						<span class="text-sm text-muted-foreground">
							Sayfa {currentPage} / {totalPages}
						</span>
						<span class="text-muted-foreground/40">•</span>
					{/if}
					<label for="table-page-size" class="text-sm text-muted-foreground">Sayfa başına:</label>
					<NativeSelect
						id="table-page-size"
						class="w-20"
						value={String(pageSize)}
						onchange={handlePageSizeChange}
					>
						<option value="10">10</option>
						<option value="25">25</option>
						<option value="50">50</option>
						<option value="100">100</option>
					</NativeSelect>
				</div>
			</div>
		{/if}
	</Card.Content>
</Card.Root>
