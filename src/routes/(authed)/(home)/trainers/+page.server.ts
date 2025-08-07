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
        const { error: createError } = await supabase
            .from('pe_trainers')
            .insert({
                name,
                phone
            });

        if (createError) {
            return fail(500, {
                success: false,
                message: 'Eğitmen oluşturulurken hata: ' + createError.message
            });
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
        const trainerId = formData.get('trainerId') as string;
        const name = formData.get('name') as string;
        const phone = formData.get('phone') as string;

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
        const trainerId = formData.get('trainerId') as string;

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