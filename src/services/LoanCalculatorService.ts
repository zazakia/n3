import { addFrequency, addNextDaySkipSunday, addFrequencySkipSunday } from '../utils/dates';
import { SeriesService } from './SeriesService';

export interface ScheduleRow {
    number: number;
    dueDate: Date;
    scheduledAmount: number;
    principal: number;
    interest: number;
    fees?: number; // deposit + insurance
    balance: number;
}

export interface LoanCalcResult {
    totalAmount: number;
    installmentAmount: number;
    numPayments: number;
    totalInterest: number;
    totalFees: number;
    schedule: ScheduleRow[];
    firstPaymentDate: Date;
    maturityDate: Date;
}

export class LoanCalculatorService {
    static paymentsForFrequency(term: number, termUnit: string, frequency: string): number {
        if (termUnit === 'days') {
            switch (frequency) {
                case 'daily': return term;
                case 'weekly': return Math.ceil(term / 7);
                case 'bi_monthly': return Math.ceil(term / 15);
                case 'monthly': return Math.ceil(term / 30);
                default: return Math.ceil(term / 30);
            }
        } else {
            switch (frequency) {
                case 'daily': return Math.round(term * 30);
                case 'weekly': return Math.round(term * 4); // Aligned with Excel (24 weeks for 6 months)
                case 'bi_monthly': return term * 2;
                case 'monthly': return term;
                default: return term;
            }
        }
    }

    static firstPaymentDate(releaseDate: Date, frequency: string): Date {
        // First payment is the next day after release, skipping Sunday
        return addNextDaySkipSunday(releaseDate);
    }

    static calculateFlat(
        principal: number,
        ratePercent: number,
        term: number,
        termUnit: string,
        frequency: string,
        releaseDate: Date = new Date(),
        totalDeposit: number = 0,
        totalInsurance: number = 0
    ): LoanCalcResult {
        const numPayments = this.paymentsForFrequency(term, termUnit, frequency);
        
        // Excel Logic: Interest is flat for the whole period (Rate per Term)
        const totalInterest = principal * (ratePercent / 100);
        
        // Now treating inputs as TOTALS for the whole loan
        const totalFees = totalDeposit + totalInsurance;
        const totalAmount = principal + totalInterest + totalFees;
        
        const installmentAmount = totalAmount / numPayments;
        const firstPaymentDate = this.firstPaymentDate(releaseDate, frequency);

        const schedule: ScheduleRow[] = [];
        let currentDate = firstPaymentDate;
        let balance = totalAmount;

        for (let i = 1; i <= numPayments; i++) {
            const periodInterest = totalInterest / numPayments;
            const periodPrincipal = principal / numPayments;
            const periodFees = totalFees / numPayments;
            balance -= installmentAmount;

            schedule.push({
                number: i,
                dueDate: new Date(currentDate),
                scheduledAmount: installmentAmount,
                principal: periodPrincipal,
                interest: periodInterest,
                fees: periodFees,
                balance: Math.max(0, balance),
            });

            currentDate = addFrequencySkipSunday(currentDate, frequency);
        }

        const maturityDate = schedule[schedule.length - 1]?.dueDate ?? firstPaymentDate;

        return {
            totalAmount,
            installmentAmount,
            numPayments,
            totalInterest,
            totalFees,
            schedule,
            firstPaymentDate,
            maturityDate,
        };
    }

    static calculateDiminishing(
        principal: number,
        annualRatePercent: number,
        term: number,
        termUnit: string,
        frequency: string,
        releaseDate: Date = new Date(),
        totalDeposit: number = 0,
        totalInsurance: number = 0
    ): LoanCalcResult {
        const numPayments = this.paymentsForFrequency(term, termUnit, frequency);
        const termInMonths = termUnit === 'days' ? term / 30 : term;
        const periodicRate = (annualRatePercent / 100) / (numPayments / termInMonths * 12);

        let installmentAmount: number;
        if (periodicRate === 0) {
            installmentAmount = principal / numPayments;
        } else {
            installmentAmount =
                (principal * periodicRate * Math.pow(1 + periodicRate, numPayments)) /
                (Math.pow(1 + periodicRate, numPayments) - 1);
        }

        // Divide total fees by numPayments
        const totalFees = totalDeposit + totalInsurance;
        const periodicFees = totalFees / numPayments;
        const finalInstallment = installmentAmount + periodicFees;

        const firstPaymentDate = this.firstPaymentDate(releaseDate, frequency);
        const schedule: ScheduleRow[] = [];
        let balance = principal;
        let totalInterest = 0;
        let currentDate = firstPaymentDate;

        for (let i = 1; i <= numPayments; i++) {
            const interest = balance * periodicRate;
            const principalPart = installmentAmount - interest;
            balance = Math.max(0, balance - principalPart);
            
            totalInterest += interest;

            schedule.push({
                number: i,
                dueDate: new Date(currentDate),
                scheduledAmount: finalInstallment,
                principal: principalPart,
                interest: interest,
                fees: periodicFees,
                balance: balance + (numPayments - i) * periodicFees, // Rough balance including pending fees
            });

            currentDate = addFrequencySkipSunday(currentDate, frequency);
        }

        const maturityDate = schedule[schedule.length - 1]?.dueDate ?? firstPaymentDate;

        return {
            totalAmount: (installmentAmount + periodicFees) * numPayments,
            installmentAmount: finalInstallment,
            numPayments,
            totalInterest,
            totalFees,
            schedule,
            firstPaymentDate,
            maturityDate,
        };
    }

    static calculate(
        principal: number,
        ratePercent: number,
        term: number,
        termUnit: string,
        interestType: string,
        frequency: string,
        releaseDate: Date = new Date(),
        totalDeposit: number = 0,
        totalInsurance: number = 0
    ): LoanCalcResult {
        if (interestType === 'diminishing') {
            return this.calculateDiminishing(principal, ratePercent, term, termUnit, frequency, releaseDate, totalDeposit, totalInsurance);
        }
        return this.calculateFlat(principal, ratePercent, term, termUnit, frequency, releaseDate, totalDeposit, totalInsurance);
    }

    static calculateNetProceeds(principal: number, deposit: number, insurance: number, previousBalance: number): number {
        return Math.max(0, principal - (previousBalance || 0));
    }

    static generateLoanNumber(): string {
        return SeriesService.generateLoanNumber();
    }

    static getFormulaBasis(interestType: string = 'flat') {
        const isFlat = interestType === 'flat';
        return {
            interest: isFlat 
                ? 'Principal × (Rate / 100)' 
                : 'Reducing Balance Calculation based on Annual Rate',
            totalLoan: 'Principal + Total Interest + Total Savings + Total Insurance',
            installment: 'Total Loan / Number of Payments',
            netRelease: 'Principal - Previous Loan Balance (if renewal)',
            savings: 'Allocated portion of total savings per payment',
            insurance: 'Allocated portion of total insurance per payment'
        };
    }
}
