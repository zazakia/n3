-- Migration: Fix app_recurring_expenses timestamp columns to use TIMESTAMPTZ instead of BIGINT
-- This fixes the SyncService error: invalid input syntax for type bigint: "YYYY-MM-DDTHH:MM:SS.mmmZ"

-- Drop dependent policy first
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.app_recurring_expenses;

-- 1. Convert created_at
ALTER TABLE public.app_recurring_expenses 
ALTER COLUMN created_at TYPE TIMESTAMPTZ 
USING (
    CASE 
        WHEN created_at IS NOT NULL THEN to_timestamp(created_at / 1000.0)
        ELSE NULL
    END
);

-- 2. Convert updated_at
ALTER TABLE public.app_recurring_expenses 
ALTER COLUMN updated_at TYPE TIMESTAMPTZ 
USING (
    CASE 
        WHEN updated_at IS NOT NULL THEN to_timestamp(updated_at / 1000.0)
        ELSE NULL
    END
);

-- 3. Convert deleted_at
ALTER TABLE public.app_recurring_expenses 
ALTER COLUMN deleted_at TYPE TIMESTAMPTZ 
USING (
    CASE 
        WHEN deleted_at IS NOT NULL THEN to_timestamp(deleted_at / 1000.0)
        ELSE NULL
    END
);

-- Recreate default values for updated_at and created_at to match other tables
ALTER TABLE public.app_recurring_expenses ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE public.app_recurring_expenses ALTER COLUMN updated_at SET DEFAULT now();

-- Recreate dependent policy
CREATE POLICY "Enable read access for authenticated users" 
ON public.app_recurring_expenses FOR SELECT 
TO authenticated 
USING (deleted_at IS NULL);
