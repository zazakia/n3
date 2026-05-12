import { AuthService } from '../AuthService';
import { supabase } from '../../database/supabase';
import { database } from '../../database';
import { Q } from '@nozbe/watermelondb';

// Mock ErrorService
jest.mock('../ErrorService', () => ({
    ErrorService: {
        handleError: jest.fn((err) => err),
        showErrorToast: jest.fn(),
        showSuccessToast: jest.fn(),
        showInfoToast: jest.fn(),
    },
    ErrorType: {
        AUTH: 'AUTH',
        SYNC: 'SYNC',
        NETWORK: 'NETWORK',
        UNKNOWN: 'UNKNOWN',
    }
}));

const mockAuthChain = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
    then: jest.fn().mockImplementation(function(this: any, resolve: any) {
        return Promise.resolve({ data: [], error: null }).then(resolve);
    })
};

jest.mock('../../database/supabase', () => ({
    supabase: {
        auth: {
            signInWithPassword: jest.fn(),
            signOut: jest.fn().mockResolvedValue({ error: null }),
            getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
            getSession: jest.fn().mockResolvedValue({ data: { session: null }, error: null }),
        },
        from: jest.fn(() => mockAuthChain),
    },
    clearPersistedAuthSession: jest.fn().mockResolvedValue(undefined),
}));

const mockAuthCollection = {
    find: jest.fn(),
    query: jest.fn().mockReturnThis(),
    fetch: jest.fn().mockResolvedValue([]),
};

jest.mock('../../database', () => ({
    database: {
        get: jest.fn(() => mockAuthCollection),
        collections: {
            get: jest.fn(() => mockAuthCollection)
        },
        write: jest.fn((callback) => callback()),
        unsafeResetDatabase: jest.fn(),
    }
}));

describe('AuthService', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalQuickLoginSetting = process.env.EXPO_PUBLIC_ENABLE_QUICK_LOGIN;
    const originalWindow = (globalThis as any).window;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        mockAuthChain.maybeSingle.mockResolvedValue({ data: null, error: null });
        mockAuthChain.then.mockImplementation(function(this: any, resolve: any) {
            return Promise.resolve({ data: [], error: null }).then(resolve);
        });
        mockAuthCollection.find.mockReset();
        mockAuthCollection.query.mockReturnThis();
        mockAuthCollection.fetch.mockResolvedValue([]);
        (supabase.auth.getSession as jest.Mock).mockResolvedValue({ data: { session: null }, error: null });
        process.env.NODE_ENV = originalNodeEnv;
        if (originalQuickLoginSetting === undefined) {
            delete process.env.EXPO_PUBLIC_ENABLE_QUICK_LOGIN;
        } else {
            process.env.EXPO_PUBLIC_ENABLE_QUICK_LOGIN = originalQuickLoginSetting;
        }
        if (originalWindow === undefined) {
            delete (globalThis as any).window;
        } else {
            (globalThis as any).window = originalWindow;
        }
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('isQuickLoginEnabled', () => {
        it('enables quick login on localhost even for production-style web builds', () => {
            process.env.NODE_ENV = 'production';
            delete process.env.EXPO_PUBLIC_ENABLE_QUICK_LOGIN;
            (globalThis as any).window = { location: { hostname: '127.0.0.1' } };

            expect(AuthService.isQuickLoginEnabled()).toBe(true);
        });

        it('honors an explicit false override', () => {
            process.env.NODE_ENV = 'development';
            process.env.EXPO_PUBLIC_ENABLE_QUICK_LOGIN = 'false';

            expect(AuthService.isQuickLoginEnabled()).toBe(false);
        });
    });

    describe('signIn', () => {
        it('signs in successfully', async () => {
            (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
            await AuthService.signIn('a@b.com', 'pass');
            expect(supabase.auth.signInWithPassword).toHaveBeenCalled();
        });
        it('throws on error', async () => {
            (supabase.auth.signInWithPassword as jest.Mock).mockResolvedValue({ error: new Error('Fail') });
            await expect(AuthService.signIn('a', 'b')).rejects.toThrow('Fail');
        });
    });

    describe('signOut', () => {
        it('preserves local db and signs out', async () => {
            await AuthService.signOut();
            expect(database.write).not.toHaveBeenCalled();
            expect(database.unsafeResetDatabase).not.toHaveBeenCalled();
            expect(supabase.auth.signOut).toHaveBeenCalled();
        });

        it('throws if Supabase signOut returns an error', async () => {
            (supabase.auth.signOut as jest.Mock).mockResolvedValueOnce({
                error: new Error('Sign out failed'),
            });

            await expect(AuthService.signOut()).rejects.toThrow('Sign out failed');
            expect(database.unsafeResetDatabase).not.toHaveBeenCalled();
        });
    });

    describe('getCurrentUserRole', () => {
        it('uses Supabase as source of truth when remote role exists', async () => {
            mockAuthCollection.find.mockResolvedValue({ role: 'admin', deletedAt: null });
            mockAuthChain.maybeSingle.mockResolvedValue({ data: { role: 'collector', is_active: true, deleted_at: null }, error: null });
            const role = await AuthService.getCurrentUserRole('u1');
            expect(role).toBe('collector');
        });

        it('does not fall back to local role when remote profile is missing', async () => {
            mockAuthCollection.find.mockResolvedValue({ role: 'admin', deletedAt: null });
            mockAuthChain.maybeSingle.mockResolvedValue({ data: null, error: null });
            const role = await AuthService.getCurrentUserRole('u1');
            expect(role).toBeNull();
        });

        it('does not fall back to local role when remote profile is inactive', async () => {
            mockAuthCollection.find.mockResolvedValue({ role: 'admin', deletedAt: null });
            mockAuthChain.maybeSingle.mockResolvedValue({ data: { role: 'admin', is_active: false, deleted_at: null }, error: null });
            const role = await AuthService.getCurrentUserRole('u1');
            expect(role).toBeNull();
        });

        it('does not fall back to local role when remote profile is deleted', async () => {
            mockAuthCollection.find.mockResolvedValue({ role: 'admin', deletedAt: null });
            mockAuthChain.maybeSingle.mockResolvedValue({ data: { role: 'admin', is_active: true, deleted_at: '2026-04-21' }, error: null });
            const role = await AuthService.getCurrentUserRole('u1');
            expect(role).toBeNull();
        });

        it('returns from local db when remote lookup fails', async () => {
            mockAuthChain.maybeSingle.mockResolvedValue({ data: null, error: { message: 'Network unavailable' } });
            mockAuthCollection.find.mockResolvedValue({ role: 'admin', deletedAt: null });
            const role = await AuthService.getCurrentUserRole('u1');
            expect(role).toBe('admin');
        });

        it('falls back safely after unauthorized remote lookup without clearing auth', async () => {
            const { clearPersistedAuthSession } = require('../../database/supabase');
            mockAuthChain.maybeSingle.mockResolvedValue({
                data: null,
                error: { message: 'permission denied for table user_profiles', status: 401 },
            });
            mockAuthCollection.find.mockResolvedValue({ role: 'admin', deletedAt: null });

            const role = await AuthService.getCurrentUserRole('u1');

            expect(role).toBeNull();
            expect(clearPersistedAuthSession).not.toHaveBeenCalled();
            expect(mockAuthCollection.find).not.toHaveBeenCalled();
        });

        it('treats permission denied without status as a non-fatal lookup failure', async () => {
            const { clearPersistedAuthSession } = require('../../database/supabase');
            mockAuthChain.maybeSingle.mockResolvedValue({
                data: null,
                error: { message: 'permission denied for table user_profiles' },
            });
            mockAuthCollection.find.mockResolvedValue({ role: 'admin', deletedAt: null });

            const role = await AuthService.getCurrentUserRole('u1');

            expect(role).toBeNull();
            expect(clearPersistedAuthSession).not.toHaveBeenCalled();
            expect(mockAuthCollection.find).not.toHaveBeenCalled();
        });

        it('falls back to local query if remote lookup and local find fail', async () => {
            mockAuthChain.maybeSingle.mockResolvedValue({ data: null, error: { message: 'Network unavailable' } });
            mockAuthCollection.find.mockRejectedValue(new Error('NotFound'));
            mockAuthCollection.fetch.mockResolvedValue([{ role: 'collector', deletedAt: null }]);
            const role = await AuthService.getCurrentUserRole('u1');
            expect(role).toBe('collector');
        });

        it('falls back to Supabase if local fails', async () => {
            mockAuthCollection.find.mockRejectedValue(new Error('TotalFail'));
            mockAuthCollection.fetch.mockRejectedValue(new Error('TotalFail'));
            mockAuthChain.maybeSingle.mockResolvedValue({ data: { role: 'admin', is_active: true, deleted_at: null }, error: null });
            const role = await AuthService.getCurrentUserRole('u1');
            expect(role).toBe('admin');
        });

        it('returns null if no profile exists in local or remote', async () => {
             mockAuthCollection.find.mockRejectedValue(new Error('F'));
             mockAuthCollection.fetch.mockResolvedValue([]);
             mockAuthChain.maybeSingle.mockResolvedValue({ data: null, error: null });
             const role = await AuthService.getCurrentUserRole('u1', 'unknown@email.com');
             expect(role).toBeNull();
        });

        it('returns null if uid is empty', async () => {
            const role = await AuthService.getCurrentUserRole('');
            expect(role).toBeNull();
        });

        it('handles remote error gracefully and returns null', async () => {
            mockAuthCollection.find.mockRejectedValue(new Error('Local Fail'));
            mockAuthCollection.fetch.mockResolvedValue([]);
            mockAuthChain.maybeSingle.mockResolvedValue({ data: null, error: { message: 'Remote Auth Fail' } });
            
            const role = await AuthService.getCurrentUserRole('u1');
            expect(role).toBeNull();
        });
    });

    describe('resolveCollectorId', () => {
        it('resolves from local db', async () => {
            mockAuthCollection.fetch.mockResolvedValue([{ id: 'c1' }]);
            const id = await AuthService.resolveCollectorId('u1');
            expect(id).toBe('c1');
        });

        it('resolves from remote if local empty', async () => {
            mockAuthCollection.fetch.mockResolvedValue([]);
            mockAuthChain.maybeSingle.mockResolvedValue({ data: { id: 'remote-c' }, error: null });
            const id = await AuthService.resolveCollectorId('u1');
            expect(id).toBe('remote-c');
        });

        it('returns null on remote error', async () => {
            mockAuthCollection.fetch.mockResolvedValue([]);
            mockAuthChain.maybeSingle.mockResolvedValue({ data: null, error: { message: 'RemFail' } });
            const id = await AuthService.resolveCollectorId('u1');
            expect(id).toBeNull();
        });
    });

    describe('getQuickLoginUsers', () => {
        it('returns no quick-login users when explicitly disabled', async () => {
            process.env.NODE_ENV = 'production';
            process.env.EXPO_PUBLIC_ENABLE_QUICK_LOGIN = 'false';

            const users = await AuthService.getQuickLoginUsers();
            expect(users).toEqual([]);
            expect(database.get).not.toHaveBeenCalled();
            expect(supabase.from).not.toHaveBeenCalled();
        });

        it('filters and deduplicates users from local and remote', async () => {
            // Local
            mockAuthCollection.fetch.mockResolvedValueOnce([
                { id: '1', email: 'admin@loanbrick.com', fullName: 'Real Admin', role: 'admin', isActive: true },
                { id: '2', email: 'mock@test.com', fullName: 'Mock User', role: 'collector', isActive: true } // should be filtered
            ]);
            // Remote
            (supabase.auth.getSession as jest.Mock).mockResolvedValueOnce({ data: { session: { access_token: 'token' } }, error: null });
            mockAuthChain.then.mockImplementationOnce(function(this: any, resolve: any) {
                return Promise.resolve({
                    data: [
                        { id: '1', email: 'admin@loanbrick.com', role: 'admin', is_active: true }, // Duplicate
                        { id: '3', email: 'real@gmail.com', role: 'collector', is_active: true }
                    ],
                    error: null
                }).then(resolve);
            });

            const users = await AuthService.getQuickLoginUsers();
            expect(users.length).toBe(2);
            expect(users.map(u => u.email)).toContain('admin@loanbrick.com');
            expect(users.map(u => u.email)).toContain('real@gmail.com');
        });

        it('handles errors in getQuickLoginUsers', async () => {
            mockAuthCollection.fetch.mockRejectedValue(new Error('Local Fail'));
            mockAuthChain.then.mockImplementationOnce(function(this: any, resolve: any) {
                return Promise.resolve({ data: null, error: { message: 'Rem Fail' } }).then(resolve);
            });
            const users = await AuthService.getQuickLoginUsers();
            expect(users).toEqual([]);
        });
    });

    describe('Accessors and Error Handling', () => {
        it('gets currentUser and ID', async () => {
            (supabase.auth.getUser as jest.Mock).mockResolvedValue({ data: { user: { id: 'u123' } } });
            await AuthService.getCurrentUserId();
            expect(AuthService.currentUser).toBeDefined();
        });

        it('handles error in resolveCollectorId', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            jest.spyOn(database.collections, 'get').mockImplementationOnce(() => {
                throw new Error('Local Fail');
            });
            const res = await AuthService.resolveCollectorId('u1');
            expect(res).toBeNull();
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });

        it('handles error in getCurrentUserRole', async () => {
            (supabase.auth.getUser as jest.Mock).mockRejectedValueOnce(new Error('Auth Fail'));
            const res = await AuthService.getCurrentUserRole('u1');
            expect(res).toBeNull();
        });

        it('returns null for unknown email', async () => {
            const res = await AuthService.getCurrentUserRole('unknown@email.com');
            expect(res).toBeNull();
        });
    });
});


