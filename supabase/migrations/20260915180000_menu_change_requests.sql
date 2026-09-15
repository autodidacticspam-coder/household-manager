-- Menu requests and their notifications commit together with the menu change.
CREATE FUNCTION public.save_weekly_menu(p_week_start date, p_meals jsonb, p_notes text, p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE menu public.weekly_menu;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_or_chef() THEN
    RAISE EXCEPTION 'saveNotAllowed' USING ERRCODE = '42501';
  END IF;
  IF p_week_start IS NULL OR extract(isodow FROM p_week_start) <> 1 OR p_meals IS NULL OR jsonb_typeof(p_meals) <> 'array' THEN
    RAISE EXCEPTION 'invalidMenu' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_meals) <> 7 OR char_length(p_notes)>10000 OR
    (SELECT count(DISTINCT value->>'day') FROM jsonb_array_elements(p_meals)
      WHERE value->>'day' IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')) <> 7 OR
    EXISTS (SELECT 1 FROM jsonb_array_elements(p_meals) d CROSS JOIN unnest(ARRAY['breakfast','lunch','dinner','snacks']) m
      WHERE jsonb_typeof(d->m) IS DISTINCT FROM 'string' OR char_length(d->>m)>20000) THEN
    RAISE EXCEPTION 'invalidMenu' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO menu FROM public.weekly_menu WHERE week_start=p_week_start FOR UPDATE;
  IF FOUND THEN
    IF p_expected_updated_at IS NULL OR menu.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION 'menuChanged' USING ERRCODE = '40001';
    END IF;
    UPDATE public.weekly_menu SET meals=p_meals,notes=nullif(p_notes,''),updated_by=auth.uid() WHERE id=menu.id;
  ELSE
    IF p_expected_updated_at IS NOT NULL THEN RAISE EXCEPTION 'menuChanged' USING ERRCODE = '40001'; END IF;
    INSERT INTO public.weekly_menu(week_start,meals,notes,updated_by) VALUES (p_week_start,p_meals,nullif(p_notes,''),auth.uid())
      ON CONFLICT (week_start) DO NOTHING;
    IF NOT FOUND THEN RAISE EXCEPTION 'menuChanged' USING ERRCODE = '40001'; END IF;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.save_weekly_menu(date,jsonb,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_weekly_menu(date,jsonb,text,timestamptz) TO authenticated;

CREATE TABLE public.menu_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL REFERENCES public.weekly_menu(week_start) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  day_a text NOT NULL CHECK (day_a IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  meal_a text NOT NULL CHECK (meal_a IN ('breakfast','lunch','dinner','snacks')),
  day_b text NOT NULL CHECK (day_b IN ('Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')),
  meal_b text NOT NULL CHECK (meal_b IN ('breakfast','lunch','dinner','snacks')),
  content_a text NOT NULL,
  content_b text NOT NULL,
  note text CHECK (char_length(note) <= 2000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','rejected','cancelled','stale')),
  reply text CHECK (char_length(reply) <= 2000),
  responded_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (day_a <> day_b OR meal_a <> meal_b)
);
CREATE INDEX menu_change_requests_week ON public.menu_change_requests(week_start, created_at DESC);
ALTER TABLE public.menu_change_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.menu_change_requests FROM anon, authenticated;
GRANT SELECT ON public.menu_change_requests TO authenticated;
GRANT ALL ON public.menu_change_requests TO service_role;
CREATE POLICY "Admins and chefs read menu requests" ON public.menu_change_requests
  FOR SELECT TO authenticated USING (public.is_admin_or_chef());

CREATE TABLE public.menu_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('menu_updated','swap_requested','swap_accepted','swap_rejected','swap_stale','swap_cancelled')),
  week_start date NOT NULL,
  request_id uuid REFERENCES public.menu_change_requests(id) ON DELETE CASCADE,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  push_state text NOT NULL DEFAULT 'pending' CHECK (push_state IN ('pending','sending','sent','unavailable','failed')),
  push_attempts integer NOT NULL DEFAULT 0,
  push_claimed_at timestamptz
);
CREATE INDEX menu_notifications_recipient ON public.menu_notifications(recipient_id, created_at DESC);
CREATE INDEX menu_notifications_unread ON public.menu_notifications(recipient_id) WHERE read_at IS NULL;
CREATE INDEX menu_notifications_push ON public.menu_notifications(created_at) WHERE push_state IN ('pending','sending');
ALTER TABLE public.menu_notifications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.menu_notifications FROM anon, authenticated;
GRANT SELECT ON public.menu_notifications TO authenticated;
GRANT UPDATE(read_at) ON public.menu_notifications TO authenticated;
GRANT ALL ON public.menu_notifications TO service_role;
CREATE POLICY "Read own menu notifications" ON public.menu_notifications
  FOR SELECT TO authenticated USING (recipient_id = auth.uid());
CREATE POLICY "Mark own menu notifications read" ON public.menu_notifications
  FOR UPDATE TO authenticated USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());

CREATE FUNCTION public.notify_chef_menu_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  changes jsonb := '[]'::jsonb;
  old_meals jsonb := '[]'::jsonb;
  new_meals jsonb := '[]'::jsonb;
  old_notes text;
  new_notes text;
  week date;
  approved_request uuid := nullif(current_setting('app.approved_menu_request', true), '')::uuid;
BEGIN
  -- Identify the actual authenticated editor, never the client-supplied updated_by.
  IF auth.uid() IS NULL OR NOT public.can_respond_to_food_notes() THEN RETURN NULL; END IF;
  -- An approval produces its own notification for every admin instead.
  IF approved_request IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.menu_change_requests WHERE id = approved_request
      AND status = 'accepted' AND responded_by = auth.uid()
  ) THEN RETURN NULL; END IF;
  IF TG_OP <> 'INSERT' THEN old_meals := OLD.meals; old_notes := OLD.notes; week := OLD.week_start; END IF;
  IF TG_OP <> 'DELETE' THEN new_meals := NEW.meals; new_notes := NEW.notes; week := NEW.week_start; END IF;
  IF old_meals IS NOT DISTINCT FROM new_meals AND old_notes IS NOT DISTINCT FROM new_notes THEN RETURN NULL; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('day', d, 'mealType', m, 'before', a, 'after', b)), '[]'::jsonb)
  INTO changes FROM (
    SELECT d, m,
      coalesce((SELECT value ->> m FROM jsonb_array_elements(old_meals) WHERE value ->> 'day' = d LIMIT 1), '') a,
      coalesce((SELECT value ->> m FROM jsonb_array_elements(new_meals) WHERE value ->> 'day' = d LIMIT 1), '') b
    FROM unnest(ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']) d
    CROSS JOIN unnest(ARRAY['breakfast','lunch','dinner','snacks']) m
  ) slots WHERE a IS DISTINCT FROM b;
  IF changes = '[]'::jsonb AND old_notes IS NOT DISTINCT FROM new_notes THEN RETURN NULL; END IF;
  INSERT INTO public.menu_notifications(recipient_id, actor_id, kind, week_start, details)
  SELECT id, auth.uid(), 'menu_updated', week,
    jsonb_build_object('changes', changes, 'notesBefore', old_notes, 'notesAfter', new_notes)
  FROM public.users WHERE role = 'admin' AND id <> auth.uid();
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_chef_menu_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER notify_chef_menu_change AFTER INSERT OR UPDATE OR DELETE ON public.weekly_menu
  FOR EACH ROW EXECUTE FUNCTION public.notify_chef_menu_change();

CREATE FUNCTION public.request_menu_swap(
  p_week_start date, p_day_a text, p_meal_a text, p_day_b text, p_meal_b text,
  p_expected_updated_at timestamptz, p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  menu public.weekly_menu;
  new_id uuid;
  a text;
  b text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'requestNotAllowed' USING ERRCODE = '42501';
  END IF;
  IF num_nulls(p_week_start, p_day_a, p_meal_a, p_day_b, p_meal_b, p_expected_updated_at) > 0
    OR NOT (ARRAY[p_day_a,p_day_b] <@ ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'])
    OR NOT (ARRAY[p_meal_a,p_meal_b] <@ ARRAY['breakfast','lunch','dinner','snacks'])
    OR (p_day_a = p_day_b AND p_meal_a = p_meal_b) OR char_length(p_note) > 2000 THEN
    RAISE EXCEPTION 'invalidRequest' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO menu FROM public.weekly_menu WHERE week_start = p_week_start FOR UPDATE;
  IF NOT FOUND OR menu.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'menuChanged' USING ERRCODE = '40001';
  END IF;
  SELECT value ->> p_meal_a INTO a FROM jsonb_array_elements(menu.meals) WHERE value ->> 'day' = p_day_a LIMIT 1;
  SELECT value ->> p_meal_b INTO b FROM jsonb_array_elements(menu.meals) WHERE value ->> 'day' = p_day_b LIMIT 1;
  IF a IS NULL OR b IS NULL OR a = b THEN
    RAISE EXCEPTION 'invalidRequest' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employee_group_memberships m JOIN public.employee_groups g ON g.id=m.group_id WHERE lower(g.name)='chef') THEN
    RAISE EXCEPTION 'noChef' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.menu_change_requests WHERE week_start = p_week_start AND status = 'pending'
    AND ((day_a=p_day_a AND meal_a=p_meal_a AND day_b=p_day_b AND meal_b=p_meal_b)
      OR (day_a=p_day_b AND meal_a=p_meal_b AND day_b=p_day_a AND meal_b=p_meal_a))) THEN
    RAISE EXCEPTION 'alreadyRequested' USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.menu_change_requests(week_start, requested_by, day_a, meal_a, day_b, meal_b, content_a, content_b, note)
  VALUES (p_week_start, auth.uid(), p_day_a, p_meal_a, p_day_b, p_meal_b, a, b, nullif(btrim(p_note), '')) RETURNING id INTO new_id;
  INSERT INTO public.menu_notifications(recipient_id, actor_id, kind, week_start, request_id)
  SELECT DISTINCT m.user_id, auth.uid(), 'swap_requested', p_week_start, new_id
  FROM public.employee_group_memberships m JOIN public.employee_groups g ON g.id=m.group_id WHERE lower(g.name)='chef';
  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.request_menu_swap(date,text,text,text,text,timestamptz,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_menu_swap(date,text,text,text,text,timestamptz,text) TO authenticated;

CREATE FUNCTION public.respond_to_menu_swap(p_id uuid, p_decision text, p_reply text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  request public.menu_change_requests;
  menu public.weekly_menu;
  result text := p_decision;
  a text;
  b text;
BEGIN
  IF auth.uid() IS NULL OR (p_decision = 'cancelled' AND NOT public.is_admin())
    OR (p_decision IS DISTINCT FROM 'cancelled' AND NOT public.can_respond_to_food_notes()) THEN
    RAISE EXCEPTION 'responseNotAllowed' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL OR p_decision IS NULL OR p_decision NOT IN ('accepted','rejected','cancelled') OR char_length(p_reply)>2000 THEN
    RAISE EXCEPTION 'invalidRequest' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO request FROM public.menu_change_requests WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR request.status <> 'pending' THEN
    RAISE EXCEPTION 'alreadyResponded' USING ERRCODE = '40001';
  END IF;
  IF p_decision = 'cancelled' AND request.requested_by <> auth.uid() THEN
    RAISE EXCEPTION 'requestNotAllowed' USING ERRCODE = '42501';
  END IF;
  IF p_decision = 'accepted' THEN
    SELECT * INTO menu FROM public.weekly_menu WHERE week_start=request.week_start FOR UPDATE;
    SELECT value ->> request.meal_a INTO a FROM jsonb_array_elements(menu.meals) WHERE value ->> 'day'=request.day_a LIMIT 1;
    SELECT value ->> request.meal_b INTO b FROM jsonb_array_elements(menu.meals) WHERE value ->> 'day'=request.day_b LIMIT 1;
    IF a IS DISTINCT FROM request.content_a OR b IS DISTINCT FROM request.content_b THEN result := 'stale'; END IF;
  END IF;
  UPDATE public.menu_change_requests SET status=result, reply=nullif(btrim(p_reply),''), responded_by=auth.uid(), responded_at=now() WHERE id=p_id;
  IF result = 'accepted' THEN
    PERFORM set_config('app.approved_menu_request', p_id::text, true);
    PERFORM public.swap_menu_meals(request.week_start,request.day_a,request.meal_a,request.day_b,request.meal_b,menu.updated_at);
    PERFORM set_config('app.approved_menu_request', '', true);
  END IF;
  IF result = 'cancelled' THEN
    INSERT INTO public.menu_notifications(recipient_id,actor_id,kind,week_start,request_id)
    SELECT DISTINCT m.user_id,auth.uid(),'swap_cancelled',request.week_start,p_id
    FROM public.employee_group_memberships m JOIN public.employee_groups g ON g.id=m.group_id WHERE lower(g.name)='chef';
  ELSE
    INSERT INTO public.menu_notifications(recipient_id,actor_id,kind,week_start,request_id)
    SELECT id,auth.uid(),'swap_' || result,request.week_start,p_id FROM public.users
    WHERE id=request.requested_by OR (result='accepted' AND role='admin' AND id<>auth.uid());
  END IF;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.respond_to_menu_swap(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_to_menu_swap(uuid,text,text) TO authenticated;

-- Lease outbox rows so an immediate send and the retry cron cannot claim them together.
CREATE FUNCTION public.claim_menu_notification_pushes(p_actor uuid DEFAULT NULL)
RETURNS SETOF public.menu_notifications
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.menu_notifications SET push_state='sending',push_attempts=push_attempts+1,push_claimed_at=now()
  WHERE id IN (
    SELECT id FROM public.menu_notifications
    WHERE (p_actor IS NULL OR actor_id=p_actor) AND push_attempts<3
      AND (push_state='pending' OR (push_state='sending' AND push_claimed_at<now()-interval '2 minutes'))
    ORDER BY created_at LIMIT 25 FOR UPDATE SKIP LOCKED
  ) RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.claim_menu_notification_pushes(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_menu_notification_pushes(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
