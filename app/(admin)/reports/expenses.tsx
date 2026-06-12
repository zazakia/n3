import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, ActivityIndicator, Dimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { database } from '../../../src/database';
import Expense from '../../../src/database/models/Expense';
import { MaterialIcons } from '@expo/vector-icons';
import { formatPHP } from '../../../src/utils/currency';
import { PieChart } from 'react-native-chart-kit';
import { PrintButton } from '../../../src/components/PrintButton';
import { PdfGenerator } from '../../../src/services/PdfGenerator';

const CATEGORY_COLORS: Record<string, string> = {
    'Transportation': '#3B82F6',
    'Office Supplies': '#10B981',
    'Rent/Utilities': '#F59E0B',
    'Marketing': '#EF4444',
    'Taxes/Fees': '#8B5CF6',
    'Other': '#6B7280',
};

export default function ExpenseReportScreen() {
    const screenWidth = Dimensions.get('window').width - 48;
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [stats, setStats] = useState<{ name: string; amount: number; color: string; legendFontColor: string; legendFontSize: number }[]>([]);
    const [totalExpense, setTotalExpense] = useState(0);

    const loadData = async () => {
        setLoading(true);
        try {
            const expenses = await database.collections.get<Expense>('expenses').query().fetch();
            
            const categoryMap: Record<string, number> = {};
            let total = 0;
            
            expenses.forEach(exp => {
                const cat = exp.category || 'Other';
                categoryMap[cat] = (categoryMap[cat] || 0) + exp.amount;
                total += exp.amount;
            });

            const statsArray = Object.entries(categoryMap).map(([category, amount]) => ({
                name: category,
                amount,
                color: CATEGORY_COLORS[category] || CATEGORY_COLORS['Other'],
                legendFontColor: "#7F7F7F",
                legendFontSize: 12
            })).sort((a, b) => b.amount - a.amount);

            setStats(statsArray);
            setTotalExpense(total);
        } catch (error) {
            console.error('Failed to load expense report:', error);
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

    if (loading && !refreshing) {
        return (
            <View className="flex-1 justify-center items-center bg-gray-50">
                <ActivityIndicator size="large" color="#7B1FA2" />
            </View>
        );
    }

    return (
        <View className="flex-1 bg-gray-50">
            <View className="p-6 pb-2 bg-gray-50 border-b border-gray-100">
                <View className="flex-row justify-between items-start mb-2">
                    <View className="flex-1 pr-3">
                        <Text className="text-2xl font-black text-gray-900 mb-2">Expense Breakdown</Text>
                        <Text className="text-gray-700 font-bold uppercase tracking-widest text-[10px]">
                            Lifetime Business Expenses
                        </Text>
                    </View>
                    <View className="pt-1">
                        <PrintButton
                            onPrint={async () => {
                                await PdfGenerator.generateGenericReport({
                                    title: 'Expense Breakdown Report',
                                    subtitle: 'Lifetime Business Expenses',
                                    headers: ['Category', 'Amount', '% of Total'],
                                    data: stats.map(s => [
                                        s.name,
                                        formatPHP(s.amount),
                                        `${((s.amount / totalExpense) * 100).toFixed(1)}%`
                                    ]),
                                    summaryBoxes: [
                                        { label: 'Total Expenses', value: formatPHP(totalExpense) }
                                    ]
                                });
                            }}
                            compact
                        />
                    </View>
                </View>
            </View>

            <ScrollView 
                className="flex-1"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                contentContainerStyle={{ padding: 24 }}
            >

                <View className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm mb-6 items-center">
                    <Text className="text-gray-700 text-xs font-bold uppercase mb-1">Total Expenses</Text>
                    <Text className="text-3xl font-black text-gray-900 mb-4">{formatPHP(totalExpense)}</Text>
                    
                    {stats.length > 0 ? (
                        <View className="items-center justify-center">
                            <PieChart
                                data={stats.map(s => ({
                                    name: s.name,
                                    population: s.amount,
                                    color: s.color,
                                    legendFontColor: s.legendFontColor,
                                    legendFontSize: s.legendFontSize,
                                }))}
                                width={screenWidth}
                                height={220}
                                chartConfig={{
                                    color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                                }}
                                accessor={"population"}
                                backgroundColor={"transparent"}
                                paddingLeft={"15"}
                                absolute
                            />
                        </View>
                    ) : (
                        <View className="py-20 items-center">
                            <MaterialIcons name="pie-chart-outlined" size={64} color="#E5E7EB" />
                            <Text className="text-gray-700 mt-4 font-bold">No Data Available</Text>
                        </View>
                    )}
                </View>

                <Text className="text-gray-900 font-black text-xl mb-4">Detailed Categories</Text>
                <View className="bg-white rounded-[32px] border border-gray-100 overflow-hidden mb-10">
                    {stats.map((item, idx) => (
                        <View key={item.name} className={`flex-row items-center px-6 py-4 ${idx < stats.length - 1 ? 'border-b border-gray-50' : ''}`}>
                            <View style={{ backgroundColor: item.color }} className="w-3 h-3 rounded-full mr-4" />
                            <View className="flex-1">
                                <Text className="font-bold text-gray-900">{item.name}</Text>
                                <Text className="text-[10px] text-gray-700 font-bold uppercase">
                                    {((item.amount / (totalExpense || 1)) * 100).toFixed(1)}% of total
                                </Text>
                            </View>
                            <Text className="font-black text-gray-900">{formatPHP(item.amount)}</Text>
                        </View>
                    ))}
                </View>
            </ScrollView>
        </View>
    );
}
