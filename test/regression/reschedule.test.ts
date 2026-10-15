import { describe, expect, test } from 'vitest';
import { actions as schedule } from '../../src/routes/(authed)/(home)/schedule/+page.server';
import type { WeekdayHour } from '$lib/types/Regression';
import {
	at,
	dayOf,
	expectNoChange,
	expectOk,
	fx,
	kayitLessons,
	noParams,
	runAction,
	studioReason,
	weekly
} from './helpers';

describe('Randevu değiştir', () => {
	test('moves one lesson to another day, time and room; lesson numbers follow the calendar', async () => {
		const [first] = await kayitLessons('reschedule');
		expectOk(
			await runAction(
				schedule.rescheduleAppointment,
				{
					appointmentId: first.appointmentId,
					newDate: dayOf(5, 6),
					newHour: 15,
					newRoomId: fx.rooms.r2,
					...studioReason
				},
				noParams
			)
		);

		const lessons = await kayitLessons('reschedule');
		const pattern: WeekdayHour[] = [
			[2, 11],
			[5, 11]
		];
		expect(lessons.map(at)).toEqual([
			...weekly(1, pattern, 8).slice(1),
			at({ date: dayOf(5, 6), hour: 15 })
		]);
		// The moved lesson is now the last one ("Son ders")
		const last = lessons[lessons.length - 1];
		expect(last).toMatchObject({
			appointmentId: first.appointmentId,
			roomId: fx.rooms.r2,
			trainerId: fx.trainers.t1,
			sessionNumber: 8,
			totalSessions: 8
		});
	});

	test('is blocked when the room is taken', async () => {
		await expectNoChange(async () => {
			const [, lesson] = await kayitLessons('reschedule');
			const outcome = await runAction(
				schedule.rescheduleAppointment,
				{
					appointmentId: lesson.appointmentId,
					newDate: dayOf(2, 1),
					newHour: 17,
					newRoomId: fx.rooms.r1,
					...studioReason
				},
				noParams
			);
			expect(outcome).toMatchObject({ ok: false, message: 'Yeni zaman dilimi zaten dolu' });
		});
	});

	test('is blocked when the trainer is taken', async () => {
		await expectNoChange(async () => {
			const [, lesson] = await kayitLessons('reschedule');
			const outcome = await runAction(
				schedule.rescheduleAppointment,
				{
					appointmentId: lesson.appointmentId,
					newDate: dayOf(2, 1),
					newHour: 17,
					newRoomId: fx.rooms.r3,
					...studioReason
				},
				noParams
			);
			expect(outcome).toMatchObject({
				ok: false,
				message: 'Eğitmenin bu saatte başka bir randevusu var'
			});
		});
	});

	test('never moves a lesson that has started, nor into the past', async () => {
		await expectNoChange(async () => {
			const [past] = await kayitLessons('extend_private');
			expect(
				await runAction(
					schedule.rescheduleAppointment,
					{
						appointmentId: past.appointmentId,
						newDate: dayOf(6, 3),
						newHour: 9,
						newRoomId: fx.rooms.r1,
						...studioReason
					},
					noParams
				)
			).toMatchObject({ ok: false, message: 'Başlamış randevu taşınamaz' });

			const [, upcoming] = await kayitLessons('reschedule');
			expect(
				await runAction(
					schedule.rescheduleAppointment,
					{
						appointmentId: upcoming.appointmentId,
						newDate: dayOf(-1, 3),
						newHour: 9,
						newRoomId: fx.rooms.r1,
						...studioReason
					},
					noParams
				)
			).toMatchObject({ ok: false, message: 'Randevu geçmiş bir saate taşınamaz' });
		});
	});
});
