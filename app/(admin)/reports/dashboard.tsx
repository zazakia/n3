import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { MfiKpiService, MfiKpiData } from '../../../src/services/MfiKpiService';
import { formatPHP } from '../../../src/utils/currency';
import { StatCard } from '../../../src/components/StatCard';
import { ReportInfoModal, InfoModalContent } from '../../../src/components/ReportInfoModal';
import { AccountingBasisToggle } from '../../../src/components/AccountingBasisToggle';
import { useAppStore } from '../../../src/store/useAppStore';

export default function ReportsDashboardScreen() {
    const router = useRouter();
    const [kpis, setKpis] = useState<MfiKpiData | null>(null);
    const [loading, setLoading] = useState(true);
    const [infoContent, setInfoContent] = useState<InfoModalContent | null>(null);

    const { accountingBasis } = useAppStore();
    const isCashBasis = accountingBasis === 'cash';

    const loadData = async () => {
        try {
            const data = await MfiKpiService.getKpiSummary();
            setKpis(data);
        } catch (error) {
            console.error('Failed to load KPIs:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    if (loading || !kpis) {
        return <ActivityIndicator size="large" color="#1A237E" className="flex-1 bg-gray-50 pt-20" />;
    }

    return (
        <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16 }}>
            {/* Header + Global Accounting Basis Toggle */}
            <View className="mb-6">
                <View className="flex-row items-center justify-between mb-1">
                    <Text className="text-2xl font-black text-gray-900">Standard Reports</Text>
                </View>
                <Text className="text-gray-700 font-medium mb-3">Performance and risk analytics</Text>

                {/* Global Accounting Basis Toggle — sets mode for Income Statement & Financial Summary */}
                <View
                    style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: isCashBasis ? '#ECFDF5' : '#EEF2FF',
                        borderRadius: 16,
                        padding: 12,
                        borderWidth: 1,
                        borderColor: isCashBasis ? '#A7F3D0' : '#C7D2FE',
                    }}
                >
                    <View style={{ flex: 1, marginRight: 10 }}>
                        <Text style={{
                            fontSize: 10,
                            fontWeight: '800',
                            color: isCashBasis ? '#065F46' : '#3730A3',
                            textTransform: 'uppercase',
                            letterSpacing: 0.6,
                            marginBottom: 2,
                        }}>
                            Reporting Basis
                        </Text>
                        <Text style={{ fontSize: 11, color: isCashBasis ? '#059669' : '#4338CA', fontWeight: '600' }}>
                            {isCashBasis
                                ? 'Income Statement & Financial Summary using Cash Basis'
                                : 'Income Statement & Financial Summary using Accrual Basis (Default)'}
                        </Text>
                    </View>
                    <AccountingBasisToggle compact />
                </View>
            </View>

            {/* Top Row Metrics */}
            <View className="flex-row flex-wrap justify-between mb-8">
                <View className="w-[48%] mb-4">
                    <StatCard
                        title="Portfolio At Risk"
                        value={`${(kpis.portfolioAtRisk * 100).toFixed(2)}%`}
                        icon="warning" color="#D32F2F"
                        onPress={() => router.push('/(admin)/reports/mfi-kpis')}
                        onInfoPress={() => setInfoContent({
                            title: 'Portfolio At Risk (PAR)',
                            question: 'What percentage of our outstanding loan balance is currently delayed or at risk of default?',
                            formula: 'Outstanding balance of loans with arrears / Total Outstanding Principal',
                            explanation: 'PAR measures the risk level of the active loan portfolio. A lower percentage indicates a healthier portfolio.'
                        })}
                    />
                </View>
                <View className="w-[48%] mb-4">
                    <StatCard
                        title="Collection Eff."
                        value={`${(kpis.collectionEfficiency * 100).toFixed(1)}%`}
                        icon="trending-up" color="#388E3C"
                        onPress={() => router.push('/(admin)/reports/collection')}
                        onInfoPress={() => setInfoContent({
                            title: 'Collection Efficiency',
                            question: 'How much of the total expected payments have we successfully collected?',
                            formula: 'Total Collected Amount / Total Expected Amount Due',
                            explanation: 'This measures how effective the collection process is. It looks at the actual amount of money collected versus what was scheduled to be collected over a period.'
                        })}
                    />
                </View>
                <View className="w-[48%] mb-4">
                    <StatCard
                        title="Active Loans"
                        value={kpis.totalActiveLoans.toString()}
                        icon="receipt-long" color="#1A237E"
                        onInfoPress={() => setInfoContent({
                            title: 'Active Loans',
                            question: 'How many loans are currently ongoing and not yet fully paid or closed?',
                            formula: 'Count of all loans where status = "active"',
                            explanation: 'Simply represents the total volume of borrowers currently managing a loan with the institution.'
                        })}
                    />
                </View>
                <View className="w-[48%] mb-4">
                    <StatCard
                        title="Portfolio Size"
                        value={formatPHP(kpis.totalOutstandingPrincipal)}
                        icon="account-balance" color="#F9A825"
                        onInfoPress={() => setInfoContent({
                            title: 'Portfolio Size',
                            question: 'What is the total monetary value of all active loans combined?',
                            formula: 'Sum of the outstanding principal balance across all active loans',
                            explanation: 'Also known as the Total Loan Portfolio, this represents the total capital currently entrusted to borrowers.'
                        })}
                    />
                </View>
            </View>

            {/* Report Categories */}
            {/* Daily / Overview */}
            <Text className="text-[10px] font-black text-gray-700 uppercase tracking-[2px] mb-4 mt-2 ml-2">Daily & Real-time</Text>
            <ReportLink
                title="Reports Overview"
                desc="High-level operational metrics and KPIs"
                icon="bar-chart" color="#1A237E"
                onPress={() => router.push('/(admin)/reports/dashboard')}
            />
            <ReportLink
                title="Expense Breakdown"
                desc="Pie chart summary of operational expenses by category"
                icon="pie-chart" color="#7B1FA2"
                onPress={() => router.push('/(admin)/reports/expenses')}
            />

            {/* Weekly */}
            <Text className="text-[10px] font-black text-gray-700 uppercase tracking-[2px] mb-4 mt-6 ml-2">Weekly Operations</Text>
            <ReportLink
                title="Collection Report"
                desc="Actual payments received with collector and date-range filters"
                icon="event-note" color="#1A237E"
                onPress={() => router.push('/(admin)/reports/collection')}
            />
            <ReportLink
                title="Weekly DCS Area Sheet"
                desc="Excel-style weekly area sheet with collector and group filters"
                icon="table-chart" color="#059669"
                onPress={() => router.push('/(admin)/reports/weekly-dcs')}
            />

            {/* Monthly */}
            <Text className="text-[10px] font-black text-gray-700 uppercase tracking-[2px] mb-4 mt-6 ml-2">Monthly Performance</Text>
            <ReportLink
                title="Financial Summary"
                desc={`Net monthly performance and cash flow status · ${isCashBasis ? 'Cash Basis' : 'Accrual Basis'}`}
                icon="assessment" color="#059669"
                onPress={() => router.push('/(admin)/reports/financial-summary')}
            />
            <ReportLink
                title="Collector Efficiency"
                desc="Ranking and performance metrics per collector"
                icon="trending-up" color="#059669"
                onPress={() => router.push('/(admin)/reports/collector-efficiency')}
            />
            <ReportLink
                title="Portfolio Aging (PAR)"
                desc="Detailed breakdown of late and defaulted accounts"
                icon="assignment-late" color="#D32F2F"
                onPress={() => router.push('/(admin)/reports/portfolio-aging')}
            />
            <ReportLink
                title="MFI Metrics (OSS/FSS)"
                desc="Operational and Financial Self-Sufficiency tracking"
                icon="analytics" color="#1A237E"
                onPress={() => router.push('/(admin)/reports/mfi-kpis')}
            />
            <ReportLink
                title="Income Statement"
                desc={`Revenue, Expenses, and Net Income · ${isCashBasis ? 'Cash Basis' : 'Accrual Basis'}`}
                icon="receipt" color="#00838F"
                onPress={() => router.push('/(admin)/reports/income-statement')}
            />
            <ReportLink
                title="Balance Sheet"
                desc="Assets, Liabilities, and Equity overview"
                icon="account-balance" color="#4527A0"
                onPress={() => router.push('/(admin)/reports/balance-sheet')}
            />
            <ReportLink
                title="Disbursement History"
                desc="Chronological list of released loans by period"
                icon="outbox" color="#F9A825"
                onPress={() => router.push('/(admin)/reports/disbursements')}
            />

            <View className="h-20" />

            <ReportInfoModal
                visible={!!infoContent}
                content={infoContent}
                onClose={() => setInfoContent(null)}
            />
        </ScrollView>
    );
}

function ReportLink({ title, desc, icon, color, onPress }: { title: string, desc: string, icon: any, color: string, onPress: () => void }) {
    return (
        <Pressable
            onPress={onPress}
            className="flex-row items-center bg-white p-5 rounded-2xl border border-gray-100 shadow-sm mb-3 active:bg-gray-50"
        >
            <View className="p-3 rounded-xl mr-4" style={{ backgroundColor: `${color}15` }}>
                <MaterialIcons name={icon} size={24} color={color} />
            </View>
            <View className="flex-1">
                <Text className="text-base font-bold text-gray-900">{title}</Text>
                <Text className="text-xs text-gray-700 mt-0.5">{desc}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#E5E7EB" />
        </Pressable>
    )
}
