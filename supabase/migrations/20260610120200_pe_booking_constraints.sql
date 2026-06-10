-- Database-level booking guarantees. Until now every safety property lived in
-- racy SELECT-then-INSERT application code.

-- A room and a trainer can each host only one appointment per (date, hour).
-- These unique indexes double as the hot-path lookup indexes for conflict checks.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pe_appointments_room_slot
	ON public.pe_appointments (room_id, date, hour);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pe_appointments_trainer_slot
	ON public.pe_appointments (trainer_id, date, hour);

-- A trainee can be enrolled in an appointment only once, regardless of purchase.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pe_appointment_trainees_appt_trainee
	ON public.pe_appointment_trainees (appointment_id, trainee_id);

-- An appointment without a slot is meaningless; nullability forced defensive
-- null-checks all over the app.
ALTER TABLE public.pe_appointments ALTER COLUMN date SET NOT NULL;
ALTER TABLE public.pe_appointments ALTER COLUMN hour SET NOT NULL;

-- pe_teams had no primary key. `id` is the shared team identifier (one row per
-- member), so the composite key is (id, trainee_id).
ALTER TABLE public.pe_teams ALTER COLUMN trainee_id SET NOT NULL;
ALTER TABLE public.pe_teams ADD CONSTRAINT pe_teams_pkey PRIMARY KEY (id, trainee_id);
