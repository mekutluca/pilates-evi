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
	AppointmentWithDetails,
	DayOfWeek,
	PickedSlot,
	ScheduleSlot,
	SlotColor,
	WeeklySlot
} from '$lib/types/Schedule';
import type { SlotConflict } from '$lib/types/Conflict';
import type { MovePreviewRow } from '$lib/types/Transfer';
import type { GroupLessonSummary } from '$lib/types/GroupLesson';
import type { LessonPlanPreviewPayload, Loadable } from '$lib/types/Api';

interface BackLink {
	href: string;
	label: string;
}

export type BackButtonProps = BackLink;

export interface PageHeaderProps {
	title: string;
	subtitle?: string;
	back?: BackLink;
	children?: Snippet;
}

export interface ActionMenuProps {
	actions: ActionItem[];
	trigger?: ActionItem['icon'];
	// Shown next to the icon on wide screens and used as the button's accessible name
	label?: string;
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
}

export interface ScheduleProps {
	// Week to display
	weekStart: Date;

	// Header info (shown above the schedule grid)
	entityName: string;
	entityBadge?: {
		text: string;
		color?: SlotColor;
	};

	// Slot data provider - called for each day/hour combination
	getSlotData: (day: DayOfWeek, hour: number, date: string) => ScheduleSlot;

	// Event handlers
	onSlotClick?: (slot: ScheduleSlot) => void;

	// Menu items for a day's column header (e.g. "Günü kapat"); empty = no menu
	dayActions?: (date: string) => ActionItem[];

	// Optional custom slot renderer (for 'custom' variant)
	customSlotRenderer?: Snippet<[ScheduleSlot]>;

	// Optional alert banner above schedule (for reschedule mode, etc.)
	alertBanner?: Snippet;
}

export interface SearchInputProps {
	value: string;
	placeholder?: string;
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
	onRowClick?: (item: T) => void;
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

export interface LessonPlanSummaryProps {
	plan: Loadable<LessonPlanPreviewPayload>;
	// Shown before there is anything to plan
	idleMessage: string;
}
