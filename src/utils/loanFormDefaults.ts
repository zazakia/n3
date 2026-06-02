interface ShouldDefaultDailyTermParams {
    isEditing: boolean;
    previousTermUnit?: string;
    nextTermUnit?: string;
    currentTerm?: string;
}

interface BalanceLoanInput {
    id: string;
    totalAmount?: number | null;
}

interface BalanceAdjustmentInput {
    loanId: string;
    amount?: number | null;
    deletedAt?: number | string | null;
}

export function shouldAutoPopulateLoanCycle(isEditing: boolean, borrowerId?: string): boolean {
    return !isEditing && !!borrowerId;
}

export function shouldDefaultDailyTerm({
    isEditing,
    previousTermUnit,
    nextTermUnit,
    currentTerm,
}: ShouldDefaultDailyTermParams): boolean {
    return !isEditing
        && previousTermUnit !== 'days'
        && nextTermUnit === 'days'
        && currentTerm !== '40';
}

export function calculatePreviousLoanBalances(
    loans: BalanceLoanInput[],
    payments: BalanceAdjustmentInput[],
    penalties: BalanceAdjustmentInput[]
): Record<string, number> {
    const activePayments = payments.filter(payment => payment.deletedAt == null);
    const activePenalties = penalties.filter(penalty => penalty.deletedAt == null);

    return loans.reduce<Record<string, number>>((balances, loan) => {
        const totalPaid = activePayments
            .filter(payment => payment.loanId === loan.id)
            .reduce((sum, payment) => sum + (payment.amount || 0), 0);
        const totalPenalties = activePenalties
            .filter(penalty => penalty.loanId === loan.id)
            .reduce((sum, penalty) => sum + (penalty.amount || 0), 0);

        balances[loan.id] = Math.max(0, (loan.totalAmount || 0) + totalPenalties - totalPaid);
        return balances;
    }, {});
}
