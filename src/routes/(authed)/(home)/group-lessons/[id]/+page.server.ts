import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { requireStaff } from '$lib/server/permissions';
import { orNull } from '$lib/server/streaming';
import { getGroupLesson } from '$lib/server/scheduling/group-lessons';
import { parseGroupLessonMoveForm } from '$lib/server/scheduling/group-lesson-form';
import { notifiedSuffix, wantsNotification } from '$lib/server/scheduling/move-form';
import { NotificationService } from '$lib/server/services/notification-service';
import { SchedulingService } from '$lib/server/services/scheduling-service';
import { getFormDataString, getRequiredFormDataString } from '$lib/utils/form-utils';
import { formatDateForDB, getTomorrow } from '$lib/utils/date-utils';
import { isIsoDate, isValidUuid } from '$lib/utils/validation';

export const load: PageServerLoad = async ({ params, parent, locals: { supabase } }) => {
	// A cheap existence check keeps a real 404; the detail itself streams in
	const [{ data: exists }, { rooms, trainers }] = await Promise.all([
		isValidUuid(params.id)
			? supabase.from('pe_group_lessons').select('id').eq('id', params.id).maybeSingle()
			: Promise.resolve({ data: null }),
		parent()
	]);
	if (!exists) throw error(404, 'Grup dersi bulunamadı');

	return {
		// null when it can't be loaded
		lesson: orNull(getGroupLesson(supabase, params.id), 'group lesson'),
		rooms: rooms.filter((r) => r.is_active),
		trainers: trainers.filter((t) => t.is_active)
	};
};

export const actions: Actions = {
	previewMove: async ({ request, params, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const input = parseGroupLessonMoveForm(await request.formData(), params.id);
		if (typeof input === 'string') return fail(400, { success: false, message: input });
		const result = await new SchedulingService(supabase).moveGroupLesson(input, true);
		if (result.error) return fail(400, { success: false, message: result.error });

		return {
			success: true,
			rows: result.rows,
			conflicts: result.conflicts,
			recipientCount: new Set(result.changes.map((c) => c.phone)).size
		};
	},

	move: async ({ request, params, locals: { supabase, user, userRole, organizationId } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const input = parseGroupLessonMoveForm(formData, params.id);
		if (typeof input === 'string') return fail(400, { success: false, message: input });

		// A group lesson moves for the studio's reasons; the cause goes into the message
		const cause = getFormDataString(formData, 'cause').trim();
		const notify = wantsNotification(formData);
		if (notify && !cause) {
			return fail(400, { success: false, message: 'Öğrencilere gönderilecek sebebi yazın' });
		}

		const result = await new SchedulingService(supabase).moveGroupLesson(input, false);
		if (result.error) return fail(400, { success: false, message: result.error });
		if (result.conflicts.length > 0) {
			return fail(400, {
				success: false,
				message: `${result.conflicts.length} çakışma var; taşıma yapılmadı.`
			});
		}

		const notified = notify
			? await (
					await NotificationService.forStudio(supabase, organizationId)
				).notify(result.changes, { kind: 'system', cause })
			: null;
		return {
			success: true,
			message: `${result.rows.length} randevu taşındı.${notifiedSuffix(notified)}`
		};
	},

	end: async ({ request, params, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const endDate = getRequiredFormDataString(await request.formData(), 'endDate');
		// Local-time backstop for the date picker; the RPC re-checks that no session with
		// trainees falls on or after the end date
		if (!isIsoDate(endDate) || endDate < formatDateForDB(getTomorrow())) {
			return fail(400, { success: false, message: 'Bitiş tarihi en erken yarın olabilir' });
		}

		try {
			const { deleted_count } = await new SchedulingService(supabase).endGroupLesson(
				params.id,
				endDate
			);
			return {
				success: true,
				message:
					deleted_count > 0
						? `Grup dersi sonlandırıldı, ${deleted_count} boş randevu silindi.`
						: 'Grup dersi sonlandırıldı.'
			};
		} catch (endError) {
			return fail(400, {
				success: false,
				message: endError instanceof Error ? endError.message : 'Grup dersi sonlandırılamadı'
			});
		}
	}
};
