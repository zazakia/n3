import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { database } from '../../../src/database';
import { Q } from '@nozbe/watermelondb';
import Payment from '../../../src/database/models/Payment';
import Expense from '../../../src/database/models/Expense';
import Remittance from '../../../src/database/models/Remittance';
import UserProfile from '../../../src/database/models/UserProfile';
import { CashService } from '../../../src/services/CashService';
import { MaterialIcons } from '@expo/vector-icons';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { ReportInfoModal, InfoModalContent, InfoIcon } from '../../../src/components/ReportInfoModal';
import { AccountingBasisToggle } from '../../../src/components/AccountingBasisToggle';
import { useAppStore } from '../../../src/store/useAppStore';
import { MfiKpiService } from '../../../src/services/MfiKpiService';
import { PrintButton } from '../../../src/components/PrintButton';
import { PdfGenerator } from '../../../src/services/PdfGenerator';

const formatPHP = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
        style: 'currency',
        currency: 'PHP',
    }).format(amount);
};

export default function FinancialSummaryScreen() {
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState({
        totalIncome: 0,
        totalExpenses: 0,
        netProfit: 0,
        expenseCount: 0,
        paymentCount: 0,
        inTransit: 0,
        totalRemitted: 0,
        realizedProfit: 0,
        oss: 0,
        loanLossProvisions: 0,
        cycleRecoveryRate: [] as Array<{cycle: string, recoveryRate: number, disbursed: number, collected: number}>
    });
    const [selectedMonth, setSelectedMonth] = useState(new Date());
    const [infoContent, setInfoContent] = useState<InfoModalContent | null>(null);

    const { accountingBasis } = useAppStore();
    const isCashBasis = accountingBasis === 'cash';

    const fetchData = async () => {
        setLoading(true);
        try {
            const start = startOfMonth(selectedMonth).getTime();
            const end = endOfMonth(selectedMonth).getTime();

            // Payments in the selected month
            const payments = await database.collections.get<Payment>('payments')
                .query(
                    Q.where('deleted_at', Q.eq(null)),
                    Q.where('payment_date', Q.between(start, end))
                )
                .fetch();

            const expenses = await database.collections.get<Expense>('expenses')
                .query(Q.where('expense_date', Q.between(start, end)))
                .fetch();

            // Remitted Cash (Physical cash flow basis)
            const remittances = await database.collections.get<Remittance>('remittances')
                .query(
                    Q.where('status', 'approved'),
                    Q.where('remittance_date', Q.between(start, end))
                ).fetch();

            // Gross collections = sum of all payment amounts (same under both bases for this summary)
            const grossCollections = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
            const totalRemitted = remittances.reduce((sum, r) => sum + (r.amount || 0), 0);
            const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

            // In Transit (point-in-time, same under both bases)
            const allUsers = await database.collections.get<UserProfile>('user_profiles').query().fetch();
            let inTransit = 0;
            for (const u of allUsers.filter(usr => usr.role === 'collector')) {
                inTransit += await CashService.getCollectorBalance(u.id);
            }

            const incomeStmt = await MfiKpiService.getIncomeStatement(start, end, accountingBasis);

            setSummary({
                totalIncome: incomeStmt ? incomeStmt.totalGrossIncome : grossCollections,
                totalRemitted,
                totalExpenses: incomeStmt ? incomeStmt.operatingExpenses : totalExpenses,
                inTransit,
                netProfit: incomeStmt ? incomeStmt.netIncome : grossCollections - totalExpenses,
                realizedProfit: totalRemitted - totalExpenses,
                expenseCount: expenses.length,
                paymentCount: payments.length,
                oss: incomeStmt ? incomeStmt.oss : 0,
                loanLossProvisions: incomeStmt ? incomeStmt.loanLossProvisions : 0,
                cycleRecoveryRate: incomeStmt ? incomeStmt.cycleRecoveryRate : []
            });
        } catch (error) {
            console.error('Failed to load financial summary:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [selectedMonth, accountingBasis]);

    const changeMonth = (delta: number) => {
        const next = new Date(selectedMonth);
        next.setMonth(next.getMonth() + delta);
        setSelectedMonth(next);
    };

    return (
        <View className="flex-1 bg-slate-50">
            <Stack.Screen options={{
                headerShown: true,
                title: 'Financial Summary',
                headerTransparent: true,
                headerTintColor: '#FFF',
                headerRight: () => (
                    <PrintButton
                        onPrint={async () => {
                            await PdfGenerator.generateGenericReport({
                                title: 'Financial Summary',
                                subtitle: `Reporting Period: ${format(selectedMonth, 'MMMM yyyy')} (${isCashBasis ? 'Cash Basis' : 'Accrual Basis'})`,
                                headers: ['Metric', 'Value'],
                                data: [
                                    ['Total Income', formatPHP(summary.totalIncome)],
                                    ['Operating Expenses', formatPHP(summary.totalExpenses)],
                                    ['Loan Loss Provisions', formatPHP(summary.loanLossProvisions)],
                                    ['Net Monthly Profit', formatPHP(summary.netProfit)],
                                    ['Realized Profit', formatPHP(summary.realizedProfit)],
                                    ['In Transit (Collectors)', formatPHP(summary.inTransit)],
                                    ['Total Remitted', formatPHP(summary.totalRemitted)],
                                    ['Operational Self-Sufficiency', `${(summary.oss * 100).toFixed(1)}%`]
                                ],
                                summaryBoxes: []
                            });
                        }}
                        compact
                    />
                )
            }} />

            <View className="bg-slate-900 pt-24 pb-12 px-6 rounded-b-[40px] shadow-2xl">
                {/* Month navigator */}
                <View className="flex-row items-center justify-between mb-6">
                    <Pressable onPress={() => changeMonth(-1)} className="p-2 bg-white/10 rounded-full">
                        <MaterialIcons name="chevron-left" size={24} color="#FFF" />
                    </Pressable>
                    <View className="items-center">
                        <Text className="text-slate-400 text-xs font-bold uppercase tracking-[3px]">Reporting Period</Text>
                        <Text className="text-white text-2xl font-black mt-1">{format(selectedMonth, 'MMMM yyyy')}</Text>
                    </View>
                    <Pressable onPress={() => changeMonth(1)} className="p-2 bg-white/10 rounded-full">
                        <MaterialIcons name="chevron-right" size={24} color="#FFF" />
                    </Pressable>
                </View>

                {/* Accounting Basis Toggle — sits prominently in header */}
                <View className="flex-row items-center justify-between mb-5">
                    <View>
                        <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">Accounting Basis</Text>
                        <Text className="text-slate-500 text-[11px]">
                            {isCashBasis ? 'Cash received view' : 'Proportional accrual (MFI standard)'}
                        </Text>
                    </View>
                    <AccountingBasisToggle compact />
                </View>

                {/* Net Monthly Performance */}
                <View className="bg-white/5 p-6 rounded-3xl border border-white/10">
                    <View className="flex-row items-center justify-between">
                        <View className="flex-row items-center">
                            <Text className="text-white/90 text-sm font-medium mr-1">
                                {isCashBasis ? 'Net Cash Performance' : 'Net Monthly Performance'}
                            </Text>
                            <InfoIcon color="#FFFFFF80" onPress={() => setInfoContent({
                                title: isCashBasis ? 'Net Cash Performance' : 'Net Monthly Performance',
                                question: isCashBasis
                                    ? 'Based on actual cash collected from borrowers, what did we earn this month?'
                                    : 'Did the business actually make money this month on an accrual basis?',
                                formula: 'Gross Collections - Total Expenses',
                                explanation: isCashBasis
                                    ? 'Cash basis: counts all cash received from borrowers (principal + interest) minus operating expenses. Shows raw cash performance.'
                                    : 'This metric shows how profitable the business was during the month, assuming all payments collected are recognized as revenue.',
                            })} />
                        </View>
                        {/* Basis badge */}
                        <View
                            style={{
                                backgroundColor: isCashBasis ? '#065F4620' : '#4338CA20',
                                borderRadius: 8,
                                paddingHorizontal: 8,
                                paddingVertical: 3,
                            }}
                        >
                            <Text style={{ fontSize: 10, fontWeight: '800', color: isCashBasis ? '#6EE7B7' : '#A5B4FC' }}>
                                {isCashBasis ? '● CASH' : '● ACCRUAL'}
                            </Text>
                        </View>
                    </View>

                    
                    <View className="flex-row items-baseline mt-3 justify-between">
                        <Text className={`text-4xl font-black ${summary.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {formatPHP(summary.netProfit)}
                        </Text>
                        <View className="items-end bg-slate-800 px-4 py-2 rounded-2xl">
                            <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">OSS</Text>
                            <Text className={`text-xl font-black ${summary.oss >= 100 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {summary.oss.toFixed(1)}%
                            </Text>
                        </View>
                    </View>
                    
                    {!isCashBasis && summary.loanLossProvisions > 0 && (
                        <View className="mt-4 pt-4 border-t border-white/10 flex-row justify-between items-center">
                            <View className="flex-row items-center">
                                <MaterialIcons name="security" size={14} color="#94A3B8" style={{ marginRight: 6 }} />
                                <Text className="text-slate-400 text-xs font-medium">Loan Loss Provision Deduction</Text>
                            </View>
                            <Text className="text-rose-400 font-bold text-sm">-{formatPHP(summary.loanLossProvisions)}</Text>
                        </View>
                    )}
                </View>
            </View>

            <ScrollView className="flex-1 px-6 bg-slate-50" showsVerticalScrollIndicator={false}>
                <View className="h-4" />

                {/* Three quick stat cards */}
                <View className="flex-row justify-between mb-6">
                    <View className="w-[31%] bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
                        <View className="flex-row items-center mb-1">
                            <Text className="text-slate-700 text-[8px] font-bold uppercase tracking-wider">In Transit</Text>
                            <InfoIcon onPress={() => setInfoContent({
                                title: 'Collection In Transit',
                                question: 'How much cash is currently held by collectors and not yet remitted to the main branch?',
                                formula: 'Sum of all unremitted cash across all collectors',
                                explanation: 'This cash has been collected from borrowers but has not yet been physically deposited or transferred to the admin.',
                            })} />
                        </View>
                        <Text className="text-slate-900 text-sm font-black text-orange-600">{formatPHP(summary.inTransit)}</Text>
                    </View>
                    <View className="w-[31%] bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
                        <View className="flex-row items-center mb-1">
                            <Text className="text-slate-700 text-[8px] font-bold uppercase tracking-wider">Remitted</Text>
                            <InfoIcon onPress={() => setInfoContent({
                                title: 'Remitted Cash',
                                question: 'How much cash was actually handed over to the admin this month?',
                                formula: 'Sum of all approved remittances matching the current month',
                                explanation: 'This determines your actual physical cash inflow for the month.',
                            })} />
                        </View>
                        <Text className="text-slate-900 text-sm font-black text-blue-600">{formatPHP(summary.totalRemitted)}</Text>
                    </View>
                    <View className="w-[31%] bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
                        <View className="flex-row items-center mb-1">
                            <Text className="text-slate-700 text-[8px] font-bold uppercase tracking-wider">Realized Net</Text>
                            <InfoIcon onPress={() => setInfoContent({
                                title: 'Realized Net Profit',
                                question: 'Based purely on cash handed to admin, did we make a profit?',
                                formula: 'Total Remitted - Total Expenses',
                                explanation: 'Because collectors might hold onto "In Transit" cash, this represents the true liquidity increase to the main branch.',
                            })} />
                        </View>
                        <Text className={`text-sm font-black ${summary.realizedProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {formatPHP(summary.realizedProfit)}
                        </Text>
                    </View>
                </View>

                {/* Main two cards */}
                <View className="flex-row justify-between mb-6">
                    <View className="w-[48%] bg-white p-5 rounded-[32px] shadow-sm border border-slate-100">
                        <View className="bg-emerald-100 w-10 h-10 rounded-2xl items-center justify-center mb-3">
                            <MaterialIcons name="trending-up" size={20} color="#059669" />
                        </View>
                        <View className="flex-row items-center">
                            <Text className="text-slate-700 text-[10px] font-bold uppercase tracking-wider">
                                {isCashBasis ? 'Gross Collections' : 'Gross Interest'}
                            </Text>
                            <InfoIcon onPress={() => setInfoContent({
                                title: isCashBasis ? 'Gross Cash Collections' : 'Gross Interest Collected',
                                question: isCashBasis
                                    ? 'How much total cash (principal + interest) did borrowers pay this month?'
                                    : 'How much total money (principal + interest) did borrowers pay this month?',
                                formula: 'Sum of all payments made during this reporting period',
                                explanation: isCashBasis
                                    ? 'Cash basis: counts the full amount of every payment received — includes both principal repayment and interest income.'
                                    : 'This includes both the return of capital (principal) and the earnings (interest).',
                            })} />
                        </View>
                        <Text className="text-slate-900 text-lg font-black mt-1">{formatPHP(summary.totalIncome)}</Text>
                        <Text className="text-slate-700 text-[9px] mt-1">{summary.paymentCount} payments</Text>
                        {isCashBasis && (
                            <Text style={{ color: '#059669', fontSize: 9, fontWeight: '700', marginTop: 2 }}>● Cash Basis</Text>
                        )}
                    </View>

                    <View className="w-[48%] bg-white p-5 rounded-[32px] shadow-sm border border-slate-100">
                        <View className="bg-rose-100 w-10 h-10 rounded-2xl items-center justify-center mb-3">
                            <MaterialIcons name="trending-down" size={20} color="#E11D48" />
                        </View>
                        <View className="flex-row items-center">
                            <Text className="text-slate-700 text-[10px] font-bold uppercase tracking-wider">Total Expenses</Text>
                            <InfoIcon onPress={() => setInfoContent({
                                title: 'Total Expenses',
                                question: 'How much did we spend on operational costs this month?',
                                formula: 'Sum of all expenses recorded during this month',
                                explanation: 'Includes salaries, rent, utilities, marketing, and other overhead costs.',
                            })} />
                        </View>
                        <Text className="text-slate-900 text-lg font-black mt-1">{formatPHP(summary.totalExpenses)}</Text>
                        <Text className="text-slate-700 text-[9px] mt-1">{summary.expenseCount} entries</Text>
                    </View>
                </View>

                {/* Performance Highlights */}
                <View className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 mb-6">
                    <Text className="text-slate-900 font-black text-lg mb-4">Performance Highlights</Text>

                    <View className="space-y-4">
                        <View className="flex-row items-center justify-between py-2 border-b border-slate-50">
                            <View className="flex-row items-center">
                                <MaterialIcons name="local-shipping" size={20} color="#EA580C" style={{ marginRight: 12 }} />
                                <Text className="text-slate-600 font-medium">Collection in Transit</Text>
                            </View>
                            <Text className="text-slate-900 font-bold">{formatPHP(summary.inTransit)}</Text>
                        </View>

                        <View className="flex-row items-center justify-between py-2 border-b border-slate-50">
                            <View className="flex-row items-center">
                                <MaterialIcons name="account-balance-wallet" size={20} color="#2563EB" style={{ marginRight: 12 }} />
                                <Text className="text-slate-600 font-medium">Realized Monthly Net</Text>
                            </View>
                            <Text className={`font-bold ${summary.realizedProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {formatPHP(summary.realizedProfit)}
                            </Text>
                        </View>

                        <View className="flex-row items-center justify-between py-2 border-b border-slate-50">
                            <View className="flex-row items-center">
                                <MaterialIcons name="account-balance" size={20} color="#64748B" style={{ marginRight: 12 }} />
                                <Text className="text-slate-600 font-medium">Average per Payment</Text>
                            </View>
                            <Text className="text-slate-900 font-bold">
                                {summary.paymentCount > 0 ? formatPHP(summary.totalIncome / summary.paymentCount) : formatPHP(0)}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Cycle Recovery Rate Chart */}
                {summary.cycleRecoveryRate && summary.cycleRecoveryRate.length > 0 && (
                    <View className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-100 mb-6">
                        <View className="mb-4">
                            <Text className="text-slate-900 font-black text-lg">Cycle Recovery Rate</Text>
                            <Text className="text-slate-500 text-xs">Principal collected vs disbursed by release month</Text>
                        </View>
                        <View className="space-y-4">
                            {summary.cycleRecoveryRate.slice(0, 5).map((cycle) => (
                                <View key={cycle.cycle} className="mb-2">
                                    <View className="flex-row justify-between mb-1">
                                        <Text className="text-slate-700 font-bold">{format(new Date(cycle.cycle + '-01'), 'MMMM yyyy')}</Text>
                                        <Text className={`font-black ${cycle.recoveryRate >= 100 ? 'text-emerald-600' : 'text-blue-600'}`}>
                                            {cycle.recoveryRate.toFixed(1)}%
                                        </Text>
                                    </View>
                                    <View className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <View 
                                            className={`h-full ${cycle.recoveryRate >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} 
                                            style={{ width: `${Math.min(100, cycle.recoveryRate)}%` }} 
                                        />
                                    </View>
                                    <View className="flex-row justify-between mt-1">
                                        <Text className="text-[10px] text-slate-500">Collected: {formatPHP(cycle.collected)}</Text>
                                        <Text className="text-[10px] text-slate-500">Disbursed: {formatPHP(cycle.disbursed)}</Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {loading && (
                    <View className="flex-row items-center justify-center py-8">
                        <ActivityIndicator color="#0F172A" />
                        <Text className="ml-3 text-slate-700 font-medium">Crunching numbers...</Text>
                    </View>
                )}

                <View className="h-12" />
            </ScrollView>

            <ReportInfoModal
                visible={!!infoContent}
                content={infoContent}
                onClose={() => setInfoContent(null)}
            />
        </View>
    );
}
