<script lang="ts">
	import type { Component } from 'svelte';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Lock from '@lucide/svelte/icons/lock';
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import House from '@lucide/svelte/icons/house';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import RotateCw from '@lucide/svelte/icons/rotate-cw';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import { defaultErrorMessage } from '$lib/utils/errors';
	import type { ErrorKind } from '$lib/types/ErrorState';

	let { status, message }: { status: number; message?: string } = $props();

	// 401 is folded into forbidden: the auth guard redirects unauthenticated
	// visitors, so a 401 that reaches the page is an authorization problem.
	let kind = $derived<ErrorKind>(
		status === 404 ? 'notFound' : status === 401 || status === 403 ? 'forbidden' : 'server'
	);

	// `tab` is the document title, `title` the headline.
	const COPY: Record<ErrorKind, { icon: Component; tab: string; title: string }> = {
		notFound: { icon: CircleAlert, tab: 'Sayfa bulunamadı', title: 'Bu adreste bir sayfa yok' },
		forbidden: { icon: Lock, tab: 'Erişim yok', title: 'Bu alana erişim yetkiniz yok' },
		server: { icon: TriangleAlert, tab: 'Bir hata oluştu', title: 'Bir şeyler ters gitti' }
	};

	let copy = $derived(COPY[kind]);
	let description = $derived(message || defaultErrorMessage(status));
</script>

<svelte:head>
	<title>{copy.tab} · Pilates Evi</title>
</svelte:head>

<Empty.Root class="max-w-md border border-dashed">
	<Empty.Header>
		<Empty.Media variant="icon">
			<copy.icon />
		</Empty.Media>
		<p class="font-mono text-xs tracking-widest text-muted-foreground uppercase">Hata {status}</p>
		<Empty.Title>{copy.title}</Empty.Title>
		<Empty.Description>{description}</Empty.Description>
	</Empty.Header>
	<Empty.Content>
		<div class="flex flex-wrap justify-center gap-2">
			<Button href="/" size="sm">
				<House data-icon="inline-start" />
				Ana sayfaya dön
			</Button>
			{#if kind === 'server'}
				<Button variant="outline" size="sm" onclick={() => location.reload()}>
					<RotateCw data-icon="inline-start" />
					Tekrar dene
				</Button>
			{:else}
				<Button variant="outline" size="sm" onclick={() => history.back()}>
					<ArrowLeft data-icon="inline-start" />
					Geri dön
				</Button>
			{/if}
		</div>
	</Empty.Content>
</Empty.Root>
