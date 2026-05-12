import { getRuntimeSupabaseUrl } from '../supabaseUrl';

describe('getRuntimeSupabaseUrl', () => {
    it('routes host localhost Supabase URLs through the Android emulator gateway', () => {
        expect(getRuntimeSupabaseUrl('http://127.0.0.1:55321', 'android')).toBe('http://10.0.2.2:55321');
        expect(getRuntimeSupabaseUrl('http://localhost:55321', 'android')).toBe('http://10.0.2.2:55321');
    });

    it('leaves remote Supabase URLs unchanged on Android', () => {
        const url = 'https://dbocdelbzirvzdsmmnmt.supabase.co';
        expect(getRuntimeSupabaseUrl(url, 'android')).toBe(url);
    });

    it('leaves local URLs unchanged outside Android', () => {
        expect(getRuntimeSupabaseUrl('http://127.0.0.1:55321', 'web')).toBe('http://127.0.0.1:55321');
        expect(getRuntimeSupabaseUrl('http://localhost:55321', 'ios')).toBe('http://localhost:55321');
    });
});
