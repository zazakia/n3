import { database } from '../database';
import { Database, Q } from '@nozbe/watermelondb';
import CashTransaction from '../database/models/CashTransaction';
import Payment from '../database/models/Payment';
import Expense from '../database/models/Expense';
import Remittance from '../database/models/Remittance';
import { coerceMoneyAmount } from '../utils/currency';

/**
 * Soft-delete filter — used in every query to exclude logically deleted records.
 */
const NOT_DELETED = Q.where('deleted_at', null);

export class CashService {
    private db: Database;
    constructor(db: Database = database) {
        this.db = db;
    }

    private static defaultInstance = new CashService();

    static async getCurrentBalance(): Promise<number> {
        return this.defaultInstance.getCurrentBalance();
    }

    static async getCollectorBalance(collectorId: string): Promise<number> {
        return this.defaultInstance.getCollectorBalance(collectorId);
    }

    static async getTodayCollection(): Promise<number> {
        return this.defaultInstance.getTodayCollection();
    }

    static async getMonthCollection(): Promise<number> {
        return this.defaultInstance.getMonthCollection();
    }

    async getCurrentBalance(): Promise<number> {
        try {
            if (!this.db || !this.db.collections) {
                console.error('CashService.getCurrentBalance: Database or collections not initialized');
                return 0;
            }
            const txnsCollection = this.db.collections.get<CashTransaction>('cash_transactions');
            const remittancesCollection = this.db.collections.get<Remittance>('remittances');
            const expensesCollection = this.db.collections.get<Expense>('expenses');
            if (!txnsCollection || !remittancesCollection || !expensesCollection) {
                return 0;
            }

            // Filter soft-deleted records from all queries
            const txns = await txnsCollection.query(NOT_DELETED).fetch();
            const remittances = await remittancesCollection.query(
                NOT_DELETED,
                Q.where('status', 'approved')
            ).fetch();
            const expenses = await expensesCollection.query(NOT_DELETED).fetch();
            // Starting balance from starting_balance type transactions
            const startingBalance = txns
                .filter(t => t.type === 'starting_balance')
                .reduce((s, t) => s + coerceMoneyAmount(t.amount), 0);

            // Manual cash ins
            const cashIn = txns
                .filter(t => t.type === 'in')
                .reduce((s, t) => s + coerceMoneyAmount(t.amount), 0);

            // Manual cash outs
            const cashOut = txns
                .filter(t => t.type === 'out')
                .reduce((s, t) => s + coerceMoneyAmount(t.amount), 0);

            // Remittances received (Only approved ones are added to admin cash)
            const remittancesTotal = remittances.reduce((s, r) => s + coerceMoneyAmount(r.amount), 0);

            // Expenses
            const expensesTotal = expenses.reduce((s, e) => s + coerceMoneyAmount(e.amount), 0);

            // Current cash-on-hand must come from the explicit cash ledger:
            // starting balance + manual cash-ins + approved remittances
            // - manual cash-outs - expenses.
            //
            // Using all historical loan disbursements here double-counts old
            // portfolio history and makes the dashboard go deeply negative on
            // imported datasets that have no matching cash ledger entries.
            const balance = startingBalance + cashIn + remittancesTotal - expensesTotal - cashOut;
            return balance;
        } catch (e) {
            console.error('CashService.getCurrentBalance error:', e);
            return 0;
        }
    }

    /**
     * Calculates the cash currently held by a collector.
     * Cash = Total Payments Collected - Total Approved Remittances
     */
    async getCollectorBalance(collectorId: string): Promise<number> {
        try {
            if (!this.db || !this.db.collections) {
                console.error('CashService.getCollectorBalance: Database or collections not initialized');
                return 0;
            }
            const payments = await this.db.collections.get<Payment>('payments')
                .query(
                    NOT_DELETED,
                    Q.where('collector_id', collectorId)
                )
                .fetch();
            
            const approvedRemittances = await this.db.collections.get<Remittance>('remittances')
                .query(
                    NOT_DELETED,
                    Q.where('collector_id', collectorId),
                    Q.where('status', 'approved')
                ).fetch();

            const totalCollected = payments.reduce((s, p) => s + coerceMoneyAmount(p.amount), 0);
            const totalRemitted = approvedRemittances.reduce((s, r) => s + coerceMoneyAmount(r.amount), 0);

            return totalCollected - totalRemitted;
        } catch (e) {
            console.error('CashService.getCollectorBalance error:', e);
            return 0;
        }
    }

    /**
     * Uses database-level date filtering instead of loading all payments into memory.
     */
    async getTodayCollection(): Promise<number> {
        try {
            if (!this.db || !this.db.collections) return 0;
            const today = new Date();
            const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
            const endOfDay = startOfDay + 86400000;

            const payments = await this.db.collections.get<Payment>('payments').query(
                NOT_DELETED,
                Q.where('payment_date', Q.gte(startOfDay)),
                Q.where('payment_date', Q.lt(endOfDay))
            ).fetch();

            return payments.reduce((s, p) => s + coerceMoneyAmount(p.amount), 0);
        } catch (e) {
            console.error('CashService.getTodayCollection error:', e);
            return 0;
        }
    }

    /**
     * Uses database-level date filtering instead of loading all payments into memory.
     */
    async getMonthCollection(): Promise<number> {
        try {
            if (!this.db || !this.db.collections) return 0;
            const today = new Date();
            const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
            const startOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1).getTime();

            const payments = await this.db.collections.get<Payment>('payments').query(
                NOT_DELETED,
                Q.where('payment_date', Q.gte(startOfMonth)),
                Q.where('payment_date', Q.lt(startOfNextMonth))
            ).fetch();

            return payments.reduce((s, p) => s + coerceMoneyAmount(p.amount), 0);
        } catch (e) {
            console.error('CashService.getMonthCollection error:', e);
            return 0;
        }
    }
}
