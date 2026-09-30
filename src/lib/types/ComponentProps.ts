// Prop types for the reusable components in $lib/components.
import type { Snippet } from 'svelte';
import type { ActionItem, Column, CreatePackageForm } from '$lib/types';
import type { DayOfWeek, ScheduleSlot, SlotColor } from '$lib/types/Schedule';

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

export interface StatCardProps {
	title: string;
	value: number | string;
	icon: ActionItem['icon'];
	description?: string;
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
