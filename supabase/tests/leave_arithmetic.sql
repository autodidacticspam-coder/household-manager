-- Run in a transaction and roll back. Uses no real request IDs.
DO $$
DECLARE actor uuid; employee uuid; request uuid; holiday uuid; partial uuid;
  first_before numeric; second_before numeric; sick_before numeric;
BEGIN
  SELECT id INTO actor FROM public.users WHERE role='admin' ORDER BY id LIMIT 1;
  SELECT id INTO employee FROM public.users WHERE role='employee' ORDER BY id LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub',actor::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  INSERT INTO public.leave_balances(user_id,year,vacation_used,sick_used) VALUES(employee,2088,3,2),(employee,2089,4,2) ON CONFLICT(user_id,year) DO NOTHING;
  SELECT vacation_used,sick_used INTO first_before,sick_before FROM public.leave_balances WHERE user_id=employee AND year=2088;
  SELECT vacation_used INTO second_before FROM public.leave_balances WHERE user_id=employee AND year=2089;
  INSERT INTO public.leave_requests(user_id,leave_type,start_date,end_date,selected_dates,total_days)
    VALUES(employee,'pto','2088-12-30','2089-01-02',ARRAY['2089-01-02','2088-12-30','2088-12-30']::date[],999) RETURNING id INTO request;
  IF (SELECT total_days FROM public.leave_requests WHERE id=request)<>2 THEN RAISE EXCEPTION 'Selected dates counted incorrectly'; END IF;
  PERFORM public.review_leave_request(request,'approve');
  PERFORM public.review_leave_request(request,'approve');
  IF (SELECT vacation_used FROM public.leave_balances WHERE user_id=employee AND year=2088)<>first_before+1 THEN RAISE EXCEPTION 'First-year approval not exact or duplicated'; END IF;
  IF (SELECT vacation_used FROM public.leave_balances WHERE user_id=employee AND year=2089)<>second_before+1 THEN RAISE EXCEPTION 'Second-year approval not exact'; END IF;
  PERFORM public.review_leave_request(request,'cancel');
  IF (SELECT vacation_used FROM public.leave_balances WHERE user_id=employee AND year=2088)<>first_before OR
     (SELECT vacation_used FROM public.leave_balances WHERE user_id=employee AND year=2089)<>second_before THEN RAISE EXCEPTION 'Cancellation did not restore exact balances'; END IF;
  INSERT INTO public.leave_requests(user_id,leave_type,start_date,end_date,total_days,is_full_day,start_time,end_time)
    VALUES(employee,'sick','2088-12-20','2088-12-20',999,false,'09:00','09:01') RETURNING id INTO partial;
  IF (SELECT total_days FROM public.leave_requests WHERE id=partial)<>0.0021 THEN RAISE EXCEPTION 'Minute precision lost'; END IF;
  PERFORM public.review_leave_request(partial,'approve');
  PERFORM public.review_leave_request(partial,'cancel');
  IF (SELECT sick_used FROM public.leave_balances WHERE user_id=employee AND year=2088)<>sick_before THEN RAISE EXCEPTION 'Partial cancellation lost precision'; END IF;
  INSERT INTO public.leave_requests(user_id,leave_type,start_date,end_date,total_days,status)
    VALUES(employee,'holiday','2088-12-25','2088-12-25',1,'approved') RETURNING id INTO holiday;
  PERFORM public.review_leave_request(holiday,'cancel');
  IF (SELECT sick_used FROM public.leave_balances WHERE user_id=employee AND year=2088)<>sick_before THEN RAISE EXCEPTION 'Holiday altered sick leave'; END IF;
  BEGIN
    INSERT INTO public.leave_requests(user_id,leave_type,start_date,end_date,total_days,is_full_day,start_time,end_time)
      VALUES(employee,'sick','2088-12-20','2088-12-20',0.5,false,'17:00','09:00');
    RAISE EXCEPTION 'Reversed times were accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'leaveErrors.timeOrder' THEN RAISE; END IF;
  END;
END $$;
