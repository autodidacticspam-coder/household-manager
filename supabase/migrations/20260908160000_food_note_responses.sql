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
