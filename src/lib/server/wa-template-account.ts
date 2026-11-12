import { env } from '$env/dynamic/private';
import {
	DEFAULT_WA_API_VERSION,
	WhatsAppTemplateClient
} from '$lib/whatsapp/WhatsAppTemplateClient';

/** The studio WhatsApp Business Account; null when it is not configured (PRIVATE_CHAKRA_WABA_ID). */
export function templateAccountFromEnv(): WhatsAppTemplateClient | null {
	const apiKey = env.PRIVATE_CHAKRA_API_KEY;
	const wabaId = env.PRIVATE_CHAKRA_WABA_ID;
	if (!apiKey || !wabaId) return null;
	return new WhatsAppTemplateClient({
		apiKey,
		wabaId,
		apiVersion: env.PRIVATE_CHAKRA_WHATSAPP_API_VERSION || DEFAULT_WA_API_VERSION
	});
}
