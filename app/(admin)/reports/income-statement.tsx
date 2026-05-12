import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, Pressable } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MfiKpiService } from '../../../src/services/MfiKpiService';
import { formatPHP } from '../../../src/utils/currency';
import { startOfMonth, endOfMonth, addMonths, subMonths, format } from 'date-fns';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';

export default function IncomeStatementScreen() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [data, setData] = useState<any>(null);
    const [currentMonth, setCurrentMonth] = useState(new Date());

    const startDate = startOfMonth(currentMonth).getTime();
    const endDate = endOfMonth(currentMonth).getTime();

    const loadData = async () => {
        setLoading(true);
        try {
            const result = await MfiKpiService.getIncomeStatement(startDate, endDate);
            setData(result);
        } catch (error) {
            console.error('Failed to load income statement:', error);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(useCallback(() => { loadData(); }, [currentMonth]));

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

    return (
        <View className="flex-1 bg-gray-50">
            {/* ── Top controls (Static) ── */}
            <View className="p-6 pb-2 bg-gray-50 border-b border-gray-100">
                <Text className="text-2xl font-black text-gray-900 mb-4">Income Statement</Text>

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
                            <Text className="text-gray-700 font-bold">Gross Collections</Text>
                            <Text className="text-gray-900 font-black">{formatPHP(data.operatingRevenue)}</Text>
                        </View>
                        <View className="flex-row justify-between items-center mb-6 pl-2">
                            <Text className="text-gray-700 text-xs italic">Physically Remitted</Text>
                            <Text className="text-blue-600 font-bold text-xs">{formatPHP(data.remittedRevenue)}</Text>
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
                        <View className="flex-row justify-between items-center bg-blue-50 p-4 rounded-2xl">
                            <Text className="text-blue-900 font-black text-lg uppercase tracking-wide">Net Income</Text>
                            <Text className={`text-2xl font-black ${data.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {formatPHP(data.netIncome)}
                            </Text>
                        </View>

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
