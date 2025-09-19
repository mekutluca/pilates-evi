import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import type { Tables } from '$lib/database.types';
import { getRequiredFormDataString } from '$lib/utils';

type TraineeGroupMembership = Tables<'pe_trainee_groups'> & {
	pe_groups: Tables<'pe_groups'>;
	package?: Tables<'pe_packages'> | null;
};

export const load: PageServerLoad = async ({ params, locals: { supabase } }) => {
	const traineeId = Number(params.id);

	if (isNaN(traineeId)) {
		throw error(400, 'Geçersiz öğrenci ID');
	}

	// Get trainee details
	const { data: trainee, error: traineeError } = await supabase
		.from('pe_trainees')
		.select('*')
		.eq('id', traineeId)
		.single();

	if (traineeError || !trainee) {
		throw error(404, 'Öğrenci bulunamadı');
	}

	// Get trainee's group memberships with package details
	const { data: groupMemberships, error: groupError } = await supabase
		.from('pe_trainee_groups')
		.select(
			`
			*,
			pe_groups (
				id,
				type,
				created_at
			)
		`
		)
		.eq('trainee_id', traineeId)
		.order('created_at', { ascending: false });

	// Get package details separately by finding package_groups for each group
	const groupMembershipsWithPackages: TraineeGroupMembership[] = [];
	if (groupMemberships) {
		for (const membership of groupMemberships) {
			// Get package info for this group
			const { data: packageGroup, error: packageError } = await supabase
				.from('pe_package_groups')
				.select(
					`
					*,
					pe_packages (
						id,
						name,
						description,
						weeks_duration,
						lessons_per_week,
						max_capacity,
						package_type,
						reschedulable,
						reschedule_limit,
						created_at
					)
				`
				)
				.eq('group_id', membership.pe_groups.id)
				.single();

			if (packageError) {
				console.error('Error fetching package for group:', membership.pe_groups.id, packageError);
			}

			groupMembershipsWithPackages.push({
				...membership,
				package: packageGroup?.pe_packages || null
			});
		}
	}

	if (groupError) {
		console.error('Error fetching group memberships:', groupError);
	}

	return {
		trainee,
		groupMemberships: groupMembershipsWithPackages || []
	};
};

export const actions: Actions = {
	update: async ({ request, params, locals: { supabase } }) => {
		const traineeId = Number(params.id);

		if (isNaN(traineeId)) {
			throw error(400, 'Geçersiz öğrenci ID');
		}

		const formData = await request.formData();
		const name = getRequiredFormDataString(formData, 'name');
		const phone = getRequiredFormDataString(formData, 'phone');
		const email = formData.get('email')?.toString() || null;
		const notes = formData.get('notes')?.toString() || null;

		const { error: updateError } = await supabase
			.from('pe_trainees')
			.update({
				name,
				phone,
				email,
				notes
			})
			.eq('id', traineeId);

		if (updateError) {
			console.error('Error updating trainee:', updateError);
			return fail(500, { message: 'Öğrenci güncellenirken hata oluştu' });
		}

		return { success: true };
	}
};
