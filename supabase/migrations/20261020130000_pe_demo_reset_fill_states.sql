-- Demo studio reset: wipes the demo studio's data and seeds a fresh, known studio that the
-- regression suite (test/regression) runs against. Adds a "Mini Grup" package (capacity 3)
-- with two group lessons from this week on, so the week board shows every fill state: one
-- full (3/3, "Dolu") and one over capacity (4/3, "Kapasite aşıldı", as when a package's
-- capacity is lowered after members joined; the studio-wide checks allow only this one).
-- Trainee notes sit on three fixtures no check rewrites: a private kayıt (regular), one of
-- a duet (duet_regular_a) and a group member (group_regular). Every date is relative to the
-- current week (Europe/Istanbul), so the seed never goes stale.
--
-- Safety: the database is shared with the real studio. The function runs with the caller's
-- rights (RLS scopes every statement to the caller's studio) and refuses unless that studio
-- is the Demo studio (pinned by id below) and the caller is its admin.
--
-- Fixture layout. Week 0 is the current week (from Monday), week 1 the next one; days are
-- ISO (1 = Monday … 7 = Sunday), so {"d": 2, "h": 18} is Tuesday 18:00. Every fixture owns
-- its weekday-hours, so a check that changes one fixture never collides with another.
-- Wednesday of week 2 holds only the day-closing fixtures. Monday and Thursday 16:00 in
-- r2 with t2 hold only the fill-state groups (full, over_capacity). Rooms r1–r3, trainers
-- t1–t2 (the studio's first two trainers by order).
--
-- Private kayıtlar: one purchase with `lessons` lessons on `slots` from `week`.
-- Group lessons: sessions from `week` up to 26 weeks ahead (as the weekly top-up keeps them).
-- Group members: one purchase each, `sessions` sessions of the lesson from `week` on,
-- on `slots` only when given.
CREATE OR REPLACE FUNCTION public.pe_reset_demo_data()
	RETURNS jsonb
	LANGUAGE plpgsql
	SECURITY INVOKER
	SET search_path TO ''
AS $function$
DECLARE
	-- The Demo studio; no other studio can ever be wiped
	v_demo_org constant uuid := '0960fec2-5ae0-402a-bf52-1540dd64ebd7';
	v_org uuid := public.pe_get_auth_org_id();
	v_today date := (now() AT TIME ZONE 'Europe/Istanbul')::date;
	v_week0 date := v_today - (extract(isodow FROM v_today)::int - 1);
	v_horizon_weeks constant int := 26;
	v_day_names constant text[] :=
		ARRAY['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
	v_trainer_ids uuid[];
	v_rooms jsonb := '{}';
	v_trainers jsonb;
	v_packages jsonb := '{}';
	v_trainees jsonb;
	v_purchases jsonb := '{}';
	v_groups jsonb := '{}';
	v_item jsonb;
	v_id uuid;
	v_team uuid;
	v_purchase uuid;
	v_package uuid;
	v_group uuid;
	v_trainee_ids uuid[];
	v_week int;
	v_count int;
BEGIN
	IF v_org IS DISTINCT FROM v_demo_org THEN
		RAISE EXCEPTION 'Demo verileri yalnızca demo stüdyosunda sıfırlanabilir';
	END IF;
	IF public.pe_get_auth_org_role() IS DISTINCT FROM 'pe_admin' THEN
		RAISE EXCEPTION 'Demo verilerini yalnızca yönetici sıfırlayabilir';
	END IF;

	-- Wipe. Trainers and logins stay (they are auth users).
	DELETE FROM public.pe_appointment_trainees WHERE organization_id = v_org;
	DELETE FROM public.pe_appointments WHERE organization_id = v_org;
	DELETE FROM public.pe_group_lessons WHERE organization_id = v_org;
	UPDATE public.pe_purchases SET successor_id = NULL WHERE organization_id = v_org;
	DELETE FROM public.pe_purchases WHERE organization_id = v_org;
	DELETE FROM public.pe_teams WHERE organization_id = v_org;
	DELETE FROM public.pe_trainees WHERE organization_id = v_org;
	DELETE FROM public.pe_packages WHERE organization_id = v_org;
	DELETE FROM public.pe_rooms WHERE organization_id = v_org;

	UPDATE public.pe_trainers SET is_active = true WHERE organization_id = v_org;
	SELECT array_agg(id ORDER BY sort_order, id) INTO v_trainer_ids
	FROM public.pe_trainers WHERE organization_id = v_org;
	IF coalesce(array_length(v_trainer_ids, 1), 0) < 2 THEN
		RAISE EXCEPTION 'Demo stüdyosunda en az iki eğitmen olmalı';
	END IF;
	v_trainers := jsonb_build_object('t1', v_trainer_ids[1], 't2', v_trainer_ids[2]);

	FOR v_item IN SELECT * FROM jsonb_array_elements('[
		{"key": "r1", "name": "Geniş Salon", "sort": 0},
		{"key": "r2", "name": "Ana Salon", "sort": 1},
		{"key": "r3", "name": "Minik Oda", "sort": 2}
	]'::jsonb) LOOP
		INSERT INTO public.pe_rooms (organization_id, name, sort_order)
		VALUES (v_org, v_item->>'name', (v_item->>'sort')::int)
		RETURNING id INTO v_id;
		v_rooms := v_rooms || jsonb_build_object(v_item->>'key', v_id);
	END LOOP;

	FOR v_item IN SELECT * FROM jsonb_array_elements('[
		{"key": "reformer", "name": "Reformer Pilates", "type": "private", "weeks": 4,
			"min": 1, "max": 3, "capacity": 3, "reschedulable": true, "limit": 2},
		{"key": "duet", "name": "Düet Pilates", "type": "private", "weeks": 4,
			"min": 1, "max": 2, "capacity": 2, "reschedulable": true, "limit": 1},
		{"key": "group", "name": "Grup Mat Pilates", "type": "group", "weeks": null,
			"min": 1, "max": 3, "capacity": 12, "reschedulable": false, "limit": null},
		{"key": "boutique", "name": "Butik Grup", "type": "group", "weeks": null,
			"min": 1, "max": 2, "capacity": 2, "reschedulable": false, "limit": null},
		{"key": "mini", "name": "Mini Grup", "type": "group", "weeks": null,
			"min": 1, "max": 2, "capacity": 3, "reschedulable": false, "limit": null}
	]'::jsonb) LOOP
		INSERT INTO public.pe_packages (organization_id, name, package_type, weeks_duration,
			min_lessons_per_week, max_lessons_per_week, max_capacity, reschedulable, reschedule_limit)
		VALUES (v_org, v_item->>'name', (v_item->>'type')::public.package_type_enum,
			(v_item->>'weeks')::int, (v_item->>'min')::int, (v_item->>'max')::int,
			(v_item->>'capacity')::int, (v_item->>'reschedulable')::boolean,
			(v_item->>'limit')::int)
		RETURNING id INTO v_id;
		v_packages := v_packages || jsonb_build_object(v_item->>'key', v_id);
	END LOOP;

	WITH spec AS (
		SELECT e->>'key' AS key, e->>'name' AS name, e->>'notes' AS notes,
			coalesce((e->>'archived')::boolean, false) AS archived, n
		FROM jsonb_array_elements('[
			{"key": "extend_private", "name": "Ayşe Yılmaz"},
			{"key": "shift_private_slots", "name": "Zeynep Kaya"},
			{"key": "shift_private_weeks", "name": "Elif Demir"},
			{"key": "reschedule", "name": "Merve Çelik"},
			{"key": "cancel_shift", "name": "Burcu Şahin"},
			{"key": "cancel_remove", "name": "Selin Arslan"},
			{"key": "end_private", "name": "Deniz Koç"},
			{"key": "duet_leaving", "name": "Ceren Aydın"},
			{"key": "duet_staying", "name": "Gizem Öztürk"},
			{"key": "close_day_private", "name": "Nazlı Yıldız"},
			{"key": "close_day_conflict", "name": "Ece Güneş"},
			{"key": "shift_conflict", "name": "Derya Kurt"},
			{"key": "busy_anchor", "name": "Kader Yücel"},
			{"key": "blocker", "name": "Sibel Acar"},
			{"key": "transfer", "name": "Dilek Uçar"},
			{"key": "regular", "name": "Feride Aksu",
				"notes": "Bel fıtığı (L4-L5). Derin öne eğilme ve yüklü fleksiyon yok."},
			{"key": "duet_regular_a", "name": "Hülya Tan",
				"notes": "Sağ dizde menisküs ameliyatı (2025). Diz üstü pozisyonlarda yastık kullanılsın."},
			{"key": "duet_regular_b", "name": "Canan Tan"},
			{"key": "extend_group", "name": "Hande Polat"},
			{"key": "shift_group_slots", "name": "İrem Kara"},
			{"key": "shift_group_weeks", "name": "Pınar Aksoy"},
			{"key": "group_regular", "name": "Sevgi Bulut",
				"notes": "Hamile, 5. ay. Uzun süre sırtüstü kalmasın.\nDoktor onayı dosyada."},
			{"key": "group_regular_saturday", "name": "Leyla Ekinci"},
			{"key": "end_group", "name": "Gamze Yalçın"},
			{"key": "cancel_group_a", "name": "Ebru Şen"},
			{"key": "cancel_group_b", "name": "Tuğba Erdem"},
			{"key": "boutique_past", "name": "Aslı Duman"},
			{"key": "boutique_first_week", "name": "Gül Sarı"},
			{"key": "boutique_a", "name": "Oya Karaca"},
			{"key": "boutique_b", "name": "Nur Çınar"},
			{"key": "close_day_group", "name": "Seda Kılıç"},
			{"key": "group_move", "name": "Melis Tunç"},
			{"key": "group_end", "name": "Nihan Bal"},
			{"key": "new_group_member", "name": "Yasemin Koçak"},
			{"key": "new_private", "name": "Büşra Ateş"},
			{"key": "new_boutique", "name": "Damla Uysal"},
			{"key": "new_conflict", "name": "Esra Kaplan"},
			{"key": "pattern_private", "name": "Bahar Uzun"},
			{"key": "pattern_group", "name": "Çiğdem Er"},
			{"key": "full_a", "name": "Funda Akın"},
			{"key": "full_b", "name": "Özlem Sezer"},
			{"key": "full_c", "name": "Şule Bayram"},
			{"key": "over_a", "name": "Arzu Keskin"},
			{"key": "over_b", "name": "Berna Toprak"},
			{"key": "over_c", "name": "Filiz Önal"},
			{"key": "over_d", "name": "Meltem Gür"},
			{"key": "archived", "name": "Tülin Erkan", "archived": true}
		]'::jsonb) WITH ORDINALITY AS s(e, n)
	), inserted AS (
		INSERT INTO public.pe_trainees (id, organization_id, name, phone, notes, is_active)
		SELECT gen_random_uuid(), v_org, name, '55501' || lpad(n::text, 5, '0'), notes, NOT archived
		FROM spec
		RETURNING id, name
	)
	SELECT jsonb_object_agg(spec.key, inserted.id) INTO v_trainees
	FROM spec JOIN inserted ON inserted.name = spec.name;

	-- Private kayıtlar
	FOR v_item IN SELECT * FROM jsonb_array_elements('[
		{"key": "extend_private", "package": "reformer", "trainees": ["extend_private"],
			"room": "r1", "trainer": "t1", "slots": [{"d": 1, "h": 9}, {"d": 4, "h": 9}], "week": -2, "lessons": 8},
		{"key": "shift_private_slots", "package": "reformer", "trainees": ["shift_private_slots"],
			"room": "r1", "trainer": "t1", "slots": [{"d": 2, "h": 9}, {"d": 5, "h": 9}], "week": 1, "lessons": 8},
		{"key": "shift_private_weeks", "package": "reformer", "trainees": ["shift_private_weeks"],
			"room": "r1", "trainer": "t1", "slots": [{"d": 1, "h": 11}, {"d": 4, "h": 11}], "week": 1, "lessons": 8},
		{"key": "reschedule", "package": "reformer", "trainees": ["reschedule"],
			"room": "r1", "trainer": "t1", "slots": [{"d": 2, "h": 11}, {"d": 5, "h": 11}], "week": 1, "lessons": 8},
		{"key": "cancel_shift", "package": "reformer", "trainees": ["cancel_shift"],
			"room": "r1", "trainer": "t1", "slots": [{"d": 1, "h": 13}, {"d": 4, "h": 13}], "week": 1, "lessons": 8},
		{"key": "cancel_remove", "package": "reformer", "trainees": ["cancel_remove"],
			"room": "r1", "trainer": "t1", "slots": [{"d": 2, "h": 13}, {"d": 5, "h": 13}], "week": 1, "lessons": 8},
		{"key": "end_private", "package": "reformer", "trainees": ["end_private"],
			"room": "r1", "trainer": "t1", "slots": [{"d": 1, "h": 15}, {"d": 4, "h": 15}], "week": -2, "lessons": 8},
		{"key": "duet", "package": "duet", "trainees": ["duet_leaving", "duet_staying"],
			"room": "r1", "trainer": "t1", "slots": [{"d": 2, "h": 15}, {"d": 5, "h": 15}], "week": 1, "lessons": 8},
		{"key": "close_day_private", "package": "reformer", "trainees": ["close_day_private"],
			"room": "r1", "trainer": "t1", "slots": [{"d": 3, "h": 10}, {"d": 5, "h": 17}], "week": 1, "lessons": 8},
		{"key": "close_day_conflict", "package": "reformer", "trainees": ["close_day_conflict"],
			"room": "r1", "trainer": "t1", "slots": [{"d": 3, "h": 12}, {"d": 6, "h": 12}], "week": 1, "lessons": 8},
		{"key": "shift_conflict", "package": "reformer", "trainees": ["shift_conflict"],
			"room": "r1", "trainer": "t1", "slots": [{"d": 2, "h": 20}, {"d": 5, "h": 20}], "week": 1, "lessons": 8},
		{"key": "busy_anchor", "package": "reformer", "trainees": ["busy_anchor"],
			"room": "r1", "trainer": "t1", "slots": [{"d": 1, "h": 17}, {"d": 4, "h": 17}], "week": 1, "lessons": 8},
		{"key": "blocker_after_shift_conflict", "package": "reformer", "trainees": ["blocker"],
			"room": "r3", "trainer": "t1", "slots": [{"d": 2, "h": 20}], "week": 5, "lessons": 1},
		{"key": "blocker_after_close_day_conflict", "package": "reformer", "trainees": ["blocker"],
			"room": "r1", "trainer": "t1", "slots": [{"d": 3, "h": 12}], "week": 5, "lessons": 1},
		{"key": "transfer", "package": "reformer", "trainees": ["transfer"],
			"room": "r1", "trainer": "t1", "slots": [{"d": 6, "h": 14}, {"d": 7, "h": 14}], "week": 1, "lessons": 8},
		{"key": "regular", "package": "reformer", "trainees": ["regular"],
			"room": "r2", "trainer": "t2", "slots": [{"d": 1, "h": 10}, {"d": 4, "h": 10}], "week": -3, "lessons": 12},
		{"key": "duet_regular", "package": "duet", "trainees": ["duet_regular_a", "duet_regular_b"],
			"room": "r3", "trainer": "t2", "slots": [{"d": 2, "h": 10}, {"d": 6, "h": 11}], "week": 0, "lessons": 8},
		{"key": "pattern_private", "package": "reformer", "trainees": ["pattern_private"],
			"room": "r1", "trainer": "t1", "slots": [{"d": 2, "h": 12}, {"d": 4, "h": 12}], "week": 1, "lessons": 8}
	]'::jsonb) LOOP
		SELECT array_agg((v_trainees->>k)::uuid) INTO v_trainee_ids
		FROM jsonb_array_elements_text(v_item->'trainees') AS k;
		v_team := gen_random_uuid();
		INSERT INTO public.pe_teams (id, organization_id, trainee_id)
		SELECT v_team, v_org, unnest(v_trainee_ids);

		v_package := (v_packages->>(v_item->>'package'))::uuid;
		v_week := (v_item->>'week')::int;
		v_count := (v_item->>'lessons')::int;
		INSERT INTO public.pe_purchases
			(organization_id, package_id, team_id, lesson_count, reschedule_left, created_at)
		SELECT v_org, p.id, v_team, v_count,
			CASE WHEN p.reschedulable THEN coalesce(p.reschedule_limit, 999) ELSE 0 END,
			least(now(), (v_week0 + 7 * v_week - 3)::timestamp AT TIME ZONE 'Europe/Istanbul')
		FROM public.pe_packages p WHERE p.id = v_package
		RETURNING id INTO v_purchase;

		WITH lessons AS (
			SELECT v_week0 + 7 * w + (s->>'d')::int - 1 AS date, (s->>'h')::int AS hour
			FROM generate_series(v_week, v_week + v_count) AS w
			CROSS JOIN jsonb_array_elements(v_item->'slots') AS s
			ORDER BY 1, 2
			LIMIT v_count
		), inserted AS (
			INSERT INTO public.pe_appointments
				(organization_id, room_id, trainer_id, date, hour, purchase_id)
			SELECT v_org, (v_rooms->>(v_item->>'room'))::uuid,
				(v_trainers->>(v_item->>'trainer'))::uuid, date, hour, v_purchase
			FROM lessons
			RETURNING id, date, hour
		)
		INSERT INTO public.pe_appointment_trainees
			(organization_id, appointment_id, trainee_id, purchase_id, session_number, total_sessions)
		SELECT v_org, inserted.id, t.id, v_purchase,
			row_number() OVER (PARTITION BY t.id ORDER BY inserted.date, inserted.hour), v_count
		FROM inserted CROSS JOIN unnest(v_trainee_ids) AS t(id);

		v_purchases := v_purchases || jsonb_build_object(v_item->>'key', v_purchase);
	END LOOP;

	-- Group lessons with their sessions
	FOR v_item IN SELECT * FROM jsonb_array_elements('[
		{"key": "main", "package": "group", "room": "r2", "trainer": "t2",
			"slots": [{"d": 2, "h": 18}, {"d": 6, "h": 10}], "week": -2},
		{"key": "cancel", "package": "group", "room": "r2", "trainer": "t2",
			"slots": [{"d": 4, "h": 18}], "week": -1},
		{"key": "boutique", "package": "boutique", "room": "r3", "trainer": "t2",
			"slots": [{"d": 5, "h": 19}], "week": -2},
		{"key": "close_day", "package": "group", "room": "r2", "trainer": "t2",
			"slots": [{"d": 3, "h": 18}, {"d": 3, "h": 20}], "week": 0},
		{"key": "move", "package": "group", "room": "r3", "trainer": "t2",
			"slots": [{"d": 1, "h": 19}], "week": 0},
		{"key": "end", "package": "group", "room": "r3", "trainer": "t2",
			"slots": [{"d": 7, "h": 11}], "week": 0},
		{"key": "pattern", "package": "group", "room": "r3", "trainer": "t2",
			"slots": [{"d": 2, "h": 12}, {"d": 4, "h": 12}], "week": 0},
		{"key": "full", "package": "mini", "room": "r2", "trainer": "t2",
			"slots": [{"d": 1, "h": 16}], "week": 0},
		{"key": "over_capacity", "package": "mini", "room": "r2", "trainer": "t2",
			"slots": [{"d": 4, "h": 16}], "week": 0}
	]'::jsonb) LOOP
		v_week := (v_item->>'week')::int;
		INSERT INTO public.pe_group_lessons (organization_id, package_id, room_id, trainer_id,
			start_date, appointments_created_until, timeslots)
		SELECT v_org, (v_packages->>(v_item->>'package'))::uuid,
			(v_rooms->>(v_item->>'room'))::uuid, (v_trainers->>(v_item->>'trainer'))::uuid,
			v_week0 + 7 * v_week + min(d) - 1, v_week0 + 7 * v_horizon_weeks,
			jsonb_agg(jsonb_build_object('day', v_day_names[d], 'hours', hours) ORDER BY d)
		FROM (
			SELECT (s->>'d')::int AS d, jsonb_agg((s->>'h')::int ORDER BY (s->>'h')::int) AS hours
			FROM jsonb_array_elements(v_item->'slots') AS s
			GROUP BY 1
		) AS days
		RETURNING id INTO v_group;

		INSERT INTO public.pe_appointments
			(organization_id, room_id, trainer_id, date, hour, group_lesson_id)
		SELECT v_org, (v_rooms->>(v_item->>'room'))::uuid,
			(v_trainers->>(v_item->>'trainer'))::uuid,
			v_week0 + 7 * w + (s->>'d')::int - 1, (s->>'h')::int, v_group
		FROM generate_series(v_week, v_horizon_weeks - 1) AS w
		CROSS JOIN jsonb_array_elements(v_item->'slots') AS s;

		v_groups := v_groups || jsonb_build_object(v_item->>'key', v_group);
	END LOOP;

	-- Group members
	FOR v_item IN SELECT * FROM jsonb_array_elements('[
		{"key": "extend_group", "trainee": "extend_group", "group": "main", "week": -2, "sessions": 8},
		{"key": "shift_group_slots", "trainee": "shift_group_slots", "group": "main", "week": 1, "sessions": 8},
		{"key": "shift_group_weeks", "trainee": "shift_group_weeks", "group": "main", "week": 1, "sessions": 8},
		{"key": "group_regular", "trainee": "group_regular", "group": "main", "week": -2, "sessions": 24},
		{"key": "group_regular_saturday", "trainee": "group_regular_saturday", "group": "main",
			"slots": [{"d": 6, "h": 10}], "week": -1, "sessions": 10},
		{"key": "end_group", "trainee": "end_group", "group": "main",
			"slots": [{"d": 2, "h": 18}], "week": -1, "sessions": 8},
		{"key": "cancel_group_a", "trainee": "cancel_group_a", "group": "cancel", "week": 1, "sessions": 6},
		{"key": "cancel_group_b", "trainee": "cancel_group_b", "group": "cancel", "week": 1, "sessions": 6},
		{"key": "boutique_past", "trainee": "boutique_past", "group": "boutique", "week": -2, "sessions": 2},
		{"key": "boutique_first_week", "trainee": "boutique_first_week", "group": "boutique", "week": 1, "sessions": 1},
		{"key": "boutique_a", "trainee": "boutique_a", "group": "boutique", "week": 2, "sessions": 10},
		{"key": "boutique_b", "trainee": "boutique_b", "group": "boutique", "week": 2, "sessions": 10},
		{"key": "close_day_group", "trainee": "close_day_group", "group": "close_day",
			"slots": [{"d": 3, "h": 18}], "week": 1, "sessions": 6},
		{"key": "group_move", "trainee": "group_move", "group": "move", "week": 1, "sessions": 8},
		{"key": "group_end", "trainee": "group_end", "group": "end", "week": 1, "sessions": 4},
		{"key": "pattern_group", "trainee": "pattern_group", "group": "pattern", "week": 1, "sessions": 8},
		{"key": "full_a", "trainee": "full_a", "group": "full", "week": 0, "sessions": 12},
		{"key": "full_b", "trainee": "full_b", "group": "full", "week": 0, "sessions": 12},
		{"key": "full_c", "trainee": "full_c", "group": "full", "week": 0, "sessions": 12},
		{"key": "over_a", "trainee": "over_a", "group": "over_capacity", "week": 0, "sessions": 12},
		{"key": "over_b", "trainee": "over_b", "group": "over_capacity", "week": 0, "sessions": 12},
		{"key": "over_c", "trainee": "over_c", "group": "over_capacity", "week": 0, "sessions": 12},
		{"key": "over_d", "trainee": "over_d", "group": "over_capacity", "week": 0, "sessions": 12}
	]'::jsonb) LOOP
		v_group := (v_groups->>(v_item->>'group'))::uuid;
		v_id := (v_trainees->>(v_item->>'trainee'))::uuid;
		v_week := (v_item->>'week')::int;
		v_count := (v_item->>'sessions')::int;
		v_team := gen_random_uuid();
		INSERT INTO public.pe_teams (id, organization_id, trainee_id) VALUES (v_team, v_org, v_id);
		INSERT INTO public.pe_purchases
			(organization_id, package_id, team_id, lesson_count, reschedule_left, created_at)
		SELECT v_org, g.package_id, v_team, v_count, 0,
			least(now(), (v_week0 + 7 * v_week - 3)::timestamp AT TIME ZONE 'Europe/Istanbul')
		FROM public.pe_group_lessons g WHERE g.id = v_group
		RETURNING id INTO v_purchase;

		WITH sessions AS (
			SELECT a.id, a.date, a.hour
			FROM public.pe_appointments a
			WHERE a.group_lesson_id = v_group
				AND a.date >= v_week0 + 7 * v_week
				AND (v_item->'slots' IS NULL OR EXISTS (
					SELECT 1 FROM jsonb_array_elements(v_item->'slots') AS s
					WHERE (s->>'d')::int = extract(isodow FROM a.date) AND (s->>'h')::int = a.hour
				))
			ORDER BY a.date, a.hour
			LIMIT v_count
		)
		INSERT INTO public.pe_appointment_trainees
			(organization_id, appointment_id, trainee_id, purchase_id, session_number, total_sessions)
		SELECT v_org, id, v_id, v_purchase, row_number() OVER (ORDER BY date, hour), v_count
		FROM sessions;

		v_purchases := v_purchases || jsonb_build_object(v_item->>'key', v_purchase);
	END LOOP;

	RETURN jsonb_build_object(
		'organizationId', v_org,
		'today', v_today,
		'week0', v_week0,
		'rooms', v_rooms,
		'trainers', v_trainers,
		'packages', v_packages,
		'trainees', v_trainees,
		'purchases', v_purchases,
		'groupLessons', v_groups
	);
END;
$function$;

REVOKE ALL ON FUNCTION public.pe_reset_demo_data() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pe_reset_demo_data() TO authenticated, service_role;
