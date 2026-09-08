-- The test runner creates fabricated accounts and rolls everything back.
DO $$
DECLARE
  admin_id uuid := '00000000-0000-4000-8000-000000000001';
  chef_id uuid := '00000000-0000-4000-8000-000000000002';
  chef_group_id uuid;
  request_id uuid;
  rating_id uuid;
  revision uuid;
  original_revision uuid;
BEGIN
  INSERT INTO public.food_requests(food_name, requested_by, notes)
  VALUES ('Response test request', admin_id, 'Less salt, please') RETURNING id, note_revision INTO request_id, revision;
  original_revision := revision;
  INSERT INTO public.menu_ratings(week_start, day_of_week, meal_type, menu_item, rating, rated_by, comment)
  VALUES ('2026-09-07', 'Monday', 'dinner', 'Response test dish', 7, admin_id, 'Sauce on the side') RETURNING id INTO rating_id;

  PERFORM set_config('request.jwt.claim.sub', chef_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.respond_to_food_note('request', request_id, revision);
    RAISE EXCEPTION 'An ordinary employee could acknowledge a note';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  EXECUTE 'RESET ROLE';

  SELECT id INTO chef_group_id FROM public.employee_groups WHERE lower(name) = 'chef' LIMIT 1;
  IF chef_group_id IS NULL THEN
    INSERT INTO public.employee_groups(name) VALUES ('Chef') RETURNING id INTO chef_group_id;
  END IF;
  INSERT INTO public.employee_group_memberships(group_id, user_id) VALUES (chef_group_id, chef_id);
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF NOT public.can_respond_to_food_notes() THEN RAISE EXCEPTION 'Chef permission missing'; END IF;
  PERFORM public.respond_to_food_note('request', request_id, revision);
  PERFORM public.respond_to_food_note('request', request_id, revision);
  IF (SELECT count(*) FROM public.food_note_responses WHERE food_request_id = request_id) <> 1 THEN
    RAISE EXCEPTION 'Acknowledgement retry created a duplicate';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.food_requests WHERE id = request_id AND status = 'pending' AND notes = 'Less salt, please' AND note_revision = revision) THEN
    RAISE EXCEPTION 'Acknowledging changed the food request';
  END IF;

  PERFORM public.respond_to_food_note('request', request_id, revision, E'  Will do.\nThank you!  ');
  PERFORM public.respond_to_food_note('request', request_id, revision, E'Will do.\nThank you!');
  PERFORM public.respond_to_food_note('request', request_id, revision);
  IF NOT EXISTS (SELECT 1 FROM public.food_note_responses WHERE food_request_id = request_id
      AND responded_by = chef_id AND reply = E'Will do.\nThank you!' AND replied_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Reply was lost or assigned to the wrong chef';
  END IF;
  BEGIN
    PERFORM public.respond_to_food_note('request', request_id, revision, 'A competing reply');
    RAISE EXCEPTION 'A concurrent reply replaced the saved reply';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    UPDATE public.food_note_responses SET responded_by = admin_id WHERE food_request_id = request_id;
    RAISE EXCEPTION 'Chef could forge the response author directly';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.food_note_responses(food_request_id, note_revision, responded_by)
    VALUES(request_id, revision, admin_id);
    RAISE EXCEPTION 'Chef could bypass the response function';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.respond_to_food_note('request', request_id, revision, E' \n\t ');
    RAISE EXCEPTION 'Blank reply accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.respond_to_food_note('request', request_id, revision, repeat('x',10001));
    RAISE EXCEPTION 'Oversized reply accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.respond_to_food_note('other', request_id, revision);
    RAISE EXCEPTION 'Invalid source accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

  UPDATE public.food_requests SET status = 'completed' WHERE id = request_id;
  IF (SELECT note_revision FROM public.food_requests WHERE id = request_id) <> revision THEN
    RAISE EXCEPTION 'Completing request invalidated note acknowledgement';
  END IF;
  EXECUTE 'RESET ROLE';
  UPDATE public.food_requests SET notes = 'No added salt', note_revision = revision WHERE id = request_id;
  SELECT note_revision INTO revision FROM public.food_requests WHERE id = request_id;
  IF revision = original_revision THEN RAISE EXCEPTION 'Edited note kept old acknowledgement revision'; END IF;

  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.respond_to_food_note('request', request_id, original_revision);
    RAISE EXCEPTION 'Outdated note could be acknowledged';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  PERFORM public.respond_to_food_note('request', request_id, revision);
  IF (SELECT count(*) FROM public.food_note_responses WHERE food_request_id = request_id) <> 2 THEN
    RAISE EXCEPTION 'Response history was not preserved';
  END IF;

  SELECT note_revision INTO revision FROM public.menu_ratings WHERE id = rating_id;
  PERFORM public.respond_to_food_note('rating', rating_id, revision, 'I will serve it separately.');
  IF NOT EXISTS (SELECT 1 FROM public.food_note_responses WHERE menu_rating_id = rating_id AND reply = 'I will serve it separately.') THEN
    RAISE EXCEPTION 'Rating comment reply missing';
  END IF;
  EXECUTE 'RESET ROLE';
  UPDATE public.menu_ratings SET rating = 8 WHERE id = rating_id;
  IF (SELECT note_revision FROM public.menu_ratings WHERE id = rating_id) <> revision THEN
    RAISE EXCEPTION 'Rating score change invalidated an unchanged comment';
  END IF;
  UPDATE public.menu_ratings SET comment = NULL WHERE id = rating_id RETURNING note_revision INTO revision;
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.respond_to_food_note('rating', rating_id, revision);
    RAISE EXCEPTION 'Removed comment could be acknowledged';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.respond_to_food_note('rating', gen_random_uuid(), revision);
    RAISE EXCEPTION 'Missing comment could be acknowledged';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claim.sub', admin_id::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF (SELECT count(*) FROM public.food_note_responses WHERE food_request_id = request_id) <> 2 THEN
    RAISE EXCEPTION 'Administrator cannot read chef responses';
  END IF;
  BEGIN
    PERFORM public.respond_to_food_note('rating', rating_id, revision);
    RAISE EXCEPTION 'Administrator outside Chef group could pose as chef';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  EXECUTE 'RESET ROLE';

  DELETE FROM public.employee_group_memberships WHERE user_id = chef_id AND group_id = chef_group_id;
  PERFORM set_config('request.jwt.claim.sub', chef_id::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  IF EXISTS (SELECT 1 FROM public.food_note_responses) THEN RAISE EXCEPTION 'Ordinary employee can read chef responses'; END IF;
  EXECUTE 'RESET ROLE';
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM public.respond_to_food_note('request', request_id, revision);
    RAISE EXCEPTION 'Anonymous caller could respond';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  EXECUTE 'RESET ROLE';
END;
$$;
