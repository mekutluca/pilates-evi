import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';
import { getFormDataString, getRequiredFormDataString } from '$lib/utils';

export const actions: Actions = {
	createRoom: async ({ request, locals: { supabase, user, userRole } }) => {
		if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
			return fail(403, { success: false, message: 'Bu işlemi gerçekleştirmek için yetkiniz yok' });
		}

		const formData = await request.formData();

		const name = getRequiredFormDataString(formData, 'name');
		const capacityStr = getFormDataString(formData, 'capacity');
		const capacity = capacityStr ? Number(capacityStr) : null;
		const selectedTrainingIds = formData.getAll('selectedTrainingIds').map((id) => Number(id));

		const { data: roomData, error: createError } = await supabase
			.from('pe_rooms')
			.insert({
				name,
				capacity
			})
			.select()
			.single();

		if (createError || !roomData) {
			return fail(500, {
				success: false,
				message: 'Oda oluşturulurken hata: ' + createError?.message
			});
		}

		// Create room-training relationships
		if (selectedTrainingIds.length > 0) {
			const roomTrainingInserts = selectedTrainingIds.map((trainingId) => ({
				room_id: roomData.id,
				training_id: trainingId
			}));

			const { error: relationError } = await supabase
				.from('pe_room_trainings')
				.insert(roomTrainingInserts);

			if (relationError) {
				console.error('Error creating room-training relationships:', relationError);
			}
		}

		return { success: true, message: 'Oda başarıyla oluşturuldu' };
	},

	updateRoom: async ({ request, locals: { supabase, user, userRole } }) => {
		if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
			return fail(403, { success: false, message: 'Bu işlemi gerçekleştirmek için yetkiniz yok' });
		}

		const formData = await request.formData();

		const roomId = Number(getRequiredFormDataString(formData, 'roomId'));
		const name = getRequiredFormDataString(formData, 'name');
		const capacityStr = getFormDataString(formData, 'capacity');
		const capacity = capacityStr ? Number(capacityStr) : null;
		const selectedTrainingIds = formData.getAll('selectedTrainingIds').map((id) => Number(id));

		if (isNaN(roomId)) {
			return fail(400, { success: false, message: 'Geçersiz oda ID' });
		}

		const { error: updateError } = await supabase
			.from('pe_rooms')
			.update({ name, capacity })
			.eq('id', roomId);

		if (updateError) {
			return fail(500, {
				success: false,
				message: 'Oda güncellenirken hata: ' + updateError.message
			});
		}

		// Update room-training relationships
		// First, delete existing relationships
		const { error: deleteError } = await supabase
			.from('pe_room_trainings')
			.delete()
			.eq('room_id', roomId);

		if (deleteError) {
			console.error('Error deleting existing room-training relationships:', deleteError);
		}

		// Then, insert new relationships
		if (selectedTrainingIds.length > 0) {
			const roomTrainingInserts = selectedTrainingIds.map((trainingId) => ({
				room_id: roomId,
				training_id: trainingId
			}));

			const { error: relationError } = await supabase
				.from('pe_room_trainings')
				.insert(roomTrainingInserts);

			if (relationError) {
				console.error('Error creating room-training relationships:', relationError);
			}
		}

		return { success: true, message: 'Oda başarıyla güncellendi' };
	},

	deleteRoom: async ({ request, locals: { supabase, user, userRole } }) => {
		if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
			return fail(403, { success: false, message: 'Bu işlemi gerçekleştirmek için yetkiniz yok' });
		}

		const formData = await request.formData();
		const roomId = Number(formData.get('roomId'));

		if (!roomId) {
			return fail(400, { success: false, message: 'Oda ID gereklidir' });
		}

		// Delete room-training relationships first (CASCADE will handle this automatically)
		// But we'll do it explicitly for clarity
		const { error: relationDeleteError } = await supabase
			.from('pe_room_trainings')
			.delete()
			.eq('room_id', roomId);

		if (relationDeleteError) {
			console.error('Error deleting room-training relationships:', relationDeleteError);
		}

		const { error: deleteError } = await supabase.from('pe_rooms').delete().eq('id', roomId);

		if (deleteError) {
			return fail(500, { success: false, message: 'Oda silinirken hata: ' + deleteError.message });
		}

		return { success: true, message: 'Oda başarıyla silindi' };
	}
};
