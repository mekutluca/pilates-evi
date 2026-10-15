import { describe, expect, test } from 'vitest';
import { actions as renew } from '../../src/routes/(authed)/(home)/trainees/[id]/renew/[purchaseId]/+page.server';
import type { SlotConflict } from '$lib/types/Conflict';
import {
	at,
	chainOf,
	dayOf,
	expectNoChange,
	expectOk,
	fx,
	kayitLessons,
	lessonsOf,
	plusDays,
	runAction,
	weekly
} from './helpers';

// The renew route of a seeded kayıt (its first trainee)
function renewParams(key: string, traineeKey = key) {
	return { id: fx.trainees[traineeKey], purchaseId: fx.purchases[key] };
}

async function dayAfterLastLesson(key: string): Promise<string> {
	const lessons = await kayitLessons(key);
	return plusDays(lessons[lessons.length - 1].date, 1);
}

describe('Yenile: private', () => {
	test('rejects a new period that starts before the last lesson', async () => {
		const lessons = await kayitLessons('extend_private');
		const outcome = await runAction(
			renew.renew,
			{
				kind: 'private',
				timeSlots: 'monday-9,thursday-9',
				roomId: fx.rooms.r1,
				trainerId: fx.trainers.t1,
				periods: 1,
				startDate: lessons[lessons.length - 1].date
			},
			renewParams('extend_private')
		);
		expect(outcome.ok).toBe(false);
		expect(outcome.message).toMatch(/^Yeni dönem en erken/);
	});

	test('extends a private kayıt with a chained purchase after its last lesson', async () => {
		const before = await kayitLessons('extend_private');
		const form = {
			kind: 'private',
			timeSlots: 'monday-9,thursday-9',
			roomId: fx.rooms.r1,
			trainerId: fx.trainers.t1,
			periods: 1,
			startDate: await dayAfterLastLesson('extend_private')
		};
		const params = renewParams('extend_private');
		const preview = expectOk(await runAction(renew.preview, form, params));
		expect(preview.conflicts).toEqual([]);

		expectOk(await runAction(renew.renew, form, params));

		const chain = await chainOf(fx.purchases.extend_private);
		expect(chain).toHaveLength(2);
		expect(await lessonsOf(chain[0])).toEqual(before);
		const added = await lessonsOf(chain[1]);
		expect(added.map(at)).toEqual(
			weekly(
				2,
				[
					[1, 9],
					[4, 9]
				],
				8
			)
		);
	});

	test('is blocked when a new lesson would conflict', async () => {
		await expectNoChange(async () => {
			const form = {
				kind: 'private',
				timeSlots: 'tuesday-20,friday-20',
				roomId: fx.rooms.r1,
				trainerId: fx.trainers.t1,
				periods: 1,
				startDate: await dayAfterLastLesson('shift_conflict')
			};
			const params = renewParams('shift_conflict');
			// The trainer has another lesson on the first new Tuesday
			const preview = expectOk(await runAction(renew.preview, form, params));
			const conflicts = preview.conflicts as SlotConflict[];
			expect(conflicts.map(at)).toEqual([at({ date: dayOf(5, 2), hour: 20 })]);
			expect(conflicts[0]).toMatchObject({ roomConflict: false, trainerConflict: true });

			const outcome = await runAction(renew.renew, form, params);
			expect(outcome).toMatchObject({
				ok: false,
				message: 'Seçilen saatlerde çakışma var, kayıt yenilenmedi'
			});
			expect(await chainOf(fx.purchases.shift_conflict)).toHaveLength(1);
		});
	});
});

describe('Yenile: group', () => {
	test('extends a group kayıt into the following sessions', async () => {
		const main = fx.groupLessons.main;
		const form = {
			kind: 'group',
			groupSlots: `${main}|tuesday|18,${main}|saturday|10`,
			weeks: 4,
			startDate: await dayAfterLastLesson('extend_group')
		};
		const params = renewParams('extend_group');
		const preview = expectOk(await runAction(renew.preview, form, params));
		expect(preview).toMatchObject({ fullSessions: 0, duplicateSessions: 0 });

		expectOk(await runAction(renew.renew, form, params));

		const chain = await chainOf(fx.purchases.extend_group);
		expect(chain).toHaveLength(2);
		const added = await lessonsOf(chain[1]);
		expect(added.map(at)).toEqual(
			weekly(
				2,
				[
					[2, 18],
					[6, 10]
				],
				8
			)
		);
		expect(added.every((l) => l.groupLessonId === main)).toBe(true);
	});

	test('is blocked when the sessions are full', async () => {
		await expectNoChange(async () => {
			const form = {
				kind: 'group',
				groupSlots: `${fx.groupLessons.boutique}|friday|19`,
				weeks: 4,
				// Her last lesson is past: the new period can start today
				startDate: fx.today
			};
			const params = renewParams('boutique_past');
			const preview = expectOk(await runAction(renew.preview, form, params));
			expect(preview.fullSessions).toBeGreaterThan(0);

			const outcome = await runAction(renew.renew, form, params);
			expect(outcome.ok).toBe(false);
			expect(await chainOf(fx.purchases.boutique_past)).toHaveLength(1);
		});
	});
});
