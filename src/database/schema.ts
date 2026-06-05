import { appSchema, tableSchema } from '@nozbe/watermelondb'

export const mySchema = appSchema({
    version: 29,
    tables: [
        tableSchema({
            name: 'loan_penalties',
            columns: [
                { name: 'loan_id', type: 'string', isIndexed: true },
                { name: 'amount', type: 'number' },
                { name: 'penalty_date', type: 'number' },
                { name: 'reason', type: 'string', isOptional: true },
                { name: 'created_at', type: 'number' },
                { name: 'updated_at', type: 'number' },
                { name: 'deleted_at', type: 'number', isOptional: true },
            ]
        }),
        tableSchema({
            name: 'user_profiles',
            columns: [
                { name: 'full_name', type: 'string' },
                { name: 'email', type: 'string', isOptional: true },
                { name: 'role', type: 'string' },
                { name: 'is_active', type: 'boolean', isOptional: true },
                { name: 'created_at', type: 'number' },
                { name: 'updated_at', type: 'number' },
                { name: 'deleted_at', type: 'number', isOptional: true },
            ]
        }),
        tableSchema({
            name: 'collectors',
            columns: [
                { name: 'full_name', type: 'string' },
                { name: 'auth_id', type: 'string', isOptional: true },
                { name: 'is_active', type: 'boolean', isOptional: true },
                { name: 'created_at', type: 'number' },
                { name: 'updated_at', type: 'number' },
                { name: 'deleted_at', type: 'number', isOptional: true },
            ]
        }),
        tableSchema({
            name: 'borrowers',
            columns: [
                { name: 'full_name', type: 'string' },
                { name: 'address', type: 'string', isOptional: true },
                { name: 'phone', type: 'string', isOptional: true },
                { name: 'area', type: 'string', isOptional: true },
                { name: 'route_index', type: 'number', isOptional: true },
                { name: 'collector_id', type: 'string', isOptional: true, isIndexed: true },
                { name: 'auth_id', type: 'string', isOptional: true },
                { name: 'date_of_birth', type: 'number', isOptional: true },
                { name: 'gender', type: 'string', isOptional: true },
                { name: 'notes', type: 'string', isOptional: true },
                { name: 'created_by', type: 'string', isOptional: true },
                { name: 'latitude', type: 'number', isOptional: true },
                { name: 'longitude', type: 'number', isOptional: true },
                { name: 'group', type: 'string', isOptional: true },
                { name: 'meeting_day', type: 'string', isOptional: true },
                { name: 'first_name', type: 'string', isOptional: true },
                { name: 'last_name', type: 'string', isOptional: true },
                { name: 'co_maker_name', type: 'string', isOptional: true },
                { name: 'business', type: 'string', isOptional: true },
                { name: 'created_at', type: 'number' },
                { name: 'updated_at', type: 'number' },
                { name: 'deleted_at', type: 'number', isOptional: true },
            ]
        }),
        tableSchema({
            name: 'loans',
            columns: [
                { name: 'borrower_id', type: 'string', isIndexed: true },
                { name: 'loan_number', type: 'string' },
                { name: 'principal_amount', type: 'number' },
                { name: 'interest_rate', type: 'number' },
                { name: 'interest_type', type: 'string' },
                { name: 'term', type: 'number' },
                { name: 'term_unit', type: 'string' },
                { name: 'frequency', type: 'string' },
                { name: 'total_amount', type: 'number' },
                { name: 'installment_amount', type: 'number' },
                { name: 'deposit_amount', type: 'number', isOptional: true },
                { name: 'insurance_amount', type: 'number', isOptional: true },
                { name: 'release_date', type: 'number', isOptional: true },
                { name: 'first_payment_date', type: 'number', isOptional: true },
                { name: 'maturity_date', type: 'number', isOptional: true },
                { name: 'status', type: 'string' },
                { name: 'is_reloan', type: 'boolean', isOptional: true },
                { name: 'previous_loan_id', type: 'string', isOptional: true },
                { name: 'deducted_amount', type: 'number', isOptional: true },
                { name: 'service_charge_amount', type: 'number', isOptional: true },
                { name: 'encoded_by', type: 'string', isOptional: true },
                { name: 'collector_id', type: 'string', isOptional: true, isIndexed: true },
                { name: 'batch', type: 'number', isOptional: true },
                { name: 'cycle', type: 'number', isOptional: true },
                { name: 'interest_amount', type: 'number', isOptional: true },
                { name: 'notes', type: 'string', isOptional: true },
                { name: 'created_at', type: 'number' },
                { name: 'updated_at', type: 'number' },
                { name: 'deleted_at', type: 'number', isOptional: true },
            ]
        }),
        tableSchema({
            name: 'payment_schedules',
            columns: [
                { name: 'loan_id', type: 'string', isIndexed: true },
                { name: 'due_date', type: 'number' },
                { name: 'scheduled_amount', type: 'number' },
                { name: 'principal_amount', type: 'number', isOptional: true },
                { name: 'interest_amount', type: 'number', isOptional: true },
                { name: 'fees_amount', type: 'number', isOptional: true },
                { name: 'status', type: 'string' },
                { name: 'created_at', type: 'number' },
                { name: 'updated_at', type: 'number' },
                { name: 'deleted_at', type: 'number', isOptional: true },
            ]
        }),
        tableSchema({
            name: 'payments',
            columns: [
                { name: 'loan_id', type: 'string', isIndexed: true },
                { name: 'borrower_id', type: 'string', isOptional: true },  // ✅ NEW: FK to borrowers
                { name: 'schedule_id', type: 'string', isOptional: true },
                { name: 'collector_id', type: 'string', isOptional: true, isIndexed: true },
                { name: 'amount', type: 'number' },
                { name: 'payment_date', type: 'number' },
                { name: 'receipt_number', type: 'string', isOptional: true },
                { name: 'notes', type: 'string', isOptional: true },
                { name: 'encoded_at', type: 'number', isOptional: true },
                { name: 'created_at', type: 'number' },
                { name: 'updated_at', type: 'number' },
                { name: 'deleted_at', type: 'number', isOptional: true },
            ]
        }),
        tableSchema({
            name: 'expenses',
            columns: [
                { name: 'category', type: 'string' },
                { name: 'description', type: 'string', isOptional: true },
                { name: 'amount', type: 'number' },
                { name: 'expense_date', type: 'number' },
                { name: 'frequency', type: 'string', isOptional: true },
                { name: 'encoded_by', type: 'string', isOptional: true },
                { name: 'recurring_expense_id', type: 'string', isOptional: true, isIndexed: true },
                { name: 'created_at', type: 'number' },
                { name: 'updated_at', type: 'number' },
                { name: 'deleted_at', type: 'number', isOptional: true },
            ]
        }),
        tableSchema({
            name: 'recurring_expenses',
            columns: [
                { name: 'category', type: 'string' },
                { name: 'description', type: 'string', isOptional: true },
                { name: 'amount', type: 'number' },
                { name: 'frequency', type: 'string' }, // daily, weekly, monthly, yearly
                { name: 'next_due_date', type: 'number' },
                { name: 'is_active', type: 'boolean' },
                { name: 'reminders_enabled', type: 'boolean' },
                { name: 'reminder_time', type: 'string', isOptional: true }, // e.g. "09:00"
                { name: 'encoded_by', type: 'string', isOptional: true },
                { name: 'created_at', type: 'number' },
                { name: 'updated_at', type: 'number' },
                { name: 'deleted_at', type: 'number', isOptional: true },
            ]
        }),
        tableSchema({
            name: 'cash_transactions',
            columns: [
                { name: 'transaction_date', type: 'number' },
                { name: 'particulars', type: 'string' },
                { name: 'type', type: 'string' },
                { name: 'amount', type: 'number' },
                { name: 'remarks', type: 'string', isOptional: true },
                { name: 'recorded_by', type: 'string', isOptional: true },
                { name: 'created_at', type: 'number' },
                { name: 'updated_at', type: 'number' },
                { name: 'deleted_at', type: 'number', isOptional: true },
            ]
        }),
        tableSchema({
            name: 'bank_accounts',
            columns: [
                { name: 'bank_name', type: 'string' },
                { name: 'account_name', type: 'string' },
                { name: 'account_number', type: 'string' },
                { name: 'starting_balance', type: 'number' },
                { name: 'created_at', type: 'number' },
                { name: 'updated_at', type: 'number' },
                { name: 'deleted_at', type: 'number', isOptional: true },
            ]
        }),
        tableSchema({
            name: 'bank_transactions',
            columns: [
                { name: 'bank_account_id', type: 'string', isIndexed: true },
                { name: 'transaction_date', type: 'number' },
                { name: 'type', type: 'string' },
                { name: 'amount', type: 'number' },
                { name: 'particulars', type: 'string' },
                { name: 'remarks', type: 'string', isOptional: true },
                { name: 'created_at', type: 'number' },
                { name: 'updated_at', type: 'number' },
                { name: 'deleted_at', type: 'number', isOptional: true },
            ]
        }),
        tableSchema({
            name: 'collection_logs',
            columns: [
                { name: 'collector_id', type: 'string', isIndexed: true },
                { name: 'log_date', type: 'number' },
                { name: 'total_collected', type: 'number' },
                { name: 'cash_on_hand_start', type: 'number' },
                { name: 'cash_on_hand_end', type: 'number' },
                { name: 'notes', type: 'string', isOptional: true },
                { name: 'created_at', type: 'number' },
                { name: 'updated_at', type: 'number' },
                { name: 'deleted_at', type: 'number', isOptional: true },
            ]
        }),
        tableSchema({
            name: 'financial_snapshots',
            columns: [
                { name: 'snapshot_date', type: 'number' },
                { name: 'total_assets', type: 'number' },
                { name: 'total_equity', type: 'number' },
                { name: 'total_liabilities', type: 'number' },
                { name: 'loan_loss_reserve', type: 'number' },
                { name: 'operating_revenue', type: 'number' },
                { name: 'financial_costs', type: 'number' },
                { name: 'subsidy_adjustment', type: 'number', isOptional: true },
                { name: 'inflation_adjustment', type: 'number', isOptional: true },
                { name: 'risk_weighted_assets', type: 'number', isOptional: true },
                { name: 'created_at', type: 'number' },
                { name: 'updated_at', type: 'number' },
                { name: 'deleted_at', type: 'number', isOptional: true },
            ]
        }),
        tableSchema({
            name: 'remittances',
            columns: [
                { name: 'collector_id', type: 'string', isIndexed: true },
                { name: 'amount', type: 'number' },
                { name: 'remittance_date', type: 'number' },
                { name: 'status', type: 'string' },
                { name: 'approved_by', type: 'string', isOptional: true },
                { name: 'notes', type: 'string', isOptional: true },
                { name: 'created_at', type: 'number' },
                { name: 'updated_at', type: 'number' },
                { name: 'deleted_at', type: 'number', isOptional: true },
            ]
        }),
        tableSchema({
            name: 'savings_transactions',
            columns: [
                { name: 'borrower_id', type: 'string', isIndexed: true },
                { name: 'type', type: 'string' },
                { name: 'amount', type: 'number' },
                { name: 'reference_id', type: 'string', isOptional: true },
                { name: 'date', type: 'number' },
                { name: 'notes', type: 'string', isOptional: true },
                { name: 'created_at', type: 'number' },
                { name: 'updated_at', type: 'number' },
                { name: 'deleted_at', type: 'number', isOptional: true },
            ]
        }),
        tableSchema({
            name: 'expense_categories',
            columns: [
                { name: 'name', type: 'string' },
                { name: 'is_active', type: 'boolean', isOptional: true },
                { name: 'created_at', type: 'number' },
                { name: 'updated_at', type: 'number' },
                { name: 'deleted_at', type: 'number', isOptional: true },
            ]
        }),
        tableSchema({
            name: 'collection_groups',
            columns: [
                { name: 'name', type: 'string' },
                { name: 'collector_id', type: 'string', isOptional: true, isIndexed: true },
                { name: 'collection_day', type: 'number' }, // 0=Sun,1=Mon,...,6=Sat
                { name: 'is_active', type: 'boolean', isOptional: true },
                { name: 'created_at', type: 'number' },
                { name: 'updated_at', type: 'number' },
                { name: 'deleted_at', type: 'number', isOptional: true },
            ]
        }),
        tableSchema({
            name: 'action_logs',
            columns: [
                { name: 'entity_type', type: 'string', isIndexed: true },
                { name: 'entity_id', type: 'string', isIndexed: true },
                { name: 'action', type: 'string' },
                { name: 'performed_by', type: 'string', isIndexed: true },
                { name: 'old_data', type: 'string', isOptional: true },
                { name: 'new_data', type: 'string', isOptional: true },
                { name: 'timestamp', type: 'number' },
                { name: 'created_at', type: 'number' },
                { name: 'updated_at', type: 'number' },
                { name: 'deleted_at', type: 'number', isOptional: true },
            ]
        }),
    ]
})
