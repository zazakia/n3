import { useEffect, useState } from 'react';
import { View } from 'react-native';
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
import { areRequiredIconFontsLoaded, loadRequiredIconFonts } from '../src/utils/iconFonts';
import { LogBox } from 'react-native';
import '../global.css';

LogBox.ignoreLogs([
    'AuthApiError: Invalid Refresh Token: Refresh Token Not Found',
    'Unknown event handler property `onStartShouldSetResponder`',
    'Unknown event handler property `onResponderTerminationRequest`'
]);

// Suppress specific React DOM and Supabase errors in the console
const originalConsoleError = console.error;
console.error = (...args) => {
    if (typeof args[0] === 'string') {
        if (
            args[0].includes('Unknown event handler property') ||
            args[0].includes('AuthApiError: Invalid Refresh Token') ||
            args[0].includes('Failed to load resource: the server responded with a status of 400')
        ) {
            return;
        }
    }
    originalConsoleError(...args);
};

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
    const [fontsReady, setFontsReady] = useState(() => areRequiredIconFontsLoaded());
    const { colors, isDarkMode } = require('../src/store/useThemeStore').useThemeStore();
    const palette = isDarkMode
        ? require('../src/constants/colors').DarkColors
        : require('../src/constants/colors').Colors;

    useEffect(() => {
        let isMounted = true;

        // Gate the first render on the actual icon font load promise. Rendering
        // the app before these web fonts are installed is what produces square
        // placeholder boxes on Cloudflare Pages while @expo/vector-icons catches up.
        loadRequiredIconFonts()
            .then(() => {
                if (isMounted) {
                    setFontsReady(true);
                }
            })
            .catch((error) => {
                console.error('[RootLayout] Failed to load icon fonts', error);
                if (isMounted) {
                    // Do not leave users on a permanent blank screen; the build
                    // and deployment guards fail when the font assets are missing.
                    setFontsReady(true);
                }
            });

        return () => {
            isMounted = false;
        };
    }, []);

    if (!fontsReady) {
        return <View style={{ flex: 1, backgroundColor: '#f3f4f6' }} />;
    }

    console.log('[RootLayout] Rendering RootLayout');
    return (
        <View style={{ flex: 1, '--color-primary': colors.primary || palette.primary, '--color-secondary': colors.secondary || palette.secondary, backgroundColor: palette.background } as any}>
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
        </View>
    );
}
