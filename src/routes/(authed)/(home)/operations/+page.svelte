<script lang="ts">
	import PageHeader from '$lib/components/page-header.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import CalendarX2 from '@lucide/svelte/icons/calendar-x-2';
	import CalendarOff from '@lucide/svelte/icons/calendar-off';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	const operations = [
		{
			href: '/operations/cancel-day',
			title: 'Günü İptal Et',
			description:
				'Seçilen gündeki tüm randevuları bir sebeple iptal eder; dersler kaydırılır ve öğrencilere bilgi mesajı gönderilir.',
			icon: CalendarX2
		},
		{
			href: '/operations/end-group-lesson',
			title: 'Grup Dersini Sonlandır',
			description:
				'Seçilen grup dersini belirtilen tarihte sonlandırır; o tarihten itibaren oluşturulmuş boş randevular silinir.',
			icon: CalendarOff
		}
	];
</script>

<div class="p-6">
	<PageHeader title="Operasyonlar" subtitle="Toplu işlemleri buradan yönetin." />

	<div class="grid gap-4 sm:grid-cols-2">
		{#each operations as operation (operation.href)}
			<a href={operation.href} class="block">
				<Card.Root class="h-full transition-colors hover:bg-muted/50">
					<Card.Content class="flex items-start gap-4">
						<div class="rounded-lg bg-primary/10 p-3 text-primary">
							<operation.icon size={24} />
						</div>
						<div class="flex-1">
							<h3 class="flex items-center justify-between gap-2 font-semibold">
								{operation.title}
								<ChevronRight size={18} class="text-muted-foreground" />
							</h3>
							<p class="mt-1 text-sm text-muted-foreground">{operation.description}</p>
						</div>
					</Card.Content>
				</Card.Root>
			</a>
		{/each}
	</div>
</div>
