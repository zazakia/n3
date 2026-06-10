-- Migration: Grant authenticated users access to app_recurring_expenses table
-- This is necessary for PostgREST to expose the table in its schema cache.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.app_recurring_expenses TO authenticated;

-- Reload the schema cache to immediately apply this
NOTIFY pgrst, 'reload schema';
