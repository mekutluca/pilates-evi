import { fail } from '@sveltejs/kit';
import { getFormDataString } from '$lib/utils/form-utils';
import type { Actions } from './$types';
import type { CreatePackageForm } from '$lib/types';
import { requireAdmin } from '$lib/server/permissions';

export const actions: Actions = {
	createPackage: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireAdmin(user, userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const packageFormJson = getFormDataString(formData, 'packageData');

		if (!packageFormJson) {
			return fail(400, {
				success: false,
				message: 'Paket verileri eksik'
			});
		}

		let packageForm: CreatePackageForm;
		try {
			packageForm = JSON.parse(packageFormJson);
		} catch {
			return fail(400, {
				success: false,
				message: 'Paket verileri geçersiz'
			});
		}

		// Validate required fields
		if (
			!packageForm.name ||
			!packageForm.min_lessons_per_week ||
			!packageForm.max_lessons_per_week ||
			!packageForm.max_capacity ||
			!packageForm.package_type
		) {
			return fail(400, {
				success: false,
				message: 'Paket adı, tür, haftalık ders sayısı ve kişi sayısı gerekli'
			});
		}

		// Validate min/max lessons per week
		if (packageForm.min_lessons_per_week > packageForm.max_lessons_per_week) {
			return fail(400, {
				success: false,
				message: 'Minimum haftalık ders sayısı maksimumdan büyük olamaz'
			});
		}

		// Validate weeks duration for private packages only
		if (packageForm.package_type === 'private') {
			if (!packageForm.weeks_duration || packageForm.weeks_duration < 1) {
				return fail(400, {
					success: false,
					message: 'Özel ders paketlerinin süresi en az 1 hafta olmalı'
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
				min_lessons_per_week: packageForm.min_lessons_per_week,
				max_lessons_per_week: packageForm.max_lessons_per_week,
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
				message: 'Paket oluşturulurken hata: ' + packageError.message
			});
		}

		// Package created successfully
		// Trainee assignments and scheduling will be done via the new assignment flow

		return {
			success: true,
			message: 'Paket oluşturuldu'
		};
	},

	editPackage: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireAdmin(user, userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const packageId = getFormDataString(formData, 'packageId');
		const name = getFormDataString(formData, 'name');
		const description = getFormDataString(formData, 'description');
		const minLessonsPerWeek = getFormDataString(formData, 'min_lessons_per_week');
		const maxLessonsPerWeek = getFormDataString(formData, 'max_lessons_per_week');
		const maxCapacity = getFormDataString(formData, 'max_capacity');
		const reschedulable = formData.get('reschedulable') === 'true';
		const rescheduleLimit = getFormDataString(formData, 'reschedule_limit');

		if (!packageId || !name || !minLessonsPerWeek || !maxLessonsPerWeek || !maxCapacity) {
			return fail(400, {
				success: false,
				message: 'Tüm gerekli alanlar doldurulmalıdır'
			});
		}

		// Validate numeric fields
		const minLessonsNum = parseInt(minLessonsPerWeek);
		const maxLessonsNum = parseInt(maxLessonsPerWeek);
		const maxCapacityNum = parseInt(maxCapacity);
		const rescheduleLimitNum = rescheduleLimit ? parseInt(rescheduleLimit) : null;

		if (isNaN(minLessonsNum) || isNaN(maxLessonsNum) || isNaN(maxCapacityNum)) {
			return fail(400, {
				success: false,
				message: 'Sayısal alanlar geçerli olmalıdır'
			});
		}

		// Validate min/max lessons per week
		if (minLessonsNum < 1 || minLessonsNum > 7 || maxLessonsNum < 1 || maxLessonsNum > 7) {
			return fail(400, {
				success: false,
				message: 'Haftalık ders sayısı 1 ile 7 arasında olmalıdır'
			});
		}

		if (minLessonsNum > maxLessonsNum) {
			return fail(400, {
				success: false,
				message: 'Minimum haftalık ders sayısı maksimumdan büyük olamaz'
			});
		}

		// Update package (excluding weeks_duration and package_type)
		const { error: updateError } = await supabase
			.from('pe_packages')
			.update({
				name,
				description: description || null,
				min_lessons_per_week: minLessonsNum,
				max_lessons_per_week: maxLessonsNum,
				max_capacity: maxCapacityNum,
				reschedulable,
				reschedule_limit: rescheduleLimitNum
			})
			.eq('id', packageId);

		if (updateError) {
			return fail(500, {
				success: false,
				message: 'Paket kaydedilirken hata: ' + updateError.message
			});
		}

		return {
			success: true,
			message: 'Paket kaydedildi'
		};
	},

	archivePackage: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireAdmin(user, userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const packageId = getFormDataString(formData, 'packageId');

		if (!packageId) {
			return fail(400, {
				success: false,
				message: 'Paket seçilmedi'
			});
		}

		const { error: archiveError } = await supabase
			.from('pe_packages')
			.update({ is_active: false })
			.eq('id', packageId);

		if (archiveError) {
			return fail(500, {
				success: false,
				message: 'Paket arşivlenirken hata: ' + archiveError.message
			});
		}

		return {
			success: true,
			message: 'Paket arşivlendi'
		};
	},

	restorePackage: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireAdmin(user, userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const packageId = getFormDataString(formData, 'packageId');

		if (!packageId) {
			return fail(400, {
				success: false,
				message: 'Paket seçilmedi'
			});
		}

		const { error: restoreError } = await supabase
			.from('pe_packages')
			.update({ is_active: true })
			.eq('id', packageId);

		if (restoreError) {
			return fail(500, {
				success: false,
				message: 'Paket geri yüklenirken hata: ' + restoreError.message
			});
		}

		return {
			success: true,
			message: 'Paket geri yüklendi'
		};
	}
};
