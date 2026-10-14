import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { TrainerWithEmail } from '$lib/types';
import { getRequiredFormDataString, formatDateForDB } from '$lib/utils';
import { moveRow, nextSortOrder } from '$lib/server/reorder';
import { requireAdmin } from '$lib/server/permissions';
import { OrgUserService } from '$lib/server/services/org-user-service';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { trainers } = await parent();

	// Trainer emails live in auth.users
	const authUsers = await OrgUserService.fromLocals(locals).getAuthUsers(trainers.map((t) => t.id));
	const trainersWithEmail: TrainerWithEmail[] = trainers.map((trainer) => ({
		...trainer,
		email: authUsers.get(trainer.id)?.email ?? null
	}));

	return { trainers: trainersWithEmail };
};

export const actions: Actions = {
	createTrainer: async ({ request, locals }) => {
		const denied = requireAdmin(locals.user, locals.userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const name = getRequiredFormDataString(formData, 'name');
		const phone = getRequiredFormDataString(formData, 'phone');

		// A trainer is a login (their id) plus a pe_trainers row
		const service = OrgUserService.fromLocals(locals);
		const account = await service.createAccount({
			email: getRequiredFormDataString(formData, 'email'),
			password: getRequiredFormDataString(formData, 'password'),
			fullName: name,
			role: 'pe_trainer'
		});
		if ('error' in account) return fail(500, { success: false, message: account.error });

		const { error: createError } = await locals.supabase.from('pe_trainers').insert({
			id: account.userId,
			name,
			phone,
			sort_order: await nextSortOrder(locals.supabase, 'pe_trainers')
		});
		if (createError) {
			await service.deleteAccount(account.userId);
			return fail(500, {
				success: false,
				message: 'Eğitmen oluşturulurken hata: ' + createError.message
			});
		}

		return { success: true, message: 'Eğitmen ve kullanıcı hesabı başarıyla oluşturuldu' };
	},

	updateTrainer: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireAdmin(user, userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const { error: updateError } = await supabase
			.from('pe_trainers')
			.update({
				name: getRequiredFormDataString(formData, 'name'),
				phone: getRequiredFormDataString(formData, 'phone')
			})
			.eq('id', getRequiredFormDataString(formData, 'trainerId'));

		if (updateError) {
			return fail(500, {
				success: false,
				message: 'Eğitmen güncellenirken hata: ' + updateError.message
			});
		}
		return { success: true, message: 'Eğitmen başarıyla güncellendi' };
	},

	archiveTrainer: async ({ request, locals }) => {
		const denied = requireAdmin(locals.user, locals.userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const trainerId = getRequiredFormDataString(formData, 'trainerId');

		const { data: futureAppointments, error: checkError } = await locals.supabase
			.from('pe_appointments')
			.select('id')
			.eq('trainer_id', trainerId)
			.gte('date', formatDateForDB(new Date()))
			.limit(1);
		if (checkError) {
			return fail(500, {
				success: false,
				message: 'Gelecek randevular kontrol edilirken hata: ' + checkError.message
			});
		}
		if ((futureAppointments ?? []).length > 0) {
			return fail(400, {
				success: false,
				message:
					'Bu eğitmenin gelecek randevuları var. Eğitmeni arşivlemeden önce randevuları başka bir eğitmene aktarmalısınız.'
			});
		}

		const blockError = await OrgUserService.fromLocals(locals).setSignInBlocked(trainerId, true);
		if (blockError) return fail(400, { success: false, message: blockError });

		const { error: archiveError } = await locals.supabase
			.from('pe_trainers')
			.update({ is_active: false })
			.eq('id', trainerId);
		if (archiveError) {
			return fail(500, {
				success: false,
				message: 'Eğitmen arşivlenirken hata: ' + archiveError.message
			});
		}

		return {
			success: true,
			message: 'Eğitmen başarıyla arşivlendi ve kullanıcı hesabı devre dışı bırakıldı'
		};
	},

	restoreTrainer: async ({ request, locals }) => {
		const denied = requireAdmin(locals.user, locals.userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const trainerId = getRequiredFormDataString(formData, 'trainerId');

		const unblockError = await OrgUserService.fromLocals(locals).setSignInBlocked(trainerId, false);
		if (unblockError) return fail(400, { success: false, message: unblockError });

		const { error: restoreError } = await locals.supabase
			.from('pe_trainers')
			.update({ is_active: true })
			.eq('id', trainerId);
		if (restoreError) {
			return fail(500, {
				success: false,
				message: 'Eğitmen geri yüklenirken hata: ' + restoreError.message
			});
		}

		return {
			success: true,
			message: 'Eğitmen başarıyla geri yüklendi ve kullanıcı hesabı etkinleştirildi'
		};
	},

	resetPassword: async ({ request, locals }) => {
		const denied = requireAdmin(locals.user, locals.userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const resetError = await OrgUserService.fromLocals(locals).resetPassword(
			getRequiredFormDataString(formData, 'trainerId'),
			getRequiredFormDataString(formData, 'newPassword')
		);
		if (resetError) return fail(400, { success: false, message: resetError });

		return { success: true, message: 'Şifre başarıyla sıfırlandı' };
	},

	moveTrainer: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireAdmin(user, userRole);
		if (denied) return denied;

		return moveRow(supabase, 'pe_trainers', request);
	}
};
