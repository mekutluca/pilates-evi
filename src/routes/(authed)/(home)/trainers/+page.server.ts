import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

// Helper function to validate user permissions
function validateUserPermission(user: any, userRole: any) {
    if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
        return fail(403, {
            success: false,
            message: 'Bu işlemi gerçekleştirmek için yetkiniz yok'
        });
    }
    return null;
}

// Helper function to manage training assignments
async function updateTrainerTrainings(supabase: any, trainerId: number, selectedTrainingIds: number[]) {
    // Delete existing assignments
    const { error: deleteError } = await supabase
        .from('pe_trainer_trainings')
        .delete()
        .eq('trainer_id', trainerId);

    if (deleteError) {
        console.error('Error removing existing training assignments:', deleteError);
    }

    // Insert new assignments if any
    if (selectedTrainingIds.length > 0) {
        const trainingAssignments = selectedTrainingIds.map(trainingId => ({
            trainer_id: trainerId,
            training_id: trainingId
        }));

        const { error: assignError } = await supabase
            .from('pe_trainer_trainings')
            .insert(trainingAssignments);

        if (assignError) {
            console.error('Training assignment error:', assignError);
        }
    }
}

export const actions: Actions = {
    createTrainer: async ({ request, locals: { supabase, user, userRole } }) => {
        const permissionError = validateUserPermission(user, userRole);
        if (permissionError) return permissionError;

        const formData = await request.formData();
        const name = formData.get('name') as string;
        const phone = formData.get('phone') as string;
        const selectedTrainingIds = formData.getAll('selectedTrainingIds').map(id => Number(id));

        // Validate required fields
        if (!name) {
            return fail(400, {
                success: false,
                message: 'Eğitmen adı gereklidir'
            });
        }

        if (!phone) {
            return fail(400, {
                success: false,
                message: 'Telefon numarası gereklidir'
            });
        }

        // Create trainer in pe_trainers table
        const { data: trainerData, error: createError } = await supabase
            .from('pe_trainers')
            .insert({
                name,
                phone
            })
            .select()
            .single();

        if (createError || !trainerData) {
            return fail(500, {
                success: false,
                message: 'Eğitmen oluşturulurken hata: ' + createError?.message
            });
        }

        // Assign selected trainings to the new trainer
        await updateTrainerTrainings(supabase, trainerData.id, selectedTrainingIds);

        return {
            success: true,
            message: 'Eğitmen başarıyla oluşturuldu'
        };
    },

    updateTrainer: async ({ request, locals: { supabase, user, userRole } }) => {
        const permissionError = validateUserPermission(user, userRole);
        if (permissionError) return permissionError;

        const formData = await request.formData();
        const trainerId = Number(formData.get('trainerId'));
        const name = formData.get('name') as string;
        const phone = formData.get('phone') as string;
        const selectedTrainingIds = formData.getAll('selectedTrainingIds').map(id => Number(id));

        // Validate required fields
        if (!trainerId || !name) {
            return fail(400, {
                success: false,
                message: 'Eğitmen ID ve adı gereklidir'
            });
        }

        if (!phone) {
            return fail(400, {
                success: false,
                message: 'Telefon numarası gereklidir'
            });
        }

        // Update trainer in pe_trainers table
        const { error: updateError } = await supabase
            .from('pe_trainers')
            .update({
                name,
                phone
            })
            .eq('id', trainerId);

        if (updateError) {
            return fail(500, {
                success: false,
                message: 'Eğitmen güncellenirken hata: ' + updateError.message
            });
        }

        // Update training assignments
        await updateTrainerTrainings(supabase, trainerId, selectedTrainingIds);

        return {
            success: true,
            message: 'Eğitmen başarıyla güncellendi'
        };
    },

    deleteTrainer: async ({ request, locals: { supabase, user, userRole } }) => {
        const permissionError = validateUserPermission(user, userRole);
        if (permissionError) return permissionError;

        const formData = await request.formData();
        const trainerId = Number(formData.get('trainerId'));

        // Validate required fields
        if (!trainerId) {
            return fail(400, {
                success: false,
                message: 'Eğitmen ID gereklidir'
            });
        }

        // Delete trainer from pe_trainers table
        const { error: deleteError } = await supabase
            .from('pe_trainers')
            .delete()
            .eq('id', trainerId);

        if (deleteError) {
            return fail(500, {
                success: false,
                message: 'Eğitmen silinirken hata: ' + deleteError.message
            });
        }

        return {
            success: true,
            message: 'Eğitmen başarıyla silindi'
        };
    }
};