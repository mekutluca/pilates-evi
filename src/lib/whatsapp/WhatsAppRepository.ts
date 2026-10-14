import type {
	WhatsAppConfig,
	SendTemplateMessageParams,
	ChakraResponse,
	TemplateMessageData,
	TemplateMessageBody
} from '$lib/types/WhatsApp';
import { formatPhoneNumber } from '$lib/utils/phone-utils';

const BASE_URL = 'https://api.chakrahq.com/v1/ext';

/** Transport to the Chakra WhatsApp API. Message content lives in NotificationService. */
export class WhatsAppRepository {
	private config: WhatsAppConfig;

	constructor(config: WhatsAppConfig) {
		this.config = config;
	}

	async sendTemplateMessage(
		params: SendTemplateMessageParams
	): Promise<ChakraResponse<TemplateMessageData>> {
		const phone = formatPhoneNumber(params.phoneNumber);
		const url = `${BASE_URL}/plugin/whatsapp/${this.config.pluginId}/phoneNumber/${phone}/send-template-message`;

		const body: TemplateMessageBody = {
			templateName: params.templateName,
			whatsappPhoneNumberId: this.config.phoneNumberId
		};

		if (params.mapping) body.mapping = params.mapping;

		return this.request<TemplateMessageData>(url, body);
	}

	private async request<T>(url: string, body: TemplateMessageBody): Promise<ChakraResponse<T>> {
		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${this.config.apiKey}`
				},
				body: JSON.stringify(body)
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Chakra API error (${response.status}): ${errorText}`);
			}

			return (await response.json()) as ChakraResponse<T>;
		} catch (error) {
			if (error instanceof Error && error.message.startsWith('Chakra API error')) {
				throw error;
			}
			throw new Error(
				`Failed to connect to Chakra API: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}
}
