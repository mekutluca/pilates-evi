import { env } from '$env/dynamic/private';
import type {
	AccountTemplate,
	ChakraEnvelope,
	MetaTemplate,
	MetaTemplateComponent,
	MetaTemplatePage,
	TemplateContent,
	WaTemplateCategory,
	WaTemplateStatus
} from '$lib/types/WhatsAppTemplate';

const BASE_URL = 'https://api.chakrahq.com/v1/ext';
const DEFAULT_API_VERSION = 'v19.0';
const PAGE_SIZE = 100;
const MAX_PAGES = 20;

/** Thrown with Meta's own explanation when the account refuses a request. */
export class WhatsAppTemplateError extends Error {
	constructor(
		message: string,
		// Meta's user-facing reason (Turkish when the account is), if it gave one
		readonly userMessage: string | null
	) {
		super(message);
	}
}

function normalizeStatus(status: string | undefined): WaTemplateStatus {
	switch ((status ?? '').toUpperCase()) {
		case 'APPROVED':
			return 'approved';
		case 'REJECTED':
			return 'rejected';
		case 'PAUSED':
			return 'paused';
		case 'DISABLED':
		case 'DELETED':
		case 'PENDING_DELETION':
		case 'ARCHIVED':
			return 'disabled';
		default:
			// PENDING, IN_APPEAL, LIMIT_EXCEEDED, …
			return 'pending';
	}
}

function normalizeCategory(category: string | undefined): WaTemplateCategory {
	return category === 'MARKETING' || category === 'AUTHENTICATION' ? category : 'UTILITY';
}

function toAccountTemplate(template: MetaTemplate): AccountTemplate | null {
	const body = template.components?.find((c) => c.type === 'BODY');
	if (!template.id || !body?.text) return null;
	const header = template.components?.find((c) => c.type === 'HEADER' && c.format === 'TEXT');
	const named = body.example?.body_text_named_params ?? [];
	return {
		vendorTemplateId: template.id,
		name: template.name,
		language: template.language ?? 'tr',
		category: normalizeCategory(template.category),
		header: header?.text ?? null,
		body: body.text,
		params: named.map((p) => ({ name: p.param_name, example: p.example })),
		status: normalizeStatus(template.status),
		rejectionReason:
			template.rejected_reason && template.rejected_reason !== 'NONE'
				? template.rejected_reason
				: null,
		namedParams: template.parameter_format === 'NAMED' || !/\{\{\d+\}\}/.test(body.text)
	};
}

function components(content: TemplateContent): MetaTemplateComponent[] {
	const parts: MetaTemplateComponent[] = [];
	if (content.header) parts.push({ type: 'HEADER', format: 'TEXT', text: content.header });
	parts.push({
		type: 'BODY',
		text: content.body,
		...(content.params.length > 0 && {
			example: {
				body_text_named_params: content.params.map((p) => ({
					param_name: p.name,
					example: p.example
				}))
			}
		})
	});
	return parts;
}

/** Meta's explanation inside Chakra's error text, when there is one. */
function metaUserMessage(text: string): string | null {
	try {
		const parsed = JSON.parse(text) as {
			error?: { error_user_msg?: string; error_user_title?: string; message?: string };
			_errors?: { error?: { error_user_msg?: string } }[];
		};
		const error = parsed.error ?? parsed._errors?.[0]?.error;
		return error?.error_user_msg ?? null;
	} catch {
		return null;
	}
}

/**
 * The studio WhatsApp Business Account's message templates, through Chakra's pass-through
 * to Meta. Sending lives in WhatsAppRepository.
 */
export class WhatsAppTemplateClient {
	private constructor(
		private apiKey: string,
		private wabaId: string,
		private apiVersion: string
	) {}

	/** Null when the account is not configured (PRIVATE_CHAKRA_WABA_ID). */
	static fromEnv(): WhatsAppTemplateClient | null {
		const apiKey = env.PRIVATE_CHAKRA_API_KEY;
		const wabaId = env.PRIVATE_CHAKRA_WABA_ID;
		if (!apiKey || !wabaId) return null;
		return new WhatsAppTemplateClient(
			apiKey,
			wabaId,
			env.PRIVATE_CHAKRA_WHATSAPP_API_VERSION || DEFAULT_API_VERSION
		);
	}

	private get graphUrl() {
		return `${BASE_URL}/plugin/whatsapp/api/${this.apiVersion}`;
	}

	/** Every template in the account, following pages. */
	async list(): Promise<AccountTemplate[]> {
		const templates: AccountTemplate[] = [];
		let after: string | undefined;
		for (let page = 0; page < MAX_PAGES; page++) {
			const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
			if (after) query.set('after', after);
			const result = await this.request<MetaTemplatePage>(
				`${this.graphUrl}/${this.wabaId}/message_templates?${query}`,
				'GET'
			);
			for (const raw of result.data ?? []) {
				const template = toAccountTemplate(raw);
				if (template) templates.push(template);
			}
			after = result.paging?.cursors?.after;
			if (!result.paging?.next || !after || (result.data ?? []).length === 0) break;
		}
		return templates;
	}

	/** Submits a new template for review; returns Meta's id and first status. */
	async create(
		name: string,
		language: string,
		content: TemplateContent
	): Promise<{ vendorTemplateId: string; status: WaTemplateStatus }> {
		const result = await this.request<{ id: string; status?: string }>(
			`${this.graphUrl}/${this.wabaId}/message_templates`,
			'POST',
			{
				name,
				language,
				category: content.category,
				parameter_format: 'NAMED',
				components: components(content)
			}
		);
		return { vendorTemplateId: result.id, status: normalizeStatus(result.status) };
	}

	/** Submits changed content; an approved template goes back to review. */
	async update(vendorTemplateId: string, content: TemplateContent): Promise<void> {
		await this.request(`${this.graphUrl}/${vendorTemplateId}`, 'POST', {
			category: content.category,
			parameter_format: 'NAMED',
			components: components(content)
		});
	}

	private async request<T>(url: string, method: 'GET' | 'POST', body?: object): Promise<T> {
		let response: Response;
		try {
			response = await fetch(url, {
				method,
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
					...(body && { 'Content-Type': 'application/json' })
				},
				body: body ? JSON.stringify(body) : undefined
			});
		} catch (error) {
			throw new WhatsAppTemplateError(
				`Chakra unreachable: ${error instanceof Error ? error.message : String(error)}`,
				null
			);
		}
		const text = await response.text();
		if (!response.ok) {
			throw new WhatsAppTemplateError(
				`Chakra API error (${response.status}): ${text}`,
				metaUserMessage(text)
			);
		}
		const json = JSON.parse(text) as ChakraEnvelope<T> & T;
		return json._data ?? json;
	}
}
