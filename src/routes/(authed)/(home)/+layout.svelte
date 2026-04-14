<script lang="ts">
	import Menu from '@lucide/svelte/icons/menu';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Settings from '@lucide/svelte/icons/settings';
	import Logout from '@lucide/svelte/icons/log-out';
	import ActionMenu from '$lib/components/action-menu.svelte';
	import GlobalActionDrawer from '$lib/components/global-action-drawer.svelte';
	import { setActionDrawerContext } from '$lib/stores/action-drawer.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { onMount } from 'svelte';
	import { goto, invalidate, beforeNavigate, afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { allRoutes, type Route } from '$lib/types/Route.js';
	import type { Role } from '$lib/types/Role.js';
	import type { ActionItem } from '$lib/types';
	import { version } from '$app/environment';
	import { cn } from '$lib/utils/class-utils';

	let { children, data } = $props();
	let { supabase, session, userRole } = $derived(data);
	let loading = $state(false);
	let loadingTimer: ReturnType<typeof setTimeout> | null = null;

	let mobileSidebarOpen = $state(false);
	let mainEl = $state<HTMLElement | null>(null);

	// Global action drawer state
	let drawerOpen = $state(false);
	let drawerActions = $state<ActionItem[]>([]);

	const userMenuActions: ActionItem[] = [
		{
			label: 'Ayarlar',
			icon: Settings,
			handler: () => goto('/settings')
		},
		{
			label: 'Çıkış Yap',
			icon: Logout,
			handler: async () => await logout()
		}
	];

	function handleOpenDrawer(detail: { actions: ActionItem[] }) {
		drawerActions = detail.actions;
		drawerOpen = true;
	}

	function openDrawer(actions: ActionItem[]) {
		drawerActions = actions;
		drawerOpen = true;
	}

	// Set context for child components
	setActionDrawerContext({
		openDrawer
	});

	async function logout() {
		try {
			await supabase.auth.signOut();
			// Navigation will be handled by the auth state change listener
		} catch (error) {
			console.error('Logout failed:', error);
		}
	}

	onMount(() => {
		const { data } = supabase.auth.onAuthStateChange(async (_, newSession) => {
			if (newSession === null) {
				await goto('/login');
			}

			if (newSession?.expires_at !== session?.expires_at) {
				invalidate('supabase:auth');
			}
		});

		// Navigation loading logic
		beforeNavigate((navigation) => {
			const url = navigation.to?.url;

			if (!url || (url.protocol && url.protocol !== 'http:' && url.protocol !== 'https:')) {
				return;
			}

			if (url.origin && url.origin !== window.location.origin) {
				return;
			}

			if (loadingTimer) clearTimeout(loadingTimer);
			loadingTimer = setTimeout(() => {
				loading = true;
			}, 2000);
		});

		afterNavigate((navigation) => {
			if (loadingTimer) clearTimeout(loadingTimer);
			loading = false;
			mobileSidebarOpen = false;
			if (mainEl && navigation.from?.url.pathname !== navigation.to?.url.pathname) {
				mainEl.scrollTop = 0;
			}
		});

		return () => {
			data.subscription.unsubscribe();
			if (loadingTimer) clearTimeout(loadingTimer);
		};
	});

	function getAvailableRoutes(userRole: Role | null): Route[] {
		if (!userRole) return [];
		return allRoutes.filter((route) => route.availableToRoles.includes(userRole));
	}

	function groupRoutes(routes: Route[]): Record<string, Route[]> {
		return routes.reduce(
			(groups, route) => {
				if (!groups[route.group]) {
					groups[route.group] = [];
				}
				groups[route.group].push(route);
				return groups;
			},
			{} as Record<string, Route[]>
		);
	}

	let availableRoutes = $derived(getAvailableRoutes(userRole));
	let groupedRoutes = $derived(groupRoutes(availableRoutes));

	function isRouteActive(route: Route): boolean {
		return page.url.pathname === route.href || page.url.pathname.startsWith(route.href + '/');
	}
</script>

{#snippet sidebarContent()}
	{#each Object.entries(groupedRoutes) as [groupName, routes], groupIndex (groupName)}
		{#if groupIndex > 0}
			<Separator class="my-3" />
		{/if}
		<p class="mb-1 px-3 text-xs font-semibold text-muted-foreground">{groupName}</p>
		<ul class="space-y-1">
			{#each routes as route (route.href)}
				<li>
					<a
						href={route.href}
						class={cn(
							'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
							isRouteActive(route)
								? 'bg-accent font-medium text-accent-foreground'
								: 'text-foreground hover:bg-muted'
						)}
					>
						<route.icon size={16} /><span>{route.label}</span>
					</a>
				</li>
			{/each}
		</ul>
	{/each}
{/snippet}

<div class="flex h-screen flex-col">
	<!-- Loading Overlay -->
	{#if loading}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-background/80">
			<Spinner class="size-8" />
		</div>
	{/if}

	<!-- Top navbar -->
	<header class="flex h-14 flex-none items-center gap-2 border-b bg-card px-4 shadow-sm">
		<Button
			variant="ghost"
			size="icon"
			class="lg:hidden"
			onclick={() => (mobileSidebarOpen = true)}
		>
			<Menu />
		</Button>
		<div class="flex-1">
			<Button variant="ghost" href="/" class="text-xl font-semibold">Pilates Evi</Button>
		</div>
		<ActionMenu actions={userMenuActions} trigger={Ellipsis} onOpenDrawer={handleOpenDrawer} />
	</header>

	<!-- Main content area with sidebar and scrollable content -->
	<div class="flex flex-1 overflow-hidden">
		<!-- Desktop sidebar -->
		<aside class="hidden w-64 flex-col justify-between border-r bg-card p-4 lg:flex">
			<nav>
				{@render sidebarContent()}
			</nav>
			<p class="text-xs text-muted-foreground">Build {version}</p>
		</aside>

		<!-- Mobile sidebar via Sheet -->
		<Sheet.Root bind:open={mobileSidebarOpen}>
			<Sheet.Content side="left" class="w-64 p-4">
				<Sheet.Header class="sr-only">
					<Sheet.Title>Menü</Sheet.Title>
				</Sheet.Header>
				<nav class="mt-4">
					{@render sidebarContent()}
				</nav>
				<p class="mt-auto text-xs text-muted-foreground">Build {version}</p>
			</Sheet.Content>
		</Sheet.Root>

		<!-- Scrollable content area -->
		<main bind:this={mainEl} class="flex-1 overflow-auto bg-muted/30">
			{@render children()}
		</main>
	</div>
</div>

<!-- Global Action Drawer -->
<GlobalActionDrawer bind:isOpen={drawerOpen} actions={drawerActions} />
