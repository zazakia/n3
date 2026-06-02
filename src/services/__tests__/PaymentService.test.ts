import { Database, Q } from '@nozbe/watermelondb';
import { createTestDatabase, closeTestDatabase, createTestData } from '../../__tests__/test-utils';
import { PaymentService } from '../PaymentService';
import Loan from '../../database/models/Loan';
import Payment from '../../database/models/Payment';
import PaymentSchedule from '../../database/models/PaymentSchedule';
import SavingsTransaction from '../../database/models/SavingsTransaction';
import ActionLog from '../../database/models/ActionLog';

jest.mock('../AuthService', () => ({
    AuthService: {
        getCurrentUserId: jest.fn().mockResolvedValue('test-user'),
    },
}));

describe('PaymentService', () => {
    let database: Database;

    beforeEach(() => {
        database = createTestDatabase();
    });

    afterEach(async () => {
        await closeTestDatabase(database);
    });

    async function createLoanWithSchedules() {
        const { borrower, collector, loan } = await createTestData(database, { loanAmount: 300, status: 'active' });
        await database.write(async () => {
            await loan.update(l => {
                l.totalAmount = 300;
                l.principalAmount = 240;
                l.interestAmount = 30;
                l.depositAmount = 30;
                l.collectorId = collector.id;
                l.status = 'active';
            });

            for (let index = 0; index < 3; index += 1) {
                await database.get<PaymentSchedule>('payment_schedules').create(schedule => {
                    schedule.loanId = loan.id;
                    schedule.dueDate = Date.now() + index * 86400000;
                    schedule.scheduledAmount = 100;
                    schedule.principalAmount = 80;
                    schedule.interestAmount = 10;
                    schedule.feesAmount = 10;
                    schedule.status = 'pending';
                });
            }
        });

        return { borrower, collector, loan };
    }

    it('allocates cumulative partial payments and marks schedules paid when totals catch up', async () => {
        const { borrower, collector, loan } = await createLoanWithSchedules();

        await PaymentService.postPayment({
            loanId: loan.id,
            amount: 40,
            paymentDate: Date.now(),
            encodedBy: 'admin-user',
            database,
        });

        let schedules = await database.get<PaymentSchedule>('payment_schedules').query(Q.sortBy('due_date', Q.asc)).fetch();
        expect(schedules[0].status).toBe('partial');

        await PaymentService.postPayment({
            loanId: loan.id,
            amount: 60,
            paymentDate: Date.now(),
            encodedBy: 'admin-user',
            database,
        });

        schedules = await database.get<PaymentSchedule>('payment_schedules').query(Q.sortBy('due_date', Q.asc)).fetch();
        expect(schedules[0].status).toBe('paid');
        expect(schedules[1].status).toBe('pending');

        const payments = await database.get<Payment>('payments').query(Q.sortBy('payment_date', Q.asc)).fetch();
        expect(payments[0].scheduleId).toBe(schedules[0].id);
        expect(payments[1].scheduleId).toBe(schedules[0].id);
        expect(payments[0].borrowerId).toBe(borrower.id);
        expect(payments[0].collectorId).toBe(collector.id);

    });

    it('marks a loan paid when posted payments cover the receivable', async () => {
        const { loan } = await createLoanWithSchedules();

        await PaymentService.postPayment({
            loanId: loan.id,
            amount: 300,
            paymentDate: Date.now(),
            encodedBy: 'admin-user',
            database,
        });

        const updatedLoan = await database.get<Loan>('loans').find(loan.id);
        expect(updatedLoan.status).toBe('paid');

        const schedules = await database.get<PaymentSchedule>('payment_schedules').query().fetch();
        expect(schedules.every(schedule => schedule.status === 'paid')).toBe(true);
    });

    it('writes audit logs for payment, schedule, savings, and loan status changes', async () => {
        const { loan } = await createLoanWithSchedules();

        await PaymentService.postPayment({
            loanId: loan.id,
            amount: 300,
            depositAmount: 10,
            paymentDate: Date.now(),
            encodedBy: 'admin-user',
            database,
        });

        const logs = await database.get<ActionLog>('action_logs').query().fetch();
        expect(logs.some(log => log.entityType === 'payments' && log.action === 'CREATE')).toBe(true);
        expect(logs.some(log => log.entityType === 'payment_schedules' && log.action === 'UPDATE')).toBe(true);
        expect(logs.some(log => log.entityType === 'savings_transactions' && log.action === 'CREATE')).toBe(true);
        expect(logs.some(log => log.entityType === 'loans' && log.action === 'UPDATE')).toBe(true);
    });

    it('soft-deletes a payment, reverses linked savings deposits, and recomputes loan state', async () => {
        const { loan } = await createLoanWithSchedules();

        const payment = await PaymentService.postPayment({
            loanId: loan.id,
            amount: 300,
            depositAmount: 10,
            paymentDate: Date.now(),
            encodedBy: 'admin-user',
            database,
        });

        await PaymentService.softDeletePayment(payment.id, {
            database,
            performedBy: 'admin-user',
        });

        const deletedPayment = await database.get<Payment>('payments').find(payment.id);
        expect(deletedPayment.deletedAt).not.toBeNull();

        const linkedSavings = await database.get<SavingsTransaction>('savings_transactions')
            .query(Q.where('reference_id', payment.id))
            .fetch();
        expect(linkedSavings.length).toBeGreaterThan(0);
        expect(linkedSavings.every(tx => tx.deletedAt !== null)).toBe(true);

        const updatedLoan = await database.get<Loan>('loans').find(loan.id);
        expect(updatedLoan.status).toBe('active');

        const schedules = await database.get<PaymentSchedule>('payment_schedules')
            .query(Q.sortBy('due_date', Q.asc))
            .fetch();
        expect(schedules.every(schedule => schedule.status !== 'paid')).toBe(true);

        const logs = await database.get<ActionLog>('action_logs').query().fetch();
        expect(logs.some(log => log.entityType === 'payments' && log.action === 'DELETE')).toBe(true);
        expect(logs.some(log => log.entityType === 'savings_transactions' && log.action === 'DELETE')).toBe(true);
    });

    it('updates payment details, writes audit log, and recomputes loan state', async () => {
        const { loan } = await createLoanWithSchedules();
        const originalDate = Date.now() - 86400000;
        const editedDate = Date.now();

        const payment = await PaymentService.postPayment({
            loanId: loan.id,
            amount: 300,
            paymentDate: originalDate,
            receiptNumber: 'RCT-OLD',
            notes: 'old note',
            encodedBy: 'admin-user',
            database,
        });

        await PaymentService.updatePayment(payment.id, {
            amount: 50,
            paymentDate: editedDate,
            receiptNumber: 'RCT-NEW',
            notes: 'corrected date',
            performedBy: 'admin-user',
            database,
        });

        const updatedPayment = await database.get<Payment>('payments').find(payment.id);
        expect(updatedPayment.amount).toBe(50);
        expect(new Date(updatedPayment.paymentDate as any).getTime()).toBe(editedDate);
        expect(updatedPayment.receiptNumber).toBe('RCT-NEW');
        expect(updatedPayment.notes).toBe('corrected date');

        const updatedLoan = await database.get<Loan>('loans').find(loan.id);
        expect(updatedLoan.status).toBe('active');

        const logs = await database.get<ActionLog>('action_logs').query().fetch();
        const paymentUpdateLog = logs.find(log => log.entityType === 'payments' && log.action === 'UPDATE');
        expect(paymentUpdateLog).toBeDefined();
        expect(paymentUpdateLog?.oldData).toContain('RCT-OLD');
        expect(paymentUpdateLog?.newData).toContain('RCT-NEW');
    });

    it('applies savings to a loan through the central payment flow', async () => {
        const { borrower, loan } = await createLoanWithSchedules();

        const payment = await PaymentService.applySavingsToLoan({
            loanId: loan.id,
            amount: 100,
            paymentDate: Date.now(),
            borrowerId: borrower.id,
            notes: 'Savings to loan',
            encodedBy: 'admin-user',
            database,
        });

        const linkedSavings = await database.get<SavingsTransaction>('savings_transactions')
            .query(Q.where('reference_id', payment.id))
            .fetch();

        const withdrawal = linkedSavings.find(tx => tx.type === 'withdraw_loan');

        expect(withdrawal).toBeDefined();
        expect(withdrawal?.amount).toBe(100);
        expect(payment.borrowerId).toBe(borrower.id);
    });

    it('calculates getLoanBalance correctly with payments and penalties', async () => {
        const { loan } = await createLoanWithSchedules();

        // Add payment
        await PaymentService.postPayment({
            loanId: loan.id,
            amount: 50,
            paymentDate: Date.now(),
            encodedBy: 'admin-user',
            database,
        });

        // Add penalty
        await database.write(async () => {
            await database.get('loan_penalties').create((record: any) => {
                record.loanId = loan.id;
                record.amount = 20;
                record.status = 'active';
            });
        });

        const balanceSummary = await PaymentService.getLoanBalance(loan.id, database);
        
        expect(balanceSummary.totalExpected).toBe(320); // 300 loan + 20 penalty
        expect(balanceSummary.totalPaid).toBe(50);
        expect(balanceSummary.balance).toBe(270);
    });

    it('does not revert a renewed loan to active when a payment is deleted', async () => {
        const { borrower, collector, loan } = await createLoanWithSchedules();

        // Pay the loan in full
        const payment = await PaymentService.postPayment({
            loanId: loan.id,
            amount: 300,
            paymentDate: Date.now(),
            encodedBy: 'admin-user',
            database,
        });

        // Create a child reloan referencing the paid loan (simulates renewal)
        await database.write(async () => {
            await database.get<Loan>('loans').create(l => {
                l.borrowerId = borrower.id;
                l.principalAmount = 500;
                l.totalAmount = 600;
                l.status = 'active';
                l.frequency = 'daily';
                l.isReloan = true;
                l.previousLoanId = loan.id;
                l.collectorId = collector.id;
            });
        });

        // Delete the payment — loan should stay 'paid' because it was renewed
        await PaymentService.softDeletePayment(payment.id, { database, performedBy: 'admin-user' });

        const updatedLoan = await database.get<Loan>('loans').find(loan.id);
        expect(updatedLoan.status).toBe('paid');
    });

    it('marks overdue schedules as late when payment does not cover them', async () => {
        const { loan } = await createLoanWithSchedules();

        // Make all schedules overdue
        await database.write(async () => {
            const schedules = await database.get<PaymentSchedule>('payment_schedules').query().fetch();
            for (const s of schedules) {
                await s.update(record => {
                    record.dueDate = Date.now() - 86400000 * 2; // 2 days ago
                });
            }
        });

        // Post a partial payment that doesn't cover any full schedule
        await PaymentService.postPayment({
            loanId: loan.id,
            amount: 10,
            paymentDate: Date.now(),
            encodedBy: 'admin-user',
            database,
        });

        const schedules = await database.get<PaymentSchedule>('payment_schedules').query(Q.sortBy('due_date', Q.asc)).fetch();
        // First schedule should be partial, rest should be late
        expect(schedules[0].status).toBe('partial');
        expect(schedules[1].status).toBe('late');
        expect(schedules[2].status).toBe('late');
    });

    it('getLoanBalance returns zero balance when fully paid', async () => {
        const { loan } = await createLoanWithSchedules();

        await PaymentService.postPayment({
            loanId: loan.id,
            amount: 300,
            paymentDate: Date.now(),
            encodedBy: 'admin-user',
            database,
        });

        const summary = await PaymentService.getLoanBalance(loan.id, database);
        expect(summary.balance).toBe(0);
        expect(summary.totalPaid).toBe(300);
    });

    it('updates a payment that has a linked savings withdrawal', async () => {
        const { borrower, loan } = await createLoanWithSchedules();
        const originalDate = Date.now() - 86400000;
        const editedDate = Date.now();

        // Create payment via savings
        const payment = await PaymentService.applySavingsToLoan({
            loanId: loan.id,
            amount: 100,
            paymentDate: originalDate,
            borrowerId: borrower.id,
            notes: 'Savings to loan',
            encodedBy: 'admin-user',
            database,
        });

        // Update the payment
        await PaymentService.updatePayment(payment.id, {
            amount: 120,
            paymentDate: editedDate,
            notes: 'updated notes',
            performedBy: 'admin-user',
            database,
        });

        const linkedSavings = await database.get<SavingsTransaction>('savings_transactions')
            .query(Q.where('reference_id', payment.id))
            .fetch();

        const withdrawal = linkedSavings.find(tx => tx.type === 'withdraw_loan');
        expect(withdrawal).toBeDefined();
        expect(withdrawal?.amount).toBe(120);
        expect(new Date(withdrawal?.date as any).getTime()).toBe(editedDate);
        expect(withdrawal?.notes).toContain('updated notes');
    });
});
