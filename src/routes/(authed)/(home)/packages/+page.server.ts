import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import type { CreatePackageForm } from '$lib/types/Package';

export const actions: Actions = {
	createPackage: async ({ request, locals: { supabase, user, userRole } }) => {
		// Only admin users can create packages
		if (!user || userRole !== 'admin') {
			return fail(403, {
				success: false,
				message: 'Bu işlemi gerçekleştirmek için yetkiniz yok'
			});
		}

		const formData = await request.formData();
		const packageFormJson = formData.get('packageData') as string;

		if (!packageFormJson) {
			return fail(400, {
				success: false,
				message: 'Ders verileri eksik'
			});
		}

		let packageForm: CreatePackageForm;
		try {
			packageForm = JSON.parse(packageFormJson);
		} catch {
			return fail(400, {
				success: false,
				message: 'Ders verileri geçersiz format'
			});
		}

		// Validate required fields
		if (
			!packageForm.name ||
			!packageForm.lessons_per_week ||
			!packageForm.max_capacity ||
			!packageForm.package_type
		) {
			return fail(400, {
				success: false,
				message: 'Ders adı, tür, haftalık ders sayısı ve maksimum kapasite gereklidir'
			});
		}

		// Validate weeks duration for private packages only
		if (packageForm.package_type === 'private') {
			if (!packageForm.weeks_duration || packageForm.weeks_duration < 1) {
				return fail(400, {
					success: false,
					message: 'Özel dersler için ders süresi en az 1 hafta olmalıdır'
				});
			}
		}

		// Create package with new simplified structure
		const { error: packageError } = await supabase
			.from('pe_packages')
			.insert({
				name: packageForm.name,
				description: packageForm.description || null,
				weeks_duration: packageForm.weeks_duration,
				lessons_per_week: packageForm.lessons_per_week,
				max_capacity: packageForm.max_capacity,
				package_type: packageForm.package_type,
				reschedulable: packageForm.reschedulable,
				reschedule_limit: packageForm.reschedule_limit || null
			})
			.select('id')
			.single();

		if (packageError) {
			return fail(500, {
				success: false,
				message: 'Ders oluşturulurken hata: ' + packageError.message
			});
		}

		// Package created successfully
		// Trainee assignments and scheduling will be done via the new assignment flow

		return {
			success: true,
			message: 'Ders başarıyla oluşturuldu'
		};
	},

	editPackage: async ({ request, locals: { supabase, user, userRole } }) => {
		// Only admin users can edit packages
		if (!user || userRole !== 'admin') {
			return fail(403, {
				success: false,
				message: 'Bu işlemi gerçekleştirmek için yetkiniz yok'
			});
		}

		const formData = await request.formData();
		const packageId = formData.get('packageId') as string;
		const name = formData.get('name') as string;
		const description = formData.get('description') as string;
		const maxCapacity = formData.get('max_capacity') as string;
		const reschedulable = formData.get('reschedulable') === 'true';
		const rescheduleLimit = formData.get('reschedule_limit') as string;

		if (!packageId || !name || !maxCapacity) {
			return fail(400, {
				success: false,
				message: 'Tüm gerekli alanlar doldurulmalıdır'
			});
		}

		// Validate numeric fields
		const maxCapacityNum = parseInt(maxCapacity);
		const rescheduleLimitNum = rescheduleLimit ? parseInt(rescheduleLimit) : null;

		if (isNaN(maxCapacityNum)) {
			return fail(400, {
				success: false,
				message: 'Sayısal alanlar geçerli olmalıdır'
			});
		}

		// Update package (excluding weeks_duration, lessons_per_week, and trainee_type)
		const { error: updateError } = await supabase
			.from('pe_packages')
			.update({
				name,
				description: description || null,
				max_capacity: maxCapacityNum,
				reschedulable,
				reschedule_limit: rescheduleLimitNum
			})
			.eq('id', packageId);

		if (updateError) {
			return fail(500, {
				success: false,
				message: 'Ders güncellenirken hata oluştu: ' + updateError.message
			});
		}

		return {
			success: true,
			message: 'Ders başarıyla güncellendi'
		};
	},

	archivePackage: async ({ request, locals: { supabase, user, userRole } }) => {
		// Only admin users can archive packages
		if (!user || userRole !== 'admin') {
			return fail(403, {
				success: false,
				message: 'Bu işlemi gerçekleştirmek için yetkiniz yok'
			});
		}

		const formData = await request.formData();
		const packageId = Number(formData.get('packageId'));

		if (!packageId) {
			return fail(400, {
				success: false,
				message: 'Ders ID gereklidir'
			});
		}

		const { error: archiveError } = await supabase
			.from('pe_packages')
			.update({ is_active: false })
			.eq('id', packageId);

		if (archiveError) {
			return fail(500, {
				success: false,
				message: 'Ders arşivlenirken hata: ' + archiveError.message
			});
		}

		return {
			success: true,
			message: 'Ders başarıyla arşivlendi'
		};
	},

	restorePackage: async ({ request, locals: { supabase, user, userRole } }) => {
		// Only admin users can restore packages
		if (!user || userRole !== 'admin') {
			return fail(403, {
				success: false,
				message: 'Bu işlemi gerçekleştirmek için yetkiniz yok'
			});
		}

		const formData = await request.formData();
		const packageId = Number(formData.get('packageId'));

		if (!packageId) {
			return fail(400, {
				success: false,
				message: 'Ders ID gereklidir'
			});
		}

		const { error: restoreError } = await supabase
			.from('pe_packages')
			.update({ is_active: true })
			.eq('id', packageId);

		if (restoreError) {
			return fail(500, {
				success: false,
				message: 'Ders geri yüklenirken hata: ' + restoreError.message
			});
		}

		return {
			success: true,
			message: 'Ders başarıyla geri yüklendi'
		};
	}
};
