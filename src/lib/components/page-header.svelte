<script lang="ts">
  export let title: string;
  export let subtitle: string = '';
</script>

<div class="mb-6">
  <h1 class="text-3xl font-bold">{title}</h1>
  {#if subtitle}
    <p class="text-base-content/70 mt-2">{subtitle}</p>
  {/if}
  <slot />
  <!-- optional slot for extra content under the header, if needed -->
</div>

