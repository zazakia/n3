import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/store/AuthContext';
import { BorrowerPortalService, BorrowerProfile, BorrowerLoan, DashboardStats } from '../../src/services/BorrowerPortalService';
import { MaterialIcons } from '@expo/vector-icons';
import { formatPHP } from '../../src/utils/currency';
import { format } from 'date-fns';
import Animated, { FadeInUp } from 'react-native-reanimated';

export default function BorrowerDashboard() {
    const { user } = useAuth();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [borrower, setBorrower] = useState<BorrowerProfile | null>(null);
    const [activeLoans, setActiveLoans] = useState<BorrowerLoan[]>([]);
    const [stats, setStats] = useState<DashboardStats | null>(null);

    const loadData = useCallback(async () => {
        if (!user) return;
        try {
            // Find borrower record linked to this user
            const currentBorrower = await BorrowerPortalService.getBorrowerProfile(user.id);
            if (!currentBorrower) {
                setLoading(false);
                return;
            }
            setBorrower(currentBorrower);

            // Fetch dashboard stats
            const dashboardStats = await BorrowerPortalService.getDashboardStats(currentBorrower.id);
            setStats(dashboardStats);

            // Fetch active loans
            const allLoans = await BorrowerPortalService.getLoans(currentBorrower.id);
            const active = allLoans.filter(l => l.status === 'active' || l.status === 'defaulted');
            setActiveLoans(active);

        } catch (error) {
            console.error('[BorrowerDashboard] Failed to load data:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [user]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const onRefresh = () => {
        setRefreshing(true);
        loadData();
    };

    if (loading) {
        return (
            <View className="flex-1 items-center justify-center bg-gray-50">
                <ActivityIndicator size="large" color="#1A237E" />
            </View>
        );
    }

    if (!borrower) {
        return (
            <View className="flex-1 items-center justify-center bg-gray-50 p-6">
                <MaterialIcons name="error-outline" size={64} color="#D1D5DB" />
                <Text className="text-xl font-bold text-gray-900 mt-4 text-center">Profile Not Linked</Text>
                <Text className="text-gray-700 text-center mt-2">
                    Your user account is not linked to any borrower profile. Please contact support.
                </Text>
            </View>
        );
    }

    return (
        <ScrollView 
            className="flex-1 bg-gray-50" 
            contentContainerStyle={{ padding: 20 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#1A237E"]} />}
        >
            {/* Welcome Header */}
            <Animated.View entering={FadeInUp.duration(400).delay(100)} className="mb-6">
                <Text className="text-gray-700 font-bold uppercase tracking-widest text-[10px] mb-1">
                    Welcome back,
                </Text>
                <Text className="text-3xl font-black text-gray-900">{borrower.fullName}</Text>
            </Animated.View>

            {/* Key Stats Card */}
            <Animated.View entering={FadeInUp.duration(500).delay(200)} className="bg-[#1A237E] p-6 rounded-[32px] shadow-xl mb-6 relative overflow-hidden">
                <View className="absolute -right-10 -top-10 bg-white/10 w-40 h-40 rounded-full" />
                <View className="absolute -left-10 -bottom-10 bg-white/5 w-32 h-32 rounded-full" />
                
                <Text className="text-white/70 font-bold uppercase tracking-widest text-[10px] mb-2">
                    Total Outstanding Balance
                </Text>
                <Text className="text-4xl font-black text-white mb-6 tracking-tighter">
                    {formatPHP(stats?.totalOutstanding || 0)}
                </Text>

                <View className="flex-row border-t border-white/10 pt-6">
                    <View className="flex-1">
                        <Text className="text-white/90 text-[10px] font-bold uppercase mb-1">Active Loans</Text>
                        <Text className="text-white text-xl font-black">{stats?.activeLoansCount || 0}</Text>
                    </View>
                    <View className="flex-1 border-l border-white/10 pl-6">
                        <Text className="text-white/90 text-[10px] font-bold uppercase mb-1">Next Installment</Text>
                        <Text className="text-white text-xl font-black">
                            {formatPHP(stats?.nextPaymentAmount || 0)}
                        </Text>
                    </View>
                </View>
            </Animated.View>

            {/* Payment Countdown Notification */}
            {stats?.daysUntilNextPayment !== null && stats?.nextPaymentDate && (
                <Animated.View entering={FadeInUp.duration(500).delay(300)} className={`p-4 rounded-2xl border mb-6 flex-row items-center shadow-sm ${
                    stats.daysUntilNextPayment <= 3 ? 'bg-orange-50 border-orange-200' : 'bg-blue-50 border-blue-200'
                }`}>
                    <View className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${
                        stats.daysUntilNextPayment <= 3 ? 'bg-orange-200' : 'bg-blue-200'
                    }`}>
                        <MaterialIcons 
                            name="event-note" 
                            size={20} 
                            color={stats.daysUntilNextPayment <= 3 ? '#C2410C' : '#1D4ED8'} 
                        />
                    </View>
                    <View className="flex-1">
                        <Text className={`font-bold text-sm ${
                            stats.daysUntilNextPayment <= 3 ? 'text-orange-900' : 'text-blue-900'
                        }`}>
                            Next payment is due in {stats.daysUntilNextPayment} {stats.daysUntilNextPayment === 1 ? 'day' : 'days'}
                        </Text>
                        <Text className={`text-xs mt-0.5 ${
                            stats.daysUntilNextPayment <= 3 ? 'text-orange-700' : 'text-blue-700'
                        }`}>
                            {format(new Date(stats.nextPaymentDate), 'MMMM d, yyyy')} • {formatPHP(stats.nextPaymentAmount)}
                        </Text>
                    </View>
                </Animated.View>
            )}

            {/* Quick Actions */}
            <Animated.View entering={FadeInUp.duration(500).delay(400)} className="flex-row mb-8">
                <Pressable 
                    onPress={() => router.push('/(borrower)/loans')}
                    className="flex-1 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm items-center active:bg-gray-50"
                >
                    <View className="bg-blue-50 p-3 rounded-xl mb-2">
                        <MaterialIcons name="receipt-long" size={24} color="#1A237E" />
                    </View>
                    <Text className="text-xs font-bold text-gray-900 uppercase tracking-wide">My Loans</Text>
                </Pressable>
                <View className="w-4" />
                <Pressable 
                    onPress={() => router.push('/(borrower)/transactions')}
                    className="flex-1 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm items-center active:bg-gray-50"
                >
                    <View className="bg-green-50 p-3 rounded-xl mb-2">
                        <MaterialIcons name="history" size={24} color="#2E7D32" />
                    </View>
                    <Text className="text-xs font-bold text-gray-900 uppercase tracking-wide">Payments</Text>
                </Pressable>
            </Animated.View>

            {/* Active Loans Section */}
            <Animated.View entering={FadeInUp.duration(500).delay(500)}>
                <Text className="text-lg font-black text-gray-900 mb-4 uppercase tracking-wider">Active Loans</Text>
                {activeLoans.length > 0 ? (
                    activeLoans.map((loan, idx) => (
                        <Animated.View key={loan.id} entering={FadeInUp.duration(400).delay(500 + idx * 100)}>
                            <Pressable 
                                onPress={() => router.push(`/(borrower)/loans/${loan.id}`)}
                                className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm mb-4 flex-row items-center active:opacity-70"
                            >
                                <View className="w-12 h-12 rounded-xl bg-blue-50 items-center justify-center mr-4">
                                    <MaterialIcons name="account-balance" size={24} color="#1A237E" />
                                </View>
                                <View className="flex-1">
                                    <View className="flex-row items-center mb-1">
                                        <Text className="text-base font-bold text-gray-900 mr-2">{loan.loanNumber}</Text>
                                        <View className="bg-emerald-100 px-2 py-0.5 rounded-md">
                                            <Text className="text-[8px] font-black text-emerald-700 uppercase">{loan.status}</Text>
                                        </View>
                                    </View>
                                    <Text className="text-xs text-gray-700 font-medium">
                                        {format(new Date(loan.releaseDate), 'MMM d, yyyy')} • {formatPHP(loan.totalAmount)} Total
                                    </Text>
                                </View>
                                <MaterialIcons name="chevron-right" size={24} color="#D1D5DB" />
                            </Pressable>
                        </Animated.View>
                    ))
                ) : (
                    <View className="bg-white p-8 rounded-2xl border border-dashed border-gray-200 items-center">
                        <MaterialIcons name="money-off" size={48} color="#E5E7EB" />
                        <Text className="text-gray-700 font-bold mt-4">No active loans found.</Text>
                    </View>
                )}
            </Animated.View>

            {/* Help/Contact Support */}
            <Animated.View entering={FadeInUp.duration(500).delay(600)}>
                <Pressable 
                    className="mt-4 mb-10 p-4 rounded-2xl bg-gray-100 flex-row items-center active:bg-gray-200"
                    onPress={() => router.push('/(borrower)/profile')}
                >
                    <MaterialIcons name="headset-mic" size={20} color="#6B7280" className="mr-3" />
                    <Text className="text-gray-600 font-bold text-sm">Need help? Contact support team</Text>
                </Pressable>
            </Animated.View>
        </ScrollView>
    );
}
