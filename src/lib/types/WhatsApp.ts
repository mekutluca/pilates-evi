export interface TemplateMapping {
	schemaPropertyName: string;
	schemaPropertyValue: string;
}

export interface WhatsAppConfig {
	apiKey: string;
	pluginId: string;
	phoneNumberId: string;
	apiVersion: string;
}

export interface SendTemplateMessageParams {
	phoneNumber: string;
	templateName: string;
	mapping?: TemplateMapping[];
}

export interface SendTextMessageParams {
	phoneNumber: string;
	text: string;
}

export interface TemplateMessageBody {
	templateName: string;
	whatsappPhoneNumberId: string;
	mapping?: TemplateMapping[];
}

export interface SessionMessageBody {
	messaging_product: 'whatsapp';
	recipient_type: 'individual';
	to: string;
	type: 'text';
	text: { body: string };
}

export interface ChakraResponse<T> {
	_data: T;
	_meta: Record<string, never>;
	_errors?: string[];
}

export interface TemplateMessageData {
	id: string;
	createdAt: number;
	updatedAt: number;
	externalId: string;
	deliveryStatus: string;
	direction: string;
	text: string;
}

export interface SessionMessageData {
	whatsappMessageId: string;
}
