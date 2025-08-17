<script lang="ts" generics="T">
    import ChevronUp from '@lucide/svelte/icons/chevron-up';
    import ChevronDown from '@lucide/svelte/icons/chevron-down';
    import ActionMenu from './action-menu.svelte';

    interface Column {
        key: string;
        title: string;
        sortable?: boolean;
        render?: (item: T, index?: number) => string;
        class?: string;
    }

    interface ActionItem {
        label: string;
        handler: (id: number | string) => void;
        class?: string;
        icon?: any;
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

        let filtered = [...data]; // Create a copy to avoid mutating original

        // Apply search filter if searchTerm is provided
        if (searchTerm && searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter((item) => {
                try {
                    return columns.some((column) => {
                        // Skip non-searchable columns
                        if (column.key === 'actions' || column.key === 'related_trainee_ids' || column.key === 'trainings') return false;
                        
                        const value = getPropertyValue(item, column.key);
                        const searchableValue = String(value ?? '');
                        return searchableValue.toLowerCase().includes(term);
                    });
                } catch (error) {
                    return false;
                }
            });
        }

        // Sort data
        try {
            const sorted = filtered.sort((a, b) => {
                const aVal = getPropertyValue(a, sortKey) ?? '';
                const bVal = getPropertyValue(b, sortKey) ?? '';

                let comparison = 0;
                
                // Handle different data types
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
        } catch (error) {
            return filtered;
        }
    });

    function getPropertyValue(obj: any, path: string): any {
        try {
            if (!obj || !path) return '';
            return path.split('.').reduce((current, key) => current?.[key], obj) ?? '';
        } catch (error) {
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
        const column = columns.find(col => col.key === columnKey);
        if (!column || column.sortable === false) return;

        if (sortKey === columnKey) {
            if (sortOrder === 'asc') {
                sortOrder = 'desc';
            } else if (sortOrder === 'desc') {
                // Reset to default sort
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
                            {#each columns as column}
                                <th 
                                    class="select-none {column.class || ''} {isColumnSortable(column) ? 'cursor-pointer hover:bg-base-200 transition-colors' : ''}"
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
                                <th class="select-none text-right w-24">
                                    <span>{actionsTitle}</span>
                                </th>
                            {/if}
                        </tr>
                    </thead>
                    <tbody>
                        {#each filteredAndSortedData() as item, index}
                            <tr>
                                {#each columns as column}
                                    <td class={column.class || ''}>
                                        {@html getColumnValue(item, column, index)}
                                    </td>
                                {/each}
                                {#if actions && actions.length > 0}
                                    <td class="text-right">
                                        <ActionMenu 
                                            actions={actions.map(action => ({
                                                ...action,
                                                handler: () => action.handler((item as any).id)
                                            }))}
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