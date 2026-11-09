import { getFormDataString, getFormDataUuid } from '$lib/utils/form-utils';
import {
	HEADER_MAX_LENGTH,
	bindingsFromJson,
	bodyProblem,
	isWaFlowKey,
	paramsFromJson,
	paramsProblem,
	syncParams
} from '$lib/whatsapp/template-params';
import type {
	WaFlowKey,
	WaJson,
	WaParamBindings,
	WaTemplateInput
} from '$lib/types/WhatsAppTemplate';

function jsonField(formData: FormData, key: string): WaJson {
	try {
		return JSON.parse(getFormDataString(formData, key) || 'null') as WaJson;
	} catch {
		return null;
	}
}

/**
 * The template form (Şablon). Returns an error message when Meta would refuse it, so
 * nothing invalid reaches the account.
 */
export function parseTemplateForm(formData: FormData): WaTemplateInput | string {
	const displayName = getFormDataString(formData, 'displayName').trim();
	if (!displayName) return 'Şablona bir ad verin.';
	if (displayName.length > 120) return 'Ad en fazla 120 karakter olabilir.';

	const header = getFormDataString(formData, 'header').trim() || null;
	if (header && header.length > HEADER_MAX_LENGTH) {
		return `Mesaj başlığı en fazla ${HEADER_MAX_LENGTH} karakter olabilir.`;
	}
	if (header?.includes('{{')) return 'Mesaj başlığında değişken kullanılamaz.';

	const body = getFormDataString(formData, 'body').replace(/\r\n/g, '\n');
	const problem = bodyProblem(body);
	if (problem) return problem;
	const params = syncParams(body, paramsFromJson(jsonField(formData, 'params'))).map((p) => ({
		name: p.name,
		example: p.example.trim()
	}));
	const missing = paramsProblem(params);
	if (missing) return missing;

	return { displayName, header, body: body.trim(), params };
}

/** The automatic-message form: its template (empty = don't send) and param bindings. */
export function parseFlowForm(
	formData: FormData
): { flow: WaFlowKey; templateId: string | null; bindings: WaParamBindings } | string {
	const flow = getFormDataString(formData, 'flow');
	if (!isWaFlowKey(flow)) return 'Bilinmeyen mesaj. Sayfayı yenileyin.';
	const rawTemplate = getFormDataString(formData, 'templateId');
	const templateId = rawTemplate ? getFormDataUuid(formData, 'templateId') : null;
	if (rawTemplate && !templateId) return 'Şablon bulunamadı. Sayfayı yenileyin.';
	return { flow, templateId, bindings: bindingsFromJson(jsonField(formData, 'bindings')) };
}
