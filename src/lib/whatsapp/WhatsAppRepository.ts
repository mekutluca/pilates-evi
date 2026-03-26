import type {
	WhatsAppConfig,
	SendTemplateMessageParams,
	SendTextMessageParams,
	ChakraResponse,
	TemplateMessageData,
	SessionMessageData,
	TemplateMessageBody,
	SessionMessageBody
} from '$lib/types/WhatsApp';

const BASE_URL = 'https://api.chakrahq.com/v1/ext';

export class WhatsAppRepository {
	private config: WhatsAppConfig;

	constructor(config: WhatsAppConfig) {
		this.config = config;
	}

	async sendTemplateMessage(
		params: SendTemplateMessageParams
	): Promise<ChakraResponse<TemplateMessageData>> {
		const phone = this.formatPhoneNumber(params.phoneNumber);
		const url = `${BASE_URL}/plugin/whatsapp/${this.config.pluginId}/phoneNumber/${phone}/send-template-message`;

		const body: TemplateMessageBody = {
			templateName: params.templateName,
			whatsappPhoneNumberId: this.config.phoneNumberId
		};

		if (params.mapping) body.mapping = params.mapping;

		return this.request<TemplateMessageData>(url, body);
	}

	async sendTextMessage(
		params: SendTextMessageParams
	): Promise<ChakraResponse<SessionMessageData>> {
		const phone = this.formatPhoneNumber(params.phoneNumber);
		const url = `${BASE_URL}/plugin/whatsapp/${this.config.pluginId}/api/${this.config.apiVersion}/${this.config.phoneNumberId}/messages`;

		const body: SessionMessageBody = {
			messaging_product: 'whatsapp',
			recipient_type: 'individual',
			to: phone,
			type: 'text',
			text: { body: params.text }
		};

		return this.request<SessionMessageData>(url, body);
	}

	private formatPhoneNumber(phone: string): string {
		const digits = phone.replace(/\D/g, '');

		if (digits.startsWith('90') && digits.length === 12) {
			return digits;
		}

		if (digits.length === 10 && digits.startsWith('5')) {
			return `90${digits}`;
		}

		return digits;
	}

	private async request<T>(
		url: string,
		body: TemplateMessageBody | SessionMessageBody
	): Promise<ChakraResponse<T>> {
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
