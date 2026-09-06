-- Physical occurrences are the write model. Legacy masters/completions remain history.
-- The enum/UI already support all_admins; the original constraint did not.
ALTER TABLE public.task_assignments DROP CONSTRAINT IF EXISTS valid_assignment;
ALTER TABLE public.task_assignments ADD CONSTRAINT valid_assignment CHECK (
  (target_type='user' AND target_user_id IS NOT NULL AND target_group_id IS NULL) OR
  (target_type='group' AND target_group_id IS NOT NULL AND target_user_id IS NULL) OR
  (target_type IN ('all','all_admins') AND target_user_id IS NULL AND target_group_id IS NULL)
);
CREATE TABLE public.task_series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  repeat_days integer[],
  repeat_interval text CHECK (repeat_interval IN ('weekly','biweekly','monthly')),
  start_date date NOT NULL,
  end_date date NOT NULL CHECK (end_date >= start_date),
  CHECK (repeat_days IS NULL OR (repeat_days <@ ARRAY[0,1,2,3,4,5,6] AND cardinality(repeat_days)>0))
);
ALTER TABLE public.tasks ADD COLUMN series_id uuid REFERENCES public.task_series(id);
CREATE INDEX tasks_series_idx ON public.tasks(series_id) WHERE series_id IS NOT NULL;
CREATE UNIQUE INDEX tasks_series_date_unique ON public.tasks(series_id,due_date) WHERE series_id IS NOT NULL;
CREATE FUNCTION public.guard_task_series_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.series_id IS NOT NULL AND NEW.series_id IS DISTINCT FROM OLD.series_id THEN
    RAISE EXCEPTION 'A task series identity cannot change';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_task_series_identity BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.guard_task_series_identity();
ALTER TABLE public.task_series ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage task series" ON public.task_series FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Task audiences see their series" ON public.task_series FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.series_id=task_series.id AND public.can_access_task(t.id,'view')));
GRANT SELECT,INSERT,UPDATE,DELETE ON public.task_series TO authenticated,service_role;

-- Only the exact timestamp used by the former bulk insert is evidence of a batch.
-- Ambiguous batches, duplicate dates, and legacy RRULE masters are left untouched.
DO $$
DECLARE b record; series uuid;
BEGIN
  FOR b IN
    SELECT title,created_by,created_at,min(due_date) first_date,max(due_date) last_date
    FROM public.tasks WHERE NOT is_recurring AND due_date IS NOT NULL AND series_id IS NULL
    GROUP BY title,created_by,created_at
    HAVING count(*)>1 AND count(*)=count(DISTINCT due_date)
  LOOP
    INSERT INTO public.task_series(created_by,created_at,start_date,end_date)
    VALUES(b.created_by,b.created_at,b.first_date,b.last_date) RETURNING id INTO series;
    UPDATE public.tasks SET series_id=series
    WHERE title=b.title AND created_at=b.created_at AND created_by IS NOT DISTINCT FROM b.created_by
      AND NOT is_recurring AND due_date IS NOT NULL AND series_id IS NULL;
  END LOOP;
END $$;

CREATE FUNCTION public.ensure_task_series(p_task_id uuid,p_days integer[],p_interval text,p_start date,p_end date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
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
REVOKE ALL ON FUNCTION public.ensure_task_series(uuid,integer[],text,date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_task_series(uuid,integer[],text,date,date) TO service_role;

-- Lock occurrences and perform schedule, content, and audience changes together.
-- Completed rows are immutable to this operation, including their assignments/media.
CREATE FUNCTION public.apply_task_series_change(
  p_task_id uuid,p_changes jsonb,p_dates date[] DEFAULT NULL,
  p_assignments jsonb DEFAULT NULL,p_viewers jsonb DEFAULT NULL,p_videos jsonb DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL,p_actor uuid DEFAULT NULL,p_delete boolean DEFAULT false,p_extend_only boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
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
REVOKE ALL ON FUNCTION public.apply_task_series_change(uuid,jsonb,date[],jsonb,jsonb,jsonb,jsonb,uuid,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_task_series_change(uuid,jsonb,date[],jsonb,jsonb,jsonb,jsonb,uuid,boolean,boolean) TO service_role;
