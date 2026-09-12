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
