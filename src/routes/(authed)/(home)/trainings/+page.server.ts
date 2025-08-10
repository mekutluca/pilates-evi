import { fail } from '@sveltejs/kit';
import type { Actions } from './$types';

export const actions: Actions = {
    createTraining: async ({ request, locals: { supabase, user, userRole } }) => {
        if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
            return fail(403, { success: false, message: 'Bu işlemi gerçekleştirmek için yetkiniz yok' });
        }

        const formData = await request.formData();
        const name = formData.get('name') as string;
        const min_capacity = formData.get('min_capacity') ? Number(formData.get('min_capacity')) : 0;
        const max_capacity = formData.get('max_capacity') ? Number(formData.get('max_capacity')) : 0;

        if (!name) {
            return fail(400, { success: false, message: 'Egzersiz adı gereklidir' });
        }

        if (max_capacity > 0 && min_capacity > max_capacity) {
            return fail(400, { success: false, message: 'Minimum kapasite maksimum kapasiteden büyük olamaz' });
        }

        const { error: createError } = await supabase
            .from('pe_trainings')
            .insert({ name, min_capacity, max_capacity });

        if (createError) {
            return fail(500, { success: false, message: 'Egzersiz oluşturulurken hata: ' + createError.message });
        }

        return { success: true, message: 'Egzersiz başarıyla oluşturuldu' };
    },

    updateTraining: async ({ request, locals: { supabase, user, userRole } }) => {
        if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
            return fail(403, { success: false, message: 'Bu işlemi gerçekleştirmek için yetkiniz yok' });
        }

        const formData = await request.formData();
        const trainingId = Number(formData.get('trainingId'));
        const name = formData.get('name') as string;
        const min_capacity = formData.get('min_capacity') ? Number(formData.get('min_capacity')) : 0;
        const max_capacity = formData.get('max_capacity') ? Number(formData.get('max_capacity')) : 0;

        if (!trainingId || !name) {
            return fail(400, { success: false, message: 'Egzersiz ID ve adı gereklidir' });
        }

        if (max_capacity > 0 && min_capacity > max_capacity) {
            return fail(400, { success: false, message: 'Minimum kapasite maksimum kapasiteden büyük olamaz' });
        }

        const { error: updateError } = await supabase
            .from('pe_trainings')
            .update({ name, min_capacity, max_capacity })
            .eq('id', trainingId);

        if (updateError) {
            return fail(500, { success: false, message: 'Egzersiz güncellenirken hata: ' + updateError.message });
        }

        return { success: true, message: 'Egzersiz başarıyla güncellendi' };
    },

    deleteTraining: async ({ request, locals: { supabase, user, userRole } }) => {
        if (!user || (userRole !== 'admin' && userRole !== 'coordinator')) {
            return fail(403, { success: false, message: 'Bu işlemi gerçekleştirmek için yetkiniz yok' });
        }

        const formData = await request.formData();
        const trainingId = Number(formData.get('trainingId'));

        if (!trainingId) {
            return fail(400, { success: false, message: 'Egzersiz ID gereklidir' });
        }

        const { error: deleteError } = await supabase
            .from('pe_trainings')
            .delete()
            .eq('id', trainingId);

        if (deleteError) {
            return fail(500, { success: false, message: 'Egzersiz silinirken hata: ' + deleteError.message });
        }

        return { success: true, message: 'Egzersiz başarıyla silindi' };
    }
};