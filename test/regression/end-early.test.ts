import { describe, expect, test } from 'vitest';
import { actions as trainee } from '../../src/routes/(authed)/(home)/trainees/[id]/+page.server';
import { actions as groupLesson } from '../../src/routes/(authed)/(home)/group-lessons/[id]/+page.server';
import { isAppointmentFuture } from '$lib/utils/date-utils';
import type { BookedLesson } from '$lib/types/Regression';
import type { SlotRef } from '$lib/types/Schedule';
import {
	dayOf,
	expectNoChange,
	expectOk,
	fx,
	groupSession,
	kayitLessons,
	runAction,
	supabase
} from './helpers';

function endKayit(key: string, traineeKey = key) {
	return runAction(
		trainee.deleteRemainingLessons,
		{ purchaseIds: fx.purchases[key], scope: 'trainee' },
		{ id: fx.trainees[traineeKey] }
	);
}

const isUpcoming = (l: SlotRef) => isAppointmentFuture(l.date, l.hour);

// The lessons kept: the past ones, renumbered as the whole kayıt (1..n of n)
function expectKept(after: BookedLesson[], before: BookedLesson[]) {
	const kept = before.filter((l) => !isUpcoming(l));
	expect(after.map((l) => l.appointmentId)).toEqual(kept.map((l) => l.appointmentId));
	expect(after.map((l) => [l.sessionNumber, l.totalSessions])).toEqual(
		kept.map((_, i) => [i + 1, kept.length])
	);
}

describe("Kaydı erken bitir (a trainee's remaining lessons)", () => {
	test('private: deletes the upcoming lessons, keeps the past ones and frees the slots', async () => {
		const before = await kayitLessons('end_private');
		const upcoming = before.filter(isUpcoming);
		expect(upcoming.length).toBeGreaterThan(0);

		const outcome = expectOk(await endKayit('end_private'));
		expect(outcome.message).toBe(`${upcoming.length} ders silindi`);

		expectKept(await kayitLessons('end_private'), before);
		const { data: left } = await supabase
			.from('pe_appointments')
			.select('id')
			.in(
				'id',
				upcoming.map((l) => l.appointmentId)
			);
		expect(left).toEqual([]);
	});

	test('shared private kayıt: only the leaving trainee loses the lessons', async () => {
		const staying = await kayitLessons('duet', 'duet_staying');
		expectOk(await endKayit('duet', 'duet_leaving'));

		expect(await kayitLessons('duet', 'duet_leaving')).toEqual([]);
		expect(await kayitLessons('duet', 'duet_staying')).toEqual(staying);
	});

	test("group: removes the trainee's upcoming sessions, the group lesson goes on", async () => {
		const before = await kayitLessons('end_group');
		const upcoming = before.filter(isUpcoming);
		expectOk(await endKayit('end_group'));

		expectKept(await kayitLessons('end_group'), before);
		for (const lesson of upcoming) {
			expect(await groupSession(fx.groupLessons.main, lesson.date, lesson.hour)).not.toBeNull();
		}
	});

	test('says so when nothing is left to delete', async () => {
		await expectNoChange(async () => {
			expect(await endKayit('end_private')).toMatchObject({
				ok: false,
				message: 'Silinecek gelecek ders bulunamadı'
			});
		});
	});
});

describe('Grup dersini sonlandır', () => {
	const params = () => ({ id: fx.groupLessons.end });

	test('is blocked while trainees attend sessions on or after the end date', async () => {
		await expectNoChange(async () => {
			// Her last session is on Sunday of week 4
			const outcome = await runAction(groupLesson.end, { endDate: dayOf(4, 7) }, params());
			expect(outcome.ok).toBe(false);
		});
	});

	test('ends the lesson: its later sessions go, the trainees keep theirs', async () => {
		const lessons = await kayitLessons('group_end');
		expectOk(await runAction(groupLesson.end, { endDate: dayOf(5, 1) }, params()));

		const { data: lesson } = await supabase
			.from('pe_group_lessons')
			.select('end_date')
			.eq('id', fx.groupLessons.end)
			.single();
		expect(lesson?.end_date).toBe(dayOf(5, 1));
		const { data: later } = await supabase
			.from('pe_appointments')
			.select('id')
			.eq('group_lesson_id', fx.groupLessons.end)
			.gte('date', dayOf(5, 1));
		expect(later).toEqual([]);
		expect(await kayitLessons('group_end')).toEqual(lessons);
	});
});
