import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { isHttpError } from '@sveltejs/kit';
import { parseAssignmentForm, parseRenewalForm } from '$lib/server/scheduling/lesson-plan-form';
import {
	notifiedSuffix,
	parseMoveReason,
	parseMoveRequest,
	wantsNotification
} from '$lib/server/scheduling/move-form';
import {
	parseGroupLessonMoveForm,
	parseNewGroupLessonForm
} from '$lib/server/scheduling/group-lesson-form';
import { parseWeeklySlots } from '$lib/server/scheduling/slot-form';

const ROOM = '6341fbbf-3b47-4634-87bd-32d69094f222';
const TRAINER = 'c95994a4-052c-4e64-ae07-0da2a3cebb0d';
const PACKAGE = '6481b34d-eec0-4913-9210-280c951e2885';
const GROUP = 'bce2cf99-0188-40bc-b219-829ce741c585';
const TRAINEE = '9115d33b-cf08-4e20-b079-e49b3d547691';

function form(values: Record<string, string>): FormData {
	const data = new FormData();
	for (const [key, value] of Object.entries(values)) data.append(key, value);
	return data;
}

describe('parseWeeklySlots', () => {
	test('reads "day-hour" lists', () => {
		expect(parseWeeklySlots('monday-10,thursday-18')).toEqual([
			{ day: 'monday', hour: 10 },
			{ day: 'thursday', hour: 18 }
		]);
		expect(parseWeeklySlots('')).toEqual([]);
	});

	test('rejects unknown days and hours', () => {
		expect(parseWeeklySlots('funday-10')).toBeNull();
		expect(parseWeeklySlots('monday-24')).toBeNull();
		expect(parseWeeklySlots('monday-9.5')).toBeNull();
		expect(parseWeeklySlots('monday')).toBeNull();
	});
});

describe('parseMoveRequest (Taşı)', () => {
	test('reads every kind', () => {
		expect(
			parseMoveRequest(
				form({ appointmentId: '7', kind: 'transfer', scope: 'single', roomId: ROOM })
			)
		).toEqual({
			kind: 'transfer',
			appointmentId: 7,
			scope: 'single',
			roomId: ROOM,
			trainerId: undefined
		});
		expect(
			parseMoveRequest(
				form({ appointmentId: '7', kind: 'weeks', scope: 'all_from_now', amount: '-2' })
			)
		).toEqual({ kind: 'weeks', appointmentId: 7, scope: 'all_from_now', weeks: -2 });
		expect(parseMoveRequest(form({ appointmentId: '7', kind: 'slots', amount: '3' }))).toEqual({
			kind: 'slots',
			appointmentId: 7,
			slots: 3
		});
	});

	test('a trainee makes it a move of that trainee only', () => {
		expect(
			parseMoveRequest(
				form({
					appointmentId: '7',
					kind: 'weeks',
					scope: 'single',
					amount: '1',
					traineeId: TRAINEE
				})
			)
		).toEqual({ kind: 'trainee_weeks', appointmentId: 7, traineeId: TRAINEE, weeks: 1 });
		expect(
			parseMoveRequest(form({ appointmentId: '7', kind: 'slots', amount: '1', traineeId: TRAINEE }))
		).toEqual({ kind: 'trainee_slots', appointmentId: 7, traineeId: TRAINEE, slots: 1 });
	});

	test('rejects incomplete requests', () => {
		expect(parseMoveRequest(form({ appointmentId: 'x', kind: 'slots' }))).toBe('Geçersiz randevu');
		expect(parseMoveRequest(form({ appointmentId: '7', kind: 'teleport' }))).toBe(
			'Geçersiz taşıma türü'
		);
		expect(parseMoveRequest(form({ appointmentId: '7', kind: 'weeks', scope: 'forever' }))).toBe(
			'Geçersiz kapsam'
		);
	});

	test('a missing appointment is a 400 with a Turkish message', () => {
		const parse = () => parseMoveRequest(form({ kind: 'slots' }));
		expect(parse).toThrow();
		try {
			parse();
		} catch (error) {
			expect(isHttpError(error, 400)).toBe(true);
		}
	});
});

describe('parseMoveReason and notifications', () => {
	test('a studio-caused change needs a cause', () => {
		expect(parseMoveReason(form({}))).toEqual({ source: 'trainee' });
		expect(parseMoveReason(form({ source: 'studio', cause: '  Tadilat ' }))).toEqual({
			source: 'studio',
			cause: 'Tadilat'
		});
		expect(parseMoveReason(form({ source: 'studio', cause: ' ' }))).toBe(
			'Stüdyo kaynaklı değişiklikler için sebep gerekli'
		);
	});

	test('messages go out only when ticked', () => {
		expect(wantsNotification(form({ notify: 'true' }))).toBe(true);
		expect(wantsNotification(form({}))).toBe(false);
	});

	test('notifiedSuffix', () => {
		expect(notifiedSuffix(null)).toBe('');
		expect(notifiedSuffix({ sent: 0, failed: 0, disabled: true })).toBe(
			' Bu stüdyoda WhatsApp kapalı, mesaj gönderilmedi.'
		);
		expect(notifiedSuffix({ sent: 2, failed: 1, disabled: false })).toBe(
			' 2 öğrenciye WhatsApp mesajı gönderildi. 1 öğrenciye mesaj gönderilemedi, onlara ayrıca haber verin.'
		);
	});
});

describe('Yeni kayıt and Yenile forms', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 9, 15, 14, 0));
	});
	afterEach(() => vi.useRealTimers());

	const privateForm = {
		kind: 'private',
		startDate: '2026-10-19',
		timeSlots: 'monday-10,thursday-10',
		roomId: ROOM,
		trainerId: TRAINER,
		periods: '2',
		packageId: PACKAGE,
		traineeIds: `${TRAINEE},${GROUP}`
	};

	test('reads a private kayıt', () => {
		expect(parseAssignmentForm(form(privateForm))).toEqual({
			kind: 'private',
			startDate: '2026-10-19',
			timeSlots: [
				{ day: 'monday', hour: 10 },
				{ day: 'thursday', hour: 10 }
			],
			roomId: ROOM,
			trainerId: TRAINER,
			periods: 2,
			packageId: PACKAGE,
			traineeIds: [TRAINEE, GROUP]
		});
	});

	test('reads a group kayıt', () => {
		expect(
			parseRenewalForm(
				form({
					kind: 'group',
					startDate: '2026-10-15',
					groupSlots: `${GROUP}|tuesday|18,${GROUP}|saturday|10`,
					weeks: '4'
				}),
				PACKAGE
			)
		).toEqual({
			kind: 'group',
			startDate: '2026-10-15',
			groupSlots: [
				{ group_lesson_id: GROUP, day: 'tuesday', hour: 18 },
				{ group_lesson_id: GROUP, day: 'saturday', hour: 10 }
			],
			weeks: 4,
			purchaseId: PACKAGE
		});
	});

	test('rejects a start in the past and incomplete forms', () => {
		expect(parseAssignmentForm(form({ ...privateForm, startDate: '2026-10-14' }))).toBe(
			'Başlangıç tarihi geçmişte olamaz'
		);
		expect(parseAssignmentForm(form({ ...privateForm, startDate: '19.10.2026' }))).toBe(
			'Geçersiz başlangıç tarihi'
		);
		expect(parseAssignmentForm(form({ ...privateForm, roomId: '' }))).toBe('Oda ve eğitmen seçin');
		expect(parseAssignmentForm(form({ ...privateForm, packageId: 'x' }))).toBe('Paket seçin');
		expect(parseAssignmentForm(form({ ...privateForm, timeSlots: 'monday-25' }))).toBe(
			'Geçersiz ders saatleri'
		);
		expect(
			parseAssignmentForm(
				form({ ...privateForm, kind: 'group', groupSlots: `${GROUP}|someday|18`, weeks: '4' })
			)
		).toBe('Geçersiz grup saatleri');
	});
});

describe('group lesson forms', () => {
	test('reads a new group lesson', () => {
		expect(
			parseNewGroupLessonForm(
				form({
					packageId: PACKAGE,
					roomId: ROOM,
					trainerId: TRAINER,
					startDate: '2026-10-19',
					timeSlots: 'tuesday-18,saturday-10'
				})
			)
		).toEqual({
			packageId: PACKAGE,
			roomId: ROOM,
			trainerId: TRAINER,
			startDate: '2026-10-19',
			slots: [
				{ day: 'tuesday', hour: 18 },
				{ day: 'saturday', hour: 10 }
			]
		});
	});

	test('reads a group lesson move', () => {
		expect(
			parseGroupLessonMoveForm(
				form({ fromDate: '2026-10-19', slotChanges: 'monday-19>tuesday-19', roomId: ROOM }),
				GROUP
			)
		).toEqual({
			groupLessonId: GROUP,
			fromDate: '2026-10-19',
			slotChanges: [{ from: { day: 'monday', hour: 19 }, to: { day: 'tuesday', hour: 19 } }],
			roomId: ROOM,
			trainerId: undefined
		});
		expect(
			parseGroupLessonMoveForm(form({ fromDate: '2026-10-19', slotChanges: 'monday-19>' }), GROUP)
		).toBe('Geçersiz ders saatleri');
		expect(
			parseGroupLessonMoveForm(form({ fromDate: '2026-10-19', trainerId: 'nope' }), GROUP)
		).toBe('Geçersiz oda veya eğitmen');
	});
});
