export interface TemplateMapping {
	schemaPropertyName: string;
	schemaPropertyValue: string;
}

export interface WhatsAppConfig {
	apiKey: string;
	pluginId: string;
	phoneNumberId: string;
}

export interface SendTemplateMessageParams {
	phoneNumber: string;
	templateName: string;
	mapping?: TemplateMapping[];
}

export interface TemplateMessageBody {
	templateName: string;
	whatsappPhoneNumberId: string;
	mapping?: TemplateMapping[];
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

// One trainee's lesson moving from one slot to another.
export interface ScheduleChange {
	phone: string;
	packageName: string;
	oldDate: string;
	oldHour: number;
	newDate: string;
	newHour: number;
}

// Which WhatsApp template a schedule change is announced with: the studio moved the
// lesson (with a cause), or the trainee asked for it.
export type ScheduleChangeMessage = { kind: 'system'; cause: string } | { kind: 'trainee_request' };

// One daily reminder (pe-daily-reminder edge function)
export interface DailyReminder {
	traineePhone: string;
	packageName: string;
	formattedTime: string;
}
