import { BorrowerPortalService } from '../BorrowerPortalService';
import { supabase } from '../../database/supabase';

// Mock Supabase
jest.mock('../../database/supabase', () => ({
    supabase: {
        from: jest.fn(),
        auth: {
            signUp: jest.fn(),
        },
    },
}));

describe('BorrowerPortalService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    const createMockSupabaseChain = (data: any = null, error: any = null) => {
        const chain: any = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            in: jest.fn().mockReturnThis(),
            is: jest.fn().mockReturnThis(),
            gte: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            upsert: jest.fn(),
            maybeSingle: jest.fn(),
            single: jest.fn(),
            then: (resolve: any) => resolve({ data, error }),
        };
        chain.maybeSingle.mockResolvedValue({ data, error });
        chain.single.mockResolvedValue({ data, error });
        chain.upsert.mockResolvedValue({ data, error });
        return chain;
    };

    describe('getBorrowerProfile', () => {
        it('fetches successfully', async () => {
            (supabase.from as jest.Mock).mockReturnValue(createMockSupabaseChain({ id: 'b1' }));
            const result = await BorrowerPortalService.getBorrowerProfile('u1');
            expect(result?.id).toBe('b1');
        });
        it('throws error', async () => {
            (supabase.from as jest.Mock).mockReturnValue(createMockSupabaseChain(null, new Error('DB Err')));
            await expect(BorrowerPortalService.getBorrowerProfile('u1')).rejects.toThrow();
        });
    });

    describe('getLoans', () => {
        it('fetches loans', async () => {
            (supabase.from as jest.Mock).mockReturnValue(createMockSupabaseChain([{ id: 'l1' }]));
            const result = await BorrowerPortalService.getLoans('b1', 'all');
            expect(result).toHaveLength(1);
        });
        it('filters by status', async () => {
             const chain = createMockSupabaseChain([]);
             (supabase.from as jest.Mock).mockReturnValue(chain);
             await BorrowerPortalService.getLoans('b1', 'active');
             expect(chain.eq).toHaveBeenCalledWith('status', 'active');
        });
        it('throws error', async () => {
            (supabase.from as jest.Mock).mockReturnValue(createMockSupabaseChain(null, new Error('DB Err')));
            await expect(BorrowerPortalService.getLoans('b1')).rejects.toThrow();
        });
    });

    describe('getLoanDetail', () => {
        it('fetches full detail', async () => {
            (supabase.from as jest.Mock).mockImplementation((table) => {
                if (table === 'app_loans') return createMockSupabaseChain({ id: 'l1', total_amount: 1000 });
                if (table === 'app_payments') return createMockSupabaseChain([{ amount: 500 }]);
                return createMockSupabaseChain([{ id: 's1' }]);
            });
            const result = await BorrowerPortalService.getLoanDetail('l1', 'b1');
            expect(result?.totalPaid).toBe(500);
        });

        it('returns null if loan not found', async () => {
            (supabase.from as jest.Mock).mockReturnValue(createMockSupabaseChain(null));
            expect(await BorrowerPortalService.getLoanDetail('l1', 'b1')).toBeNull();
        });

        it('throws on loan fetch error', async () => {
            (supabase.from as jest.Mock).mockReturnValue(createMockSupabaseChain(null, new Error('Loan Err')));
            await expect(BorrowerPortalService.getLoanDetail('l1', 'b1')).rejects.toThrow('Loan Err');
        });

        it('throws on payments fetch error', async () => {
            (supabase.from as jest.Mock).mockImplementation((table) => {
                if (table === 'app_loans') return createMockSupabaseChain({ id: 'l1' });
                return createMockSupabaseChain(null, new Error('Payments Err'));
            });
            await expect(BorrowerPortalService.getLoanDetail('l1', 'b1')).rejects.toThrow('Payments Err');
        });

        it('throws on schedules fetch error', async () => {
            (supabase.from as jest.Mock).mockImplementation((table) => {
                if (table === 'app_loans') return createMockSupabaseChain({ id: 'l1' });
                if (table === 'app_payments') return createMockSupabaseChain([]);
                return createMockSupabaseChain(null, new Error('Schedules Err'));
            });
            await expect(BorrowerPortalService.getLoanDetail('l1', 'b1')).rejects.toThrow('Schedules Err');
        });
    });

    describe('getPayments', () => {
        it('fetches payments', async () => {
            (supabase.from as jest.Mock).mockImplementation((table) => {
                if (table === 'app_loans') return createMockSupabaseChain([{ id: 'l1', loan_number: 'LN1' }]);
                return createMockSupabaseChain([{ id: 'p1', loan_id: 'l1', amount: 100 }]);
            });
            const result = await BorrowerPortalService.getPayments('b1');
            expect(result[0].loanNumber).toBe('LN1');
        });

        it('returns empty if no loans', async () => {
            (supabase.from as jest.Mock).mockReturnValue(createMockSupabaseChain([]));
            expect(await BorrowerPortalService.getPayments('b1')).toEqual([]);
        });

        it('throws on loans fetch error', async () => {
            (supabase.from as jest.Mock).mockReturnValue(createMockSupabaseChain(null, new Error('L Err')));
            await expect(BorrowerPortalService.getPayments('b1')).rejects.toThrow('L Err');
        });

        it('throws on payments fetch error', async () => {
            (supabase.from as jest.Mock).mockImplementation((table) => {
                if (table === 'app_loans') return createMockSupabaseChain([{ id: 'l1' }]);
                return createMockSupabaseChain(null, new Error('Pay Err'));
            });
            await expect(BorrowerPortalService.getPayments('b1')).rejects.toThrow('Pay Err');
        });
    });

    describe('getPaymentSchedules', () => {
        it('fetches schedules', async () => {
            (supabase.from as jest.Mock).mockReturnValue(createMockSupabaseChain([{ id: 's1' }]));
            const result = await BorrowerPortalService.getPaymentSchedules('l1');
            expect(result).toHaveLength(1);
        });
        it('throws error', async () => {
            (supabase.from as jest.Mock).mockReturnValue(createMockSupabaseChain(null, new Error('Sch Err')));
            await expect(BorrowerPortalService.getPaymentSchedules('l1')).rejects.toThrow();
        });
    });

    describe('getDashboardStats', () => {
        it('calculates stats', async () => {
            let call = 0;
            (supabase.from as jest.Mock).mockImplementation((table) => {
                call++;
                if (table === 'app_loans' && call === 1) return createMockSupabaseChain([{ id: 'l1', total_amount: 1000, installment_amount: 100 }]);
                if (table === 'app_payments' && call === 2) return createMockSupabaseChain([{ loan_id: 'l1', amount: 300 }]);
                if (table === 'app_loans' && call === 3) return createMockSupabaseChain([{ id: 'l1' }]);
                if (table === 'app_payments' && call === 4) return createMockSupabaseChain([{ amount: 300 }]);
                if (table === 'app_payment_schedules') return createMockSupabaseChain([{ due_date: '2099-01-01', scheduled_amount: 100 }]);
                return createMockSupabaseChain();
            });
            const stats = await BorrowerPortalService.getDashboardStats('b1');
            expect(stats.totalOutstanding).toBe(700);
        });

        it('returns zeros if no active loans', async () => {
            (supabase.from as jest.Mock).mockReturnValue(createMockSupabaseChain([]));
            const stats = await BorrowerPortalService.getDashboardStats('b1');
            expect(stats.activeLoansCount).toBe(0);
        });

        it('throws on loans fetch error', async () => {
            (supabase.from as jest.Mock).mockReturnValue(createMockSupabaseChain(null, new Error('DL Err')));
            await expect(BorrowerPortalService.getDashboardStats('b1')).rejects.toThrow('DL Err');
        });

        it('throws on payments fetch error', async () => {
            let call = 0;
            (supabase.from as jest.Mock).mockImplementation((table) => {
                call++;
                if (table === 'app_loans') return createMockSupabaseChain([{id: 'l1'}]);
                return createMockSupabaseChain(null, new Error('DP Err'));
            });
            await expect(BorrowerPortalService.getDashboardStats('b1')).rejects.toThrow('DP Err');
        });
    });

    describe('registerBorrower', () => {
        it('registers successfully', async () => {
            (supabase.auth.signUp as jest.Mock).mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
            (supabase.from as jest.Mock).mockReturnValue(createMockSupabaseChain({}));
            const res = await BorrowerPortalService.registerBorrower('a@b.com', '123', 'John', '123');
            expect(res.success).toBe(true);
        });
        it('handles auth error', async () => {
            (supabase.auth.signUp as jest.Mock).mockResolvedValue({ data: { user: null }, error: new Error('Auth Err') });
            const res = await BorrowerPortalService.registerBorrower('a@b.com', '123', 'John', '123');
            expect(res.success).toBe(false);
            expect(res.message).toBe('Auth Err');
        });
        it('handles missing user in auth response', async () => {
            (supabase.auth.signUp as jest.Mock).mockResolvedValue({ data: { user: null }, error: null });
            const res = await BorrowerPortalService.registerBorrower('a@b.com', '123', 'John', '123');
            expect(res.success).toBe(false);
            expect(res.message).toBe('Failed to create user account.');
        });
        it('handles profile error with partial success', async () => {
            (supabase.auth.signUp as jest.Mock).mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
            (supabase.from as jest.Mock).mockReturnValue(createMockSupabaseChain(null, new Error('Prof Err')));
            const res = await BorrowerPortalService.registerBorrower('a@b.com', '123', 'John', '123');
            expect(res.success).toBe(true);
            expect(res.message).toContain('Account created but profile setup had an issue');
        });
        it('handles general catch block error', async () => {
            (supabase.auth.signUp as jest.Mock).mockRejectedValue(new Error('Catch Err'));
            const res = await BorrowerPortalService.registerBorrower('a@b.com', '123', 'John', '123');
            expect(res.success).toBe(false);
            expect(res.message).toBe('Catch Err');
        });
    });
});
