export type TransferScope = 'single' | 'from_selected' | 'all_from_now';

export type TransferOperation = 'transfer' | 'shift';

export type ShiftMode = 'by_time' | 'by_slot';

export type TransferConflict = {
	appointmentId: number;
	date: string | null;
	hour: number | null;
	roomConflict: boolean;
	trainerConflict: boolean;
};

export type AppointmentSummary = {
	id: number;
	date: string | null;
	hour: number | null;
	room_name: string | null;
	trainer_name: string | null;
};

export type AppointmentWithDetails = {
	id: number;
	date: string | null;
	hour: number | null;
	room_id: string | null;
	trainer_id: string | null;
	purchase_id: string | null;
	group_lesson_id: string | null;
	pe_rooms: { id: string; name: string } | null;
	pe_trainers: { id: string; name: string } | null;
	pe_purchases: { id: string; pe_packages: { name: string; package_type: string } | null } | null;
	pe_group_lessons: {
		id: string;
		pe_packages: { name: string; package_type: string } | null;
	} | null;
	pe_appointment_trainees: Array<{
		id: number;
		session_number: number | null;
		total_sessions: number | null;
		pe_trainees: { id: string; name: string } | null;
	}>;
};

export type ExistingAppointment = {
	date: string;
	hour: number;
	room_id: string;
	trainer_id: string;
	id: number;
};
