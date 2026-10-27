import { describe, expect, test } from 'vitest';
import { actions as schedule } from '../../src/routes/(authed)/(home)/schedule/+page.server';
import {
	at,
	dayOf,
	expectNoChange,
	expectOk,
	fx,
	groupSession,
	kayitLessons,
	noParams,
	runAction,
	supabase,
	weekly
} from './helpers';
import { loadStudioPanel } from '$lib/server/panel';
import type { BookedLesson } from '$lib/types/Regression';
import type { MakeupCandidate } from '$lib/types/Attendance';

// The attendance group runs Mon/Thu 14:00 from two weeks ago, so last week's sessions
// have started whatever today is
const lastWeekMonday = dayOf(-1, 1);
const lastWeekThursday = dayOf(-1, 4);

function lessonAt(lessons: BookedLesson[], date: string, hour: number): BookedLesson {
	const lesson = lessons.find((l) => l.date === date && l.hour === hour);
	if (!lesson) throw new Error(`No lesson at ${date}@${hour}`);
	return lesson;
}

/** The non-replaced lessons' numbers, in calendar order. */
function numbering(lessons: BookedLesson[]): string[] {
	return lessons
		.filter((l) => l.absenceOutcome !== 'shifted' && l.absenceOutcome !== 'makeup')
		.map((l) => `${l.sessionNumber}/${l.totalSessions}`);
}

async function markAbsent(key: string, date: string, hour: number): Promise<BookedLesson> {
	const lesson = lessonAt(await kayitLessons(key), date, hour);
	expectOk(
		await runAction(
			schedule.markAttendance,
			{ enrollmentId: lesson.enrollmentId, attendance: 'absent' },
			noParams
		)
	);
	return lesson;
}

describe('Yoklama', () => {
	test('the seeded studio shows attendance taken, a make-up, a shift and a pending absence', async () => {
		const present = await kayitLessons('demo_present');
		const past = present.filter((l) => l.date < fx.today);
		expect(past.length).toBeGreaterThan(0);
		expect(past.every((l) => l.attendance === 'attended')).toBe(true);

		const makeup = await kayitLessons('demo_makeup');
		expect(makeup).toHaveLength(9);
		expect(lessonAt(makeup, dayOf(-1, 6), 15).absenceOutcome).toBe('makeup');
		expect(lessonAt(makeup, dayOf(3, 5), 14)).toMatchObject({
			isMakeup: true,
			groupLessonId: fx.groupLessons.makeup_target
		});

		const shift = await kayitLessons('demo_shift');
		expect(shift).toHaveLength(9);
		expect(lessonAt(shift, dayOf(-2, 6), 15).absenceOutcome).toBe('shifted');
		expect(lessonAt(shift, dayOf(6, 6), 15).isMakeup).toBe(true);
		expect(lessonAt(shift, dayOf(-1, 6), 15)).toMatchObject({
			attendance: 'absent',
			absenceOutcome: null
		});
		expect(numbering(shift)).toEqual(['1/8', '2/8', '3/8', '4/8', '5/8', '6/8', '7/8', '8/8']);

		// The desk sees the undecided absence on the Panel; the burned one is settled
		const panel = await loadStudioPanel(supabase);
		expect(panel.pendingAbsences.map((a) => a.traineeId)).toContain(fx.trainees.demo_shift);
		expect(panel.pendingAbsences.map((a) => a.traineeId)).not.toContain(fx.trainees.regular);
		expect(lessonAt(await kayitLessons('regular'), dayOf(-1, 4), 10).absenceOutcome).toBe('burned');
	});

	test('marks attendance on a started session and refuses a future one', async () => {
		const lessons = await kayitLessons('attend_regular');
		const started = lessonAt(lessons, lastWeekThursday, 14);
		expectOk(
			await runAction(
				schedule.markAttendance,
				{ enrollmentId: started.enrollmentId, attendance: 'attended' },
				noParams
			)
		);
		expect(lessonAt(await kayitLessons('attend_regular'), lastWeekThursday, 14).attendance).toBe(
			'attended'
		);

		const future = lessonAt(lessons, dayOf(1, 4), 14);
		expect(
			await runAction(
				schedule.markAttendance,
				{ enrollmentId: future.enrollmentId, attendance: 'attended' },
				noParams
			)
		).toMatchObject({ ok: false, message: 'Yoklama ders başladıktan sonra alınabilir' });
	});

	test('gives a missed group lesson a make-up in another session of the package', async () => {
		const missed = await markAbsent('absent_makeup', lastWeekThursday, 14);

		const candidates = expectOk(
			await runAction(schedule.makeupCandidates, { enrollmentId: missed.enrollmentId }, noParams)
		).candidates;
		const target = candidates.find((c: MakeupCandidate) => c.date === dayOf(1, 5) && c.hour === 14);
		expect(target).toMatchObject({ taken: 2, capacity: 3 });

		const outcome = expectOk(
			await runAction(
				schedule.resolveAbsence,
				{
					enrollmentId: missed.enrollmentId,
					outcome: 'makeup',
					targetAppointmentId: target!.appointmentId
				},
				noParams
			)
		);
		expect(outcome.message).toBe('Telafi dersi eklendi.');

		const after = await kayitLessons('absent_makeup');
		expect(after).toHaveLength(9);
		const makeup = lessonAt(after, dayOf(1, 5), 14);
		expect(makeup.isMakeup).toBe(true);
		expect(lessonAt(after, lastWeekThursday, 14).absenceOutcome).toBe('makeup');
		// The missed lesson leaves the sequence; the make-up takes a number in calendar order
		expect(numbering(after)).toEqual(['1/8', '2/8', '3/8', '4/8', '5/8', '6/8', '7/8', '8/8']);
		expect(makeup.sessionNumber).toBe(8);
	});

	test('is blocked when the session is full, in the past or of another package', async () => {
		const missed = await markAbsent('absent_shift', lastWeekMonday, 14);
		const full = await groupSession(fx.groupLessons.makeup_target, dayOf(1, 5), 14);
		const past = await groupSession(fx.groupLessons.attendance, lastWeekThursday, 14);
		const otherPackage = await groupSession(fx.groupLessons.main, dayOf(1, 2), 18);
		const cases: Array<[number, string]> = [
			[full!.id, 'Telafi dersinde yer yok'],
			[past!.id, 'Telafi dersi gelecekte olmalı'],
			[otherPackage!.id, 'Telafi dersi aynı paketten olmalı']
		];
		for (const [targetAppointmentId, message] of cases) {
			await expectNoChange(async () => {
				expect(
					await runAction(
						schedule.resolveAbsence,
						{ enrollmentId: missed.enrollmentId, outcome: 'makeup', targetAppointmentId },
						noParams
					)
				).toMatchObject({ ok: false, message });
			});
		}
	});

	test("shifts a missed group lesson to the lesson's next session on the trainee's days", async () => {
		const missed = lessonAt(await kayitLessons('absent_shift'), lastWeekMonday, 14);
		const plan = expectOk(
			await runAction(schedule.previewShift, { enrollmentId: missed.enrollmentId }, noParams)
		).plan;
		expect(plan).toMatchObject({ kind: 'group', date: dayOf(2, 1), hour: 14 });

		expectOk(
			await runAction(
				schedule.resolveAbsence,
				{ enrollmentId: missed.enrollmentId, outcome: 'shifted' },
				noParams
			)
		);
		const after = await kayitLessons('absent_shift');
		expect(after.map(at)).toEqual([
			...weekly(
				-2,
				[
					[1, 14],
					[4, 14]
				],
				8
			),
			at({ date: dayOf(2, 1), hour: 14 })
		]);
		expect(lessonAt(after, dayOf(2, 1), 14).isMakeup).toBe(true);
		expect(lessonAt(after, lastWeekMonday, 14).absenceOutcome).toBe('shifted');
		expect(numbering(after)).toEqual(['1/8', '2/8', '3/8', '4/8', '5/8', '6/8', '7/8', '8/8']);
	});

	test("shifts a missed private lesson to the kayıt's next free pattern slot", async () => {
		const missed = await markAbsent('attendance_private', dayOf(-1, 2), 14);
		const plan = expectOk(
			await runAction(schedule.previewShift, { enrollmentId: missed.enrollmentId }, noParams)
		).plan;
		expect(plan).toMatchObject({
			kind: 'private',
			date: dayOf(2, 2),
			hour: 14,
			roomId: fx.rooms.r2,
			trainerId: fx.trainers.t1
		});

		expectOk(
			await runAction(
				schedule.resolveAbsence,
				{ enrollmentId: missed.enrollmentId, outcome: 'shifted' },
				noParams
			)
		);
		const after = await kayitLessons('attendance_private');
		expect(after).toHaveLength(9);
		const shifted = lessonAt(after, dayOf(2, 2), 14);
		expect(shifted).toMatchObject({
			isMakeup: true,
			roomId: fx.rooms.r2,
			trainerId: fx.trainers.t1
		});
		expect(numbering(after)).toEqual(['1/8', '2/8', '3/8', '4/8', '5/8', '6/8', '7/8', '8/8']);
	});

	test('moves a make-up to another session and removes it again', async () => {
		const makeup = lessonAt(await kayitLessons('absent_makeup'), dayOf(1, 5), 14);
		const target = await groupSession(fx.groupLessons.makeup_target, dayOf(2, 5), 14);
		expectOk(
			await runAction(
				schedule.moveMakeup,
				{ enrollmentId: makeup.enrollmentId, targetAppointmentId: target!.id },
				noParams
			)
		);
		expect(lessonAt(await kayitLessons('absent_makeup'), dayOf(2, 5), 14).isMakeup).toBe(true);

		expectOk(
			await runAction(schedule.removeMakeup, { enrollmentId: makeup.enrollmentId }, noParams)
		);
		const after = await kayitLessons('absent_makeup');
		expect(after).toHaveLength(8);
		expect(lessonAt(after, lastWeekThursday, 14).absenceOutcome).toBeNull();
		expect(after.map((l) => `${l.sessionNumber}/${l.totalSessions}`)).toEqual([
			'1/8',
			'2/8',
			'3/8',
			'4/8',
			'5/8',
			'6/8',
			'7/8',
			'8/8'
		]);
	});

	test('cancelling a session that holds a make-up sends the missed lesson back to the desk', async () => {
		const missed = lessonAt(await kayitLessons('absent_makeup'), lastWeekThursday, 14);
		const target = await groupSession(fx.groupLessons.makeup_target, dayOf(1, 5), 14);
		expectOk(
			await runAction(
				schedule.resolveAbsence,
				{ enrollmentId: missed.enrollmentId, outcome: 'makeup', targetAppointmentId: target!.id },
				noParams
			)
		);

		expectOk(
			await runAction(
				schedule.cancelAppointment,
				{ appointmentId: target!.id, traineeAction: 'shift' },
				noParams
			)
		);
		expect(await groupSession(fx.groupLessons.makeup_target, dayOf(1, 5), 14)).toBeNull();
		const after = await kayitLessons('absent_makeup');
		expect(after).toHaveLength(8);
		expect(lessonAt(after, lastWeekThursday, 14).absenceOutcome).toBeNull();
		// The session's own members moved on to the next one
		expect((await kayitLessons('makeup_target_a')).map(at)).toEqual([
			...weekly(0, [[5, 14]], 1),
			...weekly(2, [[5, 14]], 9)
		]);
	});

	test('burns a missed lesson, and marking the trainee present clears the decision', async () => {
		const missed = await markAbsent('attend_regular', lastWeekMonday, 14);
		expectOk(
			await runAction(
				schedule.resolveAbsence,
				{ enrollmentId: missed.enrollmentId, outcome: 'burned' },
				noParams
			)
		);
		expect(lessonAt(await kayitLessons('attend_regular'), lastWeekMonday, 14).absenceOutcome).toBe(
			'burned'
		);

		expectOk(
			await runAction(
				schedule.markAttendance,
				{ enrollmentId: missed.enrollmentId, attendance: 'attended' },
				noParams
			)
		);
		expect(lessonAt(await kayitLessons('attend_regular'), lastWeekMonday, 14)).toMatchObject({
			attendance: 'attended',
			absenceOutcome: null
		});
	});

	test('a coordinator spends a make-up credit, gets it back on removal, and stops at zero', async () => {
		const missed = lessonAt(await kayitLessons('absent_makeup'), lastWeekThursday, 14);
		const target = await groupSession(fx.groupLessons.makeup_target, dayOf(2, 5), 14);
		const creditsLeft = async () =>
			(
				await supabase
					.from('pe_purchases')
					.select('makeup_left')
					.eq('id', fx.purchases.absent_makeup)
					.single()
			).data?.makeup_left;
		expect(await creditsLeft()).toBe(2);

		// The route spends a credit for coordinators; the RPC is called as the admin here
		const { data: replacementId, error } = await supabase.rpc('pe_resolve_absence', {
			p_enrollment_id: missed.enrollmentId,
			p_outcome: 'makeup',
			p_target_appointment_id: target!.id,
			p_consume_credit: true
		});
		expect(error).toBeNull();
		expect(await creditsLeft()).toBe(1);

		expectOk(await runAction(schedule.removeMakeup, { enrollmentId: replacementId! }, noParams));
		expect(await creditsLeft()).toBe(2);

		await supabase
			.from('pe_purchases')
			.update({ makeup_left: 0 })
			.eq('id', fx.purchases.absent_makeup);
		const exhausted = await supabase.rpc('pe_resolve_absence', {
			p_enrollment_id: missed.enrollmentId,
			p_outcome: 'makeup',
			p_target_appointment_id: target!.id,
			p_consume_credit: true
		});
		expect(exhausted.error?.message).toBe('Bu kayıt için telafi hakkı kalmamış');
	});
});
