import Loan from '../database/models/Loan';
import Payment from '../database/models/Payment';
import PaymentSchedule from '../database/models/PaymentSchedule';
import Borrower from '../database/models/Borrower';
import LoanPenalty from '../database/models/LoanPenalty';
import { differenceInDays } from 'date-fns';

export class KpiCalculator {
    static computePAR(
        loans: Loan[],
        schedules: PaymentSchedule[],
        payments: Payment[],
        daysThreshold: number,
        now: Date = new Date()
    ): { par: number; glp: number } {
        const activeLoans = loans.filter(l => l.status === 'active' || l.status === 'defaulted');
        const glp = activeLoans.reduce((s, l) => s + l.principalAmount, 0);

        const overdueLoanIds = new Set<string>();
        for (const sched of schedules) {
            if (sched.status === 'pending' || sched.status === 'partial' || sched.status === 'late') {
                const overdueDays = differenceInDays(now, new Date(sched.dueDate));
                if (overdueDays > daysThreshold) {
                    overdueLoanIds.add(sched.loanId);
                }
            }
        }

        const overdueOutstanding = activeLoans
            .filter(l => overdueLoanIds.has(l.id))
            .reduce((s, l) => {
                const paid = payments
                    .filter(p => p.loanId === l.id)
                    .reduce((sp, p) => sp + p.amount, 0);
                const totalReceivable = (l.totalAmount || l.principalAmount || 0);
                const paidRatio = totalReceivable > 0 ? Math.min(1, paid / totalReceivable) : 0;
                return s + Math.max(0, l.principalAmount * (1 - paidRatio));
            }, 0);

        const rawPar = glp > 0 ? (overdueOutstanding / glp) * 100 : 0;
        return {
            par: Math.min(100, Math.max(0, rawPar)),
            glp,
        };
    }

    static computeGLP(loans: Loan[]): number {
        return loans
            .filter(l => l.status === 'active' || l.status === 'defaulted')
            .reduce((s, l) => s + l.principalAmount, 0);
    }

    static computeROA(netIncome: number, totalAssets: number): number {
        return totalAssets > 0 ? (netIncome / totalAssets) * 100 : 0;
    }

    static computeROE(netIncome: number, totalEquity: number): number {
        return totalEquity > 0 ? (netIncome / totalEquity) * 100 : 0;
    }

    static computeOSS(
        operatingRevenue: number,
        operatingExpenses: number,
        financialCosts: number,
        loanLossProvisions: number
    ): number {
        const denominator = operatingExpenses + financialCosts + loanLossProvisions;
        return denominator > 0 ? (operatingRevenue / denominator) * 100 : 0;
    }

    static computeFSS(
        operatingRevenue: number,
        operatingExpenses: number,
        financialCosts: number,
        provisions: number,
        subsidyAdj: number = 0,
        inflationAdj: number = 0
    ): number {
        const denominator = operatingExpenses + financialCosts + provisions + subsidyAdj + inflationAdj;
        return denominator > 0 ? (operatingRevenue / denominator) * 100 : 0;
    }

    static computeCollectionEfficiency(totalCollected: number, totalDue: number): number {
        return totalDue > 0 ? (totalCollected / totalDue) * 100 : 0;
    }

    static computeOER(operatingExpenses: number, glp: number): number {
        return glp > 0 ? (operatingExpenses / glp) * 100 : 0;
    }

    static computeBorrowersPerLO(activeBorrowers: number, loanOfficerCount: number): number {
        return loanOfficerCount > 0 ? activeBorrowers / loanOfficerCount : 0;
    }

    static computeDebtToEquity(totalLiabilities: number, totalEquity: number): number {
        return totalEquity > 0 ? totalLiabilities / totalEquity : 0;
    }

    static computeCAR(totalEquity: number, riskWeightedAssets: number): number {
        return riskWeightedAssets > 0 ? (totalEquity / riskWeightedAssets) * 100 : 0;
    }

    static computeWomenRatio(borrowers: Borrower[]): number {
        const total = borrowers.length;
        const female = borrowers.filter(b => b.gender === 'female').length;
        return total > 0 ? (female / total) * 100 : 0;
    }

    static computeAvgLoanSize(glp: number, activeBorrowers: number): number {
        return activeBorrowers > 0 ? glp / activeBorrowers : 0;
    }

    static computeOutstandingBalance(loans: Loan[], payments: Payment[], penalties?: LoanPenalty[], collectorId?: string): number {
        const filteredLoans = collectorId
            ? loans.filter(l => l.collectorId === collectorId && (l.status === 'active' || l.status === 'defaulted'))
            : loans.filter(l => l.status === 'active' || l.status === 'defaulted');

        return filteredLoans.reduce((sum, loan) => {
            const paid = payments
                .filter(p => p.loanId === loan.id)
                .reduce((s, p) => s + p.amount, 0);
            
            const penaltyTotal = penalties 
                ? penalties.filter(p => p.loanId === loan.id).reduce((s, p) => s + p.amount, 0)
                : 0;

            return sum + Math.max(0, loan.totalAmount + penaltyTotal - paid);
        }, 0);
    }

    static computeInterestIncome(payments: Payment[], loans: Loan[]): number {
        return loans.reduce((sum, loan) => {
            const totalReceivable = loan.totalAmount || 0;
            if (totalReceivable <= 0) return sum;

            const loanPaid = payments
                .filter(p => p.loanId === loan.id)
                .reduce((sp, p) => sp + p.amount, 0);

            const explicitInterest = (loan as any).interestAmount || 0;
            const derivedInterest = Math.max(
                0,
                totalReceivable - (loan.principalAmount || 0) - ((loan as any).depositAmount || 0) - ((loan as any).insuranceAmount || 0)
            );
            const interestReceivable = explicitInterest > 0 ? explicitInterest : derivedInterest;
            const recognizedInterest = loanPaid * (interestReceivable / totalReceivable);

            return sum + Math.min(interestReceivable, Math.max(0, recognizedInterest));
        }, 0);
    }

    /**
     * Cash basis interest income: sums the interest-portion of each cash payment
     * received in the period without the accrual "min-cap" — pure cash-in view.
     * Under this approach, interest income = interest share of cash actually received
     * during the reporting window.
     */
    static computeCashBasisInterestIncome(payments: Payment[], loans: Loan[]): number {
        const loanMap = new Map(loans.map(l => [l.id, l]));

        return payments.reduce((sum, payment) => {
            const loan = loanMap.get(payment.loanId);
            if (!loan) return sum;

            const totalReceivable = loan.totalAmount || 0;
            if (totalReceivable <= 0) return sum;

            const explicitInterest = (loan as any).interestAmount || 0;
            const derivedInterest = Math.max(
                0,
                totalReceivable - (loan.principalAmount || 0) - ((loan as any).depositAmount || 0) - ((loan as any).insuranceAmount || 0)
            );
            const interestReceivable = explicitInterest > 0 ? explicitInterest : derivedInterest;

            // Cash basis: recognize the interest proportion of this specific payment
            const interestShare = totalReceivable > 0
                ? payment.amount * (interestReceivable / totalReceivable)
                : 0;

            return sum + Math.max(0, interestShare);
        }, 0);
    }

    /**
     * Dynamically calculates Loan Loss Provision (LLP) based on PAR aging.
     * Standard MFI formula: PAR>30 * 50% + PAR>90 * 100%
     */
    static computeLLP(
        loans: Loan[],
        schedules: PaymentSchedule[],
        payments: Payment[],
        penalties: LoanPenalty[],
        now: Date = new Date()
    ): number {
        const activeLoans = loans.filter(l => l.status === 'active' || l.status === 'defaulted');
        
        let totalProvision = 0;

        for (const loan of activeLoans) {
            const loanSchedules = schedules.filter(s => s.loanId === loan.id);
            const loanPayments = payments.filter(p => p.loanId === loan.id);
            const loanPenalties = penalties.filter(p => p.loanId === loan.id);

            // Calculate current outstanding balance
            const paid = loanPayments.reduce((s, p) => s + p.amount, 0);
            const penaltyTotal = loanPenalties.reduce((s, p) => s + p.amount, 0);
            const totalReceivable = (loan.totalAmount || loan.principalAmount || 0);
            const outstanding = Math.max(0, totalReceivable + penaltyTotal - paid);

            if (outstanding <= 0) continue;

            // Find maximum days overdue across all pending schedules for this loan
            let maxOverdueDays = 0;
            for (const sched of loanSchedules) {
                if (sched.status === 'pending' || sched.status === 'partial' || sched.status === 'late') {
                    const overdueDays = differenceInDays(now, new Date(sched.dueDate));
                    if (overdueDays > maxOverdueDays) {
                        maxOverdueDays = overdueDays;
                    }
                }
            }

            // Apply provisioning buckets
            if (maxOverdueDays > 90) {
                totalProvision += outstanding * 1.0; // 100% provision
            } else if (maxOverdueDays > 30) {
                totalProvision += outstanding * 0.5; // 50% provision
            }
        }

        return totalProvision;
    }

    /**
     * Calculates Capital Recovery Rate by cycle (release month)
     * Groups loans by release month and calculates (Total Principal Collected / Total Principal Released)
     */
    static computeCycleRecoveryRate(loans: Loan[], payments: Payment[]): Array<{ cycle: string, recoveryRate: number, disbursed: number, collected: number }> {
        const loansByMonth = new Map<string, Loan[]>();
        
        for (const loan of loans) {
            if (loan.status === 'pending' || loan.status === 'cancelled' || loan.status === 'declined') continue;
            if (!loan.releaseDate) continue;
            
            const date = new Date(loan.releaseDate);
            const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            if (!loansByMonth.has(monthKey)) {
                loansByMonth.set(monthKey, []);
            }
            loansByMonth.get(monthKey)!.push(loan);
        }

        const paymentsByLoanId = new Map<string, number>();
        for (const payment of payments) {
            paymentsByLoanId.set(payment.loanId, (paymentsByLoanId.get(payment.loanId) || 0) + payment.amount);
        }

        const results = [];
        for (const [cycle, cycleLoans] of loansByMonth.entries()) {
            let totalDisbursed = 0;
            let totalPrincipalCollected = 0;

            for (const loan of cycleLoans) {
                totalDisbursed += (loan.principalAmount || 0);
                
                const totalPaid = paymentsByLoanId.get(loan.id) || 0;
                // Cap principal collected at the disbursed amount for recovery rate logic
                const principalCollected = Math.min((loan.principalAmount || 0), totalPaid);
                totalPrincipalCollected += principalCollected;
            }

            results.push({
                cycle,
                disbursed: totalDisbursed,
                collected: totalPrincipalCollected,
                recoveryRate: totalDisbursed > 0 ? (totalPrincipalCollected / totalDisbursed) * 100 : 0
            });
        }

        return results.sort((a, b) => b.cycle.localeCompare(a.cycle));
    }
}
