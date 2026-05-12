import React, { createContext, useContext, useEffect, useState, useMemo, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { clearPersistedAuthSession, supabase, withTimeout } from '../database/supabase';
import { usePathname, useRouter, useSegments } from 'expo-router';
import { AuthService } from '../services/AuthService';
import { ROLE_HOME_ROUTES, UserRole } from '../constants/roles';
import { ErrorService, ErrorType } from '../services/ErrorService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildRouteWithGroup, isRouteAllowedForRole, LAST_AUTHORIZED_ROUTE_KEY } from '../utils/authNavigation';

type AuthContextType = {
    user: User | null;
    session: Session | null;
    role: string | null;
    roleResolved: boolean;
    collectorId: string | null;
    sunlightMode: boolean;
    toggleSunlightMode: () => void;
    initialized: boolean;
    initializationError: Error | null;
    signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
    user: null,
    session: null,
    role: null,
    roleResolved: false,
    collectorId: null,
    sunlightMode: false,
    toggleSunlightMode: () => { },
    initialized: false,
    initializationError: null,
    signOut: async () => { },
});

export const useAuth = () => useContext(AuthContext);
export const SKIP_NEXT_AUTO_SYNC_KEY = 'skip_next_auto_sync_once';

const SESSION_RESTORE_TIMEOUT_MS = 8000;
const ROLE_RESOLUTION_TIMEOUT_MS = 5000;
const COLLECTOR_RESOLUTION_TIMEOUT_MS = 5000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [session, setSession] = useState<Session | null>(null);
    const [role, setRole] = useState<string | null>(null);
    const [roleResolved, setRoleResolved] = useState(false);
    const [collectorId, setCollectorId] = useState<string | null>(null);
    const [sunlightMode, setSunlightMode] = useState(false);
    const [initialized, setInitialized] = useState(false);
    const [initializationError, setInitializationError] = useState<Error | null>(null);
    const suppressNextAutoSyncRef = useRef(false);
    const isBootstrappingRef = useRef(true);
    const roleResolutionRequestIdRef = useRef(0);
    const roleResolutionPromiseRef = useRef<Promise<void> | null>(null);
    const roleResolutionUserIdRef = useRef<string | null>(null);
    const currentUserIdRef = useRef<string | null>(null);
    const currentRoleResolvedRef = useRef(false);

    const segments = useSegments();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        currentUserIdRef.current = user?.id ?? null;
        currentRoleResolvedRef.current = roleResolved;
    }, [user?.id, roleResolved]);

    useEffect(() => {
        if (!initialized || !user || !roleResolved || !role) return;

        const currentRoute = buildRouteWithGroup(segments[0], pathname);
        if (!isRouteAllowedForRole(currentRoute, role)) return;

        Promise.resolve(AsyncStorage.setItem(LAST_AUTHORIZED_ROUTE_KEY, currentRoute)).catch((error) => {
            console.warn('[AuthContext] Failed to persist last authorized route:', error);
        });
    }, [initialized, user, role, roleResolved, segments, pathname]);

    const resolveRoleForSession = async (
        sessionUser: User,
        source: string,
        _shouldSkipAutoSync: boolean,
        preserveResolvedState = false
    ) => {
        if (roleResolutionPromiseRef.current && roleResolutionUserIdRef.current === sessionUser.id) {
            return roleResolutionPromiseRef.current;
        }

        const roleRequestId = ++roleResolutionRequestIdRef.current;
        roleResolutionUserIdRef.current = sessionUser.id;
        if (!preserveResolvedState) {
            setRoleResolved(false);
        }

        let settlePromise: Promise<void>;
        settlePromise = (async () => {
            let resolvedRole: string | null = null;
            let collector: string | null = null;

            for (let attempt = 1; attempt <= 2; attempt++) {
                resolvedRole = await withTimeout(
                    AuthService.getCurrentUserRole(sessionUser.id, sessionUser.email),
                    ROLE_RESOLUTION_TIMEOUT_MS,
                    `${source} role resolution`
                );
                if (resolvedRole || attempt === 2) {
                    break;
                }

                console.log(`[AuthContext] ${source} role resolution returned no role, retrying once...`);
                await new Promise((resolve) => setTimeout(resolve, 500));
                if (roleRequestId !== roleResolutionRequestIdRef.current) return;
            }

            if (roleRequestId !== roleResolutionRequestIdRef.current) return;
            console.log(`[AuthContext] Resolved role: ${resolvedRole}`);
            setRole(resolvedRole as UserRole);

            if (resolvedRole === 'collector') {
                collector = await withTimeout(
                    AuthService.resolveCollectorId(sessionUser.id),
                    COLLECTOR_RESOLUTION_TIMEOUT_MS,
                    `${source} collector resolution`
                );
                if (roleRequestId !== roleResolutionRequestIdRef.current) return;
                console.log(`[AuthContext] Collector ID resolved: ${collector}`);
                setCollectorId(collector);
            } else {
                setCollectorId(null);
            }
        })()
            .catch((roleError) => {
                if (roleRequestId !== roleResolutionRequestIdRef.current) return;
                console.error('[AuthContext] Role/Collector ID fetch error:', roleError);
                setRole(null);
                setCollectorId(null);
            })
            .finally(() => {
                if (roleRequestId === roleResolutionRequestIdRef.current) {
                    setRoleResolved(true);
                }
                if (roleResolutionPromiseRef.current === settlePromise) {
                    roleResolutionPromiseRef.current = null;
                    roleResolutionUserIdRef.current = null;
                }
            });

        roleResolutionPromiseRef.current = settlePromise;
        return settlePromise;
    };

    useEffect(() => {
        const loadSunlightMode = async () => {
            try {
                const savedMode = await AsyncStorage.getItem('sunlight_mode');
                if (savedMode !== null) {
                    setSunlightMode(savedMode === 'true');
                }
            } catch (e) {
                console.error('[AuthContext] Error loading sunlight mode:', e);
            }
        };
        loadSunlightMode();

        const consumeSkipNextAutoSync = async () => {
            try {
                const shouldSkip = await AsyncStorage.getItem(SKIP_NEXT_AUTO_SYNC_KEY);
                if (shouldSkip === 'true') {
                    await AsyncStorage.removeItem(SKIP_NEXT_AUTO_SYNC_KEY);
                    suppressNextAutoSyncRef.current = true;
                    return true;
                }
            } catch (e) {
                console.warn('[AuthContext] Failed to read one-shot auto-sync suppression flag:', e);
            }
            suppressNextAutoSyncRef.current = false;
            return false;
        };

        const checkSession = async () => {
            try {
                setInitializationError(null);
                const bootstrapRequestId = roleResolutionRequestIdRef.current;
                const { data: { session }, error } = await withTimeout(
                    supabase.auth.getSession(),
                    SESSION_RESTORE_TIMEOUT_MS,
                    'Session restore'
                );
                if (error) throw error;
                if (bootstrapRequestId !== roleResolutionRequestIdRef.current) return;

                console.log('[AuthContext] Session fetched:', session?.user?.id);
                setSession(session);
                if (session?.user) {
                    console.log(`[AuthContext] Session changed: ${session.user.id} (${session.user.email})`);
                    setUser(session.user); // Set user first
                    const skipInitialSync = await consumeSkipNextAutoSync();
                    if (skipInitialSync) {
                        console.log('[AuthContext] Skipping one auto-sync after local database reset');
                    }
                    void resolveRoleForSession(session.user, 'Initial', skipInitialSync);
                } else {
                    console.log('[AuthContext] Session cleared');
                    roleResolutionRequestIdRef.current++;
                    roleResolutionPromiseRef.current = null;
                    roleResolutionUserIdRef.current = null;
                    setUser(null);
                    setRole(null);
                    setRoleResolved(true);
                    setCollectorId(null);
                }
            } catch (err: any) {
                console.error('[AuthContext] Session initialization error:', err);
                setInitializationError(err instanceof Error ? err : new Error(String(err?.message ?? err)));

                // If it's a refresh token error or invalid session, clear everything to allow a clean login
                // We check for various formats of the "Invalid Refresh Token" error returned by Supabase
                const errorMessage = (err?.message || '').toLowerCase();
                const errorCode = (err?.code || '').toLowerCase();
                const errorStatus = err?.status || (err?.originalError?.status);

                const isRefreshTokenError = 
                    errorMessage.includes('refresh token') || 
                    errorMessage.includes('invalid_grant') ||
                    errorCode.includes('refresh_token_not_found') ||
                    errorCode.includes('invalid_grant') ||
                    errorStatus === 400;

                const isAuthApiError = err?.name === 'AuthApiError' || err?.__isAuthError;

                if (isRefreshTokenError || isAuthApiError) {
                    console.log('[AuthContext] Stale/Invalid session detected (400/AuthApiError), clearing storage...');
                    try {
                        await clearPersistedAuthSession();
                    } catch (clearErr) {
                        console.warn('[AuthContext] Failed to clear persisted auth session during recovery', clearErr);
                    }
                    setSession(null);
                    setUser(null);
                    setRole(null);
                    setRoleResolved(true);
                    setCollectorId(null);
                } else {
                    ErrorService.handleError(err, 'AuthContext.getSession', ErrorType.AUTH);
                }
            } finally {
                isBootstrappingRef.current = false;
                setInitialized(true);
            }
        };

        checkSession();

        const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, session) => {
                if (!session?.user) {
                    roleResolutionRequestIdRef.current++;
                    setSession(null);
                    setUser(null);
                    setRole(null);
                    setRoleResolved(true);
                    setCollectorId(null);
                    return;
                }

                setSession(session);
                setUser(session.user);

                if (isBootstrappingRef.current && event === 'INITIAL_SESSION') {
                    console.log('[AuthContext] Deferring initial-session role resolution during bootstrap');
                    return;
                }

                const shouldSkipAutoSync = isBootstrappingRef.current || suppressNextAutoSyncRef.current;
                const shouldPreserveResolvedState =
                    currentUserIdRef.current === session.user.id &&
                    currentRoleResolvedRef.current;

                if (suppressNextAutoSyncRef.current) {
                    console.log('[AuthContext] Consumed one-shot auto-sync suppression after reset');
                    suppressNextAutoSyncRef.current = false;
                }

                if (shouldSkipAutoSync && isBootstrappingRef.current) {
                    console.log('[AuthContext] Skipping auth-state sync during initial bootstrap');
                    void consumeSkipNextAutoSync();
                }

                void resolveRoleForSession(session.user, 'Auth-state', shouldSkipAutoSync, shouldPreserveResolvedState);
            }
        );

        return () => {
            roleResolutionRequestIdRef.current++;
            subscription.unsubscribe();
        };
    }, []);

    // Role-based redirect and RBAC guard
    useEffect(() => {
        if (!initialized) return;

        const firstSegment = segments[0];
        const inAuthGroup = firstSegment === '(auth)';
        const isLoginRoute = firstSegment === 'login';
        const isRegisterRoute = firstSegment === 'register';
        const inLoading = firstSegment === 'loading';

        // 1. If not logged in and not on an auth/loading page, redirect to login
        if (!user && !inAuthGroup && !isLoginRoute && !isRegisterRoute && !inLoading) {
            console.log('[AuthContext] Guest detected on protected route, redirecting to login');
            router.replace('/login');
            return;
        }

        if (user && roleResolved && !role && !isLoginRoute && !isRegisterRoute && !inLoading) {
            console.warn('[AuthContext] Authenticated user has no resolved role, redirecting to login');
            router.replace('/login');
            return;
        }

        // 2. If logged in and on an auth/login page, redirect to loading to perform initial sync
        if (user && roleResolved && role && (inAuthGroup || isLoginRoute || !segments.length)) {
            console.log('[AuthContext] Authenticated user on auth page, redirecting to loading for sync');
            router.replace('/loading');
            return;
        }

        // 3. RBAC Guard: If logged in but in the wrong route group, redirect to role home
        if (user && roleResolved && role && firstSegment && firstSegment.startsWith('(')) {
            const groupRoleMap: Record<string, string[]> = {
                '(admin)': ['admin', 'main_office'],
                '(collector)': ['collector'],
                '(borrower)': ['borrower'],
                '(loan-encoder)': ['loan_encoder'],
                '(payment-encoder)': ['payment_encoder', 'collector'],
                '(expenses-encoder)': ['expenses_encoder'],
            };

            const allowedRoles = groupRoleMap[firstSegment];
            if (allowedRoles && !allowedRoles.includes(role) && role !== 'admin' && role !== 'main_office') {
                console.warn(`[AuthContext] RBAC Violation: Use with role "${role}" attempted to access group "${firstSegment}". Redirecting...`);
                const homeRoute = ROLE_HOME_ROUTES[role as UserRole] ?? '/login';
                router.replace(homeRoute as any);
            }
        }
    }, [user, role, roleResolved, initialized, segments]);

    const signOut = async () => {
        console.log('[AuthContext] Signing out...');
        await AuthService.signOut();
        // Clear local state immediately to trigger redirect
        setUser(null);
        setSession(null);
        setRole(null);
        setRoleResolved(true);
        setCollectorId(null);
        // Use replace to clear current screen from memory
        router.replace('/login');
    };

    const toggleSunlightMode = async () => {
        try {
            const newMode = !sunlightMode;
            setSunlightMode(newMode);
            await AsyncStorage.setItem('sunlight_mode', String(newMode));
        } catch (e) {
            console.error('[AuthContext] Error saving sunlight mode:', e);
        }
    };

    const value = useMemo(() => ({
        user,
        session,
        role,
        roleResolved,
        collectorId,
        sunlightMode,
        toggleSunlightMode,
        initialized,
        initializationError,
        signOut,
    }), [user, session, role, roleResolved, collectorId, sunlightMode, initialized, initializationError]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

