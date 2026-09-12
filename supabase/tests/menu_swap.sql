-- The test runner creates fabricated accounts and rolls everything back.
DO $$
DECLARE
  admin_id uuid := '00000000-0000-4000-8000-000000000001';
  chef_id uuid := '00000000-0000-4000-8000-000000000002';
  chef_group_id uuid;
  week date := '2026-09-07';
  menu_id uuid;
  loaded_at timestamptz;
  saved_at timestamptz;
  curry_id uuid;
  pasta_id uuid;
  tuesday_rice_id uuid;
  wednesday_rice_id uuid;
  revision uuid;
  menu_meals jsonb;
BEGIN
  INSERT INTO public.weekly_menu(week_start, meals, updated_by) VALUES (week, jsonb_build_array(
    jsonb_build_object('day', 'Monday', 'breakfast', 'Oatmeal', 'lunch', '', 'dinner', '', 'snacks', ''),
    jsonb_build_object('day', 'Tuesday', 'breakfast', '', 'lunch', E'Chicken curry\nRice', 'dinner', 'Soup', 'snacks', ''),
    jsonb_build_object('day', 'Wednesday', 'breakfast', '', 'lunch', '', 'dinner', E'Pasta\nRice', 'snacks', 'Apples'),
    jsonb_build_object('day', 'Thursday', 'breakfast', '', 'lunch', '', 'dinner', '', 'snacks', ''),
    jsonb_build_object('day', 'Friday', 'breakfast', '', 'lunch', '', 'dinner', '', 'snacks', ''),
    jsonb_build_object('day', 'Saturday', 'breakfast', '', 'lunch', '', 'dinner', '', 'snacks', ''),
    jsonb_build_object('day', 'Sunday', 'breakfast', '', 'lunch', '', 'dinner', '', 'snacks', '')
  ), admin_id) RETURNING id, updated_at INTO menu_id, loaded_at;

  INSERT INTO public.menu_ratings(week_start, day_of_week, meal_type, menu_item, rating, rated_by, comment)
  VALUES (week, 'Tuesday', 'lunch', 'Chicken curry', 8, admin_id, 'Less spicy next time') RETURNING id, note_revision INTO curry_id, revision;
  INSERT INTO public.menu_ratings(week_start, day_of_week, meal_type, menu_item, rating, rated_by)
  VALUES (week, 'Wednesday', 'dinner', 'Pasta', 5, admin_id) RETURNING id INTO pasta_id;
  -- The same dish rated by the same person in both meals must trade places, not collide.
  INSERT INTO public.menu_ratings(week_start, day_of_week, meal_type, menu_item, rating, rated_by)
  VALUES (week, 'Tuesday', 'lunch', 'Rice', 9, admin_id) RETURNING id INTO tuesday_rice_id;
  INSERT INTO public.menu_ratings(week_start, day_of_week, meal_type, menu_item, rating, rated_by)
  VALUES (week, 'Wednesday', 'dinner', 'Rice', 3, admin_id) RETURNING id INTO wednesday_rice_id;

  PERFORM set_config('request.jwt.claim.sub', chef_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.swap_menu_meals(week, 'Tuesday', 'lunch', 'Wednesday', 'dinner', loaded_at);
    RAISE EXCEPTION 'An ordinary employee could swap meals';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  EXECUTE 'RESET ROLE';

  SELECT id INTO chef_group_id FROM public.employee_groups WHERE lower(name) = 'chef' LIMIT 1;
  IF chef_group_id IS NULL THEN
    INSERT INTO public.employee_groups(name) VALUES ('Chef') RETURNING id INTO chef_group_id;
  END IF;
  INSERT INTO public.employee_group_memberships(group_id, user_id) VALUES (chef_group_id, chef_id);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.respond_to_food_note('rating', curry_id, revision, 'Will do.');

  BEGIN
    PERFORM public.swap_menu_meals(week, 'Tuesday', 'lunch', 'Tuesday', 'lunch', loaded_at);
    RAISE EXCEPTION 'Swapping a meal with itself was accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.swap_menu_meals(week, 'Funday', 'lunch', 'Wednesday', 'dinner', loaded_at);
    RAISE EXCEPTION 'Unknown day accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.swap_menu_meals(week, 'Tuesday', 'brunch', 'Wednesday', 'dinner', loaded_at);
    RAISE EXCEPTION 'Unknown meal accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.swap_menu_meals(week, 'Tuesday', 'lunch', 'Wednesday', 'dinner', loaded_at - interval '1 minute');
    RAISE EXCEPTION 'A stale menu version was swapped';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.swap_menu_meals(week + 7, 'Tuesday', 'lunch', 'Wednesday', 'dinner', NULL);
    RAISE EXCEPTION 'A missing week was swapped';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  IF (SELECT m.meals -> 1 ->> 'lunch' FROM public.weekly_menu m WHERE m.id = menu_id) <> E'Chicken curry\nRice' THEN
    RAISE EXCEPTION 'Rejected swaps changed the menu';
  END IF;

  saved_at := public.swap_menu_meals(week, 'Tuesday', 'lunch', 'Wednesday', 'dinner', loaded_at);
  SELECT m.meals INTO menu_meals FROM public.weekly_menu m WHERE m.id = menu_id;
  IF menu_meals -> 1 ->> 'lunch' <> E'Pasta\nRice' OR menu_meals -> 2 ->> 'dinner' <> E'Chicken curry\nRice'
     OR menu_meals -> 1 ->> 'dinner' <> 'Soup' OR menu_meals -> 2 ->> 'snacks' <> 'Apples'
     OR menu_meals -> 0 ->> 'breakfast' <> 'Oatmeal' OR jsonb_array_length(menu_meals) <> 7 THEN
    RAISE EXCEPTION 'Swap changed the wrong meals';
  END IF;
  IF saved_at IS NULL OR (SELECT m.updated_by FROM public.weekly_menu m WHERE m.id = menu_id) <> chef_id THEN
    RAISE EXCEPTION 'Swap did not record the chef as the editor';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.menu_ratings WHERE id = curry_id AND week_start = week AND day_of_week = 'Wednesday'
      AND meal_type = 'dinner' AND rating = 8 AND comment = 'Less spicy next time' AND note_revision = revision) THEN
    RAISE EXCEPTION 'Curry feedback did not follow the dish';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.menu_ratings WHERE id = pasta_id AND week_start = week AND day_of_week = 'Tuesday' AND meal_type = 'lunch') THEN
    RAISE EXCEPTION 'Pasta feedback did not follow the dish';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.menu_ratings WHERE id = tuesday_rice_id AND day_of_week = 'Wednesday' AND meal_type = 'dinner' AND rating = 9)
     OR NOT EXISTS (SELECT 1 FROM public.menu_ratings WHERE id = wednesday_rice_id AND day_of_week = 'Tuesday' AND meal_type = 'lunch' AND rating = 3) THEN
    RAISE EXCEPTION 'Matching dishes in both meals did not trade places';
  END IF;
  IF EXISTS (SELECT 1 FROM public.menu_ratings WHERE id IN (curry_id, pasta_id, tuesday_rice_id, wednesday_rice_id) AND week_start <> week) THEN
    RAISE EXCEPTION 'A rating was left outside the week';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.food_note_responses WHERE menu_rating_id = curry_id AND note_revision = revision AND reply = 'Will do.') THEN
    RAISE EXCEPTION 'Chef reply was detached from the moved dish';
  END IF;

  -- Moving into an empty meal leaves the original meal empty.
  saved_at := public.swap_menu_meals(week, 'Wednesday', 'dinner', 'Thursday', 'lunch', saved_at);
  SELECT m.meals INTO menu_meals FROM public.weekly_menu m WHERE m.id = menu_id;
  IF menu_meals -> 3 ->> 'lunch' <> E'Chicken curry\nRice' OR menu_meals -> 2 ->> 'dinner' <> '' THEN
    RAISE EXCEPTION 'Moving a meal into an empty slot failed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.menu_ratings WHERE id = curry_id AND day_of_week = 'Thursday' AND meal_type = 'lunch') THEN
    RAISE EXCEPTION 'Feedback did not follow the dish into the empty slot';
  END IF;

  -- Undo is the same swap in reverse.
  saved_at := public.swap_menu_meals(week, 'Thursday', 'lunch', 'Wednesday', 'dinner', saved_at);
  PERFORM public.swap_menu_meals(week, 'Wednesday', 'dinner', 'Tuesday', 'lunch', saved_at);
  SELECT m.meals INTO menu_meals FROM public.weekly_menu m WHERE m.id = menu_id;
  IF menu_meals -> 1 ->> 'lunch' <> E'Chicken curry\nRice' OR menu_meals -> 2 ->> 'dinner' <> E'Pasta\nRice' OR menu_meals -> 3 ->> 'lunch' <> '' THEN
    RAISE EXCEPTION 'Undo did not restore the original menu';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.menu_ratings WHERE id = curry_id AND day_of_week = 'Tuesday' AND meal_type = 'lunch')
     OR NOT EXISTS (SELECT 1 FROM public.menu_ratings WHERE id = wednesday_rice_id AND day_of_week = 'Wednesday' AND meal_type = 'dinner' AND rating = 3)
     OR NOT EXISTS (SELECT 1 FROM public.menu_ratings WHERE id = tuesday_rice_id AND day_of_week = 'Tuesday' AND meal_type = 'lunch' AND rating = 9) THEN
    RAISE EXCEPTION 'Undo did not restore feedback positions';
  END IF;
  EXECUTE 'RESET ROLE';

  PERFORM set_config('request.jwt.claim.sub', admin_id::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.swap_menu_meals(week, 'Monday', 'breakfast', 'Sunday', 'snacks', NULL);
  IF (SELECT m.meals -> 6 ->> 'snacks' FROM public.weekly_menu m WHERE m.id = menu_id) <> 'Oatmeal'
     OR (SELECT m.meals -> 0 ->> 'breakfast' FROM public.weekly_menu m WHERE m.id = menu_id) <> '' THEN
    RAISE EXCEPTION 'Administrator swap failed';
  END IF;
  EXECUTE 'RESET ROLE';
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM public.swap_menu_meals(week, 'Tuesday', 'lunch', 'Wednesday', 'dinner', NULL);
    RAISE EXCEPTION 'Anonymous caller could swap meals';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  EXECUTE 'RESET ROLE';
END;
$$;
