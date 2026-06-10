import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';
import type { AssignmentPayload, AssignmentResult } from '$lib/types/Assignment';

/**
 * Orchestrates multi-step scheduling writes. Each operation maps to one
 * transactional RPC, so a failure anywhere leaves no orphan rows.
 */
export class SchedulingService {
	constructor(private supabase: SupabaseClient<Database>) {}

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
		return data;
	}
}
