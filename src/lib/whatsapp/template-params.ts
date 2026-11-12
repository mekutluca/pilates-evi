// WhatsApp templates, the automatic messages that send them, and the data their named
// parameters are filled with. Imported by the pe-daily-reminder edge function as well: keep
// its only imports the relative, import-free type files so it stays loadable from Deno.
import type { Tables, TablesUpdate } from '../types/database.types.ts';
import type {
	AccountTemplate,
	TemplateContent,
	WaFlow,
	WaSwitchPlan,
	WaTemplate,
	WaTemplateCategory,
	WaTemplateStatus,
	WaTemplateSyncPatch,
	WaTemplateParam,
	WaFlowKey,
	WaDataKey,
	WaParamBindings,
	WaMessageData,
	WaDataField,
	WaFieldGroup,
	WaFlowDefinition,
	WaBodySegment,
	WaJson
} from '../types/WhatsAppTemplate.ts';

export const WA_DATA_FIELDS: Record<WaDataKey, WaDataField> = {
	name: { label: 'Öğrencinin adı soyadı', sample: 'Ayşe Yılmaz' },
	first_name: { label: 'Öğrencinin adı', sample: 'Ayşe' },
	package: { label: 'Paket', sample: 'Grup Pilates' },
	studio: { label: 'Stüdyo adı', sample: 'Pilates Evi' },
	old_date_time: { label: 'Eski tarih ve saat', sample: '26 Şubat 11:00' },
	old_date: { label: 'Eski tarih', sample: '26 Şubat' },
	old_day: { label: 'Eski gün', sample: 'Perşembe' },
	old_time: { label: 'Eski saat', sample: '11:00' },
	new_date_time: { label: 'Yeni tarih ve saat', sample: '1 Mart 15:00' },
	new_date: { label: 'Yeni tarih', sample: '1 Mart' },
	new_day: { label: 'Yeni gün', sample: 'Pazar' },
	new_time: { label: 'Yeni saat', sample: '15:00' },
	cause: { label: 'Sebep', sample: 'eğitmen izinli' },
	date: { label: 'Ders tarihi', sample: '10 Kasım' },
	day: { label: 'Ders günü', sample: 'Salı' },
	time: { label: 'Ders saati', sample: '13:00' },
	trainer: { label: 'Eğitmen', sample: 'Elif' },
	room: { label: 'Oda', sample: 'Salon 1' }
};

const TRAINEE_FIELDS: WaFieldGroup = {
	group: 'Öğrenci ve paket',
	keys: ['first_name', 'name', 'package', 'studio']
};
const CHANGE_FIELDS: WaFieldGroup[] = [
	{ group: 'Eski ders', keys: ['old_date_time', 'old_date', 'old_day', 'old_time'] },
	{ group: 'Yeni ders', keys: ['new_date_time', 'new_date', 'new_day', 'new_time'] }
];

export const WA_FLOWS: Record<WaFlowKey, WaFlowDefinition> = {
	schedule_change_studio: {
		key: 'schedule_change_studio',
		title: 'Stüdyo kaynaklı değişiklik',
		when: 'Stüdyo bir dersi taşıdığında, iptal edip kaydırdığında ya da günü kapattığında.',
		fields: [TRAINEE_FIELDS, ...CHANGE_FIELDS, { group: 'Değişiklik', keys: ['cause'] }]
	},
	schedule_change_request: {
		key: 'schedule_change_request',
		title: 'Öğrenci talebiyle değişiklik',
		when: 'Öğrencinin isteğiyle ders taşındığında, kaçırılan ders kaydırıldığında ya da telafi dersi eklendiğinde.',
		fields: [TRAINEE_FIELDS, ...CHANGE_FIELDS]
	},
	daily_reminder: {
		key: 'daily_reminder',
		title: 'Ders hatırlatması',
		when: 'Her gün 13:00’te, ertesi gün dersi olan her öğrenciye.',
		fields: [
			TRAINEE_FIELDS,
			{ group: 'Yarınki ders', keys: ['date', 'day', 'time', 'trainer', 'room'] }
		]
	}
};

export const WA_FLOW_KEYS: WaFlowKey[] = [
	'schedule_change_studio',
	'schedule_change_request',
	'daily_reminder'
];

function flowDataKeys(flow: WaFlowKey): WaDataKey[] {
	return WA_FLOWS[flow].fields.flatMap((g) => g.keys);
}

export function isWaDataKey(value: string): value is WaDataKey {
	return Object.hasOwn(WA_DATA_FIELDS, value);
}

export function isWaFlowKey(value: string): value is WaFlowKey {
	return (WA_FLOW_KEYS as string[]).includes(value);
}

// ------------------------------------------------------------------ the body

export const BODY_MAX_LENGTH = 1024;
export const HEADER_MAX_LENGTH = 60;
const PARAM_NAME = /^[a-z][a-z0-9_]*$/;
// Any {{…}}, valid or not, so a typo is reported rather than sent as text
const PLACEHOLDER = /\{\{([^{}]*)\}\}/g;

/** The body as text and `{{param}}` pieces, for previews. */
export function bodySegments(body: string): WaBodySegment[] {
	const segments: WaBodySegment[] = [];
	let last = 0;
	for (const match of body.matchAll(PLACEHOLDER)) {
		const start = match.index ?? 0;
		if (start > last) segments.push({ kind: 'text', text: body.slice(last, start) });
		segments.push({ kind: 'param', name: match[1].trim() });
		last = start + match[0].length;
	}
	if (last < body.length) segments.push({ kind: 'text', text: body.slice(last) });
	return segments;
}

/** The parameter names in the body, each once, in order of first use. */
export function templateParamNames(body: string): string[] {
	const names: string[] = [];
	for (const segment of bodySegments(body)) {
		if (segment.kind === 'param' && !names.includes(segment.name)) names.push(segment.name);
	}
	return names;
}

/**
 * One param row per `{{name}}` in the body: kept examples stay, new ones start from the
 * data field's sample when the name is one of ours.
 */
export function syncParams(body: string, previous: WaTemplateParam[]): WaTemplateParam[] {
	return templateParamNames(body)
		.filter((name) => PARAM_NAME.test(name))
		.map((name) => ({
			name,
			example:
				previous.find((p) => p.name === name)?.example ??
				(isWaDataKey(name) ? WA_DATA_FIELDS[name].sample : '')
		}));
}

/** Why Meta would refuse this body, or null. */
export function bodyProblem(body: string): string | null {
	const text = body.trim();
	if (!text) return 'Mesaj metni boş olamaz.';
	if (body.length > BODY_MAX_LENGTH)
		return `Mesaj metni en fazla ${BODY_MAX_LENGTH} karakter olabilir.`;
	const bad = templateParamNames(body).find((name) => !PARAM_NAME.test(name));
	if (bad !== undefined) {
		return `{{${bad}}} geçerli bir değişken değil: küçük harf, rakam ve alt çizgi kullanın, harfle başlayın.`;
	}
	if (/^\{\{[^{}]*\}\}/.test(text) || /\{\{[^{}]*\}\}$/.test(text)) {
		return 'WhatsApp, metnin bir değişkenle başlamasına ya da bitmesine izin vermiyor.';
	}
	return null;
}

/** Why the params can't go to Meta (an example is missing), or null. */
export function paramsProblem(params: WaTemplateParam[]): string | null {
	const missing = params.find((p) => !p.example.trim());
	return missing ? `{{${missing.name}}} için bir örnek yazın.` : null;
}

const TURKISH_ASCII: Record<string, string> = {
	ç: 'c',
	ğ: 'g',
	ı: 'i',
	ö: 'o',
	ş: 's',
	ü: 'u'
};

/** Meta's template name from a display name, e.g. "Ders hatırlatması" → "ders_hatirlatmasi". */
export function templateNameFrom(displayName: string): string {
	return displayName
		.toLocaleLowerCase('tr')
		.replace(/[çğıöşü]/g, (c) => TURKISH_ASCII[c])
		.normalize('NFKD')
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 512);
}

/**
 * The WhatsApp name for a new template, from its display name: one the account doesn't
 * use yet (`ders_hatirlatmasi`, then `ders_hatirlatmasi_2`).
 */
export function uniqueTemplateName(displayName: string, taken: Set<string>): string {
	const base = templateNameFrom(displayName).slice(0, 500) || 'sablon';
	if (!taken.has(base)) return base;
	let n = 2;
	while (taken.has(`${base}_${n}`)) n++;
	return `${base}_${n}`;
}

// ---------------------------------------------------------------- bindings

/**
 * Bindings for a flow's template: what was chosen before stays when it still fits, a
 * param named after one of the flow's data fields binds to it, the rest stay unbound.
 */
export function defaultBindings(
	flow: WaFlowKey,
	params: WaTemplateParam[],
	previous: WaParamBindings = {}
): WaParamBindings {
	const keys = flowDataKeys(flow);
	const bindings: WaParamBindings = {};
	for (const { name } of params) {
		const kept = previous[name];
		if (kept && (kept.source === 'text' || keys.includes(kept.source))) {
			bindings[name] = kept;
		} else if (isWaDataKey(name) && keys.includes(name)) {
			bindings[name] = { source: name };
		}
	}
	return bindings;
}

/** Why these bindings can't fill the template for this flow, or null. */
export function bindingsProblem(
	flow: WaFlowKey,
	params: WaTemplateParam[],
	bindings: WaParamBindings
): string | null {
	const keys = flowDataKeys(flow);
	for (const { name } of params) {
		const binding = bindings[name];
		if (!binding) return `{{${name}}} için bir değer seçin.`;
		if (binding.source === 'text') {
			if (!binding.text.trim()) return `{{${name}}} için sabit metni yazın.`;
		} else if (!keys.includes(binding.source)) {
			return `{{${name}}} için seçilen bilgi bu mesajda yok.`;
		}
	}
	return null;
}

function jsonObject(value: WaJson | undefined): { [key: string]: WaJson | undefined } | null {
	return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

/** Parses stored or posted bindings, dropping anything malformed. */
export function bindingsFromJson(value: WaJson): WaParamBindings {
	const bindings: WaParamBindings = {};
	for (const [name, raw] of Object.entries(jsonObject(value) ?? {})) {
		const entry = jsonObject(raw);
		const source = entry?.source;
		const text = entry?.text;
		if (source === 'text' && typeof text === 'string') bindings[name] = { source, text };
		else if (typeof source === 'string' && isWaDataKey(source)) bindings[name] = { source };
	}
	return bindings;
}

/** Parses stored params, dropping anything malformed. */
export function paramsFromJson(value: WaJson): WaTemplateParam[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((raw) => {
		const entry = jsonObject(raw);
		const name = entry?.name;
		const example = entry?.example;
		return typeof name === 'string' && typeof example === 'string' ? [{ name, example }] : [];
	});
}

/**
 * The value of each param for one message. An empty value is sent as "-": WhatsApp
 * refuses an empty parameter.
 */
export function resolveParams(
	params: WaTemplateParam[],
	bindings: WaParamBindings,
	data: WaMessageData
): { name: string; value: string }[] {
	return params.map(({ name }) => {
		const binding = bindings[name];
		const raw = !binding
			? ''
			: binding.source === 'text'
				? binding.text
				: (data[binding.source] ?? '');
		// WhatsApp also refuses new lines and long runs of spaces inside a parameter
		const value = raw.replace(/\s+/g, ' ').trim();
		return { name, value: value || '-' };
	});
}

/**
 * A preview's values: each bound param filled from the sample data with the studio's
 * real name; unbound ones are left out so the preview marks them.
 */
export function previewValues(
	params: WaTemplateParam[],
	bindings: WaParamBindings,
	studio: string
): Record<string, string> {
	return Object.fromEntries(
		resolveParams(params, bindings, sampleData(studio))
			.filter((p) => bindings[p.name])
			.map((p) => [p.name, p.value])
	);
}

/** Sample values for a flow's preview, with the studio's real name. */
function sampleData(studio: string): WaMessageData {
	const data: WaMessageData = {};
	for (const key of Object.keys(WA_DATA_FIELDS) as WaDataKey[]) {
		data[key] = WA_DATA_FIELDS[key].sample;
	}
	if (studio) data.studio = studio;
	return data;
}

// --------------------------------------------------------------- the data

const MONTHS = [
	'Ocak',
	'Şubat',
	'Mart',
	'Nisan',
	'Mayıs',
	'Haziran',
	'Temmuz',
	'Ağustos',
	'Eylül',
	'Ekim',
	'Kasım',
	'Aralık'
];
const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

function slot(date: string, hour: number) {
	const [y, m, d] = date.split('-').map(Number);
	const day = new Date(Date.UTC(y, m - 1, d));
	const dateLabel = `${d} ${MONTHS[m - 1]}`;
	const time = `${String(hour).padStart(2, '0')}:00`;
	return { date: dateLabel, day: DAYS[day.getUTCDay()], time, dateTime: `${dateLabel} ${time}` };
}

function firstName(name: string): string {
	return name.trim().split(/\s+/)[0] ?? '';
}

/** The data of one schedule-change message. */
export function scheduleChangeData(change: {
	name: string;
	packageName: string;
	studio: string;
	oldDate: string;
	oldHour: number;
	newDate: string;
	newHour: number;
	cause?: string;
}): WaMessageData {
	const from = slot(change.oldDate, change.oldHour);
	const to = slot(change.newDate, change.newHour);
	return {
		name: change.name.trim(),
		first_name: firstName(change.name),
		package: change.packageName.trim(),
		studio: change.studio,
		old_date_time: from.dateTime,
		old_date: from.date,
		old_day: from.day,
		old_time: from.time,
		new_date_time: to.dateTime,
		new_date: to.date,
		new_day: to.day,
		new_time: to.time,
		cause: change.cause?.trim() ?? ''
	};
}

/** The data of one daily reminder. */
export function reminderData(lesson: {
	name: string;
	packageName: string;
	studio: string;
	date: string;
	hour: number;
	trainer: string;
	room: string;
}): WaMessageData {
	const at = slot(lesson.date, lesson.hour);
	return {
		name: lesson.name.trim(),
		first_name: firstName(lesson.name),
		package: lesson.packageName.trim(),
		studio: lesson.studio,
		date: at.date,
		day: at.day,
		time: at.time,
		trainer: lesson.trainer,
		room: lesson.room
	};
}

// --------------------------------------------------------- rows and the status sync

// The columns the app and the reminder read a template with
export const TEMPLATE_COLUMNS =
	'id, name, display_name, language, category, header, body, params, status, rejection_reason, vendor_template_id, replaces_id, updated_at';

export function templateFromRow(
	row: Omit<Tables<'pe_wa_templates'>, 'organization_id' | 'created_at'>
): WaTemplate {
	return {
		id: row.id,
		name: row.name,
		displayName: row.display_name,
		language: row.language,
		category: row.category as WaTemplateCategory,
		header: row.header,
		body: row.body,
		params: paramsFromJson(row.params),
		status: row.status as WaTemplateStatus,
		rejectionReason: row.rejection_reason,
		vendorTemplateId: row.vendor_template_id,
		replacesId: row.replaces_id,
		updatedAt: row.updated_at
	};
}

/** The three automatic messages; a missing row is a message switched off. */
export function flowsFromRows(
	rows: Pick<Tables<'pe_wa_flows'>, 'flow' | 'template_id' | 'params'>[]
): WaFlow[] {
	return WA_FLOW_KEYS.map((key) => {
		const row = rows.find((r) => r.flow === key);
		return {
			key,
			templateId: row?.template_id ?? null,
			params: row ? bindingsFromJson(row.params) : {}
		};
	});
}

export function sameContent(a: TemplateContent, b: TemplateContent): boolean {
	return (
		a.category === b.category &&
		(a.header ?? '') === (b.header ?? '') &&
		a.body === b.body &&
		JSON.stringify(a.params) === JSON.stringify(b.params)
	);
}

/** The account's copy of a studio template: by Meta's id, else by name and language. */
export function findAccountTemplate(
	template: WaTemplate,
	account: AccountTemplate[]
): AccountTemplate | undefined {
	return (
		account.find((a) => a.vendorTemplateId === template.vendorTemplateId) ??
		account.find((a) => a.name === template.name && a.language === template.language)
	);
}

/**
 * What the status sync takes over from the account, or null when nothing changed. A
 * template just submitted shows up in the account a few minutes late, still with its
 * previous text and status (tested 2026-11-12): while ours waits for review, an account
 * copy with other text is that stale state and must not overwrite the submission.
 */
export function syncPatch(
	template: WaTemplate,
	remote: AccountTemplate | undefined
): WaTemplateSyncPatch | null {
	if (!remote) return null;
	const contentDiffers = remote.namedParams && !sameContent(template, remote);
	if (template.status === 'pending' && contentDiffers) return null;
	if (
		!contentDiffers &&
		remote.status === template.status &&
		remote.rejectionReason === template.rejectionReason &&
		remote.vendorTemplateId === template.vendorTemplateId
	) {
		return null;
	}
	return {
		status: remote.status,
		rejectionReason: remote.rejectionReason,
		vendorTemplateId: remote.vendorTemplateId,
		content: contentDiffers
			? {
					category: remote.category,
					header: remote.header,
					body: remote.body,
					params: remote.params
				}
			: null
	};
}

/** The row update a sync patch makes. */
export function syncPatchRow(patch: WaTemplateSyncPatch): TablesUpdate<'pe_wa_templates'> {
	return {
		status: patch.status,
		rejection_reason: patch.rejectionReason,
		vendor_template_id: patch.vendorTemplateId,
		...(patch.content && {
			category: patch.content.category,
			header: patch.content.header,
			body: patch.content.body,
			params: patch.content.params
		})
	};
}

/**
 * Approved new versions take their template's place: each message using the old one moves
 * to the new one with its choices kept, and the old one goes once no message needs it. A
 * message whose choices don't fit the new text (a param it has no data for) stays on the
 * old template, which keeps sending, until an admin picks its values.
 */
export function planSwitches(templates: WaTemplate[], flows: WaFlow[]): WaSwitchPlan {
	const plan: WaSwitchPlan = { moves: [], removals: [] };
	for (const next of templates) {
		if (!next.replacesId || next.status !== 'approved') continue;
		const replaced = templates.find((t) => t.id === next.replacesId);
		if (!replaced) continue;
		let stays = false;
		for (const flow of flows.filter((f) => f.templateId === replaced.id)) {
			const params = defaultBindings(flow.key, next.params, flow.params);
			if (bindingsProblem(flow.key, next.params, params)) {
				stays = true;
				continue;
			}
			plan.moves.push({ key: flow.key, templateId: next.id, params });
		}
		if (!stays) plan.removals.push(replaced.id);
	}
	return plan;
}
