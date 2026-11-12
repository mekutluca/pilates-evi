// Prop types for the reusable components in $lib/components.
import type { Snippet } from 'svelte';
import type {
	ActionItem,
	Column,
	CreatePackageForm,
	Role,
	Room,
	Trainer,
	TraineeOption
} from '$lib/types';
import type {
	AbsenceOutcome,
	AppointmentWithDetails,
	DayOfWeek,
	PickedSlot,
	ScheduleSlot,
	SlotRef,
	SlotShift,
	WeeklySlot
} from '$lib/types/Schedule';
import type { SlotConflict } from '$lib/types/Conflict';
import type { MovePreviewRow } from '$lib/types/Transfer';
import type { GroupLessonDetail, GroupLessonSummary } from '$lib/types/GroupLesson';
import type { RenewalFormData } from '$lib/types/Extension';
import type { LessonPlanPreviewPayload, Loadable } from '$lib/types/Api';
import type { SupabaseClientType } from '$lib/types/Supabase';
import type { WaFlow, WaTemplate, WaTemplateStatus } from '$lib/types/WhatsAppTemplate';

interface BackLink {
	href: string;
	label: string;
}

export type BackButtonProps = BackLink;

export interface PageHeaderProps {
	title: string;
	subtitle?: string;
	back?: BackLink;
	// Right-aligned page actions (at most one primary button)
	actions?: Snippet;
	// Details under the title
	children?: Snippet;
}

export interface ActionMenuProps {
	actions: ActionItem[];
	trigger?: ActionItem['icon'];
	// Shown next to the icon on wide screens and used as the button's accessible name
	label?: string;
	// Accessible name of an icon-only trigger (default "İşlemler"), e.g. "Ayşe Yılmaz işlemleri"
	ariaLabel?: string;
	triggerClass?: string;
	onOpenDrawer?: (detail: { actions: ActionItem[] }) => void;
}

export interface DatePickerProps {
	value: Date;
	onDateSelect: (date: Date) => void;
	onClose?: () => void;
	minDate?: Date;
}

export interface GlobalActionDrawerProps {
	isOpen: boolean;
	actions: ActionItem[];
}

export interface ModalFooterProps {
	children: Snippet;
}

export interface ModalProps {
	open: boolean;
	onClose?: () => void;
	title?: string;
	size?: 'sm' | 'md' | 'lg' | 'xl';
	children: Snippet;
	/** Actions rendered next to the title; kept clear of the close button. */
	headerActions?: Snippet;
}

export interface PackageCreationFormProps {
	onSubmit: (form: CreatePackageForm) => void;
	onCancel: () => void;
	isVisible?: boolean;
	// The create request is in flight
	submitting?: boolean;
}

export interface ScheduleProps {
	// Monday of the week to display
	weekStart: Date;
	// Whose week it is (a room or a trainer)
	entityName: string;
	// Slot data provider - called for each day/hour combination
	getSlotData: (day: DayOfWeek, hour: number, date: string) => ScheduleSlot;
	onSlotClick?: (slot: ScheduleSlot) => void;
	// Menu items for a day's column header (e.g. "Günü kapat"); empty = no menu
	dayActions?: (date: string) => ActionItem[];
}

export interface SearchInputProps {
	value: string;
	placeholder?: string;
	// Accessible name; defaults to the placeholder
	label?: string;
	clearTitle?: string;
	classes?: string;
}

export interface SortableTableProps<T> {
	data: T[];
	columns: Column<T>[];
	searchTerm?: string;
	emptyMessage?: string;
	defaultSortKey?: string;
	defaultSortOrder?: 'asc' | 'desc';
	actions?: ActionItem[] | ((item: T) => ActionItem[]);
	actionsTitle?: string;
	// Makes the first column a link covering the whole row
	rowHref?: (item: T) => string;
	// Names the row in its action menu ("<label> işlemleri")
	rowLabel?: (item: T) => string;
	itemsPerPage?: number;
}

export interface CardSkeletonProps {
	/** Number of placeholder rows rendered when no children are provided */
	rows?: number;
	/** Classes applied to each placeholder row (e.g. to change height) */
	rowClass?: string;
	/** Render a card title placeholder */
	title?: boolean;
	class?: string;
	/** Custom skeleton content replacing the default rows */
	children?: Snippet;
}

export interface PageHeaderSkeletonProps {
	subtitle?: boolean;
	actions?: boolean;
}

// A trainee moved on their own inside a group lesson
export interface MovingTrainee {
	id: string;
	name: string;
}

export interface AppointmentSheetProps {
	open: boolean;
	appointment: AppointmentWithDetails | null;
	userRole: Role | null;
	// Opens Taşı for the lesson, or for one trainee of a group lesson (staff only)
	onMove?: (trainee: MovingTrainee | null) => void;
	onCancel?: () => void;
	// Opens the absence dialog: decide a missed lesson, or move a make-up (staff only)
	onAbsence?: (target: AbsenceTarget) => void;
	// After attendance was marked or a make-up removed: reload the week
	onChanged?: () => Promise<void> | void;
}

// A missed lesson the absence dialog decides about, or a make-up it moves
export interface AbsenceTarget {
	mode: 'decide' | 'move';
	enrollmentId: number;
	traineeName: string;
	packageName: string;
	isGroup: boolean;
	// The missed lesson (decide) or the make-up's current session (move)
	lesson: SlotRef;
	// The kayıt's credits: a coordinator stops at zero
	rescheduleLeft: number | null;
	makeupLeft: number | null;
	// A burned lesson can still be given a replacement
	absenceOutcome: AbsenceOutcome | null;
}

export interface AbsenceDialogProps {
	open: boolean;
	target: AbsenceTarget | null;
	userRole: Role | null;
	// After a decision; `week` is the replacement's date to show
	onDone: (week: string | undefined) => void;
}

export interface MoveSheetProps {
	open: boolean;
	appointment: AppointmentWithDetails | null;
	trainee: MovingTrainee | null;
	rooms: Room[];
	trainers: Trainer[];
	userRole: Role | null;
	// A new time picked on the grid (Taşı → Saat)
	pickedSlot: PickedSlot | null;
	onPickTime: () => void;
	// After a successful move; `week` is the date to show
	onDone: (week: string | undefined) => void;
}

export interface CancelDialogProps {
	open: boolean;
	appointment: AppointmentWithDetails | null;
	onDone: () => void;
}

export interface CloseDayDialogProps {
	open: boolean;
	// YYYY-MM-DD
	date: string | null;
	onDone: () => void;
}

export interface ConflictListProps {
	conflicts: SlotConflict[];
	title: string;
	// Rows shown before "ve N saat daha"
	limit?: number;
}

export interface MovePreviewListProps {
	rows: MovePreviewRow[];
	rooms: Room[];
	trainers: Trainer[];
}

export interface WeeklySlotsFieldProps {
	slots: WeeklySlot[];
	legend: string;
	min?: number;
	max?: number;
}

export interface SlotChangesFieldProps {
	// The current weekly program, and where each of its slots' lessons move (same order)
	from: WeeklySlot[];
	shifts: SlotShift[];
	// Lessons move from here on: each slot is shown by its first lesson at or after it
	start: SlotRef;
	legend: string;
	hint: string;
}

export interface GroupLessonMoveSheetProps {
	open: boolean;
	lesson: GroupLessonSummary;
	rooms: Room[];
	trainers: Trainer[];
	onDone: () => void;
}

export interface EndGroupLessonDialogProps {
	open: boolean;
	lesson: GroupLessonSummary;
	onDone: () => void;
}

export interface TraineePickerProps {
	trainees: TraineeOption[];
	selected: string[];
	// A trainee created inline (already saved); the parent adds it to `trainees`
	onCreated: (trainee: TraineeOption) => void;
}

export interface WeekNavProps {
	// Monday of the shown week
	weekStart: Date;
	// Any date of the week to show
	onNavigate: (date: Date) => void;
}

export interface PastStartHintProps {
	id?: string;
	children: Snippet;
}

export interface LessonPlanSummaryProps {
	plan: Loadable<LessonPlanPreviewPayload>;
	// Asks for the plan again after a failure
	onRetry: () => void;
	// Shown before there is anything to plan
	idleMessage: string;
	// The plan books a trainee's kayıt (back-dated: says how many lessons it keeps);
	// false for a new group lesson
	kayit?: boolean;
}

export interface BrandMarkProps {
	class?: string;
}

export interface PatternChipProps {
	slots: WeeklySlot[];
	class?: string;
}

export interface LessonMeterProps {
	// The lessons the kayıt was sold with and its upcoming ones; cancelled or deleted
	// lessons count as used, so "N ders kaldı" is always the lessons on the calendar
	total: number;
	left: number;
	// Few lessons left and no renewal yet
	renewalDue?: boolean;
	class?: string;
}

export interface StatStripItem {
	label: string;
	value: number | string;
	// "/ n" after the value (e.g. a capacity)
	of?: number;
	hint?: string;
}

export interface StatStripProps {
	items: StatStripItem[];
}

export interface LoadErrorProps {
	// What failed, e.g. "Grup dersleri yüklenemedi."
	message: string;
	// Retry something narrower than reloading the page (e.g. a preview)
	onRetry?: () => void;
}

export interface GroupLessonDetailViewProps {
	lesson: GroupLessonDetail;
	rooms: Room[];
	trainers: Trainer[];
}

export interface RenewFormProps {
	renewal: RenewalFormData;
	rooms: Room[];
	trainers: Trainer[];
}

export interface CauseFieldProps {
	value: string;
	id: string;
	placeholder?: string;
}

export interface TraineeNotesFieldProps {
	value: string;
	id: string;
	rows?: number;
}

export interface TraineeNoteProps {
	note: string;
	// Whose note, when the lesson has several trainees
	name?: string;
	class?: string;
}

export interface LoginFormProps {
	supabase: SupabaseClientType;
	class?: string;
}

export interface MoveArrowProps {
	// Read out instead of the arrow, e.g. "yeni saat"
	label?: string;
	class?: string;
}

export interface ReorderCellProps<T> {
	item: T;
	index: number;
}

export interface ErrorStateProps {
	status: number;
	message?: string;
}

// WhatsApp page
export interface WaMessagePreviewProps {
	header: string | null;
	body: string;
	// Param name → value; a param without one shows as {{name}}, marked as missing
	values: Record<string, string>;
	// What the preview stands for, e.g. "Örnek öğrenciyle"
	caption?: string;
	class?: string;
}

export interface WaTemplateStatusBadgeProps {
	status: WaTemplateStatus;
}

export interface WaTemplateSheetProps {
	open: boolean;
	// Null: a new template
	template: WaTemplate | null;
	// Titles of the automatic messages that use this template
	usedBy: string[];
	// The new version waiting to replace this template, if any
	waiting: WaTemplate | null;
	// The template this one is the new version of, if any
	replaces: WaTemplate | null;
	submitBlocked: string | null;
}

export interface WaFlowSheetProps {
	open: boolean;
	flow: WaFlow | null;
	templates: WaTemplate[];
	studioName: string;
}

export interface WaImportDialogProps {
	open: boolean;
}
