import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { getRequiredFormDataString } from '$lib/utils/form-utils';
import { requireStaff } from '$lib/server/permissions';
import { TraineeRepository } from '$lib/server/repositories/trainee-repository';

export const actions: Actions = {
	createTrainee: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const input = TraineeRepository.parseForm(await request.formData());
		if (typeof input === 'string') return fail(400, { success: false, message: input });

		const createError = await new TraineeRepository(supabase).create(input);
		if (createError) return fail(400, { success: false, message: createError });

		return { success: true, message: 'Öğrenci eklendi' };
	},

	updateTrainee: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const input = TraineeRepository.parseForm(formData);
		if (typeof input === 'string') return fail(400, { success: false, message: input });

		const updateError = await new TraineeRepository(supabase).update(
			getRequiredFormDataString(formData, 'traineeId'),
			input
		);
		if (updateError) return fail(400, { success: false, message: updateError });

		return { success: true, message: 'Öğrenci kaydedildi' };
	},

	archiveTrainee: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const archiveError = await new TraineeRepository(supabase).setActive(
			getRequiredFormDataString(formData, 'traineeId'),
			false
		);
		if (archiveError) return fail(400, { success: false, message: archiveError });

		return { success: true, message: 'Öğrenci arşivlendi' };
	},

	restoreTrainee: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const restoreError = await new TraineeRepository(supabase).setActive(
			getRequiredFormDataString(formData, 'traineeId'),
			true
		);
		if (restoreError) return fail(400, { success: false, message: restoreError });

		return { success: true, message: 'Öğrenci geri yüklendi' };
	}
};
