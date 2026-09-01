import type { PageServerLoad } from './$types';
import type {
	AnyDashboardStats,
	DashboardStats,
	TrainerDashboardStats,
	PurchaseWithDetails,
	TraineeWithLastLesson,
	TraineeFromQuery
} from '$lib/types/Dashboard';
import type { AppointmentWithRelations } from '$lib/types/Schedule';
import { getWeekStart, getWeekEnd, formatDateForDB } from '$lib/utils/date-utils';
import { createAppointmentDetails } from '$lib/utils/appointment-utils';
import { isNonNull } from '$lib/utils/type-guards';
import { TRAINER_APPOINTMENTS_WITH_RELATIONS_SELECT } from '$lib/server/repositories/appointment-repository';

export const load: PageServerLoad = ({ locals: { supabase, user, userRole }, parent }) => {
	// Trainer-scoped stats: only this trainer's own lessons this week, RLS-compatible
	// (no purchases/last-session widgets — those aren't shown to trainers).
	const loadTrainerStats = async (): Promise<TrainerDashboardStats | null> => {
		if (!user) return null;

		const { data: trainerData, error: trainerError } = await supabase
			.from('pe_trainers')
			.select('id')
			.eq('id', user.id)
			.single();

		if (trainerError || !trainerData) {
			console.error('Error loading trainer record:', trainerError);
			return null;
		}

		const now = new Date();
		const weekStart = getWeekStart(now);
		const weekEnd = getWeekEnd(now);
		const weekStartStr = formatDateForDB(weekStart);
		const weekEndStr = formatDateForDB(weekEnd);
		const todayStr = formatDateForDB(now);

		const { data: appointments, error: appointmentsError } = await supabase
			.from('pe_appointments')
			.select(TRAINER_APPOINTMENTS_WITH_RELATIONS_SELECT)
			.eq('trainer_id', trainerData.id)
			.gte('date', weekStartStr)
			.lte('date', weekEndStr)
			.order('date', { ascending: true })
			.order('hour', { ascending: true });

		if (appointmentsError) {
			console.error('Error loading trainer appointments:', appointmentsError);
			return null;
		}

		const rows = (appointments || []) as AppointmentWithRelations[];
		const weeklyAppointments = rows.map((a) => createAppointmentDetails(a));
		const todayAppointmentsCount = weeklyAppointments.filter((a) => a.date === todayStr).length;

		const uniqueTraineeIds = new Set<string>();
		rows.forEach((a) => {
			(a.pe_appointment_trainees || []).forEach((at) => {
				if (at.pe_trainees?.id) uniqueTraineeIds.add(at.pe_trainees.id);
			});
		});

		return {
			kind: 'trainer',
			weekAppointmentsCount: weeklyAppointments.length,
			todayAppointmentsCount,
			uniqueTraineesCount: uniqueTraineeIds.size,
			weeklyAppointments
		};
	};

	// Dashboard statistics — streamed so the page shell renders immediately;
	// resolves to null on error
	const loadStats = async (): Promise<DashboardStats | null> => {
		// Get layout data (trainers, rooms, trainees, packages already loaded)
		const layoutData = await parent();

		// Calculate current week range
		const now = new Date();
		const weekStart = getWeekStart(now);
		const weekEnd = getWeekEnd(now);
		const weekStartStr = formatDateForDB(weekStart);
		const weekEndStr = formatDateForDB(weekEnd);

		// Query 1: Get all appointments this week (across all rooms and trainers)
		const { data: appointments, error: appointmentsError } = await supabase
			.from('pe_appointments')
			.select('id, date')
			.gte('date', weekStartStr)
			.lte('date', weekEndStr)
			.order('date, hour');

		if (appointmentsError) {
			console.error('Error loading appointments:', appointmentsError);
			return null;
		}

		const appointmentIds = appointments?.map((a) => a.id) || [];

		// Query 2: Get appointment trainees for this week's appointments
		const { data: appointmentTrainees, error: appointmentTraineesError } = await supabase
			.from('pe_appointment_trainees')
			.select('trainee_id, session_number, total_sessions, purchase_id, appointment_id')
			.in('appointment_id', appointmentIds.length > 0 ? appointmentIds : [-1]); // Use -1 if no appointments to avoid empty IN clause

		if (appointmentTraineesError) {
			console.error('Error loading appointment trainees:', appointmentTraineesError);
			return null;
		}

		// Query 3: Get purchases made this week with related data
		const { data: purchases, error: purchasesError } = await supabase
			.from('pe_purchases')
			.select(
				`
				id,
				created_at,
				package_id,
				team_id,
				pe_packages (*)
			`
			)
			.gte('created_at', weekStart.toISOString())
			.lte('created_at', weekEnd.toISOString())
			.order('created_at', { ascending: false });

		if (purchasesError) {
			console.error('Error loading purchases:', purchasesError);
			return null;
		}

		// Get team IDs from purchases
		const teamIds = purchases?.map((p) => p.team_id).filter(isNonNull) || [];

		// Query teams to get trainees
		const { data: teams, error: teamsError } = await supabase
			.from('pe_teams')
			.select(
				`
				id,
				trainee_id,
				pe_trainees (
					id,
					name,
					phone,
					email,
					is_active
				)
			`
			)
			.in('id', teamIds.length > 0 ? teamIds : ['']);

		if (teamsError) {
			console.error('Error loading teams:', teamsError);
			return null;
		}

		// Create a map of team_id to trainees
		const teamMap = new Map<string, TraineeFromQuery[]>();
		teams?.forEach((team) => {
			if (!teamMap.has(team.id)) {
				teamMap.set(team.id, []);
			}
			if (team.pe_trainees) {
				teamMap.get(team.id)!.push(team.pe_trainees);
			}
		});

		// Calculate statistics
		const appointmentsCount = appointments?.length || 0;

		// Get unique trainee IDs from appointment trainees
		const uniqueTraineeIds = new Set(
			appointmentTrainees?.map((at) => at.trainee_id).filter(isNonNull) || []
		);
		const uniqueTraineesCount = uniqueTraineeIds.size;

		// Process purchases to get details
		const purchasesThisWeek: PurchaseWithDetails[] =
			purchases?.flatMap((purchase) => {
				const trainees = purchase.team_id ? teamMap.get(purchase.team_id) || [] : [];

				return trainees.map((trainee) => ({
					id: purchase.id,
					created_at: purchase.created_at,
					trainee,
					package: purchase.pe_packages
				}));
			}) || [];

		// Find trainees with last lessons (within 2 sessions of completion).
		// Purchases for all candidates are fetched in one batched query.
		const lastLessonCandidates = (appointmentTrainees || []).filter(
			(
				at
			): at is typeof at & {
				trainee_id: string;
				session_number: number;
				total_sessions: number;
			} => {
				if (!at.trainee_id || at.session_number === null || at.total_sessions === null)
					return false;
				const remainingSessions = at.total_sessions - at.session_number;
				return remainingSessions <= 2 && remainingSessions >= 0;
			}
		);

		const candidatePurchaseIds = [
			...new Set(lastLessonCandidates.map((at) => at.purchase_id).filter(isNonNull))
		];
		const { data: candidatePurchases } =
			candidatePurchaseIds.length > 0
				? await supabase
						.from('pe_purchases')
						.select('id, package_id, successor_id, pe_packages(*)')
						.in('id', candidatePurchaseIds)
				: { data: [] };
		const purchaseById = new Map((candidatePurchases ?? []).map((p) => [p.id, p]));

		const traineesWithLastLessons: TraineeWithLastLesson[] = [];
		const processedTrainees = new Set<string>(); // Track to avoid duplicates

		for (const at of lastLessonCandidates) {
			if (processedTrainees.has(at.trainee_id)) continue;

			const trainee = layoutData.trainees.find((t) => t.id === at.trainee_id);
			if (!trainee) continue;

			const purchaseData = at.purchase_id ? purchaseById.get(at.purchase_id) : undefined;

			// Skip if the purchase has been extended (has a successor) — the trainee isn't
			// actually nearing their last lesson, they continue in the successor purchase.
			if (purchaseData?.successor_id) continue;

			// Get appointment date
			const appointment = appointments?.find((a) => a.id === at.appointment_id);

			traineesWithLastLessons.push({
				trainee,
				session_number: at.session_number,
				total_sessions: at.total_sessions,
				package: purchaseData?.pe_packages || null,
				appointment_date: appointment?.date || ''
			});

			processedTrainees.add(at.trainee_id);
		}

		return {
			kind: 'org',
			appointmentsCount,
			uniqueTraineesCount,
			purchasesThisWeek,
			traineesWithLastLessons
		};
	};

	const stats: Promise<AnyDashboardStats | null> =
		userRole === 'trainer' ? loadTrainerStats() : loadStats();

	return {
		stats
	};
};
