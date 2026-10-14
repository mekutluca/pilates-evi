import { error, fail } from '@sveltejs/kit';
import type { PageServerLoad, Actions } from './$types';
import type {
	TraineePurchaseMembership,
	Package,
	RemainingLessonsScope,
	SharedTrainee
} from '$lib/types';
import { getRequiredFormDataString, isAppointmentFuture } from '$lib/utils';
import { requireStaff } from '$lib/server/permissions';
import { deleteRemainingLessons } from '$lib/utils/purchase-deletion-utils';

export const load: PageServerLoad = ({ params, locals: { supabase } }) => {
	const traineeId = params.id;

	if (!traineeId) {
		throw error(400, 'Geçersiz öğrenci ID');
	}

	// Trainee details — streamed so the page shell renders immediately
	const loadTrainee = async () => {
		const { data: trainee } = await supabase
			.from('pe_trainees')
			.select('*')
			.eq('id', traineeId)
			.maybeSingle();

		return trainee;
	};

	// Purchase memberships with appointments — streamed; resolves to null on error
	const loadPurchaseMemberships = async (): Promise<TraineePurchaseMembership[] | null> => {
		// Get trainee's team memberships (purchases they're part of)
		const { data: teamMemberships, error: teamError } = await supabase
			.from('pe_teams')
			.select('id, trainee_id')
			.eq('trainee_id', traineeId);

		if (teamError) {
			console.error('Error fetching team memberships:', teamError);
			return null;
		}

		const teamIds = teamMemberships?.map((tm) => tm.id) || [];

		// Get purchases for these teams with package info
		const { data: purchases, error: purchasesError } = await supabase
			.from('pe_purchases')
			.select(
				`
				id,
				created_at,
				successor_id,
				pe_packages (
					id,
					name,
					description,
					weeks_duration,
					min_lessons_per_week,
					max_lessons_per_week,
					max_capacity,
					package_type,
					reschedulable,
					reschedule_limit
				)
			`
			)
			.in('team_id', teamIds)
			.order('created_at', { ascending: false });

		if (purchasesError) {
			console.error('Error fetching purchases:', purchasesError);
			return null;
		}

		// Get all appointments with their details for this trainee
		const { data: detailedAppointments, error: detailedApptError } = await supabase
			.from('pe_appointment_trainees')
			.select(
				`
				appointment_id,
				purchase_id,
				pe_appointments!inner (
					id,
					date,
					hour
				)
			`
			)
			.eq('trainee_id', traineeId)
			.order('pe_appointments(date)', { ascending: true });

		if (detailedApptError) {
			console.error('Error fetching detailed appointments:', detailedApptError);
		}

		// Teammates on the same private purchases (upcoming appointments only). Group lessons
		// never match here because each attendee is linked under their own purchase.
		const purchaseIds = (purchases ?? []).map((p) => p.id);
		const sharedByPurchase = new Map<string, Map<string, SharedTrainee>>();

		if (purchaseIds.length > 0) {
			const { data: teammateRows, error: teammateError } = await supabase
				.from('pe_appointment_trainees')
				.select(
					`
					purchase_id,
					pe_trainees (id, name),
					pe_appointments!inner (date, hour)
				`
				)
				.in('purchase_id', purchaseIds)
				.neq('trainee_id', traineeId);

			if (teammateError) {
				console.error('Error fetching purchase teammates:', teammateError);
			}

			for (const row of teammateRows ?? []) {
				if (!row.purchase_id || !row.pe_trainees) continue;
				if (!isAppointmentFuture(row.pe_appointments.date, row.pe_appointments.hour)) continue;
				const bucket = sharedByPurchase.get(row.purchase_id) ?? new Map<string, SharedTrainee>();
				bucket.set(row.pe_trainees.id, { id: row.pe_trainees.id, name: row.pe_trainees.name });
				sharedByPurchase.set(row.purchase_id, bucket);
			}
		}

		// Build purchase memberships with appointments
		const purchaseMemberships: TraineePurchaseMembership[] = [];

		for (const purchase of purchases ?? []) {
			// Filter appointments for this purchase
			const purchaseAppointments = detailedAppointments?.filter(
				(apt) => apt.purchase_id === purchase.id
			);

			// Sort appointments by date
			const sortedAppointments =
				purchaseAppointments
					?.map((apt) => ({
						id: apt.pe_appointments.id,
						date: apt.pe_appointments.date,
						hour: apt.pe_appointments.hour
					}))
					.sort((a, b) => {
						const dateCompare = a.date.localeCompare(b.date);
						if (dateCompare !== 0) return dateCompare;
						return a.hour - b.hour;
					}) || [];

			// Get first and last appointment dates
			const firstDate = sortedAppointments[0]?.date;
			const lastDate = sortedAppointments[sortedAppointments.length - 1]?.date;

			purchaseMemberships.push({
				id: purchase.id,
				trainee_id: traineeId,
				pe_purchases: {
					id: purchase.id,
					created_at: purchase.created_at,
					successor_id: purchase.successor_id,
					reschedule_left: null,
					pe_packages: purchase.pe_packages as Package | null
				},
				package: purchase.pe_packages as Package | null,
				joined_at: purchase.created_at,
				purchase_id: purchase.id,
				purchase_start_date: firstDate || null,
				purchase_end_date: lastDate || null,
				appointments: sortedAppointments,
				shared_trainees: [...(sharedByPurchase.get(purchase.id)?.values() ?? [])]
			});
		}

		return purchaseMemberships;
	};

	return {
		trainee: loadTrainee(),
		groupMemberships: loadPurchaseMemberships()
	};
};

export const actions: Actions = {
	update: async ({ request, params, locals: { supabase } }) => {
		const traineeId = params.id;

		if (!traineeId) {
			throw error(400, 'Geçersiz öğrenci ID');
		}

		const formData = await request.formData();
		const name = getRequiredFormDataString(formData, 'name');
		const phone = getRequiredFormDataString(formData, 'phone');
		const email = formData.get('email')?.toString() || null;
		const notes = formData.get('notes')?.toString() || null;

		const { error: updateError } = await supabase
			.from('pe_trainees')
			.update({
				name,
				phone,
				email,
				notes
			})
			.eq('id', traineeId);

		if (updateError) {
			console.error('Error updating trainee:', updateError);
			return fail(500, { success: false, message: 'Öğrenci güncellenirken hata oluştu' });
		}

		return { success: true, message: 'Öğrenci başarıyla güncellendi' };
	},

	archiveTrainee: async ({ params, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const traineeId = params.id;

		if (!traineeId) {
			throw error(400, 'Geçersiz öğrenci ID');
		}

		const { error: archiveError } = await supabase
			.from('pe_trainees')
			.update({ is_active: false })
			.eq('id', traineeId);

		if (archiveError) {
			console.error('Error archiving trainee:', archiveError);
			return fail(500, { success: false, message: 'Öğrenci arşivlenirken hata oluştu' });
		}

		return { success: true, message: 'Öğrenci başarıyla arşivlendi' };
	},

	restoreTrainee: async ({ params, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const traineeId = params.id;

		if (!traineeId) {
			throw error(400, 'Geçersiz öğrenci ID');
		}

		const { error: restoreError } = await supabase
			.from('pe_trainees')
			.update({ is_active: true })
			.eq('id', traineeId);

		if (restoreError) {
			console.error('Error restoring trainee:', restoreError);
			return fail(500, { success: false, message: 'Öğrenci geri yüklenirken hata oluştu' });
		}

		return { success: true, message: 'Öğrenci başarıyla geri yüklendi' };
	},

	deleteRemainingLessons: async ({ request, params, locals: { supabase, user, userRole } }) => {
		const denied = requireStaff(user, userRole);
		if (denied) return denied;

		const traineeId = params.id;

		if (!traineeId) {
			throw error(400, 'Geçersiz öğrenci ID');
		}

		const formData = await request.formData();
		const purchaseId = getRequiredFormDataString(formData, 'purchaseId');
		const scope: RemainingLessonsScope =
			formData.get('scope')?.toString() === 'all' ? 'all' : 'trainee';

		const result = await deleteRemainingLessons(supabase, purchaseId, traineeId, scope);

		if (result.error) {
			return fail(400, { success: false, message: result.error });
		}

		return { success: true, message: `${result.deletedCount} ders silindi` };
	}
};
