<script lang="ts">
	import Menu from '@lucide/svelte/icons/menu';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import Settings from '@lucide/svelte/icons/settings';
	import Logout from '@lucide/svelte/icons/log-out';
	import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
	import BanknoteArrowUp from '@lucide/svelte/icons/banknote-arrow-up';
	import ArrowRightLeft from '@lucide/svelte/icons/arrow-right-left';
	import CircleCheckBig from '@lucide/svelte/icons/circle-check-big';
	import User from '@lucide/svelte/icons/user';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import { onMount } from 'svelte';
	import { goto, invalidate, beforeNavigate, afterNavigate } from '$app/navigation';
	import { page } from '$app/state';

	let { children, data } = $props();
	let { supabase, session } = $derived(data);
	let user = $derived(data.user || session?.user);
	let loading = $state(false);
	let loadingTimer: ReturnType<typeof setTimeout> | null = null;

	function toggleDrawer() {
		const drawerCheckbox = document.getElementById('my-drawer-2') as HTMLInputElement;
		if (drawerCheckbox) {
			drawerCheckbox.checked = !drawerCheckbox.checked;
		}
	}

	function closeDropdown() {
		const activeElement = document?.activeElement as HTMLElement | null;
		activeElement?.blur();
	}

	function closeDrawer() {
		const drawerCheckbox = document.getElementById('my-drawer-2') as HTMLInputElement;
		if (drawerCheckbox) {
			drawerCheckbox.checked = false;
		}
	}

	async function logout() {
		await supabase.auth.signOut();
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
		beforeNavigate(() => {
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

	const sidebarItems = [
		{ href: '/', label: 'Panel', icon: LayoutDashboard },
		{ href: '/balance', label: 'Hesap Hareketleri', icon: BanknoteArrowUp },
		{ href: '/transactions', label: 'İşlem Geçmişi', icon: ArrowRightLeft },
		{ href: '/orders', label: 'Talepler', icon: CircleCheckBig }
	];

	const adminItems = [
		{ href: '/admin/users', label: 'Kullanıcılar', icon: User },
		{ href: '/admin/dataentry', label: 'Veri Gir', icon: ArrowRightLeft }
	];
</script>

<div class="flex h-screen flex-col">
	<!-- Loading Overlay -->
	{#if loading}
		<div class="bg-base-200/80 fixed inset-0 z-50 flex items-center justify-center">
			<span class="loading loading-spinner loading-lg text-primary"></span>
		</div>
	{/if}
	<!-- Fixed navbar at top -->
	<div class="navbar bg-base-300 flex-none shadow-sm">
		<div class="flex-none">
			<button class="btn btn-square btn-ghost lg:hidden" onclick={toggleDrawer}>
				<Menu />
			</button>
		</div>
		<div class="flex-1">
			<a class="btn btn-ghost text-xl" href="/">Invest Track</a>
		</div>
		<div class="flex-none">
			<div class="dropdown dropdown-end">
				<div tabindex="0" role="button" class="btn btn-square btn-ghost"><Ellipsis /></div>
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<ul
					tabindex="0"
					class="dropdown-content menu rounded-box bg-base-200 z-1 w-52 p-2 shadow-sm"
				>
					<li><a onclick={closeDropdown} href="/settings"><Settings size="16" /> Settings</a></li>
					<li>
						<button
							onclick={() => {
								closeDropdown();
								logout();
							}}
						>
							<Logout size="16" /> Logout
						</button>
					</li>
				</ul>
			</div>
		</div>
	</div>

	<!-- Main content area with sidebar and scrollable content -->
	<div class="flex flex-1 overflow-hidden">
		<!-- Fixed sidebar -->
		<div class="bg-base-200 hidden w-80 p-4 lg:block">
			<ul class="menu text-base-content w-full">
				{#each sidebarItems as item}
					<li class="w-full">
						<a
							href={item.href}
							class="flex w-full items-center {page.url.pathname === item.href
								? 'menu-active'
								: ''}"
						>
							<item.icon size="16" /><span>{item.label}</span>
						</a>
					</li>
				{/each}
			</ul>
			{#if user?.role === 'admin'}
				<div class="divider my-2"></div>
				<ul class="menu text-base-content w-full">
					{#each adminItems as item}
						<li class="w-full">
							<a
								href={item.href}
								class="flex w-full items-center {page.url.pathname === item.href
									? 'menu-active'
									: ''}"
							>
								<item.icon size="16" /><span>{item.label}</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		<!-- Mobile drawer -->
		<div class="drawer lg:hidden">
			<input id="my-drawer-2" type="checkbox" class="drawer-toggle" />
			<div class="drawer-content flex flex-col overflow-auto">
				{@render children()}
			</div>
			<div class="drawer-side">
				<label for="my-drawer-2" aria-label="close sidebar" class="drawer-overlay"></label>
				<div class="bg-base-200 text-base-content min-h-full w-80 p-4">
					<!-- Back arrow for mobile sidebar -->
					<button
						class="btn btn-ghost mb-2 lg:hidden"
						type="button"
						onclick={closeDrawer}
						aria-label="Kapat"
					>
						<ArrowLeft size="20" />
					</button>
					<ul class="menu w-full">
						{#each sidebarItems as item}
							<li class="w-full">
								<a
									href={item.href}
									onclick={closeDrawer}
									class="flex w-full items-center {page.url.pathname === item.href
										? 'menu-active'
										: ''}"
								>
									<item.icon size="16" /><span>{item.label}</span>
								</a>
							</li>
						{/each}
					</ul>
					{#if user?.role === 'admin'}
						<div class="divider my-2"></div>
						<ul class="menu w-full">
							{#each adminItems as item}
								<li class="w-full">
									<a
										href={item.href}
										onclick={closeDrawer}
										class="flex w-full items-center {page.url.pathname === item.href
											? 'menu-active'
											: ''}"
									>
										<item.icon size="16" /><span>{item.label}</span>
									</a>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</div>
		</div>

		<!-- Desktop scrollable content area -->
		<div class="hidden flex-1 overflow-auto lg:block">
			{@render children()}
		</div>
	</div>
</div>

<!-- The first element on the sidebar have :active attribute which makes it colorful-->
<style>
	.menu :where(li) > :not(ul, .menu-title, details, .btn):focus,
	.menu :where(li) > :not(ul, .menu-title, details, .btn):active {
		background-color: transparent !important;
		color: inherit !important;
		box-shadow: none !important;
	}
</style>
