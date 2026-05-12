import React from 'react';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '../../src/store/AuthContext';
import { AuthGateLoading } from '../../src/components/AuthGateLoading';
import { ROLE_HOME_ROUTES, UserRole } from '../../src/constants/roles';

export default function LoanEncoderLayout() {
    const { user, role, roleResolved, initialized } = useAuth();
    const router = useRouter();

    React.useEffect(() => {
        if (!initialized || !roleResolved) return;

        if (!user || role === null) {
            console.warn('[LoanEncoderLayout] Missing authorized user role. Redirecting to login...');
            router.replace('/login');
            return;
        }

        if (role !== 'loan_encoder') {
            console.warn(`[LoanEncoderLayout] Access denied for role: ${role}. Redirecting...`);
            router.replace((ROLE_HOME_ROUTES[role as UserRole] ?? '/login') as any);
        }
    }, [initialized, user, role, roleResolved, router]);

    // Route guard for Loan Encoder
    if (initialized && user && !roleResolved) {
        return <AuthGateLoading message="Restoring your access..." />;
    }

    if (initialized && (!user || role !== 'loan_encoder')) {
        console.warn(`[LoanEncoderLayout] Access denied for role: ${role}. Redirecting...`);
        return <AuthGateLoading message="Redirecting..." />;
    }

    return (
        <Stack
            screenOptions={{
                headerStyle: {
                    backgroundColor: '#1565C0', // Blue for Loan Encoder
                },
                headerTintColor: '#fff',
                headerTitleStyle: {
                    fontWeight: 'bold',
                },
            }}
        >
            <Stack.Screen name="index" options={{ title: 'Loan Encoder' }} />
        </Stack>
    );
}
