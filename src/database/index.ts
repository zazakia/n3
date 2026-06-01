import { Platform } from 'react-native';
import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
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
import RecurringExpense from './models/RecurringExpense';

const modelClasses = [
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
    RecurringExpense,
];

if (process.env.NODE_ENV !== 'test') console.log('[Database] Starting initialization...');

let adapter;

try {
    if (Platform.OS === 'web' || process.env.NODE_ENV === 'test') {
        if (process.env.NODE_ENV !== 'test') console.log('[Database] Detecting Web platform (LokiJS)...');
        let LokiJSAdapter;
        try {
            // Attempt to load LokiJS adapter for web
            const LokiJSModule = require('@nozbe/watermelondb/adapters/lokijs');
            LokiJSAdapter = LokiJSModule.default || LokiJSModule;
        } catch (requireErr) {
            console.error('[Database] Failed to require LokiJSAdapter. Ensure @nozbe/watermelondb is installed correctly.', requireErr);
        }

        if (LokiJSAdapter) {
            const testLokiAdapter =
                process.env.NODE_ENV === 'test'
                    ? new (require('lokijs').LokiMemoryAdapter)()
                    : undefined;
            adapter = new LokiJSAdapter({
                schema: mySchema,
                migrations: myMigrations,
                useWebWorker: false,
                useIncrementalIndexedDB: process.env.NODE_ENV !== 'test',
                _testLokiAdapter: testLokiAdapter,
                extraLokiOptions: process.env.NODE_ENV === 'test' ? { autosave: false } : undefined,
                onQuotaExceeded: (error) => {
                    console.error('[Database] Storage quota exceeded!', error);
                },
                onSetUpError: (error) => {
                    console.error('[Database] LokiJS setup error:', error);
                },
            } as any);
            if (process.env.NODE_ENV !== 'test') console.log('[Database] LokiJSAdapter initialized');
        }
    } else {
        if (process.env.NODE_ENV !== 'test') console.log('[Database] Detecting Native platform (SQLite)...');
        if (!SQLiteAdapter) {
            console.error('[Database] SQLiteAdapter class is missing/undefined!');
        } else {
            adapter = new SQLiteAdapter({
                schema: mySchema,
                migrations: myMigrations,
                jsi: false,
                onSetUpError: (error) => {
                    console.error('[Database] WatermelonDB setup error:', error);
                },
            });
            if (process.env.NODE_ENV !== 'test') console.log('[Database] SQLiteAdapter initialized');
        }
    }
} catch (e) {
    console.error('[Database] CRITICAL: Exception during adapter initialization:', e);
}

if (!adapter) {
    console.error('[Database] FATAL: No database adapter was initialized. Using fail-safe mock adapter.');
    // We must provide an adapter to prevent the Database constructor from throwing a fatal error.
    adapter = {
        schema: mySchema,
        migrations: undefined,
        dbName: 'fallback',
        batch: async () => [],
        find: async () => null,
        query: async () => [],
        count: async () => 0,
        create: async () => { throw new Error('Database not initialized') },
        update: async () => { throw new Error('Database not initialized') },
        destroyPermanently: async () => { throw new Error('Database not initialized') },
        unsafeResetDatabase: async () => { throw new Error('Database not initialized') },
        getLocal: async () => null,
        setLocal: async () => {},
        removeLocal: async () => {},
        getDeletedRecords: async () => [],
        destroyDeletedRecords: async () => {},
        // Missing properties that might be accessed by internal WatermelonDB logic
        collections: {},
        schemaVersion: mySchema.version,
        testMode: false,
    } as any;
}

if (process.env.NODE_ENV !== 'test') console.log('[Database] Initializing with models:', modelClasses.map(m => m.table));

export const database = new Database({
    adapter,
    modelClasses,
});

if (process.env.NODE_ENV !== 'test') console.log('[Database] Database instance created successfully');
