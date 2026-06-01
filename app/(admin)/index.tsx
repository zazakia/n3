import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, RefreshControl, Pressable, SafeAreaView, StatusBar, Alert, Modal, Platform } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { database } from '../../src/database';
import { Q } from '@nozbe/watermelondb';
import Loan from '../../src/database/models/Loan';
import Payment from '../../src/database/models/Payment';
import PaymentSchedule from '../../src/database/models/PaymentSchedule';
import Borrower from '../../src/database/models/Borrower';
import LoanPenalty from '../../src/database/models/LoanPenalty';
import { CashService } from '../../src/services/CashService';
import { KpiCalculator } from '../../src/services/KpiCalculator';
import { SyncService } from '../../src/services/SyncService';
import { useSyncStore } from '../../src/stores/syncStore';
import { SyncStatusIndicator } from '../../src/components/SyncStatusIndicator';
import { PhpCurrencyText } from '../../src/components/PhpCurrencyText';
import { MaterialIcons } from '@expo/vector-icons';
import { MetricBreakdownDialog, BreakdownItem } from '../../src/components/MetricBreakdownDialog';
import { LinearGradient } from 'expo-linear-gradient';
import { differenceInDays, format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay } from 'date-fns';
import { AuthService } from '../../src/services/AuthService';
import { formatPHP } from '../../src/utils/currency';
import { useAuth } from '../../src/store/AuthContext';
import { LendingPerformanceChart } from '../../src/components/LendingPerformanceChart';
import { ReminderService, ReminderType } from '../../src/services/ReminderService';
import * as Linking from 'expo-linking';
import { SidebarContent } from '../../src/components/SidebarContent';
import { AnimatedPressable } from '../../src/components/AnimatedPressable';
import { MetricInfoDialog } from '../../src/components/MetricInfoDialog';

const METRIC_INFO: Record<string, { description: string; formula: string }> = {
    'Active Loans': {
        description: 'The number of loan accounts currently in repayment or defaulted status (excluding paid-off or cancelled loans).',
        formula: 'Count(Loans where status = "active" OR "defaulted")'
    },
    'Weekly Target': {
        description: 'The total amount scheduled for collection during the current week across all active loans.',
        formula: 'Sum(Active Loans.installmentAmount)'
    },
    'Outstanding': {
        description: 'The total remaining balance of all active and defaulted loans, including any unpaid penalties.',
        formula: 'Sum(Loan.totalAmount + Penalties - PaymentsReceived)'
    },
    'Total Disbursed': {
        description: 'The total principal amount released to borrowers since the system start (excluding cancelled loans).',
        formula: 'Sum(Principal where status IN ["active", "paid", "defaulted"])'
    },
    'Overdue (PAR>30)': {
        description: 'Portfolio at Risk (PAR) for accounts with at least one payment overdue by more than 30 days.',
        formula: 'Sum(Principal of Loans with >30 days overdue) / Total GLP'
    },
    'Collected Today': {
        description: 'Total cash received from loan repayments and fees during the current calendar day.',
        formula: 'Sum(Payment.amount where date = Today)'
    },
    'This Month': {
        description: 'Total cash received from payments during the current calendar month.',
        formula: 'Sum(Payment.amount where date in CurrentMonth)'
    },
    'Cash on Hand': {
        description: 'The total net cash currently available in the vault (Total Receipts minus Total Expenses/Disbursements).',
        formula: 'Current System Balance (CashBox)'
    },
    'Borrowers': {
        description: 'Total count of unique individuals registered as borrowers in the database.',
        formula: 'Count(All Borrowers)'
    },
    'Daily Portfolio': {
        description: 'Aggregated metrics for loans with a daily repayment frequency.',
        formula: 'Metrics where frequency = "daily"'
    },
    'Weekly Portfolio': {
        description: 'Aggregated metrics for loans with a weekly repayment frequency.',
        formula: 'Metrics where frequency = "weekly"'
    }
};


interface KpiCard {
    title: string;
    value: number;
    isCurrency: boolean;
    icon: keyof typeof MaterialIcons.glyphMap;
    iconBg: string;
    iconColor: string;
    onPress?: () => void;
    onInfoPress?: () => void;
}

type OverdueWatchlistItem = {
    scheduleId: string;
    loanId: string;
    borrowerId?: string;
    borrowerName: string;
    dueDate: Date | number;
    amountDue: number;
    overdueDays: number;
    loanBalance: number;
    phoneNumber?: string;
};

type AgingBucket = {
    label: string;
    min: number;
    max: number;
    amount: number;
    count: number;
    color: string;
};

const UNPAID_SCHEDULE_STATUSES = ['pending', 'partial', 'late'];

function groupByLoanId<T extends { loanId: string }>(records: T[]) {
    const grouped = new Map<string, T[]>();
    records.forEach(record => {
        const group = grouped.get(record.loanId);
        if (group) {
            group.push(record);
        } else {
            grouped.set(record.loanId, [record]);
        }
    });
    return grouped;
}

function getScheduleBalances(
    schedules: PaymentSchedule[],
    payments: Payment[],
    penalties: LoanPenalty[],
    now: Date
) {
    const sortedSchedules = [...schedules].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    const penaltyTotal = penalties.reduce((sum, penalty) => sum + penalty.amount, 0);
    let remainingPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);

    const balances = sortedSchedules.map(schedule => {
        const amount = schedule.scheduledAmount || 0;
        const paid = Math.min(remainingPaid, amount);
        remainingPaid -= paid;

        return {
            schedule,
            balance: Math.max(0, amount - paid),
            daysOverdue: differenceInDays(now, new Date(schedule.dueDate)),
        };
    });

    const remainingPenalty = Math.max(0, penaltyTotal - remainingPaid);
    if (remainingPenalty > 0) {
        const overdueBalances = balances.filter(balance => balance.daysOverdue > 0);
        const maxOverdue = overdueBalances.length > 0
            ? Math.max(...overdueBalances.map(balance => balance.daysOverdue))
            : 0;

        balances.push({
            schedule: { id: 'penalty', dueDate: now } as PaymentSchedule,
            balance: remainingPenalty,
            daysOverdue: maxOverdue,
        });
    }

    return balances;
}

function buildOverdueWatchlist(
    schedules: PaymentSchedule[],
    loansById: Map<string, Loan>,
    borrowersById: Map<string, Borrower>,
    paymentsByLoanId: Map<string, Payment[]>,
    penaltiesByLoanId: Map<string, LoanPenalty[]>,
    now: Date
): OverdueWatchlistItem[] {
    return schedules
        .filter(schedule => (
            UNPAID_SCHEDULE_STATUSES.includes(schedule.status)
            && new Date(schedule.dueDate).getTime() < now.getTime()
        ))
        .map(schedule => {
            const loan = loansById.get(schedule.loanId);
            const borrower = loan ? borrowersById.get(loan.borrowerId) : undefined;
            const loanPayments = paymentsByLoanId.get(schedule.loanId) ?? [];
            const loanPenalties = penaltiesByLoanId.get(schedule.loanId) ?? [];
            const paid = loanPayments.reduce((sum, payment) => sum + payment.amount, 0);
            const penaltyTotal = loanPenalties.reduce((sum, penalty) => sum + penalty.amount, 0);

            return {
                scheduleId: schedule.id,
                loanId: schedule.loanId,
                borrowerId: borrower?.id,
                borrowerName: borrower?.fullName || 'Unknown',
                dueDate: schedule.dueDate,
                amountDue: schedule.scheduledAmount,
                overdueDays: differenceInDays(now, new Date(schedule.dueDate)),
                loanBalance: Math.max(0, (loan?.totalAmount || 0) + penaltyTotal - paid),
                phoneNumber: borrower?.decryptedPhone,
            };
        })
        .sort((a, b) => b.overdueDays - a.overdueDays)
        .slice(0, 10);
}

function buildAgingBuckets(
    activeLoans: Loan[],
    schedulesByLoanId: Map<string, PaymentSchedule[]>,
    paymentsByLoanId: Map<string, Payment[]>,
    penaltiesByLoanId: Map<string, LoanPenalty[]>,
    now: Date
): AgingBucket[] {
    const buckets: AgingBucket[] = [
        { label: '1-7 Days', min: 1, max: 7, amount: 0, count: 0, color: '#3B82F6' },
        { label: '8-30 Days', min: 8, max: 30, amount: 0, count: 0, color: '#F59E0B' },
        { label: '31-60 Days', min: 31, max: 60, amount: 0, count: 0, color: '#EF4444' },
        { label: '61+ Days', min: 61, max: 9999, amount: 0, count: 0, color: '#991B1B' },
    ];

    activeLoans.forEach(loan => {
        const balances = getScheduleBalances(
            schedulesByLoanId.get(loan.id) ?? [],
            paymentsByLoanId.get(loan.id) ?? [],
            penaltiesByLoanId.get(loan.id) ?? [],
            now
        );
        const loanBuckets = new Set<AgingBucket>();

        balances.forEach(balance => {
            if (balance.balance <= 0) return;
            const bucket = buckets.find(candidate => balance.daysOverdue >= candidate.min && balance.daysOverdue <= candidate.max);
            if (!bucket) return;

            bucket.amount += balance.balance;
            loanBuckets.add(bucket);
        });

        loanBuckets.forEach(bucket => bucket.count++);
    });

    return buckets;
}

function KpiTile({ title, value, isCurrency, icon, iconBg, iconColor, onPress, onInfoPress }: KpiCard) {
    const C = onPress ? AnimatedPressable : View;
    return (
        <C
            className={`w-[48%] bg-white p-5 rounded-3xl shadow-sm border border-gray-50 mb-4 ${onPress ? 'active:bg-gray-50' : ''}`}
            onPress={onPress}
        >
            <View className="flex-row justify-between items-start mb-3">
                <View className={`w-10 h-10 rounded-2xl items-center justify-center ${iconBg}`}>
                    <MaterialIcons name={icon} size={20} color={iconColor} />
                </View>
                {onInfoPress && (
                    <Pressable 
                        onPress={onInfoPress}
                        className="p-1 -mr-1 rounded-full active:bg-gray-100"
                    >
                        <MaterialIcons name="info-outline" size={16} color="#9CA3AF" />
                    </Pressable>
                )}
            </View>
            <Text className="text-gray-700 text-[11px] font-bold uppercase tracking-wider" numberOfLines={1}>{title}</Text>
            {isCurrency
                ? <PhpCurrencyText amount={value} className="text-xl font-black text-gray-900 leading-tight" />
                : <Text className="text-2xl font-black text-gray-900 leading-tight">{value}</Text>
            }
        </C>
    );
}

function QuickActionBtn({ icon, label, onPress, bg, fg }: { icon: keyof typeof MaterialIcons.glyphMap; label: string; onPress: () => void; bg: string; fg: string }) {
    return (
        <AnimatedPressable 
            onPress={onPress} 
            className="items-center mr-4 w-20 active:opacity-80"
        >
            <View 
                className={`w-14 h-14 items-center justify-center rounded-2xl mb-2 shadow-lg ${bg === 'bg-white' ? 'bg-white' : bg}`}
                style={{
                    ...Platform.select({
                        web: {
                            boxShadow: '0 4px 8px 0 rgba(0, 0, 0, 0.1)',
                        },
                        default: {
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 4 },
                            shadowOpacity: 0.1,
                            shadowRadius: 8,
                            elevation: 5,
                        },
                    }),
                }}
            >
                <MaterialIcons name={icon} size={24} color={fg} />
            </View>
            <Text 
                className="font-bold text-[10px] text-center uppercase tracking-tight leading-tight" 
                style={{ color: bg === 'bg-white' ? '#FFFFFFCC' : fg }}
                numberOfLines={2}
            >
                {label}
            </Text>
        </AnimatedPressable>
    );
}

export default function AdminDashboardScreen() {
    const router = useRouter();
    const { user, role, signOut } = useAuth();
    const { status, progress } = useSyncStore();

    const [refreshing, setRefreshing] = useState(false);
    const [kpis, setKpis] = useState({
        activeLoansCount: 0, totalDisbursed: 0, collectedToday: 0,
        collectedMonth: 0, outstandingBalance: 0, overdueValue: 0,
        cashOnHand: 0, totalBorrowers: 0, weeklyTarget: 0,
        dailyActiveLoansCount: 0, weeklyActiveLoansCount: 0,
        dailyTotalDisbursed: 0, weeklyTotalDisbursed: 0,
    });
    const [recentPayments, setRecentPayments] = useState<any[]>([]);
    const [overdueWatchlist, setOverdueWatchlist] = useState<any[]>([]);
    const [performanceData, setPerformanceData] = useState<{ label: string; value: number }[]>([]);
    const [agingBuckets, setAgingBuckets] = useState<any[]>([]);

    const [dialogVisible, setDialogVisible] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [dialogData, setDialogData] = useState<{ title: string; total: number; isTotalCurrency: boolean; color: string; items: BreakdownItem[] }>({
        title: '', total: 0, isTotalCurrency: true, color: 'text-gray-900', items: []
    });

    const [infoVisible, setInfoVisible] = useState(false);
    const [infoData, setInfoData] = useState<{ title: string; value: number | string; isCurrency: boolean }>({
        title: '', value: 0, isCurrency: true
    });

    const overdueCount = overdueWatchlist.length;


    const loadData = async () => {
        try {
            const [loans, borrowers, cashOnHand] = await Promise.all([
                database.collections.get<Loan>('loans').query(Q.where('deleted_at', null)).fetch(),
                database.collections.get<Borrower>('borrowers').query(Q.where('deleted_at', null)).fetch(),
                CashService.getCurrentBalance(),
            ]);

            const activeLoans = loans.filter(l => l.status === 'active' || l.status === 'defaulted');
            const activeLoanIds = activeLoans.map(loan => loan.id);

            const [payments, schedules, penalties] = await Promise.all([
                database.collections.get<Payment>('payments').query(Q.where('deleted_at', null)).fetch(),
                activeLoanIds.length > 0
                    ? database.collections.get<PaymentSchedule>('payment_schedules').query(
                        Q.where('deleted_at', null),
                        Q.where('loan_id', Q.oneOf(activeLoanIds))
                    ).fetch()
                    : Promise.resolve([]),
                activeLoanIds.length > 0
                    ? database.collections.get<LoanPenalty>('loan_penalties').query(
                        Q.where('deleted_at', null),
                        Q.where('loan_id', Q.oneOf(activeLoanIds))
                    ).fetch()
                    : Promise.resolve([]),
            ]);

            const loansById = new Map(loans.map(loan => [loan.id, loan]));
            const borrowersById = new Map(borrowers.map(borrower => [borrower.id, borrower]));
            const paymentsByLoanId = groupByLoanId(payments);
            const schedulesByLoanId = groupByLoanId(schedules);
            const penaltiesByLoanId = groupByLoanId(penalties);

            const totalDisbursed = loans
                .filter(l => ['active', 'paid', 'defaulted'].includes(l.status))
                .reduce((sum, l) => sum + l.principalAmount, 0);

            const today = new Date();
            const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
            const endOfDay = startOfDay + 86400000;
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
            const startOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1).getTime();

            const collectedToday = payments
                .filter(payment => payment.paymentDate >= startOfDay && payment.paymentDate < endOfDay)
                .reduce((sum, payment) => sum + payment.amount, 0);

            const collectedMonth = payments
                .filter(payment => payment.paymentDate >= startOfMonth && payment.paymentDate < startOfNextMonth)
                .reduce((sum, payment) => sum + payment.amount, 0);

            const outstandingBalance = KpiCalculator.computeOutstandingBalance(activeLoans, payments, penalties);
            const { par, glp } = KpiCalculator.computePAR(loans, schedules, payments, 30);
            const overdueValue = (par / 100) * glp;

            const weeklyTarget = activeLoans.reduce((sum, l) => sum + l.installmentAmount, 0);

            const dailyActiveLoans = activeLoans.filter(l => l.frequency === 'daily');
            const weeklyActiveLoans = activeLoans.filter(l => l.frequency === 'weekly');

            const dailyClientsCount = new Set(dailyActiveLoans.map(l => l.borrowerId)).size;
            const weeklyClientsCount = new Set(weeklyActiveLoans.map(l => l.borrowerId)).size;

            const dailyTotalDisbursed = loans
                .filter(l => l.frequency === 'daily' && ['active', 'paid', 'defaulted'].includes(l.status))
                .reduce((sum, l) => sum + l.principalAmount, 0);

            const weeklyTotalDisbursed = loans
                .filter(l => l.frequency === 'weekly' && ['active', 'paid', 'defaulted'].includes(l.status))
                .reduce((sum, l) => sum + l.principalAmount, 0);

            setKpis({
                activeLoansCount: activeLoans.length,
                totalDisbursed, collectedToday, collectedMonth,
                outstandingBalance, overdueValue, cashOnHand,
                totalBorrowers: borrowers.length,
                weeklyTarget,
                dailyActiveLoansCount: dailyClientsCount,
                weeklyActiveLoansCount: weeklyClientsCount,
                dailyTotalDisbursed,
                weeklyTotalDisbursed,
            });

            // Calculate Performance Data (Collection vs Days of Week)
            const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
            const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
            const daysInWeek = eachDayOfInterval({ start: weekStart, end: weekEnd });

            const chartData = daysInWeek.map(day => {
                const dayPayments = payments.filter(p => isSameDay(new Date(p.paymentDate), day));
                return {
                    label: format(day, 'EEE'),
                    value: dayPayments.reduce((sum, p) => sum + p.amount, 0),
                };
            });
            setPerformanceData(chartData);

            setOverdueWatchlist(buildOverdueWatchlist(
                schedules,
                loansById,
                borrowersById,
                paymentsByLoanId,
                penaltiesByLoanId,
                today
            ));
            setAgingBuckets(buildAgingBuckets(
                activeLoans,
                schedulesByLoanId,
                paymentsByLoanId,
                penaltiesByLoanId,
                today
            ));

            const sorted = [...payments].sort((a, b) => b.paymentDate - a.paymentDate).slice(0, 8);
            setRecentPayments(sorted.map(p => {
                const loan = loansById.get(p.loanId);
                const borrower = loan ? borrowersById.get(loan.borrowerId) : undefined;
                return {
                    id: p.id, amount: p.amount,
                    date: new Date(p.paymentDate),
                    borrowerName: borrower?.fullName ?? 'Unknown',
                    loanNumber: loan?.loanNumber ?? '—',
                    borrowerId: borrower?.id,
                };
            }));
        } catch (e) {
            console.error('Failed to load admin data:', e);
        }
    };

    useFocusEffect(useCallback(() => { loadData(); }, [status]));

    const onRefresh = async () => {
        setRefreshing(true);
        if (status !== 'syncing') await SyncService.sync(true); // Forced on manual refresh
        await loadData();
        setRefreshing(false);
    };

    const handleActiveLoansClick = async () => {
        const loans = await database.collections.get<Loan>('loans').query(Q.where('status', 'active')).fetch();
        const borrowers = await database.collections.get<Borrower>('borrowers').query().fetch();
        setDialogData({
            title: 'Active Loans', total: loans.length, isTotalCurrency: false, color: 'text-blue-600',
            items: loans.map(l => ({
                id: l.id,
                label: borrowers.find(b => b.id === l.borrowerId)?.fullName ?? 'Unknown',
                sublabel: l.loanNumber, value: l.principalAmount, isCurrency: true,
            })),
        });
        setDialogVisible(true);
    };

    const kpiCards: KpiCard[] = [
        { title: 'Active Loans', value: kpis.activeLoansCount, isCurrency: false, icon: 'receipt-long', iconBg: 'bg-blue-100', iconColor: '#2563EB', onPress: handleActiveLoansClick },
        { title: 'Weekly Target', value: kpis.weeklyTarget, isCurrency: true, icon: 'calendar-today', iconBg: 'bg-orange-100', iconColor: '#EA580C', onPress: () => router.push('/(admin)/reports/collection') },
        { title: 'Outstanding', value: kpis.outstandingBalance, isCurrency: true, icon: 'monetization-on', iconBg: 'bg-emerald-100', iconColor: '#059669' },
        { title: 'Total Disbursed', value: kpis.totalDisbursed, isCurrency: true, icon: 'account-balance-wallet', iconBg: 'bg-purple-100', iconColor: '#9333EA' },
        { title: 'Overdue (PAR>30)', value: kpis.overdueValue, isCurrency: true, icon: 'warning', iconBg: 'bg-red-100', iconColor: '#DC2626' },
        { title: 'Collected Today', value: kpis.collectedToday, isCurrency: true, icon: 'today', iconBg: 'bg-amber-100', iconColor: '#D97706', onPress: () => router.push('/(admin)/reports/collection') },
        { title: 'This Month', value: kpis.collectedMonth, isCurrency: true, icon: 'date-range', iconBg: 'bg-orange-100', iconColor: '#EA580C', onPress: () => router.push('/(admin)/reports/collection') },
        { title: 'Cash on Hand', value: kpis.cashOnHand, isCurrency: true, icon: 'account-balance', iconBg: 'bg-sky-100', iconColor: '#0284C7', onPress: () => router.push('/(admin)/cash-on-hand') },
        { title: 'Borrowers', value: kpis.totalBorrowers, isCurrency: false, icon: 'people', iconBg: 'bg-teal-100', iconColor: '#0D9488', onPress: () => router.push('/(admin)/borrowers') },
    ];

    const showMetricInfo = (title: string, value: number | string, isCurrency: boolean) => {
        setInfoData({ title, value, isCurrency });
        setInfoVisible(true);
    };

    return (
        <SafeAreaView className="flex-1 bg-[#F8FAFC]">
            <StatusBar barStyle="light-content" />
            <ScrollView
                className="flex-1"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FFF" />}
                showsVerticalScrollIndicator={false}
            >
                {/* Gradient Header */}
                <LinearGradient
                    colors={['#1E3A5F', '#0F2540']}
                    className="pt-14 pb-28 px-6 rounded-b-[40px]"
                >
                    <View className="flex-row items-center justify-between mb-2">
                        <View>
                                <Text testID="admin-portal-title" data-testid="admin-portal-title" className="text-blue-200/70 text-xs font-bold uppercase tracking-[3px]">Admin Portal</Text>
                                <Text className="text-white text-3xl font-black mt-1">{user?.email?.split('@')[0] ?? 'Admin'}</Text>
                                <View className="flex-row items-center gap-2 mt-1">
                                    <Text className="text-white/80 text-xs">{format(new Date(), 'EEEE, MMMM d')}</Text>
                                    <View className="bg-blue-500/20 px-2 py-0.5 rounded-full border border-blue-500/30">
                                        <Text className="text-blue-300 text-[8px] font-bold uppercase">{role}</Text>
                                    </View>
                                </View>
                            </View>
                        <View className="items-end gap-2">
                            <SyncStatusIndicator />
                            <View className="flex-row items-center gap-2">
                                <Pressable
                                    onPress={() => router.push('/(admin)/reports/mfi-kpis')}
                                    className="p-2.5 bg-white/10 rounded-2xl active:bg-white/20 border border-white/10 relative"
                                >
                                    <MaterialIcons name="notifications-none" size={18} color="#FFF" />
                                    {overdueCount > 0 && (
                                        <View className="absolute -top-1 -right-1 bg-red-500 rounded-full w-4 h-4 items-center justify-center">
                                            <Text className="text-white text-[9px] font-black">{overdueCount > 9 ? '9+' : overdueCount}</Text>
                                        </View>
                                    )}
                                </Pressable>
                                <Pressable
                                    onPress={() => setDrawerOpen(true)}
                                    className="p-2.5 bg-white/10 rounded-2xl active:bg-white/20 border border-white/10 lg:hidden"
                                >
                                    <MaterialIcons name="menu" size={18} color="#FFF" />
                                </Pressable>
                                <Pressable
                                    testID="logout-button"
                                    onPress={signOut}
                                    className="p-2.5 bg-white/10 rounded-2xl active:bg-white/20 border border-white/10"
                                >
                                    <MaterialIcons name="logout" size={18} color="#FFF" />
                                </Pressable>
                            </View>
                        </View>
                    </View>
                </LinearGradient>

                {/* Quick Actions */}
                <View className="px-6 -mt-16 mb-4">
                    <ScrollView 
                        horizontal 
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ paddingRight: 24, paddingBottom: 20 }}
                    >
                        <QuickActionBtn onPress={() => router.push('/(admin)/remittances')} icon="account-balance" label="Review Remits" bg="bg-slate-800" fg="#FFF" />
                        <QuickActionBtn onPress={() => router.push('/(admin)/reports/financial-summary')} icon="assessment" label="Summary" bg="bg-emerald-600" fg="#FFF" />
                        <QuickActionBtn onPress={() => router.push('/(admin)/loans/new')} icon="add-circle" label="New Loan" bg="bg-blue-600" fg="#FFF" />
                        <QuickActionBtn onPress={() => router.push('/(admin)/borrowers')} icon="person-add" label="New Borrower" bg="bg-white" fg="#2563EB" />
                        <QuickActionBtn onPress={() => router.push('/(admin)/payments')} icon="payments" label="Record Payment" bg="bg-white" fg="#059669" />
                        <QuickActionBtn onPress={() => router.push('/(admin)/expenses')} icon="receipt-long" label="Add Expense" bg="bg-white" fg="#9333EA" />
                        <QuickActionBtn onPress={() => router.push('/(admin)/reports/expenses')} icon="pie-chart" label="Expense Report" bg="bg-white" fg="#7B1FA2" />
                        <QuickActionBtn onPress={() => router.push('/(admin)/reports/disbursements')} icon="outbox" label="Disbursements" bg="bg-white" fg="#F9A825" />
                        <QuickActionBtn onPress={() => router.push('/(admin)/reports/collector-efficiency')} icon="trending-up" label="Efficiency" bg="bg-white" fg="#059669" />
                        <QuickActionBtn onPress={() => router.push('/(admin)/cash-on-hand')} icon="account-balance-wallet" label="Cash Box" bg="bg-white" fg="#D97706" />
                    </ScrollView>
                </View>

                {/* KPI Grid */}
                <View className="px-6 -mt-10">
                    <View className="flex-row flex-wrap justify-between">
                        {kpiCards.map(card => (
                            <KpiTile 
                                key={card.title} 
                                {...card} 
                                onInfoPress={() => showMetricInfo(card.title, card.value, card.isCurrency)}
                            />
                        ))}
                    </View>
                </View>

                {/* Portfolio Breakdown */}
                <View className="px-6 mt-4">
                    <View className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm mb-6">
                        <View className="mb-4">
                            <Text className="text-gray-900 font-black text-xl">Portfolio Breakdown</Text>
                            <Text className="text-gray-700 text-xs font-bold mt-1 uppercase tracking-wider">Daily vs Weekly Metrics</Text>
                        </View>

                        <View className="flex-row justify-between">
                            {/* Daily Column */}
                            <View className="w-[49%] bg-blue-50/50 p-4 rounded-2xl border border-blue-100">
                                <View className="flex-row items-center mb-2">
                                    <View className="w-8 h-8 rounded-xl bg-blue-100 items-center justify-center mr-2">
                                        <MaterialIcons name="wb-sunny" size={16} color="#2563EB" />
                                    </View>
                                    <Text className="text-blue-900 font-black text-sm">Daily</Text>
                                    <Pressable 
                                        onPress={() => showMetricInfo('Daily Portfolio', kpis.dailyTotalDisbursed + kpis.dailyActiveLoansCount, false)}
                                        className="ml-auto p-1"
                                    >
                                        <MaterialIcons name="info-outline" size={14} color="#3B82F6" />
                                    </Pressable>
                                </View>
                                <View className="mt-1">
                                    <Text className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">Total Disbursed</Text>
                                    <PhpCurrencyText amount={kpis.dailyTotalDisbursed} className="text-lg font-black text-blue-900" />
                                </View>
                                <View className="mt-3">
                                    <Text className="text-[10px] text-blue-400 font-bold uppercase tracking-wider">Active Clients</Text>
                                    <Text className="text-xl font-black text-blue-900">{kpis.dailyActiveLoansCount}</Text>
                                </View>
                            </View>

                            {/* Weekly Column */}
                            <View className="w-[49%] bg-purple-50/50 p-4 rounded-2xl border border-purple-100">
                                <View className="flex-row items-center mb-2">
                                    <View className="w-8 h-8 rounded-xl bg-purple-100 items-center justify-center mr-2">
                                        <MaterialIcons name="calendar-view-week" size={16} color="#9333EA" />
                                    </View>
                                    <Text className="text-purple-900 font-black text-sm">Weekly</Text>
                                    <Pressable 
                                        onPress={() => showMetricInfo('Weekly Portfolio', kpis.weeklyTotalDisbursed + kpis.weeklyActiveLoansCount, false)}
                                        className="ml-auto p-1"
                                    >
                                        <MaterialIcons name="info-outline" size={14} color="#A855F7" />
                                    </Pressable>
                                </View>
                                <View className="mt-1">
                                    <Text className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">Total Disbursed</Text>
                                    <PhpCurrencyText amount={kpis.weeklyTotalDisbursed} className="text-lg font-black text-purple-900" />
                                </View>
                                <View className="mt-3">
                                    <Text className="text-[10px] text-purple-400 font-bold uppercase tracking-wider">Active Clients</Text>
                                    <Text className="text-xl font-black text-purple-900">{kpis.weeklyActiveLoansCount}</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                </View>

                {/* Lending Performance Chart */}
                <View className="px-6 mt-4">
                    <LendingPerformanceChart 
                        data={performanceData} 
                        title="Collection Trend" 
                        subtitle="This Week's Daily Collections" 
                    />
                </View>

                {/* Portfolio Aging Breakdown */}
                <View className="px-6 mt-4">
                    <View className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm mb-6">
                        <View className="mb-4">
                            <Text className="text-gray-900 font-black text-xl">Portfolio Aging</Text>
                            <Text className="text-gray-700 text-xs font-bold mt-1 uppercase tracking-wider">PAR Buckets Breakdown</Text>
                        </View>
                        
                        <View className="flex-row h-3 rounded-full overflow-hidden mb-6 bg-gray-50">
                            {agingBuckets.map((bucket, bIdx) => {
                                const totalOverdue = agingBuckets.reduce((s, b) => s + b.amount, 0);
                                const percentage = totalOverdue > 0 ? (bucket.amount / totalOverdue) * 100 : 0;
                                if (percentage === 0) return null;
                                return (
                                    <View key={bucket.label} style={{ width: `${percentage}%`, backgroundColor: bucket.color }} />
                                );
                            })}
                        </View>

                        <View className="flex-row flex-wrap justify-between">
                            {agingBuckets.map(bucket => (
                                <View key={bucket.label} className="w-[48%] flex-row items-center mb-4">
                                    <View style={{ backgroundColor: bucket.color }} className="w-2.5 h-2.5 rounded-full mr-2" />
                                    <View>
                                        <Text className="text-gray-700 font-bold text-[10px] uppercase">{bucket.label}</Text>
                                        <Text className="text-gray-900 font-black text-sm">{formatPHP(bucket.amount)}</Text>
                                        <Text className="text-[9px] text-gray-700 font-medium">{bucket.count} loans</Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>
                </View>

                {/* Overdue Watchlist */}
                {overdueWatchlist.length > 0 && (
                    <View className="px-6 mb-4">
                        <View className="mb-4">
                            <Text className="text-gray-900 font-black text-2xl">Overdue Watchlist</Text>
                            <View className="h-1.5 w-12 bg-red-600 rounded-full mt-1" />
                        </View>
                        <View className="bg-white rounded-[32px] border border-red-100 overflow-hidden">
                            {overdueWatchlist.map((item, idx) => (
                                <View key={item.scheduleId} className={`flex-row items-center px-5 py-4 ${idx < overdueWatchlist.length - 1 ? 'border-b border-red-50' : ''}`}>
                                    <View className="bg-red-50 w-10 h-10 rounded-2xl items-center justify-center mr-4">
                                        <MaterialIcons name="warning" size={18} color="#DC2626" />
                                    </View>
                                    <View className="flex-1">
                                        <AnimatedPressable onPress={() => item.borrowerId && router.push(`/(admin)/borrowers/${item.borrowerId}`)}>
                                            <Text className="font-bold text-blue-700 underline">{item.borrowerName}</Text>
                                        </AnimatedPressable>
                                        <Text className="text-xs text-red-500 font-bold">{item.overdueDays} days overdue</Text>
                                        <Text className="text-[10px] text-gray-700 mt-0.5">Balance: {formatPHP(item.loanBalance)}</Text>
                                    </View>
                                    <View className="items-end">
                                        <Text className="font-black text-gray-900">{formatPHP(item.amountDue)}</Text>
                                        <View className="flex-row mt-2 gap-2">
                                            <AnimatedPressable 
                                                className="bg-gray-100 px-3 py-1.5 rounded-full active:bg-gray-200"
                                                onPress={() => {
                                                    if (item.phoneNumber) {
                                                        import('react-native').then(({ Linking }) => {
                                                            Linking.openURL(`tel:${item.phoneNumber}`);
                                                        });
                                                    } else {
                                                        Alert.alert("Error", "No phone number available for this borrower.");
                                                    }
                                                }}
                                            >
                                                <MaterialIcons name="call" size={14} color="#4B5563" />
                                            </AnimatedPressable>
                                            <AnimatedPressable 
                                                className="bg-blue-600 px-3 py-1.5 rounded-full active:bg-blue-700"
                                                onPress={() => {
                                                    if (item.phoneNumber) {
                                                        const type: ReminderType = item.overdueDays > 7 ? 'overdue' : 'friendly';
                                                        const url = ReminderService.generateSmsLink(type, {
                                                            borrowerName: item.borrowerName,
                                                            amountDue: item.amountDue,
                                                            dueDate: item.dueDate,
                                                            phoneNumber: item.phoneNumber
                                                        });
                                                        if (url) import('react-native').then(({ Linking }) => Linking.openURL(url));
                                                    } else {
                                                        Alert.alert("Error", "No phone number available.");
                                                    }
                                                }}
                                            >
                                                <MaterialIcons name="sms" size={14} color="#fff" />
                                            </AnimatedPressable>
                                            <AnimatedPressable 
                                                className="bg-green-600 px-3 py-1.5 rounded-full active:bg-green-700"
                                                onPress={() => {
                                                    if (item.phoneNumber) {
                                                        const type: ReminderType = item.overdueDays > 7 ? 'overdue' : 'friendly';
                                                        const url = ReminderService.generateWhatsAppLink(type, {
                                                            borrowerName: item.borrowerName,
                                                            amountDue: item.amountDue,
                                                            dueDate: item.dueDate,
                                                            phoneNumber: item.phoneNumber
                                                        });
                                                        if (url) import('react-native').then(({ Linking }) => Linking.openURL(url));
                                                    } else {
                                                        Alert.alert("Error", "No phone number available.");
                                                    }
                                                }}
                                            >
                                                <MaterialIcons name="chat" size={14} color="#fff" />
                                            </AnimatedPressable>
                                            <AnimatedPressable 
                                                className="bg-red-600 px-4 py-1.5 rounded-full active:bg-red-700 flex-row items-center"
                                                onPress={() => router.push(`/(admin)/payments/new?loanId=${item.loanId}`)}
                                            >
                                                <MaterialIcons name="payments" size={14} color="#fff" className="mr-1" />
                                                <Text className="text-white text-[10px] font-black uppercase">Collect</Text>
                                            </AnimatedPressable>
                                        </View>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* Recent Payments */}
                <View className="px-6 mt-4 mb-4 flex-row justify-between items-center">
                    <View>
                        <Text className="text-gray-900 font-black text-2xl">Recent Payments</Text>
                        <View className="h-1.5 w-12 bg-blue-600 rounded-full mt-1" />
                    </View>
                    <Pressable onPress={() => router.push('/(admin)/payments')} className="px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100">
                        <Text className="text-blue-600 text-xs font-bold uppercase">View All</Text>
                    </Pressable>
                </View>

                <View className="px-6 pb-12">
                    <View className="bg-white rounded-3xl border border-gray-100">
                        {recentPayments.length === 0 ? (
                            <View className="p-10 items-center">
                                <MaterialIcons name="receipt" size={40} color="#D1D5DB" />
                                <Text className="text-gray-700 font-semibold mt-3">No recent payments</Text>
                            </View>
                        ) : (
                            recentPayments.map((p, idx) => (
                                <View key={p.id} className={`flex-row items-center px-5 py-4 ${idx < recentPayments.length - 1 ? 'border-b border-gray-50' : ''}`}>
                                    <View className="bg-emerald-50 w-10 h-10 rounded-2xl items-center justify-center mr-4">
                                        <MaterialIcons name="check" size={18} color="#059669" />
                                    </View>
                                    <View className="flex-1">
                                        <AnimatedPressable onPress={() => p.borrowerId && router.push(`/(admin)/borrowers/${p.borrowerId}`)}>
                                            <Text className="font-bold text-blue-700 leading-tight underline">{p.borrowerName}</Text>
                                        </AnimatedPressable>
                                        <Text className="text-xs text-gray-700 mt-0.5">{p.loanNumber} - {format(p.date, 'MMM d, yyyy')}</Text>
                                    </View>
                                    <Text className="font-black text-gray-900">{formatPHP(p.amount)}</Text>
                                </View>
                            ))
                        )}
                    </View>
                </View>
            </ScrollView>

            <MetricBreakdownDialog
                visible={dialogVisible}
                onClose={() => setDialogVisible(false)}
                {...dialogData}
            />

            <MetricInfoDialog
                visible={infoVisible}
                onClose={() => setInfoVisible(false)}
                title={infoData.title}
                value={infoData.value}
                isCurrency={infoData.isCurrency}
                description={METRIC_INFO[infoData.title]?.description ?? 'No description available.'}
                formula={METRIC_INFO[infoData.title]?.formula ?? 'Formula not specified.'}
            />

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
                        {/* SidebarContent needs to be accessible here, or redundant content */}
                        <SidebarContent onClose={() => setDrawerOpen(false)} />
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}
