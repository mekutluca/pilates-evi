import type { SlotConflict } from '$lib/types/Conflict';
import type { CloseDayPreview, DayCancellationConflict } from '$lib/types/Operation';
import type { MovePreviewRow } from '$lib/types/Transfer';
import type { SlotRef } from '$lib/types/Schedule';
import type { AvailableGroupTimeslot, TraineeOption } from '$lib/types';
import type { BusyWeeklySlot } from '$lib/types/Conflict';

// A form action result a page waits on: nothing asked yet, in flight, failed, or its payload
export type Loadable<T> =
	| { status: 'idle' }
	| { status: 'loading' }
	| { status: 'failed'; message: string }
	| { status: 'ready'; value: T };

// What every form action returns: a message to show and, for flows that end on another
// page, where to go next.
export type ActionPayload = {
	success?: boolean;
	message?: string;
	redirectTo?: string;
	// Calendar actions: the week (any date in it) the change landed in
	week?: string;
};

// previewMove: the old → new rows of a Taşı, its conflicts and who would be messaged
export type MovePreviewPayload = ActionPayload & {
	rows: MovePreviewRow[];
	conflicts: SlotConflict[];
	recipientCount: number;
};

// previewCloseDay
export type CloseDayPreviewPayload = ActionPayload & { preview: CloseDayPreview };

// closeDay: appointments that still conflict are offered a "closest free slot" pass
export type CloseDayPayload = ActionPayload & {
	conflicts: DayCancellationConflict[];
	warnings: string[];
};

// Yenile, Yeni kayıt and Yeni grup dersi preview: the new lessons and anything blocking them
export type LessonPlanPreviewPayload = ActionPayload & {
	sessions: SlotRef[];
	conflicts: SlotConflict[];
	fullSessions: number;
	duplicateSessions: number;
};

// Yeni kayıt: weekly slots where the room or trainer is taken in some week of the range
export type AvailabilityPayload = ActionPayload & { busy: BusyWeeklySlot[] };

// Yeni kayıt: a group package's running time slots
export type GroupTimeslotsPayload = ActionPayload & { timeslots: AvailableGroupTimeslot[] };

// Yeni kayıt: a trainee created inline
export type CreatedTraineePayload = ActionPayload & { trainee: TraineeOption };
