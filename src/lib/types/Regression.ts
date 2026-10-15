// Types for the regression suite (test/regression) and the Demo studio it resets
import type { User } from '@supabase/supabase-js';
import type { SlotRef } from '$lib/types/Schedule';

// Keys of the fixtures pe_reset_demo_data() seeds (supabase/migrations/*_pe_demo_reset.sql)
type RoomKey = 'r1' | 'r2' | 'r3';
type TrainerKey = 't1' | 't2';
type PackageKey = 'reformer' | 'duet' | 'group' | 'boutique';
type GroupLessonKey = 'main' | 'cancel' | 'boutique' | 'close_day' | 'move' | 'end';

// What pe_reset_demo_data() returns: the seeded ids by fixture key, and the dates every
// fixture date is relative to. A type, not an interface, so the RPC's Json converts to it
export type DemoManifest = {
	organizationId: string;
	// Today and this week's Monday in the studio's time zone (YYYY-MM-DD)
	today: string;
	week0: string;
	rooms: Record<RoomKey, string>;
	trainers: Record<TrainerKey, string>;
	packages: Record<PackageKey, string>;
	trainees: Record<string, string>;
	purchases: Record<string, string>;
	groupLessons: Record<GroupLessonKey, string>;
};

// The environment the Demo admin's credentials are read from
export type DemoEnv = Record<string, string | undefined>;

// Handed from the global setup to every test file
interface DemoContext {
	manifest: DemoManifest;
	accessToken: string;
	user: User;
}

declare module 'vitest' {
	export interface ProvidedContext {
		demo: DemoContext;
	}
}

// A weekly slot as [ISO weekday (1 = Monday), hour]
export type WeekdayHour = [day: number, hour: number];

// The fields a test posts to a form action
export type ActionForm = Record<string, string | number>;

// A form action's result: its returned data, or the message of a fail() / error()
export type ActionOutcome<Data> =
	| { ok: true; status: number; message: string; data: Data }
	| { ok: false; status: number; message: string };

// One trainee's lesson under a purchase
export interface BookedLesson extends SlotRef {
	appointmentId: number;
	roomId: string;
	trainerId: string;
	groupLessonId: string | null;
	traineeId: string;
	purchaseId: string;
	sessionNumber: number;
	totalSessions: number;
}
