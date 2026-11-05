import { describe, expect, test } from 'vitest';
import { actions as assignment } from '../../src/routes/(authed)/(home)/new-assignment/+page.server';
import { actions as newGroupLesson } from '../../src/routes/(authed)/(home)/group-lessons/new/+page.server';
import { actions as schedule } from '../../src/routes/(authed)/(home)/schedule/+page.server';
import type { WeekdayHour } from '$lib/types/Regression';
import {
	at,
	dayOf,
	expectOk,
	fx,
	groupSession,
	kayitlarOf,
	lessonsOf,
	noParams,
	runAction,
	weekly
} from './helpers';

// A studio that runs one group lesson per weekday: the member comes Salı 21:00 (one lesson)
// and Perşembe 21:00 (another), in a kayıt that started two weeks ago. Tuesday and Thursday
// 21:00 in r3 with t2 are this file's own.
const PATTERN: WeekdayHour[] = [
	[2, 21],
	[4, 21]
];

async function openOneDayLesson(day: string): Promise<string> {
	const created = expectOk(
		await runAction(
			newGroupLesson.create,
			{
				packageId: fx.packages.group,
				roomId: fx.rooms.r3,
				trainerId: fx.trainers.t2,
				startDate: dayOf(-2, 1),
				timeSlots: `${day}-21`
			},
			noParams
		)
	);
	return String(created.redirectTo).replace('/group-lessons/', '');
}

let tuesdayLesson = '';
let thursdayLesson = '';
let purchaseId = '';

const lessons = () => lessonsOf(purchaseId);

describe('A kayıt across one-day group lessons', () => {
	test('Yeni kayıt books both lessons in calendar order', async () => {
		tuesdayLesson = await openOneDayLesson('tuesday');
		thursdayLesson = await openOneDayLesson('thursday');
		const created = expectOk(
			await runAction(
				assignment.createTrainee,
				{ name: 'Tek Günlük Gruplar', phone: '5559900201' },
				noParams
			)
		);
		const traineeId = created.trainee.id;
		expectOk(
			await runAction(
				assignment.create,
				{
					kind: 'group',
					packageId: fx.packages.group,
					traineeIds: traineeId,
					groupSlots: `${tuesdayLesson}|tuesday|21,${thursdayLesson}|thursday|21`,
					weeks: 5,
					startDate: dayOf(-2, 1)
				},
				noParams
			)
		);
		[[purchaseId]] = await kayitlarOf(traineeId);
		expect((await lessons()).map(at)).toEqual(weekly(-2, PATTERN, 10));
	});

	// Gün kapat shifts a day's group sessions the same way (shiftGroupTraineesOn)
	test('cancelling a Thursday moves the lessons on by one lesson, keeping the next Tuesday', async () => {
		const session = await groupSession(thursdayLesson, dayOf(1, 4), 21);
		expectOk(
			await runAction(
				schedule.cancelAppointment,
				{ appointmentId: session!.id, traineeAction: 'shift' },
				noParams
			)
		);
		const expected = weekly(-2, PATTERN, 11).filter(
			(slot) => slot !== at({ date: dayOf(1, 4), hour: 21 })
		);
		expect((await lessons()).map(at)).toEqual(expected);
	});

	test("Kaydır gives a missed lesson the kayıt's next slot, in whichever lesson it is", async () => {
		const missed = (await lessons()).find((l) => l.date === dayOf(-1, 4));
		expectOk(
			await runAction(
				schedule.markAttendance,
				{ enrollmentId: missed!.enrollmentId, attendance: 'absent' },
				noParams
			)
		);
		// The kayıt now ends on Tuesday of week 3: the next slot is that Thursday
		const plan = expectOk(
			await runAction(schedule.previewShift, { enrollmentId: missed!.enrollmentId }, noParams)
		).plan;
		expect(plan).toMatchObject({
			kind: 'group',
			date: dayOf(3, 4),
			hour: 21,
			roomId: fx.rooms.r3,
			trainerId: fx.trainers.t2
		});

		expectOk(
			await runAction(
				schedule.resolveAbsence,
				{ enrollmentId: missed!.enrollmentId, outcome: 'shifted' },
				noParams
			)
		);
		const replacement = (await lessons()).find((l) => l.date === dayOf(3, 4));
		expect(replacement).toMatchObject({ isMakeup: true, groupLessonId: thursdayLesson });
	});
});
