import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MfiKpiService } from '../../../src/services/MfiKpiService';
import { formatPHP } from '../../../src/utils/currency';
import { startOfMonth, endOfMonth, addMonths, subMonths, format } from 'date-fns';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AccountingBasisToggle } from '../../../src/components/AccountingBasisToggle';
import { useAppStore } from '../../../src/store/useAppStore';

export default function IncomeStatementScreen() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [data, setData] = useState<any>(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());

    const { accountingBasis } = useAppStore();

    const startDate = startOfMonth(currentMonth).getTime();
    const endDate = endOfMonth(currentMonth).getTime();

    const loadData = async () => {
        setLoading(true);
        try {
            const result = await MfiKpiService.getIncomeStatement(startDate, endDate, accountingBasis);
            setData(result);
        } catch (error) {
            console.error('Failed to load income statement:', error);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(useCallback(() => { loadData(); }, [currentMonth, accountingBasis]));

    const onRefresh = async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    };

    const goToPrevMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
    const goToNextMonth = () => {
        const next = addMonths(currentMonth, 1);
        if (next <= new Date()) setCurrentMonth(next);
    };
    const isCurrentMonth = format(currentMonth, 'yyyy-MM') === format(new Date(), 'yyyy-MM');

    if (loading && !refreshing && !data) {
        return (
            <View className="flex-1 justify-center items-center bg-gray-50">
                <ActivityIndicator size="large" color="#3B82F6" />
            </View>
        );
    }

    const isCashBasis = accountingBasis === 'cash';

    return (
        <View className="flex-1 bg-gray-50">
            {/* ── Top controls (Static) ── */}
            <View className="p-6 pb-3 bg-gray-50 border-b border-gray-100">
                <View className="flex-row items-center justify-between mb-4">
                    <Text className="text-2xl font-black text-gray-900">Income Statement</Text>
                </View>

                {/* Accounting Basis Toggle */}
                <View className="flex-row items-center justify-between mb-4">
                    <View>
                        <Text className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">
                            Accounting Basis
                        </Text>
                        <Text className="text-[11px] text-gray-400">
                            {isCashBasis ? 'Showing cash-received interest income' : 'Showing proportional accrual interest income'}
                        </Text>
                    </View>
                    <AccountingBasisToggle compact />
                </View>

                {/* Basis badge */}
                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: isCashBasis ? '#ECFDF5' : '#EEF2FF',
                        borderRadius: 10,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        marginBottom: 12,
                        alignSelf: 'flex-start',
                    }}
                >
                    <MaterialIcons
                        name={isCashBasis ? 'payments' : 'trending-up'}
                        size={13}
                        color={isCashBasis ? '#059669' : '#4338CA'}
                        style={{ marginRight: 5 }}
                    />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: isCashBasis ? '#065F46' : '#3730A3' }}>
                        {isCashBasis ? 'Cash Basis — interest recognized when cash received' : 'Accrual Basis — interest allocated proportionally (MFI standard)'}
                    </Text>
                </View>

                {/* Month Navigator */}
                <View className="flex-row items-center justify-between bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
                    <Pressable
                        onPress={goToPrevMonth}
                        className="p-2 rounded-xl bg-gray-50 active:bg-gray-100"
                    >
                        <MaterialIcons name="chevron-left" size={24} color="#1A237E" />
                    </Pressable>
                    <View className="items-center">
                        <Text className="text-base font-black text-gray-900">{format(currentMonth, 'MMMM yyyy')}</Text>
                        <Text className="text-[10px] font-bold text-gray-700 uppercase tracking-widest">
                            {format(startDate, 'MMM d')} — {format(endDate, 'MMM d, yyyy')}
                        </Text>
                    </View>
                    <Pressable
                        onPress={goToNextMonth}
                        className={`p-2 rounded-xl ${isCurrentMonth ? 'opacity-30' : 'bg-gray-50 active:bg-gray-100'}`}
                        disabled={isCurrentMonth}
                    >
                        <MaterialIcons name="chevron-right" size={24} color="#1A237E" />
                    </Pressable>
                </View>
            </View>

            <ScrollView
                className="flex-1"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                contentContainerStyle={{ padding: 24 }}
            >
                {loading && !refreshing ? (
                    <ActivityIndicator color="#3B82F6" className="mt-10" />
                ) : data ? (
                    <Animated.View entering={FadeInDown.springify()} className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm mb-8">

                        {/* Operating Revenue */}
                        <Text className="text-blue-600 font-black tracking-widest text-xs uppercase mb-4">Operating Revenue</Text>
                        <View className="flex-row justify-between items-center mb-2 pl-2">
                            <View>
                                <Text className="text-gray-700">Earned Interest Income</Text>
                                {isCashBasis && (
                                    <Text className="text-[10px] text-emerald-600 font-semibold">Cash-received portion only</Text>
                                )}
                            </View>
                            <Text className="text-gray-900 font-bold">{formatPHP(data.earnedInterestIncome || 0)}</Text>
                        </View>
                        <View className="flex-row justify-between items-center mb-2 pl-2">
                            <Text className="text-gray-700">Upfront Fee Income</Text>
                            <Text className="text-gray-900 font-bold">{formatPHP(data.upfrontFeeIncome || 0)}</Text>
                        </View>
                        <View className="flex-row justify-between items-center mb-3 pl-2">
                            <Text className="text-gray-700">Penalty Income</Text>
                            <Text className="text-gray-900 font-bold">{formatPHP(data.penaltyIncome || 0)}</Text>
                        </View>
                        <View className="flex-row justify-between items-center mt-2 mb-6 pl-2 bg-blue-50 p-2 rounded-lg">
                            <Text className="text-gray-900 font-bold">Total Gross Income</Text>
                            <Text className="text-blue-600 font-black">{formatPHP(data.totalGrossIncome || data.operatingRevenue)}</Text>
                        </View>
                        <View className="h-px bg-gray-100 mb-6" />

                        {/* Operating Expenses */}
                        <Text className="text-red-500 font-black tracking-widest text-xs uppercase mb-4">Operating Expenses</Text>
                        {Object.entries(data.opExBreakdown || {}).map(([category, amount]: [string, any]) => (
                            <View key={category} className="flex-row justify-between items-center mb-3 pl-2">
                                <Text className="text-gray-600">{category}</Text>
                                <Text className="text-gray-800 font-bold">{formatPHP(amount)}</Text>
                            </View>
                        ))}
                        <View className="flex-row justify-between items-center mt-2 mb-6 pl-2 bg-gray-50 p-2 rounded-lg">
                            <Text className="text-gray-900 font-bold">Total Operating Expenses</Text>
                            <Text className="text-red-600 font-black">({formatPHP(data.operatingExpenses)})</Text>
                        </View>
                        <View className="h-px bg-gray-100 mb-6" />

                        {/* Other Costs */}
                        <Text className="text-orange-500 font-black tracking-widest text-xs uppercase mb-4">Financial & Provision Costs</Text>
                        <View className="flex-row justify-between items-center mb-3 pl-2">
                            <Text className="text-gray-600">Financial Costs</Text>
                            <Text className="text-gray-800 font-bold">({formatPHP(data.financialCosts)})</Text>
                        </View>
                        <View className="flex-row justify-between items-center mb-6 pl-2">
                            <Text className="text-gray-600">Loan Loss Provisions</Text>
                            <Text className="text-gray-800 font-bold">({formatPHP(data.loanLossProvisions)})</Text>
                        </View>
                        <View className="h-0.5 bg-gray-200 mb-4" />

                        {/* Net Income */}
                        <View className="flex-row justify-between items-center bg-blue-50 p-4 rounded-2xl mb-8">
                            <View>
                                <Text className="text-blue-900 font-black text-lg uppercase tracking-wide">Net Income</Text>
                                {isCashBasis && (
                                    <Text className="text-[10px] text-emerald-600 font-semibold mt-0.5">Cash Basis</Text>
                                )}
                            </View>
                            <Text className={`text-2xl font-black ${data.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {formatPHP(data.netIncome)}
                            </Text>
                        </View>

                        {/* Future Outlook / Portfolio Health — Accrual only */}
                        {!isCashBasis && data.unearnedInterestPipeline !== null && (
                            <>
                                <Text className="text-indigo-600 font-black tracking-widest text-xs uppercase mb-4">Future Outlook / Portfolio Health</Text>
                                <Text className="text-gray-500 text-xs mb-4 pl-2">
                                    This section represents future expected value and currently active loans, not actual cash received in this period.
                                </Text>
                                <View className="flex-row justify-between items-center mb-3 pl-2">
                                    <Text className="text-gray-700">Unearned Interest Pipeline</Text>
                                    <Text className="text-indigo-900 font-bold">{formatPHP(data.unearnedInterestPipeline || 0)}</Text>
                                </View>
                                <View className="flex-row justify-between items-center mb-2 pl-2">
                                    <Text className="text-gray-700">Total Principal on Street (GLP)</Text>
                                    <Text className="text-indigo-900 font-bold">{formatPHP(data.glp || 0)}</Text>
                                </View>
                            </>
                        )}

                        {/* Cash basis note: show GLP only without unearned interest */}
                        {isCashBasis && (
                            <View style={{ backgroundColor: '#F0FDF4', borderRadius: 16, padding: 16 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                                    <MaterialIcons name="info-outline" size={14} color="#059669" style={{ marginRight: 6 }} />
                                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#065F46', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                        Cash Basis Note
                                    </Text>
                                </View>
                                <Text style={{ fontSize: 12, color: '#166534', lineHeight: 18 }}>
                                    Unearned interest pipeline is not shown in Cash Basis mode — only cash actually received is recognized as income. Switch to Accrual to see the future interest outlook.
                                </Text>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
                                    <Text style={{ color: '#374151', fontSize: 13 }}>Total Principal on Street (GLP)</Text>
                                    <Text style={{ color: '#065F46', fontWeight: '800', fontSize: 13 }}>{formatPHP(data.glp || 0)}</Text>
                                </View>
                            </View>
                        )}

                    </Animated.View>
                ) : (
                    <View className="p-10 items-center">
                        <MaterialIcons name="error-outline" size={40} color="#D1D5DB" />
                        <Text className="text-gray-700 font-semibold mt-3">Could not generate statement</Text>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}
