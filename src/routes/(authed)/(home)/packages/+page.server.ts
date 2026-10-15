import { fail } from '@sveltejs/kit';
import { getFormDataString, getFormDataUuid } from '$lib/utils/form-utils';
import type { Actions } from './$types';
import type { CreatePackageForm } from '$lib/types';
import type { SupabaseClientType } from '$lib/types/Supabase';
import { requireAdmin } from '$lib/server/permissions';
import { dbErrorMessage } from '$lib/server/db-errors';
import { isIntInRange, MAX_PACKAGE_WEEKS } from '$lib/utils/validation';

const NOT_FOUND = 'Paket bulunamadı. Sayfayı yenileyin.';

// The limits the package form shows; checked here too since the form can be bypassed
function packageNumbersError(numbers: {
	min_lessons_per_week: number;
	max_lessons_per_week: number;
	max_capacity: number;
	reschedule_limit: number | null;
}): string | null {
	if (
		!isIntInRange(numbers.min_lessons_per_week, 1, 7) ||
		!isIntInRange(numbers.max_lessons_per_week, 1, 7)
	) {
		return 'Haftalık ders sayısı 1 ile 7 arasında olmalı';
	}
	if (numbers.min_lessons_per_week > numbers.max_lessons_per_week) {
		return 'Haftada en az ders sayısı en fazla ders sayısından büyük olamaz';
	}
	if (!isIntInRange(numbers.max_capacity, 1, 50)) return 'Kişi sayısı 1 ile 50 arasında olmalı';
	if (numbers.reschedule_limit !== null && !isIntInRange(numbers.reschedule_limit, 1, 50)) {
		return 'Değişiklik hakkı 1 ile 50 arasında olmalı (sınırsız için boş bırakın)';
	}
	return null;
}

// "" (no limit) → null; anything else is parsed and range-checked by packageNumbersError
function optionalNumber(value: number | string | null | undefined): number | null {
	return value === null || value === undefined || value === '' ? null : Number(value);
}

async function setActive(supabase: SupabaseClientType, formData: FormData, active: boolean) {
	const packageId = getFormDataUuid(formData, 'packageId');
	if (!packageId) return fail(400, { success: false, message: NOT_FOUND });

	const { data, error } = await supabase
		.from('pe_packages')
		.update({ is_active: active })
		.eq('id', packageId)
		.select('id');
	if (error) {
		return fail(500, {
			success: false,
			message: dbErrorMessage(
				error,
				active ? 'Paket geri yüklenemedi. Tekrar deneyin.' : 'Paket arşivlenemedi. Tekrar deneyin.'
			)
		});
	}
	if ((data ?? []).length === 0) return fail(404, { success: false, message: NOT_FOUND });
	return { success: true, message: active ? 'Paket geri yüklendi' : 'Paket arşivlendi' };
}

export const actions: Actions = {
	createPackage: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireAdmin(user, userRole);
		if (denied) return denied;

		const formData = await request.formData();
		let packageForm: CreatePackageForm;
		try {
			packageForm = JSON.parse(getFormDataString(formData, 'packageData'));
		} catch {
			return fail(400, { success: false, message: 'Paket bilgileri okunamadı. Tekrar deneyin.' });
		}

		const name = packageForm.name?.trim();
		if (!name) return fail(400, { success: false, message: 'Paket adı gerekli' });
		if (packageForm.package_type !== 'private' && packageForm.package_type !== 'group') {
			return fail(400, { success: false, message: 'Paket türü seçin' });
		}
		const isPrivate = packageForm.package_type === 'private';
		// Private packages run for a set number of weeks; group packages are open-ended
		if (isPrivate && !isIntInRange(packageForm.weeks_duration, 1, MAX_PACKAGE_WEEKS)) {
			return fail(400, {
				success: false,
				message: `Paket süresi 1 ile ${MAX_PACKAGE_WEEKS} hafta arasında olmalı`
			});
		}
		const reschedulable = packageForm.reschedulable === true;
		const numbers = {
			min_lessons_per_week: Number(packageForm.min_lessons_per_week),
			max_lessons_per_week: Number(packageForm.max_lessons_per_week),
			max_capacity: Number(packageForm.max_capacity),
			reschedule_limit: reschedulable ? optionalNumber(packageForm.reschedule_limit) : null
		};
		const numbersError = packageNumbersError(numbers);
		if (numbersError) return fail(400, { success: false, message: numbersError });

		const { error: packageError } = await supabase.from('pe_packages').insert({
			name,
			description: packageForm.description?.trim() || null,
			weeks_duration: isPrivate ? packageForm.weeks_duration : null,
			package_type: packageForm.package_type,
			reschedulable,
			...numbers
		});
		if (packageError) {
			return fail(500, {
				success: false,
				message: dbErrorMessage(packageError, 'Paket kaydedilemedi. Tekrar deneyin.')
			});
		}

		return { success: true, message: 'Paket oluşturuldu' };
	},

	// Length and type stay as created: running kayıtlar were planned with them
	editPackage: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireAdmin(user, userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const packageId = getFormDataUuid(formData, 'packageId');
		const name = getFormDataString(formData, 'name').trim();
		if (!packageId) return fail(400, { success: false, message: NOT_FOUND });
		if (!name) return fail(400, { success: false, message: 'Paket adı gerekli' });

		const reschedulable = formData.get('reschedulable') === 'true';
		const numbers = {
			min_lessons_per_week: Number(getFormDataString(formData, 'min_lessons_per_week')),
			max_lessons_per_week: Number(getFormDataString(formData, 'max_lessons_per_week')),
			max_capacity: Number(getFormDataString(formData, 'max_capacity')),
			reschedule_limit: reschedulable
				? optionalNumber(getFormDataString(formData, 'reschedule_limit'))
				: null
		};
		const numbersError = packageNumbersError(numbers);
		if (numbersError) return fail(400, { success: false, message: numbersError });

		const { data, error: updateError } = await supabase
			.from('pe_packages')
			.update({
				name,
				description: getFormDataString(formData, 'description').trim() || null,
				reschedulable,
				...numbers
			})
			.eq('id', packageId)
			.select('id');
		if (updateError) {
			return fail(500, {
				success: false,
				message: dbErrorMessage(updateError, 'Paket kaydedilemedi. Tekrar deneyin.')
			});
		}
		if ((data ?? []).length === 0) return fail(404, { success: false, message: NOT_FOUND });

		return { success: true, message: 'Paket kaydedildi' };
	},

	archivePackage: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireAdmin(user, userRole);
		if (denied) return denied;
		return setActive(supabase, await request.formData(), false);
	},

	restorePackage: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireAdmin(user, userRole);
		if (denied) return denied;
		return setActive(supabase, await request.formData(), true);
	}
};
