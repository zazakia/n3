-- Migration: add recurring_expenses table and recurring_expense_id to app_expenses

CREATE TABLE IF NOT EXISTS public.app_recurring_expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category TEXT NOT NULL,
    description TEXT,
    amount NUMERIC NOT NULL,
    frequency TEXT NOT NULL,
    next_due_date BIGINT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    reminders_enabled BOOLEAN NOT NULL DEFAULT false,
    reminder_time TEXT,
    encoded_by TEXT,
    created_at BIGINT,
    updated_at BIGINT,
    deleted_at BIGINT
);

ALTER TABLE public.app_expenses
ADD COLUMN IF NOT EXISTS recurring_expense_id UUID;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_app_expenses_recurring_expense_id ON public.app_expenses (recurring_expense_id);
CREATE INDEX IF NOT EXISTS idx_app_recurring_expenses_encoded_by ON public.app_recurring_expenses (encoded_by);

-- Enable RLS
ALTER TABLE public.app_recurring_expenses ENABLE ROW LEVEL SECURITY;

-- RLS Policies for app_recurring_expenses
-- Allow authenticated users to view active recurring expenses
CREATE POLICY "Enable read access for authenticated users" 
ON public.app_recurring_expenses FOR SELECT 
TO authenticated 
USING (deleted_at IS NULL);

-- Allow authenticated users to insert recurring expenses
CREATE POLICY "Enable insert for authenticated users" 
ON public.app_recurring_expenses FOR INSERT 
TO authenticated 
WITH CHECK (true);

-- Allow authenticated users to update recurring expenses
CREATE POLICY "Enable update for authenticated users" 
ON public.app_recurring_expenses FOR UPDATE 
TO authenticated 
USING (true)
WITH CHECK (true);

-- Allow authenticated users to soft delete recurring expenses
CREATE POLICY "Enable delete (soft delete) for authenticated users" 
ON public.app_recurring_expenses FOR DELETE 
TO authenticated 
USING (true);

-- Realtime
alter publication supabase_realtime add table app_recurring_expenses;
