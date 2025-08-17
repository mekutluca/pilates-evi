import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import type { Role } from '$lib/types/Role';
import type { User } from '@supabase/auth-js';

// Helper function to validate user permissions
function validateUserPermission(user: User | null, userRole: Role | null) {
	if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
		return fail(403, { success: false, message: 'Bu işlemi gerçekleştirmek için yetkiniz yok' });
	}
	return null;
}

export const actions: Actions = {
	createTrainee: async ({ request, locals: { supabase, user, userRole } }) => {
		const permissionError = validateUserPermission(user, userRole);
		if (permissionError) return permissionError;

		const formData = await request.formData();
		const name = formData.get('name') as string;
		const email = formData.get('email') as string;
		const phone = formData.get('phone') as string;
		const notes = formData.get('notes') as string;
		const selectedTraineeIds = formData.getAll('selectedTraineeIds').map((id) => Number(id));

		if (!name) {
			return fail(400, { success: false, message: 'Öğrenci adı gereklidir' });
		}

		if (!phone) {
			return fail(400, { success: false, message: 'Telefon numarası gereklidir' });
		}

		if (!email) {
			return fail(400, { success: false, message: 'Email adresi gereklidir' });
		}

		// Validate email format
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return fail(400, { success: false, message: 'Geçerli bir email adresi girin' });
		}

		const { data: traineeData, error: createError } = await supabase
			.from('pe_trainees')
			.insert({
				name,
				email,
				phone,
				notes: notes || null,
				related_trainee_ids: selectedTraineeIds
			})
			.select()
			.single();

		if (createError || !traineeData) {
			return fail(500, {
				success: false,
				message: 'Öğrenci oluşturulurken hata: ' + createError?.message
			});
		}

		// Create bidirectional relationships
		if (selectedTraineeIds.length > 0) {
			// Get current related_trainee_ids for each selected trainee
			const { data: relatedTrainees, error: fetchError } = await supabase
				.from('pe_trainees')
				.select('id, related_trainee_ids')
				.in('id', selectedTraineeIds);

			if (fetchError) {
				console.error('Error fetching related trainees:', fetchError);
			} else if (relatedTrainees) {
				// Update each related trainee to include the new trainee's ID
				const updates = relatedTrainees.map(async (relatedTrainee) => {
					const currentIds = relatedTrainee.related_trainee_ids || [];
					const newIds = [...new Set([...currentIds, traineeData.id])]; // Add new ID and remove duplicates

					return supabase
						.from('pe_trainees')
						.update({ related_trainee_ids: newIds })
						.eq('id', relatedTrainee.id);
				});

				// Execute all updates
				const results = await Promise.all(updates);

				// Check for any errors
				const errors = results.filter((result) => result.error);
				if (errors.length > 0) {
					console.error('Errors updating bidirectional relationships:', errors);
				}
			}
		}

		return { success: true, message: 'Öğrenci başarıyla oluşturuldu' };
	},

	updateTrainee: async ({ request, locals: { supabase, user, userRole } }) => {
		const permissionError = validateUserPermission(user, userRole);
		if (permissionError) return permissionError;

		const formData = await request.formData();
		const traineeId = Number(formData.get('traineeId'));
		const name = formData.get('name') as string;
		const email = formData.get('email') as string;
		const phone = formData.get('phone') as string;
		const notes = formData.get('notes') as string;
		const selectedTraineeIds = formData.getAll('selectedTraineeIds').map((id) => Number(id));

		if (!traineeId || !name) {
			return fail(400, { success: false, message: 'Öğrenci ID ve adı gereklidir' });
		}

		if (!phone) {
			return fail(400, { success: false, message: 'Telefon numarası gereklidir' });
		}

		if (!email) {
			return fail(400, { success: false, message: 'Email adresi gereklidir' });
		}

		// Validate email format
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
			return fail(400, { success: false, message: 'Geçerli bir email adresi girin' });
		}

		// Get current relationships before updating
		const { data: currentTrainee, error: fetchCurrentError } = await supabase
			.from('pe_trainees')
			.select('related_trainee_ids')
			.eq('id', traineeId)
			.single();

		if (fetchCurrentError) {
			return fail(500, {
				success: false,
				message: 'Mevcut öğrenci bilgileri alınırken hata: ' + fetchCurrentError.message
			});
		}

		const currentRelatedIds = currentTrainee?.related_trainee_ids || [];

		const { error: updateError } = await supabase
			.from('pe_trainees')
			.update({
				name,
				email,
				phone,
				notes: notes || null,
				related_trainee_ids: selectedTraineeIds
			})
			.eq('id', traineeId);

		if (updateError) {
			return fail(500, {
				success: false,
				message: 'Öğrenci güncellenirken hata: ' + updateError.message
			});
		}

		// Update bidirectional relationships
		// Find added and removed relationships
		const addedIds = selectedTraineeIds.filter((id: number) => !currentRelatedIds.includes(id));
		const removedIds = currentRelatedIds.filter((id: number) => !selectedTraineeIds.includes(id));

		// Handle added relationships
		if (addedIds.length > 0) {
			const { data: addedTrainees, error: fetchAddedError } = await supabase
				.from('pe_trainees')
				.select('id, related_trainee_ids')
				.in('id', addedIds);

			if (!fetchAddedError && addedTrainees) {
				const addUpdates = addedTrainees.map(async (trainee) => {
					const currentIds = trainee.related_trainee_ids || [];
					const newIds = [...new Set([...currentIds, traineeId])];

					return supabase
						.from('pe_trainees')
						.update({ related_trainee_ids: newIds })
						.eq('id', trainee.id);
				});

				await Promise.all(addUpdates);
			}
		}

		// Handle removed relationships
		if (removedIds.length > 0) {
			const { data: removedTrainees, error: fetchRemovedError } = await supabase
				.from('pe_trainees')
				.select('id, related_trainee_ids')
				.in('id', removedIds);

			if (!fetchRemovedError && removedTrainees) {
				const removeUpdates = removedTrainees.map(async (trainee) => {
					const currentIds = trainee.related_trainee_ids || [];
					const newIds = currentIds.filter((id: number) => id !== traineeId);

					return supabase
						.from('pe_trainees')
						.update({ related_trainee_ids: newIds })
						.eq('id', trainee.id);
				});

				await Promise.all(removeUpdates);
			}
		}

		return { success: true, message: 'Öğrenci başarıyla güncellendi' };
	},

	deleteTrainee: async ({ request, locals: { supabase, user, userRole } }) => {
		const permissionError = validateUserPermission(user, userRole);
		if (permissionError) return permissionError;

		const formData = await request.formData();
		const traineeId = Number(formData.get('traineeId'));

		if (!traineeId) {
			return fail(400, { success: false, message: 'Öğrenci ID gereklidir' });
		}

		// Before deleting, remove this trainee's ID from all other trainees' related_trainee_ids
		const { data: allTrainees, error: fetchAllError } = await supabase
			.from('pe_trainees')
			.select('id, related_trainee_ids')
			.neq('id', traineeId); // Exclude the trainee being deleted

		if (fetchAllError) {
			return fail(500, {
				success: false,
				message: 'İlgili öğrenci bilgileri alınırken hata: ' + fetchAllError.message
			});
		}

		if (allTrainees) {
			// Find trainees that have the deleted trainee in their relationships
			const traineesToUpdate = allTrainees.filter(
				(trainee) => trainee.related_trainee_ids && trainee.related_trainee_ids.includes(traineeId)
			);

			// Remove the deleted trainee's ID from their relationships
			const cleanupUpdates = traineesToUpdate.map(async (trainee) => {
				const newIds = trainee.related_trainee_ids.filter((id: number) => id !== traineeId);

				return supabase
					.from('pe_trainees')
					.update({ related_trainee_ids: newIds })
					.eq('id', trainee.id);
			});

			// Execute all cleanup updates
			const results = await Promise.all(cleanupUpdates);

			// Check for any errors in cleanup
			const errors = results.filter((result) => result.error);
			if (errors.length > 0) {
				console.error('Errors cleaning up relationships:', errors);
			}
		}

		const { error: deleteError } = await supabase.from('pe_trainees').delete().eq('id', traineeId);

		if (deleteError) {
			return fail(500, {
				success: false,
				message: 'Öğrenci silinirken hata: ' + deleteError.message
			});
		}

		return { success: true, message: 'Öğrenci başarıyla silindi' };
	}
};
