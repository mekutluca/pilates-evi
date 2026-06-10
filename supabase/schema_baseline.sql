


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "btree_gist" WITH SCHEMA "public";






CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."appointment_status" AS ENUM (
    'scheduled',
    'completed',
    'cancelled'
);


ALTER TYPE "public"."appointment_status" OWNER TO "postgres";


CREATE TYPE "public"."day_of_week" AS ENUM (
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday'
);


ALTER TYPE "public"."day_of_week" OWNER TO "postgres";


CREATE TYPE "public"."group_type" AS ENUM (
    'individual',
    'fixed',
    'dynamic'
);


ALTER TYPE "public"."group_type" OWNER TO "postgres";


CREATE TYPE "public"."order_status" AS ENUM (
    'CREATED',
    'COMPLETED',
    'CANCELED',
    'REJECTED',
    'IN_TRANSIT'
);


ALTER TYPE "public"."order_status" OWNER TO "postgres";


CREATE TYPE "public"."package_type_enum" AS ENUM (
    'private',
    'group'
);


ALTER TYPE "public"."package_type_enum" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_duplicate_fixed_group"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    target_group_type group_type;
    existing_group_id BIGINT;
    new_member_count INTEGER;
    existing_member_count INTEGER;
BEGIN
    -- Only check for fixed groups
    SELECT type INTO target_group_type FROM pe_groups WHERE id = NEW.group_id;
    
    IF target_group_type = 'fixed' THEN
        -- Get the count of active members in the new group (including this new member)
        SELECT COUNT(*) INTO new_member_count
        FROM pe_trainee_groups 
        WHERE group_id = NEW.group_id 
        AND left_at IS NULL;
        
        -- Add 1 for the member being inserted
        new_member_count := new_member_count + 1;
        
        -- Find any other fixed group with the same number of active members
        FOR existing_group_id IN 
            SELECT DISTINCT tg.group_id 
            FROM pe_trainee_groups tg
            JOIN pe_groups g ON tg.group_id = g.id
            WHERE g.type = 'fixed' 
            AND tg.group_id != NEW.group_id
            AND tg.left_at IS NULL
            GROUP BY tg.group_id
            HAVING COUNT(*) = new_member_count - 1  -- -1 because we haven't inserted NEW yet
        LOOP
            -- Check if this existing group has exactly the same members as the new group
            SELECT COUNT(*) INTO existing_member_count
            FROM pe_trainee_groups tg1
            WHERE tg1.group_id = existing_group_id
            AND tg1.left_at IS NULL
            AND tg1.trainee_id IN (
                -- Get all active members of the new group including the one being inserted
                SELECT trainee_id FROM pe_trainee_groups 
                WHERE group_id = NEW.group_id AND left_at IS NULL
                UNION
                SELECT NEW.trainee_id
            );
            
            -- If the existing group has all the same members, it's a duplicate
            IF existing_member_count = new_member_count THEN
                RAISE EXCEPTION 'A fixed group with this exact set of members already exists (Group ID: %)', existing_group_id;
            END IF;
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_duplicate_fixed_group"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_fixed_group_leave"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF (SELECT type FROM pe_groups WHERE id = NEW.group_id) IN ('individual', 'fixed') THEN
        IF NEW.left_at IS NOT NULL THEN
            RAISE EXCEPTION 'Members cannot leave individual or fixed groups';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_fixed_group_leave"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_individual_group_limit"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    IF (SELECT type FROM pe_groups WHERE id = NEW.group_id) = 'individual' THEN
        IF (SELECT COUNT(*) 
            FROM pe_trainee_groups 
            WHERE group_id = NEW.group_id 
            AND left_at IS NULL) >= 1 THEN
            RAISE EXCEPTION 'Individual groups can have at most 1 active member';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."check_individual_group_limit"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_org_role"() RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  select auth.jwt() ->> 'org_role'
$$;


ALTER FUNCTION "public"."current_org_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_organization_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  select (auth.jwt() ->> 'org_id')::uuid
$$;


ALTER FUNCTION "public"."current_organization_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_coordinator_reschedule_count"("user_id" "uuid") RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN (
        SELECT COUNT(*)
        FROM pe_reschedule_history
        WHERE rescheduled_by = user_id
        AND DATE_TRUNC('month', rescheduled_at) = DATE_TRUNC('month', NOW())
    );
END;
$$;


ALTER FUNCTION "public"."get_coordinator_reschedule_count"("user_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."get_coordinator_reschedule_count"("user_id" "uuid") IS 'Returns the number of times a coordinator has rescheduled appointments in the current month';



CREATE OR REPLACE FUNCTION "public"."pe_get_auth_org_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'organization_id', '')::uuid;
$$;


ALTER FUNCTION "public"."pe_get_auth_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pe_get_auth_org_role"() RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  select auth.jwt() -> 'app_metadata' ->> 'organization_role';
$$;


ALTER FUNCTION "public"."pe_get_auth_org_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pe_switch_organization"("p_org_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_role text;
begin
  -- 1. Security Check: Ensure user belongs to this org
  select role into v_role
  from public.pe_user_organizations
  where user_id = auth.uid()
  and organization_id = p_org_id
  and is_active = true;

  if v_role is null then
    raise exception 'Access denied: You are not a member of this organization.';
  end if;

  -- 2. Persist the selection in Auth Metadata
  -- This updates the 'raw_app_meta_data' column in the auth.users table
  update auth.users
  set raw_app_meta_data = 
    coalesce(raw_app_meta_data, '{}'::jsonb) || 
    jsonb_build_object(
      'organization_id', p_org_id, 
      'organization_role', v_role
    )
  where id = auth.uid();

end;
$$;


ALTER FUNCTION "public"."pe_switch_organization"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."populate_default_weekly_schedules"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    room_record RECORD;
    day_name day_of_week;
    hour_slot INTEGER;
BEGIN
    -- For each room
    FOR room_record IN SELECT id FROM pe_rooms LOOP
        -- For each day of the week
        FOR day_name IN SELECT unnest(ARRAY['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']::day_of_week[]) LOOP
            -- For each hour from 9 to 22 (9:00 AM to 10:00 PM)
            FOR hour_slot IN 9..22 LOOP
                INSERT INTO pe_weekly_schedules (room_id, day_of_week, hour, is_available)
                VALUES (room_record.id, day_name, hour_slot, true)
                ON CONFLICT (room_id, day_of_week, hour) DO NOTHING;
            END LOOP;
        END LOOP;
    END LOOP;
END;
$$;


ALTER FUNCTION "public"."populate_default_weekly_schedules"() OWNER TO "postgres";


COMMENT ON FUNCTION "public"."populate_default_weekly_schedules"() IS 'Populates default weekly schedule slots for all rooms (9 AM to 10 PM, Monday to Sunday)';



CREATE OR REPLACE FUNCTION "public"."update_it_orders_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_it_orders_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."it_exchange_rates" (
    "date" "date" NOT NULL,
    "usd_try" numeric(10,4) NOT NULL
);


ALTER TABLE "public"."it_exchange_rates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."it_orders" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "status" "public"."order_status" DEFAULT 'CREATED'::"public"."order_status" NOT NULL,
    "message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "it_orders_amount_check" CHECK (("amount" > (0)::numeric))
);


ALTER TABLE "public"."it_orders" OWNER TO "postgres";


ALTER TABLE "public"."it_orders" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."it_orders_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."it_sheet_data" (
    "id" integer NOT NULL,
    "user_id" integer NOT NULL,
    "sheet_data" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."it_sheet_data" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."it_sheet_data_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."it_sheet_data_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."it_sheet_data_id_seq" OWNED BY "public"."it_sheet_data"."id";



CREATE TABLE IF NOT EXISTS "public"."it_users" (
    "id" bigint NOT NULL,
    "account_id" "uuid",
    "full_name" "text" DEFAULT ''::"text",
    "current_balance" double precision DEFAULT '0'::double precision NOT NULL,
    "email" "text",
    "sheet_link" "text"
);


ALTER TABLE "public"."it_users" OWNER TO "postgres";


COMMENT ON COLUMN "public"."it_users"."current_balance" IS 'Current balance in USD';



CREATE TABLE IF NOT EXISTS "public"."pe_appointment_trainees" (
    "id" bigint NOT NULL,
    "trainee_id" "uuid",
    "appointment_id" bigint,
    "session_number" smallint,
    "total_sessions" smallint,
    "purchase_id" "uuid",
    "organization_id" "uuid" DEFAULT '0960fec2-5ae0-402a-bf52-1540dd64ebd7'::"uuid" NOT NULL
);


ALTER TABLE "public"."pe_appointment_trainees" OWNER TO "postgres";


COMMENT ON TABLE "public"."pe_appointment_trainees" IS 'Trainee''lerin hangi appointment''lara gireceği';



ALTER TABLE "public"."pe_appointment_trainees" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."pe_appointment_trainees_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."pe_appointments" (
    "id" bigint NOT NULL,
    "room_id" "uuid",
    "trainer_id" "uuid",
    "date" "date",
    "hour" smallint,
    "purchase_id" "uuid",
    "group_lesson_id" "uuid",
    "organization_id" "uuid" DEFAULT '0960fec2-5ae0-402a-bf52-1540dd64ebd7'::"uuid" NOT NULL
);


ALTER TABLE "public"."pe_appointments" OWNER TO "postgres";


ALTER TABLE "public"."pe_appointments" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."pe_appointments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."pe_group_lessons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "package_id" "uuid",
    "start_date" "date",
    "end_date" "date",
    "appointments_created_until" "date",
    "timeslots" "jsonb",
    "room_id" "uuid",
    "trainer_id" "uuid",
    "organization_id" "uuid" DEFAULT '0960fec2-5ae0-402a-bf52-1540dd64ebd7'::"uuid" NOT NULL
);


ALTER TABLE "public"."pe_group_lessons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pe_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "user_full_name" "text",
    "action" "text" NOT NULL,
    "status" "text" NOT NULL,
    "details" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "organization_id" "uuid" DEFAULT '0960fec2-5ae0-402a-bf52-1540dd64ebd7'::"uuid" NOT NULL,
    CONSTRAINT "pe_logs_status_check" CHECK (("status" = ANY (ARRAY['success'::"text", 'failure'::"text"])))
);


ALTER TABLE "public"."pe_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pe_organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pe_organizations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pe_packages" (
    "name" character varying(255) NOT NULL,
    "description" "text",
    "weeks_duration" integer,
    "reschedulable" boolean DEFAULT false,
    "reschedule_limit" integer,
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "lessons_per_week" integer DEFAULT 1 NOT NULL,
    "max_capacity" integer DEFAULT 12 NOT NULL,
    "package_type" "public"."package_type_enum" NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" DEFAULT '0960fec2-5ae0-402a-bf52-1540dd64ebd7'::"uuid" NOT NULL,
    "min_lessons_per_week" integer NOT NULL,
    "max_lessons_per_week" integer NOT NULL,
    CONSTRAINT "check_max_lessons" CHECK ((("max_lessons_per_week" >= 1) AND ("max_lessons_per_week" <= 7))),
    CONSTRAINT "check_min_lessons" CHECK ((("min_lessons_per_week" >= 1) AND ("min_lessons_per_week" <= 7))),
    CONSTRAINT "check_min_max" CHECK (("min_lessons_per_week" <= "max_lessons_per_week"))
);


ALTER TABLE "public"."pe_packages" OWNER TO "postgres";


COMMENT ON COLUMN "public"."pe_packages"."package_type" IS 'Type of package: private (fixed students) or group (dynamic students)';



CREATE TABLE IF NOT EXISTS "public"."pe_purchases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "team_id" "uuid",
    "package_id" "uuid",
    "reschedule_left" smallint DEFAULT '0'::smallint,
    "successor_id" "uuid",
    "organization_id" "uuid" DEFAULT '0960fec2-5ae0-402a-bf52-1540dd64ebd7'::"uuid" NOT NULL
);


ALTER TABLE "public"."pe_purchases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pe_rooms" (
    "name" "text" DEFAULT '""'::"text",
    "capacity" smallint DEFAULT '0'::smallint,
    "is_active" boolean DEFAULT true NOT NULL,
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" DEFAULT '0960fec2-5ae0-402a-bf52-1540dd64ebd7'::"uuid" NOT NULL
);


ALTER TABLE "public"."pe_rooms" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pe_teams" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "trainee_id" "uuid",
    "organization_id" "uuid" DEFAULT '0960fec2-5ae0-402a-bf52-1540dd64ebd7'::"uuid" NOT NULL
);


ALTER TABLE "public"."pe_teams" OWNER TO "postgres";


COMMENT ON TABLE "public"."pe_teams" IS 'Trainee groups for the same purchase';



CREATE TABLE IF NOT EXISTS "public"."pe_trainees" (
    "name" character varying(255) NOT NULL,
    "email" character varying(255),
    "phone" character varying(20) NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "auth_id" "uuid",
    "is_active" boolean DEFAULT true NOT NULL,
    "id" "uuid" NOT NULL,
    "organization_id" "uuid" DEFAULT '0960fec2-5ae0-402a-bf52-1540dd64ebd7'::"uuid" NOT NULL
);


ALTER TABLE "public"."pe_trainees" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pe_trainers" (
    "id" "uuid" NOT NULL,
    "name" "text" DEFAULT ''::"text",
    "phone" "text" NOT NULL,
    "is_active" boolean DEFAULT true,
    "organization_id" "uuid" DEFAULT '0960fec2-5ae0-402a-bf52-1540dd64ebd7'::"uuid" NOT NULL
);


ALTER TABLE "public"."pe_trainers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pe_user_organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pe_user_organizations_role_check" CHECK (("role" = ANY (ARRAY['pe_admin'::"text", 'pe_coordinator'::"text", 'pe_trainer'::"text", 'pe_trainee'::"text"])))
);


ALTER TABLE "public"."pe_user_organizations" OWNER TO "postgres";


ALTER TABLE "public"."it_users" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."users_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."it_sheet_data" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."it_sheet_data_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."it_exchange_rates"
    ADD CONSTRAINT "it_exchange_rates_pkey" PRIMARY KEY ("date");



ALTER TABLE ONLY "public"."it_orders"
    ADD CONSTRAINT "it_orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."it_sheet_data"
    ADD CONSTRAINT "it_sheet_data_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."it_sheet_data"
    ADD CONSTRAINT "it_sheet_data_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."pe_appointment_trainees"
    ADD CONSTRAINT "pe_appointment_trainees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pe_appointments"
    ADD CONSTRAINT "pe_appointments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pe_group_lessons"
    ADD CONSTRAINT "pe_group_lessons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pe_logs"
    ADD CONSTRAINT "pe_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pe_organizations"
    ADD CONSTRAINT "pe_organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pe_packages"
    ADD CONSTRAINT "pe_packages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pe_purchases"
    ADD CONSTRAINT "pe_purchases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pe_rooms"
    ADD CONSTRAINT "pe_rooms_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pe_trainees"
    ADD CONSTRAINT "pe_trainees_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."pe_trainees"
    ADD CONSTRAINT "pe_trainees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pe_trainers"
    ADD CONSTRAINT "pe_trainers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pe_user_organizations"
    ADD CONSTRAINT "pe_user_organizations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pe_user_organizations"
    ADD CONSTRAINT "pe_user_organizations_user_id_organization_id_key" UNIQUE ("user_id", "organization_id");



ALTER TABLE ONLY "public"."it_users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_it_orders_status" ON "public"."it_orders" USING "btree" ("status");



CREATE INDEX "idx_it_orders_user_id" ON "public"."it_orders" USING "btree" ("user_id");



CREATE INDEX "idx_pe_logs_action" ON "public"."pe_logs" USING "btree" ("action");



CREATE INDEX "idx_pe_logs_created_at" ON "public"."pe_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_pe_logs_status" ON "public"."pe_logs" USING "btree" ("status");



CREATE INDEX "idx_pe_logs_user_id" ON "public"."pe_logs" USING "btree" ("user_id");



CREATE INDEX "idx_pe_trainees_created_at" ON "public"."pe_trainees" USING "btree" ("created_at");



CREATE INDEX "idx_pe_trainees_email" ON "public"."pe_trainees" USING "btree" ("email");



CREATE INDEX "idx_pe_trainees_phone" ON "public"."pe_trainees" USING "btree" ("phone");



CREATE OR REPLACE TRIGGER "trg_it_orders_updated_at" BEFORE UPDATE ON "public"."it_orders" FOR EACH ROW EXECUTE FUNCTION "public"."update_it_orders_updated_at"();



ALTER TABLE ONLY "public"."it_orders"
    ADD CONSTRAINT "it_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."it_sheet_data"
    ADD CONSTRAINT "it_sheet_data_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."it_users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pe_appointment_trainees"
    ADD CONSTRAINT "pe_appointment_trainees_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "public"."pe_appointments"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pe_appointment_trainees"
    ADD CONSTRAINT "pe_appointment_trainees_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."pe_organizations"("id");



ALTER TABLE ONLY "public"."pe_appointment_trainees"
    ADD CONSTRAINT "pe_appointment_trainees_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "public"."pe_purchases"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pe_appointment_trainees"
    ADD CONSTRAINT "pe_appointment_trainees_trainee_id_fkey" FOREIGN KEY ("trainee_id") REFERENCES "public"."pe_trainees"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pe_appointments"
    ADD CONSTRAINT "pe_appointments_group_lesson_id_fkey" FOREIGN KEY ("group_lesson_id") REFERENCES "public"."pe_group_lessons"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pe_appointments"
    ADD CONSTRAINT "pe_appointments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."pe_organizations"("id");



ALTER TABLE ONLY "public"."pe_appointments"
    ADD CONSTRAINT "pe_appointments_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "public"."pe_purchases"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pe_appointments"
    ADD CONSTRAINT "pe_appointments_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."pe_rooms"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pe_appointments"
    ADD CONSTRAINT "pe_appointments_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "public"."pe_trainers"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pe_group_lessons"
    ADD CONSTRAINT "pe_group_lessons_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."pe_organizations"("id");



ALTER TABLE ONLY "public"."pe_group_lessons"
    ADD CONSTRAINT "pe_group_lessons_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."pe_packages"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pe_group_lessons"
    ADD CONSTRAINT "pe_group_lessons_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "public"."pe_rooms"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pe_group_lessons"
    ADD CONSTRAINT "pe_group_lessons_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "public"."pe_trainers"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pe_logs"
    ADD CONSTRAINT "pe_logs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."pe_organizations"("id");



ALTER TABLE ONLY "public"."pe_logs"
    ADD CONSTRAINT "pe_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pe_packages"
    ADD CONSTRAINT "pe_packages_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."pe_organizations"("id");



ALTER TABLE ONLY "public"."pe_purchases"
    ADD CONSTRAINT "pe_purchases_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."pe_organizations"("id");



ALTER TABLE ONLY "public"."pe_purchases"
    ADD CONSTRAINT "pe_purchases_package_id_fkey" FOREIGN KEY ("package_id") REFERENCES "public"."pe_packages"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pe_purchases"
    ADD CONSTRAINT "pe_purchases_successor_id_fkey" FOREIGN KEY ("successor_id") REFERENCES "public"."pe_purchases"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pe_rooms"
    ADD CONSTRAINT "pe_rooms_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."pe_organizations"("id");



ALTER TABLE ONLY "public"."pe_teams"
    ADD CONSTRAINT "pe_teams_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."pe_organizations"("id");



ALTER TABLE ONLY "public"."pe_teams"
    ADD CONSTRAINT "pe_teams_trainee_id_fkey" FOREIGN KEY ("trainee_id") REFERENCES "public"."pe_trainees"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pe_trainees"
    ADD CONSTRAINT "pe_trainees_auth_id_fkey" FOREIGN KEY ("auth_id") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pe_trainees"
    ADD CONSTRAINT "pe_trainees_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."pe_organizations"("id");



ALTER TABLE ONLY "public"."pe_trainers"
    ADD CONSTRAINT "pe_trainers_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pe_trainers"
    ADD CONSTRAINT "pe_trainers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."pe_organizations"("id");



ALTER TABLE ONLY "public"."pe_user_organizations"
    ADD CONSTRAINT "pe_user_organizations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."pe_organizations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pe_user_organizations"
    ADD CONSTRAINT "pe_user_organizations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."it_users"
    ADD CONSTRAINT "users_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "auth"."users"("id") ON UPDATE CASCADE ON DELETE CASCADE;



CREATE POLICY "Admins can do ALL" ON "public"."pe_packages" TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_admin'::"text"))) WITH CHECK ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_admin'::"text")));



CREATE POLICY "Admins can do all operations" ON "public"."pe_appointment_trainees" TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_admin'::"text"))) WITH CHECK ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_admin'::"text")));



CREATE POLICY "Admins can do all operations" ON "public"."pe_appointments" TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_admin'::"text"))) WITH CHECK ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_admin'::"text")));



CREATE POLICY "Admins can do all operations" ON "public"."pe_group_lessons" TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_admin'::"text"))) WITH CHECK ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_admin'::"text")));



CREATE POLICY "Admins can do all operations" ON "public"."pe_purchases" TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_admin'::"text"))) WITH CHECK ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_admin'::"text")));



CREATE POLICY "Admins can do all operations" ON "public"."pe_rooms" TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_admin'::"text"))) WITH CHECK ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_admin'::"text")));



CREATE POLICY "Admins can do all operations" ON "public"."pe_teams" TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_admin'::"text"))) WITH CHECK ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_admin'::"text")));



CREATE POLICY "Admins can do all operations" ON "public"."pe_trainees" TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_admin'::"text"))) WITH CHECK ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_admin'::"text")));



CREATE POLICY "Admins can do all operations" ON "public"."pe_trainers" TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_admin'::"text"))) WITH CHECK ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_admin'::"text")));



CREATE POLICY "Admins can do everything" ON "public"."it_exchange_rates" USING ((("auth"."jwt"() ->> 'role'::"text") = 'admin'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'admin'::"text"));



CREATE POLICY "Admins can do everything" ON "public"."it_orders" USING ((("auth"."jwt"() ->> 'role'::"text") = 'admin'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'admin'::"text"));



CREATE POLICY "Admins can do everything" ON "public"."it_sheet_data" USING ((("auth"."jwt"() ->> 'role'::"text") = 'admin'::"text")) WITH CHECK ((("auth"."jwt"() ->> 'role'::"text") = 'admin'::"text"));



CREATE POLICY "Admins can do everything" ON "public"."it_users" TO "admin" USING (true) WITH CHECK (true);



CREATE POLICY "Admins can read all logs" ON "public"."pe_logs" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_admin'::"text")));



CREATE POLICY "Admins can see all user-orgs" ON "public"."pe_user_organizations" TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_admin'::"text"))) WITH CHECK ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_admin'::"text")));



CREATE POLICY "All roles can create logs" ON "public"."pe_logs" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = ANY (ARRAY['pe_admin'::"text", 'pe_coordinator'::"text", 'pe_trainer'::"text", 'pe_trainee'::"text"]))));



CREATE POLICY "All roles can read" ON "public"."pe_packages" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = ANY (ARRAY['pe_coordinator'::"text", 'pe_trainee'::"text", 'pe_trainer'::"text"]))));



CREATE POLICY "All roles can see" ON "public"."pe_rooms" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = ANY (ARRAY['pe_coordinator'::"text", 'pe_trainee'::"text", 'pe_trainer'::"text"]))));



CREATE POLICY "Authenticated users can read exchange rates" ON "public"."it_exchange_rates" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "Coordinators can assign trainees to appointments" ON "public"."pe_appointment_trainees" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_coordinator'::"text")));



CREATE POLICY "Coordinators can create appointments" ON "public"."pe_appointments" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_coordinator'::"text")));



CREATE POLICY "Coordinators can create group lessons" ON "public"."pe_group_lessons" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_coordinator'::"text")));



CREATE POLICY "Coordinators can create purchases" ON "public"."pe_purchases" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_coordinator'::"text")));



CREATE POLICY "Coordinators can create teams" ON "public"."pe_teams" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_coordinator'::"text")));



CREATE POLICY "Coordinators can create trainees" ON "public"."pe_trainees" FOR INSERT TO "authenticated" WITH CHECK ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_coordinator'::"text")));



CREATE POLICY "Coordinators can see all" ON "public"."pe_teams" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_coordinator'::"text")));



CREATE POLICY "Coordinators can see all appointments" ON "public"."pe_appointments" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_coordinator'::"text")));



CREATE POLICY "Coordinators can see all group lessons" ON "public"."pe_group_lessons" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_coordinator'::"text")));



CREATE POLICY "Coordinators can see all purchases" ON "public"."pe_purchases" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_coordinator'::"text")));



CREATE POLICY "Coordinators can see all trainers" ON "public"."pe_trainers" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_coordinator'::"text")));



CREATE POLICY "Coordinators can see trainees" ON "public"."pe_trainees" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_coordinator'::"text")));



CREATE POLICY "Coordinators can see trainees appointments" ON "public"."pe_appointment_trainees" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_coordinator'::"text")));



CREATE POLICY "Coordinators can update appointments" ON "public"."pe_appointments" FOR UPDATE TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_coordinator'::"text"))) WITH CHECK ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_coordinator'::"text")));



CREATE POLICY "Coordinators can update group lessons" ON "public"."pe_group_lessons" FOR UPDATE TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_coordinator'::"text"))) WITH CHECK ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_coordinator'::"text")));



CREATE POLICY "Coordinators can update purchases" ON "public"."pe_purchases" FOR UPDATE TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_coordinator'::"text"))) WITH CHECK ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_coordinator'::"text")));



CREATE POLICY "Coordinators can update teams" ON "public"."pe_teams" FOR UPDATE TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_coordinator'::"text"))) WITH CHECK ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_coordinator'::"text")));



CREATE POLICY "Coordinators can update trainees" ON "public"."pe_trainees" FOR UPDATE TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_coordinator'::"text"))) WITH CHECK ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_coordinator'::"text")));



CREATE POLICY "Coordinators can update trainees of appointments" ON "public"."pe_appointment_trainees" FOR UPDATE TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_coordinator'::"text"))) WITH CHECK ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_coordinator'::"text")));



CREATE POLICY "Enable users to view their own data only" ON "public"."it_users" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "account_id"));



CREATE POLICY "Trainees can see all group lessons" ON "public"."pe_group_lessons" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_trainee'::"text")));



CREATE POLICY "Trainees can see purchases of their own" ON "public"."pe_purchases" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_trainee'::"text") AND (EXISTS ( SELECT 1
   FROM ("public"."pe_teams" "t"
     JOIN "public"."pe_trainees" "tr" ON (("tr"."id" = "t"."trainee_id")))
  WHERE (("t"."id" = "pe_purchases"."team_id") AND ("tr"."auth_id" = "auth"."uid"()))))));



CREATE POLICY "Trainees can see their teams" ON "public"."pe_teams" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_trainee'::"text") AND ("trainee_id" = ( SELECT "tr"."id"
   FROM "public"."pe_trainees" "tr"
  WHERE ("tr"."auth_id" = "auth"."uid"())
 LIMIT 1))));



CREATE POLICY "Trainees can see their trainers" ON "public"."pe_trainers" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_trainee'::"text") AND (EXISTS ( SELECT 1
   FROM (("public"."pe_appointments" "a"
     JOIN "public"."pe_appointment_trainees" "at" ON (("at"."appointment_id" = "a"."id")))
     JOIN "public"."pe_trainees" "tr" ON (("tr"."id" = "at"."trainee_id")))
  WHERE (("a"."trainer_id" = "pe_trainers"."id") AND ("tr"."auth_id" = "auth"."uid"()))))));



CREATE POLICY "Trainers can only see themselves" ON "public"."pe_trainers" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_trainer'::"text") AND ("id" = "auth"."uid"())));



CREATE POLICY "Trainers can see all group lessons" ON "public"."pe_group_lessons" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_trainer'::"text")));



CREATE POLICY "Trainers can see all purchases" ON "public"."pe_purchases" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_trainer'::"text")));



CREATE POLICY "Trainers can see all teams" ON "public"."pe_teams" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_trainer'::"text")));



CREATE POLICY "Trainers can see their groups trainees" ON "public"."pe_appointment_trainees" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_trainer'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."pe_appointments" "a"
  WHERE (("a"."id" = "pe_appointment_trainees"."appointment_id") AND ("a"."trainer_id" = "auth"."uid"()))))));



CREATE POLICY "Trainers can see their own appointments" ON "public"."pe_appointments" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_trainer'::"text") AND ("trainer_id" = "auth"."uid"())));



CREATE POLICY "Trainers can see their students" ON "public"."pe_trainees" FOR SELECT TO "authenticated" USING ((("organization_id" = "public"."pe_get_auth_org_id"()) AND ("public"."pe_get_auth_org_role"() = 'pe_trainer'::"text") AND (EXISTS ( SELECT 1
   FROM ("public"."pe_appointments" "a"
     JOIN "public"."pe_appointment_trainees" "at" ON (("at"."appointment_id" = "a"."id")))
  WHERE (("a"."trainer_id" = "auth"."uid"()) AND ("at"."trainee_id" = "pe_trainees"."id"))))));



CREATE POLICY "Users can insert own orders" ON "public"."it_orders" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read own orders" ON "public"."it_orders" FOR SELECT USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can see their organizations" ON "public"."pe_organizations" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."pe_user_organizations" "puo"
  WHERE (("puo"."organization_id" = "pe_organizations"."id") AND ("puo"."user_id" = "auth"."uid"())))));



CREATE POLICY "Users can update own orders" ON "public"."it_orders" FOR UPDATE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own sheet data" ON "public"."it_sheet_data" FOR SELECT TO "authenticated" USING (("user_id" = ( SELECT "it_users"."id"
   FROM "public"."it_users"
  WHERE ("it_users"."account_id" = "auth"."uid"()))));



CREATE POLICY "Users can view their own memberships" ON "public"."pe_user_organizations" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."it_exchange_rates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."it_orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."it_sheet_data" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."it_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pe_appointment_trainees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pe_appointments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pe_group_lessons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pe_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pe_organizations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pe_packages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pe_purchases" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pe_rooms" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pe_teams" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pe_trainees" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pe_trainers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pe_user_organizations" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";








GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey16_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey16_out"("public"."gbtreekey16") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey2_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey2_out"("public"."gbtreekey2") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey32_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey32_out"("public"."gbtreekey32") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey4_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey4_out"("public"."gbtreekey4") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey8_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey8_out"("public"."gbtreekey8") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_in"("cstring") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "anon";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbtreekey_var_out"("public"."gbtreekey_var") TO "service_role";














































































































































































GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "postgres";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "anon";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cash_dist"("money", "money") TO "service_role";



GRANT ALL ON FUNCTION "public"."check_duplicate_fixed_group"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_duplicate_fixed_group"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_duplicate_fixed_group"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_fixed_group_leave"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_fixed_group_leave"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_fixed_group_leave"() TO "service_role";



GRANT ALL ON FUNCTION "public"."check_individual_group_limit"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_individual_group_limit"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_individual_group_limit"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_org_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_org_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_org_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_organization_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_organization_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_organization_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "postgres";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "anon";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."date_dist"("date", "date") TO "service_role";



GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "postgres";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "anon";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "authenticated";
GRANT ALL ON FUNCTION "public"."float4_dist"(real, real) TO "service_role";



GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "postgres";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "anon";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "authenticated";
GRANT ALL ON FUNCTION "public"."float8_dist"(double precision, double precision) TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_consistent"("internal", bit, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bit_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_consistent"("internal", boolean, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_same"("public"."gbtreekey2", "public"."gbtreekey2", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bool_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bpchar_consistent"("internal", character, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_consistent"("internal", "bytea", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_bytea_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_consistent"("internal", "money", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_distance"("internal", "money", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_cash_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_consistent"("internal", "date", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_distance"("internal", "date", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_date_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_consistent"("internal", "anyenum", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_enum_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_consistent"("internal", real, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_distance"("internal", real, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float4_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_consistent"("internal", double precision, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_distance"("internal", double precision, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_float8_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_consistent"("internal", "inet", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_inet_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_consistent"("internal", smallint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_distance"("internal", smallint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_same"("public"."gbtreekey4", "public"."gbtreekey4", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int2_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_consistent"("internal", integer, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_distance"("internal", integer, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int4_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_consistent"("internal", bigint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_distance"("internal", bigint, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_int8_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_consistent"("internal", interval, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_distance"("internal", interval, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_intv_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_consistent"("internal", "macaddr8", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad8_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_consistent"("internal", "macaddr", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_macad_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_consistent"("internal", numeric, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_numeric_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_consistent"("internal", "oid", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_distance"("internal", "oid", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_same"("public"."gbtreekey8", "public"."gbtreekey8", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_oid_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_consistent"("internal", "text", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_same"("public"."gbtreekey_var", "public"."gbtreekey_var", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_text_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_consistent"("internal", time without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_distance"("internal", time without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_time_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_timetz_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_timetz_consistent"("internal", time with time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_consistent"("internal", timestamp without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_distance"("internal", timestamp without time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_same"("public"."gbtreekey16", "public"."gbtreekey16", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_ts_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_consistent"("internal", timestamp with time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_tstz_distance"("internal", timestamp with time zone, smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_compress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_consistent"("internal", "uuid", smallint, "oid", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_penalty"("internal", "internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_picksplit"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_same"("public"."gbtreekey32", "public"."gbtreekey32", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_uuid_union"("internal", "internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_var_decompress"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "postgres";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "anon";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "authenticated";
GRANT ALL ON FUNCTION "public"."gbt_var_fetch"("internal") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_coordinator_reschedule_count"("user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_coordinator_reschedule_count"("user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_coordinator_reschedule_count"("user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "postgres";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "anon";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int2_dist"(smallint, smallint) TO "service_role";



GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "postgres";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "anon";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int4_dist"(integer, integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "postgres";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."int8_dist"(bigint, bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "postgres";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "anon";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "authenticated";
GRANT ALL ON FUNCTION "public"."interval_dist"(interval, interval) TO "service_role";



GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "postgres";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "anon";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."oid_dist"("oid", "oid") TO "service_role";



GRANT ALL ON FUNCTION "public"."pe_get_auth_org_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."pe_get_auth_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pe_get_auth_org_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."pe_get_auth_org_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."pe_get_auth_org_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."pe_get_auth_org_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."pe_switch_organization"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."pe_switch_organization"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pe_switch_organization"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."populate_default_weekly_schedules"() TO "anon";
GRANT ALL ON FUNCTION "public"."populate_default_weekly_schedules"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."populate_default_weekly_schedules"() TO "service_role";



GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."time_dist"(time without time zone, time without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."ts_dist"(timestamp without time zone, timestamp without time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "postgres";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."tstz_dist"(timestamp with time zone, timestamp with time zone) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_it_orders_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_it_orders_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_it_orders_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";
























GRANT ALL ON TABLE "public"."it_exchange_rates" TO "anon";
GRANT ALL ON TABLE "public"."it_exchange_rates" TO "authenticated";
GRANT ALL ON TABLE "public"."it_exchange_rates" TO "service_role";



GRANT ALL ON TABLE "public"."it_orders" TO "anon";
GRANT ALL ON TABLE "public"."it_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."it_orders" TO "service_role";



GRANT ALL ON SEQUENCE "public"."it_orders_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."it_orders_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."it_orders_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."it_sheet_data" TO "anon";
GRANT ALL ON TABLE "public"."it_sheet_data" TO "authenticated";
GRANT ALL ON TABLE "public"."it_sheet_data" TO "service_role";



GRANT ALL ON SEQUENCE "public"."it_sheet_data_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."it_sheet_data_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."it_sheet_data_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."it_users" TO "anon";
GRANT ALL ON TABLE "public"."it_users" TO "authenticated";
GRANT ALL ON TABLE "public"."it_users" TO "service_role";



GRANT ALL ON TABLE "public"."pe_appointment_trainees" TO "anon";
GRANT ALL ON TABLE "public"."pe_appointment_trainees" TO "authenticated";
GRANT ALL ON TABLE "public"."pe_appointment_trainees" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pe_appointment_trainees_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pe_appointment_trainees_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pe_appointment_trainees_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."pe_appointments" TO "anon";
GRANT ALL ON TABLE "public"."pe_appointments" TO "authenticated";
GRANT ALL ON TABLE "public"."pe_appointments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."pe_appointments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."pe_appointments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."pe_appointments_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."pe_group_lessons" TO "anon";
GRANT ALL ON TABLE "public"."pe_group_lessons" TO "authenticated";
GRANT ALL ON TABLE "public"."pe_group_lessons" TO "service_role";



GRANT ALL ON TABLE "public"."pe_logs" TO "anon";
GRANT ALL ON TABLE "public"."pe_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."pe_logs" TO "service_role";



GRANT ALL ON TABLE "public"."pe_organizations" TO "anon";
GRANT ALL ON TABLE "public"."pe_organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."pe_organizations" TO "service_role";



GRANT ALL ON TABLE "public"."pe_packages" TO "anon";
GRANT ALL ON TABLE "public"."pe_packages" TO "authenticated";
GRANT ALL ON TABLE "public"."pe_packages" TO "service_role";



GRANT ALL ON TABLE "public"."pe_purchases" TO "anon";
GRANT ALL ON TABLE "public"."pe_purchases" TO "authenticated";
GRANT ALL ON TABLE "public"."pe_purchases" TO "service_role";



GRANT ALL ON TABLE "public"."pe_rooms" TO "anon";
GRANT ALL ON TABLE "public"."pe_rooms" TO "authenticated";
GRANT ALL ON TABLE "public"."pe_rooms" TO "service_role";



GRANT ALL ON TABLE "public"."pe_teams" TO "anon";
GRANT ALL ON TABLE "public"."pe_teams" TO "authenticated";
GRANT ALL ON TABLE "public"."pe_teams" TO "service_role";



GRANT ALL ON TABLE "public"."pe_trainees" TO "anon";
GRANT ALL ON TABLE "public"."pe_trainees" TO "authenticated";
GRANT ALL ON TABLE "public"."pe_trainees" TO "service_role";



GRANT ALL ON TABLE "public"."pe_trainers" TO "anon";
GRANT ALL ON TABLE "public"."pe_trainers" TO "authenticated";
GRANT ALL ON TABLE "public"."pe_trainers" TO "service_role";



GRANT ALL ON TABLE "public"."pe_user_organizations" TO "anon";
GRANT ALL ON TABLE "public"."pe_user_organizations" TO "authenticated";
GRANT ALL ON TABLE "public"."pe_user_organizations" TO "service_role";



GRANT ALL ON SEQUENCE "public"."users_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."users_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."users_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































