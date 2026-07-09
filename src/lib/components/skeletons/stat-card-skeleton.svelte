<script lang="ts">
	import * as Card from '$lib/components/ui/card/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton/index.js';
</script>

<Card.Root>
	<Card.Header class="flex flex-row items-center justify-between pb-2">
		<Skeleton class="h-4 w-28" />
		<Skeleton class="size-5 rounded-full" />
	</Card.Header>
	<Card.Content>
		<Skeleton class="h-8 w-14" />
	</Card.Content>
</Card.Root>
