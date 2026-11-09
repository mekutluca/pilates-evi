<script lang="ts">
	import type { WaTemplateStatusBadgeProps } from '$lib/types/ComponentProps';
	import type { WaTemplateStatus } from '$lib/types/WhatsAppTemplate';
	import type { BadgeVariant } from '$lib/components/ui/badge/badge.svelte';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import Clock from '@lucide/svelte/icons/clock';
	import Check from '@lucide/svelte/icons/check';
	import X from '@lucide/svelte/icons/x';
	import Pause from '@lucide/svelte/icons/pause';
	import Ban from '@lucide/svelte/icons/ban';

	// Meta's verdict on a template. Only "Onaylı" sends; a rejection is the one red state,
	// since it blocks the messages that use it.
	let { status }: WaTemplateStatusBadgeProps = $props();

	const STATUS: Record<
		WaTemplateStatus,
		{ label: string; variant: BadgeVariant; icon: typeof Clock }
	> = {
		approved: { label: 'Onaylı', variant: 'secondary', icon: Check },
		pending: { label: 'Onay bekliyor', variant: 'outline', icon: Clock },
		rejected: { label: 'Reddedildi', variant: 'destructive', icon: X },
		paused: { label: 'Durduruldu', variant: 'outline', icon: Pause },
		disabled: { label: 'Kapatıldı', variant: 'outline', icon: Ban }
	};

	const current = $derived(STATUS[status]);
</script>

<Badge variant={current.variant}>
	<current.icon data-icon="inline-start" />
	{current.label}
</Badge>
