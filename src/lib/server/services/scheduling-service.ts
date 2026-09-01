import type { AssignmentPayload, AssignmentResult } from '$lib/types/Assignment';
import type { SupabaseClientType } from '$lib/types/Supabase';

/**
 * Orchestrates multi-step scheduling writes. Each operation maps to one
 * transactional RPC, so a failure anywhere leaves no orphan rows.
 */
export class SchedulingService {
	constructor(private supabase: SupabaseClientType) {}

	/**
	 * Creates a new assignment — optional group lesson, teams + purchases,
	 * appointments and enrollments — in a single transaction. Validation
	 * (conflicts, capacity, duplicate enrollment) must happen before calling.
	 */
	async createAssignment(payload: AssignmentPayload): Promise<AssignmentResult> {
		const { data, error } = await this.supabase.rpc('pe_create_assignment', {
			p_group_lesson: payload.groupLesson,
			p_purchases: payload.purchases,
			p_appointments: payload.appointments,
			p_enrollments: payload.enrollments
		});
		if (error) {
			throw new Error(`Atama oluşturulamadı: ${error.message}`);
		}
		// The RPC returns jsonb; its shape is fixed by the SQL function body.
		return data as AssignmentResult;
	}

	/**
	 * Ends a group lesson on the given date: sets end_date and deletes the
	 * pre-created empty appointments from that date on in a single
	 * transaction. The RPC rejects end dates that are not strictly after the
	 * lesson's last appointment with enrolled trainees.
	 */
	async endGroupLesson(groupLessonId: string, endDate: string): Promise<{ deleted_count: number }> {
		const { data, error } = await this.supabase.rpc('pe_end_group_lesson', {
			p_group_lesson_id: groupLessonId,
			p_end_date: endDate
		});
		if (error) {
			throw new Error(`Grup dersi sonlandırılamadı: ${error.message}`);
		}
		// The RPC returns jsonb; its shape is fixed by the SQL function body.
		return data as { deleted_count: number };
	}
}
