import { describe, expect, test } from 'vitest';
import { actions as schedule } from '../../src/routes/(authed)/(home)/schedule/+page.server';
import type { CloseDayPreview, DayCancellationConflict } from '$lib/types/Operation';
import type { WeekdayHour } from '$lib/types/Regression';
import {
	appointmentsOn,
	at,
	dayOf,
	expectOk,
	fx,
	kayitLessons,
	noParams,
	runAction,
	weekly
} from './helpers';

// Wednesday of week 2 holds only the day-closing fixtures: a private lesson that can shift,
// one whose shift would conflict, a group session with a trainee and an empty one
const closedDay = () => dayOf(2, 3);

describe('Gün kapat', () => {
	test('previews what happens to each lesson of the day', async () => {
		const { preview } = expectOk(
			await runAction(schedule.previewCloseDay, { date: closedDay() }, noParams)
		);
		expect(
			(preview as CloseDayPreview).rows.map((r) => [r.hour, r.outcome, r.traineeNames])
		).toEqual([
			[10, 'shift', ['Nazlı Yıldız']],
			[12, 'conflict', ['Ece Güneş']],
			[18, 'shift', ['Seda Kılıç']],
			[20, 'remove_empty', []]
		]);
	});

	test('shifts the lessons, removes empty sessions and reports the conflicting one', async () => {
		const conflicting = await kayitLessons('close_day_conflict');
		const outcome = expectOk(
			await runAction(
				schedule.closeDay,
				{ date: closedDay(), cause: 'Regresyon testi: tatil' },
				noParams
			)
		);
		expect(outcome.message).toBe(
			'2 randevu kaydırıldı, 1 boş randevu silindi, 1 randevu çakışma nedeniyle kaydırılamadı.'
		);
		const conflicts = outcome.conflicts as DayCancellationConflict[];
		expect(conflicts.map((c) => c.hour)).toEqual([12]);

		// Only the conflicting lesson is left on the day, untouched
		expect((await appointmentsOn(closedDay())).map((a) => a.hour)).toEqual([12]);
		expect(await kayitLessons('close_day_conflict')).toEqual(conflicting);

		const privatePattern: WeekdayHour[] = [
			[3, 10],
			[5, 17]
		];
		const shiftedPrivate = weekly(1, privatePattern, 9);
		shiftedPrivate.splice(2, 1);
		expect((await kayitLessons('close_day_private')).map(at)).toEqual(shiftedPrivate);
		expect((await kayitLessons('close_day_group')).map(at)).toEqual([
			...weekly(1, [[3, 18]], 1),
			...weekly(3, [[3, 18]], 5)
		]);
	});

	test('resolves the conflicting lesson by moving it to the closest free slot', async () => {
		const before = await kayitLessons('close_day_conflict');
		const [{ id }] = await appointmentsOn(closedDay());
		const outcome = expectOk(
			await runAction(
				schedule.closeDay,
				{
					date: closedDay(),
					cause: 'Regresyon testi: tatil',
					appointmentIds: String(id),
					strategy: 'closest'
				},
				noParams
			)
		);
		expect(outcome.conflicts).toEqual([]);

		expect(await appointmentsOn(closedDay())).toEqual([]);
		const after = await kayitLessons('close_day_conflict');
		expect(after).toHaveLength(before.length);
		expect(after.map(at)).toEqual(expect.not.arrayContaining([`${closedDay()}@12`]));
		// The lesson that blocked the plain shift stays where it was
		const [blocker] = await kayitLessons('blocker_after_close_day_conflict', 'blocker');
		expect(at(blocker)).toBe(at({ date: dayOf(5, 3), hour: 12 }));
	});

	test('only closes days from tomorrow on', async () => {
		expect(
			await runAction(schedule.closeDay, { date: fx.today, cause: 'Regresyon testi' }, noParams)
		).toMatchObject({ ok: false, message: 'Sadece yarın ve sonrası kapatılabilir' });
	});
});
