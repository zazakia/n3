import { LoanCalculatorService } from '../LoanCalculatorService';

describe('LoanCalculatorService', () => {
    describe('paymentsForFrequency', () => {
        it('returns correct payment count for different frequencies', () => {
            expect(LoanCalculatorService.paymentsForFrequency(12, 'months', 'monthly')).toBe(12);
            expect(LoanCalculatorService.paymentsForFrequency(12, 'months', 'bi_monthly')).toBe(24);
            expect(LoanCalculatorService.paymentsForFrequency(1, 'months', 'weekly')).toBe(4);
            expect(LoanCalculatorService.paymentsForFrequency(6, 'months', 'weekly')).toBe(24);
            expect(LoanCalculatorService.paymentsForFrequency(1, 'months', 'daily')).toBe(30);
        });

        it('handles days term unit', () => {
            expect(LoanCalculatorService.paymentsForFrequency(30, 'days', 'daily')).toBe(30);
            expect(LoanCalculatorService.paymentsForFrequency(30, 'days', 'weekly')).toBe(Math.ceil(30 / 7));
            expect(LoanCalculatorService.paymentsForFrequency(30, 'days', 'bi_monthly')).toBe(2);
            expect(LoanCalculatorService.paymentsForFrequency(30, 'days', 'monthly')).toBe(1);
            expect(LoanCalculatorService.paymentsForFrequency(30, 'days', 'unknown')).toBe(1);
        });

        it('handles default switch cases', () => {
            expect(LoanCalculatorService.paymentsForFrequency(1, 'months', 'unknown')).toBe(1);
        });
    });

    describe('calculateFlat', () => {
        it('calculates flat interest loan correctly (new period-based logic)', () => {
            const principal = 10000;
            const rate = 12; // 12% flat for the term
            const term = 12; 
            const frequency = 'monthly';
            const releaseDate = new Date('2024-01-01');

            const result = LoanCalculatorService.calculateFlat(principal, rate, term, 'months', frequency, releaseDate);

            // Interest = 10000 * 0.12 = 1200
            // Total = 11200
            // Installment = 11200 / 12 = 933.333
            expect(result.totalAmount).toBe(11200);
            expect(result.installmentAmount).toBeCloseTo(933.333, 3);
            expect(result.totalInterest).toBe(1200);
            expect(result.schedule.length).toBe(12);
        });

        it('matches the Excel spreadsheet example (PHP 5,000, 20% rate, 6 months, weekly)', () => {
            const principal = 5000;
            const rate = 20; // 20% flat
            const term = 6;
            const unit = 'months';
            const frequency = 'weekly';
            const deposit = 50;
            const insurance = 17;

            const result = LoanCalculatorService.calculateFlat(principal, rate, term, unit, frequency, new Date(), deposit, insurance);

            // numPayments = 6 * 4 = 24
            // totalInterest = 5000 * 0.20 = 1000
            // totalFees = (50 + 17) * 24 = 67 * 24 = 1608
            // totalAmount = 5000 + 1000 + 1608 = 7608
            // installmentAmount = 7608 / 24 = 317

            expect(result.numPayments).toBe(24);
            expect(result.totalInterest).toBe(1000);
            expect(result.totalFees).toBe(67);
            expect(result.totalAmount).toBe(6067);
            expect(result.installmentAmount).toBeCloseTo(252.79, 2);
            expect(result.schedule[0].fees).toBeCloseTo(2.79, 2);
        });

        it('handles case with no payments correctly in maturityDate check', () => {
             jest.spyOn(LoanCalculatorService, 'paymentsForFrequency').mockReturnValueOnce(0);
             const result = LoanCalculatorService.calculateFlat(1000, 10, 1, 'months', 'monthly');
             expect(result.schedule.length).toBe(0);
             expect(result.maturityDate).toBeInstanceOf(Date);
        });
    });

    describe('calculateDiminishing', () => {
        it('calculates diminishing interest loan correctly', () => {
            const principal = 10000;
            const rate = 12;
            const term = 12;
            const frequency = 'monthly';

            const result = LoanCalculatorService.calculateDiminishing(principal, rate, term, 'months', frequency);

            // Amortization formula should produce roughly 888.49
            expect(result.installmentAmount).toBeCloseTo(888.49, 2);
            expect(result.schedule.length).toBe(12);
            expect(result.schedule[11].balance).toBeCloseTo(0, 2);
        });

        it('handles 0% interest for diminishing', () => {
            const result = LoanCalculatorService.calculateDiminishing(12000, 0, 12, 'months', 'monthly');
            expect(result.installmentAmount).toBe(1000);
            expect(result.schedule[0].interest).toBe(0);
        });

        it('handles maturityDate for empty diminishing result', () => {
            jest.spyOn(LoanCalculatorService, 'paymentsForFrequency').mockReturnValueOnce(0);
            const result = LoanCalculatorService.calculateDiminishing(1000, 10, 1, 'months', 'monthly');
            expect(result.schedule.length).toBe(0);
            expect(result.maturityDate).toBeInstanceOf(Date);
        });

        it('handles zero interest and fees for flat calculation', () => {
            const result = LoanCalculatorService.calculateFlat(1000, 0, 1, 'months', 'monthly', new Date(), 0, 0);
            expect(result.totalInterest).toBe(0);
            expect(result.totalFees).toBe(0);
            expect(result.totalAmount).toBe(1000);
            expect(result.installmentAmount).toBe(1000);
        });

        it('handles daily frequency over a month term', () => {
            const result = LoanCalculatorService.calculateFlat(3000, 10, 1, 'months', 'daily'); // 30 payments
            expect(result.numPayments).toBe(30);
            expect(result.totalInterest).toBe(300); // 10% of 3000
            expect(result.installmentAmount).toBe(110); // 3300 / 30
            expect(result.schedule.length).toBe(30);
        });

        it('handles invalid term unit by defaulting or consistent behavior', () => {
            // Should behave like months as per switch default
            const result = LoanCalculatorService.calculateFlat(1000, 10, 1, 'invalid', 'monthly');
            expect(result.numPayments).toBe(1);
        });

        it('handles days term in diminishing calculation', () => {
            const result = LoanCalculatorService.calculateDiminishing(10000, 12, 180, 'days', 'monthly');
            expect(result.numPayments).toBe(6); // 180 / 30 = 6 months
        });
    });

    describe('calculate wrapper', () => {
        it('calls correct implementation based on type', () => {
            const spyFlat = jest.spyOn(LoanCalculatorService, 'calculateFlat');
            const spyDim = jest.spyOn(LoanCalculatorService, 'calculateDiminishing');

            LoanCalculatorService.calculate(1000, 10, 1, 'months', 'flat', 'monthly');
            expect(spyFlat).toHaveBeenCalled();

            LoanCalculatorService.calculate(1000, 10, 1, 'months', 'diminishing', 'monthly');
            expect(spyDim).toHaveBeenCalled();
        });
    });

    describe('generateLoanNumber', () => {
        it('generates a string with LN- prefix', () => {
            const num = LoanCalculatorService.generateLoanNumber();
            expect(num).toMatch(/^LN-\d{8}-\d{6}-\d{6}$/);
        });
    });

    describe('calculateNetProceeds', () => {
        it('subtracts old balance from principal', () => {
            const principal = 10000;
            const deposit = 500;
            const insurance = 100;
            const oldBalance = 2000;
            const net = LoanCalculatorService.calculateNetProceeds(principal, deposit, insurance, oldBalance);
            expect(net).toBe(8000); // 10000 - 2000
        });

        it('returns 0 if deductions exceed principal', () => {
            const net = LoanCalculatorService.calculateNetProceeds(1000, 500, 500, 1000);
            expect(net).toBe(0);
        });

        it('handles undefined or null fees', () => {
            const net = LoanCalculatorService.calculateNetProceeds(5000, 0, 0, 1000);
            expect(net).toBe(4000);
        });

        it('handles zero or missing previous balance', () => {
            const net = LoanCalculatorService.calculateNetProceeds(5000, 0, 0, 0);
            expect(net).toBe(5000);
        });
    });
});
