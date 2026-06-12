import React, { useEffect, useRef, useState } from 'react';
import {
    View, Text, StyleSheet, Animated, Dimensions, Easing, Platform
} from 'react-native';
import { router } from 'expo-router';
import { useSyncStore } from '../src/stores/syncStore';
import { useAuth } from '../src/store/AuthContext';
import { ROLE_HOME_ROUTES, UserRole } from '../src/constants/roles';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isRouteAllowedForRole, LAST_AUTHORIZED_ROUTE_KEY } from '../src/utils/authNavigation';

const { width } = Dimensions.get('window');

const AUTO_REDIRECT_DELAY_MS = 1000; // Delay before redirecting to allow UI to settle
const NO_SESSION_GRACE_MS = 3000; // Allow auth event/session storage to settle after login handoff

export default function LoadingScreen() {
    const rotation = useRef(new Animated.Value(0)).current;
    const glow = useRef(new Animated.Value(0.3)).current;
    const { status, currentModel, progress } = useSyncStore();
    const { user, role, roleResolved, initialized, initializationError } = useAuth();
    const [noSessionGraceElapsed, setNoSessionGraceElapsed] = useState(false);

    useEffect(() => {
        Animated.loop(
            Animated.timing(rotation, {
                toValue: 1,
                duration: 1500,
                easing: Easing.linear,
                useNativeDriver: Platform.OS !== 'web',
            })
        ).start();

        Animated.loop(
            Animated.sequence([
                Animated.timing(glow, { toValue: 1, duration: 1000, useNativeDriver: Platform.OS !== 'web' }),
                Animated.timing(glow, { toValue: 0.3, duration: 1000, useNativeDriver: Platform.OS !== 'web' }),
            ])
        ).start();
    }, []);

    useEffect(() => {
        if (!initialized || user) {
            setNoSessionGraceElapsed(false);
            return;
        }

        const timeout = setTimeout(() => {
            setNoSessionGraceElapsed(true);
        }, NO_SESSION_GRACE_MS);

        return () => clearTimeout(timeout);
    }, [initialized, user]);

    useEffect(() => {
        if (!initialized) return;

        if (!user && !noSessionGraceElapsed) {
            return;
        }

        if (!user) {
            const timeout = setTimeout(() => {
                router.replace('/login');
            }, AUTO_REDIRECT_DELAY_MS);
            return () => clearTimeout(timeout);
        }

        // Wait until role resolution settles before deciding where to go.
        if (user && !roleResolved) {
            return;
        }

        const shouldRedirect = !!initializationError || !user || roleResolved;

        if (!shouldRedirect) return;

        const timeout = setTimeout(() => {
            if (role) {
                AsyncStorage.getItem(LAST_AUTHORIZED_ROUTE_KEY)
                    .then((lastRoute) => {
                        const fallbackRoute = ROLE_HOME_ROUTES[role as UserRole];
                        const nextRoute = isRouteAllowedForRole(lastRoute, role) ? lastRoute : fallbackRoute;
                        router.replace(nextRoute as any);
                    })
                    .catch((error) => {
                        console.warn('[LoadingScreen] Failed to restore last authorized route:', error);
                        router.replace(ROLE_HOME_ROUTES[role as UserRole] as any);
                    });
            } else {
                router.replace('/login');
            }
        }, AUTO_REDIRECT_DELAY_MS);

        return () => clearTimeout(timeout);
    }, [initialized, user, role, roleResolved, initializationError, noSessionGraceElapsed]);

    const getStatusMessage = () => {
        if (!initialized) return 'Initializing...';
        if (!user && !noSessionGraceElapsed) return 'Checking session...';
        if (!user) return 'No session found';
        if (user && !roleResolved) return 'Resolving access...';
        if (initializationError) return 'Auth setup incomplete';
        if (status === 'error') return 'Sync Error. Retrying...';
        if (status === 'completed') return 'Ready';
        if (status === 'syncing') return `Syncing ${currentModel}...`;
        return 'Initializing...';
    };

    const spin = rotation.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });
    return (
        <View style={styles.container}>
            <Animated.View style={[styles.glow, { opacity: glow }]} />

            <Animated.View style={[styles.ringContainer, { transform: [{ rotate: spin }] }]}>
                <View style={styles.ringOuter}>
                    <View style={styles.ringInner}>
                        <Text style={styles.logoIcon}>♾</Text>
                    </View>
                </View>
            </Animated.View>

            <Text style={styles.statusText}>{getStatusMessage()}</Text>

            <View style={styles.progressTrack}>
                <Animated.View
                    style={[
                        styles.progressBar,
                        { width: `${Math.round(progress * 100)}%` }
                    ]}
                />
            </View>
            <Text style={styles.progressLabel}>{Math.round(progress * 100)}%</Text>

            <Text style={styles.footer}>INFINITY FINANCE</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0D1117',
        alignItems: 'center',
        justifyContent: 'center',
    },
    glow: {
        position: 'absolute',
        width: 300,
        height: 300,
        borderRadius: 150,
        backgroundColor: '#D32F2F',
        ...Platform.select({
            web: {
                boxShadow: '0 0 80px 0 rgba(211,47,47,1)'
            } as any,
            default: {
                shadowColor: '#D32F2F',
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 1,
                shadowRadius: 80,
                elevation: 20,
            }
        })
    },
    ringContainer: {
        marginBottom: 32,
    },
    ringOuter: {
        width: 120,
        height: 120,
        borderRadius: 60,
        borderWidth: 4,
        borderColor: '#D32F2F',
        borderTopColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
    },
    ringInner: {
        width: 90,
        height: 90,
        borderRadius: 45,
        borderWidth: 2,
        borderColor: '#EF5350',
        borderBottomColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
    },
    logoIcon: {
        fontSize: 32,
        color: '#FFC107',
    },
    statusText: {
        color: '#FFFFFF',
        fontSize: 14,
        marginBottom: 16,
        letterSpacing: 0.5,
    },
    progressTrack: {
        width: 200,
        height: 4,
        backgroundColor: '#1F2937',
        borderRadius: 2,
        overflow: 'hidden',
        marginBottom: 4,
    },
    progressBar: {
        height: '100%',
        backgroundColor: '#D32F2F',
        borderRadius: 2,
    },
    progressLabel: {
        color: '#555',
        fontSize: 11,
        marginBottom: 48,
    },
    footer: {
        position: 'absolute',
        bottom: 40,
        color: 'rgba(255,255,255,0.2)',
        fontSize: 11,
        letterSpacing: 6,
        fontWeight: '600',
    },
});
