import { afterEach, expect } from 'vitest';
import { pagedRows } from '$lib/server/paging';
import { compareSlots } from '$lib/utils/slot-utils';
import { supabase } from './helpers';

/**
 * Rules every scheduling operation must leave intact, checked across the whole Demo
 * studio after each test. Returns one line per violation.
 */
async function studioProblems(): Promise<string[]> {
	const [enrollments, appointments, groupLessons, packages, purchases] = await Promise.all([
		pagedRows((from, to) =>
			supabase
				.from('pe_appointment_trainees')
				.select('id, appointment_id, trainee_id, purchase_id, session_number, total_sessions')
				.order('id')
				.range(from, to)
		),
		pagedRows((from, to) =>
			supabase
				.from('pe_appointments')
				.select('id, date, hour, purchase_id, group_lesson_id')
				.order('id')
				.range(from, to)
		),
		pagedRows((from, to) =>
			supabase.from('pe_group_lessons').select('id, package_id').order('id').range(from, to)
		),
		pagedRows((from, to) =>
			supabase.from('pe_packages').select('id, max_capacity').order('id').range(from, to)
		),
		pagedRows((from, to) =>
			supabase.from('pe_purchases').select('id, package_id').order('id').range(from, to)
		)
	]);

	const appointmentById = new Map(appointments.map((a) => [a.id, a]));
	const packageOfGroup = new Map(groupLessons.map((g) => [g.id, g.package_id]));
	const capacityOf = new Map(packages.map((p) => [p.id, p.max_capacity]));
	const packageOfPurchase = new Map(purchases.map((p) => [p.id, p.package_id]));
	const problems: string[] = [];

	// "Son ders": a trainee's lessons under a purchase are numbered 1..n in calendar order
	const byKayit = new Map<string, typeof enrollments>();
	for (const e of enrollments) {
		const key = `${e.purchase_id}/${e.trainee_id}`;
		byKayit.set(key, [...(byKayit.get(key) ?? []), e]);
	}
	for (const [key, rows] of byKayit) {
		const ordered = rows
			.map((row) => ({
				row,
				appointment: appointmentById.get(row.appointment_id ?? -1) ?? { date: '', hour: 0 }
			}))
			.sort((a, b) => compareSlots(a.appointment, b.appointment) || a.row.id - b.row.id);
		ordered.forEach(({ row, appointment }, i) => {
			if (row.session_number !== i + 1 || row.total_sessions !== rows.length) {
				problems.push(
					`${key}: ${appointment.date}@${appointment.hour} is ${row.session_number}/${row.total_sessions}, expected ${i + 1}/${rows.length}`
				);
			}
		});
	}

	const traineesOf = new Map<number, typeof enrollments>();
	for (const e of enrollments) {
		if (e.appointment_id === null) continue;
		traineesOf.set(e.appointment_id, [...(traineesOf.get(e.appointment_id) ?? []), e]);
	}
	for (const a of appointments) {
		const rows = traineesOf.get(a.id) ?? [];
		if (a.purchase_id) {
			// A private lesson nobody attends must not hold the room and trainer
			if (rows.length === 0) problems.push(`private ${a.id} ${a.date}@${a.hour} has no trainee`);
			for (const row of rows) {
				if (row.purchase_id !== a.purchase_id) {
					problems.push(`private ${a.id} ${a.date}@${a.hour}: enrolled under another purchase`);
				}
			}
		} else if (a.group_lesson_id) {
			const packageId = packageOfGroup.get(a.group_lesson_id);
			const capacity = packageId ? capacityOf.get(packageId) : undefined;
			if (capacity !== undefined && rows.length > capacity) {
				problems.push(`group ${a.id} ${a.date}@${a.hour}: ${rows.length}/${capacity} trainees`);
			}
			for (const row of rows) {
				if (packageOfPurchase.get(row.purchase_id) !== packageId) {
					problems.push(`group ${a.id} ${a.date}@${a.hour}: enrolled with another package`);
				}
			}
		}
	}
	return problems;
}

afterEach(async () => {
	expect(await studioProblems()).toEqual([]);
});
