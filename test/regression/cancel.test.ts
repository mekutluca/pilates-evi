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
	weekly
} from './helpers';

describe('Randevu iptal', () => {
	test("shifts a private kayıt's lessons on, keeping its lesson count", async () => {
		const lessons = await kayitLessons('cancel_shift');
		const outcome = expectOk(
			await runAction(
				schedule.cancelAppointment,
				{ appointmentId: lessons[2].appointmentId, traineeAction: 'shift' },
				noParams
			)
		);
		expect(outcome.message).toBe('Randevu iptal edildi, dersler bir sonraki randevuya kaydırıldı.');

		const expected = weekly(
			1,
			[
				[1, 13],
				[4, 13]
			],
			9
		);
		expected.splice(2, 1);
		expect((await kayitLessons('cancel_shift')).map(at)).toEqual(expected);
	});

	test('removes the lesson from a private kayıt', async () => {
		const lessons = await kayitLessons('cancel_remove');
		expectOk(
			await runAction(
				schedule.cancelAppointment,
				{ appointmentId: lessons[1].appointmentId, traineeAction: 'remove' },
				noParams
			)
		);

		const after = await kayitLessons('cancel_remove');
		expect(after.map(at)).toEqual(lessons.filter((_, i) => i !== 1).map(at));
		expect(after.map((l) => l.totalSessions)).toEqual(Array(7).fill(7));
	});

	test('cancels a group session: every trainee moves to their next session', async () => {
		const date = dayOf(2, 4);
		const session = await groupSession(fx.groupLessons.cancel, date, 18);
		expectOk(
			await runAction(
				schedule.cancelAppointment,
				{ appointmentId: session!.id, traineeAction: 'shift' },
				noParams
			)
		);

		expect(await groupSession(fx.groupLessons.cancel, date, 18)).toBeNull();
		const expected = [...weekly(1, [[4, 18]], 1), ...weekly(3, [[4, 18]], 5)];
		for (const key of ['cancel_group_a', 'cancel_group_b']) {
			expect((await kayitLessons(key)).map(at)).toEqual(expected);
		}
	});

	test('deletes an empty session without asking about trainees', async () => {
		const date = dayOf(3, 3);
		const session = await groupSession(fx.groupLessons.close_day, date, 20);
		expect(session?.pe_appointment_trainees).toEqual([]);
		expectOk(await runAction(schedule.cancelAppointment, { appointmentId: session!.id }, noParams));
		expect(await groupSession(fx.groupLessons.close_day, date, 20)).toBeNull();
	});

	test('asks what happens to the trainees before cancelling', async () => {
		await expectNoChange(async () => {
			const [lesson] = await kayitLessons('busy_anchor');
			expect(
				await runAction(
					schedule.cancelAppointment,
					{ appointmentId: lesson.appointmentId },
					noParams
				)
			).toMatchObject({ ok: false, message: 'Öğrencilerin dersi ne olsun, seçin' });
		});
	});

	test('is blocked when shifting the lessons on would conflict', async () => {
		await expectNoChange(async () => {
			const lessons = await kayitLessons('shift_conflict');
			expect(
				await runAction(
					schedule.cancelAppointment,
					{ appointmentId: lessons[2].appointmentId, traineeAction: 'shift' },
					noParams
				)
			).toMatchObject({
				ok: false,
				message: 'Kaydırılacak saatlerin 1 tanesi dolu, randevu iptal edilmedi.'
			});
		});
	});

	test('never cancels a lesson that has started', async () => {
		await expectNoChange(async () => {
			const [past] = await kayitLessons('extend_private');
			expect(
				await runAction(
					schedule.cancelAppointment,
					{ appointmentId: past.appointmentId, traineeAction: 'remove' },
					noParams
				)
			).toMatchObject({ ok: false, message: 'Geçmiş randevular iptal edilemez' });
		});
	});
});
