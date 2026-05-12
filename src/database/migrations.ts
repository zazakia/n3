import { schemaMigrations, addColumns, createTable } from '@nozbe/watermelondb/Schema/migrations'

export const myMigrations = schemaMigrations({
  migrations: [
    {
      toVersion: 12,
      steps: [
        addColumns({
          table: 'borrowers',
          columns: [
            { name: 'group', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 13,
      steps: [
        addColumns({
          table: 'borrowers',
          columns: [
            { name: 'first_name', type: 'string', isOptional: true },
            { name: 'last_name', type: 'string', isOptional: true },
            { name: 'co_maker_name', type: 'string', isOptional: true },
            { name: 'business', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 14,
      steps: [
        addColumns({
          table: 'loans',
          columns: [
            { name: 'deducted_amount', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 15,
      steps: [
        addColumns({
          table: 'borrowers',
          columns: [
            { name: 'date_of_birth', type: 'number', isOptional: true },
            { name: 'gender', type: 'string', isOptional: true },
            { name: 'latitude', type: 'number', isOptional: true },
            { name: 'longitude', type: 'number', isOptional: true },
          ],
        }),
        createTable({
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
          ],
        }),
        createTable({
          name: 'expense_categories',
          columns: [
            { name: 'name', type: 'string' },
            { name: 'is_active', type: 'boolean', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 16,
      steps: [
        createTable({
          name: 'collectors',
          columns: [
            { name: 'full_name', type: 'string' },
            { name: 'is_active', type: 'boolean', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 17,
      steps: [
        addColumns({
          table: 'collectors',
          columns: [
            { name: 'auth_id', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 18,
      steps: [
        addColumns({
          table: 'user_profiles',
          columns: [
            { name: 'deleted_at', type: 'number', isOptional: true },
          ],
        }),
        addColumns({
          table: 'collectors',
          columns: [
            { name: 'deleted_at', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 19,
      steps: [
        addColumns({
          table: 'loans',
          columns: [
            { name: 'batch', type: 'number', isOptional: true },
            { name: 'cycle', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 20,
      steps: [
        createTable({
          name: 'loan_penalties',
          columns: [
            { name: 'loan_id', type: 'string', isIndexed: true },
            { name: 'amount', type: 'number' },
            { name: 'penalty_date', type: 'number' },
            { name: 'reason', type: 'string', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    {
      toVersion: 21,
      steps: [
        addColumns({
          table: 'loan_penalties',
          columns: [
            { name: 'deleted_at', type: 'number', isOptional: true },
          ],
        }),
        addColumns({
          table: 'borrowers',
          columns: [
            { name: 'deleted_at', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 22,
      steps: [
        createTable({
          name: 'collection_groups',
          columns: [
            { name: 'name', type: 'string' },
            { name: 'collector_id', type: 'string', isOptional: true, isIndexed: true },
            { name: 'collection_day', type: 'number' },
            { name: 'is_active', type: 'boolean', isOptional: true },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
            { name: 'deleted_at', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 23,
      steps: [
        addColumns({
          table: 'payment_schedules',
          columns: [
            { name: 'principal_amount', type: 'number', isOptional: true },
            { name: 'interest_amount', type: 'number', isOptional: true },
            { name: 'fees_amount', type: 'number', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 24,
      steps: [
        addColumns({
          table: 'loans',
          columns: [
            { name: 'interest_amount', type: 'number', isOptional: true },
            { name: 'notes', type: 'string', isOptional: true },
          ],
        }),
      ],
    },
    {
      toVersion: 25,
      steps: [
        addColumns({ table: 'loans', columns: [{ name: 'deleted_at', type: 'number', isOptional: true }] }),
        addColumns({ table: 'payment_schedules', columns: [{ name: 'deleted_at', type: 'number', isOptional: true }] }),
        addColumns({ table: 'payments', columns: [{ name: 'deleted_at', type: 'number', isOptional: true }] }),
        addColumns({ table: 'expenses', columns: [{ name: 'deleted_at', type: 'number', isOptional: true }] }),
        addColumns({ table: 'cash_transactions', columns: [{ name: 'deleted_at', type: 'number', isOptional: true }] }),
        addColumns({ table: 'bank_accounts', columns: [{ name: 'deleted_at', type: 'number', isOptional: true }] }),
        addColumns({ table: 'bank_transactions', columns: [{ name: 'deleted_at', type: 'number', isOptional: true }] }),
        addColumns({ table: 'collection_logs', columns: [{ name: 'deleted_at', type: 'number', isOptional: true }] }),
        addColumns({ table: 'financial_snapshots', columns: [{ name: 'deleted_at', type: 'number', isOptional: true }] }),
        addColumns({ table: 'remittances', columns: [{ name: 'deleted_at', type: 'number', isOptional: true }] }),
        addColumns({ table: 'savings_transactions', columns: [{ name: 'deleted_at', type: 'number', isOptional: true }] }),
        addColumns({ table: 'expense_categories', columns: [{ name: 'deleted_at', type: 'number', isOptional: true }] }),
        createTable({
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
          ],
        }),
      ],
    },
  ],
})
