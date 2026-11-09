import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import type { SupabaseClientType } from '$lib/types/Supabase';
import type { WhatsAppPageData } from '$lib/types/WhatsApp';
import { requireAdmin } from '$lib/server/permissions';
import { orNull } from '$lib/server/streaming';
import { getFormDataString, getFormDataUuid } from '$lib/utils/form-utils';
import { WaTemplateService } from '$lib/server/services/wa-template-service';
import { parseFlowForm, parseTemplateForm } from '$lib/server/wa-template-form';
import { WhatsAppTemplateClient } from '$lib/whatsapp/WhatsAppTemplateClient';

const NOT_FOUND = 'Şablon bulunamadı. Sayfayı yenileyin.';

async function serviceFor(supabase: SupabaseClientType, organizationId: string | null) {
	const { data: studio } = organizationId
		? await supabase
				.from('pe_organizations')
				.select('name, whatsapp_enabled')
				.eq('id', organizationId)
				.maybeSingle()
		: { data: null };
	const enabled = studio?.whatsapp_enabled === true;
	return {
		service: new WaTemplateService(supabase, WhatsAppTemplateClient.fromEnv(), enabled),
		studioName: studio?.name ?? '',
		enabled
	};
}

async function loadPage(
	supabase: SupabaseClientType,
	organizationId: string | null
): Promise<WhatsAppPageData> {
	const { service, studioName, enabled } = await serviceFor(supabase, organizationId);
	let templates = await service.list();
	// Meta answers a submitted template within minutes: while one waits, ask on each visit
	if (enabled && templates.some((t) => t.status === 'pending')) {
		const { changed } = await service.refresh();
		if (changed > 0) templates = await service.list();
	}
	return {
		templates,
		flows: await service.flows(),
		studioName,
		studioEnabled: enabled,
		submitBlocked: service.submitBlocked
	};
}

export const load: PageServerLoad = async ({ locals: { supabase, organizationId } }) => {
	return { page: orNull(loadPage(supabase, organizationId), 'whatsapp') };
};

export const actions: Actions = {
	createTemplate: async ({ request, locals: { supabase, user, userRole, organizationId } }) => {
		const denied = requireAdmin(user, userRole);
		if (denied) return denied;

		const input = parseTemplateForm(await request.formData());
		if (typeof input === 'string') return fail(400, { success: false, message: input });

		const { service } = await serviceFor(supabase, organizationId);
		const createError = await service.create(input);
		if (createError) return fail(400, { success: false, message: createError });
		return {
			success: true,
			message: 'Şablon WhatsApp onayına gönderildi. Onay genelde birkaç dakika sürer.'
		};
	},

	updateTemplate: async ({ request, locals: { supabase, user, userRole, organizationId } }) => {
		const denied = requireAdmin(user, userRole);
		if (denied) return denied;

		const formData = await request.formData();
		const id = getFormDataUuid(formData, 'templateId');
		if (!id) return fail(400, { success: false, message: NOT_FOUND });
		const input = parseTemplateForm(formData);
		if (typeof input === 'string') return fail(400, { success: false, message: input });

		const { service } = await serviceFor(supabase, organizationId);
		const { error, resubmitted } = await service.update(id, input);
		if (error) return fail(400, { success: false, message: error });
		return {
			success: true,
			message: resubmitted ? 'Değişiklik WhatsApp onayına gönderildi.' : 'Şablon kaydedildi.'
		};
	},

	removeTemplate: async ({ request, locals: { supabase, user, userRole, organizationId } }) => {
		const denied = requireAdmin(user, userRole);
		if (denied) return denied;

		const id = getFormDataUuid(await request.formData(), 'templateId');
		if (!id) return fail(400, { success: false, message: NOT_FOUND });

		const { service } = await serviceFor(supabase, organizationId);
		const removeError = await service.remove(id);
		if (removeError) return fail(400, { success: false, message: removeError });
		return { success: true, message: 'Şablon listeden kaldırıldı.' };
	},

	refresh: async ({ locals: { supabase, user, userRole, organizationId } }) => {
		const denied = requireAdmin(user, userRole);
		if (denied) return denied;

		const { service } = await serviceFor(supabase, organizationId);
		const { error, changed } = await service.refresh();
		if (error) return fail(400, { success: false, message: error });
		return {
			success: true,
			message: changed > 0 ? `${changed} şablon güncellendi.` : 'Şablonlar WhatsApp ile aynı.'
		};
	},

	importCandidates: async ({ locals: { supabase, user, userRole, organizationId } }) => {
		const denied = requireAdmin(user, userRole);
		if (denied) return denied;

		const { service } = await serviceFor(supabase, organizationId);
		const candidates = await service.importCandidates();
		if (typeof candidates === 'string') return fail(400, { success: false, message: candidates });
		return { success: true, candidates };
	},

	importTemplates: async ({ request, locals: { supabase, user, userRole, organizationId } }) => {
		const denied = requireAdmin(user, userRole);
		if (denied) return denied;

		const ids = getFormDataString(await request.formData(), 'vendorTemplateIds')
			.split(',')
			.map((id) => id.trim())
			.filter(Boolean);

		const { service } = await serviceFor(supabase, organizationId);
		const { error, imported } = await service.import(ids);
		if (error) return fail(400, { success: false, message: error });
		return { success: true, message: `${imported} şablon eklendi.` };
	},

	saveFlow: async ({ request, locals: { supabase, user, userRole, organizationId } }) => {
		const denied = requireAdmin(user, userRole);
		if (denied) return denied;

		const input = parseFlowForm(await request.formData());
		if (typeof input === 'string') return fail(400, { success: false, message: input });

		const { service } = await serviceFor(supabase, organizationId);
		const saveError = await service.saveFlow(input.flow, input.templateId, input.bindings);
		if (saveError) return fail(400, { success: false, message: saveError });
		return {
			success: true,
			message: input.templateId ? 'Mesaj ayarı kaydedildi.' : 'Bu mesaj artık gönderilmeyecek.'
		};
	}
};
