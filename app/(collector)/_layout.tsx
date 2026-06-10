import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '../../src/store/AuthContext';
import { SyncStatusBadge } from '../../src/components/SyncStatusBadge';
import { AuthGateLoading } from '../../src/components/AuthGateLoading';
import { CollectorTabBar } from '../../src/components/collector/CollectorTabBar';
import { ROLE_HOME_ROUTES, UserRole } from '../../src/constants/roles';
import { database } from '../../src/database';
import PaymentSchedule from '../../src/database/models/PaymentSchedule';
import Loan from '../../src/database/models/Loan';
import Borrower from '../../src/database/models/Borrower';
import { Q } from '@nozbe/watermelondb';
import { startOfDay, endOfDay } from 'date-fns';

export default function CollectorLayout() {
    const { user, role, roleResolved, initialized, collectorId } = useAuth();
    const router = useRouter();
    const [pendingCount, setPendingCount] = useState(0);

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

    // Fetch pending collection count for the tab badge
    useEffect(() => {
        if (!collectorId) return;

        const fetchPending = async () => {
            try {
                const assignedBorrowers = await database.collections.get<Borrower>('borrowers')
                    .query(Q.where('collector_id', collectorId))
                    .fetch();

                const borrowerIds = assignedBorrowers.map(b => b.id);
                if (borrowerIds.length === 0) { setPendingCount(0); return; }

                const activeLoans = await database.collections.get<Loan>('loans')
                    .query(Q.where('borrower_id', Q.oneOf(borrowerIds)), Q.where('status', 'active'))
                    .fetch();

                const activeLoanIds = activeLoans.map(l => l.id);
                if (activeLoanIds.length === 0) { setPendingCount(0); return; }

                const endOfToday = endOfDay(new Date()).getTime();
                const dueSchedules = await database.collections.get<PaymentSchedule>('payment_schedules')
                    .query(
                        Q.where('loan_id', Q.oneOf(activeLoanIds)),
                        Q.where('due_date', Q.lte(endOfToday)),
                        Q.where('status', Q.notEq('paid'))
                    )
                    .fetch();

                setPendingCount(dueSchedules.length);
            } catch (err) {
                console.warn('[CollectorLayout] Failed to fetch pending count', err);
            }
        };

        fetchPending();
        // Refresh every 30 seconds while the layout is mounted
        const interval = setInterval(fetchPending, 30_000);
        return () => clearInterval(interval);
    }, [collectorId]);

    // Route guard for Collector dashboard
    if (initialized && user && !roleResolved) {
        return <AuthGateLoading message="Restoring your access..." />;
    }

    if (initialized && (!user || role !== 'collector')) {
        console.warn(`[CollectorLayout] Access denied for role: ${role}. Redirecting...`);
        return <AuthGateLoading message="Redirecting..." />;
    }

    return (
        <View className="flex-1">
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
                <Stack.Screen name="reports" options={{ headerShown: false }} />
            </Stack>

            {/* Persistent bottom tab bar */}
            <CollectorTabBar pendingCount={pendingCount} />
        </View>
    );
}
