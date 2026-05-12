-- Local auth/profile seed for `supabase db reset`
-- Mirrors the quick-login users expected by the login screen and Playwright tests.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DO $$
DECLARE
    pw_loanbrick text := crypt('12345678', gen_salt('bf'));
BEGIN
    CREATE TEMP TABLE IF NOT EXISTS seed_login_users (
        id uuid PRIMARY KEY,
        email text NOT NULL UNIQUE,
        full_name text NOT NULL,
        app_role text NOT NULL
    ) ON COMMIT DROP;

    TRUNCATE seed_login_users;

    INSERT INTO seed_login_users (id, email, full_name, app_role)
    VALUES
        ('00000000-0000-0000-0000-000000000001', 'admin@loanbrick.com', 'Admin User', 'admin'),
        ('00000000-0000-0000-0000-000000000002', 'cybergada@gmail.com', 'Cybergada Master', 'admin'),
        ('00000000-0000-0000-0000-000000000003', 'collector@loanbrick.com', 'Master Collector', 'collector'),
        ('00000000-0000-0000-0000-000000000004', 'loan_encoder@loanbrick.com', 'Loan Encoder', 'loan_encoder'),
        ('00000000-0000-0000-0000-000000000005', 'payment_encoder@loanbrick.com', 'Payment Encoder', 'payment_encoder'),
        ('00000000-0000-0000-0000-000000000006', 'expenses_encoder@loanbrick.com', 'Expenses Encoder', 'expenses_encoder'),
        ('00000000-0000-0000-0000-000000000007', 'cresencio.junco@loanbrick.com', 'Cresencio Junco', 'collector'),
        ('00000000-0000-0000-0000-000000000008', 'gerald.gera@loanbrick.com', 'Gerald Gera', 'collector'),
        ('00000000-0000-0000-0000-000000000009', 'bernie.casera@loanbrick.com', 'Bernie Casera', 'collector'),
        ('00000000-0000-0000-0000-000000000010', 'jayson.cayanong@loanbrick.com', 'Jayson Cayanong', 'collector'),
        ('00000000-0000-0000-0000-000000000011', 'mainoffice@loanbrick.com', 'Main Office', 'collector'),
        ('00000000-0000-0000-0000-000000000012', 'member.test@loanbrick.com', 'Test Member', 'borrower'),
        ('00000000-0000-0000-0000-000000000013', 'bisayangcollector@gmail.com', 'Bisayang Collector', 'collector');

    DELETE FROM auth.identities
    WHERE user_id IN (SELECT id FROM seed_login_users)
       OR lower(provider_id) IN (SELECT lower(email) FROM seed_login_users);

    DELETE FROM auth.users
    WHERE id IN (SELECT id FROM seed_login_users)
       OR lower(email) IN (SELECT lower(email) FROM seed_login_users)
       OR lower(email) = 'encoder@loanbrick.com';

    DELETE FROM public.user_profiles
    WHERE id IN (SELECT id::text FROM seed_login_users)
       OR lower(email) IN (SELECT lower(email) FROM seed_login_users)
       OR lower(email) = 'encoder@loanbrick.com';

    INSERT INTO auth.users (
        id,
        instance_id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        last_sign_in_at,
        confirmation_token,
        recovery_token,
        email_change_token_new,
        email_change_token_current,
        reauthentication_token,
        email_change,
        phone_change
    )
    SELECT
        id,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        email,
        pw_loanbrick,
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', full_name, 'role', app_role),
        now(),
        now(),
        now(),
        '',
        '',
        '',
        '',
        '',
        '',
        ''
    FROM seed_login_users;

    INSERT INTO auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
    )
    SELECT
        gen_random_uuid(),
        id,
        jsonb_build_object('sub', id::text, 'email', email),
        'email',
        email,
        now(),
        now(),
        now()
    FROM seed_login_users;

    INSERT INTO public.user_profiles (id, full_name, email, role, is_active, created_at, updated_at)
    SELECT id::text, full_name, email, app_role, true, now(), now()
    FROM seed_login_users;
END $$;
