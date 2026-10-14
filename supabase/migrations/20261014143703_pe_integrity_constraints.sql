-- Constraints for states the app already never produces (all audits returned 0
-- violations on 2026-10-14). SET NULL delete rules on columns that must not be
-- null become RESTRICT; enrollments follow their appointment (CASCADE).
-- pe_appointment_trainees.appointment_id stays nullable: pe_move_enrollments
-- parks rows there mid-move.

-- ------------------------------------------------------------ pe_appointments
ALTER TABLE public.pe_appointments
	ALTER COLUMN room_id SET NOT NULL,
	ALTER COLUMN trainer_id SET NOT NULL,
	ADD CONSTRAINT pe_appointments_one_owner CHECK (num_nonnulls(purchase_id, group_lesson_id) = 1),
	ADD CONSTRAINT pe_appointments_hour_range CHECK (hour BETWEEN 0 AND 23);

ALTER TABLE public.pe_appointments
	DROP CONSTRAINT pe_appointments_room_id_fkey,
	ADD CONSTRAINT pe_appointments_room_id_fkey FOREIGN KEY (room_id)
		REFERENCES public.pe_rooms(id) ON UPDATE CASCADE ON DELETE RESTRICT,
	DROP CONSTRAINT pe_appointments_trainer_id_fkey,
	ADD CONSTRAINT pe_appointments_trainer_id_fkey FOREIGN KEY (trainer_id)
		REFERENCES public.pe_trainers(id) ON UPDATE CASCADE ON DELETE RESTRICT,
	DROP CONSTRAINT pe_appointments_purchase_id_fkey,
	ADD CONSTRAINT pe_appointments_purchase_id_fkey FOREIGN KEY (purchase_id)
		REFERENCES public.pe_purchases(id) ON UPDATE CASCADE ON DELETE RESTRICT,
	DROP CONSTRAINT pe_appointments_group_lesson_id_fkey,
	ADD CONSTRAINT pe_appointments_group_lesson_id_fkey FOREIGN KEY (group_lesson_id)
		REFERENCES public.pe_group_lessons(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- ---------------------------------------------------- pe_appointment_trainees
ALTER TABLE public.pe_appointment_trainees
	ALTER COLUMN trainee_id SET NOT NULL,
	ALTER COLUMN purchase_id SET NOT NULL,
	ALTER COLUMN session_number SET NOT NULL,
	ALTER COLUMN total_sessions SET NOT NULL,
	ADD CONSTRAINT pe_appointment_trainees_session_range
		CHECK (session_number BETWEEN 1 AND total_sessions);

ALTER TABLE public.pe_appointment_trainees
	DROP CONSTRAINT pe_appointment_trainees_appointment_id_fkey,
	ADD CONSTRAINT pe_appointment_trainees_appointment_id_fkey FOREIGN KEY (appointment_id)
		REFERENCES public.pe_appointments(id) ON UPDATE CASCADE ON DELETE CASCADE,
	DROP CONSTRAINT pe_appointment_trainees_trainee_id_fkey,
	ADD CONSTRAINT pe_appointment_trainees_trainee_id_fkey FOREIGN KEY (trainee_id)
		REFERENCES public.pe_trainees(id) ON UPDATE CASCADE ON DELETE RESTRICT,
	DROP CONSTRAINT pe_appointment_trainees_purchase_id_fkey,
	ADD CONSTRAINT pe_appointment_trainees_purchase_id_fkey FOREIGN KEY (purchase_id)
		REFERENCES public.pe_purchases(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- --------------------------------------------------------------- pe_purchases
ALTER TABLE public.pe_purchases
	ALTER COLUMN team_id SET NOT NULL,
	ALTER COLUMN package_id SET NOT NULL,
	ALTER COLUMN reschedule_left SET NOT NULL,
	ADD CONSTRAINT pe_purchases_reschedule_left_nonnegative CHECK (reschedule_left >= 0),
	ADD CONSTRAINT pe_purchases_successor_not_self CHECK (successor_id <> id);

CREATE UNIQUE INDEX uq_pe_purchases_successor ON public.pe_purchases (successor_id)
	WHERE successor_id IS NOT NULL;

ALTER TABLE public.pe_purchases
	DROP CONSTRAINT pe_purchases_package_id_fkey,
	ADD CONSTRAINT pe_purchases_package_id_fkey FOREIGN KEY (package_id)
		REFERENCES public.pe_packages(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- ----------------------------------------------------------- pe_group_lessons
ALTER TABLE public.pe_group_lessons
	ALTER COLUMN package_id SET NOT NULL,
	ALTER COLUMN start_date SET NOT NULL,
	ALTER COLUMN room_id SET NOT NULL,
	ALTER COLUMN trainer_id SET NOT NULL,
	ALTER COLUMN timeslots SET NOT NULL;

ALTER TABLE public.pe_group_lessons
	DROP CONSTRAINT pe_group_lessons_package_id_fkey,
	ADD CONSTRAINT pe_group_lessons_package_id_fkey FOREIGN KEY (package_id)
		REFERENCES public.pe_packages(id) ON UPDATE CASCADE ON DELETE RESTRICT,
	DROP CONSTRAINT pe_group_lessons_room_id_fkey,
	ADD CONSTRAINT pe_group_lessons_room_id_fkey FOREIGN KEY (room_id)
		REFERENCES public.pe_rooms(id) ON UPDATE CASCADE ON DELETE RESTRICT,
	DROP CONSTRAINT pe_group_lessons_trainer_id_fkey,
	ADD CONSTRAINT pe_group_lessons_trainer_id_fkey FOREIGN KEY (trainer_id)
		REFERENCES public.pe_trainers(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- --------------------------------------------------------- packages, trainers
ALTER TABLE public.pe_packages ALTER COLUMN is_active SET NOT NULL;
ALTER TABLE public.pe_trainers ALTER COLUMN is_active SET NOT NULL;

-- pe_teams.trainee_id is part of the primary key, so SET NULL could never apply.
ALTER TABLE public.pe_teams
	DROP CONSTRAINT pe_teams_trainee_id_fkey,
	ADD CONSTRAINT pe_teams_trainee_id_fkey FOREIGN KEY (trainee_id)
		REFERENCES public.pe_trainees(id) ON UPDATE CASCADE ON DELETE RESTRICT;
