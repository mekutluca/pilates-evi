<script lang="ts" generics="T">
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ActionMenu from './action-menu.svelte';
	import type { ActionItem } from '$lib/types/ActionItem';

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
		actions?: ActionItem[];
		actionsTitle?: string;
	}

	let {
		data,
		columns,
		searchTerm = '',
		emptyMessage = 'Veri bulunamadı',
		defaultSortKey = 'id',
		defaultSortOrder = 'asc',
		actions = [],
		actionsTitle = 'İşlemler'
	}: Props = $props();

	let sortKey = $state(defaultSortKey);
	let sortOrder = $state<'asc' | 'desc'>(defaultSortOrder);

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
	}

	function getSortIcon(columnKey: string) {
		if (sortKey !== columnKey) return null;
		return sortOrder === 'asc' ? ChevronUp : ChevronDown;
	}

	function isColumnSortable(column: Column): boolean {
		return column.sortable !== false;
	}
</script>

<div class="card bg-base-100 shadow">
	<div class="card-body">
		{#if filteredAndSortedData().length === 0}
			<div class="py-8 text-center">
				<p class="text-base-content/70">
					{searchTerm ? 'Arama kriterlerine uygun veri bulunamadı' : emptyMessage}
				</p>
			</div>
		{:else}
			<div class="overflow-x-auto md:overflow-x-visible">
				<table class="table table-zebra">
					<thead>
						<tr>
							{#each columns as column (column.key)}
								<th
									class="select-none {column.class || ''} {isColumnSortable(column)
										? 'cursor-pointer transition-colors hover:bg-base-200'
										: ''}"
									onclick={() => handleSort(column.key)}
								>
									<div class="flex items-center gap-2">
										<span>{column.title}</span>
										{#if isColumnSortable(column)}
											{@const SortIcon = getSortIcon(column.key)}
											{#if SortIcon}
												<SortIcon size={14} class="text-base-content/60" />
											{:else}
												<div class="w-[14px]"></div>
											{/if}
										{/if}
									</div>
								</th>
							{/each}
							{#if actions && actions.length > 0}
								<th class="w-24 text-right select-none">
									<span>{actionsTitle}</span>
								</th>
							{/if}
						</tr>
					</thead>
					<tbody>
						{#each filteredAndSortedData() as item, index ((typeof item === 'object' && item && 'id' in item ? item.id : null) || index)}
							<tr>
								{#each columns as column (column.key)}
									<td class={column.class || ''}>
										{#if column.renderComponent}
											{@const Component = column.renderComponent}
											<Component {item} {index} />
										{:else if column.render}
											{@html getColumnValue(item, column, index)}
										{:else}
											{getColumnValue(item, column, index)}
										{/if}
									</td>
								{/each}
								{#if actions && actions.length > 0}
									<td class="text-right">
										<ActionMenu
											actions={actions.map(
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
									</td>
								{/if}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</div>
