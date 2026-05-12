import { Database } from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import { setGenerator } from '@nozbe/watermelondb/utils/common/randomId';
import uuid from 'react-native-uuid';
import { mySchema } from './schema';
import { myMigrations } from './migrations';

// Configure WatermelonDB to use standard UUID v4 for record IDs.
// This is required for compatibility with Supabase UUID columns.
setGenerator(() => uuid.v4() as string);

import Borrower from './models/Borrower';
import Loan from './models/Loan';
import Payment from './models/Payment';
import PaymentSchedule from './models/PaymentSchedule';
import Expense from './models/Expense';
import CashTransaction from './models/CashTransaction';
import BankAccount from './models/BankAccount';
import BankTransaction from './models/BankTransaction';
import CollectionLog from './models/CollectionLog';
import FinancialSnapshot from './models/FinancialSnapshot';
import UserProfile from './models/UserProfile';
import Remittance from './models/Remittance';
import SavingsTransaction from './models/SavingsTransaction';
import ExpenseCategory from './models/ExpenseCategory';
import Collector from './models/Collector';
import LoanPenalty from './models/LoanPenalty';
import CollectionGroup from './models/CollectionGroup';
import ActionLog from './models/ActionLog';

const adapter = new LokiJSAdapter({
    dbName: `infinityfinance-v${mySchema.version}`,
    schema: mySchema,
    migrations: myMigrations,
    useWebWorker: false,
    useIncrementalIndexedDB: process.env.NODE_ENV !== 'test',
    _testLokiAdapter:
        process.env.NODE_ENV === 'test'
            ? new (require('lokijs').LokiMemoryAdapter)()
            : undefined,
    extraLokiOptions: process.env.NODE_ENV === 'test' ? { autosave: false } : undefined,
    onQuotaExceededError: (error: any) => {
        console.error("Quota exceeded:", error);
    },
    onSetUpError: (error: Error) => {
        console.error('[Database] Failed to initialize local web database:', error);
    },
    extraIncrementalIDBOptions: {
        onversionchange: () => {
            console.warn('[Database] Local web database changed in another tab. Reloading this tab.');
            if (typeof window !== 'undefined') {
                window.location.reload();
            }
        },
        onDidOverwrite: () => {
            console.warn('[Database] Local web database was refreshed by another tab.');
        },
    },
} as any);

export const database = new Database({
    adapter,
    modelClasses: [
        UserProfile,
        Collector,
        Borrower,
        Loan,
        Payment,
        PaymentSchedule,
        Expense,
        CashTransaction,
        BankAccount,
        BankTransaction,
        CollectionLog,
        FinancialSnapshot,
        Remittance,
        SavingsTransaction,
        ExpenseCategory,
        LoanPenalty,
        CollectionGroup,
        ActionLog,
    ],
});
