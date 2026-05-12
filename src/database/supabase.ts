/**
 * SUPABASE CONFIGURATION (ENHANCED FOR WEB & MOBILE)
 * 
 * Key features:
 * 1. URL/URLSearchParams polyfill for web/native compatibility
 * 2. Project-aware storage key generation to prevent cross-project conflicts
 */

// Only apply URL polyfill if native URL is not available (Expo SDK 55+ has it built-in)
try {
    if (typeof globalThis.URL !== 'function' || typeof globalThis.URLSearchParams !== 'function') {
        const { URL: PolyfilledURL, URLSearchParams: PolyfilledURLSearchParams } = require('react-native-url-polyfill');
        if (typeof globalThis.URL !== 'function') {
            (globalThis as any).URL = PolyfilledURL;
        }
        if (typeof globalThis.URLSearchParams !== 'function') {
            (globalThis as any).URLSearchParams = PolyfilledURLSearchParams;
        }
    }
} catch (e) {
    // Polyfill not available or not needed — safe to continue
}

import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getRuntimeSupabaseUrl } from './supabaseUrl';

// Read from environment variables
const configuredSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseUrl = getRuntimeSupabaseUrl(configuredSupabaseUrl);
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[Supabase] Missing credentials in environment variables');
}

/**
 * Get the unique storage key for this specific Supabase project
 */
export const getSupabaseAuthStorageKey = (url = supabaseUrl) => {
    const projectRef = url
        .replace(/^https?:\/\//, '')
        .split('.')[0]
        .split(':')[0];

    return `sb-${projectRef}-auth-token`;
};

/**
 * Clear all Supabase-related storage for the current project
 */
const clearSupabaseAuthStorage = async () => {
    const storageKey = getSupabaseAuthStorageKey();
    console.log('[Supabase] Purging auth storage:', storageKey);

    try {
        await AsyncStorage.removeItem(storageKey);
    } catch (e) {
        console.warn('[Supabase] AsyncStorage purge failed:', e);
    }

    if (typeof localStorage !== 'undefined') {
        try {
            localStorage.removeItem(storageKey);
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));
        } catch (error) {
            console.warn('[Supabase] LocalStorage purge failed:', error);
        }
    }
};

/**
 * Cleanup stale tokens from other projects in localStorage (Web only)
 */
if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
        const storageKey = getSupabaseAuthStorageKey();
        const keysToDelete: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('sb-') && key.endsWith('-auth-token') && key !== storageKey) {
                keysToDelete.push(key);
            }
        }
        if (keysToDelete.length > 0) {
            keysToDelete.forEach(k => localStorage.removeItem(k));
            console.log('[Supabase] Cleared stale auth tokens for old projects:', keysToDelete);
        }
    } catch (e) {
        console.warn('[Supabase] Could not clean up stale session tokens:', e);
    }
}

/**
 * Full session purge utility
 */
export const clearPersistedAuthSession = async () => {
    console.log('[Supabase] Full session purge initiated');
    try {
        await supabase.auth.signOut({ scope: 'local' });
    } catch (error) {
        console.warn('[Supabase] Local signOut failed during session purge:', error);
    } finally {
        await clearSupabaseAuthStorage();
        await new Promise(resolve => setTimeout(resolve, 100));
    }
};

console.log('[Supabase] Initializing client on platform:', Platform.OS);
if (configuredSupabaseUrl && configuredSupabaseUrl !== supabaseUrl) {
    console.log('[Supabase] Rewrote local Supabase URL for runtime:', supabaseUrl);
}

/**
 * Supabase client configuration
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        // Disable Web Locks API in favor of simple in-memory queue
        lock: (() => {
            let currentLock: Promise<any> = Promise.resolve();
            return async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => {
                const acquired = currentLock.then(() => fn(), () => fn());
                currentLock = acquired.catch(() => {});
                return await acquired;
            };
        })(),
    },
});

console.log('[Supabase] Client created successfully');

/**
 * Custom fetch wrapper to add timeout protection
 */
export const withTimeout = async <T,>(
    promise: Promise<T>,
    timeoutMs: number = 10000,
    operationName: string = 'Operation'
): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutId = setTimeout(
            () => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)),
            timeoutMs
        );
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
};
