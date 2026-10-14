-- Hot-path indexes for pe_ tables (all FKs on the two hottest tables were unindexed)
-- Room/trainer slot indexes are created as UNIQUE in the constraints migration.

CREATE INDEX IF NOT EXISTS idx_pe_appointments_date ON public.pe_appointments (date);
CREATE INDEX IF NOT EXISTS idx_pe_appointments_group_lesson ON public.pe_appointments (group_lesson_id);
CREATE INDEX IF NOT EXISTS idx_pe_appointments_purchase ON public.pe_appointments (purchase_id);

CREATE INDEX IF NOT EXISTS idx_pe_appointment_trainees_appointment ON public.pe_appointment_trainees (appointment_id);
CREATE INDEX IF NOT EXISTS idx_pe_appointment_trainees_purchase ON public.pe_appointment_trainees (purchase_id);
CREATE INDEX IF NOT EXISTS idx_pe_appointment_trainees_trainee ON public.pe_appointment_trainees (trainee_id);

CREATE INDEX IF NOT EXISTS idx_pe_purchases_successor ON public.pe_purchases (successor_id);
CREATE INDEX IF NOT EXISTS idx_pe_purchases_team ON public.pe_purchases (team_id);

CREATE INDEX IF NOT EXISTS idx_pe_group_lessons_package ON public.pe_group_lessons (package_id);
CREATE INDEX IF NOT EXISTS idx_pe_group_lessons_trainer ON public.pe_group_lessons (trainer_id);
CREATE INDEX IF NOT EXISTS idx_pe_group_lessons_room ON public.pe_group_lessons (room_id);

CREATE INDEX IF NOT EXISTS idx_pe_teams_trainee ON public.pe_teams (trainee_id);

-- Advisor-flagged unused indexes on pe_ tables
DROP INDEX IF EXISTS public.idx_pe_logs_action;
DROP INDEX IF EXISTS public.idx_pe_logs_created_at;
DROP INDEX IF EXISTS public.idx_pe_logs_status;
DROP INDEX IF EXISTS public.idx_pe_logs_user_id;
DROP INDEX IF EXISTS public.idx_pe_trainees_created_at;
DROP INDEX IF EXISTS public.idx_pe_trainees_email;
DROP INDEX IF EXISTS public.idx_pe_trainees_phone;
