import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, useWindowDimensions, Modal, SafeAreaView, ScrollView } from 'react-native';
import { Slot, usePathname, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../src/store/AuthContext';
import { InfinityLogo } from '../../src/components/InfinityLogo';
import { SidebarContent, MAIN_MENU, ADMIN_MENU, DAILY_REPORTS, WEEKLY_REPORTS, MONTHLY_REPORTS, FINANCIALS_MENU, SUPPORT_MENU } from '../../src/components/SidebarContent';
import { SyncStatusBadge } from '../../src/components/SyncStatusBadge';
import { AuthGateLoading } from '../../src/components/AuthGateLoading';
import { ROLE_HOME_ROUTES, UserRole } from '../../src/constants/roles';

export default function AdminShellLayout() {
    const { width } = useWindowDimensions();
    const isDesktop = width >= 720;
    const [drawerOpen, setDrawerOpen] = useState(false);
    const pathname = usePathname();
    const { user, role, roleResolved, initialized } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!initialized || !roleResolved) return;

        if (!user || role === null) {
            console.warn('[AdminLayout] Missing authorized user role. Redirecting to login...');
            router.replace('/login');
            return;
        }

        if (role !== 'admin' && role !== 'main_office') {
            console.warn(`[AdminLayout] Access denied for role: ${role}. Redirecting...`);
            router.replace((ROLE_HOME_ROUTES[role as UserRole] ?? '/login') as any);
        }
    }, [initialized, user, role, roleResolved, router]);

    // Route guard for Admin dashboard
    const isReady = initialized && (!user || roleResolved);

    if (initialized && user && !roleResolved) {
        return <AuthGateLoading message="Restoring your access..." />;
    }

    if (isReady && (!user || (role !== 'admin' && role !== 'main_office'))) {
        console.warn(`[AdminLayout] Access denied for role: ${role}. Redirecting...`);
        return <AuthGateLoading message="Redirecting..." />;
    }

    const currentTitle = [...MAIN_MENU, ...ADMIN_MENU, ...DAILY_REPORTS, ...WEEKLY_REPORTS, ...MONTHLY_REPORTS, ...FINANCIALS_MENU, ...SUPPORT_MENU]
        .find(item => pathname.replace('/(admin)', '').startsWith(item.route.replace('/(admin)', '')))?.label ?? 'Infinity Finance';

    // Desktop Layout
    if (isDesktop) {
        return (
            <View className="flex-1 flex-row bg-gray-50">
                <View className="w-64 border-r border-gray-200 shadow-sm z-10">
                    <SidebarContent />
                </View>
                <View className="flex-1 bg-gray-50">
                    <Slot />
                </View>
            </View>
        );
    }

    // Mobile Layout
    return (
        <View className="flex-1 bg-gray-50">
            {/* Header - Hidden on dashboard index because it has its own header */}
            {!pathname.endsWith('/(admin)') && !pathname.endsWith('/(admin)/') && (
                <SafeAreaView className="bg-primary shadow-sm z-10">
                    <View className="flex-row items-center justify-between p-4">
                        <View className="flex-row items-center">
                            <Pressable onPress={() => setDrawerOpen(true)} className="mr-4 p-1 active:bg-white/10 rounded-full">
                                <MaterialIcons name="menu" size={28} color="#FFFFFF" />
                            </Pressable>
                            <Text className="text-white text-lg font-bold tracking-wide">{currentTitle}</Text>
                        </View>
                        <View className="flex-row items-center">
                            <SyncStatusBadge />
                            <Pressable className="bg-white/10 p-2 rounded-full active:bg-white/20 ml-2">
                                <MaterialIcons name="notifications-none" size={24} color="#FFFFFF" />
                            </Pressable>
                        </View>
                    </View>
                </SafeAreaView>
            )}

            {/* Main Content */}
            <View className="flex-1">
                <Slot />
            </View>

            {/* Bottom Navigation (First 4 items) */}
            <SafeAreaView className="bg-white border-t border-gray-200">
                <View className="flex-row justify-around py-2">
                    {MAIN_MENU.slice(0, 4).map(item => {
                        const isActive = pathname.replace('/(admin)', '').startsWith(item.route.replace('/(admin)', ''));
                        return (
                            <Pressable
                                key={item.route}
                                onPress={() => router.push(item.route as any)}
                                className="items-center justify-center p-2 flex-1"
                            >
                                <MaterialIcons
                                    name={item.icon}
                                    size={24}
                                    color={isActive ? '#1A237E' : '#9CA3AF'}
                                    className="mb-1"
                                />
                                <Text className={`text-[10px] font-medium ${isActive ? 'text-primary' : 'text-gray-700'}`}>
                                    {item.label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>
            </SafeAreaView>

            {/* Mobile Drawer Overflow Modal */}
            <Modal
                visible={drawerOpen}
                animationType="fade"
                transparent={true}
                onRequestClose={() => setDrawerOpen(false)}
            >
                <View className="flex-1 flex-row">
                    {/* Dark overlay backdrop */}
                    <Pressable
                        className="absolute inset-0 bg-black/50"
                        onPress={() => setDrawerOpen(false)}
                    />

                    {/* Drawer Content */}
                    <View className="w-72 bg-primary h-full shadow-2xl">
                        <SidebarContent onClose={() => setDrawerOpen(false)} />
                    </View>
                </View>
            </Modal>
        </View>
    );
}
