// WhatsApp templates, the automatic messages that send them, and the data their named
// parameters are filled with. The pe-daily-reminder edge function loads these through
// `$lib/whatsapp/template-params.ts`: keep this file free of imports so Deno can read it.

export type WaTemplateStatus = 'pending' | 'approved' | 'rejected' | 'paused' | 'disabled';
export type WaTemplateCategory = 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';

// One named parameter, `{{name}}` in the body; Meta needs an example for each
// (A type alias, not an interface, so it is assignable to Supabase's Json)
export type WaTemplateParam = {
	name: string;
	example: string;
};

export interface WaTemplate {
	id: string;
	name: string;
	displayName: string;
	language: string;
	category: WaTemplateCategory;
	header: string | null;
	body: string;
	params: WaTemplateParam[];
	status: WaTemplateStatus;
	rejectionReason: string | null;
	vendorTemplateId: string | null;
	// A new version of an approved template: it takes that template's place once approved
	replacesId: string | null;
	updatedAt: string;
}

// What the admin writes; the WhatsApp name and the category (always UTILITY) are the app's
export interface WaTemplateInput {
	displayName: string;
	header: string | null;
	body: string;
	params: WaTemplateParam[];
}

// A template in the WhatsApp account that the studio doesn't list yet
export interface WaImportCandidate {
	vendorTemplateId: string;
	name: string;
	language: string;
	category: WaTemplateCategory;
	header: string | null;
	body: string;
	params: WaTemplateParam[];
	status: WaTemplateStatus;
	// Positional ({{1}}) templates can't be filled from named data
	importable: boolean;
}

// The import dialog's account listing
export type WaImportListing =
	| { status: 'loading' }
	| { status: 'error'; message: string }
	| { status: 'ready'; candidates: WaImportCandidate[] };

// The automatic messages the app sends. Their triggers are fixed by the product; a studio
// chooses the template and what fills its parameters.
export type WaFlowKey = 'schedule_change_studio' | 'schedule_change_request' | 'daily_reminder';

// What a parameter can be filled with
export type WaDataKey =
	| 'name'
	| 'first_name'
	| 'package'
	| 'studio'
	| 'old_date_time'
	| 'old_date'
	| 'old_day'
	| 'old_time'
	| 'new_date_time'
	| 'new_date'
	| 'new_day'
	| 'new_time'
	| 'cause'
	| 'date'
	| 'day'
	| 'time'
	| 'trainer'
	| 'room';

export type WaParamBinding = { source: WaDataKey } | { source: 'text'; text: string };
// Param name → where its value comes from
export type WaParamBindings = Record<string, WaParamBinding>;

// The values one message is sent with
export type WaMessageData = Partial<Record<WaDataKey, string>>;

export interface WaFlow {
	key: WaFlowKey;
	templateId: string | null;
	params: WaParamBindings;
}

export interface WaDataField {
	label: string;
	// Shown in previews and offered as the template example
	sample: string;
}

// Data fields grouped for pickers
export interface WaFieldGroup {
	group: string;
	keys: WaDataKey[];
}

export interface WaFlowDefinition {
	key: WaFlowKey;
	title: string;
	// When the message goes out, in the desk's words
	when: string;
	// The data this message has
	fields: WaFieldGroup[];
}

export type WaBodySegment = { kind: 'text'; text: string } | { kind: 'param'; name: string };

// A JSON value as stored in a jsonb column or posted as JSON (Supabase's `Json`)
export type WaJson =
	string | number | boolean | null | WaJson[] | { [key: string]: WaJson | undefined };

// One filled parameter of a send-template-message request
export interface TemplateMapping {
	schemaPropertyName: string;
	schemaPropertyValue: string;
}

// One daily reminder: who, and the template's parameters already filled
export interface WaReminder {
	phone: string;
	templateName: string;
	mapping: TemplateMapping[];
}

// ------------------------------------------------- the account (Chakra's Meta pass-through)

// Meta's template as Chakra's pass-through lists it
export interface MetaTemplateComponent {
	type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
	format?: string;
	text?: string;
	example?: {
		body_text_named_params?: { param_name: string; example: string }[];
		body_text?: string[][];
	};
}

export interface MetaTemplate {
	id: string | null;
	name: string;
	language?: string;
	status?: string;
	category?: string;
	rejected_reason?: string;
	parameter_format?: string;
	components?: MetaTemplateComponent[];
}

export interface MetaTemplatePage {
	data: MetaTemplate[];
	paging?: { cursors?: { after?: string }; next?: string };
}

export interface ChakraEnvelope<T> {
	_data?: T;
}

// An account template, as the app stores it
export interface AccountTemplate {
	vendorTemplateId: string;
	name: string;
	language: string;
	category: WaTemplateCategory;
	header: string | null;
	body: string;
	params: WaTemplateParam[];
	status: WaTemplateStatus;
	rejectionReason: string | null;
	// Only named-parameter templates can be bound to the app's data
	namedParams: boolean;
}

// The WhatsApp Business Account the templates live in
export interface WaAccountConfig {
	apiKey: string;
	wabaId: string;
	apiVersion: string;
}

// What the status sync takes over from the account for one template
export interface WaTemplateSyncPatch {
	status: WaTemplateStatus;
	rejectionReason: string | null;
	vendorTemplateId: string;
	// The account's text when it differs (an edit made in Chakra), else null
	content: TemplateContent | null;
}

// Messages moving to approved new versions, and the replaced templates to remove
export interface WaSwitchPlan {
	moves: WaFlow[];
	removals: string[];
}

// How a template save ended: a new name only, an edit back in review, or a new version
export type WaTemplateSaveOutcome = 'saved' | 'resubmitted' | 'new_version';

// What a template says, as submitted to the account
export interface TemplateContent {
	category: WaTemplateCategory;
	header: string | null;
	body: string;
	params: WaTemplateParam[];
}
