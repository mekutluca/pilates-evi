// Payload types for the transactional pe_create_assignment RPC.
// Keys are client-chosen strings correlating purchases/appointments with the
// enrollments that reference them.

export type AssignmentGroupLessonPayload = {
	package_id: string;
	room_id: string;
	trainer_id: string;
	start_date: string;
	appointments_created_until: string;
	timeslots: Array<{ day: string; hours: number[] }>;
};

export type AssignmentPurchasePayload = {
	key: string;
	package_id: string;
	reschedule_left: number;
	trainee_ids: string[];
	// Key of an earlier purchase in the same payload: joins its team and becomes its
	// successor (a pre-registered extension period). trainee_ids is then ignored.
	extends_key?: string;
};

export type AssignmentAppointmentPayload = {
	key: string;
	room_id: string;
	trainer_id: string;
	date: string;
	hour: number;
	purchase_key?: string;
	in_group?: boolean;
};

export type AssignmentEnrollmentPayload = {
	purchase_key: string;
	trainee_id: string;
	session_number: number;
	total_sessions: number;
	appointment_id?: number; // existing appointment
	appointment_key?: string; // appointment created in the same payload
};

export type AssignmentPayload = {
	groupLesson: AssignmentGroupLessonPayload | null;
	purchases: AssignmentPurchasePayload[];
	appointments: AssignmentAppointmentPayload[];
	enrollments: AssignmentEnrollmentPayload[];
};

export type AssignmentResult = {
	group_lesson_id: string | null;
	appointments_created: number;
	enrollments_created: number;
};
