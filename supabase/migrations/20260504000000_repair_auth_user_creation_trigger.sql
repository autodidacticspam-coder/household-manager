-- =====================================================
-- REPAIR AUTH USER CREATION TRIGGER
-- =====================================================
--
-- Production had a custom auth.users trigger that caused Supabase Auth admin
-- user creation to fail with "Database error creating new user". This app
-- creates public.users rows explicitly from the employee-create API route, so
-- auth triggers must never block auth.users inserts.

DO $$
DECLARE
  trigger_record RECORD;
BEGIN
  FOR trigger_record IN
    SELECT tgname
    FROM pg_trigger
    WHERE tgrelid = 'auth.users'::regclass
      AND NOT tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON auth.users', trigger_record.tgname);
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  metadata_role TEXT;
  metadata_full_name TEXT;
  metadata_phone TEXT;
BEGIN
  metadata_role := COALESCE(
    NEW.raw_user_meta_data ->> 'role',
    NEW.raw_app_meta_data ->> 'role',
    'employee'
  );

  IF metadata_role NOT IN ('admin', 'employee') THEN
    metadata_role := 'employee';
  END IF;

  metadata_full_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data ->> 'fullName', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'name', ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    'New Employee'
  );

  metadata_phone := NULLIF(NEW.raw_user_meta_data ->> 'phone', '');

  BEGIN
    INSERT INTO public.users (id, email, full_name, role, phone)
    VALUES (
      NEW.id,
      COALESCE(NEW.email, ''),
      metadata_full_name,
      metadata_role::public.user_role,
      metadata_phone
    )
    ON CONFLICT (id) DO UPDATE
      SET email = EXCLUDED.email,
          updated_at = NOW();
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Non-blocking auth user mirror failed for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();
