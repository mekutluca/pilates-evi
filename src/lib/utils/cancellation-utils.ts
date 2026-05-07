import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '$lib/database.types';

type SupabaseClientType = SupabaseClient<Database>;

export function isAppointmentFuture(date: string | null, hour: number | null): boolean {
	if (!date || hour === null) return false;
	const appointmentDateTime = new Date(date);
	appointmentDateTime.setHours(hour, 0, 0, 0);
	return appointmentDateTime > new Date();
}

export async function deleteAppointment(
	supabase: SupabaseClientType,
	appointmentId: number
): Promise<{ error: string | null }> {
	// Trainee links are removed first to avoid leaving orphan rows even if the
	// appointment FK is missing ON DELETE CASCADE.
	const { error: traineeError } = await supabase
		.from('pe_appointment_trainees')
		.delete()
		.eq('appointment_id', appointmentId);

	if (traineeError) {
		return { error: traineeError.message };
	}

	const { error } = await supabase.from('pe_appointments').delete().eq('id', appointmentId);
	if (error) {
		return { error: error.message };
	}
	return { error: null };
}
