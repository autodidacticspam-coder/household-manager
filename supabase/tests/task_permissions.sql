-- Run with the isolated fixtures from scripts/check-database.mjs; caller rolls back.
DO $$
DECLARE actor uuid := '00000000-0000-4000-8000-000000000001';
  employee uuid := '00000000-0000-4000-8000-000000000002';
  assigned uuid; viewed uuid; hidden uuid;
BEGIN
  INSERT INTO public.tasks(title,created_by) VALUES('Assigned fixture',actor) RETURNING id INTO assigned;
  INSERT INTO public.tasks(title,created_by) VALUES('Viewed fixture',actor) RETURNING id INTO viewed;
  INSERT INTO public.tasks(title,created_by) VALUES('Hidden fixture',actor) RETURNING id INTO hidden;
  INSERT INTO public.task_assignments(task_id,target_type,target_user_id) VALUES(assigned,'user',employee);
  INSERT INTO public.task_viewers(task_id,target_type,target_user_id) VALUES(viewed,'user',employee);
  PERFORM set_config('request.jwt.claim.sub',employee::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  IF NOT public.can_access_task(assigned,'view') OR NOT public.can_access_task(assigned,'complete') THEN RAISE EXCEPTION 'Assignee lost access'; END IF;
  IF NOT public.can_access_task(viewed,'view') OR public.can_access_task(viewed,'complete') OR public.can_access_task(viewed,'edit') THEN RAISE EXCEPTION 'Viewer permission mismatch'; END IF;
  IF public.can_access_task(hidden,'view') OR public.can_access_task(hidden,'complete') THEN RAISE EXCEPTION 'Unassigned task exposed'; END IF;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  IF NOT public.can_access_task(hidden,'edit') THEN RAISE EXCEPTION 'Admin lost edit access'; END IF;
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  IF NOT COALESCE((public.calendar_visible_records(employee)->'tasks') @> to_jsonb(ARRAY[assigned,viewed]),false) THEN RAISE EXCEPTION 'Calendar export omitted accessible tasks'; END IF;
  IF (public.calendar_visible_records(employee)->'tasks') @> to_jsonb(ARRAY[hidden]) THEN RAISE EXCEPTION 'Calendar export exposed an unassigned task'; END IF;
  PERFORM set_config('request.jwt.claim.sub',employee::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF EXISTS(SELECT 1 FROM public.tasks WHERE id=hidden) THEN RAISE EXCEPTION 'RLS exposed unassigned task'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tasks WHERE id=viewed) THEN RAISE EXCEPTION 'RLS hid viewed task'; END IF;
  UPDATE public.tasks SET status='completed',completed_by=actor WHERE id=assigned;
  IF NOT EXISTS(SELECT 1 FROM public.tasks WHERE id=assigned AND completed_by=employee) THEN RAISE EXCEPTION 'Completion attributed to another user'; END IF;
  EXECUTE 'RESET ROLE';
END $$;
