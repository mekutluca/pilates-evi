import { describe, expect, test } from 'vitest';
import { loadTrainerPanel } from '$lib/server/panel';
import { AppointmentRepository } from '$lib/server/repositories/appointment-repository';
import { createAppointmentDetails } from '$lib/utils/appointment-utils';
import { parseLocalDate } from '$lib/utils/date-utils';
import { at, dayOf, fx, supabase } from './helpers';

// The seeded notes (pe_reset_demo_data): Feride Aksu (regular, private), Hülya Tan (one of
// the duet_regular pair) and Sevgi Bulut (group_regular, the main group), all with t2
const DUET = at({ date: dayOf(0, 2), hour: 10 });
const PRIVATE = at({ date: dayOf(0, 1), hour: 10 });
const GROUP = at({ date: dayOf(0, 2), hour: 18 });

describe('Öğrenci notları', () => {
	test("the trainer's Panel lists each lesson's trainee notes, only for trainees who have one", async () => {
		const panel = await loadTrainerPanel(supabase, fx.trainers.t2);
		const notesAt = (slot: string) =>
			panel.week.find((l) => at(l) === slot)?.traineeNotes.map((n) => n.name);

		expect(notesAt(PRIVATE)).toEqual(['Feride Aksu']);
		// A duet: only the partner with a note
		expect(notesAt(DUET)).toEqual(['Hülya Tan']);
		expect(notesAt(GROUP)).toContain('Sevgi Bulut');
		const groupNote = panel.week
			.find((l) => at(l) === GROUP)
			?.traineeNotes.find((n) => n.name === 'Sevgi Bulut')?.note;
		expect(groupNote, 'line breaks are kept').toContain('\n');
	});

	test('the week board marks lessons with notes and the lesson sheet has them', async () => {
		const week = await new AppointmentRepository(supabase).getWeek(
			parseLocalDate(fx.week0),
			fx.trainers.t2
		);
		const details = (slot: string) => {
			const appointment = week.find((a) => at(a) === slot);
			return appointment ? createAppointmentDetails(appointment) : undefined;
		};

		const duet = details(DUET);
		expect(duet?.has_notes).toBe(true);
		expect(
			duet?.appointment_trainees?.map((e) => [e.pe_trainees?.name, e.pe_trainees?.notes !== null])
		).toEqual(
			expect.arrayContaining([
				['Hülya Tan', true],
				['Canan Tan', false]
			])
		);
	});
});
