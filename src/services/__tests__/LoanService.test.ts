import { Database, Q } from '@nozbe/watermelondb';
import { createTestDatabase, closeTestDatabase, createTestData } from '../../__tests__/test-utils';
import { LoanService } from '../LoanService';
import Loan from '../../database/models/Loan';
import Payment from '../../database/models/Payment';
import PaymentSchedule from '../../database/models/PaymentSchedule';
import { LoanCalculatorService } from '../LoanCalculatorService';
import uuid from 'react-native-uuid';

describe('LoanService', () => {
    let database: Database;

    beforeEach(() => {
        database = createTestDatabase();
    });

    afterEach(async () => {
        await closeTestDatabase(database);
    });

    it('should save a new loan and generate schedules', async () => {
        const { borrower, collector } = await createTestData(database);
        const loanId = uuid.v4().toString();
        const calcResult = LoanCalculatorService.calculate(
            1000, 20, 30, 'days', 'flat', 'daily', new Date(), 0, 0
        );

        await LoanService.saveLoan({
            loanId,
            loanNumber: 'L-001',
            borrowerId: borrower.id,
            principalAmount: 1000,
            interestRate: 20,
            interestType: 'flat',
            term: 30,
            termUnit: 'days',
            frequency: 'daily',
            calcResult,
            depositAmount: 0,
            insuranceAmount: 0,
            collectorId: collector.id,
            encodedBy: 'test-user',
            releaseDate: new Date(),
            status: 'active',
            isReloan: false,
            interestAmount: 200,
            isEditing: false,
            database
        });

        const loan = await database.get<Loan>('loans').find(loanId);
        expect(loan.principalAmount).toBe(1000);
        expect(loan.status).toBe('active');

        const schedules = await database.get<PaymentSchedule>('payment_schedules')
            .query()
            .fetch();
        expect(schedules.length).toBe(calcResult.schedule.length);
        expect(schedules[0].loanId).toBe(loanId);
    });

    it('should handle reloan and close previous loan', async () => {
        const { borrower, collector, loan: oldLoan } = await createTestData(database, {
            loanAmount: 1000,
            status: 'active'
        });

        // Add some pending schedules to old loan
        await database.write(async () => {
            await database.get<PaymentSchedule>('payment_schedules').create(s => {
                s.loanId = oldLoan.id;
                s.status = 'pending';
                s.scheduledAmount = 100;
                s.dueDate = new Date().getTime();
            });
        });

        const newLoanId = uuid.v4().toString();
        const calcResult = LoanCalculatorService.calculate(
            2000, 20, 30, 'days', 'flat', 'daily', new Date(), 0, 0
        );

        await LoanService.saveLoan({
            loanId: newLoanId,
            loanNumber: 'L-002',
            borrowerId: borrower.id,
            principalAmount: 2000,
            interestRate: 20,
            interestType: 'flat',
            term: 30,
            termUnit: 'days',
            frequency: 'daily',
            calcResult,
            depositAmount: 0,
            insuranceAmount: 0,
            collectorId: collector.id,
            encodedBy: 'test-user',
            releaseDate: new Date(),
            status: 'active',
            isReloan: true,
            previousLoanId: oldLoan.id,
            deductedAmount: 500,
            interestAmount: 400,
            isEditing: false,
            database
        });

        // Verify old loan is closed
        const updatedOldLoan = await database.get<Loan>('loans').find(oldLoan.id);
        expect(updatedOldLoan.status).toBe('paid');

        // Verify closing payment was created
        const payments = await database.get<Payment>('payments')
            .query()
            .fetch();
        const closingPayment = payments.find(p => p.loanId === oldLoan.id);
        expect(closingPayment).toBeDefined();
        expect(closingPayment?.amount).toBe(500);
        expect(closingPayment?.borrowerId).toBe(borrower.id);
        expect(closingPayment?.notes).toContain('Closed via Renewal');

        // Verify old schedules are marked as paid
        const oldSchedules = await database.get<PaymentSchedule>('payment_schedules')
            .query()
            .fetch();
        const pendingOldSchedules = oldSchedules.filter(s => s.loanId === oldLoan.id && s.status === 'pending');
        expect(pendingOldSchedules.length).toBe(0);
    });

    it('dates the renewal closing payment on the new loan release date', async () => {
        const { borrower, collector, loan: oldLoan } = await createTestData(database, {
            loanAmount: 1000,
            status: 'active'
        });
        const releaseDate = new Date('2026-04-21T00:00:00.000Z');
        const newLoanId = uuid.v4().toString();
        const calcResult = LoanCalculatorService.calculate(
            2000, 20, 30, 'days', 'flat', 'daily', releaseDate, 0, 0
        );

        await LoanService.saveLoan({
            loanId: newLoanId,
            loanNumber: 'L-RELEASE-DATE',
            borrowerId: borrower.id,
            principalAmount: 2000,
            interestRate: 20,
            interestType: 'flat',
            term: 30,
            termUnit: 'days',
            frequency: 'daily',
            calcResult,
            collectorId: collector.id,
            encodedBy: 'test-user',
            releaseDate,
            status: 'active',
            isReloan: true,
            previousLoanId: oldLoan.id,
            deductedAmount: 500,
            interestAmount: 400,
            isEditing: false,
            database
        });

        const payments = await database.get<Payment>('payments')
            .query(Q.where('loan_id', oldLoan.id))
            .fetch();
        expect(payments).toHaveLength(1);
        expect(new Date(payments[0].paymentDate as any).getTime()).toBe(releaseDate.getTime());
    });

    it('closes previous loan on renewal even when deductedAmount is zero (no closing payment)', async () => {
        const { borrower, collector, loan: oldLoan } = await createTestData(database, {
            loanAmount: 1000,
            status: 'active'
        });

        await database.write(async () => {
            await database.get<PaymentSchedule>('payment_schedules').create(s => {
                s.loanId = oldLoan.id;
                s.status = 'pending';
                s.scheduledAmount = 100;
                s.dueDate = new Date().getTime();
            });
        });

        const newLoanId = uuid.v4().toString();
        const calcResult = LoanCalculatorService.calculate(
            2000, 20, 30, 'days', 'flat', 'daily', new Date(), 0, 0
        );

        await LoanService.saveLoan({
            loanId: newLoanId,
            loanNumber: 'L-003',
            borrowerId: borrower.id,
            principalAmount: 2000,
            interestRate: 20,
            interestType: 'flat',
            term: 30,
            termUnit: 'days',
            frequency: 'daily',
            calcResult,
            collectorId: collector.id,
            encodedBy: 'test-user',
            releaseDate: new Date(),
            status: 'active',
            isReloan: true,
            previousLoanId: oldLoan.id,
            deductedAmount: 0,
            interestAmount: 400,
            isEditing: false,
            database
        });

        const updatedOldLoan = await database.get<Loan>('loans').find(oldLoan.id);
        expect(updatedOldLoan.status).toBe('paid');

        // No closing payment when deductedAmount is 0
        const payments = await database.get<Payment>('payments').query(Q.where('loan_id', oldLoan.id)).fetch();
        expect(payments).toHaveLength(0);

        // Old schedules should be marked paid
        const oldSchedules = await database.get<PaymentSchedule>('payment_schedules').query(Q.where('loan_id', oldLoan.id)).fetch();
        expect(oldSchedules.every(s => s.status === 'paid')).toBe(true);
    });

    it('should update an existing loan when isEditing is true', async () => {
        const { borrower, collector, loan: existingLoan } = await createTestData(database);

        const calcResult = LoanCalculatorService.calculate(
            1500, 20, 30, 'days', 'flat', 'daily', new Date(), 0, 0
        );

        await LoanService.saveLoan({
            loanId: existingLoan.id,
            loanNumber: existingLoan.loanNumber,
            borrowerId: borrower.id,
            principalAmount: 1500,
            interestRate: 20,
            interestType: 'flat',
            term: 30,
            termUnit: 'days',
            frequency: 'daily',
            calcResult,
            depositAmount: 0,
            insuranceAmount: 0,
            collectorId: collector.id,
            encodedBy: 'test-user',
            releaseDate: new Date(),
            status: 'active',
            isReloan: false,
            interestAmount: 300,
            isEditing: true,
            existingLoan: existingLoan,
            database
        });

        const updatedLoan = await database.get<Loan>('loans').find(existingLoan.id);
        expect(updatedLoan.principalAmount).toBe(1500);
    });

    it('blocks active-loan edits once payments exist', async () => {
        const { borrower, collector, loan: existingLoan } = await createTestData(database, {
            loanAmount: 1000,
            status: 'active'
        });
        await database.write(async () => {
            await database.get<Payment>('payments').create(payment => {
                payment.loanId = existingLoan.id;
                payment.amount = 100;
                payment.paymentDate = Date.now();
                payment.collectorId = collector.id;
            });
        });

        const calcResult = LoanCalculatorService.calculate(
            1500, 20, 30, 'days', 'flat', 'daily', new Date(), 0, 0
        );

        await expect(LoanService.saveLoan({
            loanId: existingLoan.id,
            loanNumber: existingLoan.loanNumber,
            borrowerId: borrower.id,
            principalAmount: 1500,
            interestRate: 20,
            interestType: 'flat',
            term: 30,
            termUnit: 'days',
            frequency: 'daily',
            calcResult,
            collectorId: collector.id,
            encodedBy: 'test-user',
            releaseDate: new Date(),
            status: 'active',
            isReloan: false,
            interestAmount: 300,
            isEditing: true,
            existingLoan,
            database
        })).rejects.toThrow('Cannot edit an active loan after payments have been recorded');
    });

    it('saves a pending loan without generating schedules', async () => {
        const { borrower, collector } = await createTestData(database);
        const loanId = uuid.v4().toString();
        const calcResult = LoanCalculatorService.calculate(
            1000, 20, 30, 'days', 'flat', 'daily', new Date(), 0, 0
        );

        await LoanService.saveLoan({
            loanId,
            loanNumber: 'L-PENDING',
            borrowerId: borrower.id,
            principalAmount: 1000,
            interestRate: 20,
            interestType: 'flat',
            term: 30,
            termUnit: 'days',
            frequency: 'daily',
            calcResult,
            collectorId: collector.id,
            encodedBy: 'test-user',
            releaseDate: new Date(),
            status: 'pending',
            isReloan: false,
            interestAmount: 200,
            isEditing: false,
            database
        });

        const loan = await database.get<Loan>('loans').find(loanId);
        expect(loan.status).toBe('pending');

        const schedules = await database.get<PaymentSchedule>('payment_schedules').query(Q.where('loan_id', loanId)).fetch();
        expect(schedules).toHaveLength(0);
    });

    it('accepts a numeric timestamp for releaseDate', async () => {
        const { borrower, collector } = await createTestData(database);
        const loanId = uuid.v4().toString();
        const ts = new Date('2026-01-15').getTime();
        const calcResult = LoanCalculatorService.calculate(
            1000, 20, 30, 'days', 'flat', 'daily', new Date(ts), 0, 0
        );

        await LoanService.saveLoan({
            loanId,
            loanNumber: 'L-TS',
            borrowerId: borrower.id,
            principalAmount: 1000,
            interestRate: 20,
            interestType: 'flat',
            term: 30,
            termUnit: 'days',
            frequency: 'daily',
            calcResult,
            collectorId: collector.id,
            encodedBy: 'test-user',
            releaseDate: ts,
            status: 'active',
            isReloan: false,
            interestAmount: 200,
            isEditing: false,
            database
        });

        const loan = await database.get<Loan>('loans').find(loanId);
        expect(loan.releaseDate).toBeTruthy();
    });
});
