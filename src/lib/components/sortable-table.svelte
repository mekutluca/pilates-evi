<script lang="ts" generics="T">
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ActionMenu from './action-menu.svelte';
	import type { ActionItem } from '$lib/types';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Table from '$lib/components/ui/table/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { NativeSelect } from '$lib/components/ui/native-select/index.js';
	import { cn } from '$lib/utils/class-utils';

	interface Column {
		key: string;
		title: string;
		sortable?: boolean;
		render?: (item: T, index?: number) => string;
		renderComponent?: import('svelte').Component<{ item: T; index: number }>;
		class?: string;
	}

	interface Props {
		data: T[];
		columns: Column[];
		searchTerm?: string;
		emptyMessage?: string;
		defaultSortKey?: string;
		defaultSortOrder?: 'asc' | 'desc';
		actions?: ActionItem[] | ((item: T) => ActionItem[]);
		actionsTitle?: string;
		onRowClick?: (item: T) => void;
		itemsPerPage?: number;
	}

	let {
		data,
		columns,
		searchTerm = '',
		emptyMessage = 'Veri bulunamadı',
		defaultSortKey = 'id',
		defaultSortOrder = 'asc',
		actions = [],
		actionsTitle = 'İşlemler',
		onRowClick,
		itemsPerPage = 10
	}: Props = $props();

	let sortKey = $state(defaultSortKey);
	let sortOrder = $state<'asc' | 'desc'>(defaultSortOrder);
	let currentPage = $state(1);
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

	function getColumnValue(item: T, column: Column, index?: number): string {
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
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions -- Dependency tracking for Svelte 5 reactivity
		searchTerm;
		currentPage = 1;
	});

	function getSortIcon(columnKey: string) {
		if (sortKey !== columnKey) return null;
		return sortOrder === 'asc' ? ChevronUp : ChevronDown;
	}

	function isColumnSortable(column: Column): boolean {
		return column.sortable !== false;
	}

	function handlePageSizeChange(e: Event) {
		const target = e.target as HTMLSelectElement;
		pageSize = Number(target.value);
		currentPage = 1;
	}
</script>

<Card.Root>
	<Card.Content class="p-0">
		{#if filteredAndSortedData().length === 0}
			<div class="py-8 text-center">
				<p class="text-muted-foreground">
					{searchTerm ? 'Arama kriterlerine uygun veri bulunamadı' : emptyMessage}
				</p>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							{#each columns as column (column.key)}
								<Table.Head
									class={cn(
										column.class || '',
										isColumnSortable(column)
											? 'cursor-pointer transition-colors select-none hover:bg-muted'
											: 'select-none'
									)}
									onclick={() => handleSort(column.key)}
								>
									<div class="flex items-center gap-2">
										<span>{column.title}</span>
										{#if isColumnSortable(column)}
											{@const SortIcon = getSortIcon(column.key)}
											{#if SortIcon}
												<SortIcon size={14} class="text-muted-foreground" />
											{:else}
												<div class="w-[14px]"></div>
											{/if}
										{/if}
									</div>
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
							<Table.Row
								class={onRowClick ? 'cursor-pointer' : ''}
								onclick={() => onRowClick?.(item)}
							>
								{#each columns as column (column.key)}
									<Table.Cell class={column.class || ''}>
										{#if column.renderComponent}
											{@const Component = column.renderComponent}
											<Component {item} index={globalIndex} />
										{:else if column.render}
											<!-- eslint-disable-next-line svelte/no-at-html-tags -->
											{@html getColumnValue(item, column, globalIndex)}
										{:else}
											{getColumnValue(item, column, globalIndex)}
										{/if}
									</Table.Cell>
								{/each}
								{#if actions && (typeof actions === 'function' ? actions(item).length > 0 : actions.length > 0)}
									{@const itemActions = typeof actions === 'function' ? actions(item) : actions}
									<Table.Cell class="text-right" onclick={(e: MouseEvent) => e.stopPropagation()}>
										<ActionMenu
											actions={itemActions.map(
												(action): ActionItem => ({
													...action,
													handler: async () => {
														const id =
															typeof item === 'object' && item && 'id' in item
																? (item.id as number | string)
																: undefined;
														await action.handler(id);
													}
												})
											)}
										/>
									</Table.Cell>
								{/if}
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>

			<div
				class="flex flex-col items-center gap-3 border-t px-4 py-3 sm:flex-row sm:justify-between"
			>
				<div class="text-sm text-muted-foreground">
					Toplam {filteredAndSortedData().length} kayıt
				</div>

				{#if totalPages > 1}
					<div class="flex items-center gap-1">
						<Button
							variant="outline"
							size="sm"
							onclick={() => goToPage(currentPage - 1)}
							disabled={currentPage === 1}
						>
							«
						</Button>

						{#each getPageNumbers() as page, index (index)}
							{#if page === '...'}
								<Button variant="outline" size="sm" disabled>...</Button>
							{:else}
								<Button
									variant={currentPage === page ? 'default' : 'outline'}
									size="sm"
									onclick={() => goToPage(page as number)}
								>
									{page}
								</Button>
							{/if}
						{/each}

						<Button
							variant="outline"
							size="sm"
							onclick={() => goToPage(currentPage + 1)}
							disabled={currentPage === totalPages}
						>
							»
						</Button>
					</div>
				{/if}

				<div class="flex items-center gap-2">
					{#if totalPages > 1}
						<span class="text-sm text-muted-foreground">
							Sayfa {currentPage} / {totalPages}
						</span>
						<span class="text-muted-foreground/40">•</span>
					{/if}
					<span class="text-sm text-muted-foreground">Sayfa başına:</span>
					<NativeSelect class="w-20" value={String(pageSize)} onchange={handlePageSizeChange}>
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
