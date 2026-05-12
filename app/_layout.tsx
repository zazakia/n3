import { Stack } from 'expo-router';
import { AuthProvider } from '../src/store/AuthContext';
import { GlobalErrorBoundary } from '../src/components/ErrorBoundary';
import Toast from '../src/components/AppToast';
import { OfflineBanner } from '../src/components/OfflineBanner';
import { GlobalSyncButton } from '../src/components/GlobalSyncButton';
import { useNetworkStatus } from '../src/hooks/useNetworkStatus';
import { MaterialIcons } from '@expo/vector-icons';
import { cssInterop } from 'nativewind';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import '../global.css';

cssInterop(MaterialIcons, {
    className: 'style',
});

function AppShell({ children }: { children: React.ReactNode }) {
    // Bootstrap network monitoring at the root level
    useNetworkStatus();
    return (
        <>
            {children}
            <GlobalSyncButton />
            <OfflineBanner />
            <Toast />
        </>
    );
}

export default function RootLayout() {
    console.log('[RootLayout] Rendering RootLayout');
    return (
        <GlobalErrorBoundary>
            <GestureHandlerRootView style={{ flex: 1 }}>
                <AuthProvider>
                    <AppShell>
                        <Stack screenOptions={{ headerShown: false }}>
                            <Stack.Screen name="loading" />
                            <Stack.Screen name="login" />
                            <Stack.Screen name="sync-center" options={{ presentation: 'modal' }} />
                            <Stack.Screen name="(admin)" />
                            <Stack.Screen name="(collector)" />
                            <Stack.Screen name="(loan-encoder)" />
                            <Stack.Screen name="(payment-encoder)" />
                            <Stack.Screen name="(expenses-encoder)" />
                            <Stack.Screen name="(borrower)" />
                        </Stack>
                    </AppShell>
                </AuthProvider>
            </GestureHandlerRootView>
        </GlobalErrorBoundary>
    );
}
