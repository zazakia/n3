import {
    calculatePreviousLoanBalances,
    shouldAutoPopulateLoanCycle,
    shouldDefaultDailyTerm,
} from '../loanFormDefaults';

describe('loan form defaults', () => {
    it('does not auto-overwrite loan cycle while editing an existing loan', () => {
        expect(shouldAutoPopulateLoanCycle(true, 'borrower-1')).toBe(false);
    });

    it('only defaults days term when switching from a non-days unit in create mode', () => {
        expect(shouldDefaultDailyTerm({
            isEditing: false,
            previousTermUnit: 'months',
            nextTermUnit: 'days',
            currentTerm: '6',
        })).toBe(true);

        expect(shouldDefaultDailyTerm({
            isEditing: true,
            previousTermUnit: 'months',
            nextTermUnit: 'days',
            currentTerm: '25',
        })).toBe(false);

        expect(shouldDefaultDailyTerm({
            isEditing: false,
            previousTermUnit: 'days',
            nextTermUnit: 'days',
            currentTerm: '25',
        })).toBe(false);
    });

    it('ignores soft-deleted payments and penalties when calculating previous loan balances', () => {
        const balances = calculatePreviousLoanBalances(
            [{ id: 'loan-1', totalAmount: 1000 }],
            [
                { loanId: 'loan-1', amount: 200, deletedAt: null },
                { loanId: 'loan-1', amount: 700, deletedAt: 1780420592180 },
            ],
            [
                { loanId: 'loan-1', amount: 50, deletedAt: null },
                { loanId: 'loan-1', amount: 500, deletedAt: '2026-06-03T00:00:00.000Z' },
            ]
        );

        expect(balances['loan-1']).toBe(850);
    });
});
