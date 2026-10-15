import { describe, expect, test } from 'vitest';
import { actions as assignment } from '../../src/routes/(authed)/(home)/new-assignment/+page.server';
import { actions as newGroupLesson } from '../../src/routes/(authed)/(home)/group-lessons/new/+page.server';
import type { SlotConflict } from '$lib/types/Conflict';
import {
	at,
	dayOf,
	expectNoChange,
	expectOk,
	fx,
	kayitlarOf,
	lessonsOf,
	noParams,
	runAction,
	supabase,
	weekly
} from './helpers';

describe('Yeni kayıt: private', () => {
	test('creates a private kayıt over two periods: chained purchases, numbered lessons', async () => {
		const form = {
			kind: 'private',
			packageId: fx.packages.reformer,
			traineeIds: fx.trainees.new_private,
			roomId: fx.rooms.r2,
			trainerId: fx.trainers.t2,
			timeSlots: 'tuesday-16,friday-16',
			periods: 2,
			startDate: dayOf(1, 1)
		};
		const preview = expectOk(await runAction(assignment.preview, form, noParams));
		expect(preview.conflicts).toEqual([]);
		expect(preview.sessions).toHaveLength(16);

		expectOk(await runAction(assignment.create, form, noParams));

		const [kayit, ...others] = await kayitlarOf(fx.trainees.new_private);
		expect(others).toEqual([]);
		expect(kayit).toHaveLength(2);
		const expected = weekly(
			1,
			[
				[2, 16],
				[5, 16]
			],
			16
		);
		const [first, second] = await Promise.all(kayit.map((id) => lessonsOf(id)));
		expect(first.map(at)).toEqual(expected.slice(0, 8));
		expect(second.map(at)).toEqual(expected.slice(8));
		for (const lesson of [...first, ...second]) {
			expect(lesson.roomId).toBe(fx.rooms.r2);
			expect(lesson.trainerId).toBe(fx.trainers.t2);
		}
	});

	test('is blocked when the room is taken', async () => {
		await expectNoChange(async () => {
			const form = {
				kind: 'private',
				packageId: fx.packages.reformer,
				traineeIds: fx.trainees.new_conflict,
				roomId: fx.rooms.r1,
				trainerId: fx.trainers.t2,
				timeSlots: 'monday-17,thursday-19',
				periods: 1,
				startDate: dayOf(1, 1)
			};
			const preview = expectOk(await runAction(assignment.preview, form, noParams));
			const conflicts = preview.conflicts as SlotConflict[];
			expect(conflicts.map(at)).toEqual(weekly(1, [[1, 17]], 4));
			expect(conflicts.every((c) => c.roomConflict && !c.trainerConflict)).toBe(true);

			const outcome = await runAction(assignment.create, form, noParams);
			expect(outcome).toMatchObject({
				ok: false,
				message: 'Seçilen saatlerde çakışma var, kayıt oluşturulmadı'
			});
			expect(await kayitlarOf(fx.trainees.new_conflict)).toEqual([]);
		});
	});

	test('is blocked when the trainer is taken', async () => {
		await expectNoChange(async () => {
			const form = {
				kind: 'private',
				packageId: fx.packages.reformer,
				traineeIds: fx.trainees.new_conflict,
				roomId: fx.rooms.r3,
				trainerId: fx.trainers.t1,
				timeSlots: 'thursday-17,friday-18',
				periods: 1,
				startDate: dayOf(1, 1)
			};
			const preview = expectOk(await runAction(assignment.preview, form, noParams));
			const conflicts = preview.conflicts as SlotConflict[];
			expect(conflicts.map(at)).toEqual(weekly(1, [[4, 17]], 4));
			expect(conflicts.every((c) => c.trainerConflict && !c.roomConflict)).toBe(true);

			const outcome = await runAction(assignment.create, form, noParams);
			expect(outcome.ok).toBe(false);
		});
	});
});

describe('Yeni kayıt: joining a group lesson', () => {
	const main = () => fx.groupLessons.main;

	test('enrolls a trainee in an existing group lesson', async () => {
		const form = {
			kind: 'group',
			packageId: fx.packages.group,
			traineeIds: fx.trainees.new_group_member,
			groupSlots: `${main()}|tuesday|18,${main()}|saturday|10`,
			weeks: 4,
			startDate: dayOf(1, 1)
		};
		const preview = expectOk(await runAction(assignment.preview, form, noParams));
		expect(preview).toMatchObject({ fullSessions: 0, duplicateSessions: 0 });

		expectOk(await runAction(assignment.create, form, noParams));

		const [[purchaseId]] = await kayitlarOf(fx.trainees.new_group_member);
		const lessons = await lessonsOf(purchaseId);
		expect(lessons.map(at)).toEqual(
			weekly(
				1,
				[
					[2, 18],
					[6, 10]
				],
				8
			)
		);
		expect(lessons.every((l) => l.groupLessonId === main())).toBe(true);
	});

	test('is blocked when the trainee already attends those sessions', async () => {
		await expectNoChange(async () => {
			const form = {
				kind: 'group',
				packageId: fx.packages.group,
				traineeIds: fx.trainees.group_regular,
				groupSlots: `${main()}|tuesday|18`,
				weeks: 4,
				startDate: dayOf(1, 1)
			};
			const preview = expectOk(await runAction(assignment.preview, form, noParams));
			expect(preview.duplicateSessions).toBe(4);

			const outcome = await runAction(assignment.create, form, noParams);
			expect(outcome).toMatchObject({
				ok: false,
				message: 'Seçilen saatlerde çakışma var, kayıt oluşturulmadı'
			});
		});
	});

	test('is blocked when the sessions are full', async () => {
		await expectNoChange(async () => {
			const form = {
				kind: 'group',
				packageId: fx.packages.boutique,
				traineeIds: fx.trainees.new_boutique,
				groupSlots: `${fx.groupLessons.boutique}|friday|19`,
				weeks: 4,
				startDate: dayOf(1, 1)
			};
			// Week 1 has a seat; weeks 2–4 are full
			const preview = expectOk(await runAction(assignment.preview, form, noParams));
			expect(preview.fullSessions).toBe(3);

			const outcome = await runAction(assignment.create, form, noParams);
			expect(outcome.ok).toBe(false);
			expect(await kayitlarOf(fx.trainees.new_boutique)).toEqual([]);
		});
	});
});

describe('Yeni grup dersi', () => {
	test('opens a group lesson with 26 weeks of sessions', async () => {
		const form = {
			packageId: fx.packages.group,
			roomId: fx.rooms.r3,
			trainerId: fx.trainers.t2,
			startDate: dayOf(1, 1),
			timeSlots: 'saturday-17,sunday-17'
		};
		const preview = expectOk(await runAction(newGroupLesson.preview, form, noParams));
		expect(preview.conflicts).toEqual([]);

		const created = expectOk(await runAction(newGroupLesson.create, form, noParams));
		const id = String(created.redirectTo).replace('/group-lessons/', '');

		const { data: lesson } = await supabase
			.from('pe_group_lessons')
			.select('start_date, end_date, room_id, trainer_id, timeslots')
			.eq('id', id)
			.single();
		expect(lesson).toMatchObject({
			start_date: dayOf(1, 6),
			end_date: null,
			room_id: fx.rooms.r3,
			trainer_id: fx.trainers.t2,
			timeslots: [
				{ day: 'saturday', hours: [17] },
				{ day: 'sunday', hours: [17] }
			]
		});
		const { data: sessions } = await supabase
			.from('pe_appointments')
			.select('date, hour')
			.eq('group_lesson_id', id)
			.order('date');
		expect((sessions ?? []).map(at)).toEqual(
			weekly(
				1,
				[
					[6, 17],
					[7, 17]
				],
				52
			)
		);
	});

	test('is blocked when the room or trainer is taken', async () => {
		await expectNoChange(async () => {
			const form = {
				packageId: fx.packages.group,
				roomId: fx.rooms.r1,
				trainerId: fx.trainers.t2,
				startDate: dayOf(1, 1),
				timeSlots: 'monday-17'
			};
			const preview = expectOk(await runAction(newGroupLesson.preview, form, noParams));
			expect((preview.conflicts as SlotConflict[]).map(at)).toEqual(weekly(1, [[1, 17]], 4));

			const outcome = await runAction(newGroupLesson.create, form, noParams);
			expect(outcome).toMatchObject({
				ok: false,
				message: '4 saatte oda veya eğitmen dolu, grup dersi açılmadı'
			});
		});
	});
});
