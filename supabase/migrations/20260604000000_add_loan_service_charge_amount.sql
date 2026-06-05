ALTER TABLE public.app_loans
    ADD COLUMN IF NOT EXISTS service_charge_amount NUMERIC DEFAULT 0;

