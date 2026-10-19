import type { SupabaseClientType } from '$lib/types/Supabase';
import type { SlotChange } from '$lib/types/Schedule';
import type { MovedAppointment } from '$lib/types/Transfer';
import { AppointmentRepository } from '$lib/server/repositories/appointment-repository';
import { formatSlotLabel, isAppointmentFuture } from '$lib/utils/date-utils';
import { recurringPattern, resolveSlotChanges, slotChangeTarget } from '$lib/utils/slot-utils';

/**
 * Plans a private kayıt's new weekly program (Taşı → Haftalık program) from
 * `appointmentId` on, renewals included: each lesson on a changed slot moves to the new
 * day and hour of its own week, so the lesson count and the end week stay. Lessons moved
 * once (off the program) stay where they are. Yenile follows the new program, as it reads
 * the pattern from the latest lessons. Returns the moves, or an error message.
 */
export async function planPatternChange(
	supabase: SupabaseClientType,
	appointmentId: number,
	slotChanges: SlotChange[]
): Promise<MovedAppointment[] | string> {
	const series = await new AppointmentRepository(supabase).getSeries(
		appointmentId,
		'from_selected'
	);
	if (series.length === 0) return 'Taşınacak randevu bulunamadı';

	const resolved = resolveSlotChanges(recurringPattern(series), slotChanges);
	if (typeof resolved === 'string') return resolved;
	if (resolved.changes.size === 0) return 'Değişiklik yok';

	const moved: MovedAppointment[] = [];
	for (const appointment of series) {
		const target = slotChangeTarget(appointment, resolved.changes);
		if (!target) continue;
		if (!isAppointmentFuture(target.date, target.hour)) {
			return `${formatSlotLabel(target.date, target.hour)} geçmişte kalıyor, programı sonraki haftanın randevusundan değiştirin`;
		}
		moved.push({ appointment, newDate: target.date, newHour: target.hour });
	}
	if (moved.length === 0) return 'Bu randevudan sonra taşınacak randevu yok';
	return moved;
}
