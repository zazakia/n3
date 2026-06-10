import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MfiKpiService } from '../../../src/services/MfiKpiService';
import { formatPHP } from '../../../src/utils/currency';
import { format } from 'date-fns';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AccountingBasisToggle } from '../../../src/components/AccountingBasisToggle';

export default function BalanceSheetScreen() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [data, setData] = useState<any>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            const result = await MfiKpiService.getBalanceSheet();
            setData(result);
        } catch (error) {
            console.error('Failed to load balance sheet:', error);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(useCallback(() => { loadData(); }, []));

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    if (loading && !refreshing && !data) {
        return (
            <View className="flex-1 justify-center items-center bg-gray-50">
                <ActivityIndicator size="large" color="#3B82F6" />
            </View>
        );
    }

    return (
        <View className="flex-1 bg-gray-50">
            <View className="p-6 pb-2 bg-gray-50 border-b border-gray-100">
                <View className="flex-row justify-between items-center mb-2">
                    <Text className="text-2xl font-black text-gray-900">Balance Sheet</Text>
                    <Pressable className="bg-blue-100 p-2 rounded-full" onPress={loadData}>
                        <MaterialIcons name="refresh" size={20} color="#2563EB" />
                    </Pressable>
                </View>
                <Text className="text-gray-700 font-bold uppercase tracking-widest text-[10px] mb-3">
                    As of {data ? format(data.asOf, 'MMM d, yyyy') : 'Now'}
                </Text>

                {/* Accounting Basis Toggle — with note that it doesn't change Balance Sheet */}
                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: '#F8FAFC',
                        borderRadius: 14,
                        padding: 10,
                        borderWidth: 1,
                        borderColor: '#E2E8F0',
                    }}
                >
                    <View style={{ flex: 1, marginRight: 10 }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
                            Accounting Basis
                        </Text>
                        <Text style={{ fontSize: 10, color: '#94A3B8', lineHeight: 14 }}>
                            Balance sheet is the same under both bases
                        </Text>
                    </View>
                    <AccountingBasisToggle compact />
                </View>
            </View>

            <ScrollView 
                className="flex-1"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                contentContainerStyle={{ padding: 24 }}
            >
                {data ? (
                    <Animated.View entering={FadeInDown.springify()} className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm mb-8">
                        
                        {/* ASSETS */}
                        <Text className="text-blue-600 font-black tracking-widest text-lg uppercase mb-4">Assets</Text>
                        <View className="flex-row justify-between items-center mb-3 pl-2">
                            <Text className="text-sm text-gray-700 font-medium">Net Loan Portfolio</Text>
                            <Text className="text-gray-900 font-black">{formatPHP(data.assets.loanPortfolio)}</Text>
                        </View>
                        <View className="flex-row justify-between items-center mb-3 pl-2">
                            <Text className="text-sm text-gray-700 font-medium">Cash on Hand (Admin)</Text>
                            <Text className="text-emerald-700 font-black">{formatPHP(data.assets.cashOnHand)}</Text>
                        </View>
                        <View className="flex-row justify-between items-center mb-3 pl-2">
                            <Text className="text-sm text-gray-700 font-medium">Cash in Transit (Collectors)</Text>
                            <Text className="text-orange-600 font-black">{formatPHP(data.assets.cashInTransit)}</Text>
                        </View>
                        {data.assets.otherAssets > 0 && (
                            <View className="flex-row justify-between items-center mb-3 pl-2">
                                <Text className="text-sm text-gray-700 font-medium">Other Assets</Text>
                                <Text className="text-gray-900 font-black">{formatPHP(data.assets.otherAssets)}</Text>
                            </View>
                        )}
                        <View className="flex-row justify-between items-center bg-blue-50 p-4 rounded-2xl mb-8 mt-2">
                            <Text className="text-blue-900 font-black uppercase tracking-wider">Total Assets</Text>
                            <Text className="text-blue-700 font-black text-xl">{formatPHP(data.assets.totalAssets)}</Text>
                        </View>
                        
                        <View className="h-px bg-gray-200 mb-8" />

                        {/* LIABILITIES */}
                        <Text className="text-red-600 font-black tracking-widest text-lg uppercase mb-4">Liabilities</Text>
                        <View className="flex-row justify-between items-center mb-4 pl-2">
                            <Text className="text-gray-600">Borrowings / Payables</Text>
                            <Text className="text-gray-800 font-bold">{formatPHP(data.liabilities.borrowings)}</Text>
                        </View>
                        <View className="flex-row justify-between items-center mb-4 pl-2">
                            <Text className="text-gray-600">Borrower Savings Deposits</Text>
                            <Text className="text-gray-800 font-bold">{formatPHP(data.liabilities.savingsDeposits)}</Text>
                        </View>
                        <View className="flex-row justify-between items-center bg-red-50 p-3 rounded-xl mb-8">
                            <Text className="text-red-900 font-black uppercase">Total Liabilities</Text>
                            <Text className="text-red-700 font-black">{formatPHP(data.liabilities.totalLiabilities)}</Text>
                        </View>

                        <View className="h-px bg-gray-200 mb-8" />

                        {/* EQUITY */}
                        <Text className="text-green-600 font-black tracking-widest text-lg uppercase mb-4">Equity</Text>
                        <View className="flex-row justify-between items-center mb-4 pl-2">
                            <Text className="text-gray-600">Paid-In Capital / Reserves</Text>
                            <Text className="text-gray-800 font-bold">{formatPHP(data.equity.paidInCapital)}</Text>
                        </View>
                        <View className="flex-row justify-between items-center bg-green-50 p-3 rounded-xl">
                            <Text className="text-green-900 font-black uppercase">Total Equity</Text>
                            <Text className="text-green-700 font-black">{formatPHP(data.equity.totalEquity)}</Text>
                        </View>

                    </Animated.View>
                ) : (
                    <View className="p-10 items-center">
                        <MaterialIcons name="error-outline" size={40} color="#D1D5DB" />
                        <Text className="text-gray-700 font-semibold mt-3">Could not generate sheet</Text>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}
