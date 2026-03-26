import {
	PRIVATE_CHAKRA_API_KEY,
	PRIVATE_CHAKRA_PLUGIN_ID,
	PRIVATE_CHAKRA_WHATSAPP_PHONE_NUMBER_ID,
	PRIVATE_CHAKRA_WHATSAPP_API_VERSION
} from '$env/static/private';
import { WhatsAppRepository } from './WhatsAppRepository';

export { WhatsAppRepository };

let instance: WhatsAppRepository | null = null;

export function getWhatsAppRepository(): WhatsAppRepository {
	if (!instance) {
		instance = new WhatsAppRepository({
			apiKey: PRIVATE_CHAKRA_API_KEY,
			pluginId: PRIVATE_CHAKRA_PLUGIN_ID,
			phoneNumberId: PRIVATE_CHAKRA_WHATSAPP_PHONE_NUMBER_ID,
			apiVersion: PRIVATE_CHAKRA_WHATSAPP_API_VERSION
		});
	}
	return instance;
}
