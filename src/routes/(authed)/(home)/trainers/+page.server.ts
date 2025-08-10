import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';

export const actions: Actions = {
    createTrainer: async ({ request, locals: { supabase, user, userRole } }) => {
        // Allow both admins and coordinators to create trainers
        if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
            return fail(403, {
                success: false,
                message: 'Bu işlemi gerçekleştirmek için yetkiniz yok'
            });
        }

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
        if (selectedTrainingIds.length > 0) {
            const trainingAssignments = selectedTrainingIds.map(trainingId => ({
                trainer_id: trainerData.id,
                training_id: trainingId
            }));

            const { error: assignError } = await supabase
                .from('pe_trainer_trainings')
                .insert(trainingAssignments);

            if (assignError) {
                console.error('Training assignment error:', assignError);
                // Don't fail the entire operation, just log the error
            }
        }

        return {
            success: true,
            message: 'Eğitmen başarıyla oluşturuldu'
        };
    },

    updateTrainer: async ({ request, locals: { supabase, user, userRole } }) => {
        // Allow both admins and coordinators to update trainers
        if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
            return fail(403, {
                success: false,
                message: 'Bu işlemi gerçekleştirmek için yetkiniz yok'
            });
        }

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

        // Update training assignments - first delete existing, then insert new ones
        const { error: deleteError } = await supabase
            .from('pe_trainer_trainings')
            .delete()
            .eq('trainer_id', trainerId);

        if (deleteError) {
            console.error('Error removing existing training assignments:', deleteError);
        }

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
                // Don't fail the entire operation, just log the error
            }
        }

        return {
            success: true,
            message: 'Eğitmen başarıyla güncellendi'
        };
    },

    deleteTrainer: async ({ request, locals: { supabase, user, userRole } }) => {
        // Allow both admins and coordinators to delete trainers
        if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
            return fail(403, {
                success: false,
                message: 'Bu işlemi gerçekleştirmek için yetkiniz yok'
            });
        }

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
    },

    assignTraining: async ({ request, locals: { supabase, user, userRole } }) => {
        if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
            return fail(403, {
                success: false,
                message: 'Bu işlemi gerçekleştirmek için yetkiniz yok'
            });
        }

        const formData = await request.formData();
        const trainerId = Number(formData.get('trainerId'));
        const trainingId = Number(formData.get('trainingId'));

        if (!trainerId || !trainingId) {
            return fail(400, {
                success: false,
                message: 'Eğitmen ve egzersiz seçimi gereklidir'
            });
        }

        const { error: assignError } = await supabase
            .from('pe_trainer_trainings')
            .insert({
                trainer_id: trainerId,
                training_id: trainingId
            });

        if (assignError) {
            if (assignError.code === '23505') { // Unique constraint violation
                return fail(400, {
                    success: false,
                    message: 'Bu eğitmen zaten bu egzersize atanmış'
                });
            }
            return fail(500, {
                success: false,
                message: 'Egzersiz atanırken hata: ' + assignError.message
            });
        }

        return {
            success: true,
            message: 'Egzersiz başarıyla atandı'
        };
    },

    unassignTraining: async ({ request, locals: { supabase, user, userRole } }) => {
        if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
            return fail(403, {
                success: false,
                message: 'Bu işlemi gerçekleştirmek için yetkiniz yok'
            });
        }

        const formData = await request.formData();
        const trainerId = Number(formData.get('trainerId'));
        const trainingId = Number(formData.get('trainingId'));

        if (!trainerId || !trainingId) {
            return fail(400, {
                success: false,
                message: 'Eğitmen ve egzersiz seçimi gereklidir'
            });
        }

        const { error: unassignError } = await supabase
            .from('pe_trainer_trainings')
            .delete()
            .eq('trainer_id', trainerId)
            .eq('training_id', trainingId);

        if (unassignError) {
            return fail(500, {
                success: false,
                message: 'Egzersiz ataması kaldırılırken hata: ' + unassignError.message
            });
        }

        return {
            success: true,
            message: 'Egzersiz ataması başarıyla kaldırıldı'
        };
    }
};