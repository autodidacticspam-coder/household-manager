-- Migration 023 removed tables/columns still used by historical calendar data.
-- Restore the compatibility shape on fresh databases without deleting or
-- rewriting any existing history. New repeating work uses explicit series.
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS recurrence_rule text;
CREATE TABLE IF NOT EXISTS public.task_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  completion_date date NOT NULL,
  completed_by uuid REFERENCES public.users(id),
  completed_at timestamptz DEFAULT now(),
  UNIQUE(task_id,completion_date)
);
CREATE TABLE IF NOT EXISTS public.task_skipped_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  skipped_date date NOT NULL,
  skipped_by uuid REFERENCES public.users(id),
  skipped_at timestamptz DEFAULT now(),
  UNIQUE(task_id,skipped_date)
);
ALTER TABLE public.task_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_skipped_instances ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='task_completions' AND policyname='Admins can manage all task completions') THEN
    CREATE POLICY "Admins can manage all task completions" ON public.task_completions FOR ALL TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='task_skipped_instances' AND policyname='Admins can manage all task skipped instances') THEN
    CREATE POLICY "Admins can manage all task skipped instances" ON public.task_skipped_instances FOR ALL TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
  END IF;
END $$;
