-- Household Manager schema baseline, 2026-09-11, through 20260911170000.
-- Fresh Supabase databases only. Contains schema/configuration, no household data.
-- Run as postgres in one transaction. Do not replay historical migrations over this baseline.
DO $$ BEGIN IF to_regclass('public.users') IS NOT NULL THEN
  RAISE EXCEPTION 'Baseline is for a fresh database; apply incremental migrations instead';
END IF; END $$;

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

CREATE SCHEMA IF NOT EXISTS public;

ALTER SCHEMA public OWNER TO pg_database_owner;

COMMENT ON SCHEMA public IS 'standard public schema';

CREATE TYPE public.assignment_target_type AS ENUM (
    'user',
    'group',
    'all',
    'all_admins'
);

ALTER TYPE public.assignment_target_type OWNER TO postgres;

CREATE TYPE public.attachable_type AS ENUM (
    'task',
    'employee_profile'
);

ALTER TYPE public.attachable_type OWNER TO postgres;

CREATE TYPE public.child_log_category AS ENUM (
    'sleep',
    'food',
    'poop',
    'shower'
);

ALTER TYPE public.child_log_category OWNER TO postgres;

CREATE TYPE public.child_name AS ENUM (
    'Zoe',
    'Zara',
    'Zander'
);

ALTER TYPE public.child_name OWNER TO postgres;

CREATE TYPE public.leave_status AS ENUM (
    'pending',
    'approved',
    'denied'
);

ALTER TYPE public.leave_status OWNER TO postgres;

CREATE TYPE public.leave_type AS ENUM (
    'pto',
    'sick',
    'holiday',
    'vacation'
);

ALTER TYPE public.leave_type OWNER TO postgres;

CREATE TYPE public.notification_status AS ENUM (
    'pending',
    'sent',
    'failed'
);

ALTER TYPE public.notification_status OWNER TO postgres;

CREATE TYPE public.notification_type AS ENUM (
    'task_assigned',
    'task_due_reminder',
    'leave_request_submitted',
    'leave_request_approved',
    'leave_request_denied',
    'schedule_change'
);

ALTER TYPE public.notification_type OWNER TO postgres;

CREATE TYPE public.supply_request_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);

ALTER TYPE public.supply_request_status OWNER TO postgres;

CREATE TYPE public.task_priority AS ENUM (
    'low',
    'medium',
    'high',
    'urgent'
);

ALTER TYPE public.task_priority OWNER TO postgres;

CREATE TYPE public.task_status AS ENUM (
    'pending',
    'in_progress',
    'completed'
);

ALTER TYPE public.task_status OWNER TO postgres;

CREATE TYPE public.user_role AS ENUM (
    'admin',
    'employee'
);

ALTER TYPE public.user_role OWNER TO postgres;

CREATE FUNCTION public.apply_leave_balance_effects() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE effect record; kind text; request_days date[];
BEGIN
  IF TG_OP='UPDATE' AND OLD.status='approved' AND NEW.status='approved' THEN RETURN NEW; END IF;
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.status='approved' THEN
    FOR effect IN SELECT * FROM public.leave_balance_effects WHERE request_id=OLD.id ORDER BY year LOOP
      UPDATE public.leave_balances SET
        vacation_used=CASE WHEN effect.kind='vacation' THEN GREATEST(0,vacation_used-effect.days) ELSE vacation_used END,
        sick_used=CASE WHEN effect.kind='sick' THEN GREATEST(0,sick_used-effect.days) ELSE sick_used END
      WHERE user_id=OLD.user_id AND year=effect.year;
    END LOOP;
    DELETE FROM public.leave_balance_effects WHERE request_id=OLD.id;
  END IF;
  IF TG_OP<>'DELETE' AND NEW.status='approved' AND NEW.leave_type IN ('vacation','pto','sick') THEN
    kind := CASE WHEN NEW.leave_type='sick' THEN 'sick' ELSE 'vacation' END;
    request_days := NEW.selected_dates;
    FOR effect IN
      SELECT extract(year FROM d)::integer AS charge_year,
        CASE WHEN NEW.is_full_day THEN count(*)::numeric ELSE NEW.total_days END days
      FROM unnest(request_days) d GROUP BY extract(year FROM d) ORDER BY charge_year
    LOOP
      INSERT INTO public.leave_balance_effects(request_id,year,kind,days) VALUES(NEW.id,effect.charge_year,kind,effect.days);
      INSERT INTO public.leave_balances(user_id,year,vacation_used,sick_used)
      VALUES(NEW.user_id,effect.charge_year,CASE WHEN kind='vacation' THEN effect.days ELSE 0 END,CASE WHEN kind='sick' THEN effect.days ELSE 0 END)
      ON CONFLICT(user_id,year) DO UPDATE SET
        vacation_used=leave_balances.vacation_used+excluded.vacation_used,
        sick_used=leave_balances.sick_used+excluded.sick_used;
    END LOOP;
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;

ALTER FUNCTION public.apply_leave_balance_effects() OWNER TO postgres;

CREATE FUNCTION public.apply_task_series_change(p_task_id uuid, p_changes jsonb, p_dates date[] DEFAULT NULL::date[], p_assignments jsonb DEFAULT NULL::jsonb, p_viewers jsonb DEFAULT NULL::jsonb, p_videos jsonb DEFAULT NULL::jsonb, p_metadata jsonb DEFAULT NULL::jsonb, p_actor uuid DEFAULT NULL::uuid, p_delete boolean DEFAULT false, p_extend_only boolean DEFAULT false) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE base public.tasks; template public.tasks; t public.tasks;
  managed uuid[] := '{}'; created uuid[] := '{}'; removed uuid[] := '{}';
  next_id uuid; d date; item jsonb;
BEGIN
  SELECT * INTO STRICT base FROM public.tasks WHERE id=p_task_id;
  IF base.series_id IS NOT NULL THEN
    PERFORM 1 FROM public.task_series WHERE id=base.series_id FOR UPDATE;
  END IF;
  PERFORM 1 FROM public.tasks WHERE
    (base.series_id IS NOT NULL AND series_id=base.series_id) OR id=base.id ORDER BY id FOR UPDATE;
  SELECT * INTO STRICT base FROM public.tasks WHERE id=p_task_id;
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_changes) k WHERE k NOT IN (
    'title','title_es','title_zh','description','description_es','description_zh','source_locale',
    'category_id','priority','due_time','is_all_day','is_activity','start_time','end_time','sync_to_calendar'))
  THEN RAISE EXCEPTION 'Unsupported series change'; END IF;
  template := jsonb_populate_record(base,p_changes);

  FOR t IN SELECT * FROM public.tasks WHERE
    ((base.series_id IS NOT NULL AND series_id=base.series_id) OR id=base.id)
    AND NOT p_extend_only AND status <> 'completed' AND (id=base.id OR due_date>=base.due_date) ORDER BY due_date,id
  LOOP
    IF p_delete OR (p_dates IS NOT NULL AND t.id<>base.id AND NOT (t.due_date=ANY(p_dates))) THEN
      DELETE FROM public.tasks WHERE id=t.id;
      removed := array_append(removed,t.id);
    ELSE
      UPDATE public.tasks SET
        title=x.title,title_es=x.title_es,title_zh=x.title_zh,
        description=x.description,description_es=x.description_es,description_zh=x.description_zh,
        source_locale=x.source_locale,category_id=x.category_id,priority=x.priority,
        due_time=x.due_time,is_all_day=x.is_all_day,is_activity=x.is_activity,
        start_time=x.start_time,end_time=x.end_time,sync_to_calendar=x.sync_to_calendar
      FROM jsonb_populate_record(t,p_changes) x WHERE tasks.id=t.id;
      managed := array_append(managed,t.id);
    END IF;
  END LOOP;

  IF NOT p_delete AND p_dates IS NOT NULL AND base.series_id IS NOT NULL THEN
    FOREACH d IN ARRAY p_dates LOOP
      IF d>base.due_date AND NOT EXISTS (SELECT 1 FROM public.tasks WHERE series_id=base.series_id AND due_date=d) THEN
        INSERT INTO public.tasks(series_id,title,title_es,title_zh,description,description_es,description_zh,
          source_locale,category_id,priority,due_date,due_time,is_all_day,is_activity,start_time,end_time,
          sync_to_calendar,created_by)
        VALUES(base.series_id,template.title,template.title_es,template.title_zh,template.description,
          template.description_es,template.description_zh,template.source_locale,template.category_id,
          template.priority,d,template.due_time,template.is_all_day,template.is_activity,
          template.start_time,template.end_time,template.sync_to_calendar,base.created_by)
        RETURNING id INTO next_id;
        created := array_append(created,next_id);
        managed := array_append(managed,next_id);
        IF p_assignments IS NULL THEN
          INSERT INTO public.task_assignments(task_id,target_type,target_user_id,target_group_id)
          SELECT next_id,target_type,target_user_id,target_group_id FROM public.task_assignments WHERE task_id=base.id;
        END IF;
        IF p_viewers IS NULL THEN
          INSERT INTO public.task_viewers(task_id,target_type,target_user_id,target_group_id)
          SELECT next_id,target_type,target_user_id,target_group_id FROM public.task_viewers WHERE task_id=base.id;
        END IF;
        IF p_videos IS NULL THEN
          INSERT INTO public.task_videos(task_id,video_type,url,title,file_name,file_size,mime_type,created_by)
          SELECT next_id,video_type,url,title,file_name,file_size,mime_type,created_by FROM public.task_videos WHERE task_id=base.id;
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF p_assignments IS NOT NULL THEN
    DELETE FROM public.task_assignments WHERE task_id=ANY(managed);
    FOREACH next_id IN ARRAY managed LOOP
      FOR item IN SELECT value FROM jsonb_array_elements(p_assignments) LOOP
        INSERT INTO public.task_assignments(task_id,target_type,target_user_id,target_group_id)
        VALUES(next_id,(item->>'targetType')::assignment_target_type,
          CASE WHEN item->>'targetType'='user' THEN (item->>'targetUserId')::uuid END,
          CASE WHEN item->>'targetType'='group' THEN (item->>'targetGroupId')::uuid END);
      END LOOP;
    END LOOP;
  END IF;
  IF p_viewers IS NOT NULL THEN
    DELETE FROM public.task_viewers WHERE task_id=ANY(managed);
    FOREACH next_id IN ARRAY managed LOOP
      FOR item IN SELECT value FROM jsonb_array_elements(p_viewers) LOOP
        INSERT INTO public.task_viewers(task_id,target_type,target_user_id,target_group_id)
        VALUES(next_id,(item->>'targetType')::assignment_target_type,
          CASE WHEN item->>'targetType'='user' THEN (item->>'targetUserId')::uuid END,
          CASE WHEN item->>'targetType'='group' THEN (item->>'targetGroupId')::uuid END);
      END LOOP;
    END LOOP;
  END IF;
  IF p_videos IS NOT NULL THEN
    DELETE FROM public.task_videos WHERE task_id=ANY(managed);
    FOREACH next_id IN ARRAY managed LOOP
      FOR item IN SELECT value FROM jsonb_array_elements(p_videos) LOOP
        INSERT INTO public.task_videos(task_id,video_type,url,title,file_name,file_size,mime_type,created_by)
        VALUES(next_id,item->>'videoType',item->>'url',item->>'title',item->>'fileName',
          (item->>'fileSize')::bigint,item->>'mimeType',p_actor);
      END LOOP;
    END LOOP;
  END IF;
  IF p_metadata IS NOT NULL AND base.series_id IS NOT NULL THEN
    UPDATE public.task_series SET
      repeat_days=CASE WHEN jsonb_array_length(p_metadata->'repeatDays')>0 THEN ARRAY(SELECT jsonb_array_elements_text(p_metadata->'repeatDays')::int) END,
      repeat_interval=p_metadata->>'repeatInterval',
      end_date=GREATEST(start_date,COALESCE((p_metadata->>'repeatEndDate')::date,base.due_date))
    WHERE id=base.series_id;
  END IF;
  RETURN jsonb_build_object('managedIds',managed,'createdIds',created,'deletedIds',removed);
END $$;

ALTER FUNCTION public.apply_task_series_change(p_task_id uuid, p_changes jsonb, p_dates date[], p_assignments jsonb, p_viewers jsonb, p_videos jsonb, p_metadata jsonb, p_actor uuid, p_delete boolean, p_extend_only boolean) OWNER TO postgres;

CREATE FUNCTION public.calendar_visible_records(p_user_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE old_sub text; result jsonb;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Service access required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_user_id) THEN RAISE EXCEPTION 'Unknown calendar user'; END IF;
  old_sub := current_setting('request.jwt.claim.sub',true);
  PERFORM set_config('request.jwt.claim.sub',p_user_id::text,true);
  SELECT jsonb_build_object(
    'tasks',COALESCE((SELECT jsonb_agg(id) FROM public.tasks WHERE public.can_access_task(id,'view')),'[]'::jsonb),
    'leave',COALESCE((SELECT jsonb_agg(id) FROM public.leave_requests WHERE public.is_admin() OR user_id=auth.uid()),'[]'::jsonb),
    'profiles',COALESCE((SELECT jsonb_agg(user_id) FROM public.employee_profiles WHERE public.is_admin() OR user_id=auth.uid()),'[]'::jsonb),
    'schedules',COALESCE((SELECT jsonb_agg(id) FROM public.employee_schedules WHERE public.is_admin() OR user_id=auth.uid() OR (
      EXISTS(SELECT 1 FROM public.employee_group_memberships m JOIN public.employee_groups g ON g.id=m.group_id WHERE m.user_id=auth.uid() AND lower(g.name) IN ('nanny','teacher')) AND
      EXISTS(SELECT 1 FROM public.employee_group_memberships m JOIN public.employee_groups g ON g.id=m.group_id WHERE m.user_id=employee_schedules.user_id AND lower(g.name) IN ('nanny','teacher'))
    )),'[]'::jsonb),
    'oneOffs',COALESCE((SELECT jsonb_agg(id) FROM public.schedule_one_offs WHERE public.is_admin() OR user_id=auth.uid() OR (
      EXISTS(SELECT 1 FROM public.employee_group_memberships m JOIN public.employee_groups g ON g.id=m.group_id WHERE m.user_id=auth.uid() AND lower(g.name) IN ('nanny','teacher')) AND
      EXISTS(SELECT 1 FROM public.employee_group_memberships m JOIN public.employee_groups g ON g.id=m.group_id WHERE m.user_id=schedule_one_offs.user_id AND lower(g.name) IN ('nanny','teacher'))
    )),'[]'::jsonb),
    'childLogs',COALESCE((SELECT jsonb_agg(id) FROM public.child_logs WHERE public.is_admin()
      OR EXISTS(SELECT 1 FROM public.employee_group_memberships m JOIN public.employee_groups g ON g.id=m.group_id WHERE m.user_id=auth.uid() AND g.name IN ('Nanny','Teacher'))
      OR (public.is_babysitter() AND public.child_log_in_my_shift(log_date,log_time,start_time,end_time))
    ),'[]'::jsonb)
  ) INTO result;
  PERFORM set_config('request.jwt.claim.sub',COALESCE(old_sub,''),true);
  RETURN result;
END;
$$;

ALTER FUNCTION public.calendar_visible_records(p_user_id uuid) OWNER TO postgres;

CREATE FUNCTION public.can_access_task(p_task_id uuid, p_action text DEFAULT 'view'::text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.tasks t WHERE t.id = p_task_id AND (
      public.is_admin()
      OR (p_action IN ('view', 'complete') AND EXISTS (
        SELECT 1 FROM public.task_assignments a WHERE a.task_id=t.id AND (
          a.target_type='all' OR a.target_user_id=auth.uid()
          OR (a.target_type='all_admins' AND public.is_admin())
          OR (a.target_type='group' AND EXISTS (
            SELECT 1 FROM public.employee_group_memberships m WHERE m.user_id=auth.uid() AND m.group_id=a.target_group_id
          ))
        )
      ))
      OR (p_action='view' AND EXISTS (
        SELECT 1 FROM public.task_viewers v WHERE v.task_id=t.id AND (
          v.target_type='all' OR v.target_user_id=auth.uid()
          OR (v.target_type='all_admins' AND public.is_admin())
          OR (v.target_type='group' AND EXISTS (
            SELECT 1 FROM public.employee_group_memberships m WHERE m.user_id=auth.uid() AND m.group_id=v.target_group_id
          ))
        )
      ))
    )
  ) AND p_action IN ('view','complete','edit');
$$;

ALTER FUNCTION public.can_access_task(p_task_id uuid, p_action text) OWNER TO postgres;

CREATE FUNCTION public.child_log_in_my_shift(p_log_date date, p_log_time time without time zone, p_start time without time zone, p_end time without time zone) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_log_start TIMESTAMP;
  v_log_end TIMESTAMP;
BEGIN
  v_log_start := p_log_date + COALESCE(p_start, p_log_time);
  IF p_start IS NOT NULL AND p_end IS NOT NULL THEN
    -- An end at/before the start means the log runs overnight (e.g. sleep)
    v_log_end := p_log_date + p_end
      + (CASE WHEN p_end <= p_start THEN INTERVAL '1 day' ELSE INTERVAL '0' END);
  ELSE
    v_log_end := v_log_start;
  END IF;

  RETURN EXISTS (
    WITH shift_windows AS (
      SELECT d.day AS shift_date,
             COALESCE(so.start_time, es.start_time) AS start_time,
             COALESCE(so.end_time, es.end_time) AS end_time
      FROM (VALUES (p_log_date), (p_log_date - 1)) AS d(day)
      JOIN employee_schedules es
        ON es.user_id = auth.uid()
       AND es.is_active
       AND es.day_of_week = EXTRACT(DOW FROM d.day)::int
      LEFT JOIN schedule_overrides so
        ON so.schedule_id = es.id AND so.override_date = d.day
      WHERE COALESCE(so.is_cancelled, FALSE) = FALSE
      UNION ALL
      SELECT o.schedule_date, o.start_time, o.end_time
      FROM schedule_one_offs o
      WHERE o.user_id = auth.uid()
        AND o.schedule_date IN (p_log_date, p_log_date - 1)
    )
    SELECT 1 FROM shift_windows sw
    WHERE (sw.shift_date + sw.start_time) <= v_log_end
      AND (sw.shift_date + sw.end_time
           + (CASE WHEN sw.end_time <= sw.start_time THEN INTERVAL '1 day' ELSE INTERVAL '0' END)
          ) >= v_log_start
  );
END;
$$;

ALTER FUNCTION public.child_log_in_my_shift(p_log_date date, p_log_time time without time zone, p_start time without time zone, p_end time without time zone) OWNER TO postgres;

CREATE FUNCTION public.ensure_task_series(p_task_id uuid, p_days integer[], p_interval text, p_start date, p_end date) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE t public.tasks; result uuid;
BEGIN
  SELECT * INTO STRICT t FROM public.tasks WHERE id=p_task_id FOR UPDATE;
  result := t.series_id;
  IF result IS NULL THEN
    INSERT INTO public.task_series(created_by,repeat_days,repeat_interval,start_date,end_date)
    VALUES(t.created_by,p_days,p_interval,p_start,p_end) RETURNING id INTO result;
    UPDATE public.tasks SET series_id=result WHERE id=t.id;
  END IF;
  RETURN result;
END $$;

ALTER FUNCTION public.ensure_task_series(p_task_id uuid, p_days integer[], p_interval text, p_start date, p_end date) OWNER TO postgres;

CREATE FUNCTION public.guard_task_series_identity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.series_id IS NOT NULL AND NEW.series_id IS DISTINCT FROM OLD.series_id THEN
    RAISE EXCEPTION 'A task series identity cannot change';
  END IF;
  RETURN NEW;
END $$;

ALTER FUNCTION public.guard_task_series_identity() OWNER TO postgres;

CREATE FUNCTION public.guard_task_update() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
BEGIN
  IF auth.role()='service_role' OR auth.uid() IS NULL OR public.is_admin() THEN RETURN NEW; END IF;
  IF NOT public.can_access_task(OLD.id,'complete')
    OR (to_jsonb(NEW)-ARRAY['status','completed_by','completed_at','updated_at']) IS DISTINCT FROM
       (to_jsonb(OLD)-ARRAY['status','completed_by','completed_at','updated_at']) THEN
    RAISE EXCEPTION 'Task editing is not permitted' USING ERRCODE='42501';
  END IF;
  IF NEW.status='completed' THEN
    NEW.completed_by := auth.uid();
    NEW.completed_at := COALESCE(NEW.completed_at,now());
  ELSE
    NEW.completed_by := NULL;
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.guard_task_update() OWNER TO postgres;

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  metadata_role TEXT;
  metadata_full_name TEXT;
  metadata_phone TEXT;
BEGIN
  metadata_role := COALESCE(
    NEW.raw_user_meta_data ->> 'role',
    NEW.raw_app_meta_data ->> 'role',
    'employee'
  );

  IF metadata_role NOT IN ('admin', 'employee') THEN
    metadata_role := 'employee';
  END IF;

  metadata_full_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data ->> 'fullName', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'name', ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    'New Employee'
  );

  metadata_phone := NULLIF(NEW.raw_user_meta_data ->> 'phone', '');

  BEGIN
    INSERT INTO public.users (id, email, full_name, role, phone)
    VALUES (
      NEW.id,
      COALESCE(NEW.email, ''),
      metadata_full_name,
      metadata_role::public.user_role,
      metadata_phone
    )
    ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email,
          updated_at = NOW();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Non-blocking auth user mirror failed for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

CREATE FUNCTION public.has_removed_menu_catalog_term(input text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $_$
  WITH normalized AS (
    SELECT btrim(regexp_replace(normalize_menu_item_name(input), '[^a-z0-9]+', ' ', 'g')) AS value
  )
  SELECT value ~ '(^| )(adult|adults|kid|kids)( |$)'
  FROM normalized;
$_$;

ALTER FUNCTION public.has_removed_menu_catalog_term(input text) OWNER TO postgres;

CREATE FUNCTION public.is_admin() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$;

ALTER FUNCTION public.is_admin() OWNER TO postgres;

CREATE FUNCTION public.is_admin_or_chef() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM users
      WHERE id = auth.uid() AND role = 'admin'
    ) THEN
      RETURN TRUE;
    END IF;
    RETURN EXISTS (
      SELECT 1 FROM employee_group_memberships egm
      JOIN employee_groups eg ON egm.group_id = eg.id
      WHERE egm.user_id = auth.uid()
      AND LOWER(eg.name) = 'chef'
    );
  END;
  $$;

ALTER FUNCTION public.is_admin_or_chef() OWNER TO postgres;

CREATE FUNCTION public.is_assigned_to_task(p_task_id uuid) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM task_assignments ta
    LEFT JOIN employee_group_memberships egm
      ON ta.target_group_id = egm.group_id
    WHERE ta.task_id = p_task_id
    AND (
      ta.target_type = 'all'
      OR ta.target_user_id = auth.uid()
      OR egm.user_id = auth.uid()
    )
  );
END;
$$;

ALTER FUNCTION public.is_assigned_to_task(p_task_id uuid) OWNER TO postgres;

CREATE FUNCTION public.is_babysitter() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM employee_group_memberships egm
    JOIN employee_groups eg ON egm.group_id = eg.id
    WHERE egm.user_id = auth.uid()
    AND LOWER(eg.name) IN ('babysitter', 'babysitters')
  );
END;
$$;

ALTER FUNCTION public.is_babysitter() OWNER TO postgres;

CREATE FUNCTION public.is_likely_menu_catalog_item(input text) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $_$
  WITH normalized AS (
    SELECT btrim(regexp_replace(normalize_menu_item_name(input), '[^a-z0-9]+', ' ', 'g')) AS value
  )
  SELECT
    length(value) > 1
    AND value NOT IN (
      'adult',
      'adults',
      'child',
      'children',
      'kid',
      'kids',
      'menu notes',
      'note',
      'notes',
      'people',
      'prep',
      'prepped',
      'serves',
      'serving',
      'serving size',
      'servings',
      'tbd'
    )
    AND NOT has_removed_menu_catalog_term(value)
    AND value !~ '^[0-9]+[[:space:]]*(adults?|kids?|children|toddlers?|people|persons|guests?|servings?)([[:space:]]+(and[[:space:]]+)?[0-9]+[[:space:]]*(adults?|kids?|children|toddlers?|people|persons|guests?|servings?))*$'
    AND value !~ '^(serves|serving|servings|serving size|for)[[:space:]]+[0-9]+([[:space:]]+[0-9]+)?([[:space:]]+(adults?|kids?|children|toddlers?|people|persons|guests?|servings?))?$'
  FROM normalized;
$_$;

ALTER FUNCTION public.is_likely_menu_catalog_item(input text) OWNER TO postgres;

CREATE FUNCTION public.merge_menu_catalog_item_group(source_item_ids uuid[], target_item_id uuid, canonical_name text DEFAULT NULL::text, merge_note text DEFAULT NULL::text) RETURNS uuid[]
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  source_ids UUID[] := '{}'::UUID[];
  current_source_id UUID;
  event_ids UUID[] := '{}'::UUID[];
  event_id UUID;
  target_item menu_items%ROWTYPE;
  clean_canonical_name TEXT;
  conflicting_item menu_items%ROWTYPE;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can merge menu items';
  END IF;

  SELECT * INTO target_item
  FROM menu_items
  WHERE id = target_item_id
  FOR UPDATE;

  IF target_item.id IS NULL THEN
    RAISE EXCEPTION 'Canonical menu item not found';
  END IF;

  SELECT coalesce(array_agg(DISTINCT source_id), '{}'::UUID[]) INTO source_ids
  FROM unnest(source_item_ids) AS source_values(source_id)
  WHERE source_id IS NOT NULL
    AND source_id <> target_item.id;

  IF coalesce(array_length(source_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Choose at least one duplicate item to merge';
  END IF;

  clean_canonical_name := nullif(btrim(canonical_name), '');

  IF clean_canonical_name IS NOT NULL
    AND normalize_menu_item_name(clean_canonical_name) <> target_item.normalized_name THEN
    SELECT * INTO conflicting_item
    FROM menu_items
    WHERE id <> target_item.id
      AND normalize_menu_item_name(name) = normalize_menu_item_name(clean_canonical_name)
    LIMIT 1;

    IF conflicting_item.id IS NOT NULL THEN
      RAISE EXCEPTION 'Canonical name already exists. Select that item as canonical or choose another name.';
    END IF;

    UPDATE menu_items
    SET
      name = clean_canonical_name,
      updated_by = auth.uid(),
      updated_at = NOW()
    WHERE id = target_item.id
    RETURNING * INTO target_item;
  END IF;

  FOREACH current_source_id IN ARRAY source_ids LOOP
    event_id := merge_menu_catalog_items(
      current_source_id,
      target_item.id,
      merge_menu_catalog_item_group.merge_note
    );
    event_ids := array_append(event_ids, event_id);
  END LOOP;

  RETURN event_ids;
END;
$$;

ALTER FUNCTION public.merge_menu_catalog_item_group(source_item_ids uuid[], target_item_id uuid, canonical_name text, merge_note text) OWNER TO postgres;

CREATE FUNCTION public.merge_menu_catalog_items(source_item_id uuid, target_item_id uuid, merge_note text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  source_item menu_items%ROWTYPE;
  target_item menu_items%ROWTYPE;
  rating_ids UUID[] := '{}'::UUID[];
  request_ids UUID[] := '{}'::UUID[];
  event_id UUID;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can merge menu items';
  END IF;

  IF source_item_id = target_item_id THEN
    RAISE EXCEPTION 'Choose two different menu items';
  END IF;

  SELECT * INTO source_item FROM menu_items WHERE id = source_item_id;
  SELECT * INTO target_item FROM menu_items WHERE id = target_item_id;

  IF source_item.id IS NULL OR target_item.id IS NULL THEN
    RAISE EXCEPTION 'Menu item not found';
  END IF;

  SELECT coalesce(array_agg(id), '{}'::UUID[]) INTO rating_ids
  FROM menu_ratings
  WHERE menu_item_id = source_item.id
    OR (menu_item_id IS NULL AND normalize_menu_item_name(menu_item) = source_item.normalized_name);

  SELECT coalesce(array_agg(id), '{}'::UUID[]) INTO request_ids
  FROM food_requests
  WHERE menu_item_id = source_item.id
    OR (menu_item_id IS NULL AND normalize_menu_item_name(food_name) = source_item.normalized_name);

  UPDATE menu_ratings
  SET menu_item_id = target_item.id, menu_item = target_item.name
  WHERE id = ANY(rating_ids);

  UPDATE food_requests
  SET menu_item_id = target_item.id, food_name = target_item.name
  WHERE id = ANY(request_ids);

  UPDATE menu_items
  SET
    active = FALSE,
    merged_into_id = target_item.id,
    merged_at = NOW(),
    merged_by = auth.uid(),
    merge_note = merge_menu_catalog_items.merge_note
  WHERE id = source_item.id;

  INSERT INTO menu_item_merge_events (
    source_item_id,
    target_item_id,
    source_name,
    target_name,
    merge_note,
    affected_rating_ids,
    affected_request_ids,
    merged_by
  )
  VALUES (
    source_item.id,
    target_item.id,
    source_item.name,
    target_item.name,
    merge_menu_catalog_items.merge_note,
    rating_ids,
    request_ids,
    auth.uid()
  )
  RETURNING id INTO event_id;

  RETURN event_id;
END;
$$;

ALTER FUNCTION public.merge_menu_catalog_items(source_item_id uuid, target_item_id uuid, merge_note text) OWNER TO postgres;

CREATE FUNCTION public.normalize_leave_request() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE dates date[];
BEGIN
  IF TG_OP='UPDATE' AND OLD.status='approved' THEN
    IF ROW(NEW.start_date,NEW.end_date,NEW.selected_dates,NEW.is_full_day,NEW.start_time,NEW.end_time,NEW.leave_type,NEW.total_days,NEW.user_id)
      IS DISTINCT FROM ROW(OLD.start_date,OLD.end_date,OLD.selected_dates,OLD.is_full_day,OLD.start_time,OLD.end_time,OLD.leave_type,OLD.total_days,OLD.user_id)
    THEN RAISE EXCEPTION 'leaveErrors.cancelBeforeEditing'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' AND NEW.status='denied' THEN RETURN NEW; END IF;
  IF NEW.start_date IS NULL OR NEW.end_date IS NULL OR NEW.end_date<NEW.start_date THEN
    RAISE EXCEPTION 'leaveErrors.dateOrder';
  END IF;
  IF NEW.selected_dates IS NULL THEN
    SELECT array_agg(d::date ORDER BY d) INTO dates FROM generate_series(NEW.start_date::timestamp,NEW.end_date::timestamp,interval '1 day') d;
  ELSE
    SELECT array_agg(DISTINCT d ORDER BY d) INTO dates FROM unnest(NEW.selected_dates) d;
    IF COALESCE(cardinality(dates),0)=0 OR array_position(dates,NULL) IS NOT NULL THEN RAISE EXCEPTION 'leaveErrors.selectDates'; END IF;
    IF dates[1]<>NEW.start_date OR dates[cardinality(dates)]<>NEW.end_date THEN RAISE EXCEPTION 'leaveErrors.rangeMismatch'; END IF;
  END IF;
  NEW.selected_dates := dates;
  NEW.is_full_day := COALESCE(NEW.is_full_day,true);
  IF NEW.is_full_day THEN
    NEW.total_days := cardinality(dates);
    NEW.start_time := NULL; NEW.end_time := NULL;
  ELSE
    IF cardinality(dates)<>1 OR NEW.start_date<>NEW.end_date THEN RAISE EXCEPTION 'leaveErrors.partialSingleDay'; END IF;
    IF NEW.start_time IS NULL OR NEW.end_time IS NULL THEN RAISE EXCEPTION 'leaveErrors.timesRequired'; END IF;
    IF NEW.end_time<=NEW.start_time THEN RAISE EXCEPTION 'leaveErrors.timeOrder'; END IF;
    NEW.total_days := round(extract(epoch FROM NEW.end_time-NEW.start_time)/60/480,4);
  END IF;
  RETURN NEW;
END $$;

ALTER FUNCTION public.normalize_leave_request() OWNER TO postgres;

CREATE FUNCTION public.normalize_menu_item_name(input text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  SELECT lower(regexp_replace(btrim(coalesce(input, '')), '\s+', ' ', 'g'));
$$;

ALTER FUNCTION public.normalize_menu_item_name(input text) OWNER TO postgres;

CREATE FUNCTION public.refresh_menu_item_rating_stats(target_menu_item_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF target_menu_item_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE menu_items
  SET
    total_ratings = stats.total_ratings,
    average_rating = stats.average_rating
  FROM (
    SELECT
      count(*)::INTEGER AS total_ratings,
      round(avg(rating)::NUMERIC, 1) AS average_rating
    FROM menu_ratings
    WHERE menu_item_id = target_menu_item_id
  ) AS stats
  WHERE menu_items.id = target_menu_item_id;
END;
$$;

ALTER FUNCTION public.refresh_menu_item_rating_stats(target_menu_item_id uuid) OWNER TO postgres;

CREATE FUNCTION public.review_leave_request(p_request_id uuid, p_action text, p_notes text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE r public.leave_requests; actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'leaveErrors.signIn' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.leave_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'leaveErrors.notFound' USING ERRCODE='P0002'; END IF;
  IF p_action='cancel' THEN
    IF NOT public.is_admin() AND (r.user_id<>actor OR r.status<>'pending') THEN
      RAISE EXCEPTION 'leaveErrors.cancelPermission' USING ERRCODE='42501';
    END IF;
    DELETE FROM public.leave_requests WHERE id=r.id;
  ELSIF p_action IN ('approve','deny') THEN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'leaveErrors.adminRequired' USING ERRCODE='42501'; END IF;
    IF (p_action='approve' AND r.status='approved') OR (p_action='deny' AND r.status='denied') THEN RETURN r.id; END IF;
    IF r.status<>'pending' THEN RAISE EXCEPTION 'leaveErrors.notPending'; END IF;
    IF length(p_notes)>1000 THEN RAISE EXCEPTION 'leaveErrors.notesTooLong'; END IF;
    UPDATE public.leave_requests SET status=CASE WHEN p_action='approve' THEN 'approved'::leave_status ELSE 'denied'::leave_status END,
      admin_notes=NULLIF(p_notes,''),reviewed_by=actor,reviewed_at=now() WHERE id=r.id;
  ELSE RAISE EXCEPTION 'leaveErrors.invalidAction'; END IF;
  RETURN r.id;
END $$;

ALTER FUNCTION public.review_leave_request(p_request_id uuid, p_action text, p_notes text) OWNER TO postgres;

CREATE FUNCTION public.sync_menu_catalog_from_history() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE menu_items
  SET
    normalized_name = normalize_menu_item_name(name),
    search_text = normalize_menu_item_name(
      concat_ws(' ', name, description, array_to_string(aliases, ' '), array_to_string(meal_types, ' '))
    )
  WHERE normalized_name IS NULL
    OR search_text IS NULL;

  WITH raw_items AS (
    SELECT btrim(menu_item) AS name, meal_type AS meal_type, NULL::DATE AS served_at
    FROM menu_ratings
    WHERE menu_item IS NOT NULL
      AND btrim(menu_item) <> ''

    UNION ALL

    SELECT btrim(food_name) AS name, NULL::TEXT AS meal_type, NULL::DATE AS served_at
    FROM food_requests
    WHERE food_name IS NOT NULL
      AND btrim(food_name) <> ''

    UNION ALL

    SELECT btrim(source_name) AS name, NULL::TEXT AS meal_type, NULL::DATE AS served_at
    FROM menu_item_merges
    WHERE source_name IS NOT NULL
      AND btrim(source_name) <> ''

    UNION ALL

    SELECT btrim(canonical_name) AS name, NULL::TEXT AS meal_type, NULL::DATE AS served_at
    FROM menu_item_merges
    WHERE canonical_name IS NOT NULL
      AND btrim(canonical_name) <> ''

    UNION ALL

    SELECT
      btrim(regexp_replace(line, '^[[:space:]\-\*]+', '', 'g')) AS name,
      meal.meal_type,
      weekly_menu.week_start AS served_at
    FROM weekly_menu
    CROSS JOIN LATERAL jsonb_array_elements(weekly_menu.meals) AS day_meal
    CROSS JOIN LATERAL (
      VALUES
        ('breakfast', day_meal ->> 'breakfast'),
        ('lunch', day_meal ->> 'lunch'),
        ('dinner', day_meal ->> 'dinner'),
        ('snacks', day_meal ->> 'snacks')
    ) AS meal(meal_type, content)
    CROSS JOIN LATERAL regexp_split_to_table(coalesce(meal.content, ''), E'\\n+') AS line
    WHERE btrim(line) <> ''
  ),
  clean_items AS (
    SELECT *
    FROM raw_items
    WHERE is_likely_menu_catalog_item(name)
  ),
  aggregated AS (
    SELECT
      normalize_menu_item_name(name) AS normalized_name,
      (array_agg(name ORDER BY length(name), name))[1] AS display_name,
      array_remove(array_agg(DISTINCT meal_type), NULL) AS meal_types,
      count(*)::INTEGER AS times_seen,
      max(served_at) AS last_served_at
    FROM clean_items
    GROUP BY normalize_menu_item_name(name)
  )
  UPDATE menu_items
  SET
    active = CASE WHEN merged_into_id IS NULL THEN TRUE ELSE active END,
    category = coalesce(menu_items.category, NULLIF((aggregated.meal_types)[1], '')),
    meal_types = (
      SELECT coalesce(array_agg(DISTINCT meal_type ORDER BY meal_type), '{}'::TEXT[])
      FROM unnest(menu_items.meal_types || coalesce(aggregated.meal_types, '{}'::TEXT[])) AS meal_types(meal_type)
      WHERE meal_type IS NOT NULL
        AND meal_type <> ''
    ),
    times_served = GREATEST(coalesce(menu_items.times_served, 0), aggregated.times_seen),
    last_served_at = CASE
      WHEN menu_items.last_served_at IS NULL THEN aggregated.last_served_at
      WHEN aggregated.last_served_at IS NULL THEN menu_items.last_served_at
      ELSE GREATEST(menu_items.last_served_at, aggregated.last_served_at)
    END,
    search_text = normalize_menu_item_name(
      concat_ws(' ', menu_items.name, menu_items.description, array_to_string(menu_items.aliases, ' '), array_to_string(menu_items.meal_types, ' '))
    )
  FROM aggregated
  WHERE menu_items.normalized_name = aggregated.normalized_name;

  WITH raw_items AS (
    SELECT btrim(menu_item) AS name, meal_type AS meal_type, NULL::DATE AS served_at
    FROM menu_ratings
    WHERE menu_item IS NOT NULL
      AND btrim(menu_item) <> ''

    UNION ALL

    SELECT btrim(food_name) AS name, NULL::TEXT AS meal_type, NULL::DATE AS served_at
    FROM food_requests
    WHERE food_name IS NOT NULL
      AND btrim(food_name) <> ''

    UNION ALL

    SELECT btrim(source_name) AS name, NULL::TEXT AS meal_type, NULL::DATE AS served_at
    FROM menu_item_merges
    WHERE source_name IS NOT NULL
      AND btrim(source_name) <> ''

    UNION ALL

    SELECT btrim(canonical_name) AS name, NULL::TEXT AS meal_type, NULL::DATE AS served_at
    FROM menu_item_merges
    WHERE canonical_name IS NOT NULL
      AND btrim(canonical_name) <> ''

    UNION ALL

    SELECT
      btrim(regexp_replace(line, '^[[:space:]\-\*]+', '', 'g')) AS name,
      meal.meal_type,
      weekly_menu.week_start AS served_at
    FROM weekly_menu
    CROSS JOIN LATERAL jsonb_array_elements(weekly_menu.meals) AS day_meal
    CROSS JOIN LATERAL (
      VALUES
        ('breakfast', day_meal ->> 'breakfast'),
        ('lunch', day_meal ->> 'lunch'),
        ('dinner', day_meal ->> 'dinner'),
        ('snacks', day_meal ->> 'snacks')
    ) AS meal(meal_type, content)
    CROSS JOIN LATERAL regexp_split_to_table(coalesce(meal.content, ''), E'\\n+') AS line
    WHERE btrim(line) <> ''
  ),
  clean_items AS (
    SELECT *
    FROM raw_items
    WHERE is_likely_menu_catalog_item(name)
  ),
  aggregated AS (
    SELECT
      normalize_menu_item_name(name) AS normalized_name,
      (array_agg(name ORDER BY length(name), name))[1] AS display_name,
      array_remove(array_agg(DISTINCT meal_type), NULL) AS meal_types,
      count(*)::INTEGER AS times_seen,
      max(served_at) AS last_served_at
    FROM clean_items
    GROUP BY normalize_menu_item_name(name)
  )
  INSERT INTO menu_items (name, normalized_name, meal_types, category, times_served, last_served_at, search_text)
  SELECT
    aggregated.display_name,
    aggregated.normalized_name,
    coalesce(aggregated.meal_types, '{}'::TEXT[]),
    NULLIF((aggregated.meal_types)[1], ''),
    aggregated.times_seen,
    aggregated.last_served_at,
    normalize_menu_item_name(aggregated.display_name)
  FROM aggregated
  WHERE NOT EXISTS (
    SELECT 1
    FROM menu_items
    WHERE menu_items.normalized_name = aggregated.normalized_name
  )
  ON CONFLICT (name) DO NOTHING;

  UPDATE menu_ratings
  SET menu_item_id = menu_items.id
  FROM menu_items
  WHERE menu_ratings.menu_item_id IS NULL
    AND menu_items.active = TRUE
    AND menu_items.normalized_name = normalize_menu_item_name(menu_ratings.menu_item);

  UPDATE food_requests
  SET menu_item_id = menu_items.id
  FROM menu_items
  WHERE food_requests.menu_item_id IS NULL
    AND menu_items.active = TRUE
    AND menu_items.normalized_name = normalize_menu_item_name(food_requests.food_name);

  WITH rating_stats AS (
    SELECT
      menu_item_id,
      count(*)::INTEGER AS total_ratings,
      round(avg(rating)::NUMERIC, 1) AS average_rating
    FROM menu_ratings
    WHERE menu_item_id IS NOT NULL
    GROUP BY menu_item_id
  )
  UPDATE menu_items
  SET
    total_ratings = rating_stats.total_ratings,
    average_rating = rating_stats.average_rating
  FROM rating_stats
  WHERE menu_items.id = rating_stats.menu_item_id;
END;
$$;

ALTER FUNCTION public.sync_menu_catalog_from_history() OWNER TO postgres;

CREATE FUNCTION public.sync_menu_item_rating_stats() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM refresh_menu_item_rating_stats(NEW.menu_item_id);
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM refresh_menu_item_rating_stats(OLD.menu_item_id);
  END IF;

  RETURN NULL;
END;
$$;

ALTER FUNCTION public.sync_menu_item_rating_stats() OWNER TO postgres;

CREATE FUNCTION public.unmerge_menu_catalog_items(merge_event_id uuid, undo_note text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  merge_event menu_item_merge_events%ROWTYPE;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can unmerge menu items';
  END IF;

  SELECT * INTO merge_event
  FROM menu_item_merge_events
  WHERE id = merge_event_id;

  IF merge_event.id IS NULL THEN
    RAISE EXCEPTION 'Merge event not found';
  END IF;

  IF merge_event.undone_at IS NOT NULL THEN
    RAISE EXCEPTION 'This merge has already been undone';
  END IF;

  UPDATE menu_ratings
  SET menu_item_id = merge_event.source_item_id, menu_item = merge_event.source_name
  WHERE id = ANY(merge_event.affected_rating_ids);

  UPDATE food_requests
  SET menu_item_id = merge_event.source_item_id, food_name = merge_event.source_name
  WHERE id = ANY(merge_event.affected_request_ids);

  UPDATE menu_items
  SET
    active = TRUE,
    merged_into_id = NULL,
    merged_at = NULL,
    merged_by = NULL,
    merge_note = NULL
  WHERE id = merge_event.source_item_id;

  UPDATE menu_item_merge_events
  SET
    undone_at = NOW(),
    undone_by = auth.uid(),
    undo_note = unmerge_menu_catalog_items.undo_note
  WHERE id = merge_event.id;
END;
$$;

ALTER FUNCTION public.unmerge_menu_catalog_items(merge_event_id uuid, undo_note text) OWNER TO postgres;

CREATE FUNCTION public.update_employee_schedules_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
  BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
  $$;

ALTER FUNCTION public.update_employee_schedules_updated_at() OWNER TO postgres;

CREATE FUNCTION public.update_menu_item_catalog_fields() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.normalized_name := normalize_menu_item_name(NEW.name);
  NEW.search_text := normalize_menu_item_name(
    concat_ws(' ', NEW.name, NEW.description, array_to_string(NEW.aliases, ' '), array_to_string(NEW.meal_types, ' '))
  );
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.update_menu_item_catalog_fields() OWNER TO postgres;

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

ALTER FUNCTION public.update_updated_at_column() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

CREATE TABLE public.attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attachable_type public.attachable_type NOT NULL,
    attachable_id uuid NOT NULL,
    file_name text NOT NULL,
    file_size integer NOT NULL,
    mime_type text NOT NULL,
    storage_path text NOT NULL,
    uploaded_by uuid,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.attachments OWNER TO postgres;

CREATE TABLE public.babysitter_availability_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    entry_date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT babysitter_availability_entries_check CHECK ((end_time > start_time))
);

ALTER TABLE public.babysitter_availability_entries OWNER TO postgres;

CREATE TABLE public.babysitter_availability_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    day_of_week smallint NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT babysitter_availability_templates_check CHECK ((end_time > start_time)),
    CONSTRAINT babysitter_availability_templates_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)))
);

ALTER TABLE public.babysitter_availability_templates OWNER TO postgres;

CREATE TABLE public.babysitter_availability_weeks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    week_start date NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.babysitter_availability_weeks OWNER TO postgres;

CREATE TABLE public.babysitter_booking_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    babysitter_id uuid NOT NULL,
    request_date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    note text,
    status text DEFAULT 'pending'::text NOT NULL,
    one_off_id uuid,
    created_by uuid,
    responded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT babysitter_booking_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'cancelled'::text])))
);

ALTER TABLE public.babysitter_booking_requests OWNER TO postgres;

CREATE TABLE public.child_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    child public.child_name NOT NULL,
    category public.child_log_category NOT NULL,
    log_date date DEFAULT CURRENT_DATE NOT NULL,
    log_time time without time zone NOT NULL,
    description text,
    logged_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    start_time time without time zone,
    end_time time without time zone
);

ALTER TABLE public.child_logs OWNER TO postgres;

CREATE TABLE public.employee_group_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    group_id uuid,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.employee_group_memberships OWNER TO postgres;

CREATE TABLE public.employee_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.employee_groups OWNER TO postgres;

CREATE TABLE public.employee_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    date_of_birth date,
    hire_date date,
    phone text,
    emergency_contact text,
    notes text,
    important_dates jsonb DEFAULT '[]'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.employee_profiles OWNER TO postgres;

CREATE TABLE public.employee_schedules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    day_of_week integer NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT employee_schedules_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6))),
    CONSTRAINT valid_time_range CHECK ((end_time > start_time))
);

ALTER TABLE public.employee_schedules OWNER TO postgres;

CREATE TABLE public.food_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    food_name text NOT NULL,
    requested_by uuid NOT NULL,
    notes text,
    status text DEFAULT 'pending'::text NOT NULL,
    completed_at timestamp with time zone,
    completed_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    recipe_id uuid,
    menu_item_id uuid,
    CONSTRAINT food_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'declined'::text])))
);

ALTER TABLE public.food_requests OWNER TO postgres;

CREATE TABLE public.google_calendar_synced_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    event_type text NOT NULL,
    source_id text NOT NULL,
    google_event_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.google_calendar_synced_events OWNER TO postgres;

CREATE TABLE public.google_calendar_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    access_token text NOT NULL,
    refresh_token text NOT NULL,
    token_expiry timestamp with time zone NOT NULL,
    calendar_id text DEFAULT 'primary'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    sync_filters jsonb DEFAULT '{"leave": true, "tasks": true, "childLogs": {"food": true, "poop": true, "sleep": true, "shower": true}, "schedules": true, "importantDates": true}'::jsonb,
    google_email text,
    last_synced timestamp with time zone
);

ALTER TABLE public.google_calendar_tokens OWNER TO postgres;

CREATE TABLE public.leave_balance_effects (
    request_id uuid NOT NULL,
    year integer NOT NULL,
    kind text NOT NULL,
    days numeric(10,4) NOT NULL,
    CONSTRAINT leave_balance_effects_days_check CHECK ((days > (0)::numeric)),
    CONSTRAINT leave_balance_effects_kind_check CHECK ((kind = ANY (ARRAY['vacation'::text, 'sick'::text])))
);

ALTER TABLE public.leave_balance_effects OWNER TO postgres;

CREATE TABLE public.leave_balances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    year integer NOT NULL,
    vacation_total numeric(4,2) DEFAULT 15,
    vacation_used numeric(10,4) DEFAULT 0,
    sick_total numeric(4,2) DEFAULT 10,
    sick_used numeric(10,4) DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.leave_balances OWNER TO postgres;

CREATE TABLE public.leave_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    leave_type public.leave_type NOT NULL,
    status public.leave_status DEFAULT 'pending'::public.leave_status,
    start_date date NOT NULL,
    end_date date NOT NULL,
    is_full_day boolean DEFAULT true,
    start_time time without time zone,
    end_time time without time zone,
    total_days numeric(10,4),
    reason text,
    admin_notes text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    selected_dates date[]
);

ALTER TABLE public.leave_requests OWNER TO postgres;

CREATE TABLE public.menu_item_merge_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_item_id uuid NOT NULL,
    target_item_id uuid NOT NULL,
    source_name text NOT NULL,
    target_name text NOT NULL,
    merge_note text,
    affected_rating_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    affected_request_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    merged_by uuid,
    merged_at timestamp with time zone DEFAULT now() NOT NULL,
    undone_by uuid,
    undone_at timestamp with time zone,
    undo_note text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT menu_item_merge_events_check CHECK ((source_item_id <> target_item_id))
);

ALTER TABLE public.menu_item_merge_events OWNER TO postgres;

CREATE TABLE public.menu_item_merges (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_name text NOT NULL,
    canonical_name text NOT NULL,
    merge_note text,
    merged_by uuid,
    merged_at timestamp with time zone DEFAULT now(),
    unmerged_at timestamp with time zone,
    unmerged_by uuid,
    unmerge_note text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT menu_item_merges_canonical_name_check CHECK ((length(btrim(canonical_name)) > 0)),
    CONSTRAINT menu_item_merges_check CHECK ((lower(btrim(source_name)) <> lower(btrim(canonical_name)))),
    CONSTRAINT menu_item_merges_source_name_check CHECK ((length(btrim(source_name)) > 0))
);

ALTER TABLE public.menu_item_merges OWNER TO postgres;

CREATE TABLE public.menu_item_tags (
    menu_item_id uuid NOT NULL,
    tag_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.menu_item_tags OWNER TO postgres;

CREATE TABLE public.menu_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category text,
    times_served integer DEFAULT 1,
    last_served_at date,
    average_rating numeric(3,1),
    total_ratings integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    normalized_name text NOT NULL,
    description text,
    aliases text[] DEFAULT '{}'::text[] NOT NULL,
    meal_types text[] DEFAULT '{}'::text[] NOT NULL,
    search_text text,
    active boolean DEFAULT true NOT NULL,
    created_by uuid,
    updated_by uuid,
    merged_into_id uuid,
    merged_at timestamp with time zone,
    merged_by uuid,
    merge_note text
);

ALTER TABLE public.menu_items OWNER TO postgres;

CREATE TABLE public.menu_ratings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    week_start date NOT NULL,
    day_of_week text NOT NULL,
    meal_type text NOT NULL,
    menu_item text NOT NULL,
    rating integer NOT NULL,
    rated_by uuid NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    menu_item_id uuid,
    CONSTRAINT menu_ratings_day_of_week_check CHECK ((day_of_week = ANY (ARRAY['Monday'::text, 'Tuesday'::text, 'Wednesday'::text, 'Thursday'::text, 'Friday'::text, 'Saturday'::text, 'Sunday'::text]))),
    CONSTRAINT menu_ratings_meal_type_check CHECK ((meal_type = ANY (ARRAY['breakfast'::text, 'lunch'::text, 'dinner'::text, 'snacks'::text]))),
    CONSTRAINT menu_ratings_rating_check CHECK (((rating >= 1) AND (rating <= 10)))
);

ALTER TABLE public.menu_ratings OWNER TO postgres;

CREATE TABLE public.menu_tag_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    sort_order integer DEFAULT 0 NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT menu_tag_groups_name_check CHECK ((length(btrim(name)) > 0)),
    CONSTRAINT menu_tag_groups_slug_check CHECK ((length(btrim(slug)) > 0))
);

ALTER TABLE public.menu_tag_groups OWNER TO postgres;

CREATE TABLE public.menu_tags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    color text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    label text,
    CONSTRAINT menu_tags_name_check CHECK ((length(btrim(name)) > 0)),
    CONSTRAINT menu_tags_slug_check CHECK ((length(btrim(slug)) > 0))
);

ALTER TABLE public.menu_tags OWNER TO postgres;

CREATE TABLE public.recipe_media (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipe_id uuid NOT NULL,
    media_type text NOT NULL,
    storage_type text NOT NULL,
    url text NOT NULL,
    title text,
    file_name text,
    file_size integer,
    mime_type text,
    is_hero boolean DEFAULT false,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    CONSTRAINT recipe_media_media_type_check CHECK ((media_type = ANY (ARRAY['image'::text, 'video'::text]))),
    CONSTRAINT recipe_media_storage_type_check CHECK ((storage_type = ANY (ARRAY['upload'::text, 'link'::text])))
);

ALTER TABLE public.recipe_media OWNER TO postgres;

CREATE TABLE public.recipes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    title_es text,
    title_zh text,
    description text,
    description_es text,
    description_zh text,
    ingredients jsonb DEFAULT '[]'::jsonb,
    instructions jsonb DEFAULT '[]'::jsonb,
    prep_time_minutes integer,
    cook_time_minutes integer,
    servings integer,
    source_url text,
    source_name text,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.recipes OWNER TO postgres;

CREATE TABLE public.schedule_one_offs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    schedule_date date NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid
);

ALTER TABLE public.schedule_one_offs OWNER TO postgres;

CREATE TABLE public.schedule_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    schedule_id uuid NOT NULL,
    override_date date NOT NULL,
    start_time time without time zone,
    end_time time without time zone,
    is_cancelled boolean DEFAULT false,
    notes text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT valid_override_times CHECK (((is_cancelled = true) OR ((start_time IS NOT NULL) AND (end_time IS NOT NULL) AND (end_time > start_time))))
);

ALTER TABLE public.schedule_overrides OWNER TO postgres;

CREATE TABLE public.sms_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    phone_number text NOT NULL,
    notification_type public.notification_type NOT NULL,
    message text NOT NULL,
    status public.notification_status DEFAULT 'pending'::public.notification_status,
    twilio_sid text,
    error_message text,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.sms_notifications OWNER TO postgres;

CREATE TABLE public.supply_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    description text,
    product_url text,
    status public.supply_request_status DEFAULT 'pending'::public.supply_request_status,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    admin_notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.supply_requests OWNER TO postgres;

CREATE TABLE public.task_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid,
    target_type public.assignment_target_type NOT NULL,
    target_user_id uuid,
    target_group_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT valid_assignment CHECK ((((target_type = 'user'::public.assignment_target_type) AND (target_user_id IS NOT NULL) AND (target_group_id IS NULL)) OR ((target_type = 'group'::public.assignment_target_type) AND (target_group_id IS NOT NULL) AND (target_user_id IS NULL)) OR ((target_type = ANY (ARRAY['all'::public.assignment_target_type, 'all_admins'::public.assignment_target_type])) AND (target_user_id IS NULL) AND (target_group_id IS NULL))))
);

ALTER TABLE public.task_assignments OWNER TO postgres;

CREATE TABLE public.task_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#6366f1'::text,
    icon text,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.task_categories OWNER TO postgres;

CREATE TABLE public.task_completions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    completion_date date NOT NULL,
    completed_by uuid,
    completed_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.task_completions OWNER TO postgres;

CREATE TABLE public.task_instance_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    instance_date date NOT NULL,
    override_time time without time zone,
    override_start_time time without time zone,
    override_end_time time without time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.task_instance_overrides OWNER TO postgres;

CREATE TABLE public.task_instances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    parent_task_id uuid,
    instance_date date NOT NULL,
    status public.task_status DEFAULT 'pending'::public.task_status,
    completed_by uuid,
    completed_at timestamp with time zone,
    title_override text,
    description_override text,
    google_calendar_event_id text,
    created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.task_instances OWNER TO postgres;

CREATE TABLE public.task_series (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    repeat_days integer[],
    repeat_interval text,
    start_date date NOT NULL,
    end_date date NOT NULL,
    CONSTRAINT task_series_check CHECK ((end_date >= start_date)),
    CONSTRAINT task_series_repeat_days_check CHECK (((repeat_days IS NULL) OR ((repeat_days <@ ARRAY[0, 1, 2, 3, 4, 5, 6]) AND (cardinality(repeat_days) > 0)))),
    CONSTRAINT task_series_repeat_interval_check CHECK ((repeat_interval = ANY (ARRAY['weekly'::text, 'biweekly'::text, 'monthly'::text])))
);

ALTER TABLE public.task_series OWNER TO postgres;

CREATE TABLE public.task_skipped_instances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    skipped_date date NOT NULL,
    skipped_by uuid,
    skipped_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.task_skipped_instances OWNER TO postgres;

CREATE TABLE public.task_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    title text NOT NULL,
    description text,
    category_id uuid,
    priority public.task_priority DEFAULT 'medium'::public.task_priority,
    is_all_day boolean DEFAULT false,
    default_time time without time zone,
    is_activity boolean DEFAULT false,
    start_time time without time zone,
    end_time time without time zone,
    is_recurring boolean DEFAULT false,
    recurrence_rule text,
    default_assignments jsonb DEFAULT '[]'::jsonb,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    default_viewers jsonb DEFAULT '[]'::jsonb,
    repeat_days integer[],
    repeat_interval text,
    CONSTRAINT valid_repeat_interval CHECK (((repeat_interval IS NULL) OR (repeat_interval = ANY (ARRAY['weekly'::text, 'biweekly'::text, 'monthly'::text]))))
);

ALTER TABLE public.task_templates OWNER TO postgres;

CREATE TABLE public.task_videos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid NOT NULL,
    video_type text NOT NULL,
    url text NOT NULL,
    title text,
    file_name text,
    file_size integer,
    mime_type text,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    CONSTRAINT task_videos_video_type_check CHECK ((video_type = ANY (ARRAY['upload'::text, 'link'::text])))
);

ALTER TABLE public.task_videos OWNER TO postgres;

CREATE TABLE public.task_viewers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    task_id uuid,
    target_type public.assignment_target_type NOT NULL,
    target_user_id uuid,
    target_group_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT valid_viewer CHECK ((((target_type = 'user'::public.assignment_target_type) AND (target_user_id IS NOT NULL) AND (target_group_id IS NULL)) OR ((target_type = 'group'::public.assignment_target_type) AND (target_group_id IS NOT NULL) AND (target_user_id IS NULL)) OR ((target_type = 'all'::public.assignment_target_type) AND (target_user_id IS NULL) AND (target_group_id IS NULL)) OR ((target_type = 'all_admins'::public.assignment_target_type) AND (target_user_id IS NULL) AND (target_group_id IS NULL))))
);

ALTER TABLE public.task_viewers OWNER TO postgres;

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    description text,
    category_id uuid,
    priority public.task_priority DEFAULT 'medium'::public.task_priority,
    status public.task_status DEFAULT 'pending'::public.task_status,
    due_date date,
    due_time time without time zone,
    is_all_day boolean DEFAULT true,
    is_recurring boolean DEFAULT false,
    recurrence_rule text,
    google_calendar_event_id text,
    sync_to_calendar boolean DEFAULT false,
    created_by uuid,
    completed_by uuid,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    title_es text,
    title_zh text,
    description_es text,
    description_zh text,
    source_locale text DEFAULT 'en'::text,
    is_activity boolean DEFAULT false,
    start_time time without time zone,
    end_time time without time zone,
    series_id uuid
);

ALTER TABLE public.tasks OWNER TO postgres;

CREATE TABLE public.template_videos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid NOT NULL,
    video_type text NOT NULL,
    url text NOT NULL,
    title text,
    file_name text,
    file_size integer,
    mime_type text,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    CONSTRAINT template_videos_video_type_check CHECK ((video_type = ANY (ARRAY['upload'::text, 'link'::text])))
);

ALTER TABLE public.template_videos OWNER TO postgres;

CREATE TABLE public.user_push_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token text NOT NULL,
    platform text DEFAULT 'ios'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT user_push_tokens_platform_check CHECK ((platform = ANY (ARRAY['ios'::text, 'android'::text, 'web'::text])))
);

ALTER TABLE public.user_push_tokens OWNER TO postgres;

CREATE TABLE public.users (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text NOT NULL,
    role public.user_role DEFAULT 'employee'::public.user_role NOT NULL,
    avatar_url text,
    phone text,
    sms_notifications_enabled boolean DEFAULT true,
    preferred_locale text DEFAULT 'en'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT users_preferred_locale_check CHECK ((preferred_locale = ANY (ARRAY['en'::text, 'es'::text, 'zh'::text])))
);

ALTER TABLE public.users OWNER TO postgres;

CREATE TABLE public.weekly_menu (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    week_start date DEFAULT (date_trunc('week'::text, (CURRENT_DATE)::timestamp with time zone))::date NOT NULL,
    meals jsonb DEFAULT '[]'::jsonb NOT NULL,
    notes text,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.weekly_menu OWNER TO postgres;

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.babysitter_availability_entries
    ADD CONSTRAINT babysitter_availability_entries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.babysitter_availability_templates
    ADD CONSTRAINT babysitter_availability_templates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.babysitter_availability_weeks
    ADD CONSTRAINT babysitter_availability_weeks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.babysitter_availability_weeks
    ADD CONSTRAINT babysitter_availability_weeks_user_id_week_start_key UNIQUE (user_id, week_start);

ALTER TABLE ONLY public.babysitter_booking_requests
    ADD CONSTRAINT babysitter_booking_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.child_logs
    ADD CONSTRAINT child_logs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.employee_group_memberships
    ADD CONSTRAINT employee_group_memberships_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.employee_group_memberships
    ADD CONSTRAINT employee_group_memberships_user_id_group_id_key UNIQUE (user_id, group_id);

ALTER TABLE ONLY public.employee_groups
    ADD CONSTRAINT employee_groups_name_key UNIQUE (name);

ALTER TABLE ONLY public.employee_groups
    ADD CONSTRAINT employee_groups_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.employee_profiles
    ADD CONSTRAINT employee_profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.employee_profiles
    ADD CONSTRAINT employee_profiles_user_id_key UNIQUE (user_id);

ALTER TABLE ONLY public.employee_schedules
    ADD CONSTRAINT employee_schedules_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.food_requests
    ADD CONSTRAINT food_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.google_calendar_synced_events
    ADD CONSTRAINT google_calendar_synced_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.google_calendar_synced_events
    ADD CONSTRAINT google_calendar_synced_events_user_id_event_type_source_id_key UNIQUE (user_id, event_type, source_id);

ALTER TABLE ONLY public.google_calendar_tokens
    ADD CONSTRAINT google_calendar_tokens_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.google_calendar_tokens
    ADD CONSTRAINT google_calendar_tokens_user_id_key UNIQUE (user_id);

ALTER TABLE ONLY public.leave_balance_effects
    ADD CONSTRAINT leave_balance_effects_pkey PRIMARY KEY (request_id, year, kind);

ALTER TABLE ONLY public.leave_balances
    ADD CONSTRAINT leave_balances_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.leave_balances
    ADD CONSTRAINT leave_balances_user_id_year_key UNIQUE (user_id, year);

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.menu_item_merge_events
    ADD CONSTRAINT menu_item_merge_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.menu_item_merges
    ADD CONSTRAINT menu_item_merges_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.menu_item_tags
    ADD CONSTRAINT menu_item_tags_pkey PRIMARY KEY (menu_item_id, tag_id);

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_name_key UNIQUE (name);

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.menu_ratings
    ADD CONSTRAINT menu_ratings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.menu_ratings
    ADD CONSTRAINT menu_ratings_week_start_day_of_week_meal_type_menu_item_rat_key UNIQUE (week_start, day_of_week, meal_type, menu_item, rated_by);

ALTER TABLE ONLY public.menu_tag_groups
    ADD CONSTRAINT menu_tag_groups_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.menu_tag_groups
    ADD CONSTRAINT menu_tag_groups_slug_key UNIQUE (slug);

ALTER TABLE ONLY public.menu_tags
    ADD CONSTRAINT menu_tags_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.menu_tags
    ADD CONSTRAINT menu_tags_slug_key UNIQUE (slug);

ALTER TABLE ONLY public.recipe_media
    ADD CONSTRAINT recipe_media_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.schedule_one_offs
    ADD CONSTRAINT schedule_one_offs_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.schedule_overrides
    ADD CONSTRAINT schedule_overrides_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.sms_notifications
    ADD CONSTRAINT sms_notifications_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.supply_requests
    ADD CONSTRAINT supply_requests_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.task_assignments
    ADD CONSTRAINT task_assignments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.task_categories
    ADD CONSTRAINT task_categories_name_key UNIQUE (name);

ALTER TABLE ONLY public.task_categories
    ADD CONSTRAINT task_categories_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.task_completions
    ADD CONSTRAINT task_completions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.task_instance_overrides
    ADD CONSTRAINT task_instance_overrides_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.task_instances
    ADD CONSTRAINT task_instances_parent_task_id_instance_date_key UNIQUE (parent_task_id, instance_date);

ALTER TABLE ONLY public.task_instances
    ADD CONSTRAINT task_instances_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.task_series
    ADD CONSTRAINT task_series_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.task_skipped_instances
    ADD CONSTRAINT task_skipped_instances_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.task_templates
    ADD CONSTRAINT task_templates_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.task_videos
    ADD CONSTRAINT task_videos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.task_viewers
    ADD CONSTRAINT task_viewers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.template_videos
    ADD CONSTRAINT template_videos_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.schedule_overrides
    ADD CONSTRAINT unique_schedule_override UNIQUE (schedule_id, override_date);

ALTER TABLE ONLY public.task_completions
    ADD CONSTRAINT unique_task_completion UNIQUE (task_id, completion_date);

ALTER TABLE ONLY public.task_instance_overrides
    ADD CONSTRAINT unique_task_override UNIQUE (task_id, instance_date);

ALTER TABLE ONLY public.task_skipped_instances
    ADD CONSTRAINT unique_task_skip UNIQUE (task_id, skipped_date);

ALTER TABLE ONLY public.user_push_tokens
    ADD CONSTRAINT user_push_tokens_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.user_push_tokens
    ADD CONSTRAINT user_push_tokens_user_id_token_key UNIQUE (user_id, token);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.weekly_menu
    ADD CONSTRAINT weekly_menu_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.weekly_menu
    ADD CONSTRAINT weekly_menu_week_start_key UNIQUE (week_start);

CREATE INDEX idx_attachments_target ON public.attachments USING btree (attachable_type, attachable_id);

CREATE INDEX idx_bs_avail_entries_user_date ON public.babysitter_availability_entries USING btree (user_id, entry_date);

CREATE INDEX idx_bs_avail_templates_user ON public.babysitter_availability_templates USING btree (user_id);

CREATE INDEX idx_bs_avail_weeks_user ON public.babysitter_availability_weeks USING btree (user_id, week_start);

CREATE INDEX idx_bs_booking_requests_date ON public.babysitter_booking_requests USING btree (request_date);

CREATE INDEX idx_bs_booking_requests_sitter ON public.babysitter_booking_requests USING btree (babysitter_id, status);

CREATE INDEX idx_child_logs_category ON public.child_logs USING btree (category);

CREATE INDEX idx_child_logs_child ON public.child_logs USING btree (child);

CREATE INDEX idx_child_logs_date ON public.child_logs USING btree (log_date);

CREATE INDEX idx_child_logs_logged_by ON public.child_logs USING btree (logged_by);

CREATE INDEX idx_employee_group_memberships_group ON public.employee_group_memberships USING btree (group_id);

CREATE INDEX idx_employee_group_memberships_user ON public.employee_group_memberships USING btree (user_id);

CREATE INDEX idx_employee_schedules_day ON public.employee_schedules USING btree (day_of_week);

CREATE INDEX idx_employee_schedules_user_id ON public.employee_schedules USING btree (user_id);

CREATE INDEX idx_food_requests_created_at ON public.food_requests USING btree (created_at DESC);

CREATE INDEX idx_food_requests_menu_item_id ON public.food_requests USING btree (menu_item_id);

CREATE INDEX idx_food_requests_recipe_id ON public.food_requests USING btree (recipe_id);

CREATE INDEX idx_food_requests_requested_by ON public.food_requests USING btree (requested_by);

CREATE INDEX idx_food_requests_status ON public.food_requests USING btree (status);

CREATE INDEX idx_leave_balances_user_year ON public.leave_balances USING btree (user_id, year);

CREATE INDEX idx_leave_requests_dates ON public.leave_requests USING btree (start_date, end_date);

CREATE INDEX idx_leave_requests_status ON public.leave_requests USING btree (status);

CREATE INDEX idx_leave_requests_user ON public.leave_requests USING btree (user_id);

CREATE INDEX idx_menu_item_merge_events_merged_at ON public.menu_item_merge_events USING btree (merged_at DESC);

CREATE INDEX idx_menu_item_merge_events_source ON public.menu_item_merge_events USING btree (source_item_id);

CREATE INDEX idx_menu_item_merge_events_target ON public.menu_item_merge_events USING btree (target_item_id);

CREATE INDEX idx_menu_item_merges_active_canonical ON public.menu_item_merges USING btree (lower(btrim(canonical_name))) WHERE (unmerged_at IS NULL);

CREATE UNIQUE INDEX idx_menu_item_merges_active_source ON public.menu_item_merges USING btree (lower(btrim(source_name))) WHERE (unmerged_at IS NULL);

CREATE INDEX idx_menu_item_merges_merged_at ON public.menu_item_merges USING btree (merged_at DESC);

CREATE INDEX idx_menu_item_tags_tag_id ON public.menu_item_tags USING btree (tag_id);

CREATE INDEX idx_menu_items_active_name ON public.menu_items USING btree (active, name);

CREATE INDEX idx_menu_items_aliases ON public.menu_items USING gin (aliases);

CREATE INDEX idx_menu_items_average_rating ON public.menu_items USING btree (average_rating DESC);

CREATE INDEX idx_menu_items_category ON public.menu_items USING btree (category);

CREATE INDEX idx_menu_items_meal_types ON public.menu_items USING gin (meal_types);

CREATE INDEX idx_menu_items_name ON public.menu_items USING btree (name);

CREATE INDEX idx_menu_items_normalized_name ON public.menu_items USING btree (normalized_name);

CREATE INDEX idx_menu_items_search_text ON public.menu_items USING btree (search_text);

CREATE INDEX idx_menu_ratings_menu_item ON public.menu_ratings USING btree (menu_item);

CREATE INDEX idx_menu_ratings_menu_item_id ON public.menu_ratings USING btree (menu_item_id);

CREATE INDEX idx_menu_ratings_rated_by ON public.menu_ratings USING btree (rated_by);

CREATE INDEX idx_menu_ratings_week_start ON public.menu_ratings USING btree (week_start);

CREATE INDEX idx_menu_tags_group_id ON public.menu_tags USING btree (group_id);

CREATE INDEX idx_menu_tags_slug ON public.menu_tags USING btree (slug);

CREATE INDEX idx_push_tokens_user_id ON public.user_push_tokens USING btree (user_id);

CREATE INDEX idx_recipe_media_is_hero ON public.recipe_media USING btree (recipe_id, is_hero) WHERE (is_hero = true);

CREATE INDEX idx_recipe_media_recipe_id ON public.recipe_media USING btree (recipe_id);

CREATE INDEX idx_recipes_created_at ON public.recipes USING btree (created_at DESC);

CREATE INDEX idx_recipes_created_by ON public.recipes USING btree (created_by);

CREATE INDEX idx_recipes_title ON public.recipes USING btree (title);

CREATE INDEX idx_schedule_one_offs_date ON public.schedule_one_offs USING btree (schedule_date);

CREATE INDEX idx_schedule_one_offs_user_date ON public.schedule_one_offs USING btree (user_id, schedule_date);

CREATE INDEX idx_schedule_overrides_date ON public.schedule_overrides USING btree (override_date);

CREATE INDEX idx_schedule_overrides_schedule_id ON public.schedule_overrides USING btree (schedule_id);

CREATE INDEX idx_supply_requests_created_at ON public.supply_requests USING btree (created_at DESC);

CREATE INDEX idx_supply_requests_status ON public.supply_requests USING btree (status);

CREATE INDEX idx_supply_requests_user_id ON public.supply_requests USING btree (user_id);

CREATE INDEX idx_synced_events_lookup ON public.google_calendar_synced_events USING btree (user_id, event_type, source_id);

CREATE INDEX idx_synced_events_user_type ON public.google_calendar_synced_events USING btree (user_id, event_type);

CREATE INDEX idx_task_assignments_group ON public.task_assignments USING btree (target_group_id);

CREATE INDEX idx_task_assignments_task ON public.task_assignments USING btree (task_id);

CREATE INDEX idx_task_assignments_user ON public.task_assignments USING btree (target_user_id);

CREATE INDEX idx_task_completions_date ON public.task_completions USING btree (completion_date);

CREATE INDEX idx_task_completions_task_id ON public.task_completions USING btree (task_id);

CREATE INDEX idx_task_instances_date ON public.task_instances USING btree (instance_date);

CREATE INDEX idx_task_instances_parent ON public.task_instances USING btree (parent_task_id);

CREATE INDEX idx_task_override_date ON public.task_instance_overrides USING btree (instance_date);

CREATE INDEX idx_task_override_task_id ON public.task_instance_overrides USING btree (task_id);

CREATE INDEX idx_task_skipped_date ON public.task_skipped_instances USING btree (skipped_date);

CREATE INDEX idx_task_skipped_task_id ON public.task_skipped_instances USING btree (task_id);

CREATE INDEX idx_task_templates_created_by ON public.task_templates USING btree (created_by);

CREATE INDEX idx_task_videos_task_id ON public.task_videos USING btree (task_id);

CREATE INDEX idx_task_viewers_target_group_id ON public.task_viewers USING btree (target_group_id);

CREATE INDEX idx_task_viewers_target_user_id ON public.task_viewers USING btree (target_user_id);

CREATE INDEX idx_task_viewers_task_id ON public.task_viewers USING btree (task_id);

CREATE INDEX idx_tasks_category ON public.tasks USING btree (category_id);

CREATE INDEX idx_tasks_created_by ON public.tasks USING btree (created_by);

CREATE INDEX idx_tasks_due_date ON public.tasks USING btree (due_date);

CREATE INDEX idx_tasks_status ON public.tasks USING btree (status);

CREATE INDEX idx_template_videos_template_id ON public.template_videos USING btree (template_id);

CREATE INDEX idx_users_email ON public.users USING btree (email);

CREATE INDEX idx_users_is_active ON public.users USING btree (is_active);

CREATE INDEX idx_users_role ON public.users USING btree (role);

CREATE INDEX idx_weekly_menu_week_start ON public.weekly_menu USING btree (week_start);

CREATE UNIQUE INDEX tasks_series_date_unique ON public.tasks USING btree (series_id, due_date) WHERE (series_id IS NOT NULL);

CREATE INDEX tasks_series_idx ON public.tasks USING btree (series_id) WHERE (series_id IS NOT NULL);

CREATE TRIGGER account_leave_approval AFTER INSERT OR UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.apply_leave_balance_effects();

CREATE TRIGGER employee_schedules_updated_at BEFORE UPDATE ON public.employee_schedules FOR EACH ROW EXECUTE FUNCTION public.update_employee_schedules_updated_at();

CREATE TRIGGER guard_task_series_identity BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.guard_task_series_identity();

CREATE TRIGGER guard_task_update BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.guard_task_update();

CREATE TRIGGER normalize_leave_request BEFORE INSERT OR UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.normalize_leave_request();

CREATE TRIGGER refund_leave_before_delete BEFORE DELETE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.apply_leave_balance_effects();

CREATE TRIGGER sync_menu_item_rating_stats AFTER INSERT OR DELETE OR UPDATE ON public.menu_ratings FOR EACH ROW EXECUTE FUNCTION public.sync_menu_item_rating_stats();

CREATE TRIGGER update_bs_avail_templates_updated_at BEFORE UPDATE ON public.babysitter_availability_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bs_avail_weeks_updated_at BEFORE UPDATE ON public.babysitter_availability_weeks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bs_booking_requests_updated_at BEFORE UPDATE ON public.babysitter_booking_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_child_logs_updated_at BEFORE UPDATE ON public.child_logs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_employee_profiles_updated_at BEFORE UPDATE ON public.employee_profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_food_requests_updated_at BEFORE UPDATE ON public.food_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_google_calendar_tokens_updated_at BEFORE UPDATE ON public.google_calendar_tokens FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_leave_balances_updated_at BEFORE UPDATE ON public.leave_balances FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_leave_requests_updated_at BEFORE UPDATE ON public.leave_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_menu_item_catalog_fields BEFORE INSERT OR UPDATE OF name, description, aliases, meal_types ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.update_menu_item_catalog_fields();

CREATE TRIGGER update_menu_item_merge_events_updated_at BEFORE UPDATE ON public.menu_item_merge_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_menu_item_merges_updated_at BEFORE UPDATE ON public.menu_item_merges FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_menu_items_updated_at BEFORE UPDATE ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_menu_ratings_updated_at BEFORE UPDATE ON public.menu_ratings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_menu_tag_groups_updated_at BEFORE UPDATE ON public.menu_tag_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_menu_tags_updated_at BEFORE UPDATE ON public.menu_tags FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_recipes_updated_at BEFORE UPDATE ON public.recipes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_supply_requests_updated_at BEFORE UPDATE ON public.supply_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_task_templates_updated_at BEFORE UPDATE ON public.task_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_weekly_menu_updated_at BEFORE UPDATE ON public.weekly_menu FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE ONLY public.attachments
    ADD CONSTRAINT attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.babysitter_availability_entries
    ADD CONSTRAINT babysitter_availability_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.babysitter_availability_templates
    ADD CONSTRAINT babysitter_availability_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.babysitter_availability_weeks
    ADD CONSTRAINT babysitter_availability_weeks_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.babysitter_booking_requests
    ADD CONSTRAINT babysitter_booking_requests_babysitter_id_fkey FOREIGN KEY (babysitter_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.babysitter_booking_requests
    ADD CONSTRAINT babysitter_booking_requests_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.babysitter_booking_requests
    ADD CONSTRAINT babysitter_booking_requests_one_off_id_fkey FOREIGN KEY (one_off_id) REFERENCES public.schedule_one_offs(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.child_logs
    ADD CONSTRAINT child_logs_logged_by_fkey FOREIGN KEY (logged_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.employee_group_memberships
    ADD CONSTRAINT employee_group_memberships_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.employee_groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.employee_group_memberships
    ADD CONSTRAINT employee_group_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.employee_profiles
    ADD CONSTRAINT employee_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.employee_schedules
    ADD CONSTRAINT employee_schedules_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.food_requests
    ADD CONSTRAINT food_requests_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.food_requests
    ADD CONSTRAINT food_requests_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.food_requests
    ADD CONSTRAINT food_requests_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.food_requests
    ADD CONSTRAINT food_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.google_calendar_synced_events
    ADD CONSTRAINT google_calendar_synced_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.google_calendar_tokens
    ADD CONSTRAINT google_calendar_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.leave_balance_effects
    ADD CONSTRAINT leave_balance_effects_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.leave_requests(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.leave_balances
    ADD CONSTRAINT leave_balances_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.menu_item_merge_events
    ADD CONSTRAINT menu_item_merge_events_merged_by_fkey FOREIGN KEY (merged_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.menu_item_merge_events
    ADD CONSTRAINT menu_item_merge_events_source_item_id_fkey FOREIGN KEY (source_item_id) REFERENCES public.menu_items(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.menu_item_merge_events
    ADD CONSTRAINT menu_item_merge_events_target_item_id_fkey FOREIGN KEY (target_item_id) REFERENCES public.menu_items(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.menu_item_merge_events
    ADD CONSTRAINT menu_item_merge_events_undone_by_fkey FOREIGN KEY (undone_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.menu_item_merges
    ADD CONSTRAINT menu_item_merges_merged_by_fkey FOREIGN KEY (merged_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.menu_item_merges
    ADD CONSTRAINT menu_item_merges_unmerged_by_fkey FOREIGN KEY (unmerged_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.menu_item_tags
    ADD CONSTRAINT menu_item_tags_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.menu_item_tags
    ADD CONSTRAINT menu_item_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.menu_tags(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_merged_by_fkey FOREIGN KEY (merged_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_merged_into_id_fkey FOREIGN KEY (merged_into_id) REFERENCES public.menu_items(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.menu_ratings
    ADD CONSTRAINT menu_ratings_menu_item_id_fkey FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.menu_ratings
    ADD CONSTRAINT menu_ratings_rated_by_fkey FOREIGN KEY (rated_by) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.menu_tag_groups
    ADD CONSTRAINT menu_tag_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.menu_tags
    ADD CONSTRAINT menu_tags_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.menu_tags
    ADD CONSTRAINT menu_tags_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.menu_tag_groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.recipe_media
    ADD CONSTRAINT recipe_media_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.recipe_media
    ADD CONSTRAINT recipe_media_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.schedule_one_offs
    ADD CONSTRAINT schedule_one_offs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.schedule_one_offs
    ADD CONSTRAINT schedule_one_offs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.schedule_overrides
    ADD CONSTRAINT schedule_overrides_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.schedule_overrides
    ADD CONSTRAINT schedule_overrides_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.employee_schedules(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.sms_notifications
    ADD CONSTRAINT sms_notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.supply_requests
    ADD CONSTRAINT supply_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.supply_requests
    ADD CONSTRAINT supply_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_assignments
    ADD CONSTRAINT task_assignments_target_group_id_fkey FOREIGN KEY (target_group_id) REFERENCES public.employee_groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_assignments
    ADD CONSTRAINT task_assignments_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_assignments
    ADD CONSTRAINT task_assignments_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_completions
    ADD CONSTRAINT task_completions_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.task_completions
    ADD CONSTRAINT task_completions_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_instance_overrides
    ADD CONSTRAINT task_instance_overrides_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.task_instance_overrides
    ADD CONSTRAINT task_instance_overrides_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_instances
    ADD CONSTRAINT task_instances_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.task_instances
    ADD CONSTRAINT task_instances_parent_task_id_fkey FOREIGN KEY (parent_task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_series
    ADD CONSTRAINT task_series_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.task_skipped_instances
    ADD CONSTRAINT task_skipped_instances_skipped_by_fkey FOREIGN KEY (skipped_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.task_skipped_instances
    ADD CONSTRAINT task_skipped_instances_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_templates
    ADD CONSTRAINT task_templates_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.task_categories(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.task_templates
    ADD CONSTRAINT task_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.task_videos
    ADD CONSTRAINT task_videos_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.task_videos
    ADD CONSTRAINT task_videos_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_viewers
    ADD CONSTRAINT task_viewers_target_group_id_fkey FOREIGN KEY (target_group_id) REFERENCES public.employee_groups(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_viewers
    ADD CONSTRAINT task_viewers_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.task_viewers
    ADD CONSTRAINT task_viewers_task_id_fkey FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.task_categories(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_series_id_fkey FOREIGN KEY (series_id) REFERENCES public.task_series(id);

ALTER TABLE ONLY public.template_videos
    ADD CONSTRAINT template_videos_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.template_videos
    ADD CONSTRAINT template_videos_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.task_templates(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.user_push_tokens
    ADD CONSTRAINT user_push_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.weekly_menu
    ADD CONSTRAINT weekly_menu_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;

CREATE POLICY "Admins and chefs can delete own ratings" ON public.menu_ratings FOR DELETE USING ((public.is_admin_or_chef() AND (rated_by = auth.uid())));

CREATE POLICY "Admins and chefs can delete recipe media" ON public.recipe_media FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))) OR (EXISTS ( SELECT 1
   FROM (public.employee_group_memberships egm
     JOIN public.employee_groups eg ON ((eg.id = egm.group_id)))
  WHERE ((egm.user_id = auth.uid()) AND (lower(eg.name) = 'chef'::text))))));

CREATE POLICY "Admins and chefs can delete recipes" ON public.recipes FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))) OR (EXISTS ( SELECT 1
   FROM (public.employee_group_memberships egm
     JOIN public.employee_groups eg ON ((eg.id = egm.group_id)))
  WHERE ((egm.user_id = auth.uid()) AND (lower(eg.name) = 'chef'::text))))));

CREATE POLICY "Admins and chefs can insert own ratings" ON public.menu_ratings FOR INSERT WITH CHECK ((public.is_admin_or_chef() AND (rated_by = auth.uid())));

CREATE POLICY "Admins and chefs can insert recipe media" ON public.recipe_media FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))) OR (EXISTS ( SELECT 1
   FROM (public.employee_group_memberships egm
     JOIN public.employee_groups eg ON ((eg.id = egm.group_id)))
  WHERE ((egm.user_id = auth.uid()) AND (lower(eg.name) = 'chef'::text))))));

CREATE POLICY "Admins and chefs can insert recipes" ON public.recipes FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))) OR (EXISTS ( SELECT 1
   FROM (public.employee_group_memberships egm
     JOIN public.employee_groups eg ON ((eg.id = egm.group_id)))
  WHERE ((egm.user_id = auth.uid()) AND (lower(eg.name) = 'chef'::text))))));

CREATE POLICY "Admins and chefs can manage weekly menu" ON public.weekly_menu USING (public.is_admin_or_chef()) WITH CHECK (public.is_admin_or_chef());

CREATE POLICY "Admins and chefs can update own ratings" ON public.menu_ratings FOR UPDATE USING ((public.is_admin_or_chef() AND (rated_by = auth.uid()))) WITH CHECK ((public.is_admin_or_chef() AND (rated_by = auth.uid())));

CREATE POLICY "Admins and chefs can update recipe media" ON public.recipe_media FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))) OR (EXISTS ( SELECT 1
   FROM (public.employee_group_memberships egm
     JOIN public.employee_groups eg ON ((eg.id = egm.group_id)))
  WHERE ((egm.user_id = auth.uid()) AND (lower(eg.name) = 'chef'::text))))));

CREATE POLICY "Admins and chefs can update recipes" ON public.recipes FOR UPDATE TO authenticated USING (((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))) OR (EXISTS ( SELECT 1
   FROM (public.employee_group_memberships egm
     JOIN public.employee_groups eg ON ((eg.id = egm.group_id)))
  WHERE ((egm.user_id = auth.uid()) AND (lower(eg.name) = 'chef'::text))))));

CREATE POLICY "Admins can create food requests" ON public.food_requests FOR INSERT WITH CHECK ((public.is_admin() AND (requested_by = auth.uid())));

CREATE POLICY "Admins can create leave requests for anyone" ON public.leave_requests FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "Admins can create menu item merges" ON public.menu_item_merges FOR INSERT WITH CHECK ((public.is_admin() AND (merged_by = auth.uid())));

CREATE POLICY "Admins can create tasks" ON public.tasks FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "Admins can delete attachments" ON public.attachments FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can delete employee profiles" ON public.employee_profiles FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can delete group memberships" ON public.employee_group_memberships FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can delete groups" ON public.employee_groups FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can delete leave balances" ON public.leave_balances FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can delete leave requests" ON public.leave_requests FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can delete own pending requests" ON public.food_requests FOR DELETE USING ((public.is_admin() AND (requested_by = auth.uid()) AND (status = 'pending'::text)));

CREATE POLICY "Admins can delete task assignments" ON public.task_assignments FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can delete task categories" ON public.task_categories FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can delete task instances" ON public.task_instances FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can delete tasks" ON public.tasks FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can delete users" ON public.users FOR DELETE TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can insert attachments" ON public.attachments FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "Admins can insert employee profiles" ON public.employee_profiles FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "Admins can insert group memberships" ON public.employee_group_memberships FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "Admins can insert groups" ON public.employee_groups FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "Admins can insert leave balances" ON public.leave_balances FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "Admins can insert sms notifications" ON public.sms_notifications FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "Admins can insert task assignments" ON public.task_assignments FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "Admins can insert task categories" ON public.task_categories FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "Admins can insert task instances" ON public.task_instances FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "Admins can insert users" ON public.users FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY "Admins can manage all child logs" ON public.child_logs USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins can manage all one-off schedules" ON public.schedule_one_offs USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));

CREATE POLICY "Admins can manage all schedule overrides" ON public.schedule_overrides USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));

CREATE POLICY "Admins can manage all schedules" ON public.employee_schedules USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));

CREATE POLICY "Admins can manage all task completions" ON public.task_completions USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));

CREATE POLICY "Admins can manage all task instance overrides" ON public.task_instance_overrides USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));

CREATE POLICY "Admins can manage all task skipped instances" ON public.task_skipped_instances USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));

CREATE POLICY "Admins can manage menu item merge events" ON public.menu_item_merge_events USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins can manage menu item tags" ON public.menu_item_tags USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins can manage menu items" ON public.menu_items USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins can manage menu tag groups" ON public.menu_tag_groups USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins can manage menu tags" ON public.menu_tags USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins can manage task videos" ON public.task_videos TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));

CREATE POLICY "Admins can manage task_viewers" ON public.task_viewers USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));

CREATE POLICY "Admins can manage template videos" ON public.template_videos TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));

CREATE POLICY "Admins can manage templates" ON public.task_templates USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));

CREATE POLICY "Admins can read all push tokens" ON public.user_push_tokens FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role)))));

CREATE POLICY "Admins can unmerge menu items" ON public.menu_item_merges FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update any employee profile" ON public.employee_profiles FOR UPDATE TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can update any leave request" ON public.leave_requests FOR UPDATE TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can update any task" ON public.tasks FOR UPDATE TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can update any task instance" ON public.task_instances FOR UPDATE TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can update any user" ON public.users FOR UPDATE TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can update groups" ON public.employee_groups FOR UPDATE TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can update leave balances" ON public.leave_balances FOR UPDATE TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can update own pending requests" ON public.food_requests FOR UPDATE USING ((public.is_admin() AND ((requested_by = auth.uid()) OR (status = 'pending'::text))));

CREATE POLICY "Admins can update sms notifications" ON public.sms_notifications FOR UPDATE TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can update supply requests" ON public.supply_requests FOR UPDATE TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can update task assignments" ON public.task_assignments FOR UPDATE TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can update task categories" ON public.task_categories FOR UPDATE TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can view all attachments" ON public.attachments FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can view all availability entries" ON public.babysitter_availability_entries FOR SELECT USING (public.is_admin());

CREATE POLICY "Admins can view all availability templates" ON public.babysitter_availability_templates FOR SELECT USING (public.is_admin());

CREATE POLICY "Admins can view all availability weeks" ON public.babysitter_availability_weeks FOR SELECT USING (public.is_admin());

CREATE POLICY "Admins can view all employee profiles" ON public.employee_profiles FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can view all google calendar tokens" ON public.google_calendar_tokens FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can view all leave balances" ON public.leave_balances FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can view all leave requests" ON public.leave_requests FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can view all sms notifications" ON public.sms_notifications FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can view all supply requests" ON public.supply_requests FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can view all task assignments" ON public.task_assignments FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can view all task instances" ON public.task_instances FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can view all tasks" ON public.tasks FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "Admins can view all users" ON public.users FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "Admins manage all booking requests" ON public.babysitter_booking_requests USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins manage task series" ON public.task_series TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY "Admins view leave accounting" ON public.leave_balance_effects FOR SELECT TO authenticated USING (public.is_admin());

CREATE POLICY "Assignees can record completions" ON public.task_completions FOR INSERT TO authenticated WITH CHECK ((public.can_access_task(task_id, 'complete'::text) AND (completed_by = auth.uid())));

CREATE POLICY "Assignees can undo completions" ON public.task_completions FOR DELETE TO authenticated USING (public.can_access_task(task_id, 'complete'::text));

CREATE POLICY "Assignees can update completions" ON public.task_completions FOR UPDATE TO authenticated USING (public.can_access_task(task_id, 'complete'::text)) WITH CHECK ((public.can_access_task(task_id, 'complete'::text) AND (completed_by = auth.uid())));

CREATE POLICY "Assignees can update task status" ON public.tasks FOR UPDATE TO authenticated USING (public.can_access_task(id, 'complete'::text)) WITH CHECK (public.can_access_task(id, 'complete'::text));

CREATE POLICY "Authenticated users can view all users" ON public.users FOR SELECT TO authenticated USING (true);

CREATE POLICY "Babysitters can view child logs during their shifts" ON public.child_logs FOR SELECT USING ((public.is_babysitter() AND public.child_log_in_my_shift(log_date, log_time, start_time, end_time)));

CREATE POLICY "Babysitters can view own booking requests" ON public.babysitter_booking_requests FOR SELECT USING ((babysitter_id = auth.uid()));

CREATE POLICY "Chefs can update request status" ON public.food_requests FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM (public.employee_group_memberships egm
     JOIN public.employee_groups eg ON ((egm.group_id = eg.id)))
  WHERE ((egm.user_id = auth.uid()) AND (lower(eg.name) = 'chef'::text)))));

CREATE POLICY "Employees can create own leave requests" ON public.leave_requests FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "Employees can delete own attachments" ON public.attachments FOR DELETE TO authenticated USING ((uploaded_by = auth.uid()));

CREATE POLICY "Employees can delete own pending requests" ON public.leave_requests FOR DELETE TO authenticated USING (((user_id = auth.uid()) AND (status = 'pending'::public.leave_status)));

CREATE POLICY "Employees can insert own profile attachments" ON public.attachments FOR INSERT TO authenticated WITH CHECK (((attachable_type = 'employee_profile'::public.attachable_type) AND (EXISTS ( SELECT 1
   FROM public.employee_profiles ep
  WHERE ((ep.id = attachments.attachable_id) AND (ep.user_id = auth.uid()))))));

CREATE POLICY "Employees can update assigned task instances" ON public.task_instances FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.id = task_instances.parent_task_id) AND public.is_assigned_to_task(t.id)))));

CREATE POLICY "Employees can update own pending requests" ON public.leave_requests FOR UPDATE TO authenticated USING (((user_id = auth.uid()) AND (status = 'pending'::public.leave_status))) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "Employees can update own profile" ON public.employee_profiles FOR UPDATE TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Employees can view assigned task instances" ON public.task_instances FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.id = task_instances.parent_task_id) AND public.is_assigned_to_task(t.id)))));

CREATE POLICY "Employees can view own leave balance" ON public.leave_balances FOR SELECT TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Employees can view own leave requests" ON public.leave_requests FOR SELECT TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Employees can view own one-off schedules" ON public.schedule_one_offs FOR SELECT USING ((user_id = auth.uid()));

CREATE POLICY "Employees can view own profile" ON public.employee_profiles FOR SELECT TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Employees can view own schedule overrides" ON public.schedule_overrides FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.employee_schedules
  WHERE ((employee_schedules.id = schedule_overrides.schedule_id) AND (employee_schedules.user_id = auth.uid())))));

CREATE POLICY "Employees can view own schedules" ON public.employee_schedules FOR SELECT USING ((user_id = auth.uid()));

CREATE POLICY "Employees can view own sms notifications" ON public.sms_notifications FOR SELECT TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Employees can view own task assignments" ON public.task_assignments FOR SELECT TO authenticated USING (((target_type = 'all'::public.assignment_target_type) OR (target_user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM public.employee_group_memberships
  WHERE ((employee_group_memberships.group_id = task_assignments.target_group_id) AND (employee_group_memberships.user_id = auth.uid()))))));

CREATE POLICY "Employees can view relevant attachments" ON public.attachments FOR SELECT TO authenticated USING ((((attachable_type = 'employee_profile'::public.attachable_type) AND (EXISTS ( SELECT 1
   FROM public.employee_profiles ep
  WHERE ((ep.id = attachments.attachable_id) AND (ep.user_id = auth.uid()))))) OR ((attachable_type = 'task'::public.attachable_type) AND (EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.id = attachments.attachable_id) AND public.is_assigned_to_task(t.id)))))));

CREATE POLICY "Employees can view task instance overrides" ON public.task_instance_overrides FOR SELECT USING (true);

CREATE POLICY "Employees can view task videos" ON public.task_videos FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.id = task_videos.task_id) AND ((EXISTS ( SELECT 1
           FROM public.task_assignments ta
          WHERE ((ta.task_id = t.id) AND ((ta.target_user_id = auth.uid()) OR (ta.target_type = 'all'::public.assignment_target_type) OR ((ta.target_type = 'group'::public.assignment_target_type) AND (EXISTS ( SELECT 1
                   FROM public.employee_group_memberships egm
                  WHERE ((egm.user_id = auth.uid()) AND (egm.group_id = ta.target_group_id))))))))) OR (EXISTS ( SELECT 1
           FROM public.task_viewers tv
          WHERE ((tv.task_id = t.id) AND ((tv.target_user_id = auth.uid()) OR (tv.target_type = 'all'::public.assignment_target_type) OR ((tv.target_type = 'group'::public.assignment_target_type) AND (EXISTS ( SELECT 1
                   FROM public.employee_group_memberships egm
                  WHERE ((egm.user_id = auth.uid()) AND (egm.group_id = tv.target_group_id))))))))))))));

CREATE POLICY "Employees can view template videos" ON public.template_videos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Everyone can view food requests" ON public.food_requests FOR SELECT USING (true);

CREATE POLICY "Everyone can view group memberships" ON public.employee_group_memberships FOR SELECT TO authenticated USING (true);

CREATE POLICY "Everyone can view groups" ON public.employee_groups FOR SELECT TO authenticated USING (true);

CREATE POLICY "Everyone can view menu item merge events" ON public.menu_item_merge_events FOR SELECT USING (true);

CREATE POLICY "Everyone can view menu item merges" ON public.menu_item_merges FOR SELECT USING (true);

CREATE POLICY "Everyone can view menu item tags" ON public.menu_item_tags FOR SELECT USING (true);

CREATE POLICY "Everyone can view menu items" ON public.menu_items FOR SELECT USING (true);

CREATE POLICY "Everyone can view menu ratings" ON public.menu_ratings FOR SELECT USING (true);

CREATE POLICY "Everyone can view menu tag groups" ON public.menu_tag_groups FOR SELECT USING (true);

CREATE POLICY "Everyone can view menu tags" ON public.menu_tags FOR SELECT USING (true);

CREATE POLICY "Everyone can view recipe media" ON public.recipe_media FOR SELECT TO authenticated USING (true);

CREATE POLICY "Everyone can view recipes" ON public.recipes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Everyone can view task categories" ON public.task_categories FOR SELECT TO authenticated USING (true);

CREATE POLICY "Everyone can view weekly menu" ON public.weekly_menu FOR SELECT USING (true);

CREATE POLICY "Nannies and Teachers can create child logs" ON public.child_logs FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ((public.users u
     JOIN public.employee_group_memberships egm ON ((u.id = egm.user_id)))
     JOIN public.employee_groups eg ON ((egm.group_id = eg.id)))
  WHERE ((u.id = auth.uid()) AND (eg.name = ANY (ARRAY['Nanny'::text, 'Teacher'::text]))))));

CREATE POLICY "Nannies and Teachers can view child logs" ON public.child_logs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ((public.users u
     JOIN public.employee_group_memberships egm ON ((u.id = egm.user_id)))
     JOIN public.employee_groups eg ON ((egm.group_id = eg.id)))
  WHERE ((u.id = auth.uid()) AND (eg.name = ANY (ARRAY['Nanny'::text, 'Teacher'::text]))))));

CREATE POLICY "Nannies and Teachers can view each others one-off schedules" ON public.schedule_one_offs FOR SELECT USING (((EXISTS ( SELECT 1
   FROM (public.employee_group_memberships egm
     JOIN public.employee_groups eg ON ((egm.group_id = eg.id)))
  WHERE ((egm.user_id = auth.uid()) AND (lower(eg.name) = ANY (ARRAY['nanny'::text, 'teacher'::text]))))) AND (EXISTS ( SELECT 1
   FROM (public.employee_group_memberships egm
     JOIN public.employee_groups eg ON ((egm.group_id = eg.id)))
  WHERE ((egm.user_id = schedule_one_offs.user_id) AND (lower(eg.name) = ANY (ARRAY['nanny'::text, 'teacher'::text])))))));

CREATE POLICY "Nannies and Teachers can view each others schedules" ON public.employee_schedules FOR SELECT USING (((EXISTS ( SELECT 1
   FROM (public.employee_group_memberships egm
     JOIN public.employee_groups eg ON ((egm.group_id = eg.id)))
  WHERE ((egm.user_id = auth.uid()) AND (lower(eg.name) = ANY (ARRAY['nanny'::text, 'teacher'::text]))))) AND (EXISTS ( SELECT 1
   FROM (public.employee_group_memberships egm
     JOIN public.employee_groups eg ON ((egm.group_id = eg.id)))
  WHERE ((egm.user_id = employee_schedules.user_id) AND (lower(eg.name) = ANY (ARRAY['nanny'::text, 'teacher'::text])))))));

CREATE POLICY "Service role can manage synced events" ON public.google_calendar_synced_events USING (true) WITH CHECK (true);

CREATE POLICY "Task audience can view completions" ON public.task_completions FOR SELECT TO authenticated USING (public.can_access_task(task_id, 'view'::text));

CREATE POLICY "Task audience can view tasks" ON public.tasks FOR SELECT TO authenticated USING (public.can_access_task(id, 'view'::text));

CREATE POLICY "Task audiences see their series" ON public.task_series FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.tasks t
  WHERE ((t.series_id = task_series.id) AND public.can_access_task(t.id, 'view'::text)))));

CREATE POLICY "Users can create own supply requests" ON public.supply_requests FOR INSERT WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can delete own google calendar tokens" ON public.google_calendar_tokens FOR DELETE TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Users can delete own pending supply requests" ON public.supply_requests FOR DELETE USING (((auth.uid() = user_id) AND (status = 'pending'::public.supply_request_status)));

CREATE POLICY "Users can delete own synced events" ON public.google_calendar_synced_events FOR DELETE USING ((auth.uid() = user_id));

CREATE POLICY "Users can delete their own logs" ON public.child_logs FOR DELETE USING ((logged_by = auth.uid()));

CREATE POLICY "Users can insert own google calendar tokens" ON public.google_calendar_tokens FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "Users can insert own synced events" ON public.google_calendar_synced_events FOR INSERT WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can manage their own push tokens" ON public.user_push_tokens USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));

CREATE POLICY "Users can update own google calendar tokens" ON public.google_calendar_tokens FOR UPDATE TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE TO authenticated USING ((auth.uid() = id)) WITH CHECK (((auth.uid() = id) AND (public.is_admin() OR (role = ( SELECT users_1.role
   FROM public.users users_1
  WHERE (users_1.id = auth.uid()))))));

CREATE POLICY "Users can update own synced events" ON public.google_calendar_synced_events FOR UPDATE USING ((auth.uid() = user_id));

CREATE POLICY "Users can update their own logs" ON public.child_logs FOR UPDATE USING ((logged_by = auth.uid())) WITH CHECK ((logged_by = auth.uid()));

CREATE POLICY "Users can view own google calendar tokens" ON public.google_calendar_tokens FOR SELECT TO authenticated USING ((user_id = auth.uid()));

CREATE POLICY "Users can view own profile" ON public.users FOR SELECT TO authenticated USING ((auth.uid() = id));

CREATE POLICY "Users can view own supply requests" ON public.supply_requests FOR SELECT USING ((auth.uid() = user_id));

CREATE POLICY "Users can view own synced events" ON public.google_calendar_synced_events FOR SELECT USING ((auth.uid() = user_id));

CREATE POLICY "Users can view their own synced events" ON public.google_calendar_synced_events FOR SELECT USING ((auth.uid() = user_id));

CREATE POLICY "Users can view their own viewer assignments" ON public.task_viewers FOR SELECT USING (((target_user_id = auth.uid()) OR (target_type = 'all'::public.assignment_target_type) OR ((target_type = 'all_admins'::public.assignment_target_type) AND (EXISTS ( SELECT 1
   FROM public.users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::public.user_role))))) OR ((target_type = 'group'::public.assignment_target_type) AND (EXISTS ( SELECT 1
   FROM public.employee_group_memberships
  WHERE ((employee_group_memberships.user_id = auth.uid()) AND (employee_group_memberships.group_id = task_viewers.target_group_id)))))));

CREATE POLICY "Users manage own availability entries" ON public.babysitter_availability_entries USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "Users manage own availability template" ON public.babysitter_availability_templates USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

CREATE POLICY "Users manage own availability weeks" ON public.babysitter_availability_weeks USING ((user_id = auth.uid())) WITH CHECK ((user_id = auth.uid()));

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.babysitter_availability_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.babysitter_availability_templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.babysitter_availability_weeks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.babysitter_booking_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.child_logs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.employee_group_memberships ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.employee_groups ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.employee_profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.employee_schedules ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.food_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.google_calendar_synced_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.google_calendar_tokens ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.leave_balance_effects ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.leave_balances ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.menu_item_merge_events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.menu_item_merges ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.menu_item_tags ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.menu_ratings ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.menu_tag_groups ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.menu_tags ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.recipe_media ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.schedule_one_offs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.schedule_overrides ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.sms_notifications ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.supply_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.task_assignments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.task_categories ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.task_completions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.task_instance_overrides ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.task_instances ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.task_series ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.task_skipped_instances ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.task_videos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.task_viewers ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.template_videos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.weekly_menu ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

GRANT ALL ON FUNCTION public.apply_leave_balance_effects() TO anon;
GRANT ALL ON FUNCTION public.apply_leave_balance_effects() TO authenticated;
GRANT ALL ON FUNCTION public.apply_leave_balance_effects() TO service_role;

REVOKE ALL ON FUNCTION public.apply_task_series_change(p_task_id uuid, p_changes jsonb, p_dates date[], p_assignments jsonb, p_viewers jsonb, p_videos jsonb, p_metadata jsonb, p_actor uuid, p_delete boolean, p_extend_only boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.apply_task_series_change(p_task_id uuid, p_changes jsonb, p_dates date[], p_assignments jsonb, p_viewers jsonb, p_videos jsonb, p_metadata jsonb, p_actor uuid, p_delete boolean, p_extend_only boolean) TO anon;
GRANT ALL ON FUNCTION public.apply_task_series_change(p_task_id uuid, p_changes jsonb, p_dates date[], p_assignments jsonb, p_viewers jsonb, p_videos jsonb, p_metadata jsonb, p_actor uuid, p_delete boolean, p_extend_only boolean) TO authenticated;
GRANT ALL ON FUNCTION public.apply_task_series_change(p_task_id uuid, p_changes jsonb, p_dates date[], p_assignments jsonb, p_viewers jsonb, p_videos jsonb, p_metadata jsonb, p_actor uuid, p_delete boolean, p_extend_only boolean) TO service_role;

REVOKE ALL ON FUNCTION public.calendar_visible_records(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calendar_visible_records(p_user_id uuid) TO anon;
GRANT ALL ON FUNCTION public.calendar_visible_records(p_user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.calendar_visible_records(p_user_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.can_access_task(p_task_id uuid, p_action text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.can_access_task(p_task_id uuid, p_action text) TO anon;
GRANT ALL ON FUNCTION public.can_access_task(p_task_id uuid, p_action text) TO authenticated;
GRANT ALL ON FUNCTION public.can_access_task(p_task_id uuid, p_action text) TO service_role;

GRANT ALL ON FUNCTION public.child_log_in_my_shift(p_log_date date, p_log_time time without time zone, p_start time without time zone, p_end time without time zone) TO anon;
GRANT ALL ON FUNCTION public.child_log_in_my_shift(p_log_date date, p_log_time time without time zone, p_start time without time zone, p_end time without time zone) TO authenticated;
GRANT ALL ON FUNCTION public.child_log_in_my_shift(p_log_date date, p_log_time time without time zone, p_start time without time zone, p_end time without time zone) TO service_role;

REVOKE ALL ON FUNCTION public.ensure_task_series(p_task_id uuid, p_days integer[], p_interval text, p_start date, p_end date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.ensure_task_series(p_task_id uuid, p_days integer[], p_interval text, p_start date, p_end date) TO anon;
GRANT ALL ON FUNCTION public.ensure_task_series(p_task_id uuid, p_days integer[], p_interval text, p_start date, p_end date) TO authenticated;
GRANT ALL ON FUNCTION public.ensure_task_series(p_task_id uuid, p_days integer[], p_interval text, p_start date, p_end date) TO service_role;

GRANT ALL ON FUNCTION public.guard_task_series_identity() TO anon;
GRANT ALL ON FUNCTION public.guard_task_series_identity() TO authenticated;
GRANT ALL ON FUNCTION public.guard_task_series_identity() TO service_role;

GRANT ALL ON FUNCTION public.guard_task_update() TO anon;
GRANT ALL ON FUNCTION public.guard_task_update() TO authenticated;
GRANT ALL ON FUNCTION public.guard_task_update() TO service_role;

GRANT ALL ON FUNCTION public.handle_new_user() TO anon;
GRANT ALL ON FUNCTION public.handle_new_user() TO authenticated;
GRANT ALL ON FUNCTION public.handle_new_user() TO service_role;

GRANT ALL ON FUNCTION public.has_removed_menu_catalog_term(input text) TO anon;
GRANT ALL ON FUNCTION public.has_removed_menu_catalog_term(input text) TO authenticated;
GRANT ALL ON FUNCTION public.has_removed_menu_catalog_term(input text) TO service_role;

GRANT ALL ON FUNCTION public.is_admin() TO anon;
GRANT ALL ON FUNCTION public.is_admin() TO authenticated;
GRANT ALL ON FUNCTION public.is_admin() TO service_role;

GRANT ALL ON FUNCTION public.is_admin_or_chef() TO anon;
GRANT ALL ON FUNCTION public.is_admin_or_chef() TO authenticated;
GRANT ALL ON FUNCTION public.is_admin_or_chef() TO service_role;

GRANT ALL ON FUNCTION public.is_assigned_to_task(p_task_id uuid) TO anon;
GRANT ALL ON FUNCTION public.is_assigned_to_task(p_task_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_assigned_to_task(p_task_id uuid) TO service_role;

GRANT ALL ON FUNCTION public.is_babysitter() TO anon;
GRANT ALL ON FUNCTION public.is_babysitter() TO authenticated;
GRANT ALL ON FUNCTION public.is_babysitter() TO service_role;

GRANT ALL ON FUNCTION public.is_likely_menu_catalog_item(input text) TO anon;
GRANT ALL ON FUNCTION public.is_likely_menu_catalog_item(input text) TO authenticated;
GRANT ALL ON FUNCTION public.is_likely_menu_catalog_item(input text) TO service_role;

GRANT ALL ON FUNCTION public.merge_menu_catalog_item_group(source_item_ids uuid[], target_item_id uuid, canonical_name text, merge_note text) TO anon;
GRANT ALL ON FUNCTION public.merge_menu_catalog_item_group(source_item_ids uuid[], target_item_id uuid, canonical_name text, merge_note text) TO authenticated;
GRANT ALL ON FUNCTION public.merge_menu_catalog_item_group(source_item_ids uuid[], target_item_id uuid, canonical_name text, merge_note text) TO service_role;

GRANT ALL ON FUNCTION public.merge_menu_catalog_items(source_item_id uuid, target_item_id uuid, merge_note text) TO anon;
GRANT ALL ON FUNCTION public.merge_menu_catalog_items(source_item_id uuid, target_item_id uuid, merge_note text) TO authenticated;
GRANT ALL ON FUNCTION public.merge_menu_catalog_items(source_item_id uuid, target_item_id uuid, merge_note text) TO service_role;

GRANT ALL ON FUNCTION public.normalize_leave_request() TO anon;
GRANT ALL ON FUNCTION public.normalize_leave_request() TO authenticated;
GRANT ALL ON FUNCTION public.normalize_leave_request() TO service_role;

GRANT ALL ON FUNCTION public.normalize_menu_item_name(input text) TO anon;
GRANT ALL ON FUNCTION public.normalize_menu_item_name(input text) TO authenticated;
GRANT ALL ON FUNCTION public.normalize_menu_item_name(input text) TO service_role;

GRANT ALL ON FUNCTION public.refresh_menu_item_rating_stats(target_menu_item_id uuid) TO anon;
GRANT ALL ON FUNCTION public.refresh_menu_item_rating_stats(target_menu_item_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.refresh_menu_item_rating_stats(target_menu_item_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.review_leave_request(p_request_id uuid, p_action text, p_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.review_leave_request(p_request_id uuid, p_action text, p_notes text) TO anon;
GRANT ALL ON FUNCTION public.review_leave_request(p_request_id uuid, p_action text, p_notes text) TO authenticated;
GRANT ALL ON FUNCTION public.review_leave_request(p_request_id uuid, p_action text, p_notes text) TO service_role;

REVOKE ALL ON FUNCTION public.sync_menu_catalog_from_history() FROM PUBLIC;
GRANT ALL ON FUNCTION public.sync_menu_catalog_from_history() TO anon;
GRANT ALL ON FUNCTION public.sync_menu_catalog_from_history() TO authenticated;
GRANT ALL ON FUNCTION public.sync_menu_catalog_from_history() TO service_role;

GRANT ALL ON FUNCTION public.sync_menu_item_rating_stats() TO anon;
GRANT ALL ON FUNCTION public.sync_menu_item_rating_stats() TO authenticated;
GRANT ALL ON FUNCTION public.sync_menu_item_rating_stats() TO service_role;

GRANT ALL ON FUNCTION public.unmerge_menu_catalog_items(merge_event_id uuid, undo_note text) TO anon;
GRANT ALL ON FUNCTION public.unmerge_menu_catalog_items(merge_event_id uuid, undo_note text) TO authenticated;
GRANT ALL ON FUNCTION public.unmerge_menu_catalog_items(merge_event_id uuid, undo_note text) TO service_role;

GRANT ALL ON FUNCTION public.update_employee_schedules_updated_at() TO anon;
GRANT ALL ON FUNCTION public.update_employee_schedules_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.update_employee_schedules_updated_at() TO service_role;

GRANT ALL ON FUNCTION public.update_menu_item_catalog_fields() TO anon;
GRANT ALL ON FUNCTION public.update_menu_item_catalog_fields() TO authenticated;
GRANT ALL ON FUNCTION public.update_menu_item_catalog_fields() TO service_role;

GRANT ALL ON FUNCTION public.update_updated_at_column() TO anon;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT ALL ON FUNCTION public.update_updated_at_column() TO service_role;

GRANT ALL ON TABLE public.attachments TO anon;
GRANT ALL ON TABLE public.attachments TO authenticated;
GRANT ALL ON TABLE public.attachments TO service_role;

GRANT ALL ON TABLE public.babysitter_availability_entries TO anon;
GRANT ALL ON TABLE public.babysitter_availability_entries TO authenticated;
GRANT ALL ON TABLE public.babysitter_availability_entries TO service_role;

GRANT ALL ON TABLE public.babysitter_availability_templates TO anon;
GRANT ALL ON TABLE public.babysitter_availability_templates TO authenticated;
GRANT ALL ON TABLE public.babysitter_availability_templates TO service_role;

GRANT ALL ON TABLE public.babysitter_availability_weeks TO anon;
GRANT ALL ON TABLE public.babysitter_availability_weeks TO authenticated;
GRANT ALL ON TABLE public.babysitter_availability_weeks TO service_role;

GRANT ALL ON TABLE public.babysitter_booking_requests TO anon;
GRANT ALL ON TABLE public.babysitter_booking_requests TO authenticated;
GRANT ALL ON TABLE public.babysitter_booking_requests TO service_role;

GRANT ALL ON TABLE public.child_logs TO anon;
GRANT ALL ON TABLE public.child_logs TO authenticated;
GRANT ALL ON TABLE public.child_logs TO service_role;

GRANT ALL ON TABLE public.employee_group_memberships TO anon;
GRANT ALL ON TABLE public.employee_group_memberships TO authenticated;
GRANT ALL ON TABLE public.employee_group_memberships TO service_role;

GRANT ALL ON TABLE public.employee_groups TO anon;
GRANT ALL ON TABLE public.employee_groups TO authenticated;
GRANT ALL ON TABLE public.employee_groups TO service_role;

GRANT ALL ON TABLE public.employee_profiles TO anon;
GRANT ALL ON TABLE public.employee_profiles TO authenticated;
GRANT ALL ON TABLE public.employee_profiles TO service_role;

GRANT ALL ON TABLE public.employee_schedules TO anon;
GRANT ALL ON TABLE public.employee_schedules TO authenticated;
GRANT ALL ON TABLE public.employee_schedules TO service_role;

GRANT ALL ON TABLE public.food_requests TO anon;
GRANT ALL ON TABLE public.food_requests TO authenticated;
GRANT ALL ON TABLE public.food_requests TO service_role;

GRANT ALL ON TABLE public.google_calendar_synced_events TO anon;
GRANT ALL ON TABLE public.google_calendar_synced_events TO authenticated;
GRANT ALL ON TABLE public.google_calendar_synced_events TO service_role;

GRANT ALL ON TABLE public.google_calendar_tokens TO anon;
GRANT ALL ON TABLE public.google_calendar_tokens TO authenticated;
GRANT ALL ON TABLE public.google_calendar_tokens TO service_role;

GRANT ALL ON TABLE public.leave_balance_effects TO anon;
GRANT ALL ON TABLE public.leave_balance_effects TO authenticated;
GRANT ALL ON TABLE public.leave_balance_effects TO service_role;

GRANT ALL ON TABLE public.leave_balances TO anon;
GRANT ALL ON TABLE public.leave_balances TO authenticated;
GRANT ALL ON TABLE public.leave_balances TO service_role;

GRANT ALL ON TABLE public.leave_requests TO anon;
GRANT ALL ON TABLE public.leave_requests TO authenticated;
GRANT ALL ON TABLE public.leave_requests TO service_role;

GRANT ALL ON TABLE public.menu_item_merge_events TO anon;
GRANT ALL ON TABLE public.menu_item_merge_events TO authenticated;
GRANT ALL ON TABLE public.menu_item_merge_events TO service_role;

GRANT ALL ON TABLE public.menu_item_merges TO anon;
GRANT ALL ON TABLE public.menu_item_merges TO authenticated;
GRANT ALL ON TABLE public.menu_item_merges TO service_role;

GRANT ALL ON TABLE public.menu_item_tags TO anon;
GRANT ALL ON TABLE public.menu_item_tags TO authenticated;
GRANT ALL ON TABLE public.menu_item_tags TO service_role;

GRANT ALL ON TABLE public.menu_items TO anon;
GRANT ALL ON TABLE public.menu_items TO authenticated;
GRANT ALL ON TABLE public.menu_items TO service_role;

GRANT ALL ON TABLE public.menu_ratings TO anon;
GRANT ALL ON TABLE public.menu_ratings TO authenticated;
GRANT ALL ON TABLE public.menu_ratings TO service_role;

GRANT ALL ON TABLE public.menu_tag_groups TO anon;
GRANT ALL ON TABLE public.menu_tag_groups TO authenticated;
GRANT ALL ON TABLE public.menu_tag_groups TO service_role;

GRANT ALL ON TABLE public.menu_tags TO anon;
GRANT ALL ON TABLE public.menu_tags TO authenticated;
GRANT ALL ON TABLE public.menu_tags TO service_role;

GRANT ALL ON TABLE public.recipe_media TO anon;
GRANT ALL ON TABLE public.recipe_media TO authenticated;
GRANT ALL ON TABLE public.recipe_media TO service_role;

GRANT ALL ON TABLE public.recipes TO anon;
GRANT ALL ON TABLE public.recipes TO authenticated;
GRANT ALL ON TABLE public.recipes TO service_role;

GRANT ALL ON TABLE public.schedule_one_offs TO anon;
GRANT ALL ON TABLE public.schedule_one_offs TO authenticated;
GRANT ALL ON TABLE public.schedule_one_offs TO service_role;

GRANT ALL ON TABLE public.schedule_overrides TO anon;
GRANT ALL ON TABLE public.schedule_overrides TO authenticated;
GRANT ALL ON TABLE public.schedule_overrides TO service_role;

GRANT ALL ON TABLE public.sms_notifications TO anon;
GRANT ALL ON TABLE public.sms_notifications TO authenticated;
GRANT ALL ON TABLE public.sms_notifications TO service_role;

GRANT ALL ON TABLE public.supply_requests TO anon;
GRANT ALL ON TABLE public.supply_requests TO authenticated;
GRANT ALL ON TABLE public.supply_requests TO service_role;

GRANT ALL ON TABLE public.task_assignments TO anon;
GRANT ALL ON TABLE public.task_assignments TO authenticated;
GRANT ALL ON TABLE public.task_assignments TO service_role;

GRANT ALL ON TABLE public.task_categories TO anon;
GRANT ALL ON TABLE public.task_categories TO authenticated;
GRANT ALL ON TABLE public.task_categories TO service_role;

GRANT ALL ON TABLE public.task_completions TO anon;
GRANT ALL ON TABLE public.task_completions TO authenticated;
GRANT ALL ON TABLE public.task_completions TO service_role;

GRANT ALL ON TABLE public.task_instance_overrides TO anon;
GRANT ALL ON TABLE public.task_instance_overrides TO authenticated;
GRANT ALL ON TABLE public.task_instance_overrides TO service_role;

GRANT ALL ON TABLE public.task_instances TO anon;
GRANT ALL ON TABLE public.task_instances TO authenticated;
GRANT ALL ON TABLE public.task_instances TO service_role;

GRANT ALL ON TABLE public.task_series TO anon;
GRANT ALL ON TABLE public.task_series TO authenticated;
GRANT ALL ON TABLE public.task_series TO service_role;

GRANT ALL ON TABLE public.task_skipped_instances TO anon;
GRANT ALL ON TABLE public.task_skipped_instances TO authenticated;
GRANT ALL ON TABLE public.task_skipped_instances TO service_role;

GRANT ALL ON TABLE public.task_templates TO anon;
GRANT ALL ON TABLE public.task_templates TO authenticated;
GRANT ALL ON TABLE public.task_templates TO service_role;

GRANT ALL ON TABLE public.task_videos TO anon;
GRANT ALL ON TABLE public.task_videos TO authenticated;
GRANT ALL ON TABLE public.task_videos TO service_role;

GRANT ALL ON TABLE public.task_viewers TO anon;
GRANT ALL ON TABLE public.task_viewers TO authenticated;
GRANT ALL ON TABLE public.task_viewers TO service_role;

GRANT ALL ON TABLE public.tasks TO anon;
GRANT ALL ON TABLE public.tasks TO authenticated;
GRANT ALL ON TABLE public.tasks TO service_role;

GRANT ALL ON TABLE public.template_videos TO anon;
GRANT ALL ON TABLE public.template_videos TO authenticated;
GRANT ALL ON TABLE public.template_videos TO service_role;

GRANT ALL ON TABLE public.user_push_tokens TO anon;
GRANT ALL ON TABLE public.user_push_tokens TO authenticated;
GRANT ALL ON TABLE public.user_push_tokens TO service_role;

GRANT ALL ON TABLE public.users TO anon;
GRANT ALL ON TABLE public.users TO authenticated;
GRANT ALL ON TABLE public.users TO service_role;

GRANT ALL ON TABLE public.weekly_menu TO anon;
GRANT ALL ON TABLE public.weekly_menu TO authenticated;
GRANT ALL ON TABLE public.weekly_menu TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;

SET search_path=public,extensions;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('avatars','avatars',true,NULL,NULL) ON CONFLICT(id) DO NOTHING;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('recipe-media','recipe-media',false,NULL,NULL) ON CONFLICT(id) DO NOTHING;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('task-videos','task-videos',true,NULL,ARRAY['video/mp4','video/webm','video/quicktime','video/x-msvideo','video/x-matroska','image/jpeg','image/jpg','image/png','image/webp','image/gif']::text[]) ON CONFLICT(id) DO NOTHING;
CREATE POLICY "Admins can delete task videos" ON "storage"."objects" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((bucket_id = 'task-videos'::text) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role))))));
CREATE POLICY "Admins can upload task videos" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((bucket_id = 'task-videos'::text) AND (EXISTS ( SELECT 1
   FROM users
  WHERE ((users.id = auth.uid()) AND (users.role = 'admin'::user_role))))));
CREATE POLICY "Anyone can view task videos" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO "public" USING ((bucket_id = 'task-videos'::text));
CREATE POLICY "Authenticated users can delete videos" ON "storage"."objects" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((bucket_id = 'task-videos'::text));
CREATE POLICY "Authenticated users can upload videos" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((bucket_id = 'task-videos'::text));
CREATE POLICY "Public avatar access" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO "public" USING ((bucket_id = 'avatars'::text));
CREATE POLICY "Public can view videos" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO "public" USING ((bucket_id = 'task-videos'::text));
CREATE POLICY "Users can delete own avatar" ON "storage"."objects" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "Users can update own avatar" ON "storage"."objects" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
CREATE POLICY "Users can upload own avatar" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((bucket_id = 'avatars'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));

-- Chef responses are separate from the household's original notes and request status.
ALTER TABLE public.food_requests ADD COLUMN note_revision uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.menu_ratings ADD COLUMN note_revision uuid NOT NULL DEFAULT gen_random_uuid();

CREATE FUNCTION public.track_food_note_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (TG_TABLE_NAME = 'food_requests' AND to_jsonb(NEW)->'notes' IS DISTINCT FROM to_jsonb(OLD)->'notes')
     OR (TG_TABLE_NAME = 'menu_ratings' AND to_jsonb(NEW)->'comment' IS DISTINCT FROM to_jsonb(OLD)->'comment') THEN
    NEW.note_revision := gen_random_uuid();
  ELSE
    -- Callers cannot reuse an old revision to acknowledge different wording.
    NEW.note_revision := OLD.note_revision;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER track_food_request_note_revision BEFORE UPDATE ON public.food_requests
FOR EACH ROW EXECUTE FUNCTION public.track_food_note_revision();
CREATE TRIGGER track_menu_rating_note_revision BEFORE UPDATE ON public.menu_ratings
FOR EACH ROW EXECUTE FUNCTION public.track_food_note_revision();

CREATE TABLE public.food_note_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  food_request_id uuid REFERENCES public.food_requests(id) ON DELETE CASCADE,
  menu_rating_id uuid REFERENCES public.menu_ratings(id) ON DELETE CASCADE,
  note_revision uuid NOT NULL,
  responded_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reply text CHECK (reply IS NULL OR (char_length(btrim(reply)) BETWEEN 1 AND 10000)),
  received_at timestamptz NOT NULL DEFAULT now(),
  replied_at timestamptz,
  CHECK (num_nonnulls(food_request_id, menu_rating_id) = 1),
  CHECK ((reply IS NULL) = (replied_at IS NULL)),
  UNIQUE (food_request_id, note_revision, responded_by),
  UNIQUE (menu_rating_id, note_revision, responded_by)
);

ALTER TABLE public.food_note_responses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.food_note_responses FROM anon, authenticated;
GRANT SELECT ON public.food_note_responses TO authenticated;
GRANT ALL ON public.food_note_responses TO service_role;
CREATE POLICY "Admins and chefs can read food note responses" ON public.food_note_responses
FOR SELECT TO authenticated USING (public.is_admin_or_chef());

CREATE FUNCTION public.can_respond_to_food_notes() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employee_group_memberships membership
    JOIN public.employee_groups chef_group ON chef_group.id = membership.group_id
    WHERE membership.user_id = auth.uid() AND lower(chef_group.name) = 'chef'
  );
$$;
REVOKE ALL ON FUNCTION public.can_respond_to_food_notes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_respond_to_food_notes() TO authenticated;

CREATE FUNCTION public.respond_to_food_note(
  p_source text, p_id uuid, p_note_revision uuid, p_reply text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor uuid := auth.uid();
  request_id uuid := CASE WHEN p_source = 'request' THEN p_id END;
  rating_id uuid := CASE WHEN p_source = 'rating' THEN p_id END;
  current_revision uuid;
  current_note text;
  existing_response public.food_note_responses;
  clean_reply text := nullif(btrim(p_reply, E' \t\n\r'), '');
BEGIN
  IF actor IS NULL OR NOT public.can_respond_to_food_notes() THEN
    RAISE EXCEPTION 'responseNotAllowed' USING ERRCODE = '42501';
  END IF;
  IF num_nonnulls(request_id, rating_id) <> 1 OR p_note_revision IS NULL
     OR (p_reply IS NOT NULL AND (clean_reply IS NULL OR char_length(clean_reply) > 10000)) THEN
    RAISE EXCEPTION 'invalidResponse' USING ERRCODE = '22023';
  END IF;

  -- Serialize against edits and other responses to this note.
  IF request_id IS NOT NULL THEN
    SELECT note_revision, notes INTO current_revision, current_note
    FROM public.food_requests WHERE id = request_id FOR UPDATE;
  ELSE
    SELECT note_revision, comment INTO current_revision, current_note
    FROM public.menu_ratings WHERE id = rating_id FOR UPDATE;
  END IF;
  IF current_revision IS DISTINCT FROM p_note_revision OR nullif(btrim(current_note, E' \t\n\r'), '') IS NULL THEN
    RAISE EXCEPTION 'noteChanged' USING ERRCODE = '40001';
  END IF;

  SELECT * INTO existing_response FROM public.food_note_responses
  WHERE food_request_id IS NOT DISTINCT FROM request_id
    AND menu_rating_id IS NOT DISTINCT FROM rating_id
    AND note_revision = p_note_revision AND responded_by = actor;

  IF FOUND THEN
    -- Repeated acknowledgements/retries are harmless; never erase a saved reply.
    IF clean_reply IS NULL OR clean_reply IS NOT DISTINCT FROM existing_response.reply THEN RETURN; END IF;
    IF existing_response.reply IS NOT NULL THEN
      RAISE EXCEPTION 'responseChanged' USING ERRCODE = '40001';
    END IF;
    UPDATE public.food_note_responses SET reply = clean_reply, replied_at = now()
    WHERE id = existing_response.id;
  ELSE
    INSERT INTO public.food_note_responses(food_request_id, menu_rating_id, note_revision, responded_by, reply, replied_at)
    VALUES (request_id, rating_id, p_note_revision, actor, clean_reply,
      CASE WHEN clean_reply IS NOT NULL THEN now() END);
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.respond_to_food_note(text, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_food_note(text, uuid, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Chefs rearrange a pasted week without retyping; feedback follows the dishes.
CREATE FUNCTION public.swap_menu_meals(
  p_week_start date, p_day_a text, p_meal_a text, p_day_b text, p_meal_b text,
  p_expected_updated_at timestamptz DEFAULT NULL
) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor uuid := auth.uid();
  menu public.weekly_menu;
  index_a integer;
  index_b integer;
  value_a jsonb;
  value_b jsonb;
  ratings_a uuid[];
  ratings_b uuid[];
  saved_at timestamptz;
BEGIN
  IF actor IS NULL OR NOT public.is_admin_or_chef() THEN
    RAISE EXCEPTION 'swapNotAllowed' USING ERRCODE = '42501';
  END IF;
  IF p_week_start IS NULL OR num_nulls(p_day_a, p_meal_a, p_day_b, p_meal_b) > 0
     OR NOT (ARRAY[p_day_a, p_day_b] <@ ARRAY['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
     OR NOT (ARRAY[p_meal_a, p_meal_b] <@ ARRAY['breakfast', 'lunch', 'dinner', 'snacks'])
     OR (p_day_a = p_day_b AND p_meal_a = p_meal_b) THEN
    RAISE EXCEPTION 'invalidSwap' USING ERRCODE = '22023';
  END IF;

  -- Lock the week so concurrent edits and swaps apply one at a time.
  SELECT * INTO menu FROM public.weekly_menu WHERE week_start = p_week_start FOR UPDATE;
  IF NOT FOUND OR (p_expected_updated_at IS NOT NULL AND menu.updated_at IS DISTINCT FROM p_expected_updated_at) THEN
    RAISE EXCEPTION 'menuChanged' USING ERRCODE = '40001';
  END IF;
  IF jsonb_typeof(menu.meals) <> 'array' THEN
    RAISE EXCEPTION 'invalidSwap' USING ERRCODE = '22023';
  END IF;

  SELECT (day_meals.ordinality - 1)::integer INTO index_a
  FROM jsonb_array_elements(menu.meals) WITH ORDINALITY AS day_meals(value, ordinality)
  WHERE jsonb_typeof(day_meals.value) = 'object' AND day_meals.value ->> 'day' = p_day_a
  LIMIT 1;
  SELECT (day_meals.ordinality - 1)::integer INTO index_b
  FROM jsonb_array_elements(menu.meals) WITH ORDINALITY AS day_meals(value, ordinality)
  WHERE jsonb_typeof(day_meals.value) = 'object' AND day_meals.value ->> 'day' = p_day_b
  LIMIT 1;
  IF index_a IS NULL OR index_b IS NULL THEN
    RAISE EXCEPTION 'invalidSwap' USING ERRCODE = '22023';
  END IF;

  value_a := menu.meals -> index_a -> p_meal_a;
  value_b := menu.meals -> index_b -> p_meal_b;
  IF value_a IS NULL OR jsonb_typeof(value_a) <> 'string' THEN value_a := '""'::jsonb; END IF;
  IF value_b IS NULL OR jsonb_typeof(value_b) <> 'string' THEN value_b := '""'::jsonb; END IF;

  UPDATE public.weekly_menu
  SET meals = jsonb_set(jsonb_set(meals, ARRAY[index_a::text, p_meal_a], value_b, true), ARRAY[index_b::text, p_meal_b], value_a, true),
      updated_by = actor,
      updated_at = now()
  WHERE id = menu.id
  RETURNING updated_at INTO saved_at;

  -- Feedback stays with the dishes that moved. Park one side first so the
  -- unique key (week, day, meal, dish, rater) never collides mid-swap.
  SELECT coalesce(array_agg(id), '{}') INTO ratings_a FROM public.menu_ratings
  WHERE week_start = p_week_start AND day_of_week = p_day_a AND meal_type = p_meal_a;
  SELECT coalesce(array_agg(id), '{}') INTO ratings_b FROM public.menu_ratings
  WHERE week_start = p_week_start AND day_of_week = p_day_b AND meal_type = p_meal_b;
  UPDATE public.menu_ratings SET week_start = 'infinity' WHERE id = ANY(ratings_a);
  UPDATE public.menu_ratings SET day_of_week = p_day_a, meal_type = p_meal_a WHERE id = ANY(ratings_b);
  UPDATE public.menu_ratings SET week_start = p_week_start, day_of_week = p_day_b, meal_type = p_meal_b WHERE id = ANY(ratings_a);

  RETURN saved_at;
END;
$$;
REVOKE ALL ON FUNCTION public.swap_menu_meals(date, text, text, text, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.swap_menu_meals(date, text, text, text, text, timestamptz) TO authenticated;

NOTIFY pgrst, 'reload schema';


-- Mark the historical chain covered by this fresh baseline so CLI tooling cannot replay it.
CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations(version text PRIMARY KEY, statements text[], name text);
INSERT INTO supabase_migrations.schema_migrations(version,name) VALUES
('001','initial_schema'),
('002','rls_policies'),
('003','supply_requests'),
('004','task_translations'),
('005','avatar_storage'),
('006','task_activity'),
('007','child_logs'),
('008','add_sleep_times'),
('009','weekly_menu'),
('010','menu_ratings'),
('011','food_requests'),
('012','leave_selected_dates'),
('013','task_templates'),
('014','employee_schedules'),
('015','fix_holiday_leave_type'),
('016','schedule_overrides'),
('017','task_completions'),
('018','task_skipped_instances'),
('019','task_viewers'),
('020','task_videos'),
('021','template_videos'),
('022','rename_pto_to_vacation'),
('023','remove_recurring_tasks'),
('024','schedule_one_offs'),
('025','template_viewers'),
('026','chef_menu_permissions'),
('027','nanny_teacher_schedule_visibility'),
('028','update_task_categories'),
('029','recipes'),
('030','chef_recipe_permissions'),
('031','google_calendar_sync'),
('034','menu_item_merges'),
('035','menu_catalog_tags'),
('036','allow_split_shift_one_offs'),
('037','babysitter_role_and_availability'),
('038','menu_tag_labels_and_defaults'),
('20260101000000','add_push_tokens'),
('20260504000000','repair_auth_user_creation_trigger'),
('20260627184000','clean_menu_catalog_seed'),
('20260627190000','admin_catalog_merge_tools'),
('20260627223000','resync_menu_catalog_core_tags'),
('20260906165000','preserve_legacy_task_history'),
('20260906170000','task_permissions'),
('20260906180000','task_series'),
('20260906190000','leave_arithmetic'),
('20260908160000','food_note_responses'),
('20260911170000','swap_menu_meals')
ON CONFLICT(version) DO NOTHING;
