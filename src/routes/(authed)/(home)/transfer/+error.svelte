<script lang="ts">
	import { page } from '$app/stores';
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';

	const errorStatus = $derived($page.status);
	const errorMessage = $derived($page.error?.message || 'Bir hata oluştu');
</script>

<div class="flex min-h-[60vh] items-center justify-center p-4">
	<div class="flex max-w-md flex-col items-center text-center">
		<AlertTriangle class="h-16 w-16 text-warning" />
		<h2 class="mt-4 text-2xl font-bold">Randevu Değiştirme</h2>

		<div class="mt-6">
			{#if errorStatus === 400 && errorMessage === 'Randevu ID gerekli'}
				<p class="text-base-content/80">Randevu seçilmedi.</p>
				<p class="mt-2 text-sm text-base-content/60">
					Lütfen Haftalık Program sayfasından değişiklik yapmak istediğiniz randevuyu seçin.
				</p>
			{:else if errorStatus === 400 && errorMessage === 'Geçmiş randevular değiştirilemez'}
				<p class="text-base-content/80">Geçmiş randevular değiştirilemez.</p>
				<p class="mt-2 text-sm text-base-content/60">
					Sadece gelecek tarihli randevular değiştirilebilir.
				</p>
			{:else if errorStatus === 404}
				<p class="text-base-content/80">Seçilen randevu bulunamadı.</p>
				<p class="mt-2 text-sm text-base-content/60">
					Randevu silinmiş veya değiştirilmiş olabilir.
				</p>
			{:else if errorStatus === 403}
				<p class="text-base-content/80">Bu sayfaya erişim yetkiniz bulunmuyor.</p>
			{:else}
				<p class="text-base-content/80">
					{errorMessage}
				</p>
			{/if}
		</div>

		<div class="pt-8">
			<a href="/schedule" class="btn btn-warning">
				<ArrowLeft class="h-4 w-4" />
				Haftalık Programa Dön
			</a>
		</div>
	</div>
</div>
