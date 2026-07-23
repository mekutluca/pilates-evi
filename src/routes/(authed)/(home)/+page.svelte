<script lang="ts">
	import PageHeader from '$lib/components/page-header.svelte';
	import StatCard from '$lib/components/stat-card.svelte';
	import Calendar from '@lucide/svelte/icons/calendar';
	import CalendarClock from '@lucide/svelte/icons/calendar-clock';
	import Users from '@lucide/svelte/icons/users';
	import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
	import AlertCircle from '@lucide/svelte/icons/alert-circle';
	import CheckCircle from '@lucide/svelte/icons/check-circle';
	import Info from '@lucide/svelte/icons/info';
	import {
		getWeekStart,
		formatWeekRange,
		formatDisplayDate,
		formatShortTurkishDateTime
	} from '$lib/utils/date-utils';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import * as Alert from '$lib/components/ui/alert/index.js';
	import { CardSkeleton, StatCardSkeleton } from '$lib/components/skeletons/index.js';
	import type { AnyDashboardStats } from '$lib/types/Dashboard';

	let { data } = $props();

	// Streamed data resolved into local state. `undefined` = loading, `null` =
	// failed. Stale values are kept during invalidation to avoid flashing skeletons.
	let stats = $state<AnyDashboardStats | null | undefined>(undefined);

	$effect(() => {
		const promise = data.stats;
		promise.then((result) => {
			if (data.stats === promise) stats = result;
		});
	});

	const now = new Date();
	const weekStart = getWeekStart(now);
	const weekRange = formatWeekRange(weekStart);
	const isTrainer = $derived(data.userRole === 'trainer');
</script>

<svelte:head>
	<title>Panel · Pilates Evi</title>
</svelte:head>

<div class="p-6">
	<PageHeader title="Bu Hafta" subtitle={weekRange} />

	{#if stats === undefined}
		<div
			class="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 {isTrainer
				? 'lg:grid-cols-3'
				: 'lg:grid-cols-4'}"
		>
			{#each { length: isTrainer ? 3 : 4 }, i (i)}
				<StatCardSkeleton />
			{/each}
		</div>
		<div class="grid grid-cols-1 gap-6 {isTrainer ? '' : 'lg:grid-cols-2'}">
			<CardSkeleton rows={3} rowClass="h-16" />
			{#if !isTrainer}
				<CardSkeleton rows={3} rowClass="h-16" />
			{/if}
		</div>
	{:else if stats === null}
		<Alert.Root variant="destructive">
			<AlertCircle class="h-5 w-5 shrink-0" />
			<Alert.Description>
				Panel verileri yüklenemedi. Lütfen sayfayı yenileyip tekrar deneyin.
			</Alert.Description>
		</Alert.Root>
	{:else if stats.kind === 'trainer'}
		<!-- Trainer Statistics Cards -->
		<div class="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
			<StatCard title="Bugünkü Dersler" value={stats.todayAppointmentsCount} icon={Calendar} />
			<StatCard
				title="Bu Hafta Dersleriniz"
				value={stats.weekAppointmentsCount}
				icon={CalendarClock}
			/>
			<StatCard title="Katılan Öğrenciler" value={stats.uniqueTraineesCount} icon={Users} />
		</div>

		<!-- This Week's Lessons -->
		<Card.Root class="flex max-h-[60vh] flex-col">
			<Card.Header class="flex flex-row items-center justify-between space-y-0">
				<Card.Title class="flex items-center gap-2 text-lg">
					<CalendarClock size={20} />
					Bu Hafta Dersleriniz
				</Card.Title>
				{#if stats.weeklyAppointments.length > 0}
					<Badge variant="outline">{stats.weeklyAppointments.length}</Badge>
				{/if}
			</Card.Header>

			<Card.Content class="min-h-0 flex-1 overflow-y-auto">
				{#if stats.weeklyAppointments.length === 0}
					<div class="flex flex-col items-center justify-center py-8">
						<CheckCircle class="mb-3 h-12 w-12 text-muted-foreground" />
						<div class="text-center font-semibold text-muted-foreground">
							Bu hafta dersiniz bulunmuyor
						</div>
					</div>
				{:else}
					<ul class="space-y-2">
						{#each stats.weeklyAppointments as appointment (appointment.id)}
							<li class="flex items-center gap-3 rounded-lg bg-muted p-3">
								<div class="flex-1">
									<p class="font-medium">
										{appointment.date
											? formatShortTurkishDateTime(appointment.date, appointment.hour ?? 0)
											: '-'}
									</p>
									<p class="text-sm text-muted-foreground">{appointment.room_name}</p>
								</div>
								<div class="text-right">
									<p class="font-medium">{appointment.package_name || 'Ders Bilgisi Yok'}</p>
									<p class="text-sm text-muted-foreground">
										{appointment.trainee_count || 0} öğrenci
									</p>
								</div>
							</li>
						{/each}
					</ul>
				{/if}
			</Card.Content>
		</Card.Root>
	{:else}
		<!-- Statistics Cards -->
		<div class="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
			<StatCard title="Randevular" value={stats.appointmentsCount} icon={Calendar} />
			<StatCard title="Katılımcı Öğrenciler" value={stats.uniqueTraineesCount} icon={Users} />
			<StatCard
				title="Yeni Satın Almalar"
				value={stats.purchasesThisWeek.length}
				icon={ShoppingCart}
			/>
			<StatCard
				title="Son Dersi Olanlar"
				value={stats.traineesWithLastLessons.length}
				icon={AlertCircle}
			/>
		</div>

		<!-- Content Grid -->
		<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
			<!-- Purchases This Week Card -->
			<Card.Root class="flex max-h-[50vh] flex-col">
				<Card.Header class="flex flex-row items-center justify-between space-y-0">
					<Card.Title class="flex items-center gap-2 text-lg">
						<ShoppingCart size={20} />
						Bu Hafta Yapılan Satın Almalar
					</Card.Title>
					{#if stats.purchasesThisWeek.length > 0}
						<Badge variant="outline">{stats.purchasesThisWeek.length}</Badge>
					{/if}
				</Card.Header>

				<Card.Content class="min-h-0 flex-1 overflow-y-auto">
					{#if stats.purchasesThisWeek.length === 0}
						<Alert.Root class="border-info/30 bg-info/10 text-info-foreground">
							<Info class="h-5 w-5 shrink-0" />
							<Alert.Description>Bu hafta henüz satın alma yapılmadı.</Alert.Description>
						</Alert.Root>
					{:else}
						<ul class="space-y-2">
							{#each stats.purchasesThisWeek as purchase (purchase.id + purchase.trainee?.id)}
								<li class="flex items-center gap-3 rounded-lg bg-muted p-3">
									<div class="flex-1">
										{#if purchase.trainee?.id}
											<a href="/trainees/{purchase.trainee.id}" class="font-medium hover:underline">
												{purchase.trainee.name}
											</a>
										{:else}
											<p class="font-medium">Bilinmeyen Öğrenci</p>
										{/if}
										<p class="text-sm text-muted-foreground">
											{formatDisplayDate(purchase.created_at)}
										</p>
									</div>
									<div class="text-right">
										<p class="font-medium">{purchase.package?.name || 'Paket Yok'}</p>
										{#if purchase.package?.package_type}
											<p class="text-sm text-muted-foreground">
												{purchase.package.package_type === 'private' ? 'Özel' : 'Grup'}
											</p>
										{/if}
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</Card.Content>
			</Card.Root>

			<!-- Trainees with Last Lessons Card -->
			<Card.Root class="flex max-h-[50vh] flex-col">
				<Card.Header class="flex flex-row items-center justify-between space-y-0">
					<Card.Title class="flex items-center gap-2 text-lg">
						<AlertCircle size={20} />
						Son Dersi Yaklaşanlar
					</Card.Title>
					{#if stats.traineesWithLastLessons.length > 0}
						<Badge variant="outline">{stats.traineesWithLastLessons.length}</Badge>
					{/if}
				</Card.Header>

				<Card.Content class="min-h-0 flex-1 overflow-y-auto">
					{#if stats.traineesWithLastLessons.length === 0}
						<div class="flex flex-col items-center justify-center py-8">
							<CheckCircle class="mb-3 h-12 w-12 text-success" />
							<div class="text-center">
								<div class="font-semibold text-success">Son dersine yaklaşan öğrenci yok</div>
							</div>
						</div>
					{:else}
						<ul class="space-y-2">
							{#each stats.traineesWithLastLessons as item (item.trainee.id)}
								<li class="flex items-center gap-3 rounded-lg bg-muted p-3">
									<div class="flex-1">
										<a href="/trainees/{item.trainee.id}" class="font-medium hover:underline">
											{item.trainee.name}
										</a>
										<p class="text-sm text-muted-foreground">
											{item.session_number}/{item.total_sessions} ders
											{#if item.package}
												- {item.package.name}
											{/if}
										</p>
									</div>
									<div class="flex flex-col items-end gap-1">
										<Badge variant="outline">
											{item.total_sessions - item.session_number} ders kaldı
										</Badge>
										{#if item.appointment_date}
											<span class="text-xs text-muted-foreground">
												{formatDisplayDate(item.appointment_date)}
											</span>
										{/if}
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</Card.Content>
			</Card.Root>
		</div>
	{/if}
</div>
