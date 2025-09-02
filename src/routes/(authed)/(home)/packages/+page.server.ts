import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import type { CreatePackageForm } from '$lib/types/Package';

export const load: PageServerLoad = async ({ locals: { supabase, user, userRole } }) => {
	// Ensure admin and coordinator users can access this page
	if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
		throw error(403, 'Bu sayfaya erişim yetkiniz yok');
	}

	// Fetch all packages with simplified structure
	const { data: packages, error: packagesError } = await supabase
		.from('pe_packages')
		.select(
			`
			*,
			pe_package_groups (
				pe_groups (
					id,
					type,
					pe_trainee_groups (
						pe_trainees (
							id,
							name,
							email
						),
						left_at
					)
				)
			)
		`
		)
		.order('created_at', { ascending: false });

	if (packagesError) {
		throw error(500, 'Dersler yüklenirken hata oluştu: ' + packagesError.message);
	}

	return {
		packages: packages || []
	};
};

export const actions: Actions = {
	createPackage: async ({ request, locals: { supabase, user, userRole } }) => {
		// Ensure admin and coordinator users can perform this action
		if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
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
			!packageForm.weeks_duration
		) {
			return fail(400, {
				success: false,
				message: 'Ders adı, süre, haftalık ders sayısı ve maksimum kapasite gereklidir'
			});
		}

		// Validate weeks duration limits
		if (packageForm.weeks_duration < 1 || packageForm.weeks_duration > 52) {
			return fail(400, {
				success: false,
				message: 'Ders süresi 1 ile 52 hafta arasında olmalıdır'
			});
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
				trainee_type: packageForm.trainee_type,
				reschedulable: packageForm.reschedulable,
				reschedule_limit: packageForm.reschedule_limit || null,
				created_by: user.id
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
		// Ensure admin and coordinator users can perform this action
		if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
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
	}
};
