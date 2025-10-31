<script lang="ts">
	import PageHeader from '$lib/components/page-header.svelte';
	import StatCard from '$lib/components/stat-card.svelte';
	import Calendar from '@lucide/svelte/icons/calendar';
	import Users from '@lucide/svelte/icons/users';
	import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
	import AlertCircle from '@lucide/svelte/icons/alert-circle';
	import CheckCircle from '@lucide/svelte/icons/check-circle';
	import Info from '@lucide/svelte/icons/info';
	import { getWeekStart, formatWeekRange, formatDisplayDate } from '$lib/utils/date-utils';

	let { data } = $props();
	let { stats } = $derived(data);

	const now = new Date();
	const weekStart = getWeekStart(now);
	const weekRange = formatWeekRange(weekStart);
</script>

<div class="p-6">
	<PageHeader title="Bu Hafta" subtitle={weekRange} />

	<!-- Statistics Cards -->
	<div class="stats stats-vertical shadow mb-6 bg-base-100 w-full md:stats-horizontal">
		<StatCard title="Randevular" value={stats.appointmentsCount} icon={Calendar} />
		<StatCard title="Katılımcı Öğrenciler" value={stats.uniqueTraineesCount} icon={Users} />
		<StatCard title="Yeni Satın Almalar" value={stats.purchasesThisWeek.length} icon={ShoppingCart} />
		<StatCard
			title="Son Dersi Olanlar"
			value={stats.traineesWithLastLessons.length}
			icon={AlertCircle}
		/>
	</div>

	<!-- Content Grid -->
	<div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
		<!-- Purchases This Week Card -->
		<div class="card bg-base-100 shadow max-h-[50vh] flex flex-col">
			<div class="card-body flex flex-col min-h-0">
				<div class="flex items-center justify-between flex-shrink-0">
					<h3 class="card-title flex items-center gap-2 text-lg">
						<ShoppingCart size={20} />
						Bu Hafta Yapılan Satın Almalar
					</h3>
					{#if stats.purchasesThisWeek.length > 0}
						<span class="badge badge-neutral">{stats.purchasesThisWeek.length}</span>
					{/if}
				</div>

				<div class="flex-1 overflow-y-auto min-h-0">
					{#if stats.purchasesThisWeek.length === 0}
						<div role="alert" class="alert alert-info alert-soft">
							<Info class="h-6 w-6 shrink-0 stroke-current" />
							<span>Bu hafta henüz satın alma yapılmadı.</span>
						</div>
					{:else}
						<ul class="list space-y-2">
							{#each stats.purchasesThisWeek as purchase (purchase.id + purchase.trainee?.id)}
								<li class="list-row items-center gap-3 rounded-lg bg-base-200 p-3">
									<div class="flex-1">
										<p class="font-medium">{purchase.trainee?.name || 'Bilinmeyen Öğrenci'}</p>
										<p class="text-sm text-base-content/70">
											{formatDisplayDate(purchase.created_at)}
										</p>
									</div>
									<div class="text-right">
										<p class="font-medium">{purchase.package?.name || 'Paket Yok'}</p>
										{#if purchase.package?.package_type}
											<p class="text-sm text-base-content/70">
												{purchase.package.package_type === 'private' ? 'Özel' : 'Grup'}
											</p>
										{/if}
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</div>
		</div>

		<!-- Trainees with Last Lessons Card -->
		<div class="card bg-base-100 shadow max-h-[50vh] flex flex-col">
			<div class="card-body flex flex-col min-h-0">
				<div class="flex items-center justify-between flex-shrink-0">
					<h3 class="card-title flex items-center gap-2 text-lg">
						<AlertCircle size={20} />
						Son Dersi Yaklaşanlar
					</h3>
					{#if stats.traineesWithLastLessons.length > 0}
						<span class="badge badge-neutral">{stats.traineesWithLastLessons.length}</span>
					{/if}
				</div>

				<div class="flex-1 overflow-y-auto min-h-0">
					{#if stats.traineesWithLastLessons.length === 0}
						<div class="flex flex-col items-center justify-center py-8">
							<CheckCircle class="mb-3 h-12 w-12 text-success" />
							<div class="text-center">
								<div class="font-semibold text-success">Son dersine yaklaşan öğrenci yok</div>
							</div>
						</div>
					{:else}
						<ul class="list space-y-2">
							{#each stats.traineesWithLastLessons as item (item.trainee.id)}
								<li class="list-row items-center gap-3 rounded-lg bg-base-200 p-3">
									<div class="flex-1">
										<a href="/trainees/{item.trainee.id}" class="font-medium hover:underline">
											{item.trainee.name}
										</a>
										<p class="text-sm text-base-content/70">
											{item.session_number}/{item.total_sessions} ders
											{#if item.package}
												- {item.package.name}
											{/if}
										</p>
									</div>
									<div class="flex flex-col items-end gap-1">
										<span class="badge badge-outline">
											{item.total_sessions - item.session_number} ders kaldı
										</span>
										{#if item.appointment_date}
											<span class="text-xs text-base-content/70">
												{formatDisplayDate(item.appointment_date)}
											</span>
										{/if}
									</div>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			</div>
		</div>
	</div>
</div>
