import { Platform } from 'react-native';
import { synchronize } from '@nozbe/watermelondb/sync';
import { Q } from '@nozbe/watermelondb';
import { database } from '../database';
import { supabase as globalSupabase, withTimeout } from '../database/supabase';
import { perf } from '../utils/PerformanceTracker';
import { useSyncStore } from '../stores/syncStore';
import { ErrorService, ErrorType } from './ErrorService';

// Local WatermelonDB table names
const SYNC_TABLES = [
    'user_profiles',
    'borrowers',
    'loans',
    'payment_schedules',
    'payments',
    'expenses',
    'cash_transactions',
    'bank_accounts',
    'bank_transactions',
    'collection_logs',
    'financial_snapshots',
    'remittances',
    'savings_transactions',
    'expense_categories',
    'collectors',
    'loan_penalties',
    'collection_groups',
    'action_logs',
    'recurring_expenses',
];

// Mapping from WatermelonDB local table name → Supabase remote table name
const REMOTE_TABLE_MAP: Record<string, string> = {
    user_profiles: 'user_profiles',
    borrowers: 'app_borrowers',
    loans: 'app_loans',
    payment_schedules: 'app_payment_schedules',
    payments: 'app_payments',
    expenses: 'app_expenses',
    cash_transactions: 'app_cash_transactions',
    bank_accounts: 'app_bank_accounts',
    bank_transactions: 'app_bank_transactions',
    collection_logs: 'app_collection_logs',
    financial_snapshots: 'app_financial_snapshots',
    remittances: 'app_remittances',
    savings_transactions: 'app_savings_transactions',
    expense_categories: 'app_expense_categories',
    collectors: 'app_collectors',
    loan_penalties: 'app_loan_penalties',
    collection_groups: 'collection_groups',
    action_logs: 'app_action_logs',
    recurring_expenses: 'app_recurring_expenses',
};

const MIN_SYNC_INTERVAL = 60000; // 60 seconds cooldown
const SYNC_SESSION_TIMEOUT_MS = 8000;
const SERVER_TIME_TIMEOUT_MS = 5000;
const TABLE_PAGE_TIMEOUT_MS = 10000;
const UPSERT_TIMEOUT_MS = 10000;

const withSyncTimeout = async <T,>(
    promise: PromiseLike<T>,
    timeoutMs: number,
    operationName: string
): Promise<T> => {
    const normalizedPromise = Promise.resolve(promise);

    if (typeof withTimeout === 'function') {
        return withTimeout(normalizedPromise, timeoutMs, operationName);
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutId = setTimeout(
            () => reject(new Error(`${operationName} timed out after ${timeoutMs}ms`)),
            timeoutMs
        );
    });

    try {
        return await Promise.race([normalizedPromise, timeoutPromise]);
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
};

const REMOTE_TO_LOCAL_MAPPING: Record<string, string> = Object.fromEntries(
    Object.entries(REMOTE_TABLE_MAP).map(([local, remote]) => [remote, local])
);

export class SyncService {
    private static readonly DATE_FIELDS = [
        'created_at',
        'updated_at',
        'deleted_at',
        'date_of_birth',
        'release_date',
        'first_payment_date',
        'maturity_date',
        'due_date',
        'payment_date',
        'penalty_date',
        'expense_date',
        'transaction_date',
        'log_date',
        'snapshot_date',
        'encoded_at',
        'remittance_date',
        'date',
        'timestamp',
        'next_due_date'
    ];

    /**
     * Fields that are stored as BIGINT (epoch milliseconds) in Supabase.
     * These should NOT be converted to ISO strings.
     */
    private static readonly BIGINT_DATE_FIELDS = [
        'penalty_date',
        'next_due_date'
    ];

    /**
     * FK fields that must contain valid UUIDs or be nullified.
     * Invalid UUIDs in these fields cause FK constraint violations on push.
     */
    private static readonly UUID_FK_FIELDS = [
        'collector_id', 'auth_id', 'created_by', 'encoded_by', 'borrower_id',
        'loan_id', 'schedule_id', 'previous_loan_id', 'bank_account_id', 'recurring_expense_id'
    ];

    private static readonly UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    private isSyncing = false;
    private clockOffset = 0;


    constructor(
        private db = database,
        private supabase = globalSupabase
    ) {}

    private static instance = new SyncService();

    static setInstance(instance: SyncService): void {
        this.instance = instance;
    }

    static async checkAndSync(options: { force?: boolean } = {}): Promise<void> {
        return this.instance.checkAndSync(options);
    }

    static async updatePendingCount(): Promise<number> {
        return this.instance.updatePendingCount();
    }

    static async sync(force: boolean = false): Promise<void> {
        return this.instance.sync(force);
    }

    /**
     * Entry point for sync check
     */
    public async checkAndSync(options: { force?: boolean } = {}): Promise<void> {
        if (this.isSyncing) {
            console.log('[SyncService] Sync already in progress, skipping checkAndSync...');
            useSyncStore.getState().setSyncProgress({
                currentModel: 'Sync already running',
            });
            return;
        }
        await this.sync(options.force);
        await this.updatePendingCount();
    }

    /**
     * Updates the global store with the number of pending changes.
     * Uses a single query per table (Q.oneOf) instead of 3 separate queries.
     */
    public async updatePendingCount(): Promise<number> {
        try {
            let totalPending = 0;
            for (const tableName of SYNC_TABLES) {
                try {
                    const collection = this.db.get(tableName);
                    if (!collection) continue;
                    const count = await collection.query(
                        Q.where('_status', Q.oneOf(['created', 'updated', 'deleted']))
                    ).fetchCount();
                    totalPending += count;
                } catch (tableErr) {
                    console.warn(`[SyncService] Skipping pending count for ${tableName}:`, tableErr);
                }
            }
            useSyncStore.getState().setSyncProgress({ pendingChanges: totalPending });
            return totalPending;
        } catch (error) {
            console.warn('[SyncService] Failed to update pending count:', error);
            return 0;
        }
    }

    /**
     * Performs the actual synchronization
     */
    public async sync(force: boolean = false): Promise<void> {
        if (this.isSyncing) {
            console.log('[SyncService] Sync already in progress, skipping...');
            useSyncStore.getState().setSyncProgress({
                currentModel: 'Sync already running',
            });
            return;
        }

        const store = useSyncStore.getState();

        // Offline devices should not start a regular sync cycle.
        if (store.isOnline === false && !force) {
            console.log('[SyncService] Device is offline, skipping sync...');
            store.setSyncProgress({
                status: 'completed',
                progress: 1,
                currentModel: 'Offline mode',
            });
            return;
        }

        // Throttling logic: skip automatic syncs if last sync was very recent
        const lastSyncAt = store.lastSyncAt;
        if (!force && lastSyncAt) {
            const timeSinceLastSync = Date.now() - new Date(lastSyncAt).getTime();
            if (timeSinceLastSync < MIN_SYNC_INTERVAL) {
                console.log(`[SyncService] Sync throttled (last sync ${Math.round(timeSinceLastSync / 1000)}s ago). Use force=true to override.`);
                store.setSyncProgress({
                    status: 'completed',
                    progress: 1,
                    currentModel: 'Sync recently completed',
                });
                return;
            }
        }

        this.isSyncing = true;
        const startTime = Date.now();
        console.log('[SyncService] Starting sync cycle...');

        try {
            store.setSyncProgress({ status: 'syncing', progress: 0.04, currentModel: 'Checking session...', errorMessage: null });

            // Ensure we have a session before attempting to sync with Supabase
            const { data: { session } } = await withSyncTimeout(
                this.supabase.auth.getSession(),
                SYNC_SESSION_TIMEOUT_MS,
                'Sync session check'
            );
            if (!session) {
                console.warn('[SyncService] Skipping sync: No active session found');
                store.setSyncProgress({
                    status: 'error',
                    progress: 1,
                    currentModel: 'No active session',
                    errorMessage: 'No active session found for sync',
                });
                return;
            }
            store.setSyncProgress({ status: 'syncing', progress: 0, currentModel: 'Initializing...', errorMessage: null });
            store.addLog({ timestamp: new Date(), type: 'info', message: 'Sync started' });

            // Calculate clock offset with server to account for device clock skew
            try {
                const { data } = await withSyncTimeout(
                    this.supabase.rpc('get_server_time'),
                    SERVER_TIME_TIMEOUT_MS,
                    'Server time lookup'
                );
                if (data) {
                    const serverTime = new Date(data).getTime();
                    this.clockOffset = serverTime - Date.now();
                    console.log(`[SyncService] Clock offset with server: ${this.clockOffset}ms`);
                }
            } catch (e) {
                console.log('[SyncService] Could not fetch server time for offset, using last known drift', e);
            }

            let totalPulled = 0;
            await synchronize({
                database: this.db,
                // sendCreatedAsUpdated: true tells WatermelonDB to treat local
                // 'created' records as 'updated' on push. Combined with our pull
                // strategy (all active records go into the 'updated' array),
                // this ensures that records missing locally are auto-created by
                // WatermelonDB from the 'updated' array. This is the recommended
                // pattern per WatermelonDB docs for server-centric sync.
                sendCreatedAsUpdated: true,
                pullChanges: async ({ lastPulledAt }) => {
                    return await this.performPull(lastPulledAt);
                },
                pushChanges: async ({ changes, lastPulledAt }) => {
                    return await this.performPush(changes, lastPulledAt);
                },
            });

            const totalDuration = Date.now() - startTime;
            console.log(`[SyncService] Sync completed in ${totalDuration}ms`);
            const endStore = useSyncStore.getState();
            const pendingChanges = await this.updatePendingCount();
            endStore.setSyncProgress({
                status: 'completed',
                progress: 1,
                currentModel: 'Sync complete',
                pendingChanges,
                lastSyncAt: new Date(),
            });
            endStore.addLog({
                timestamp: new Date(),
                type: 'success',
                message: `Sync completed successfully (${totalPulled} pulled)`,
                duration: totalDuration,
            });
        } catch (error: any) {
            if (error?.message?.includes('Concurrent synchronization is not allowed')) {
                console.log('[SyncService] Ignored concurrent sync error (already syncing)');
                return;
            }

            // Detect LokiJS missing collection corruption (chain/find/null-collection error)
            const isLokiCollectionError = error instanceof TypeError && (
                error.message.includes('chain') ||
                error.message.includes('find') ||
                error.message.includes("Cannot read properties of null (reading 'find')") ||
                error.message.includes("Cannot read properties of null (reading 'chain')")
            );
            if (isLokiCollectionError) {
                console.error('[SyncService] Detected corrupted local database (missing LokiJS collection). Resetting local DB...');
                try {
                    await this.db.write(async () => {
                        await this.db.unsafeResetDatabase();
                    });
                    console.log('[SyncService] Database reset successful. Reloading the app...');
                    if (Platform.OS === 'web' && typeof window !== 'undefined') {
                        window.location.reload();
                    }
                } catch (resetErr) {
                    console.error('[SyncService] Failed to reset database:', resetErr);
                }
            }

            ErrorService.handleError(error, 'SyncService.sync', ErrorType.SYNC);
            const errStore = useSyncStore.getState();
            errStore.setSyncProgress({
                status: 'error',
                errorMessage: error?.message ?? 'Unknown sync error',
            });
            errStore.addLog({
                timestamp: new Date(),
                type: 'error',
                message: 'Sync failed',
                detail: error?.message ?? 'Unknown error',
            });
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * @internal Pull implementation extracted for testability
     */
    public async performPull(lastPulledAt?: number): Promise<{ changes: Record<string, any>; timestamp: number }> {
        return await perf.measure('Sync.Pull', async () => {
            const store = useSyncStore.getState();
            // Use a 2-second look-back safety window to ensure no records are missed
            // due to network latency or database commit timing differences.
            const lastSyncDate = lastPulledAt 
                ? new Date(lastPulledAt - 2000).toISOString() 
                : null;
            
            // Try to get server time for WatermelonDB's next lastPulledAt.
            let serverTime = Date.now() + this.clockOffset;
            try {
                const { data } = await withSyncTimeout(
                    this.supabase.rpc('get_server_time'),
                    SERVER_TIME_TIMEOUT_MS,
                    'Pull server time lookup'
                );
                if (data) serverTime = new Date(data).getTime();
            } catch (e) {
                console.log('[SyncService] Could not refresh server time, using offset-adjusted clock', e);
            }

            const tablesToPull = SYNC_TABLES;
            const total = tablesToPull.length;

            store.setSyncProgress({ currentModel: 'Pulling changes...', progress: 0.1 });
            const pullStartTime = Date.now();

            const results = await Promise.allSettled(
                tablesToPull.map(tableName => this.fetchTableChanges(tableName, lastSyncDate))
            );
            const changes: Record<string, any> = {};
            let totalPulledCount = 0;
            
            // Surface table-level failures to sync logs (not just console)
            const failures = results
                .map((r, i) => ({ result: r, table: tablesToPull[i] }))
                .filter(f => f.result.status === 'rejected');
            if (failures.length > 0) {
                console.error('[SyncService] Some table fetches failed:', failures);
                const details = failures.map(f => {
                    const reason = (f.result as PromiseRejectedResult).reason;
                    return `${f.table}: ${reason?.message || String(reason)}`;
                });
                for (const f of failures) {
                    const reason = (f.result as PromiseRejectedResult).reason;
                    store.addLog({
                        timestamp: new Date(),
                        type: 'error',
                        message: `Pull failed: ${f.table}`,
                        detail: reason?.message || String(reason),
                    });
                }
                throw new Error(`Pull failed for ${failures.length} table(s): ${details.join('; ')}`);
            }

            results.forEach((result, i) => {
                const localTableName = tablesToPull[i];
                const tableData = result.status === 'fulfilled'
                    ? result.value
                    : { created: [], updated: [], deleted: [] };
                
                changes[localTableName] = tableData;

                const rowCount =
                    (tableData.created?.length ?? 0) +
                    (tableData.updated?.length ?? 0) +
                    (tableData.deleted?.length ?? 0);

                totalPulledCount += rowCount;

                if (rowCount > 0) {
                    store.addLog({
                        timestamp: new Date(),
                        type: 'table',
                        message: `Pulled ${localTableName}`,
                        detail: `${tableData.created?.length ?? 0} new · ${tableData.updated?.length ?? 0} updated · ${tableData.deleted?.length ?? 0} deleted`,
                        rowCount,
                    });
                }
            });

            store.setSyncProgress({ currentModel: 'Pull complete', progress: 0.8 });
            console.log(`[SyncService] Pulled all ${total} tables in ${Date.now() - pullStartTime}ms (${totalPulledCount} rows total)`);

            return { changes, timestamp: serverTime };
        });
    }

    /**
     * @internal Push implementation extracted for testability
     */
    public async performPush(changes: any, lastPulledAt?: number): Promise<{ experimentalRejectedIds?: Record<string, string[]> }> {
        return await perf.measure('Sync.Push', async () => {
            const store = useSyncStore.getState();
            const pushStartTime = Date.now();
            store.setSyncProgress({ currentModel: 'Pushing changes...', progress: 0.8 });
            const experimentalRejectedIds = await this.pushChangesToSupabase(changes, lastPulledAt);

            const duration = Date.now() - pushStartTime;
            const totalPushed = Object.values(changes as any).reduce((sum: number, t: any) => {
                return sum + (t.created?.length ?? 0) + (t.updated?.length ?? 0) + (t.deleted?.length ?? 0);
            }, 0) as number;

            if (totalPushed > 0) {
                store.addLog({
                    timestamp: new Date(),
                    type: 'info',
                    message: `Pushed ${totalPushed} local changes`,
                    duration,
                    rowCount: totalPushed,
                });
            }

            console.log(`[SyncService] Pushed changes in ${duration}ms`);
            return { experimentalRejectedIds };
        });
    }

    private async fetchTableChanges(localTableName: string, lastSyncDate: string | null) {
        const tableName = REMOTE_TABLE_MAP[localTableName] ?? localTableName;
        try {
            const timeColumn = 'updated_at';
            const pageSize = 1000;

            // Fetch active records with pagination.
            // IMPORTANT: Rebuild the query for each page to avoid Supabase
            // client .range() stacking on the same builder instance.
            let allActive: any[] = [];
            let activePage = 0;
            let activeHasMore = true;

            while (activeHasMore) {
                let pageQuery = this.supabase
                    .from(tableName)
                    .select('*')
                    .is('deleted_at', null)
                    .order('updated_at', { ascending: true })
                    .order('id', { ascending: true });
                if (lastSyncDate) pageQuery = pageQuery.gte(timeColumn, lastSyncDate);
                const { data, error } = await withSyncTimeout(
                    pageQuery.range(activePage * pageSize, (activePage + 1) * pageSize - 1),
                    TABLE_PAGE_TIMEOUT_MS,
                    `Fetch ${tableName} active page ${activePage + 1}`
                );
                if (error) {
                    const msg = `[SyncService] Failed active records fetch for ${tableName}: ${error.message}`;
                    console.error(msg);
                    throw new Error(msg);
                }
                if (data && data.length > 0) {
                    allActive = allActive.concat(data);
                    if (data.length < pageSize) activeHasMore = false;
                    else activePage++;
                } else {
                    activeHasMore = false;
                }
            }

            // Fetch deleted records with pagination (same rebuild-per-page pattern)
            let allDeleted: any[] = [];
            let deletedPage = 0;
            let deletedHasMore = true;

            while (deletedHasMore) {
                let delPageQuery = this.supabase
                    .from(tableName)
                    .select('id,deleted_at')
                    .not('deleted_at', 'is', null)
                    .order('deleted_at', { ascending: true })
                    .order('id', { ascending: true });
                if (lastSyncDate) delPageQuery = delPageQuery.gte('deleted_at', lastSyncDate);
                const { data, error } = await withSyncTimeout(
                    delPageQuery.range(deletedPage * pageSize, (deletedPage + 1) * pageSize - 1),
                    TABLE_PAGE_TIMEOUT_MS,
                    `Fetch ${tableName} deleted page ${deletedPage + 1}`
                );
                if (error) {
                    const msg = `[SyncService] Failed deleted records fetch for ${tableName}: ${error.message}`;
                    console.error(msg);
                    throw new Error(msg);
                }
                if (data && data.length > 0) {
                    allDeleted = allDeleted.concat(data);
                    if (data.length < pageSize) deletedHasMore = false;
                    else deletedPage++;
                } else {
                    deletedHasMore = false;
                }
            }

            // All records go to `updated` — WatermelonDB will auto-create
            // any records not present locally (see sendCreatedAsUpdated flag).
            const created: any[] = [];
            const updated: any[] = [];
            const deleted: string[] = allDeleted.map((r: any) => r.id);

            for (const record of allActive) {
                // Convert ISO date strings → epoch milliseconds for WatermelonDB.
                // BIGINT-backed fields are excluded here so they can stay numeric.
                SyncService.DATE_FIELDS
                    .filter(field => !SyncService.BIGINT_DATE_FIELDS.includes(field))
                    .forEach(field => {
                    if (record[field] && typeof record[field] === 'string') {
                        record[field] = new Date(record[field]).getTime();
                    }
                    });

                // Ensure BIGINT fields are numbers
                SyncService.BIGINT_DATE_FIELDS.forEach(field => {
                    if (record[field] && typeof record[field] === 'string') {
                        // In case the DB returns it as a stringified number (common with BIGINT)
                        record[field] = parseInt(record[field], 10);
                    }
                });

                // Nullify invalid UUIDs on FK fields to prevent constraint violations
                SyncService.UUID_FK_FIELDS.forEach(field => {
                    if (record[field] && typeof record[field] === 'string' && !SyncService.UUID_REGEX.test(record[field])) {
                        record[field] = null;
                    }
                });

                updated.push(record);
            }

            return { created, updated, deleted };
        } catch (err) {
            ErrorService.handleError(err, `SyncService.fetchTableChanges(${localTableName})`, ErrorType.SYNC);
            throw err;
        }
    }

    private async pushChangesToSupabase(changes: any, lastPulledAt?: number) {
        try {
            const store = useSyncStore.getState();
            const tableNames = Object.keys(changes || {});
            const total = tableNames.length;
            let i = 0;
            const failures: string[] = [];
            const rejectedIds: Record<string, string[]> = {};

            for (const localTableName of tableNames) {
                const tableChanges = changes[localTableName];
                if (!tableChanges) {
                    i++;
                    continue;
                }

                store.setSyncProgress({
                    currentModel: `Pushing ${localTableName}...`,
                    progress: 0.8 + ((i / total) * 0.2)
                });

                const remoteName = REMOTE_TABLE_MAP[localTableName] ?? localTableName;
                const { created, updated, deleted } = tableChanges;
                const startTime = Date.now();

                try {
                    const incomingUpserts = [...(updated || []), ...(created || [])];
                    const incomingDeletes = deleted || [];
                    const conflictingIds = await this.findConflictingRemoteIds(
                        remoteName,
                        [...incomingUpserts, ...incomingDeletes.map((id: string) => ({ id }))],
                        lastPulledAt
                    );

                    if (conflictingIds.size > 0) {
                        rejectedIds[localTableName] = Array.from(conflictingIds);
                        store.addLog({
                            timestamp: new Date(),
                            type: 'error',
                            message: `Rejected ${localTableName} conflicts`,
                            detail: `${conflictingIds.size} local change(s) were kept pending because remote data changed after the last pull.`,
                            rowCount: conflictingIds.size,
                        });
                    }

                    const toUpsert = incomingUpserts
                        .filter(record => !conflictingIds.has(record.id))
                        .map(record => this.sanitizeRecord(record, localTableName));

                    if (toUpsert.length > 0) {
                        const { error } = await withSyncTimeout(
                            this.supabase.from(remoteName).upsert(toUpsert),
                            UPSERT_TIMEOUT_MS,
                            `Push ${remoteName} upserts`
                        );
                        if (error) {
                            throw new Error(error.message);
                        }
                    }

                    const deletesToPush = incomingDeletes.filter((id: string) => !conflictingIds.has(id));

                    if (deletesToPush.length > 0) {
                        const serverSafeTime = new Date(Date.now() + this.clockOffset).toISOString();
                        const deletePayload = deletesToPush.map((id: string) => ({
                            id,
                            deleted_at: serverSafeTime,
                            updated_at: serverSafeTime, // Update updated_at so pull queries see the change
                        }));
                        const { error } = await withSyncTimeout(
                            this.supabase.from(remoteName).upsert(deletePayload),
                            UPSERT_TIMEOUT_MS,
                            `Push ${remoteName} deletes`
                        );
                        if (error) {
                            throw new Error(error.message);
                        }
                    }

                    const createdCount = created?.length ?? 0;
                    const updatedCount = updated?.length ?? 0;
                    const deletedCount = deleted?.length ?? 0;
                    const totalTablePushed = Math.max(0, createdCount + updatedCount + deletedCount - conflictingIds.size);

                    if (totalTablePushed > 0) {
                        const duration = Date.now() - startTime;
                        console.log(`[SyncService] Pushed ${toUpsert.length} upserts and ${deletedCount} deletes for ${remoteName} in ${duration}ms`);
                        
                        store.addLog({
                            timestamp: new Date(),
                            type: 'table',
                            message: `Pushed ${localTableName}`,
                            detail: `${createdCount} new · ${updatedCount} updated · ${deletedCount} deleted`,
                            duration,
                            rowCount: totalTablePushed,
                        });
                    }
                } catch (tableErr: any) {
                    const msg = `[SyncService] Partial Failure: Failed to push ${remoteName}: ${tableErr.message}`;
                    console.error(msg);
                    failures.push(`${localTableName}: ${tableErr.message || String(tableErr)}`);
                    store.addLog({
                        timestamp: new Date(),
                        type: 'error',
                        message: `Push failed: ${localTableName}`,
                        detail: tableErr.message,
                    });
                }
                
                i++;
            }

            if (failures.length > 0) {
                throw new Error(`Push failed for ${failures.length} table(s): ${failures.join('; ')}`);
            }

            return rejectedIds;
        } catch (err) {
            ErrorService.handleError(err, 'SyncService.pushChangesToSupabase', ErrorType.SYNC);
            throw err;
        }
    }

    private async findConflictingRemoteIds(
        remoteTableName: string,
        records: Array<{ id?: string }>,
        lastPulledAt?: number
    ): Promise<Set<string>> {
        const conflicts = new Set<string>();
        if (!lastPulledAt || records.length === 0) return conflicts;

        const ids = Array.from(new Set(records.map(record => record.id).filter(Boolean))) as string[];
        if (ids.length === 0) return conflicts;

        const lastPulledDate = new Date(lastPulledAt).toISOString();
        const pageSize = 500;

        for (let i = 0; i < ids.length; i += pageSize) {
            const chunk = ids.slice(i, i + pageSize);
            const { data, error } = await withSyncTimeout(
                this.supabase
                    .from(remoteTableName)
                    .select('id,updated_at,deleted_at')
                    .in('id', chunk),
                TABLE_PAGE_TIMEOUT_MS,
                `Conflict check ${remoteTableName} ${i / pageSize + 1}`
            );

            if (error) {
                throw new Error(`[SyncService] Conflict check failed for ${remoteTableName}: ${error.message}`);
            }

            for (const row of data || []) {
                const remoteUpdatedAt = row.updated_at ? new Date(row.updated_at).toISOString() : null;
                const remoteDeletedAt = row.deleted_at ? new Date(row.deleted_at).toISOString() : null;
                if (
                    (remoteUpdatedAt && remoteUpdatedAt > lastPulledDate) ||
                    (remoteDeletedAt && remoteDeletedAt > lastPulledDate)
                ) {
                    conflicts.add(row.id);
                }
            }
        }

        return conflicts;
    }

    private sanitizeRecord(record: any, tableName: string) {
        const { _status, _changed, ...clean } = record;
        // tablesWithoutUpdatedAt calculation removed

        // Convert epoch milliseconds → ISO strings for Supabase TIMESTAMPTZ columns
        SyncService.DATE_FIELDS.forEach(field => {
            if (clean[field] !== undefined && clean[field] !== null && typeof clean[field] === 'number') {
                // Skip conversion for BIGINT fields
                if (SyncService.BIGINT_DATE_FIELDS.includes(field)) {
                    return;
                }

                let timestamp = clean[field];
                // Apply clock offset specifically to sync-critical timestamps to prevent skew issues
                if (field === 'updated_at' || field === 'created_at') {
                    timestamp += this.clockOffset;
                }
                clean[field] = new Date(timestamp).toISOString();
            }
        });

        // Nullify invalid UUIDs on FK fields to prevent FK constraint violations
        SyncService.UUID_FK_FIELDS.forEach(field => {
            if (clean[field] && typeof clean[field] === 'string' && !SyncService.UUID_REGEX.test(clean[field])) {
                clean[field] = null;
            }
        });

        // updated_at override removed to preserve actual modification time and fix audit sync storms

        return clean;
    }
}
