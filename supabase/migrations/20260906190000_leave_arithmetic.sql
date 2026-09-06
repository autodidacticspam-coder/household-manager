-- Keep the existing eight-hour accounting day, with enough precision for minutes.
ALTER TABLE public.leave_requests ALTER COLUMN total_days TYPE numeric(10,4);
ALTER TABLE public.leave_balances ALTER COLUMN vacation_used TYPE numeric(10,4);
ALTER TABLE public.leave_balances ALTER COLUMN sick_used TYPE numeric(10,4);

CREATE TABLE public.leave_balance_effects (
  request_id uuid NOT NULL REFERENCES public.leave_requests(id) ON DELETE CASCADE,
  year integer NOT NULL,
  kind text NOT NULL CHECK(kind IN ('vacation','sick')),
  days numeric(10,4) NOT NULL CHECK(days>0),
  PRIMARY KEY(request_id,year,kind)
);
ALTER TABLE public.leave_balance_effects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view leave accounting" ON public.leave_balance_effects FOR SELECT TO authenticated USING(public.is_admin());
GRANT SELECT ON public.leave_balance_effects TO authenticated;
GRANT ALL ON public.leave_balance_effects TO service_role;

-- Earlier approvals charged the start year. Record that provenance without
-- rewriting old balances or redistributing historical leave across years.
INSERT INTO public.leave_balance_effects(request_id,year,kind,days)
SELECT id,extract(year from start_date),CASE WHEN leave_type='sick' THEN 'sick' ELSE 'vacation' END,total_days
FROM public.leave_requests WHERE status='approved' AND leave_type IN ('vacation','pto','sick') AND total_days>0;

CREATE FUNCTION public.normalize_leave_request() RETURNS trigger LANGUAGE plpgsql
SET search_path=public,pg_temp AS $$
DECLARE dates date[];
BEGIN
  IF TG_OP='UPDATE' AND OLD.status='approved' THEN
    IF ROW(NEW.start_date,NEW.end_date,NEW.selected_dates,NEW.is_full_day,NEW.start_time,NEW.end_time,NEW.leave_type,NEW.total_days,NEW.user_id)
      IS DISTINCT FROM ROW(OLD.start_date,OLD.end_date,OLD.selected_dates,OLD.is_full_day,OLD.start_time,OLD.end_time,OLD.leave_type,OLD.total_days,OLD.user_id)
    THEN RAISE EXCEPTION 'leaveErrors.cancelBeforeEditing'; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' AND NEW.status='denied' THEN RETURN NEW; END IF;
  IF NEW.start_date IS NULL OR NEW.end_date IS NULL OR NEW.end_date<NEW.start_date THEN
    RAISE EXCEPTION 'leaveErrors.dateOrder';
  END IF;
  IF NEW.selected_dates IS NULL THEN
    SELECT array_agg(d::date ORDER BY d) INTO dates FROM generate_series(NEW.start_date::timestamp,NEW.end_date::timestamp,interval '1 day') d;
  ELSE
    SELECT array_agg(DISTINCT d ORDER BY d) INTO dates FROM unnest(NEW.selected_dates) d;
    IF COALESCE(cardinality(dates),0)=0 OR array_position(dates,NULL) IS NOT NULL THEN RAISE EXCEPTION 'leaveErrors.selectDates'; END IF;
    IF dates[1]<>NEW.start_date OR dates[cardinality(dates)]<>NEW.end_date THEN RAISE EXCEPTION 'leaveErrors.rangeMismatch'; END IF;
  END IF;
  NEW.selected_dates := dates;
  NEW.is_full_day := COALESCE(NEW.is_full_day,true);
  IF NEW.is_full_day THEN
    NEW.total_days := cardinality(dates);
    NEW.start_time := NULL; NEW.end_time := NULL;
  ELSE
    IF cardinality(dates)<>1 OR NEW.start_date<>NEW.end_date THEN RAISE EXCEPTION 'leaveErrors.partialSingleDay'; END IF;
    IF NEW.start_time IS NULL OR NEW.end_time IS NULL THEN RAISE EXCEPTION 'leaveErrors.timesRequired'; END IF;
    IF NEW.end_time<=NEW.start_time THEN RAISE EXCEPTION 'leaveErrors.timeOrder'; END IF;
    NEW.total_days := round(extract(epoch FROM NEW.end_time-NEW.start_time)/60/480,4);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER normalize_leave_request BEFORE INSERT OR UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.normalize_leave_request();

CREATE FUNCTION public.apply_leave_balance_effects() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE effect record; kind text; request_days date[];
BEGIN
  IF TG_OP='UPDATE' AND OLD.status='approved' AND NEW.status='approved' THEN RETURN NEW; END IF;
  IF TG_OP IN ('UPDATE','DELETE') AND OLD.status='approved' THEN
    FOR effect IN SELECT * FROM public.leave_balance_effects WHERE request_id=OLD.id ORDER BY year LOOP
      UPDATE public.leave_balances SET
        vacation_used=CASE WHEN effect.kind='vacation' THEN GREATEST(0,vacation_used-effect.days) ELSE vacation_used END,
        sick_used=CASE WHEN effect.kind='sick' THEN GREATEST(0,sick_used-effect.days) ELSE sick_used END
      WHERE user_id=OLD.user_id AND year=effect.year;
    END LOOP;
    DELETE FROM public.leave_balance_effects WHERE request_id=OLD.id;
  END IF;
  IF TG_OP<>'DELETE' AND NEW.status='approved' AND NEW.leave_type IN ('vacation','pto','sick') THEN
    kind := CASE WHEN NEW.leave_type='sick' THEN 'sick' ELSE 'vacation' END;
    request_days := NEW.selected_dates;
    FOR effect IN
      SELECT extract(year FROM d)::integer AS charge_year,
        CASE WHEN NEW.is_full_day THEN count(*)::numeric ELSE NEW.total_days END days
      FROM unnest(request_days) d GROUP BY extract(year FROM d) ORDER BY charge_year
    LOOP
      INSERT INTO public.leave_balance_effects(request_id,year,kind,days) VALUES(NEW.id,effect.charge_year,kind,effect.days);
      INSERT INTO public.leave_balances(user_id,year,vacation_used,sick_used)
      VALUES(NEW.user_id,effect.charge_year,CASE WHEN kind='vacation' THEN effect.days ELSE 0 END,CASE WHEN kind='sick' THEN effect.days ELSE 0 END)
      ON CONFLICT(user_id,year) DO UPDATE SET
        vacation_used=leave_balances.vacation_used+excluded.vacation_used,
        sick_used=leave_balances.sick_used+excluded.sick_used;
    END LOOP;
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
-- Refund before the FK's cascading deletion removes the accounting rows.
CREATE TRIGGER refund_leave_before_delete BEFORE DELETE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.apply_leave_balance_effects();
CREATE TRIGGER account_leave_approval AFTER INSERT OR UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE FUNCTION public.apply_leave_balance_effects();

CREATE FUNCTION public.review_leave_request(p_request_id uuid,p_action text,p_notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.leave_requests; actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'leaveErrors.signIn' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM public.leave_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'leaveErrors.notFound' USING ERRCODE='P0002'; END IF;
  IF p_action='cancel' THEN
    IF NOT public.is_admin() AND (r.user_id<>actor OR r.status<>'pending') THEN
      RAISE EXCEPTION 'leaveErrors.cancelPermission' USING ERRCODE='42501';
    END IF;
    DELETE FROM public.leave_requests WHERE id=r.id;
  ELSIF p_action IN ('approve','deny') THEN
    IF NOT public.is_admin() THEN RAISE EXCEPTION 'leaveErrors.adminRequired' USING ERRCODE='42501'; END IF;
    IF (p_action='approve' AND r.status='approved') OR (p_action='deny' AND r.status='denied') THEN RETURN r.id; END IF;
    IF r.status<>'pending' THEN RAISE EXCEPTION 'leaveErrors.notPending'; END IF;
    IF length(p_notes)>1000 THEN RAISE EXCEPTION 'leaveErrors.notesTooLong'; END IF;
    UPDATE public.leave_requests SET status=CASE WHEN p_action='approve' THEN 'approved'::leave_status ELSE 'denied'::leave_status END,
      admin_notes=NULLIF(p_notes,''),reviewed_by=actor,reviewed_at=now() WHERE id=r.id;
  ELSE RAISE EXCEPTION 'leaveErrors.invalidAction'; END IF;
  RETURN r.id;
END $$;
REVOKE ALL ON FUNCTION public.review_leave_request(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_leave_request(uuid,text,text) TO authenticated;
