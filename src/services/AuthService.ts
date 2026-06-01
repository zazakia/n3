import { supabase } from '../database/supabase';
import { database } from '../database';
import { Q } from '@nozbe/watermelondb';
import UserProfile from '../database/models/UserProfile';
import { ErrorService, ErrorType } from './ErrorService';

export class AuthService {
    static isQuickLoginEnabled(): boolean {
        const explicitSetting = process.env.EXPO_PUBLIC_ENABLE_QUICK_LOGIN?.trim().toLowerCase();

        if (explicitSetting === 'true') {
            return true;
        }

        if (explicitSetting === 'false') {
            return false;
        }

        if (process.env.NODE_ENV !== 'production') {
            return true;
        }

        if (typeof window !== 'undefined') {
            const hostname = window.location?.hostname?.toLowerCase();
            return hostname === 'localhost' || hostname === '127.0.0.1';
        }

        return false;
    }

    static async signIn(email: string, password: string): Promise<void> {
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password: password.trim(),
            });

            if (error) {
                if (__DEV__) console.warn(`[AuthService] signIn error: ${error.message} [Status: ${(error as any).status}]`);
                throw error;
            }

            if (__DEV__) console.log('[AuthService] signIn successful for user ID:', data?.user?.id);
        } catch (error) {
            throw ErrorService.handleError(error, 'AuthService.signIn', ErrorType.AUTH);
        }
    }

    static async signOut(): Promise<void> {
        const { error } = await supabase.auth.signOut();
        if (error) {
            throw error;
        }
    }

    static async getCurrentUserRole(uid: string, email?: string): Promise<string | null> {
        if (!uid) {
            if (__DEV__) console.warn('[AuthService] getCurrentUserRole called with no UID');
            return null;
        }

        if (__DEV__) console.log(`[AuthService] Resolving role for ${uid}...`);

        try {
            // Supabase is the source of truth for authorization while online.
            try {
                const { data, error } = await supabase
                    .from('user_profiles')
                    .select('role, is_active, deleted_at')
                    .eq('id', uid)
                    .maybeSingle();

                if (error) {
                    if (__DEV__) console.warn(`[AuthService] Remote role lookup failed for ${uid}:`, error.message);
                    const status = (error as any).status;
                    const message = (error.message || '').toLowerCase();
                    const isAuthorizationFailure =
                        status === 401 ||
                        status === 403 ||
                        message.includes('permission denied') ||
                        message.includes('jwt') ||
                        message.includes('unauthorized');

                    if (isAuthorizationFailure) {
                        if (__DEV__) console.warn('[AuthService] Unauthorized role lookup detected. Keeping auth session and falling back.');
                        return null;
                    }
                } else if (!data) {
                    if (__DEV__) console.warn(`[AuthService] No active remote profile found for UID ${uid}.`);
                    return null;
                } else if (data.deleted_at || data.is_active === false || !data.role) {
                    if (__DEV__) console.warn(`[AuthService] Remote profile for UID ${uid} is inactive, deleted, or missing a role.`);
                    return null;
                } else {
                    if (__DEV__) console.log(`[AuthService] Found remote role for ${uid}: ${data.role}`);
                    return data.role;
                }
            } catch (remoteErr) {
                if (__DEV__) console.warn('[AuthService] Remote role check failed or skipped:', remoteErr instanceof Error ? remoteErr.message : String(remoteErr));
            }

            // Local WatermelonDB is only a fallback cache when remote role is unavailable.
            if (database && database.collections) {
                try {
                    const profilesCollection = database.get<UserProfile>('user_profiles');
                    if (profilesCollection) {
                        try {
                            const profile = await profilesCollection.find(uid);
                            if (profile && !profile.deletedAt) {
                                if (__DEV__) console.log(`[AuthService] Found local role for ${uid}: ${profile.role}`);
                                return profile.role;
                            }
                        } catch (e) {
                            // find() throws if not found, try query as fallback
                            const allProfiles = await profilesCollection.query(Q.where('id', uid)).fetch();
                            if (allProfiles.length > 0 && !allProfiles[0].deletedAt) {
                                if (__DEV__) console.log(`[AuthService] Found local role via query for ${uid}: ${allProfiles[0].role}`);
                                return allProfiles[0].role;
                            }
                        }
                    }
                } catch (dbErr) {
                    if (__DEV__) console.warn('[AuthService] Local DB check failed or skipped:', dbErr instanceof Error ? dbErr.message : String(dbErr));
                }
            }

            if (__DEV__) console.warn(`[AuthService] No role found for UID ${uid} in any source.`);
            return null;
        } catch (e) {
            console.error('[AuthService] Error in getCurrentUserRole:', e);
            ErrorService.handleError(e, 'AuthService.getCurrentUserRole', ErrorType.AUTH);
            return null;
        }
    }

    static async resolveCollectorId(uid: string): Promise<string | null> {
        if (!uid) return null;
        try {
            const collectorRecords = await database.collections.get<any>('collectors')
                .query(Q.where('auth_id', uid))
                .fetch();

            if (collectorRecords.length > 0) {
                return collectorRecords[0].id;
            }

            if (__DEV__) console.log(`[AuthService] Collector not found locally for UID: ${uid}, checking remote...`);
            const { data, error } = await supabase
                .from('app_collectors')
                .select('id')
                .eq('auth_id', uid)
                .is('deleted_at', null)
                .maybeSingle();

            if (error) {
                if (__DEV__) console.warn('[AuthService] Remote collector lookup failed:', error.message);
                return null;
            }

            return data?.id || null;
        } catch (e) {
            console.error('[AuthService] Error resolving collector ID:', e);
            return null;
        }
    }

    static async getQuickLoginUsers() {
        if (!AuthService.isQuickLoginEnabled()) {
            return [];
        }

        try {
            const usersMap = new Map<string, any>();

            if (database && database.collections) {
                try {
                    const localProfiles = await database.get<UserProfile>('user_profiles').query(
                        Q.where('role', Q.oneOf(['admin', 'collector', 'loan_encoder', 'payment_encoder', 'expenses_encoder'])),
                        Q.where('is_active', true)
                    ).fetch();
                    localProfiles.forEach(p => {
                        const email = (p.email || '').toLowerCase();
                        const name = (p.fullName || '').toLowerCase();
                        const isAllowedDomain = email.endsWith('@loanbrick.com') || email.endsWith('@gmail.com');
                        const isMock = name.includes('diagnostic') || name.includes('mock') || name.includes('test') || name.includes('fix') || name.includes('collector 0') || name.includes('collector 1');

                        if (email && isAllowedDomain && !isMock) {
                            usersMap.set(email, {
                                id: p.id,
                                full_name: p.fullName,
                                role: p.role,
                                email: p.email,
                                is_active: p.isActive
                            });
                        }
                    });
                } catch (dbErr) {
                    if (__DEV__) console.warn('[AuthService] Local profiles fetch failed/skipped', dbErr);
                }
            }

            const { data: sessionData } = await supabase.auth.getSession();
            const hasAuthenticatedSession = Boolean(sessionData?.session?.access_token);

            if (!hasAuthenticatedSession) {
                return Array.from(usersMap.values());
            }

            const { data: remoteProfiles, error } = await supabase
                .from('user_profiles')
                .select('id, full_name, role, email, is_active')
                .eq('is_active', true)
                .order('role');

            if (error) {
                throw error;
            }

            if (remoteProfiles) {
                remoteProfiles.forEach(p => {
                    const email = (p.email || '').toLowerCase();
                    const role = p.role || 'collector';
                    const name = (p.full_name || '').toLowerCase();

                    const isAllowedDomain = email.endsWith('@loanbrick.com') || email.endsWith('@gmail.com');
                    const isMock = name.includes('diagnostic') || name.includes('mock') || name.includes('test') || name.includes('fix') || name.includes('collector 0') || name.includes('collector 1');

                    if (email && !usersMap.has(email) && (role === 'admin' || role === 'collector' || role === 'loan_encoder' || role === 'payment_encoder' || role === 'expenses_encoder') && isAllowedDomain && !isMock) {
                        usersMap.set(email, {
                            id: p.id,
                            full_name: p.full_name || 'Unknown User',
                            role: role,
                            email: p.email,
                            is_active: p.is_active ?? true
                        });
                    }
                });
            }

            return Array.from(usersMap.values());
        } catch (error) {
            ErrorService.handleError(error, 'AuthService.getQuickLoginUsers', ErrorType.AUTH);
            return [];
        }
    }

    static get currentUser() {
        return supabase.auth.getUser();
    }

    static async getCurrentUserId(): Promise<string | null> {
        const { data } = await supabase.auth.getUser();
        return data.user?.id || null;
    }

    static async sendPasswordResetEmail(email: string): Promise<void> {
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
            if (error) throw error;
        } catch (error) {
            throw ErrorService.handleError(error, 'AuthService.sendPasswordResetEmail', ErrorType.AUTH);
        }
    }
}

