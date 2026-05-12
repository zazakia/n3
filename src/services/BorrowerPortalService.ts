/**
 * BorrowerPortalService — Direct Supabase queries for the Borrower Portal.
 *
 * This service queries Supabase directly (no WatermelonDB sync) to ensure:
 *  - Borrowers can only see their own data (enforced by RLS + auth_id filtering)
 *  - No sensitive data is synced to borrower devices
 *  - Simple read-only access pattern
 */

import { supabase } from '../database/supabase';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BorrowerProfile {
    id: string;
    fullName: string;
    firstName: string;
    lastName: string;
    phone: string;
    address: string;
    area: string;
    gender: string;
    business: string;
    coMakerName: string;
    dateOfBirth: string | null;
    group: string;
    collectorId: string;
    authId: string;
    createdAt: string;
}

export interface BorrowerLoan {
    id: string;
    loanNumber: string;
    principalAmount: number;
    interestRate: number;
    interestType: string;
    term: number;
    termUnit: string;
    frequency: string;
    totalAmount: number;
    installmentAmount: number;
    depositAmount: number;
    insuranceAmount: number;
    releaseDate: string;
    firstPaymentDate: string;
    maturityDate: string;
    status: string;
    isReloan: boolean;
    interestAmount: number;
    notes: string;
    createdAt: string;
}

export interface BorrowerPayment {
    id: string;
    loanId: string;
    amount: number;
    paymentDate: string;
    receiptNumber: string;
    notes: string;
    loanNumber?: string;
    createdAt: string;
}

export interface BorrowerPaymentSchedule {
    id: string;
    loanId: string;
    dueDate: string;
    scheduledAmount: number;
    principalAmount: number;
    interestAmount: number;
    feesAmount: number;
    status: string; // 'pending' | 'paid' | 'partial' | 'late'
}

export interface DashboardStats {
    totalOutstanding: number;
    totalPaidAllTime: number;
    activeLoansCount: number;
    nextPaymentAmount: number;
    nextPaymentDate: string | null;
    daysUntilNextPayment: number | null;
}

export interface LoanDetail extends BorrowerLoan {
    totalPaid: number;
    balance: number;
    progress: number; // 0-100
    payments: BorrowerPayment[];
    schedules: BorrowerPaymentSchedule[];
}

// ─── Supabase remote table names ────────────────────────────────────────────

const TABLES = {
    borrowers: 'app_borrowers',
    loans: 'app_loans',
    payments: 'app_payments',
    paymentSchedules: 'app_payment_schedules',
    userProfiles: 'user_profiles',
} as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function mapBorrower(row: any): BorrowerProfile {
    return {
        id: row.id,
        fullName: row.full_name || '',
        firstName: row.first_name || '',
        lastName: row.last_name || '',
        phone: row.phone || '',
        address: row.address || '',
        area: row.area || '',
        gender: row.gender || '',
        business: row.business || '',
        coMakerName: row.co_maker_name || '',
        dateOfBirth: row.date_of_birth || null,
        group: row.group || '',
        collectorId: row.collector_id || '',
        authId: row.auth_id || '',
        createdAt: row.created_at || '',
    };
}

function mapLoan(row: any): BorrowerLoan {
    return {
        id: row.id,
        loanNumber: row.loan_number || '',
        principalAmount: row.principal_amount || 0,
        interestRate: row.interest_rate || 0,
        interestType: row.interest_type || '',
        term: row.term || 0,
        termUnit: row.term_unit || '',
        frequency: row.frequency || '',
        totalAmount: row.total_amount || 0,
        installmentAmount: row.installment_amount || 0,
        depositAmount: row.deposit_amount || 0,
        insuranceAmount: row.insurance_amount || 0,
        releaseDate: row.release_date || '',
        firstPaymentDate: row.first_payment_date || '',
        maturityDate: row.maturity_date || '',
        status: row.status || '',
        isReloan: row.is_reloan || false,
        interestAmount: row.interest_amount || 0,
        notes: row.notes || '',
        createdAt: row.created_at || '',
    };
}

function mapPayment(row: any): BorrowerPayment {
    return {
        id: row.id,
        loanId: row.loan_id || '',
        amount: row.amount || 0,
        paymentDate: row.payment_date || '',
        receiptNumber: row.receipt_number || '',
        notes: row.notes || '',
        loanNumber: row.loan_number,
        createdAt: row.created_at || '',
    };
}

function mapSchedule(row: any): BorrowerPaymentSchedule {
    return {
        id: row.id,
        loanId: row.loan_id || '',
        dueDate: row.due_date || '',
        scheduledAmount: row.scheduled_amount || 0,
        principalAmount: row.principal_amount || 0,
        interestAmount: row.interest_amount || 0,
        feesAmount: row.fees_amount || 0,
        status: row.status || 'pending',
    };
}

// ─── Service ────────────────────────────────────────────────────────────────

export class BorrowerPortalService {

    /**
     * Get the borrower profile linked to the currently authenticated user.
     */
    static async getBorrowerProfile(authId: string): Promise<BorrowerProfile | null> {
        const { data, error } = await supabase
            .from(TABLES.borrowers)
            .select('*')
            .eq('auth_id', authId)
            .is('deleted_at', null)
            .maybeSingle();

        if (error) {
            console.error('[BorrowerPortalService] getBorrowerProfile error:', error.message);
            throw error;
        }

        return data ? mapBorrower(data) : null;
    }

    /**
     * Get all loans for a borrower, optionally filtered by status.
     */
    static async getLoans(borrowerId: string, statusFilter?: string): Promise<BorrowerLoan[]> {
        let query = supabase
            .from(TABLES.loans)
            .select('*')
            .eq('borrower_id', borrowerId)
            .is('deleted_at', null)
            .order('release_date', { ascending: false });

        if (statusFilter && statusFilter !== 'all') {
            query = query.eq('status', statusFilter);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[BorrowerPortalService] getLoans error:', error.message);
            throw error;
        }

        return (data || []).map(mapLoan);
    }

    /**
     * Get full loan detail with payments and schedules.
     */
    static async getLoanDetail(loanId: string, borrowerId: string): Promise<LoanDetail | null> {
        // Fetch loan (verify it belongs to this borrower)
        const { data: loanData, error: loanError } = await supabase
            .from(TABLES.loans)
            .select('*')
            .eq('id', loanId)
            .eq('borrower_id', borrowerId)
            .is('deleted_at', null)
            .maybeSingle();

        if (loanError) {
            console.error('[BorrowerPortalService] getLoanDetail loan error:', loanError.message);
            throw loanError;
        }

        if (!loanData) return null;

        // Fetch payments
        const { data: paymentsData, error: paymentsError } = await supabase
            .from(TABLES.payments)
            .select('*')
            .eq('loan_id', loanId)
            .is('deleted_at', null)
            .order('payment_date', { ascending: false });

        if (paymentsError) {
            console.error('[BorrowerPortalService] getLoanDetail payments error:', paymentsError.message);
            throw paymentsError;
        }

        // Fetch schedules
        const { data: schedulesData, error: schedulesError } = await supabase
            .from(TABLES.paymentSchedules)
            .select('*')
            .eq('loan_id', loanId)
            .is('deleted_at', null)
            .order('due_date', { ascending: true });

        if (schedulesError) {
            console.error('[BorrowerPortalService] getLoanDetail schedules error:', schedulesError.message);
            throw schedulesError;
        }

        const loan = mapLoan(loanData);
        const payments = (paymentsData || []).map(mapPayment);
        const schedules = (schedulesData || []).map(mapSchedule);

        const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
        const balance = Math.max(0, loan.totalAmount - totalPaid);
        const progress = loan.totalAmount > 0 ? Math.min(100, (totalPaid / loan.totalAmount) * 100) : 0;

        return {
            ...loan,
            totalPaid,
            balance,
            progress,
            payments,
            schedules,
        };
    }

    /**
     * Get all payments for a borrower across all their loans.
     */
    static async getPayments(borrowerId: string, loanIdFilter?: string): Promise<BorrowerPayment[]> {
        // First get all loan IDs for this borrower
        const { data: loans, error: loansError } = await supabase
            .from(TABLES.loans)
            .select('id, loan_number')
            .eq('borrower_id', borrowerId)
            .is('deleted_at', null);

        if (loansError) {
            console.error('[BorrowerPortalService] getPayments loans error:', loansError.message);
            throw loansError;
        }

        if (!loans || loans.length === 0) return [];

        const loanMap = new Map(loans.map((l: any) => [l.id, l.loan_number]));
        const loanIds = loanIdFilter ? [loanIdFilter] : Array.from(loanMap.keys());

        const { data: paymentsData, error: paymentsError } = await supabase
            .from(TABLES.payments)
            .select('*')
            .in('loan_id', loanIds)
            .is('deleted_at', null)
            .order('payment_date', { ascending: false });

        if (paymentsError) {
            console.error('[BorrowerPortalService] getPayments error:', paymentsError.message);
            throw paymentsError;
        }

        return (paymentsData || []).map((row: any) => ({
            ...mapPayment(row),
            loanNumber: loanMap.get(row.loan_id) || '',
        }));
    }

    /**
     * Get payment schedules for a specific loan.
     */
    static async getPaymentSchedules(loanId: string): Promise<BorrowerPaymentSchedule[]> {
        const { data, error } = await supabase
            .from(TABLES.paymentSchedules)
            .select('*')
            .eq('loan_id', loanId)
            .is('deleted_at', null)
            .order('due_date', { ascending: true });

        if (error) {
            console.error('[BorrowerPortalService] getPaymentSchedules error:', error.message);
            throw error;
        }

        return (data || []).map(mapSchedule);
    }

    /**
     * Dashboard stats for a borrower.
     */
    static async getDashboardStats(borrowerId: string): Promise<DashboardStats> {
        // Fetch active loans
        const { data: activeLoans, error: loansError } = await supabase
            .from(TABLES.loans)
            .select('id, total_amount, installment_amount, status')
            .eq('borrower_id', borrowerId)
            .in('status', ['active', 'defaulted'])
            .is('deleted_at', null);

        if (loansError) {
            console.error('[BorrowerPortalService] getDashboardStats loans error:', loansError.message);
            throw loansError;
        }

        if (!activeLoans || activeLoans.length === 0) {
            return {
                totalOutstanding: 0,
                totalPaidAllTime: 0,
                activeLoansCount: 0,
                nextPaymentAmount: 0,
                nextPaymentDate: null,
                daysUntilNextPayment: null,
            };
        }

        const loanIds = activeLoans.map((l: any) => l.id);

        // Fetch payments for active loans
        const { data: payments, error: pError } = await supabase
            .from(TABLES.payments)
            .select('loan_id, amount')
            .in('loan_id', loanIds)
            .is('deleted_at', null);

        if (pError) {
            console.error('[BorrowerPortalService] getDashboardStats payments error:', pError.message);
            throw pError;
        }

        // Calculate total paid per loan
        const paidByLoan = new Map<string, number>();
        (payments || []).forEach((p: any) => {
            paidByLoan.set(p.loan_id, (paidByLoan.get(p.loan_id) || 0) + p.amount);
        });

        let totalOutstanding = 0;
        for (const loan of activeLoans) {
            const paid = paidByLoan.get(loan.id) || 0;
            totalOutstanding += Math.max(0, loan.total_amount - paid);
        }

        // Fetch all-time payments for total summary
        const { data: allLoans } = await supabase
            .from(TABLES.loans)
            .select('id')
            .eq('borrower_id', borrowerId)
            .is('deleted_at', null);

        let totalPaidAllTime = 0;
        if (allLoans && allLoans.length > 0) {
            const allLoanIds = allLoans.map((l: any) => l.id);
            const { data: allPayments } = await supabase
                .from(TABLES.payments)
                .select('amount')
                .in('loan_id', allLoanIds)
                .is('deleted_at', null);

            totalPaidAllTime = (allPayments || []).reduce((sum: number, p: any) => sum + p.amount, 0);
        }

        // Find next upcoming payment schedule
        const now = new Date().toISOString();
        const { data: nextSchedule } = await supabase
            .from(TABLES.paymentSchedules)
            .select('due_date, scheduled_amount')
            .in('loan_id', loanIds)
            .in('status', ['pending', 'partial'])
            .is('deleted_at', null)
            .gte('due_date', now)
            .order('due_date', { ascending: true })
            .limit(1);

        let nextPaymentAmount = activeLoans[0]?.installment_amount || 0;
        let nextPaymentDate: string | null = null;
        let daysUntilNextPayment: number | null = null;

        if (nextSchedule && nextSchedule.length > 0) {
            nextPaymentAmount = nextSchedule[0].scheduled_amount;
            nextPaymentDate = nextSchedule[0].due_date;
            const dueDate = new Date(nextPaymentDate!);
            const today = new Date();
            daysUntilNextPayment = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        }

        return {
            totalOutstanding,
            totalPaidAllTime,
            activeLoansCount: activeLoans.length,
            nextPaymentAmount,
            nextPaymentDate,
            daysUntilNextPayment,
        };
    }

    /**
     * Register a new borrower account (self-registration).
     * Creates a Supabase auth user and a user_profiles record with role 'borrower'.
     */
    static async registerBorrower(
        email: string,
        password: string,
        fullName: string,
        phone: string
    ): Promise<{ success: boolean; message: string }> {
        try {
            // 1. Create Supabase auth user
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email: email.trim(),
                password: password.trim(),
                options: {
                    data: {
                        full_name: fullName.trim(),
                        role: 'borrower',
                    },
                },
            });

            if (authError) {
                console.error('[BorrowerPortalService] Registration auth error:', authError.message);
                return { success: false, message: authError.message };
            }

            if (!authData.user) {
                return { success: false, message: 'Failed to create user account.' };
            }

            // 2. Create user_profiles record
            const { error: profileError } = await supabase
                .from(TABLES.userProfiles)
                .upsert({
                    id: authData.user.id,
                    full_name: fullName.trim(),
                    email: email.trim().toLowerCase(),
                    role: 'borrower',
                    is_active: true,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                });

            if (profileError) {
                console.error('[BorrowerPortalService] Profile creation error:', profileError.message);
                // Auth user was created but profile failed — return partial success
                return {
                    success: true,
                    message: 'Account created but profile setup had an issue. Please contact support.',
                };
            }

            return {
                success: true,
                message: 'Account created successfully! Please wait for an administrator to link your borrower profile.',
            };
        } catch (error: any) {
            console.error('[BorrowerPortalService] registerBorrower error:', error);
            return { success: false, message: error.message || 'Registration failed.' };
        }
    }
}
