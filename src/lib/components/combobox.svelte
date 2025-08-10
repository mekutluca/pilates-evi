<script lang="ts" generics="T">
    import Check from '@lucide/svelte/icons/check';
    import ChevronDown from '@lucide/svelte/icons/chevron-down';
    import Search from '@lucide/svelte/icons/search';

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
        placeholder = "Select item...",
        searchPlaceholder = "Search...",
        emptyMessage = "No items found.",
        multiple = false,
        disabled = false,
        getDisplayText = (item: Item) => item.name,
        getSearchText = (item: Item) => item.name,
        onSelect,
        onRemove
    }: Props = $props();

    let isOpen = $state(false);
    let searchTerm = $state('');
    let searchInput: HTMLInputElement | undefined = $state();
    let buttonElement: HTMLButtonElement | undefined = $state();
    let dropdownPosition = $state({ left: 0, top: 0, width: 0 });
    let focusedIndex = $state(-1);

    const filteredItems = $derived(() => {
        if (!searchTerm.trim()) return items;
        
        const term = searchTerm.toLowerCase();
        return items.filter(item => 
            getSearchText(item).toLowerCase().includes(term)
        );
    });

    // Reset focused index when filtered items change
    $effect(() => {
        filteredItems();
        focusedIndex = -1;
    });

    // Update dropdown position when button position changes (e.g., when badges are added/removed)
    $effect(() => {
        selectedItems; // React to selected items changes
        if (isOpen) {
            updateDropdownPosition();
        }
    });

    const displayText = $derived(() => {
        if (!multiple) {
            const selected = selectedItems[0];
            return selected ? getDisplayText(selected) : placeholder;
        }
        
        if (selectedItems.length === 0) return placeholder;
        if (selectedItems.length === 1) return getDisplayText(selectedItems[0]);
        return `${selectedItems.length} öğrenci seçildi`;
    });

    function isSelected(item: Item): boolean {
        return selectedItems.some(selected => selected.id === item.id);
    }

    function updateDropdownPosition() {
        if (!buttonElement) return;
        
        // Use requestAnimationFrame to ensure DOM has updated
        requestAnimationFrame(() => {
            if (!buttonElement) return;
            const rect = buttonElement.getBoundingClientRect();
            dropdownPosition = {
                left: rect.left,
                top: rect.bottom + 4,
                width: rect.width
            };
        });
    }

    function handleSelect(item: Item) {
        if (disabled) return;
        
        if (isSelected(item)) {
            onRemove?.(item);
        } else {
            onSelect?.(item);
        }
        
        if (!multiple) {
            closePopover();
        }
    }

    function openPopover() {
        if (disabled || !buttonElement) return;
        
        isOpen = true;
        updateDropdownPosition();
        
        // Focus first item and input after a brief delay
        setTimeout(() => {
            const currentFilteredItems = filteredItems();
            if (currentFilteredItems.length > 0) {
                focusedIndex = 0;
            }
            searchInput?.focus();
        }, 10);
    }

    function closePopover() {
        isOpen = false;
        searchTerm = '';
        focusedIndex = -1;
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            closePopover();
        }
    }

    function handleInputKeydown(e: KeyboardEvent) {
        if (!isOpen) return;

        const currentFilteredItems = filteredItems();
        
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                focusedIndex = Math.min(focusedIndex + 1, currentFilteredItems.length - 1);
                break;
                
            case 'ArrowUp':
                e.preventDefault();
                focusedIndex = Math.max(focusedIndex - 1, -1);
                break;
                
            case 'Enter':
                e.preventDefault();
                if (focusedIndex >= 0 && focusedIndex < currentFilteredItems.length) {
                    const focusedItem = currentFilteredItems[focusedIndex];
                    handleSelect(focusedItem);
                    searchTerm = '';
                    focusedIndex = -1;
                }
                break;
                
            case 'Escape':
                e.preventDefault();
                closePopover();
                break;
        }
    }

    function handleWindowResize() {
        if (isOpen) {
            updateDropdownPosition();
        }
    }

    function portal(node: HTMLElement) {
        const target = document.body;
        target.appendChild(node);
        
        return {
            destroy() {
                if (node.parentNode) {
                    node.parentNode.removeChild(node);
                }
            }
        };
    }
</script>

<svelte:window on:keydown={handleKeydown} on:resize={handleWindowResize} />

<div class="relative w-full">
    <button
        bind:this={buttonElement}
        type="button"
        class="btn btn-outline justify-between w-full"
        class:btn-disabled={disabled}
        onclick={openPopover}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
    >
        <span class="truncate text-left flex-1">{displayText()}</span>
        <ChevronDown 
            size={16} 
            class="ml-2 flex-shrink-0 transition-transform duration-200 {isOpen ? 'rotate-180' : ''}"
        />
    </button>

</div>

{#if isOpen}
    <div use:portal>
        <!-- Backdrop to close popover when clicking outside -->
        <div 
            class="fixed inset-0 z-[9999]" 
            onclick={closePopover}
            onkeydown={(e) => e.key === 'Escape' && closePopover()}
            role="button"
            tabindex="0"
            aria-label="Close popover"
        ></div>

        <!-- Popover content -->
        <div class="fixed z-[10000] bg-base-100 border border-base-300 rounded-lg shadow-lg max-h-80 overflow-hidden min-w-[200px]" style="left: {dropdownPosition.left}px; top: {dropdownPosition.top}px; width: {dropdownPosition.width}px;">
            <!-- Search input -->
            <div class="p-3 border-b border-base-300">
                <div class="relative">
                    <Search size={16} class="absolute left-3 top-1/2 transform -translate-y-1/2 text-base-content/50" />
                    <input
                        bind:this={searchInput}
                        bind:value={searchTerm}
                        type="text"
                        class="input input-sm w-full pl-4"
                        placeholder={searchPlaceholder}
                        autocomplete="off"
                        onkeydown={handleInputKeydown}
                    />
                </div>
            </div>

            <!-- Items list -->
            <div class="max-h-60 overflow-y-auto">
                {#if filteredItems().length === 0}
                    <div class="p-3 text-center text-base-content/60 text-sm">
                        {emptyMessage}
                    </div>
                {:else}
                    {#each filteredItems() as item, index (item.id)}
                        <button
                            type="button"
                            class="w-full px-3 py-2 text-left hover:bg-base-200 flex items-center justify-between transition-colors cursor-pointer"
                            class:bg-base-200={focusedIndex === index}
                            onclick={() => handleSelect(item)}
                        >
                            <span class="flex-1 truncate">{getDisplayText(item)}</span>
                            {#if isSelected(item)}
                                <Check size={16} class="text-success flex-shrink-0 ml-2" />
                            {/if}
                        </button>
                    {/each}
                {/if}
            </div>
        </div>
    </div>
{/if}