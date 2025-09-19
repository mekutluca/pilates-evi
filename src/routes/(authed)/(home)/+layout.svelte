<script lang="ts">
	import Menu from '@lucide/svelte/icons/menu';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Settings from '@lucide/svelte/icons/settings';
	import Logout from '@lucide/svelte/icons/log-out';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import ActionMenu from '$lib/components/action-menu.svelte';
	import GlobalActionDrawer from '$lib/components/global-action-drawer.svelte';
	import { setActionDrawerContext } from '$lib/stores/action-drawer.svelte';
	import { onMount } from 'svelte';
	import { goto, invalidate, beforeNavigate, afterNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { allRoutes, type Route } from '$lib/types/Route.js';
	import type { Role } from '$lib/types/Role.js';
	import type { ActionItem } from '$lib/types/ActionItem.js';

	let { children, data } = $props();
	let { supabase, session, userRole } = $derived(data);
	let loading = $state(false);
	let loadingTimer: ReturnType<typeof setTimeout> | null = null;

	// Global action drawer state
	let drawerOpen = $state(false);
	let drawerActions = $state<ActionItem[]>([]);

	function toggleDrawer() {
		const drawerCheckbox = document.getElementById('my-drawer-2') as HTMLInputElement;
		if (drawerCheckbox) {
			drawerCheckbox.checked = !drawerCheckbox.checked;
		}
	}

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

	function closeDrawer() {
		const drawerCheckbox = document.getElementById('my-drawer-2') as HTMLInputElement;
		if (drawerCheckbox) {
			drawerCheckbox.checked = false;
		}
	}

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
			// Don't show loading for external links or non-http protocols
			if (navigation.to?.url.protocol && !navigation.to.url.protocol.startsWith('http')) {
				return;
			}

			if (loadingTimer) clearTimeout(loadingTimer);
			loadingTimer = setTimeout(() => {
				loading = true;
			}, 2000);
		});
		afterNavigate(() => {
			if (loadingTimer) clearTimeout(loadingTimer);
			loading = false;
		});

		return () => {
			data.subscription.unsubscribe();
			if (loadingTimer) clearTimeout(loadingTimer);
		};
	});

	function getAvailableRoutes(userRole: Role | undefined): Route[] {
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
</script>

<div class="flex h-screen flex-col">
	<!-- Loading Overlay -->
	{#if loading}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-base-200/80">
			<span class="loading loading-lg loading-spinner text-primary"></span>
		</div>
	{/if}
	<!-- Fixed navbar at top -->
	<div class="navbar flex-none bg-base-300 shadow-sm">
		<div class="flex-none">
			<button class="btn btn-square btn-ghost lg:hidden" onclick={toggleDrawer}>
				<Menu />
			</button>
		</div>
		<div class="flex-1">
			<a class="btn text-xl btn-ghost" href="/">Pilates Evi</a>
		</div>
		<div class="flex-none">
			<ActionMenu
				actions={userMenuActions}
				trigger={Ellipsis}
				triggerClass="btn btn-square btn-ghost"
				onOpenDrawer={handleOpenDrawer}
			/>
		</div>
	</div>

	<!-- Main content area with sidebar and scrollable content -->
	<div class="flex flex-1 overflow-hidden">
		<!-- Fixed sidebar -->
		<div class="hidden w-80 bg-base-200 p-4 lg:block">
			{#each Object.entries(groupedRoutes) as [groupName, routes], groupIndex (groupName)}
				{#if groupIndex > 0}
					<div class="divider my-2"></div>
				{/if}
				<div class="mb-1 menu-title text-xs font-semibold text-base-content/70">{groupName}</div>
				<ul class="menu w-full text-base-content">
					{#each routes as route (route.href)}
						<li class="w-full">
							<a
								href={route.href}
								class="flex w-full items-center {page.url.pathname === route.href ||
								page.url.pathname.startsWith(route.href + '/')
									? 'menu-active'
									: ''}"
							>
								<route.icon size="16" /><span>{route.label}</span>
							</a>
						</li>
					{/each}
				</ul>
			{/each}
		</div>

		<!-- Mobile drawer -->
		<div class="drawer lg:hidden">
			<input id="my-drawer-2" type="checkbox" class="drawer-toggle" />
			<div class="drawer-content flex flex-col overflow-auto">
				{@render children()}
			</div>
			<div class="drawer-side">
				<label for="my-drawer-2" aria-label="close sidebar" class="drawer-overlay"></label>
				<div class="min-h-full w-80 bg-base-200 p-4 text-base-content">
					<!-- Back arrow for mobile sidebar -->
					<button
						class="btn mb-2 btn-ghost lg:hidden"
						type="button"
						onclick={closeDrawer}
						aria-label="Kapat"
					>
						<ArrowLeft size="20" />
					</button>
					{#each Object.entries(groupedRoutes) as [groupName, routes], groupIndex (groupName)}
						{#if groupIndex > 0}
							<div class="divider my-2"></div>
						{/if}
						<div class="mb-1 menu-title text-xs font-semibold text-base-content/70">
							{groupName}
						</div>
						<ul class="menu w-full">
							{#each routes as route (route.href)}
								<li class="w-full">
									<a
										href={route.href}
										onclick={closeDrawer}
										class="flex w-full items-center {page.url.pathname === route.href ||
										page.url.pathname.startsWith(route.href + '/')
											? 'menu-active'
											: ''}"
									>
										<route.icon size="16" /><span>{route.label}</span>
									</a>
								</li>
							{/each}
						</ul>
					{/each}
				</div>
			</div>
		</div>

		<!-- Desktop scrollable content area -->
		<div class="hidden flex-1 overflow-auto lg:block">
			{@render children()}
		</div>
	</div>
</div>

<!-- Global Action Drawer -->
<GlobalActionDrawer bind:isOpen={drawerOpen} actions={drawerActions} />

<!-- The first element on the sidebar have :active attribute which makes it colorful-->
<style>
	.menu :where(li) > :not(ul, .menu-title, details, .btn):focus,
	.menu :where(li) > :not(ul, .menu-title, details, .btn):active {
		background-color: transparent !important;
		color: inherit !important;
		box-shadow: none !important;
	}
</style>
