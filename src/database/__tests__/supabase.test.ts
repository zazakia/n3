import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabaseAuthStorageKey, withTimeout, supabase } from '../supabase';

jest.mock('@react-native-async-storage/async-storage', () => ({
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
}));

describe('Supabase Infrastructure', () => {
    describe('getSupabaseAuthStorageKey', () => {
        it('generates the correct key from a standard supabase URL', () => {
            const url = 'https://xyz.supabase.co';
            expect(getSupabaseAuthStorageKey(url)).toBe('sb-xyz-auth-token');
        });

        it('handles URLs with ports', () => {
            const url = 'http://localhost:54321';
            expect(getSupabaseAuthStorageKey(url)).toBe('sb-localhost-auth-token');
        });

        it('uses default supabaseUrl if none provided', () => {
            expect(getSupabaseAuthStorageKey()).toContain('auth-token');
        });
    });

    describe('withTimeout', () => {
        it('resolves when the promise completes within timeout', async () => {
            const p = Promise.resolve('ok');
            const result = await withTimeout(p, 1000, 'test');
            expect(result).toBe('ok');
        });

        it('rejects when the timeout expires', async () => {
            const p = new Promise(resolve => setTimeout(() => resolve('ok'), 200));
            await expect(withTimeout(p, 50, 'test')).rejects.toThrow('test timed out');
        });
    });

    describe('Supabase Client Instance', () => {
        it('exports a valid supabase client', () => {
            expect(supabase).toBeDefined();
            expect(typeof supabase.from).toBe('function');
            expect(typeof supabase.auth).toBe('object');
        });
    });
});
