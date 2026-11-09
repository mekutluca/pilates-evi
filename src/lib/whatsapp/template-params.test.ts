import { describe, expect, test } from 'vitest';
import {
	bindingsFromJson,
	bindingsProblem,
	bodyProblem,
	bodySegments,
	defaultBindings,
	paramsFromJson,
	reminderData,
	resolveParams,
	scheduleChangeData,
	syncParams,
	templateNameFrom,
	templateParamNames,
	uniqueTemplateName
} from './template-params';

// The live studio's approved template (appt_reschedule_by_system)
const SYSTEM_BODY =
	'Dikkat!  {{old_date_time}}\'daki  {{package}} randevunuz,  "{{cause}}" sebebiyle {{new_date_time}}\'da olacak şekilde güncellenmiştir.';

describe('template body', () => {
	test('params in order of first use, each once', () => {
		expect(templateParamNames(SYSTEM_BODY)).toEqual([
			'old_date_time',
			'package',
			'cause',
			'new_date_time'
		]);
		expect(templateParamNames('{{a}} ve {{b}} ile yine {{a}}')).toEqual(['a', 'b']);
	});

	test('segments split text and params', () => {
		expect(bodySegments('Merhaba {{first_name}}!')).toEqual([
			{ kind: 'text', text: 'Merhaba ' },
			{ kind: 'param', name: 'first_name' },
			{ kind: 'text', text: '!' }
		]);
	});

	test('Meta rules', () => {
		expect(bodyProblem(SYSTEM_BODY)).toBeNull();
		expect(bodyProblem('  ')).toMatch(/boş/);
		expect(bodyProblem('{{package}} dersiniz yarın')).toMatch(/başlamasına/);
		expect(bodyProblem('Dersiniz {{time}}')).toMatch(/bitmesine/);
		expect(bodyProblem('Merhaba {{1}} hoş geldiniz')).toMatch(/geçerli bir değişken/);
		expect(bodyProblem('Merhaba {{Ad}} hoş geldiniz')).toMatch(/geçerli bir değişken/);
		expect(bodyProblem('a'.repeat(1025))).toMatch(/1024/);
	});

	test('params keep examples and start ours from the sample', () => {
		expect(
			syncParams('Merhaba {{first_name}}, {{package}} ve {{kod}} hazır.', [
				{ name: 'package', example: 'Reformer' },
				{ name: 'gone', example: 'x' }
			])
		).toEqual([
			{ name: 'first_name', example: 'Ayşe' },
			{ name: 'package', example: 'Reformer' },
			{ name: 'kod', example: '' }
		]);
	});

	test('names from Turkish display names', () => {
		expect(templateNameFrom('Ders hatırlatması')).toBe('ders_hatirlatmasi');
		expect(templateNameFrom('  Öğrenci İsteği / Çarşamba ')).toBe('ogrenci_istegi_carsamba');
	});

	test('a new name the account does not use yet', () => {
		const taken = new Set(['ders_hatirlatmasi', 'ders_hatirlatmasi_2']);
		expect(uniqueTemplateName('Ders hatırlatması', taken)).toBe('ders_hatirlatmasi_3');
		expect(uniqueTemplateName('Hoş geldin', taken)).toBe('hos_geldin');
		expect(uniqueTemplateName('🌸', taken)).toBe('sablon');
	});
});

describe('bindings', () => {
	const params = [
		{ name: 'old_date_time', example: '' },
		{ name: 'package', example: '' },
		{ name: 'cause', example: '' },
		{ name: 'saat', example: '' }
	];

	test('params named after the flow’s data bind themselves', () => {
		expect(defaultBindings('schedule_change_studio', params)).toEqual({
			old_date_time: { source: 'old_date_time' },
			package: { source: 'package' },
			cause: { source: 'cause' }
		});
		// The request flow has no cause
		expect(defaultBindings('schedule_change_request', params).cause).toBeUndefined();
	});

	test('a kept choice wins unless the flow lacks that data', () => {
		const bindings = defaultBindings('daily_reminder', [{ name: 'saat', example: '' }], {
			saat: { source: 'time' }
		});
		expect(bindings).toEqual({ saat: { source: 'time' } });
		expect(
			defaultBindings('daily_reminder', [{ name: 'x', example: '' }], { x: { source: 'cause' } })
		).toEqual({});
	});

	test('every param needs a value the flow has', () => {
		const bound = { ...defaultBindings('schedule_change_studio', params) };
		expect(bindingsProblem('schedule_change_studio', params, bound)).toMatch(/saat/);
		bound.saat = { source: 'text', text: '  ' };
		expect(bindingsProblem('schedule_change_studio', params, bound)).toMatch(/sabit metni/);
		bound.saat = { source: 'new_time' };
		expect(bindingsProblem('schedule_change_studio', params, bound)).toBeNull();
		expect(bindingsProblem('schedule_change_request', params, bound)).toMatch(/cause/);
	});

	test('JSON parsing drops malformed entries', () => {
		expect(
			bindingsFromJson({
				a: { source: 'package' },
				b: { source: 'text', text: 'Pilates Evi' },
				c: { source: 'nope' },
				d: 'package',
				e: null
			})
		).toEqual({ a: { source: 'package' }, b: { source: 'text', text: 'Pilates Evi' } });
		expect(bindingsFromJson(['x'])).toEqual({});
		expect(paramsFromJson([{ name: 'a', example: 'b' }, { name: 1 }, 'x'])).toEqual([
			{ name: 'a', example: 'b' }
		]);
	});
});

describe('message data', () => {
	test('a schedule change fills what the live templates expect', () => {
		const data = scheduleChangeData({
			name: ' Ayşe Nur Yılmaz ',
			packageName: 'Grup Pilates ',
			studio: 'ASI GYM Bağlıca',
			oldDate: '2026-02-26',
			oldHour: 11,
			newDate: '2026-03-01',
			newHour: 15,
			cause: ' 23 Nisan tatili '
		});
		expect(data).toMatchObject({
			name: 'Ayşe Nur Yılmaz',
			first_name: 'Ayşe',
			package: 'Grup Pilates',
			old_date_time: '26 Şubat 11:00',
			old_day: 'Perşembe',
			new_date_time: '1 Mart 15:00',
			new_date: '1 Mart',
			new_day: 'Pazar',
			new_time: '15:00',
			cause: '23 Nisan tatili'
		});
	});

	test('the reminder', () => {
		expect(
			reminderData({
				name: 'Ayşe',
				packageName: 'Grup Zumba',
				studio: 'Pilates Evi',
				date: '2026-11-10',
				hour: 9,
				trainer: 'Elif',
				room: 'Salon 1'
			})
		).toMatchObject({ date: '10 Kasım', day: 'Salı', time: '09:00', trainer: 'Elif' });
	});

	test('values are sent as the template names them, never empty', () => {
		expect(
			resolveParams(
				[
					{ name: 'package', example: '' },
					{ name: 'cause', example: '' },
					{ name: 'imza', example: '' },
					{ name: 'unbound', example: '' }
				],
				{
					package: { source: 'package' },
					cause: { source: 'cause' },
					imza: { source: 'text', text: 'Pilates  Evi\nekibi' }
				},
				{ package: 'Grup Pilates', cause: '' }
			)
		).toEqual([
			{ name: 'package', value: 'Grup Pilates' },
			{ name: 'cause', value: '-' },
			{ name: 'imza', value: 'Pilates Evi ekibi' },
			{ name: 'unbound', value: '-' }
		]);
	});
});
