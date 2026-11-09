import type {
	TemplateMapping,
	WaFlow,
	WaFlowKey,
	WaParamBindings,
	WaTemplate,
	WaTemplateParam
} from '$lib/types/WhatsAppTemplate';
import type Clock from '@lucide/svelte/icons/clock';

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
	name: string;
	packageName: string;
	oldDate: string;
	oldHour: number;
	newDate: string;
	newHour: number;
}

// Why NotificationService.notify sent nothing: the studio has WhatsApp off (the Demo
// studio), the message is switched off on the WhatsApp page, or its template is not
// approved (yet)
export type NotifySkip = 'studio_off' | 'flow_off' | 'not_approved';

// What NotificationService.notify did: messages sent and messages that failed
export interface NotifyResult {
	sent: number;
	failed: number;
	skipped: NotifySkip | null;
}

// Which automatic message announces a schedule change: the studio moved the lesson (with
// a cause), or the trainee asked for it.
export type ScheduleChangeMessage = { kind: 'system'; cause: string } | { kind: 'trainee_request' };

// The WhatsApp page (admin): the studio's templates and its automatic messages
export interface WhatsAppPageData {
	templates: WaTemplate[];
	flows: WaFlow[];
	studioName: string;
	// The studio's WhatsApp switch (off: nothing is sent, the Demo studio)
	studioEnabled: boolean;
	// Why templates can't be submitted to WhatsApp now, or null
	submitBlocked: string | null;
}

// The template a schedule-change message goes out with, as the studio set it up
export interface ChangeTemplate {
	name: string;
	params: WaTemplateParam[];
	bindings: WaParamBindings;
	approved: boolean;
}

export type ChangeFlowKey = Extract<
	WaFlowKey,
	'schedule_change_studio' | 'schedule_change_request'
>;

// What NotificationService needs to know about the studio
export interface StudioMessaging {
	enabled: boolean;
	studioName: string;
	// A missing flow is switched off (no template chosen)
	flows: Partial<Record<ChangeFlowKey, ChangeTemplate>>;
}

// Why an automatic message isn't going out, as its row on the WhatsApp page says it
export interface WaFlowIssue {
	label: string;
	variant: 'outline' | 'destructive';
	icon: typeof Clock;
}
