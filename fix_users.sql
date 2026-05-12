-- Ensure pgcrypto for hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Clear existing to avoid conflict issues in manual seeding
DELETE FROM auth.users WHERE email IN ('admin@loanbrick.com', 'cybergada@gmail.com', 'collector@loanbrick.com', 'encoder@loanbrick.com');

-- Function for inserting auth users
DO $$
DECLARE
    pw_loanbrick TEXT := crypt('12345678', gen_salt('bf'));
BEGIN
    -- admin@loanbrick.com (Admin)
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
    VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@loanbrick.com', pw_loanbrick, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Admin User"}', now(), now(), now());

    -- cybergada@gmail.com (Admin)
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
    VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cybergada@gmail.com', pw_loanbrick, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Cybergada Master"}', now(), now(), now());

    -- collector@loanbrick.com (Collector)
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
    VALUES ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'collector@loanbrick.com', pw_loanbrick, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Master Collector"}', now(), now(), now());

    -- encoder@loanbrick.com (Encoder)
    INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, last_sign_in_at)
    VALUES ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'encoder@loanbrick.com', pw_loanbrick, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Loan Encoder"}', now(), now(), now());
END $$;

-- Populate public.user_profiles
DELETE FROM public.user_profiles WHERE id IN ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004');

INSERT INTO public.user_profiles (id, full_name, email, role, is_active)
VALUES 
('00000000-0000-0000-0000-000000000001', 'Admin User', 'admin@loanbrick.com', 'admin', true),
('00000000-0000-0000-0000-000000000002', 'Cybergada Master', 'cybergada@gmail.com', 'admin', true),
('00000000-0000-0000-0000-000000000003', 'Master Collector', 'collector@loanbrick.com', 'collector', true),
('00000000-0000-0000-0000-000000000004', 'Loan Encoder', 'encoder@loanbrick.com', 'loan_encoder', true);
