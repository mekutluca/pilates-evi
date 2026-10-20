<script lang="ts">
	import type { TraineeNotesFieldProps } from '$lib/types/ComponentProps';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Textarea } from '$lib/components/ui/textarea/index.js';

	// A trainee's notes; their trainers read them on their lessons, so the hint says so
	let { value = $bindable(), id, rows = 3 }: TraineeNotesFieldProps = $props();
</script>

<div class="grid gap-2">
	<Label for={id}>Notlar (isteğe bağlı)</Label>
	<Textarea
		{id}
		name="notes"
		bind:value
		{rows}
		placeholder="ör. Bel fıtığı var, öne eğilme yok"
		aria-describedby="{id}-hint"
	/>
	<p id="{id}-hint" class="text-xs text-muted-foreground">
		Öğrencinin eğitmenleri bu notu derslerde görür. Sağlık durumu ve kısıtlar için kullanın.
	</p>
</div>
