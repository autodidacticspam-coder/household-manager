DO $$
<<menu_requests>>
DECLARE
  admin_id uuid := '00000000-0000-4000-8000-000000000001';
  chef_id uuid := '00000000-0000-4000-8000-000000000002';
  chef_group uuid;
  request_id uuid;
  rejected_id uuid;
  stamp timestamptz;
  initial_meals jsonb;
  current_meals jsonb;
  count_before integer;
  notification_id uuid;
BEGIN
  SELECT jsonb_agg(jsonb_build_object('day',d,'breakfast','','lunch',CASE WHEN d='Tuesday' THEN 'Soup' ELSE '' END,
    'dinner',CASE WHEN d='Tuesday' THEN 'Pasta' ELSE '' END,'snacks','')) INTO initial_meals
  FROM unnest(ARRAY['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']) d;
  INSERT INTO public.weekly_menu(week_start,meals,updated_by) VALUES ('2026-09-14',initial_meals,admin_id) RETURNING updated_at INTO stamp;
  PERFORM set_config('request.jwt.claim.sub',chef_id::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.request_menu_swap('2026-09-14','Tuesday','lunch','Tuesday','dinner',stamp);
    RAISE EXCEPTION 'An employee could request a swap';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.respond_to_menu_swap(gen_random_uuid(),'accepted');
    RAISE EXCEPTION 'An employee could respond';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.save_weekly_menu('2026-09-14',initial_meals,'Employee edit',stamp);
    RAISE EXCEPTION 'An employee could edit the menu';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.menu_notifications(recipient_id,kind,week_start) VALUES (admin_id,'menu_updated','2026-09-14');
    RAISE EXCEPTION 'An employee could forge a notification';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.claim_menu_notification_pushes();
    RAISE EXCEPTION 'An employee could claim pushes';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  EXECUTE 'RESET ROLE';
  SELECT id INTO chef_group FROM public.employee_groups WHERE lower(name)='chef' LIMIT 1;
  INSERT INTO public.employee_group_memberships(group_id,user_id) VALUES (chef_group,chef_id);
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.request_menu_swap('2026-09-14','Tuesday','lunch','Tuesday','dinner',stamp-interval '1 minute');
    RAISE EXCEPTION 'Stale request was saved';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.request_menu_swap('2026-09-14','Tuesday','lunch','Tuesday','lunch',stamp);
    RAISE EXCEPTION 'Same slot accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  request_id := public.request_menu_swap('2026-09-14','Tuesday','lunch','Tuesday','dinner',stamp,'Please swap.');
  IF (SELECT meals FROM public.weekly_menu WHERE week_start='2026-09-14') <> initial_meals THEN RAISE EXCEPTION 'Request changed menu before approval'; END IF;
  BEGIN
    PERFORM public.request_menu_swap('2026-09-14','Tuesday','dinner','Tuesday','lunch',stamp);
    RAISE EXCEPTION 'Duplicate reversed request was saved';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    PERFORM public.respond_to_menu_swap(request_id,'accepted');
    RAISE EXCEPTION 'Admin without chef membership accepted a request';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF EXISTS (SELECT 1 FROM public.menu_notifications WHERE recipient_id=chef_id) THEN RAISE EXCEPTION 'Admin can read someone else notification'; END IF;
  EXECUTE 'RESET ROLE';
  IF (SELECT count(*) FROM public.menu_notifications n WHERE n.request_id=menu_requests.request_id AND kind='swap_requested' AND recipient_id=chef_id) <> 1 THEN
    RAISE EXCEPTION 'Request failed to notify chef exactly once';
  END IF;
  PERFORM set_config('request.jwt.claim.sub',chef_id::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE public.menu_change_requests SET status='accepted' WHERE id=request_id;
    RAISE EXCEPTION 'Chef could bypass response RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF public.respond_to_menu_swap(request_id,'accepted','Of course.') <> 'accepted' THEN RAISE EXCEPTION 'Approval failed'; END IF;
  SELECT meals INTO current_meals FROM public.weekly_menu WHERE week_start='2026-09-14';
  IF current_meals->1->>'lunch'<>'Pasta' OR current_meals->1->>'dinner'<>'Soup' THEN RAISE EXCEPTION 'Approval did not swap both meals'; END IF;
  BEGIN
    PERFORM public.respond_to_menu_swap(request_id,'accepted','Again');
    RAISE EXCEPTION 'Repeated acceptance swapped back';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  EXECUTE 'RESET ROLE';
  IF (SELECT count(*) FROM public.menu_notifications WHERE recipient_id=admin_id AND kind='swap_accepted')<>1
    OR EXISTS (SELECT 1 FROM public.menu_notifications WHERE recipient_id=admin_id AND kind='menu_updated') THEN
    RAISE EXCEPTION 'Acceptance notification missing or duplicated as generic change';
  END IF;
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  rejected_id := public.request_menu_swap('2026-09-14','Tuesday','lunch','Tuesday','dinner',stamp);
  PERFORM set_config('request.jwt.claim.sub',chef_id::text,true);
  PERFORM public.respond_to_menu_swap(rejected_id,'rejected','Ingredients are already prepared.');
  IF (SELECT meals FROM public.weekly_menu WHERE week_start='2026-09-14')<>current_meals THEN RAISE EXCEPTION 'Rejection changed menu'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.menu_change_requests WHERE id=rejected_id AND reply='Ingredients are already prepared.' AND status='rejected') THEN RAISE EXCEPTION 'Reply missing'; END IF;

  -- Unrelated edits do not invalidate the requested pair.
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  request_id := public.request_menu_swap('2026-09-14','Tuesday','lunch','Tuesday','dinner',stamp);
  PERFORM set_config('request.jwt.claim.sub',chef_id::text,true);
  PERFORM public.save_weekly_menu('2026-09-14',jsonb_set(current_meals,'{0,breakfast}','"Oats"'),'New notes',stamp);
  IF public.respond_to_menu_swap(request_id,'accepted')<>'accepted' THEN RAISE EXCEPTION 'Unrelated edit blocked swap'; END IF;
  SELECT meals INTO current_meals FROM public.weekly_menu WHERE week_start='2026-09-14';
  IF current_meals->0->>'breakfast'<>'Oats' THEN RAISE EXCEPTION 'Approval overwrote unrelated edit'; END IF;

  -- An edit to either requested meal makes the request stale, without applying it.
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  request_id := public.request_menu_swap('2026-09-14','Tuesday','lunch','Tuesday','dinner',stamp);
  PERFORM set_config('request.jwt.claim.sub',chef_id::text,true);
  current_meals := jsonb_set(current_meals,'{1,lunch}','"New curry"');
  PERFORM public.save_weekly_menu('2026-09-14',current_meals,'New notes',stamp);
  IF public.respond_to_menu_swap(request_id,'accepted')<>'stale' THEN RAISE EXCEPTION 'Changed meal was approved'; END IF;
  IF (SELECT meals FROM public.weekly_menu WHERE week_start='2026-09-14')<>current_meals THEN RAISE EXCEPTION 'Stale request changed menu'; END IF;
  EXECUTE 'RESET ROLE';
  IF NOT EXISTS (SELECT 1 FROM public.menu_notifications WHERE recipient_id=admin_id AND kind='swap_stale') THEN RAISE EXCEPTION 'Stale notification missing'; END IF;
  SELECT count(*) INTO count_before FROM public.menu_notifications;
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.save_weekly_menu('2026-09-14',current_meals,'New notes',stamp);
  EXECUTE 'RESET ROLE';
  IF (SELECT count(*) FROM public.menu_notifications)<>count_before THEN RAISE EXCEPTION 'No-op save notified admin'; END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.save_weekly_menu('2026-09-14',initial_meals,'Stale draft',stamp-interval '1 minute');
    RAISE EXCEPTION 'Stale full editor overwrote menu';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  -- Even a legacy client spoofing updated_by must report the real authenticated chef.
  UPDATE public.weekly_menu SET notes='Chef revised notes',updated_by=admin_id WHERE week_start='2026-09-14';
  EXECUTE 'RESET ROLE';
  IF NOT EXISTS (SELECT 1 FROM public.menu_notifications WHERE recipient_id=admin_id AND actor_id=chef_id AND details->>'notesAfter'='Chef revised notes') THEN RAISE EXCEPTION 'Notes-only edit or real actor was missed'; END IF;
  SELECT id INTO notification_id FROM public.menu_notifications WHERE recipient_id=admin_id LIMIT 1;
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.menu_notifications SET read_at=now() WHERE id=notification_id;
  EXECUTE 'RESET ROLE';
  IF (SELECT read_at FROM public.menu_notifications WHERE id=notification_id) IS NOT NULL THEN RAISE EXCEPTION 'Chef marked another user notification read'; END IF;
  PERFORM set_config('request.jwt.claim.sub',admin_id::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.menu_notifications SET read_at=now() WHERE id=notification_id;
  BEGIN
    UPDATE public.menu_notifications SET push_state='sent' WHERE id=notification_id;
    RAISE EXCEPTION 'Recipient could tamper with push delivery';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  request_id := public.request_menu_swap('2026-09-14','Tuesday','lunch','Tuesday','dinner',stamp);
  PERFORM public.respond_to_menu_swap(request_id,'cancelled');
  PERFORM set_config('request.jwt.claim.sub',chef_id::text,true);
  BEGIN
    PERFORM public.respond_to_menu_swap(request_id,'accepted');
    RAISE EXCEPTION 'Withdrawn request was accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  EXECUTE 'RESET ROLE';
  EXECUTE 'SET LOCAL ROLE service_role';
  SELECT count(*) INTO count_before FROM public.claim_menu_notification_pushes();
  IF count_before=0 THEN RAISE EXCEPTION 'Outbox was empty'; END IF;
  IF EXISTS (SELECT 1 FROM public.claim_menu_notification_pushes()) THEN RAISE EXCEPTION 'Outbox claimed sending rows twice'; END IF;
  EXECUTE 'RESET ROLE';
END;
$$;
