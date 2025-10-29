import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type {
	DashboardStats,
	PurchaseWithDetails,
	TraineeWithLastLesson,
	TraineeFromQuery
} from '$lib/types/Dashboard';
import { getWeekStart, getWeekEnd, formatDateForDB } from '$lib/utils/date-utils';

export const load: PageServerLoad = async ({ locals: { supabase }, parent }) => {
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
		throw error(500, 'Failed to load appointments data');
	}

	const appointmentIds = appointments?.map((a) => a.id) || [];

	// Query 2: Get appointment trainees for this week's appointments
	const { data: appointmentTrainees, error: appointmentTraineesError } = await supabase
		.from('pe_appointment_trainees')
		.select('trainee_id, session_number, total_sessions, purchase_id, appointment_id')
		.in('appointment_id', appointmentIds.length > 0 ? appointmentIds : [-1]); // Use -1 if no appointments to avoid empty IN clause

	if (appointmentTraineesError) {
		console.error('Error loading appointment trainees:', appointmentTraineesError);
		throw error(500, 'Failed to load appointment trainees data');
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
			pe_packages (
				id,
				name,
				package_type,
				lessons_per_week,
				weeks_duration,
				max_capacity,
				is_active,
				reschedulable,
				reschedule_limit
			)
		`
		)
		.gte('created_at', weekStart.toISOString())
		.lte('created_at', weekEnd.toISOString())
		.order('created_at', { ascending: false });

	if (purchasesError) {
		console.error('Error loading purchases:', purchasesError);
		throw error(500, 'Failed to load purchases data');
	}

	// Get team IDs from purchases
	const teamIds = purchases?.map((p) => p.team_id).filter(Boolean) || [];

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
		throw error(500, 'Failed to load teams data');
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
		appointmentTrainees?.map((at) => at.trainee_id).filter(Boolean) || []
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

	// Find trainees with last lessons (within 2 sessions of completion)
	const traineesWithLastLessons: TraineeWithLastLesson[] = [];
	const processedTrainees = new Set<string>(); // Track to avoid duplicates

	for (const at of appointmentTrainees || []) {
		if (!at.trainee_id || processedTrainees.has(at.trainee_id)) continue;

		const remainingSessions = at.total_sessions - at.session_number;

		// Include if they have 2 or fewer sessions remaining
		if (remainingSessions <= 2 && remainingSessions >= 0) {
			const trainee = layoutData.trainees.find((t) => t.id === at.trainee_id);
			if (!trainee) continue;

			// Get the package from the purchase
			const { data: purchaseData } = await supabase
				.from('pe_purchases')
				.select('package_id, pe_packages(*)')
				.eq('id', at.purchase_id || '')
				.single();

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
	}

	const stats: DashboardStats = {
		appointmentsCount,
		uniqueTraineesCount,
		purchasesThisWeek,
		traineesWithLastLessons
	};

	return {
		stats
	};
};
