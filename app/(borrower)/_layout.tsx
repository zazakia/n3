import React from 'react';
import { View, Text, Pressable, useWindowDimensions, Modal, SafeAreaView, ScrollView } from 'react-native';
import { Slot, usePathname, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../../src/store/AuthContext';
import { AuthGateLoading } from '../../src/components/AuthGateLoading';
import { ROLE_HOME_ROUTES, UserRole } from '../../src/constants/roles';

type MenuItem = {
    icon: keyof typeof MaterialIcons.glyphMap;
    label: string;
    route: string;
};

const BORROWER_MENU: MenuItem[] = [
    { icon: 'dashboard', label: 'Dashboard', route: '/(borrower)' },
    { icon: 'receipt-long', label: 'My Loans', route: '/(borrower)/loans' },
    { icon: 'history', label: 'Payments', route: '/(borrower)/transactions' },
    { icon: 'person', label: 'Profile', route: '/(borrower)/profile' },
];

export default function BorrowerLayout() {
    const { width } = useWindowDimensions();
    const isDesktop = width >= 720;
    const [drawerOpen, setDrawerOpen] = React.useState(false);
    const pathname = usePathname();
    const router = useRouter();
    const { signOut, user, role, roleResolved, initialized } = useAuth();

    React.useEffect(() => {
        if (!initialized || !roleResolved) return;

        if (!user || role === null) {
            console.warn('[BorrowerLayout] Missing authorized user role. Redirecting to login...');
            router.replace('/login');
            return;
        }

        if (role !== 'borrower') {
            console.warn(`[BorrowerLayout] Access denied for role: ${role}. Redirecting...`);
            router.replace((ROLE_HOME_ROUTES[role as UserRole] ?? '/login') as any);
        }
    }, [initialized, user, role, roleResolved, router]);

    // Route guard for Borrower portal
    if (initialized && user && !roleResolved) {
        return <AuthGateLoading message="Restoring your access..." />;
    }

    if (initialized && (!user || role !== 'borrower')) {
        console.warn(`[BorrowerLayout] Access denied for role: ${role}. Redirecting...`);
        return <AuthGateLoading message="Redirecting..." />;
    }

    const currentTitle = BORROWER_MENU.find(item => 
        pathname === item.route || pathname.startsWith(item.route + '/')
    )?.label ?? 'Borrower Portal';

    const renderSidebar = () => (
        <View className="flex-1 bg-[#1A237E]">
            <SafeAreaView className="flex-1">
                <View className="p-6 items-center flex-row border-b border-white/10 mb-4 h-24">
                    <View className="bg-red-500/20 p-2 rounded-lg mr-3">
                        <MaterialIcons name="all-inclusive" size={24} color="#FFC107" />
                    </View>
                    <View>
                        <Text className="text-white font-extrabold text-lg tracking-tighter">INFINITY</Text>
                        <Text className="text-white/70 text-[10px] font-bold tracking-widest mt-0.5 uppercase">Borrower Portal</Text>
                    </View>
                </View>

                <ScrollView className="flex-1 px-2">
                    {BORROWER_MENU.map(item => {
                        const isActive = pathname === item.route || pathname.startsWith(item.route + '/');
                        return (
                            <Pressable
                                key={item.route}
                                onPress={() => {
                                    router.push(item.route as any);
                                    setDrawerOpen(false);
                                }}
                                className={`flex-row items-center p-4 rounded-xl mb-1 ${isActive ? 'bg-white/10' : 'active:bg-white/5'}`}
                            >
                                <MaterialIcons 
                                    name={item.icon} 
                                    size={22} 
                                    color={isActive ? '#FFFFFF' : 'rgba(255,255,255,0.6)'} 
                                    className="mr-3"
                                />
                                <Text className={`text-sm tracking-wide ${isActive ? 'text-white font-bold' : 'text-white/90 font-medium'}`}>
                                    {item.label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </ScrollView>

                <View className="p-4 border-t border-white/10">
                    <Pressable
                        onPress={signOut}
                        className="flex-row items-center p-4 rounded-xl bg-red-500/10 active:bg-red-500/20"
                    >
                        <MaterialIcons name="logout" size={20} color="#EF5350" className="mr-3" />
                        <Text className="text-[#EF5350] font-bold text-sm">Sign Out</Text>
                    </Pressable>
                </View>
            </SafeAreaView>
        </View>
    );

    if (isDesktop) {
        return (
            <View className="flex-1 flex-row bg-gray-50">
                <View className="w-64 border-r border-gray-200">
                    {renderSidebar()}
                </View>
                <View className="flex-1">
                    <Slot />
                </View>
            </View>
        );
    }

    return (
        <View className="flex-1 bg-gray-50">
            <SafeAreaView className="bg-[#1A237E] shadow-sm z-10">
                <View className="flex-row items-center justify-between p-4">
                    <View className="flex-row items-center">
                        <Pressable onPress={() => setDrawerOpen(true)} className="mr-4 p-1 active:bg-white/10 rounded-full">
                            <MaterialIcons name="menu" size={28} color="#FFFFFF" />
                        </Pressable>
                        <Text className="text-white text-lg font-bold tracking-wide">{currentTitle}</Text>
                    </View>
                    <Pressable onPress={() => router.push('/(borrower)/profile')} className="w-10 h-10 bg-white/10 rounded-full items-center justify-center border border-white/20 active:bg-white/20">
                        <MaterialIcons name="person" size={24} color="#FFFFFF" />
                    </Pressable>
                </View>
            </SafeAreaView>

            <View className="flex-1">
                <Slot />
            </View>

            {/* Bottom Nav for Mobile */}
            <SafeAreaView className="bg-white border-t border-gray-100">
                <View className="flex-row justify-around py-2">
                    {BORROWER_MENU.map(item => {
                        const isActive = pathname === item.route || pathname.startsWith(item.route + '/');
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
                                <Text className={`text-[10px] font-bold ${isActive ? 'text-[#1A237E]' : 'text-gray-700'}`}>
                                    {item.label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>
            </SafeAreaView>

            <Modal visible={drawerOpen} animationType="fade" transparent={true} onRequestClose={() => setDrawerOpen(false)}>
                <View className="flex-1 flex-row">
                    <Pressable className="absolute inset-0 bg-black/50" onPress={() => setDrawerOpen(false)} />
                    <View className="w-72 h-full shadow-2xl">
                        {renderSidebar()}
                    </View>
                </View>
            </Modal>
        </View>
    );
}
