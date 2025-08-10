<script lang="ts">
  import X from '@lucide/svelte/icons/x';

  export let value: string = '';
  export let placeholder: string = '';
  export let clearTitle: string = 'Aramayı temizle';
  export let classes: string = '';

  function clear() {
    value = '';
  }
</script>

<label class="input input-bordered flex items-center gap-2 w-full {classes}">
  <input
    type="text"
    class="grow"
    placeholder={placeholder}
    bind:value={value}
  />
  {#if value?.trim()}
    <button
      type="button"
      class="text-base-content/60 hover:text-base-content cursor-pointer"
      on:click={clear}
      title={clearTitle}
      aria-label={clearTitle}
    >
      <X size={16} />
    </button>
  {/if}
</label>

