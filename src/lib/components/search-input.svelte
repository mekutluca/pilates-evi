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

<label class="input-bordered input flex w-full items-center gap-2 {classes}">
	<input type="text" class="grow" {placeholder} bind:value />
	{#if value?.trim()}
		<button
			type="button"
			class="cursor-pointer text-base-content/60 hover:text-base-content"
			on:click={clear}
			title={clearTitle}
			aria-label={clearTitle}
		>
			<X size={16} />
		</button>
	{/if}
</label>
