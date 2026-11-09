import type { SupabaseClientType } from '$lib/types/Supabase';
import type { Tables } from '$lib/types/database.types';
import {
	WA_FLOW_KEYS,
	bindingsFromJson,
	bindingsProblem,
	isWaFlowKey,
	paramsFromJson,
	uniqueTemplateName
} from '$lib/whatsapp/template-params';
import type {
	WaFlow,
	WaFlowKey,
	WaImportCandidate,
	WaTemplateInput,
	WaParamBindings,
	WaTemplate,
	WaTemplateCategory,
	WaTemplateStatus
} from '$lib/types/WhatsAppTemplate';
import {
	WhatsAppTemplateClient,
	WhatsAppTemplateError
} from '$lib/whatsapp/WhatsAppTemplateClient';
import type { AccountTemplate, TemplateContent } from '$lib/types/WhatsAppTemplate';
import { dbErrorMessage } from '$lib/server/db-errors';

const TEMPLATE_COLUMNS =
	'id, name, display_name, language, category, header, body, params, status, rejection_reason, vendor_template_id, updated_at';

const NOT_FOUND = 'Şablon bulunamadı. Sayfayı yenileyin.';
const NO_ACCOUNT =
	'WhatsApp hesabı tanımlı değil (PRIVATE_CHAKRA_WABA_ID). Şablonlar WhatsApp’a gönderilemiyor.';
const STUDIO_OFF =
	'Bu stüdyoda WhatsApp kapalı: şablonlar WhatsApp’a gönderilemez, mevcut şablonlar okunabilir.';
const FOREIGN_KEY_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';

function toTemplate(
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
		updatedAt: row.updated_at
	};
}

function sameContent(a: TemplateContent, b: TemplateContent): boolean {
	return (
		a.category === b.category &&
		(a.header ?? '') === (b.header ?? '') &&
		a.body === b.body &&
		JSON.stringify(a.params) === JSON.stringify(b.params)
	);
}

/** What the admin sees when the account refused or could not be reached. */
function vendorMessage(error: Error | null, fallback: string): string {
	if (error instanceof WhatsAppTemplateError && error.userMessage) return error.userMessage;
	console.error(fallback, error);
	return fallback;
}

/**
 * A studio's WhatsApp templates and the automatic messages bound to them. Template content
 * goes to the WhatsApp Business Account first and is stored only once the account took it,
 * so the studio's rows never claim a text WhatsApp has not seen.
 */
export class WaTemplateService {
	constructor(
		private supabase: SupabaseClientType,
		// Null: no account configured; reading still works, sending to WhatsApp does not
		private account: WhatsAppTemplateClient | null = WhatsAppTemplateClient.fromEnv(),
		// The studio's WhatsApp switch: the Demo studio may look but not submit templates
		private studioEnabled = true
	) {}

	/** Why templates can't be submitted to WhatsApp from this studio now, or null. */
	get submitBlocked(): string | null {
		if (!this.studioEnabled) return STUDIO_OFF;
		if (!this.account) return NO_ACCOUNT;
		return null;
	}

	async list(): Promise<WaTemplate[]> {
		const { data, error } = await this.supabase
			.from('pe_wa_templates')
			.select(TEMPLATE_COLUMNS)
			.order('display_name');
		if (error) throw new Error(dbErrorMessage(error, 'Şablonlar yüklenemedi.'));
		return (data ?? []).map(toTemplate);
	}

	/** The three automatic messages; a studio without a row for one doesn't send it. */
	async flows(): Promise<WaFlow[]> {
		const { data, error } = await this.supabase
			.from('pe_wa_flows')
			.select('flow, template_id, params');
		if (error) throw new Error(dbErrorMessage(error, 'Otomatik mesajlar yüklenemedi.'));
		return WA_FLOW_KEYS.map((key) => {
			const row = (data ?? []).find((r) => r.flow === key);
			return {
				key,
				templateId: row?.template_id ?? null,
				params: row ? bindingsFromJson(row.params) : {}
			};
		});
	}

	private async get(id: string): Promise<WaTemplate | null> {
		const { data } = await this.supabase
			.from('pe_wa_templates')
			.select(TEMPLATE_COLUMNS)
			.eq('id', id)
			.maybeSingle();
		return data ? toTemplate(data) : null;
	}

	/**
	 * Submits a new template for review and keeps it; returns an error message. Its
	 * WhatsApp name comes from the display name, made unique against the account, and it
	 * is always a UTILITY (bilgilendirme) template.
	 */
	async create(input: WaTemplateInput): Promise<string | null> {
		const blocked = this.submitBlocked;
		if (blocked || !this.account) return blocked ?? NO_ACCOUNT;

		let name: string;
		let submitted: { vendorTemplateId: string; status: WaTemplateStatus };
		try {
			const taken = new Set([
				...(await this.account.list()).map((t) => t.name),
				...(await this.list()).map((t) => t.name)
			]);
			name = uniqueTemplateName(input.displayName, taken);
			submitted = await this.account.create(name, 'tr', { ...input, category: 'UTILITY' });
		} catch (error) {
			return vendorMessage(
				error instanceof Error ? error : null,
				'WhatsApp şablonu almadı. Biraz sonra tekrar deneyin.'
			);
		}

		const { error } = await this.supabase.from('pe_wa_templates').insert({
			name,
			display_name: input.displayName,
			language: 'tr',
			category: 'UTILITY',
			header: input.header,
			body: input.body,
			params: input.params,
			status: submitted.status,
			vendor_template_id: submitted.vendorTemplateId
		});
		return error
			? dbErrorMessage(
					error,
					'Şablon WhatsApp’a gönderildi ama kaydedilemedi. "Durumları yenile" ile listeye alın.'
				)
			: null;
	}

	/**
	 * Saves a template. A new display name alone stays here; changed content goes back to
	 * WhatsApp for review (Meta's rule), and its messages wait until it is approved again.
	 */
	async update(
		id: string,
		input: WaTemplateInput
	): Promise<{ error: string | null; resubmitted: boolean }> {
		const current = await this.get(id);
		if (!current) return { error: NOT_FOUND, resubmitted: false };
		// Meta keeps an approved template's category; the app never changes it
		const content = { ...input, category: current.category };

		if (sameContent(current, content)) {
			const { data, error } = await this.supabase
				.from('pe_wa_templates')
				.update({ display_name: input.displayName })
				.eq('id', id)
				.select('id');
			if (error)
				return { error: dbErrorMessage(error, 'Şablon kaydedilemedi.'), resubmitted: false };
			return { error: data?.length ? null : NOT_FOUND, resubmitted: false };
		}

		if (current.status === 'pending') {
			return {
				error: 'Şablon WhatsApp onayında; onay sonuçlanınca düzenleyebilirsiniz.',
				resubmitted: false
			};
		}
		if (current.status === 'disabled') {
			return {
				error: 'WhatsApp bu şablonu kapattı; yerine yeni bir şablon oluşturun.',
				resubmitted: false
			};
		}
		const blocked = this.submitBlocked;
		if (blocked || !this.account) return { error: blocked ?? NO_ACCOUNT, resubmitted: false };
		if (!current.vendorTemplateId) {
			return {
				error: 'Şablonun WhatsApp kaydı bulunamadı. "Durumları yenile" ile eşleyin.',
				resubmitted: false
			};
		}

		try {
			await this.account.update(current.vendorTemplateId, content);
		} catch (error) {
			return {
				error: vendorMessage(
					error instanceof Error ? error : null,
					'WhatsApp değişikliği almadı. Biraz sonra tekrar deneyin.'
				),
				resubmitted: false
			};
		}

		const { error } = await this.supabase
			.from('pe_wa_templates')
			.update({
				display_name: input.displayName,
				header: input.header,
				body: input.body,
				params: input.params,
				status: 'pending',
				rejection_reason: null
			})
			.eq('id', id);
		if (error) {
			return {
				error: dbErrorMessage(
					error,
					'Değişiklik WhatsApp’a gönderildi ama kaydedilemedi. "Durumları yenile" ile güncelleyin.'
				),
				resubmitted: true
			};
		}
		return { error: null, resubmitted: true };
	}

	/**
	 * Takes a template off the studio's list. It stays in the WhatsApp account (Chakra
	 * cannot delete there) and can be added back.
	 */
	async remove(id: string): Promise<string | null> {
		const { data, error } = await this.supabase
			.from('pe_wa_templates')
			.delete()
			.eq('id', id)
			.select('id');
		if (error?.code === FOREIGN_KEY_VIOLATION) {
			return 'Bu şablon bir otomatik mesajda kullanılıyor. Önce o mesaja başka bir şablon seçin.';
		}
		if (error) return dbErrorMessage(error, 'Şablon kaldırılamadı.');
		return data?.length ? null : NOT_FOUND;
	}

	/**
	 * Brings the studio's templates in step with the account: status, rejection reason and
	 * content (an edit made in Chakra wins). Returns how many changed.
	 */
	async refresh(): Promise<{ error: string | null; changed: number }> {
		if (!this.account) return { error: NO_ACCOUNT, changed: 0 };
		let account: AccountTemplate[];
		try {
			account = await this.account.list();
		} catch (error) {
			return {
				error: vendorMessage(
					error instanceof Error ? error : null,
					'WhatsApp şablonları okunamadı. Biraz sonra tekrar deneyin.'
				),
				changed: 0
			};
		}

		const local = await this.list();
		let changed = 0;
		for (const template of local) {
			const remote =
				account.find((a) => a.vendorTemplateId === template.vendorTemplateId) ??
				account.find((a) => a.name === template.name && a.language === template.language);
			if (!remote) continue;

			const contentChanged = remote.namedParams && !sameContent(template, remote);
			if (
				!contentChanged &&
				remote.status === template.status &&
				remote.rejectionReason === template.rejectionReason &&
				remote.vendorTemplateId === template.vendorTemplateId
			) {
				continue;
			}
			const { error } = await this.supabase
				.from('pe_wa_templates')
				.update({
					status: remote.status,
					rejection_reason: remote.rejectionReason,
					vendor_template_id: remote.vendorTemplateId,
					...(contentChanged && {
						category: remote.category,
						header: remote.header,
						body: remote.body,
						params: remote.params
					})
				})
				.eq('id', template.id);
			if (error)
				return { error: dbErrorMessage(error, 'Şablon durumları kaydedilemedi.'), changed };
			changed++;
		}
		return { error: null, changed };
	}

	/** Account templates the studio doesn't list yet. */
	async importCandidates(): Promise<WaImportCandidate[] | string> {
		if (!this.account) return NO_ACCOUNT;
		let account: AccountTemplate[];
		try {
			account = await this.account.list();
		} catch (error) {
			return vendorMessage(
				error instanceof Error ? error : null,
				'WhatsApp şablonları okunamadı. Biraz sonra tekrar deneyin.'
			);
		}
		const local = await this.list();
		return account
			.filter((a) => !local.some((t) => t.name === a.name && t.language === a.language))
			.map((a) => ({
				vendorTemplateId: a.vendorTemplateId,
				name: a.name,
				language: a.language,
				header: a.header,
				body: a.body,
				params: a.params,
				status: a.status,
				category: a.category,
				// Positional ({{1}}) templates can't be filled from named data
				importable: a.namedParams
			}));
	}

	/** Adds account templates to the studio's list; returns how many were added. */
	async import(vendorTemplateIds: string[]): Promise<{ error: string | null; imported: number }> {
		const candidates = await this.importCandidates();
		if (typeof candidates === 'string') return { error: candidates, imported: 0 };
		const chosen = candidates.filter(
			(c) => c.importable && vendorTemplateIds.includes(c.vendorTemplateId)
		);
		if (chosen.length === 0) return { error: 'Eklenecek şablon seçilmedi.', imported: 0 };

		const { error } = await this.supabase.from('pe_wa_templates').insert(
			chosen.map((c) => ({
				name: c.name,
				display_name: c.name,
				language: c.language,
				category: c.category,
				header: c.header,
				body: c.body,
				params: c.params,
				status: c.status,
				vendor_template_id: c.vendorTemplateId
			}))
		);
		if (error?.code === UNIQUE_VIOLATION) {
			return { error: 'Şablonlardan biri zaten listede. Sayfayı yenileyin.', imported: 0 };
		}
		if (error) return { error: dbErrorMessage(error, 'Şablonlar eklenemedi.'), imported: 0 };
		return { error: null, imported: chosen.length };
	}

	/** Chooses a flow's template (null: don't send) and what fills each of its params. */
	async saveFlow(
		flow: WaFlowKey,
		templateId: string | null,
		bindings: WaParamBindings
	): Promise<string | null> {
		if (!isWaFlowKey(flow)) return 'Bilinmeyen mesaj.';
		let params: WaParamBindings = {};
		if (templateId) {
			const template = await this.get(templateId);
			if (!template) return NOT_FOUND;
			const problem = bindingsProblem(flow, template.params, bindings);
			if (problem) return problem;
			// Only the template's own params are kept
			params = Object.fromEntries(template.params.map((p) => [p.name, bindings[p.name]]));
		}
		const { error } = await this.supabase
			.from('pe_wa_flows')
			.upsert({ flow, template_id: templateId, params }, { onConflict: 'organization_id,flow' });
		return error ? dbErrorMessage(error, 'Mesaj ayarı kaydedilemedi.') : null;
	}
}
