-- Shared task permissions for RLS, API actions, and calendar exports.
-- Existing assignments/viewers and household history are preserved.
CREATE OR REPLACE FUNCTION public.can_access_task(p_task_id uuid, p_action text DEFAULT 'view')
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
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
REVOKE ALL ON FUNCTION public.can_access_task(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_task(uuid,text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Employees can view assigned tasks" ON public.tasks;
DROP POLICY IF EXISTS "Employees can view tasks they are viewers of" ON public.tasks;
CREATE POLICY "Task audience can view tasks" ON public.tasks FOR SELECT TO authenticated USING (public.can_access_task(id,'view'));
DROP POLICY IF EXISTS "Employees can update assigned task status" ON public.tasks;
CREATE POLICY "Assignees can update task status" ON public.tasks FOR UPDATE TO authenticated
  USING (public.can_access_task(id,'complete')) WITH CHECK (public.can_access_task(id,'complete'));

-- RLS limits rows; the trigger also prevents assignees from editing content or
-- forging another person's completion through the direct database API.
CREATE OR REPLACE FUNCTION public.guard_task_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
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
DROP TRIGGER IF EXISTS guard_task_update ON public.tasks;
CREATE TRIGGER guard_task_update BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.guard_task_update();

DROP POLICY IF EXISTS "Employees can view task completions" ON public.task_completions;
DROP POLICY IF EXISTS "Employees can create task completions" ON public.task_completions;
CREATE POLICY "Task audience can view completions" ON public.task_completions FOR SELECT TO authenticated USING (public.can_access_task(task_id,'view'));
CREATE POLICY "Assignees can record completions" ON public.task_completions FOR INSERT TO authenticated
  WITH CHECK (public.can_access_task(task_id,'complete') AND completed_by=auth.uid());
CREATE POLICY "Assignees can update completions" ON public.task_completions FOR UPDATE TO authenticated
  USING (public.can_access_task(task_id,'complete')) WITH CHECK (public.can_access_task(task_id,'complete') AND completed_by=auth.uid());
CREATE POLICY "Assignees can undo completions" ON public.task_completions FOR DELETE TO authenticated USING (public.can_access_task(task_id,'complete'));

-- Background calendar work has no browser session. This service-only function
-- evaluates the same audience/role/shift rules with the destination user's ID.
CREATE OR REPLACE FUNCTION public.calendar_visible_records(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
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
REVOKE ALL ON FUNCTION public.calendar_visible_records(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calendar_visible_records(uuid) TO service_role;
