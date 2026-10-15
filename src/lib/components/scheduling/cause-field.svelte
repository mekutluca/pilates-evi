<script lang="ts">
	import type { CauseFieldProps } from '$lib/types/ComponentProps';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';

	// The studio's reason for a change; required, and it goes into the WhatsApp message
	let { value = $bindable(), id, placeholder = 'ör. eğitmen izinli' }: CauseFieldProps = $props();
</script>

<div class="grid gap-1.5">
	<Label for={id}>Sebep <span class="text-muted-foreground">(zorunlu)</span></Label>
	<Textarea
		{id}
		bind:value
		rows={2}
		{placeholder}
		aria-required="true"
		aria-describedby="{id}-hint"
	/>
	<p id="{id}-hint" class="text-xs text-muted-foreground">Öğrencilere giden mesajda yer alır.</p>
</div>
