import { fail } from '@sveltejs/kit';
import { normalizePhoneNumber, PHONE_ERROR } from '$lib/utils/phone-utils';
import type { Actions, PageServerLoad } from './$types';
import type { User as AuthUser } from '@supabase/supabase-js';
import type { TrainerWithEmail } from '$lib/types';
import { getFormDataUuid, getRequiredFormDataString } from '$lib/utils';
import { moveRow, nextSortOrder } from '$lib/server/reorder';
import { requireAdmin } from '$lib/server/permissions';
import { OrgUserService } from '$lib/server/services/org-user-service';
import { dbErrorMessage } from '$lib/server/db-errors';
import { futureLessonsBlock } from '$lib/server/archive';

const NOT_FOUND = 'Eğitmen bulunamadı. Sayfayı yenileyin.';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const { trainers } = await parent();

	// Trainer emails live in auth.users; without the secret key the list still shows, emails blank
	const authUsers = locals.admin
		? await OrgUserService.fromLocals(locals).getAuthUsers(trainers.map((t) => t.id))
		: new Map<string, AuthUser>();
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
		const name = getRequiredFormDataString(formData, 'name').trim();
		const phone = normalizePhoneNumber(getRequiredFormDataString(formData, 'phone'));
		if (!phone) return fail(400, { success: false, message: PHONE_ERROR });

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
				message: dbErrorMessage(createError, 'Eğitmen kaydedilemedi. Tekrar deneyin.')
			});
		}

		return { success: true, message: 'Eğitmen ve kullanıcı hesabı başarıyla oluşturuldu' };
	},

	updateTrainer: async ({ request, locals: { supabase, user, userRole } }) => {
		const denied = requireAdmin(user, userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const trainerId = getFormDataUuid(formData, 'trainerId');
		if (!trainerId) return fail(400, { success: false, message: NOT_FOUND });
		const phone = normalizePhoneNumber(getRequiredFormDataString(formData, 'phone'));
		if (!phone) return fail(400, { success: false, message: PHONE_ERROR });
		const { data: updated, error: updateError } = await supabase
			.from('pe_trainers')
			.update({ name: getRequiredFormDataString(formData, 'name').trim(), phone })
			.eq('id', trainerId)
			.select('id');

		if (updateError) {
			return fail(500, {
				success: false,
				message: dbErrorMessage(updateError, 'Eğitmen kaydedilemedi. Tekrar deneyin.')
			});
		}
		if ((updated ?? []).length === 0) return fail(404, { success: false, message: NOT_FOUND });
		return { success: true, message: 'Eğitmen başarıyla güncellendi' };
	},

	archiveTrainer: async ({ request, locals }) => {
		const denied = requireAdmin(locals.user, locals.userRole);
		if (denied) return denied;

		const trainerId = getFormDataUuid(await request.formData(), 'trainerId');
		if (!trainerId) return fail(400, { success: false, message: NOT_FOUND });

		const blocked = await futureLessonsBlock(
			locals.supabase,
			'trainer_id',
			trainerId,
			'Bu eğitmenin gelecek randevuları var. Eğitmeni arşivlemeden önce randevuları başka bir eğitmene taşıyın.'
		);
		if (blocked) return blocked;

		const blockError = await OrgUserService.fromLocals(locals).setSignInBlocked(trainerId, true);
		if (blockError) return fail(400, { success: false, message: blockError });

		const { data: archived, error: archiveError } = await locals.supabase
			.from('pe_trainers')
			.update({ is_active: false })
			.eq('id', trainerId)
			.select('id');
		if (archiveError) {
			return fail(500, {
				success: false,
				message: dbErrorMessage(archiveError, 'Eğitmen arşivlenemedi. Tekrar deneyin.')
			});
		}
		if ((archived ?? []).length === 0) return fail(404, { success: false, message: NOT_FOUND });

		return {
			success: true,
			message: 'Eğitmen başarıyla arşivlendi ve kullanıcı hesabı devre dışı bırakıldı'
		};
	},

	restoreTrainer: async ({ request, locals }) => {
		const denied = requireAdmin(locals.user, locals.userRole);
		if (denied) return denied;

		const trainerId = getFormDataUuid(await request.formData(), 'trainerId');
		if (!trainerId) return fail(400, { success: false, message: NOT_FOUND });

		const unblockError = await OrgUserService.fromLocals(locals).setSignInBlocked(trainerId, false);
		if (unblockError) return fail(400, { success: false, message: unblockError });

		const { data: restored, error: restoreError } = await locals.supabase
			.from('pe_trainers')
			.update({ is_active: true })
			.eq('id', trainerId)
			.select('id');
		if (restoreError) {
			return fail(500, {
				success: false,
				message: dbErrorMessage(restoreError, 'Eğitmen geri yüklenemedi. Tekrar deneyin.')
			});
		}
		if ((restored ?? []).length === 0) return fail(404, { success: false, message: NOT_FOUND });

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
