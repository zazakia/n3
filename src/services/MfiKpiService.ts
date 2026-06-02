import Loan from '../database/models/Loan';
import Payment from '../database/models/Payment';
import PaymentSchedule from '../database/models/PaymentSchedule';
import Expense from '../database/models/Expense';
import Remittance from '../database/models/Remittance';
import FinancialSnapshot from '../database/models/FinancialSnapshot';
import Collector from '../database/models/Collector';
import Borrower from '../database/models/Borrower';
import SavingsTransaction from '../database/models/SavingsTransaction';
import LoanPenalty from '../database/models/LoanPenalty';
import { CashService } from './CashService';
import { differenceInDays, format } from 'date-fns';
import { database } from '../database';
import { Q } from '@nozbe/watermelondb';
import { KpiCalculator } from './KpiCalculator';

export interface MfiKpiData {
    portfolioAtRisk: number;
    collectionEfficiency: number;
    totalActiveLoans: number;
    totalOutstandingPrincipal: number;
    oss: number;
    fss: number;
    oer: number;
}

export class MfiKpiService {
    constructor(private db = database) {}

    private static defaultInstance = new MfiKpiService();

    static async getKpiSummary(): Promise<MfiKpiData> {
        return this.defaultInstance.getKpiSummary();
    }

    static async getOverdueWatchlist(): Promise<any[]> {
        return this.defaultInstance.getOverdueWatchlist();
    }

    static async getAgingClusters(): Promise<any[]> {
        return this.defaultInstance.getAgingClusters();
    }

    static async getAgingBucketDetails(minDays: number, maxDays: number): Promise<any[]> {
        return this.defaultInstance.getAgingBucketDetails(minDays, maxDays);
    }

    static async getCollectorEfficiency(): Promise<any[]> {
        return this.defaultInstance.getCollectorEfficiency();
    }

    static async getIncomeStatement(startDate: number, endDate: number): Promise<any> {
        return this.defaultInstance.getIncomeStatement(startDate, endDate);
    }

    static async getBalanceSheet(): Promise<any> {
        return this.defaultInstance.getBalanceSheet();
    }

    static async getDisbursements(startDate: number, endDate: number): Promise<any[]> {
        return this.defaultInstance.getDisbursements(startDate, endDate);
    }

    static async getAdvancedKpis(): Promise<any> {
        return this.defaultInstance.getAdvancedKpis();
    }

    static async getSavingsReportData(): Promise<any> {
        return this.defaultInstance.getSavingsReportData();
    }

    static async getRenewalReportData(): Promise<any> {
        return this.defaultInstance.getRenewalReportData();
    }

    static async getActiveLoansReportData(): Promise<any[]> {
        return this.defaultInstance.getActiveLoansReportData();
    }

    async getKpiSummary(): Promise<MfiKpiData> {
        try {
            const loans = await this.db.collections.get<Loan>('loans')
                .query(Q.where('deleted_at', null), Q.where('status', Q.oneOf(['active', 'defaulted'])))
                .fetch();

            const schedules = await this.db.collections.get<PaymentSchedule>('payment_schedules')
                .query(Q.where('deleted_at', null), Q.where('status', Q.notEq('paid')))
                .fetch();

            const loanIds = loans.map(l => l.id);
            const payments = loanIds.length > 0 
                ? await this.db.collections.get<Payment>('payments')
                    .query(Q.where('deleted_at', null), Q.where('loan_id', Q.oneOf(loanIds)))
                    .fetch()
                : [];

            const penalties = loanIds.length > 0 
                ? await this.db.collections.get<LoanPenalty>('loan_penalties')
                    .query(Q.where('deleted_at', null), Q.where('loan_id', Q.oneOf(loanIds)))
                    .fetch()
                : [];

            const expenses = await this.db.collections.get<Expense>('expenses').query(Q.where('deleted_at', null)).fetch();

            const par = KpiCalculator.computePAR(loans, schedules, payments, 30);
            const glp = KpiCalculator.computeGLP(loans);
            const outstanding = KpiCalculator.computeOutstandingBalance(loans, payments, penalties);

            const interestIncome = KpiCalculator.computeInterestIncome(payments, loans);
            const operatingRevenue = interestIncome;

            const operatingExpenses = expenses.reduce((s, e) => s + e.amount, 0);

            const oss = KpiCalculator.computeOSS(operatingRevenue, operatingExpenses, 0, 0);
            const fss = KpiCalculator.computeFSS(operatingRevenue, operatingExpenses, 0, 0, 0, 0);
            const oer = KpiCalculator.computeOER(operatingExpenses, glp);

            const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

            const monthSchedules = await this.db.collections.get<PaymentSchedule>('payment_schedules')
                .query(Q.where('deleted_at', null), Q.where('due_date', Q.gte(startOfMonth)))
                .fetch();

            const monthPayments = await this.db.collections.get<Payment>('payments')
                .query(Q.where('deleted_at', null), Q.where('payment_date', Q.gte(startOfMonth)))
                .fetch();

            const totalDue = monthSchedules.reduce((s, row) => s + row.scheduledAmount, 0);
            const totalCollected = monthPayments.reduce((s, row) => s + row.amount, 0);
            const collectionEfficiency = KpiCalculator.computeCollectionEfficiency(totalCollected, totalDue);

            return {
                portfolioAtRisk: par.par / 100,
                collectionEfficiency: collectionEfficiency / 100,
                totalActiveLoans: loans.filter(l => l.status === 'active').length,
                totalOutstandingPrincipal: outstanding,
                oss: oss / 100,
                fss: fss / 100,
                oer: oer / 100,
            };
        } catch (e) {
            console.error('[MfiKpiService] Error getting KPI summary:', e);
            return {
                portfolioAtRisk: 0,
                collectionEfficiency: 0,
                totalActiveLoans: 0,
                totalOutstandingPrincipal: 0,
                oss: 0,
                fss: 0,
                oer: 0,
            };
        }
    }

    async getOverdueWatchlist(): Promise<any[]> {
        try {
            const now = new Date();
            const schedules = await this.db.collections.get<PaymentSchedule>('payment_schedules')
                .query(Q.where('deleted_at', null), 
                    Q.and(
                        Q.where('status', Q.oneOf(['pending', 'partial', 'late'])),
                        Q.where('due_date', Q.lt(now.getTime()))
                    )
                )
                .fetch();

            if (schedules.length === 0) return [];

            const loanIds = Array.from(new Set(schedules.map(s => s.loanId)));
            const loans = await this.db.collections.get<Loan>('loans')
                .query(Q.where('deleted_at', null), Q.where('id', Q.oneOf(loanIds)))
                .fetch();

            const borrowerIds = Array.from(new Set(loans.map(l => l.borrowerId)));
            const borrowers = await this.db.collections.get<Borrower>('borrowers')
                .query(Q.where('deleted_at', null), Q.where('id', Q.oneOf(borrowerIds)))
                .fetch();

            const payments = await this.db.collections.get<Payment>('payments')
                .query(Q.where('deleted_at', null), Q.where('loan_id', Q.oneOf(loanIds)))
                .fetch();

            const penalties = await this.db.collections.get<LoanPenalty>('loan_penalties')
                .query(Q.where('deleted_at', null), Q.where('loan_id', Q.oneOf(loanIds)))
                .fetch();

            return schedules.map(sched => {
                const loan = loans.find(l => l.id === sched.loanId);
                const borrower = borrowers.find(b => b.id === loan?.borrowerId);
                const overdueDays = differenceInDays(now, new Date(sched.dueDate));
                
                const principalPaid = payments
                    .filter(p => p.loanId === loan?.id)
                    .reduce((sum, p) => sum + p.amount, 0);

                const penaltyTotal = penalties
                    .filter(p => p.loanId === loan?.id)
                    .reduce((sum, p) => sum + p.amount, 0);

                const balance = Math.max(0, (loan?.totalAmount || 0) + penaltyTotal - principalPaid);

                return {
                    scheduleId: sched.id,
                    loanId: sched.loanId,
                    borrowerId: borrower?.id,
                    borrowerName: borrower?.fullName || 'Unknown',
                    dueDate: sched.dueDate,
                    amountDue: sched.scheduledAmount,
                    overdueDays,
                    loanBalance: balance,
                    phoneNumber: borrower?.decryptedPhone,
                };
            }).sort((a, b) => b.overdueDays - a.overdueDays).slice(0, 10);

        } catch (e) {
            console.error('[MfiKpiService] Error getting overdue watchlist:', e);
            return [];
        }
    }

    async getAgingClusters(): Promise<any[]> {
        try {
            const now = new Date();
            const loans = await this.db.collections.get<Loan>('loans').query(Q.where('deleted_at', null), Q.where('status', Q.oneOf(['active', 'defaulted']))).fetch();
            const schedules = await this.db.collections.get<PaymentSchedule>('payment_schedules').query(Q.where('deleted_at', null)).fetch();
            const payments = await this.db.collections.get<Payment>('payments').query(Q.where('deleted_at', null)).fetch();
            const penalties = await this.db.collections.get<LoanPenalty>('loan_penalties').query(Q.where('deleted_at', null)).fetch();

            const buckets = [
                { label: '1-7 Days', min: 1, max: 7, amount: 0, count: 0, color: '#3B82F6' },
                { label: '8-30 Days', min: 8, max: 30, amount: 0, count: 0, color: '#F59E0B' },
                { label: '31-60 Days', min: 31, max: 60, amount: 0, count: 0, color: '#EF4444' },
                { label: '61+ Days', min: 61, max: 9999, amount: 0, count: 0, color: '#991B1B' },
            ];

            for (const loan of loans) {
                const loanSchedules = schedules.filter(s => s.loanId === loan.id);
                const loanPayments = payments.filter(p => p.loanId === loan.id);
                const loanPenalties = penalties.filter(p => p.loanId === loan.id);

                const balances = this.getLoanScheduleBalances(loan, loanSchedules, loanPayments, loanPenalties, now);
                
                let loanHasOverdue = false;
                balances.forEach(b => {
                    if (b.balance <= 0) return;
                    const bucket = buckets.find(bucket => b.daysOverdue >= bucket.min && b.daysOverdue <= bucket.max);
                    if (bucket) {
                        bucket.amount += b.balance;
                        loanHasOverdue = true;
                    }
                });
                
                if (loanHasOverdue) {
                    // Count unique loans per bucket if they have any balance in it? 
                    // The original code incremented count for every schedule. 
                    // Let's just increment count once per loan per bucket it has balance in.
                    const distinctBuckets = new Set(
                        balances
                            .filter(b => b.balance > 0)
                            .map(b => buckets.find(bucket => b.daysOverdue >= bucket.min && b.daysOverdue <= bucket.max))
                            .filter(Boolean)
                    );
                    distinctBuckets.forEach((bucket: any) => bucket.count++);
                }
            }

            return buckets;
        } catch (e) {
            console.error('[MfiKpiService] Error getting aging clusters:', e);
            return [];
        }
    }

    async getAgingBucketDetails(minDays: number, maxDays: number): Promise<any[]> {
        try {
            const now = new Date();
            const loans = await this.db.collections.get<Loan>('loans').query(Q.where('deleted_at', null), Q.where('status', Q.oneOf(['active', 'defaulted']))).fetch();
            const schedules = await this.db.collections.get<PaymentSchedule>('payment_schedules').query(Q.where('deleted_at', null)).fetch();
            const payments = await this.db.collections.get<Payment>('payments').query(Q.where('deleted_at', null)).fetch();
            const penalties = await this.db.collections.get<LoanPenalty>('loan_penalties').query(Q.where('deleted_at', null)).fetch();
            const borrowers = await this.db.collections.get<Borrower>('borrowers').query(Q.where('deleted_at', null)).fetch();

            const results: any[] = [];

            for (const loan of loans) {
                const loanSchedules = schedules.filter(s => s.loanId === loan.id);
                const loanPayments = payments.filter(p => p.loanId === loan.id);
                const loanPenalties = penalties.filter(p => p.loanId === loan.id);
                const borrower = borrowers.find(b => b.id === loan.borrowerId);

                const balances = this.getLoanScheduleBalances(loan, loanSchedules, loanPayments, loanPenalties, now);
                
                balances.forEach(b => {
                    if (b.balance > 0 && b.daysOverdue >= minDays && b.daysOverdue <= maxDays) {
                        results.push({
                            id: b.schedule.id,
                            borrowerName: borrower?.fullName || 'Unknown',
                            phoneNumber: borrower?.decryptedPhone,
                            loanNumber: loan.loanNumber,
                            loanId: loan.id,
                            dueDate: b.schedule.dueDate,
                            amountDue: b.balance, // Return the REMAINING balance of the schedule
                            overdueDays: b.daysOverdue,
                            loanBalance: b.balance, // For drill down, showing the specific balance in this bucket
                        });
                    }
                });
            }

            return results.sort((a, b) => b.overdueDays - a.overdueDays);
        } catch (e) {
            console.error('[MfiKpiService] Error getting aging bucket details:', e);
            return [];
        }
    }

    async getCollectorEfficiency(): Promise<any[]> {
        try {
            const loans = await this.db.collections.get<Loan>('loans').query(Q.where('deleted_at', null)).fetch();
            const payments = await this.db.collections.get<Payment>('payments').query(Q.where('deleted_at', null)).fetch();
            const schedules = await this.db.collections.get<PaymentSchedule>('payment_schedules').query(Q.where('deleted_at', null)).fetch();
            const users = await this.db.collections.get<Collector>('collectors').query(Q.where('deleted_at', null)).fetch();

            const startOfMonthAt = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();

            const efficiencyData = [];
            for (const user of users) {
                const userLoans = loans.filter(l => l.collectorId === user.id);
                const loanIds = new Set(userLoans.map(l => l.id));

                const monthPayments = payments.filter(p => p.collectorId === user.id && p.paymentDate >= startOfMonthAt);
                const monthSchedules = schedules.filter(s => loanIds.has(s.loanId) && (s.dueDate as number) >= startOfMonthAt && (s.dueDate as number) <= new Date().getTime());

                const collected = monthPayments.reduce((sum, p) => sum + p.amount, 0);
                const target = monthSchedules.reduce((sum, s) => sum + s.scheduledAmount, 0);

                const cashHeld = await CashService.getCollectorBalance(user.id);

                efficiencyData.push({
                    userId: user.id,
                    name: user.fullName || 'Collector',
                    collected,
                    target,
                    cashHeld,
                    efficiency: target > 0 ? (collected / target) * 100 : 100,
                });
            }

            return efficiencyData.sort((a, b) => b.efficiency - a.efficiency);
        } catch (e) {
            console.error('[MfiKpiService] Error getting collector efficiency:', e);
            return [];
        }
    }

    async getIncomeStatement(startDate: number, endDate: number): Promise<any> {
        try {
            const expenses = await this.db.collections.get<Expense>('expenses')
                .query(Q.where('deleted_at', null), 
                    Q.where('expense_date', Q.between(startDate, endDate))
                ).fetch();

            const payments = await this.db.collections.get<Payment>('payments')
                .query(Q.where('deleted_at', null), 
                    Q.where('payment_date', Q.between(startDate, endDate))
                ).fetch();
            
            const loans = await this.db.collections.get<Loan>('loans').query(Q.where('deleted_at', null), 
                Q.where('status', Q.oneOf(['active', 'paid', 'defaulted']))
            ).fetch();

            const opExBreakdown: any = {};
            let totalOperatingExpenses = 0;
            expenses.forEach(e => {
                const cat = e.category || 'Other';
                opExBreakdown[cat] = (opExBreakdown[cat] || 0) + e.amount;
                totalOperatingExpenses += e.amount;
            });

            const totalOperatingRevenue = KpiCalculator.computeInterestIncome(payments, loans);

            const remittances = await this.db.collections.get<Remittance>('remittances')
                .query(Q.where('deleted_at', null), 
                    Q.where('status', 'approved'),
                    Q.where('remittance_date', Q.between(startDate, endDate))
                ).fetch();
            
            const totalRemittedInPeriod = remittances.reduce((s, r) => s + r.amount, 0);

            const savingsInterestTxs = await this.db.collections.get<SavingsTransaction>('savings_transactions')
                .query(Q.where('deleted_at', null), 
                    Q.where('type', 'interest'),
                    Q.where('date', Q.between(startDate, endDate))
                ).fetch();
            const savingsInterestExpense = savingsInterestTxs.reduce((s, tx) => s + tx.amount, 0);

            const snapshots = await this.db.collections.get<FinancialSnapshot>('financial_snapshots')
                .query(Q.where('deleted_at', null), 
                    Q.where('snapshot_date', Q.between(startDate, endDate))
                ).fetch();
            
            const baseFinancialCosts = snapshots.reduce((s, snap) => s + snap.financialCosts, 0);
            const financialCosts = baseFinancialCosts + savingsInterestExpense;
            const loanLossProvisions = snapshots.reduce((s, snap) => s + snap.loanLossReserve, 0);

            const netIncome = totalOperatingRevenue - totalOperatingExpenses - financialCosts - loanLossProvisions;

            return {
                operatingRevenue: totalOperatingRevenue,
                remittedRevenue: totalRemittedInPeriod,
                operatingExpenses: totalOperatingExpenses,
                opExBreakdown,
                financialCosts,
                loanLossProvisions,
                netIncome,
                savingsInterestExpense
            };
        } catch (e) {
            console.error('[MfiKpiService] Error generating income statement:', e);
            return null;
        }
    }

    async getBalanceSheet(): Promise<any> {
        try {
            const loans = await this.db.collections.get<Loan>('loans').query(Q.where('deleted_at', null), 
                Q.where('status', Q.oneOf(['active', 'defaulted']))
            ).fetch();
            const payments = await this.db.collections.get<Payment>('payments').query(Q.where('deleted_at', null)).fetch();
            const penalties = await this.db.collections.get<LoanPenalty>('loan_penalties').query(Q.where('deleted_at', null)).fetch();
            
            const outstandingPrincipal = KpiCalculator.computeOutstandingBalance(loans, payments, penalties);
            const cashOnHand = await CashService.getCurrentBalance();
            
            const collectors = await this.db.collections.get<Collector>('collectors').query(Q.where('deleted_at', null)).fetch();
            let cashInTransit = 0;
            for (const c of collectors) {
                cashInTransit += await CashService.getCollectorBalance(c.id);
            }

            const snapshots = await this.db.collections.get<FinancialSnapshot>('financial_snapshots')
                .query(Q.where('deleted_at', null)).fetch();
            snapshots.sort((a, b) => b.snapshotDate - a.snapshotDate);
            const latest = snapshots.length > 0 ? snapshots[0] : null;

            const assets = {
                loanPortfolio: outstandingPrincipal,
                cashOnHand: cashOnHand,
                cashInTransit: cashInTransit,
                otherAssets: latest ? Math.max(0, latest.totalAssets - outstandingPrincipal - cashOnHand - cashInTransit) : 0,
                totalAssets: (latest ? latest.totalAssets : (outstandingPrincipal + cashOnHand + cashInTransit))
            };

            const savingsTxs = await this.db.collections.get<SavingsTransaction>('savings_transactions').query(Q.where('deleted_at', null)).fetch();
            let totalSavingsDeposits = 0;
            savingsTxs.forEach(tx => {
                if (tx.type === 'deposit' || tx.type === 'interest') totalSavingsDeposits += tx.amount;
                else totalSavingsDeposits -= tx.amount;
            });

            const liabilities = {
                borrowings: latest ? latest.totalLiabilities : 0,
                savingsDeposits: totalSavingsDeposits,
                totalLiabilities: (latest ? latest.totalLiabilities : 0) + totalSavingsDeposits
            };

            const equity = {
                paidInCapital: latest ? latest.totalEquity : (assets.totalAssets - liabilities.totalLiabilities),
                totalEquity: latest ? latest.totalEquity : (assets.totalAssets - liabilities.totalLiabilities)
            };

            return { assets, liabilities, equity, asOf: new Date().getTime() };
        } catch (e) {
            console.error('[MfiKpiService] Error generating balance sheet:', e);
            return null;
        }
    }

    async getDisbursements(startDate: number, endDate: number): Promise<any[]> {
        try {
            const loans = await this.db.collections.get<Loan>('loans')
                .query(Q.where('deleted_at', null), 
                    Q.where('release_date', Q.between(startDate, endDate)),
                    Q.where('status', Q.oneOf(['active', 'paid', 'defaulted']))
                ).fetch();
            
            const borrowerIds = Array.from(new Set(loans.map(l => l.borrowerId)));
            const borrowers = await this.db.collections.get<Borrower>('borrowers')
                .query(Q.where('deleted_at', null), Q.where('id', Q.oneOf(borrowerIds)))
                .fetch();

            return loans.map(loan => {
                const borrower = borrowers.find(b => b.id === loan.borrowerId);
                return {
                    id: loan.id,
                    loanNumber: loan.loanNumber,
                    borrowerName: borrower?.fullName || 'Unknown',
                    principalAmount: loan.principalAmount,
                    insuranceAmount: loan.insuranceAmount,
                    releaseDate: loan.releaseDate,
                    status: loan.status
                };
            }).sort((a, b) => (b.releaseDate as number) - (a.releaseDate as number));
        } catch (e) {
            console.error('[MfiKpiService] Error getting disbursements:', e);
            return [];
        }
    }

    async getAdvancedKpis(): Promise<{
        roa: number, roe: number, debtToEquity: number, car: number,
        womenRatio: number, borrowersPerLo: number, avgLoanSize: number
    }> {
        try {
            const loans = await this.db.collections.get<Loan>('loans').query(Q.where('deleted_at', null)).fetch();
            const borrowers = await this.db.collections.get<Borrower>('borrowers').query(Q.where('deleted_at', null)).fetch();
            const users = await this.db.collections.get<Collector>('collectors').query(Q.where('deleted_at', null)).fetch();
            
            const activeLoans = loans.filter(l => l.status === 'active' || l.status === 'defaulted');
            const glp = activeLoans.reduce((s, l) => s + l.principalAmount, 0);
            const activeBorrowersCount = new Set(activeLoans.map(l => l.borrowerId)).size;
            
            const womenRatio = KpiCalculator.computeWomenRatio(borrowers);
            const borrowersPerLo = KpiCalculator.computeBorrowersPerLO(activeBorrowersCount, users.length);
            const avgLoanSize = KpiCalculator.computeAvgLoanSize(glp, activeBorrowersCount);

            const snapshots = await this.db.collections.get<FinancialSnapshot>('financial_snapshots').query(Q.where('deleted_at', null)).fetch();
            snapshots.sort((a, b) => b.snapshotDate - a.snapshotDate);
            const latest = snapshots.length > 0 ? snapshots[0] : null;

            const now = new Date().getTime();
            const start = now - (30 * 24 * 60 * 60 * 1000);
            const incomeStmt = await this.getIncomeStatement(start, now);
            const netIncome = incomeStmt?.netIncome || 0;

            const totalAssets = latest ? latest.totalAssets : glp * 1.2;
            const totalEquity = latest ? latest.totalEquity : glp * 0.8;
            const totalLiab = latest ? latest.totalLiabilities : totalAssets - (totalEquity as number);
            const rwa = latest ? latest.riskWeightedAssets : glp;

            const roa = KpiCalculator.computeROA(netIncome, totalAssets);
            const roe = KpiCalculator.computeROE(netIncome, totalEquity as number);
            const debtToEquity = KpiCalculator.computeDebtToEquity(totalLiab, totalEquity as number);
            const car = KpiCalculator.computeCAR(totalEquity as number, rwa || 1);

            return { roa, roe, debtToEquity, car, womenRatio, borrowersPerLo, avgLoanSize };
        } catch (e) {
            console.error('[MfiKpiService] Error getting advanced KPIs:', e);
            return { roa: 0, roe: 0, debtToEquity: 0, car: 0, womenRatio: 0, borrowersPerLo: 0, avgLoanSize: 0 };
        }
    }

    async getSavingsReportData(): Promise<any> {
        try {
            const savingsTxs = await this.db.collections.get<SavingsTransaction>('savings_transactions').query(Q.where('deleted_at', null)).fetch();
            const borrowers = await this.db.collections.get<Borrower>('borrowers').query(Q.where('deleted_at', null)).fetch();

            let totalDeposits = 0;
            let totalWithdrawals = 0;
            let totalInterest = 0;
            const typeBreakdown: Record<string, number> = {
                deposit: 0,
                withdraw_cash: 0,
                withdraw_loan: 0,
                interest: 0
            };

            savingsTxs.forEach(tx => {
                if (tx.type === 'deposit') {
                    totalDeposits += tx.amount;
                    typeBreakdown.deposit += tx.amount;
                } else if (tx.type === 'withdraw_cash') {
                    totalWithdrawals += tx.amount;
                    typeBreakdown.withdraw_cash += tx.amount;
                } else if (tx.type === 'withdraw_loan') {
                    totalWithdrawals += tx.amount;
                    typeBreakdown.withdraw_loan += tx.amount;
                } else if (tx.type === 'interest') {
                    totalInterest += tx.amount;
                    typeBreakdown.interest += tx.amount;
                }
            });

            const currentBalance = (totalDeposits + totalInterest) - totalWithdrawals;

            const thirtyDaysAgo = new Date().getTime() - (30 * 24 * 60 * 60 * 1000);
            const recentTxs = savingsTxs
                .filter(tx => tx.date >= thirtyDaysAgo)
                .sort((a, b) => b.date - a.date);

            const recentVelocity = recentTxs.reduce((sum, tx) => {
                if (tx.type === 'deposit' || tx.type === 'interest') return sum + tx.amount;
                return sum - tx.amount;
            }, 0);

            const activity = recentTxs.slice(0, 20).map(tx => {
                const borrower = borrowers.find(b => b.id === tx.borrowerId);
                return {
                    id: tx.id,
                    borrowerName: borrower?.fullName || 'Unknown',
                    type: tx.type,
                    amount: tx.amount,
                    date: tx.date,
                    notes: tx.notes
                };
            });

            const borrowerBalances: Record<string, number> = {};
            savingsTxs.forEach(tx => {
                const bId = tx.borrowerId;
                if (!borrowerBalances[bId]) borrowerBalances[bId] = 0;
                if (tx.type === 'deposit' || tx.type === 'interest') borrowerBalances[bId] += tx.amount;
                else borrowerBalances[bId] -= tx.amount;
            });

            const topSavers = Object.entries(borrowerBalances)
                .map(([id, balance]) => {
                    const borrower = borrowers.find(b => b.id === id);
                    return {
                        id,
                        name: borrower?.fullName || 'Unknown',
                        balance
                    };
                })
                .sort((a, b) => b.balance - a.balance)
                .slice(0, 10);

            return {
                summary: {
                    currentBalance,
                    totalDeposits,
                    totalWithdrawals,
                    totalInterest,
                    recentVelocity,
                    typeBreakdown
                },
                activity,
                topSavers
            };
        } catch (e) {
            console.error('[MfiKpiService] Error getting savings report data:', e);
            return null;
        }
    }

    async getRenewalReportData(): Promise<any> {
        try {
            const allLoans = await this.db.collections.get<Loan>('loans').query(Q.where('deleted_at', null)).fetch();
            
            const totalLoans = allLoans.length;
            const reloans = allLoans.filter(l => l.isReloan);
            const newLoans = allLoans.filter(l => !l.isReloan);

            const reloanRate = totalLoans > 0 ? (reloans.length / totalLoans) * 100 : 0;

            const monthlyStats: Record<string, { new: number; renewed: number; total: number }> = {};
            
            allLoans.forEach(l => {
                const month = format(l.releaseDate, 'yyyy-MM');
                if (!monthlyStats[month]) monthlyStats[month] = { new: 0, renewed: 0, total: 0 };
                
                if (l.isReloan) monthlyStats[month].renewed += l.principalAmount;
                else monthlyStats[month].new += l.principalAmount;
                monthlyStats[month].total += l.principalAmount;
            });

            const trend = Object.entries(monthlyStats)
                .map(([month, stats]) => ({
                    month,
                    ...stats
                }))
                .sort((a, b) => a.month.localeCompare(b.month))
                .slice(-6);

            return {
                count: {
                    total: totalLoans,
                    renewed: reloans.length,
                    new: newLoans.length,
                    rate: reloanRate
                },
                volume: {
                    renewed: reloans.reduce((sum, l) => sum + l.principalAmount, 0),
                    new: newLoans.reduce((sum, l) => sum + l.principalAmount, 0)
                },
                trend
            };
        } catch (e) {
            console.error('[MfiKpiService] Error getting renewal report data:', e);
            return null;
        }
    }

    async getActiveLoansReportData(): Promise<any[]> {
        try {
            const loans = await this.db.collections.get<Loan>('loans').query(Q.where('deleted_at', null), 
                Q.where('status', Q.oneOf(['active', 'defaulted']))
            ).fetch();

            const borrowers = await this.db.collections.get<Borrower>('borrowers').query(Q.where('deleted_at', null)).fetch();
            const users = await this.db.collections.get<Collector>('collectors').query(Q.where('deleted_at', null)).fetch();
            const schedules = await this.db.collections.get<PaymentSchedule>('payment_schedules').query(Q.where('deleted_at', null)).fetch();
            const payments = await this.db.collections.get<Payment>('payments').query(Q.where('deleted_at', null)).fetch();
            const penalties = await this.db.collections.get<LoanPenalty>('loan_penalties').query(Q.where('deleted_at', null)).fetch();

            const now = new Date();

            return loans.map(loan => {
                const borrower = borrowers.find(b => b.id === loan.borrowerId);
                const collector = users.find(u => u.id === loan.collectorId);

                const loanSchedules = schedules.filter(s => s.loanId === loan.id);
                const loanPayments = payments.filter(p => p.loanId === loan.id);
                const loanPenalties = penalties.filter(p => p.loanId === loan.id);

                const scheduleBalances = this.getLoanScheduleBalances(loan, loanSchedules, loanPayments, loanPenalties, now);
                const totalLoanBalance = scheduleBalances.reduce((sum, b) => sum + b.balance, 0);
                
                const releaseDate = loan.releaseDate;
                const dRelease = new Date(releaseDate);
                const dayCollectionOutstanding = releaseDate ? differenceInDays(now, dRelease) : 0;
                
                let notDue = 0;
                let day1_45 = 0;
                let day46_60 = 0;
                let day61_90 = 0;
                let day91_180 = 0;

                // Sum up balances into mutually exclusive buckets
                scheduleBalances.forEach(b => {
                    if (b.balance <= 0) return;

                    if (b.daysOverdue < 1) {
                        notDue += b.balance;
                    } else if (b.daysOverdue >= 1 && b.daysOverdue <= 45) {
                        day1_45 += b.balance;
                    } else if (b.daysOverdue >= 46 && b.daysOverdue <= 60) {
                        day46_60 += b.balance;
                    } else if (b.daysOverdue >= 61 && b.daysOverdue <= 90) {
                        day61_90 += b.balance;
                    } else if (b.daysOverdue >= 91) {
                        day91_180 += b.balance;
                    }
                });

                const pastSchedules = loanSchedules.filter(s => new Date(s.dueDate).getTime() <= now.getTime());
                const expectedCollected = pastSchedules.reduce((sum, s) => sum + s.scheduledAmount, 0);
                const totalCollected = loanPayments.reduce((sum, p) => sum + p.amount, 0);

                const maxDueDate = loanSchedules.length > 0
                    ? Math.max(...loanSchedules.map(s => new Date(s.dueDate).getTime()))
                    : null;

                return {
                    id: loan.id,
                    borrowerId: borrower?.id,
                    clientName: borrower?.fullName || 'Unknown',
                    address: borrower?.address || '',
                    collectorName: collector?.fullName || 'Unassigned',
                    collectorId: collector?.id || '',
                    loanAmount: loan.principalAmount || 0,
                    totalLoanBalance,
                    dayCollectionOutstanding,
                    dateRelease: releaseDate,
                    endDate: maxDueDate,
                    agings: {
                        notDue,
                        day1_45,
                        day46_60,
                        day61_90,
                        day91_180
                    },
                    efficiency: {
                        totalCollected,
                        expectedCollected
                    }
                };

            }).sort((a, b) => (b.dateRelease as number) - (a.dateRelease as number));

        } catch (e) {
            console.error('[MfiKpiService] Error getting active loans report:', e);
            return [];
        }
    }

    private getLoanScheduleBalances(
        loan: Loan,
        schedules: PaymentSchedule[],
        payments: Payment[],
        penalties: LoanPenalty[],
        now: Date = new Date()
    ): { schedule: PaymentSchedule; balance: number; daysOverdue: number }[] {
        const sortedSchedules = [...schedules].sort((a, b) => (a.dueDate as number) - (b.dueDate as number));
        const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
        const penaltyTotal = penalties.reduce((sum, p) => sum + p.amount, 0);
        
        let remainingPaid = totalPaid;
        
        // Distribution Pool 1: Schedules (Gross amount)
        const balances = sortedSchedules.map(s => {
            const amount = s.scheduledAmount || 0;
            const paid = Math.min(remainingPaid, amount);
            remainingPaid -= paid;
            
            return {
                schedule: s,
                balance: Math.max(0, amount - paid),
                daysOverdue: differenceInDays(now, new Date(s.dueDate))
            };
        });
        
        // Distribution Pool 1.5: Missing Scheduled Amount (Legacy data inconsistency)
        const scheduleTotal = sortedSchedules.reduce((sum, s) => sum + (s.scheduledAmount || 0), 0);
        const expectedTotal = loan.totalAmount || 0;
        
        if (expectedTotal > scheduleTotal) {
            const missingAmount = expectedTotal - scheduleTotal;
            const paidForMissing = Math.min(remainingPaid, missingAmount);
            remainingPaid -= paidForMissing;
            
            const lastScheduleDate = sortedSchedules.length > 0 
                ? new Date(sortedSchedules[sortedSchedules.length - 1].dueDate)
                : (loan.releaseDate ? new Date(loan.releaseDate) : now);
            
            balances.push({
                schedule: { id: 'missing_balance', dueDate: lastScheduleDate } as any,
                balance: Math.max(0, missingAmount - paidForMissing),
                daysOverdue: differenceInDays(now, lastScheduleDate)
            });
        }
        
        // Distribution Pool 2: Penalties (Any remaining payment applies to penalties)
        const remainingPenalty = Math.max(0, penaltyTotal - remainingPaid);
        if (remainingPenalty > 0) {
            // Penalties are typically considered "due now" if any schedule is overdue, 
            // or we assign them to the oldest overdue bucket.
            const overdueBalances = balances.filter(b => b.daysOverdue > 0);
            const maxOverdue = overdueBalances.length > 0 
                ? Math.max(...overdueBalances.map(b => b.daysOverdue)) 
                : 0;
            
            // Add a virtual entry for the penalty balance
            balances.push({
                schedule: { id: 'penalty', dueDate: now } as any, 
                balance: remainingPenalty,
                daysOverdue: maxOverdue
            });
        }
        
        return balances;
    }
}
