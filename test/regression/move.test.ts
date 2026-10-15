import { describe, expect, test } from 'vitest';
import { actions as schedule } from '../../src/routes/(authed)/(home)/schedule/+page.server';
import { actions as groupLesson } from '../../src/routes/(authed)/(home)/group-lessons/[id]/+page.server';
import type { MovePreviewRow } from '$lib/types/Transfer';
import type { SlotConflict } from '$lib/types/Conflict';
import { STARTED_LESSON_ERROR } from '$lib/server/scheduling/shift';
import type { WeekdayHour } from '$lib/types/Regression';
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
	studioReason,
	supabase,
	weekly
} from './helpers';

describe('Taşı: private kayıt', () => {
	test('shifts a series one lesson on, as its preview showed', async () => {
		const [first] = await kayitLessons('shift_private_slots');
		const form = { appointmentId: first.appointmentId, kind: 'slots', amount: 1, ...studioReason };
		const preview = expectOk(await runAction(schedule.previewMove, form, noParams));
		expect(preview.conflicts).toEqual([]);

		expectOk(await runAction(schedule.move, form, noParams));

		const expected = weekly(
			1,
			[
				[2, 9],
				[5, 9]
			],
			9
		).slice(1);
		const lessons = await kayitLessons('shift_private_slots');
		expect(lessons.map(at)).toEqual(expected);
		expect((preview.rows as MovePreviewRow[]).map((r) => at(r.to))).toEqual(expected);
	});

	test('shifts the lessons from the selected one on by a week', async () => {
		const lessons = await kayitLessons('shift_private_weeks');
		expectOk(
			await runAction(
				schedule.move,
				{
					appointmentId: lessons[2].appointmentId,
					kind: 'weeks',
					scope: 'from_selected',
					amount: 1,
					...studioReason
				},
				noParams
			)
		);

		const pattern: WeekdayHour[] = [
			[1, 11],
			[4, 11]
		];
		const after = await kayitLessons('shift_private_weeks');
		expect(after.map(at)).toEqual([...weekly(1, pattern, 2), ...weekly(3, pattern, 6)]);
	});

	test('moves lessons to another room and trainer at the same times', async () => {
		const lessons = await kayitLessons('transfer');
		expectOk(
			await runAction(
				schedule.move,
				{
					appointmentId: lessons[2].appointmentId,
					kind: 'transfer',
					scope: 'from_selected',
					roomId: fx.rooms.r3,
					trainerId: fx.trainers.t2,
					...studioReason
				},
				noParams
			)
		);

		const after = await kayitLessons('transfer');
		expect(after.map(at)).toEqual(lessons.map(at));
		expect(after.map((l) => [l.roomId, l.trainerId])).toEqual([
			...Array(2).fill([fx.rooms.r1, fx.trainers.t1]),
			...Array(6).fill([fx.rooms.r3, fx.trainers.t2])
		]);
	});

	test('is blocked when a shifted lesson would conflict', async () => {
		await expectNoChange(async () => {
			const [first] = await kayitLessons('shift_conflict');
			const bySlot = {
				appointmentId: first.appointmentId,
				kind: 'slots',
				amount: 1,
				...studioReason
			};
			const preview = expectOk(await runAction(schedule.previewMove, bySlot, noParams));
			const conflicts = preview.conflicts as SlotConflict[];
			expect(conflicts.map(at)).toEqual([at({ date: dayOf(5, 2), hour: 20 })]);
			expect(conflicts[0]).toMatchObject({ roomConflict: false, trainerConflict: true });

			expect(await runAction(schedule.move, bySlot, noParams)).toMatchObject({
				ok: false,
				message: '1 çakışma var, taşıma yapılmadı.'
			});
			const byWeek = {
				appointmentId: first.appointmentId,
				kind: 'weeks',
				scope: 'all_from_now',
				amount: 1,
				...studioReason
			};
			expect(await runAction(schedule.move, byWeek, noParams)).toMatchObject({
				ok: false,
				message: '1 çakışma var, taşıma yapılmadı.'
			});
		});
	});

	test('never moves a lesson that has started, nor into the past', async () => {
		await expectNoChange(async () => {
			const [past] = await kayitLessons('extend_private');
			const started = await runAction(
				schedule.move,
				{ appointmentId: past.appointmentId, kind: 'weeks', scope: 'single', amount: 1 },
				noParams
			);
			expect(started).toMatchObject({ ok: false, message: STARTED_LESSON_ERROR });

			const [upcoming] = await kayitLessons('busy_anchor');
			const intoPast = await runAction(
				schedule.move,
				{ appointmentId: upcoming.appointmentId, kind: 'weeks', scope: 'single', amount: -3 },
				noParams
			);
			expect(intoPast.ok).toBe(false);
			expect(intoPast.message).toMatch(/geçmişte kalıyor/);
		});
	});
});

describe('Taşı: a trainee in a group lesson', () => {
	const pattern: WeekdayHour[] = [
		[2, 18],
		[6, 10]
	];

	test("shifts the trainee's lessons one session on, leaving the group in place", async () => {
		const [first] = await kayitLessons('shift_group_slots');
		expectOk(
			await runAction(
				schedule.move,
				{
					appointmentId: first.appointmentId,
					traineeId: fx.trainees.shift_group_slots,
					kind: 'slots',
					amount: 1,
					...studioReason
				},
				noParams
			)
		);

		const after = await kayitLessons('shift_group_slots');
		expect(after.map(at)).toEqual(weekly(1, pattern, 9).slice(1));
		const left = await groupSession(fx.groupLessons.main, first.date, first.hour);
		expect(left?.pe_appointment_trainees.map((t) => t.trainee_id)).not.toContain(
			fx.trainees.shift_group_slots
		);
		expect(left?.pe_appointment_trainees.length).toBeGreaterThan(0);
	});

	test("shifts the trainee's lessons from the selected one on by a week", async () => {
		const lessons = await kayitLessons('shift_group_weeks');
		expectOk(
			await runAction(
				schedule.move,
				{
					appointmentId: lessons[1].appointmentId,
					traineeId: fx.trainees.shift_group_weeks,
					kind: 'weeks',
					scope: 'from_selected',
					amount: 1,
					...studioReason
				},
				noParams
			)
		);

		const after = await kayitLessons('shift_group_weeks');
		expect(after.map(at)).toEqual([...weekly(1, pattern, 1), ...weekly(2, pattern, 8).slice(1)]);
	});

	test('is blocked when the target sessions are full', async () => {
		await expectNoChange(async () => {
			const [first] = await kayitLessons('boutique_first_week');
			for (const kind of ['slots', 'weeks']) {
				const outcome = await runAction(
					schedule.move,
					{
						appointmentId: first.appointmentId,
						traineeId: fx.trainees.boutique_first_week,
						kind,
						scope: 'from_selected',
						amount: 1,
						...studioReason
					},
					noParams
				);
				expect(outcome).toMatchObject({ ok: false, message: 'Hedef derste yer yok' });
			}
		});
	});
});

describe('Taşı: a whole group lesson', () => {
	const params = () => ({ id: fx.groupLessons.move });

	test('is blocked when the new time conflicts', async () => {
		await expectNoChange(async () => {
			// The trainer teaches a private lesson on Monday 10:00 until week 2
			const outcome = await runAction(
				groupLesson.move,
				{ fromDate: dayOf(2, 1), slotChanges: 'monday-19>monday-10' },
				params()
			);
			expect(outcome).toMatchObject({ ok: false, message: '1 çakışma var, taşıma yapılmadı.' });
		});
	});

	test('moves the sessions from a date on to a new weekly time', async () => {
		expectOk(
			await runAction(
				groupLesson.move,
				{ fromDate: dayOf(2, 1), slotChanges: 'monday-19>tuesday-19' },
				params()
			)
		);

		const lessons = await kayitLessons('group_move');
		expect(lessons.map(at)).toEqual([...weekly(1, [[1, 19]], 1), ...weekly(2, [[2, 19]], 7)]);
		expect(await groupSession(fx.groupLessons.move, dayOf(2, 1), 19)).toBeNull();
		const { data: lesson } = await supabase
			.from('pe_group_lessons')
			.select('timeslots')
			.eq('id', fx.groupLessons.move)
			.single();
		expect(lesson?.timeslots).toEqual([{ day: 'tuesday', hours: [19] }]);
	});
});
