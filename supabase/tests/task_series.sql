-- Run in a transaction after migrations; the caller rolls it back.
DO $$
DECLARE actor uuid; sid uuid; a uuid; b uuid; c uuid; unrelated uuid; outcome jsonb; before_history jsonb;
BEGIN
  SELECT id INTO actor FROM public.users WHERE role='admin' ORDER BY id LIMIT 1;
  INSERT INTO public.task_series(created_by,start_date,end_date,repeat_days,repeat_interval)
    VALUES(actor,'2026-09-07','2026-09-28',ARRAY[1],'weekly') RETURNING id INTO sid;
  INSERT INTO public.tasks(title,series_id,due_date,created_by) VALUES('Series trial',sid,'2026-09-07',actor) RETURNING id INTO a;
  INSERT INTO public.tasks(title,series_id,due_date,created_by,status,completed_by,completed_at)
    VALUES('Series trial',sid,'2026-09-14',actor,'completed',actor,now()) RETURNING id INTO b;
  INSERT INTO public.tasks(title,series_id,due_date,created_by) VALUES('Series trial',sid,'2026-09-21',actor) RETURNING id INTO c;
  INSERT INTO public.tasks(title,due_date,created_by) VALUES('Series trial','2026-09-21',actor) RETURNING id INTO unrelated;
  INSERT INTO public.task_assignments(task_id,target_type) VALUES(a,'all'),(b,'all'),(c,'all');
  SELECT to_jsonb(t) INTO before_history FROM public.tasks t WHERE id=b;
  outcome := public.apply_task_series_change(a,'{"title":"Renamed series"}',ARRAY['2026-09-14','2026-09-28']::date[],
    '[{"targetType":"all_admins"}]','[]','[]','{"repeatDays":[1],"repeatInterval":"weekly","repeatEndDate":"2026-09-28"}',actor);
  IF (SELECT to_jsonb(t) FROM public.tasks t WHERE id=b) IS DISTINCT FROM before_history THEN RAISE EXCEPTION 'Completed history changed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.task_assignments WHERE task_id=b AND target_type='all') THEN RAISE EXCEPTION 'Completed assignment changed'; END IF;
  IF EXISTS(SELECT 1 FROM public.tasks WHERE id=c) THEN RAISE EXCEPTION 'Removed occurrence survived'; END IF;
  IF (SELECT count(*) FROM public.tasks WHERE series_id=sid AND due_date='2026-09-14')<>1 THEN RAISE EXCEPTION 'Completed occurrence duplicated'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tasks WHERE series_id=sid AND due_date='2026-09-28' AND title='Renamed series') THEN RAISE EXCEPTION 'New occurrence missing'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.tasks WHERE id=unrelated AND series_id IS NULL AND title='Series trial') THEN RAISE EXCEPTION 'Unrelated task changed'; END IF;
  IF (outcome->'createdIds') IS NULL OR jsonb_array_length(outcome->'createdIds')<>1 THEN RAISE EXCEPTION 'Incorrect created count'; END IF;
  -- Repeating the same edit cannot duplicate dates.
  PERFORM public.apply_task_series_change(a,'{}',ARRAY['2026-09-14','2026-09-28']::date[]);
  IF (SELECT count(*) FROM public.tasks WHERE series_id=sid)<>3 THEN RAISE EXCEPTION 'Repeated edit duplicated dates'; END IF;
  PERFORM public.apply_task_series_change(a,'{}',p_delete=>true);
  IF (SELECT count(*) FROM public.tasks WHERE series_id=sid)<>1 OR NOT EXISTS(SELECT 1 FROM public.tasks WHERE id=b) THEN RAISE EXCEPTION 'Future deletion removed history'; END IF;
END $$;
