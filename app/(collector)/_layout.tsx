import React from 'react';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '../../src/store/AuthContext';
import { SyncStatusBadge } from '../../src/components/SyncStatusBadge';
import { AuthGateLoading } from '../../src/components/AuthGateLoading';
import { ROLE_HOME_ROUTES, UserRole } from '../../src/constants/roles';

export default function CollectorLayout() {
    const { user, role, roleResolved, initialized } = useAuth();
    const router = useRouter();

    React.useEffect(() => {
        if (!initialized || !roleResolved) return;

        if (!user || role === null) {
            console.warn('[CollectorLayout] Missing authorized user role. Redirecting to login...');
            router.replace('/login');
            return;
        }

        if (role !== 'collector') {
            console.warn(`[CollectorLayout] Access denied for role: ${role}. Redirecting...`);
            router.replace((ROLE_HOME_ROUTES[role as UserRole] ?? '/login') as any);
        }
    }, [initialized, user, role, roleResolved, router]);

    // Route guard for Collector dashboard
    if (initialized && user && !roleResolved) {
        return <AuthGateLoading message="Restoring your access..." />;
    }

    if (initialized && (!user || role !== 'collector')) {
        console.warn(`[CollectorLayout] Access denied for role: ${role}. Redirecting...`);
        return <AuthGateLoading message="Redirecting..." />;
    }

    return (
        <Stack
            screenOptions={{
                headerStyle: {
                    backgroundColor: '#00897B', // Teal for Collector
                },
                headerTintColor: '#fff',
                headerTitleStyle: {
                    fontWeight: 'bold',
                },
                headerRight: () => (
                    <View style={{ marginRight: 15 }}>
                        <SyncStatusBadge />
                    </View>
                ),
            }}
        >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="borrowers/[id]" options={{ headerShown: false }} />
            <Stack.Screen name="collection-sheet-daily" options={{ headerShown: false }} />
            <Stack.Screen name="collection-sheet-weekly" options={{ headerShown: false }} />
            <Stack.Screen name="remittances" options={{ headerShown: false }} />
            <Stack.Screen name="help" options={{ headerShown: false }} />
            <Stack.Screen name="collection-sheet" options={{ headerShown: false }} />
        </Stack>
    );
}
