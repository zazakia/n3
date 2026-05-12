import { Database } from '@nozbe/watermelondb';
import LokiJSAdapter from '@nozbe/watermelondb/adapters/lokijs';
import Loki from 'lokijs';
import { mySchema } from '../database/schema';
import UserProfile from '../database/models/UserProfile';
import Collector from '../database/models/Collector';
import Borrower from '../database/models/Borrower';
import Loan from '../database/models/Loan';
import Payment from '../database/models/Payment';
import PaymentSchedule from '../database/models/PaymentSchedule';
import Expense from '../database/models/Expense';
import CashTransaction from '../database/models/CashTransaction';
import BankAccount from '../database/models/BankAccount';
import BankTransaction from '../database/models/BankTransaction';
import CollectionLog from '../database/models/CollectionLog';
import FinancialSnapshot from '../database/models/FinancialSnapshot';
import Remittance from '../database/models/Remittance';
import SavingsTransaction from '../database/models/SavingsTransaction';
import ExpenseCategory from '../database/models/ExpenseCategory';
import LoanPenalty from '../database/models/LoanPenalty';
import CollectionGroup from '../database/models/CollectionGroup';
import ActionLog from '../database/models/ActionLog';

export const modelClasses = [
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
];

export function createTestLokiAdapter(schema = mySchema) {
    return new LokiJSAdapter({
        dbName: 'test_db_' + Math.random().toString(36).substring(7),
        schema,
        useWebWorker: false,
        useIncrementalIndexedDB: false,
        _testLokiAdapter: new Loki.LokiMemoryAdapter(),
        extraLokiOptions: {
            autosave: false,
        },
    } as any);
}

export function createTestDatabase() {
    return new Database({
        adapter: createTestLokiAdapter(),
        modelClasses,
    });
}

export async function closeTestDatabase(database?: Database | null) {
    if (!database) {
        return;
    }

    try {
        await database.write(async () => {
            await database.unsafeResetDatabase();
        });
    } catch {
        // Best-effort cleanup for test teardown only.
    }

    const loki = (database.adapter as any)?._driver?.loki;
    if (loki?.close) {
        await new Promise<void>((resolve) => {
            try {
                if (loki.close.length > 0) {
                    loki.close(() => resolve());
                } else {
                    loki.close();
                    resolve();
                }
            } catch {
                resolve();
            }
        });
    }
}

export async function createTestData(database: Database, options: {
    collectorName?: string,
    borrowerName?: string,
    loanAmount?: number,
    status?: string,
    frequency?: string
} = {}) {
    return await database.write(async () => {
        const collector = await database.get<Collector>('collectors').create((c) => {
            c.fullName = options.collectorName || 'Test Collector';
            c.isActive = true;
        });

        const borrower = await database.get<Borrower>('borrowers').create((b) => {
            b.fullName = options.borrowerName || 'Test Borrower';
            b.collectorId = collector.id;
        });

        const loan = await database.get<Loan>('loans').create((l) => {
            l.borrowerId = borrower.id;
            l.principalAmount = options.loanAmount || 1000;
            l.interestAmount = (options.loanAmount || 1000) * 0.2;
            l.totalAmount = l.principalAmount + l.interestAmount;
            l.status = options.status || 'active';
            l.frequency = options.frequency || 'daily';
            l.installmentAmount = l.totalAmount / 30;
        });

        return { collector, borrower, loan };
    });
}
