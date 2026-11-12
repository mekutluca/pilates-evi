import type { SupabaseClientType } from '$lib/types/Supabase';
import {
	TEMPLATE_COLUMNS,
	bindingsProblem,
	findAccountTemplate,
	flowsFromRows,
	isWaFlowKey,
	planSwitches,
	sameContent,
	syncPatch,
	syncPatchRow,
	templateFromRow,
	uniqueTemplateName
} from '$lib/whatsapp/template-params';
import type {
	AccountTemplate,
	WaFlow,
	WaFlowKey,
	WaImportCandidate,
	WaParamBindings,
	WaTemplate,
	WaTemplateCategory,
	WaTemplateInput,
	WaTemplateSaveOutcome,
	WaTemplateStatus
} from '$lib/types/WhatsAppTemplate';
import {
	WhatsAppTemplateClient,
	WhatsAppTemplateError
} from '$lib/whatsapp/WhatsAppTemplateClient';
import { templateAccountFromEnv } from '$lib/server/wa-template-account';
import { dbErrorMessage } from '$lib/server/db-errors';

const NOT_FOUND = 'Şablon bulunamadı. Sayfayı yenileyin.';
const NO_ACCOUNT =
	'WhatsApp hesabı tanımlı değil (PRIVATE_CHAKRA_WABA_ID). Şablonlar WhatsApp’a gönderilemiyor.';
const STUDIO_OFF =
	'Bu stüdyoda WhatsApp kapalı: şablonlar WhatsApp’a gönderilemez, mevcut şablonlar okunabilir.';
const READ_FAILED = 'WhatsApp şablonları okunamadı. Biraz sonra tekrar deneyin.';
const FOREIGN_KEY_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';

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
 *
 * An approved template's text is never edited in place: Meta can't send a template while an
 * edit is reviewed (#132001), so a new text goes out as a new version that replaces the old
 * one once approved (`refresh`, and the daily reminder before it sends).
 */
export class WaTemplateService {
	constructor(
		private supabase: SupabaseClientType,
		// Null: no account configured; reading still works, sending to WhatsApp does not
		private account: WhatsAppTemplateClient | null = templateAccountFromEnv(),
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
		return (data ?? []).map(templateFromRow);
	}

	/** The three automatic messages; a studio without a row for one doesn't send it. */
	async flows(): Promise<WaFlow[]> {
		const { data, error } = await this.supabase
			.from('pe_wa_flows')
			.select('flow, template_id, params');
		if (error) throw new Error(dbErrorMessage(error, 'Otomatik mesajlar yüklenemedi.'));
		return flowsFromRows(data ?? []);
	}

	private async get(id: string): Promise<WaTemplate | null> {
		const { data } = await this.supabase
			.from('pe_wa_templates')
			.select(TEMPLATE_COLUMNS)
			.eq('id', id)
			.maybeSingle();
		return data ? templateFromRow(data) : null;
	}

	/**
	 * Submits a new template for review and keeps it; returns an error message. Its
	 * WhatsApp name comes from the display name, made unique against the account, and it
	 * is always a UTILITY (bilgilendirme) template.
	 */
	async create(input: WaTemplateInput): Promise<string | null> {
		return this.submit(input, 'UTILITY', null);
	}

	/**
	 * Saves a template. A new display name alone stays here. New text for an approved
	 * template becomes a new version, so the approved one keeps sending until it is
	 * replaced; other templates (rejected, paused) take the edit and go back to review.
	 */
	async update(
		id: string,
		input: WaTemplateInput
	): Promise<{ error: string | null; outcome: WaTemplateSaveOutcome }> {
		const current = await this.get(id);
		if (!current) return { error: NOT_FOUND, outcome: 'saved' };
		// Meta keeps an approved template's category; the app never changes it
		const content = { ...input, category: current.category };

		if (sameContent(current, content)) {
			const { data, error } = await this.supabase
				.from('pe_wa_templates')
				.update({ display_name: input.displayName })
				.eq('id', id)
				.select('id');
			if (error) return { error: dbErrorMessage(error, 'Şablon kaydedilemedi.'), outcome: 'saved' };
			return { error: data?.length ? null : NOT_FOUND, outcome: 'saved' };
		}

		if (current.status === 'approved') return this.newVersion(current, input);
		if (current.status === 'pending') {
			return {
				error: 'Şablon WhatsApp onayında; onay sonuçlanınca düzenleyebilirsiniz.',
				outcome: 'saved'
			};
		}
		if (current.status === 'disabled') {
			return {
				error: 'WhatsApp bu şablonu kapattı; yerine yeni bir şablon oluşturun.',
				outcome: 'saved'
			};
		}
		return this.resubmit(current, input);
	}

	/** New text for an approved template: a version that replaces it once approved. */
	private async newVersion(
		current: WaTemplate,
		input: WaTemplateInput
	): Promise<{ error: string | null; outcome: WaTemplateSaveOutcome }> {
		const { data: waitingRow } = await this.supabase
			.from('pe_wa_templates')
			.select(TEMPLATE_COLUMNS)
			.eq('replaces_id', current.id)
			.maybeSingle();
		if (waitingRow) {
			const waiting = templateFromRow(waitingRow);
			// A rejected or paused new version takes the newer text instead
			if (waiting.status === 'rejected' || waiting.status === 'paused') {
				return this.resubmit(waiting, input);
			}
			return {
				error:
					waiting.status === 'approved'
						? 'Yeni metin onaylandı; önce onu kullanan mesajlarda eksik bilgileri seçin.'
						: 'Bu şablonun yeni metni zaten onay bekliyor. Sonuçlanınca tekrar değiştirebilirsiniz.',
				outcome: 'saved'
			};
		}
		const error = await this.submit(input, current.category, current);
		return { error, outcome: 'new_version' };
	}

	/** Submits a template to the account and stores it; returns an error message. */
	private async submit(
		input: WaTemplateInput,
		category: WaTemplateCategory,
		replaces: WaTemplate | null
	): Promise<string | null> {
		const blocked = this.submitBlocked;
		if (blocked || !this.account) return blocked ?? NO_ACCOUNT;

		const language = replaces?.language ?? 'tr';
		let name: string;
		let submitted: { vendorTemplateId: string; status: WaTemplateStatus };
		try {
			const taken = new Set([
				...(await this.account.list()).map((t) => t.name),
				...(await this.list()).map((t) => t.name)
			]);
			// A new version is named after the template it replaces: x, then x_2, x_3
			name = uniqueTemplateName(replaces?.name.replace(/_\d+$/, '') ?? input.displayName, taken);
			submitted = await this.account.create(name, language, { ...input, category });
		} catch (error) {
			return vendorMessage(
				error instanceof Error ? error : null,
				'WhatsApp şablonu almadı. Biraz sonra tekrar deneyin.'
			);
		}

		const { error } = await this.supabase.from('pe_wa_templates').insert({
			name,
			display_name: input.displayName,
			language,
			category,
			header: input.header,
			body: input.body,
			params: input.params,
			status: submitted.status,
			vendor_template_id: submitted.vendorTemplateId,
			replaces_id: replaces?.id ?? null
		});
		return error
			? dbErrorMessage(
					error,
					'Şablon WhatsApp’a gönderildi ama kaydedilemedi. "Durumları yenile" ile listeye alın.'
				)
			: null;
	}

	/** Edits a template nothing sends with (rejected, paused) and sends it back to review. */
	private async resubmit(
		current: WaTemplate,
		input: WaTemplateInput
	): Promise<{ error: string | null; outcome: WaTemplateSaveOutcome }> {
		const blocked = this.submitBlocked;
		if (blocked || !this.account) return { error: blocked ?? NO_ACCOUNT, outcome: 'saved' };
		if (!current.vendorTemplateId) {
			return {
				error: 'Şablonun WhatsApp kaydı bulunamadı. "Durumları yenile" ile eşleyin.',
				outcome: 'saved'
			};
		}

		try {
			await this.account.update(current.vendorTemplateId, {
				...input,
				category: current.category
			});
		} catch (error) {
			return {
				error: vendorMessage(
					error instanceof Error ? error : null,
					'WhatsApp değişikliği almadı. Biraz sonra tekrar deneyin.'
				),
				outcome: 'saved'
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
			.eq('id', current.id);
		if (error) {
			return {
				error: dbErrorMessage(
					error,
					'Değişiklik WhatsApp’a gönderildi ama kaydedilemedi. "Durumları yenile" ile güncelleyin.'
				),
				outcome: 'resubmitted'
			};
		}
		return { error: null, outcome: 'resubmitted' };
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
	 * Brings the studio's templates in step with the account (status, rejection reason, and
	 * text edited in Chakra), then lets approved new versions replace their templates.
	 * Returns how many templates changed and how many messages moved to a new version.
	 */
	async refresh(): Promise<{ error: string | null; changed: number; switched: number }> {
		if (!this.account) return { error: NO_ACCOUNT, changed: 0, switched: 0 };
		let account: AccountTemplate[];
		try {
			account = await this.account.list();
		} catch (error) {
			return {
				error: vendorMessage(error instanceof Error ? error : null, READ_FAILED),
				changed: 0,
				switched: 0
			};
		}

		let changed = 0;
		for (const template of await this.list()) {
			const patch = syncPatch(template, findAccountTemplate(template, account));
			if (!patch) continue;
			const { error } = await this.supabase
				.from('pe_wa_templates')
				.update(syncPatchRow(patch))
				.eq('id', template.id);
			if (error) {
				return {
					error: dbErrorMessage(error, 'Şablon durumları kaydedilemedi.'),
					changed,
					switched: 0
				};
			}
			changed++;
		}

		const plan = planSwitches(await this.list(), await this.flows());
		for (const flow of plan.moves) {
			const { error } = await this.supabase
				.from('pe_wa_flows')
				.update({ template_id: flow.templateId, params: flow.params })
				.eq('flow', flow.key);
			if (error) {
				return {
					error: dbErrorMessage(error, 'Mesajlar yeni metne geçirilemedi.'),
					changed,
					switched: 0
				};
			}
		}
		if (plan.removals.length > 0) {
			const { error } = await this.supabase
				.from('pe_wa_templates')
				.delete()
				.in('id', plan.removals);
			if (error) {
				return {
					error: dbErrorMessage(error, 'Eski metin listeden kaldırılamadı.'),
					changed,
					switched: plan.moves.length
				};
			}
		}
		return { error: null, changed, switched: plan.moves.length };
	}

	/** Account templates the studio doesn't list yet. */
	async importCandidates(): Promise<WaImportCandidate[] | string> {
		if (!this.account) return NO_ACCOUNT;
		let account: AccountTemplate[];
		try {
			account = await this.account.list();
		} catch (error) {
			return vendorMessage(error instanceof Error ? error : null, READ_FAILED);
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
