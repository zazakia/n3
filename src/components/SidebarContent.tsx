import React from 'react';
import { View, Text, Pressable, ScrollView, SafeAreaView } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../store/AuthContext';

type MenuItem = {
    icon: keyof typeof MaterialIcons.glyphMap;
    label: string;
    route: string;
};

export const MAIN_MENU: MenuItem[] = [
    { icon: 'dashboard', label: 'Dashboard', route: '/(admin)' },
    { icon: 'people', label: 'Borrowers', route: '/(admin)/borrowers' },
    { icon: 'receipt-long', label: 'Loans', route: '/(admin)/loans' },
    { icon: 'payments', label: 'Payments', route: '/(admin)/payments' },
    { icon: 'account-balance-wallet', label: 'Expenses', route: '/(admin)/expenses' },
];

export const ADMIN_MENU: MenuItem[] = [
    { icon: 'manage-accounts', label: 'Users', route: '/(admin)/users' },
    { icon: 'directions-walk', label: 'Collectors', route: '/(admin)/collectors' },
    { icon: 'delete-outline', label: 'Deleted Items', route: '/(admin)/settings/deleted' },
    { icon: 'history', label: 'Audit Trail', route: '/(admin)/settings/audit-trail' },
    { icon: 'health-and-safety', label: 'System Audit', route: '/(admin)/reports/audit' },
    { icon: 'settings', label: 'Settings', route: '/(admin)/settings' },
];

export const DAILY_REPORTS: MenuItem[] = [
    { icon: 'calendar-today', label: 'Daily Collection Sheet', route: '/(admin)/reports/daily-collection' },
    { icon: 'bar-chart', label: 'Reports Overview', route: '/(admin)/reports/dashboard' },
    { icon: 'pie-chart', label: 'Expense Breakdown', route: '/(admin)/reports/expenses' },
    { icon: 'chat', label: 'AI Assistant', route: '/(admin)/reports/ai-assistant' },
];

export const WEEKLY_REPORTS: MenuItem[] = [
    { icon: 'list-alt', label: 'Collection Report', route: '/(admin)/reports/collection' },
    { icon: 'view-list', label: 'Weekly Collection Sheet', route: '/(admin)/reports/weekly-collection' },
    { icon: 'assignment-ind', label: 'Active Loans Collection', route: '/(admin)/reports/active-loans' },
];

export const MONTHLY_REPORTS: MenuItem[] = [
    { icon: 'assessment', label: 'Financial Summary', route: '/(admin)/reports/financial-summary' },
    { icon: 'trending-up', label: 'Collector Efficiency', route: '/(admin)/reports/collector-efficiency' },
    { icon: 'assignment-late', label: 'Portfolio Aging', route: '/(admin)/reports/portfolio-aging' },
    { icon: 'repeat', label: 'Borrower Retention', route: '/(admin)/reports/renewals' },
    { icon: 'analytics', label: 'MFI Metrics', route: '/(admin)/reports/mfi-kpis' },
    { icon: 'receipt', label: 'Income Statement', route: '/(admin)/reports/income-statement' },
    { icon: 'account-balance', label: 'Balance Sheet', route: '/(admin)/reports/balance-sheet' },
    { icon: 'outbox', label: 'Disbursement History', route: '/(admin)/reports/disbursements' },
];

export const FINANCIALS_MENU: MenuItem[] = [
    { icon: 'account-balance', label: 'Cash on Hand', route: '/(admin)/cash-on-hand' },
    { icon: 'savings', label: 'Savings Portfolio', route: '/(admin)/reports/savings' },
    { icon: 'account-balance-wallet', label: 'Bank Accounts', route: '/(admin)/bank-accounts' },
];

export const SUPPORT_MENU: MenuItem[] = [
    { icon: 'campaign', label: 'Updates', route: '/(admin)/settings/updates' },
    { icon: 'help-outline', label: 'Help & Guide', route: '/(admin)/help' },
];

function NavItem({ item, isActive, onPress }: { item: MenuItem; isActive: boolean; onPress: () => void }) {
    return (
        <Pressable
            onPress={onPress}
            className={`flex-row items-center p-3 rounded-lg mb-1 mx-2 ${isActive ? 'bg-white/10' : 'hover:bg-white/5 active:bg-white/10'
                }`}
        >
            <MaterialIcons
                name={item.icon}
                size={24}
                color={isActive ? '#FFFFFF' : 'rgba(255,255,255,0.6)'}
                className="mr-3"
            />
            <Text className={`text-sm tracking-wide ${isActive ? 'text-white font-bold' : 'text-white/90 font-medium'}`}>
                {item.label}
            </Text>
        </Pressable>
    );
}

export function SidebarContent({ onClose }: { onClose?: () => void }) {
    const router = useRouter();
    const pathname = usePathname();
    const { signOut } = useAuth();

    // Normalize pathname for matching (handles nested routes)
    const normalizePath = (p: string) => p.replace('/(admin)', '');
    const currentPath = normalizePath(pathname);

    const handlePress = (route: string) => {
        router.push(route as any);
        if (onClose) onClose();
    };

    const renderMenuSection = (title: string, items: MenuItem[]) => (
        <View className="mb-4">
            <Text className="text-white/80 text-[10px] uppercase font-bold tracking-widest px-5 mb-2">{title}</Text>
            {items.map(item => (
                <NavItem
                    key={item.route}
                    item={item}
                    isActive={currentPath.startsWith(normalizePath(item.route))}
                    onPress={() => handlePress(item.route)}
                />
            ))}
        </View>
    );

    return (
        <View className="flex-1 bg-primary">
            <SafeAreaView className="flex-1">
                <View className="p-4 items-center justify-center border-b border-white/10 mb-4 h-24">
                    <View className="flex-row items-center">
                        <View className="bg-red-500/20 p-2 rounded-lg mr-2">
                            <MaterialIcons name="all-inclusive" size={24} color="#FFC107" />
                        </View>
                        <View>
                            <Text className="text-white font-extrabold text-lg tracking-tighter">INFINITY</Text>
                            <Text className="text-white/70 text-xs font-bold tracking-widest mt-0.5">FINANCE</Text>
                        </View>
                    </View>
                </View>

                <ScrollView className="flex-1"  showsVerticalScrollIndicator={false}  >
                    {renderMenuSection('Main', MAIN_MENU)}
                    {renderMenuSection('Admin', ADMIN_MENU)}
                    {renderMenuSection('Daily Reports', DAILY_REPORTS)}
                    {renderMenuSection('Weekly Reports', WEEKLY_REPORTS)}
                    {renderMenuSection('Monthly Reports', MONTHLY_REPORTS)}
                    {renderMenuSection('Financials', FINANCIALS_MENU)}
                    {renderMenuSection('Support', SUPPORT_MENU)}
                </ScrollView>

                <View className="p-4 border-t border-white/10">
                    <Pressable
                        onPress={signOut}
                        testID="logout-button"
                        className="flex-row items-center p-3 rounded-lg bg-red-500/20 active:bg-red-500/30"
                    >
                        <MaterialIcons name="logout" size={20} color="#EF5350" className="mr-3" />
                        <Text className="text-[#EF5350] font-bold text-sm">Sign Out</Text>
                    </Pressable>
                </View>
            </SafeAreaView>
        </View>
    );
}
