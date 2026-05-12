import { SyncService } from '../SyncService';
import { createTestDatabase } from '../../__tests__/test-utils';
import { Database } from '@nozbe/watermelondb';
import { synchronize } from '@nozbe/watermelondb/sync';

jest.mock('@nozbe/watermelondb/sync', () => ({
    synchronize: jest.fn().mockResolvedValue(undefined),
}));

const createQueryBuilder = (result = { data: [], error: null }) => {
    const builder: any = {
        is: jest.fn(() => builder),
        not: jest.fn(() => builder),
        order: jest.fn(() => builder),
        gte: jest.fn(() => builder),
        in: jest.fn(() => builder),
        range: jest.fn().mockResolvedValue(result),
        then: (resolve: any) => resolve(result),
    };
    return builder;
};

// Mock supabase with a valid auth session so sync() doesn't bail out
const mockSupabase = {
    auth: {
        getSession: jest.fn().mockResolvedValue({
            data: { session: { user: { id: 'test-user-id' } } },
            error: null,
        }),
    },
    rpc: jest.fn().mockResolvedValue({ data: new Date().toISOString(), error: null }),
    from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
            is: jest.fn(() => createQueryBuilder()),
            not: jest.fn(() => createQueryBuilder()),
        }),
        upsert: jest.fn().mockResolvedValue({ error: null }),
    }),
};

// Mock the syncStore
jest.mock('../../stores/syncStore', () => ({
    useSyncStore: {
        getState: jest.fn().mockReturnValue({
            isOnline: true,
            lastSyncAt: null,
            setSyncProgress: jest.fn(),
            addLog: jest.fn(),
        }),
        setState: jest.fn(),
    },
}));

// Mock ErrorService
jest.mock('../ErrorService', () => ({
    ErrorService: { handleError: jest.fn() },
    ErrorType: { SYNC: 'sync' },
}));

// Mock PerformanceTracker
jest.mock('../../utils/PerformanceTracker', () => ({
    perf: {
        measure: jest.fn((_name: string, fn: () => any) => fn()),
    },
}));

describe('SyncService', () => {
    let database: Database;
    let service: SyncService;

    beforeEach(() => {
        database = createTestDatabase();
        service = new SyncService(database, mockSupabase as any);
        // Reset the isSyncing flag via the instance
        (service as any).isSyncing = false;
        jest.clearAllMocks();

        // Re-apply default mock returns after clearAllMocks
        mockSupabase.auth.getSession.mockResolvedValue({
            data: { session: { user: { id: 'test-user-id' } } },
            error: null,
        });
        mockSupabase.rpc.mockResolvedValue({ data: new Date().toISOString(), error: null });
        mockSupabase.from.mockReturnValue({
            select: jest.fn().mockReturnValue({
                is: jest.fn(() => createQueryBuilder()),
                not: jest.fn(() => createQueryBuilder()),
            }),
            upsert: jest.fn().mockResolvedValue({ error: null }),
        });

        // Restore syncStore mock
        const { useSyncStore } = require('../../stores/syncStore');
        useSyncStore.getState.mockReturnValue({
            isOnline: true,
            lastSyncAt: null,
            setSyncProgress: jest.fn(),
            addLog: jest.fn(),
        });
    });

    it('calls synchronize when online with valid session', async () => {
        await service.sync();
        expect(synchronize).toHaveBeenCalled();
    });

    it('skips sync when already syncing', async () => {
        const { useSyncStore } = require('../../stores/syncStore');
        const setSyncProgress = jest.fn();
        useSyncStore.getState.mockReturnValue({
            isOnline: true,
            lastSyncAt: null,
            setSyncProgress,
            addLog: jest.fn(),
        });
        (service as any).isSyncing = true;
        await service.sync();
        expect(synchronize).not.toHaveBeenCalled();
        expect(setSyncProgress).toHaveBeenCalledWith({
            currentModel: 'Sync already running',
        });
        expect(setSyncProgress).not.toHaveBeenCalledWith(expect.objectContaining({
            status: 'completed',
        }));
    });

    it('skips sync when device is offline and not forced', async () => {
        const { useSyncStore } = require('../../stores/syncStore');
        useSyncStore.getState.mockReturnValue({
            isOnline: false,
            lastSyncAt: null,
            setSyncProgress: jest.fn(),
            addLog: jest.fn(),
        });
        await service.sync();
        expect(synchronize).not.toHaveBeenCalled();
    });

    it('syncs when offline if force=true', async () => {
        const { useSyncStore } = require('../../stores/syncStore');
        useSyncStore.getState.mockReturnValue({
            isOnline: false,
            lastSyncAt: null,
            setSyncProgress: jest.fn(),
            addLog: jest.fn(),
        });
        await service.sync(true);
        expect(synchronize).toHaveBeenCalled();
    });

    it('skips sync when no active session', async () => {
        mockSupabase.auth.getSession.mockResolvedValue({
            data: { session: null },
            error: null,
        });
        await service.sync();
        expect(synchronize).not.toHaveBeenCalled();
    });

    it('throttles sync if last sync was recent', async () => {
        const { useSyncStore } = require('../../stores/syncStore');
        useSyncStore.getState.mockReturnValue({
            isOnline: true,
            lastSyncAt: new Date().toISOString(), // Just now
            setSyncProgress: jest.fn(),
            addLog: jest.fn(),
        });
        await service.sync();
        expect(synchronize).not.toHaveBeenCalled();
    });

    it('overrides throttle with force=true', async () => {
        const { useSyncStore } = require('../../stores/syncStore');
        useSyncStore.getState.mockReturnValue({
            isOnline: true,
            lastSyncAt: new Date().toISOString(), // Just now
            setSyncProgress: jest.fn(),
            addLog: jest.fn(),
        });
        await service.sync(true);
        expect(synchronize).toHaveBeenCalled();
    });

    it('handles sync errors gracefully', async () => {
        (synchronize as jest.Mock).mockRejectedValueOnce(new Error('Sync failed'));
        // Should not throw
        await service.sync();
    });

    it('ignores concurrent synchronization errors', async () => {
        (synchronize as jest.Mock).mockRejectedValueOnce(
            new Error('Concurrent synchronization is not allowed')
        );
        // Should not throw
        await service.sync();
    });

    it('updatePendingCount returns 0 for empty database', async () => {
        const count = await service.updatePendingCount();
        expect(count).toBe(0);
    });

    it('preserves bigint penalty_date values during pull sanitization', async () => {
        mockSupabase.from.mockReturnValue({
            select: jest.fn().mockReturnValue({
                is: jest.fn(() => createQueryBuilder({
                        data: [{ id: 'penalty-1', penalty_date: '1712345678901' }],
                        error: null,
                    })),
                not: jest.fn(() => createQueryBuilder()),
            }),
            upsert: jest.fn().mockResolvedValue({ error: null }),
        });

        const result = await (service as any).fetchTableChanges('loan_penalties', null);

        expect(result.updated).toHaveLength(1);
        expect(result.updated[0].penalty_date).toBe(1712345678901);
    });

    it('throws when a pull table fetch fails instead of returning empty changes', async () => {
        mockSupabase.from.mockReturnValue({
            select: jest.fn().mockReturnValue({
                is: jest.fn(() => createQueryBuilder({
                    data: null,
                    error: { message: 'missing borrower_id' },
                })),
                not: jest.fn(() => createQueryBuilder()),
            }),
            upsert: jest.fn().mockResolvedValue({ error: null }),
        });

        await expect((service as any).fetchTableChanges('payments', null))
            .rejects.toThrow('missing borrower_id');
    });

    it('throws after a push table failure so WatermelonDB keeps local changes pending', async () => {
        mockSupabase.from.mockReturnValue({
            select: jest.fn().mockReturnValue({
                is: jest.fn(() => createQueryBuilder()),
                not: jest.fn(() => createQueryBuilder()),
            }),
            upsert: jest.fn().mockResolvedValue({ error: { message: 'schema cache missing borrower_id' } }),
        });

        await expect((service as any).pushChangesToSupabase({
            payments: {
                created: [{ id: 'p1', amount: 100 }],
                updated: [],
                deleted: [],
            },
        })).rejects.toThrow('Push failed for 1 table');
    });

    it('returns rejected ids for rows changed remotely after lastPulledAt', async () => {
        const conflictQuery = createQueryBuilder({
            data: [{
                id: 'p1',
                updated_at: new Date('2026-05-11T10:00:01.000Z').toISOString(),
                deleted_at: null,
            }],
            error: null,
        });
        const upsert = jest.fn().mockResolvedValue({ error: null });
        mockSupabase.from.mockReturnValue({
            select: jest.fn(() => conflictQuery),
            upsert,
        });

        const rejectedIds = await (service as any).pushChangesToSupabase({
            payments: {
                created: [],
                updated: [{ id: 'p1', amount: 100 }],
                deleted: [],
            },
        }, new Date('2026-05-11T10:00:00.000Z').getTime());

        expect(rejectedIds).toEqual({ payments: ['p1'] });
        expect(upsert).not.toHaveBeenCalled();
    });
    it('pulls payments with all columns so borrower_id cannot regress out of the schema payload', async () => {
        const validBorrowerId = '11111111-1111-4111-8111-111111111111';
        const activeBuilder = createQueryBuilder({
            data: [{
                id: 'payment-1',
                loan_id: '22222222-2222-4222-8222-222222222222',
                borrower_id: validBorrowerId,
                amount: 250,
                payment_date: '2026-05-11T10:00:00.000Z',
                deleted_at: null,
                updated_at: '2026-05-11T10:00:00.000Z',
            }],
            error: null,
        });
        const deletedBuilder = createQueryBuilder({ data: [], error: null });
        const select = jest.fn().mockReturnValue({
            is: jest.fn(() => activeBuilder),
            not: jest.fn(() => deletedBuilder),
        });
        mockSupabase.from.mockReturnValue({
            select,
            upsert: jest.fn().mockResolvedValue({ error: null }),
        });

        const result = await (service as any).fetchTableChanges('payments', null);

        expect(mockSupabase.from).toHaveBeenCalledWith('app_payments');
        expect(select).toHaveBeenCalledWith('*');
        expect(result.updated).toHaveLength(1);
        expect(result.updated[0].borrower_id).toBe(validBorrowerId);
        expect(typeof result.updated[0].payment_date).toBe('number');
    });

    it('sanitizes invalid payment borrower_id values before pushing to Supabase', () => {
        const validLoanId = '22222222-2222-4222-8222-222222222222';

        const sanitized = (service as any).sanitizeRecord({
            id: 'payment-1',
            loan_id: validLoanId,
            borrower_id: 'not-a-valid-uuid',
            payment_date: Date.UTC(2026, 4, 11),
            _status: 'created',
            _changed: 'borrower_id,payment_date',
        }, 'payments');

        expect(sanitized.borrower_id).toBeNull();
        expect(sanitized.loan_id).toBe(validLoanId);
        expect(sanitized.payment_date).toBe('2026-05-11T00:00:00.000Z');
        expect(sanitized).not.toHaveProperty('_status');
        expect(sanitized).not.toHaveProperty('_changed');
    });

    it('pushes soft deletes with updated_at so later pulls can observe the deletion', async () => {
        const upsert = jest.fn().mockResolvedValue({ error: null });
        mockSupabase.from.mockReturnValue({
            select: jest.fn(() => createQueryBuilder()),
            upsert,
        });

        await (service as any).pushChangesToSupabase({
            payments: {
                created: [],
                updated: [],
                deleted: ['payment-1'],
            },
        });

        expect(mockSupabase.from).toHaveBeenCalledWith('app_payments');
        expect(upsert).toHaveBeenCalledWith([expect.objectContaining({
            id: 'payment-1',
            deleted_at: expect.any(String),
            updated_at: expect.any(String),
        })]);
    });

    it('rejects local deletes when the remote row changed after lastPulledAt', async () => {
        const conflictQuery = createQueryBuilder({
            data: [{
                id: 'payment-1',
                updated_at: '2026-05-11T10:00:01.000Z',
                deleted_at: null,
            }],
            error: null,
        });
        const upsert = jest.fn().mockResolvedValue({ error: null });
        mockSupabase.from.mockReturnValue({
            select: jest.fn(() => conflictQuery),
            upsert,
        });

        const rejectedIds = await (service as any).pushChangesToSupabase({
            payments: {
                created: [],
                updated: [],
                deleted: ['payment-1'],
            },
        }, new Date('2026-05-11T10:00:00.000Z').getTime());

        expect(rejectedIds).toEqual({ payments: ['payment-1'] });
        expect(upsert).not.toHaveBeenCalled();
    });

    it('checkAndSync calls sync and updatePendingCount', async () => {
        const syncSpy = jest.spyOn(service, 'sync').mockResolvedValue();
        const pendingSpy = jest.spyOn(service, 'updatePendingCount').mockResolvedValue(0);
        await service.checkAndSync();
        expect(syncSpy).toHaveBeenCalled();
        expect(pendingSpy).toHaveBeenCalled();
    });

    it('checkAndSync skips if already syncing', async () => {
        (service as any).isSyncing = true;
        const syncSpy = jest.spyOn(service, 'sync');
        await service.checkAndSync();
        expect(syncSpy).not.toHaveBeenCalled();
    });
});

