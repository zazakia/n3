import { ActionLogService } from '../ActionLogService';
import { createTestDatabase } from '../../__tests__/test-utils';
import { Database } from '@nozbe/watermelondb';
import { AuthService } from '../AuthService';

jest.mock('../AuthService', () => ({
    AuthService: {
        getCurrentUserId: jest.fn().mockResolvedValue('user-123'),
        getCurrentUserRole: jest.fn().mockResolvedValue('collector'),
    }
}));

jest.mock('../../database', () => ({
    database: null,
}));

describe('ActionLogService', () => {
    let database: Database;
    let service: ActionLogService;

    beforeEach(async () => {
        database = createTestDatabase();
        service = new ActionLogService(database);
        jest.clearAllMocks();
    });

    describe('logAction / logActions', () => {
        it('logs a single action with default user', async () => {
            const params = {
                entityType: 'loans',
                entityId: 'loan-1',
                action: 'CREATE' as const,
                newData: { amount: 1000 }
            };

            await service.logAction(params);

            const logs = await database.get('action_logs').query().fetch() as any[];
            expect(logs.length).toBe(1);
            expect(logs[0].entityType).toBe('loans');
            expect(logs[0].entityId).toBe('loan-1');
            expect(logs[0].action).toBe('CREATE');
            expect(logs[0].performedBy).toBe('user-123');
            expect(logs[0].newData).toBe(JSON.stringify({ amount: 1000 }));
        });

        it('logs multiple actions in batch', async () => {
            const paramsList = [
                { entityType: 'loans', entityId: 'L1', action: 'CREATE' as const },
                { entityType: 'loans', entityId: 'L2', action: 'UPDATE' as const, oldData: { s: 1 }, newData: { s: 2 } }
            ];

            await service.logActions(paramsList);

            const logs = await database.get('action_logs').query().fetch() as any[];
            expect(logs.length).toBe(2);
            expect(logs.find(l => l.entityId === 'L2')?.oldData).toBe(JSON.stringify({ s: 1 }));
        });

        it('handles empty params list', async () => {
            await service.logActions([]);
            const logs = await database.get('action_logs').query().fetch();
            expect(logs.length).toBe(0);
        });

        it('uses provided performedBy if available', async () => {
            await service.logAction({
                entityType: 'b', entityId: '1', action: 'DELETE' as const, performedBy: 'admin'
            });
            const logs = await database.get('action_logs').query().fetch() as any[];
            expect(logs[0].performedBy).toBe('admin');
        });

        it('uses "system" if getCurrentUserId returns null', async () => {
            (AuthService.getCurrentUserId as jest.Mock).mockResolvedValueOnce(null);
            await service.logAction({ entityType: 'e', entityId: 'sys', action: 'CREATE' as any });
            const logs = await database.get('action_logs').query().fetch() as any[];
            const log = logs.find(l => l.entityId === 'sys');
            expect(log.performedBy).toBe('system');
        });

        it('redacts sensitive fields before writing payloads', async () => {
            await service.logAction({
                entityType: 'user_profiles',
                entityId: 'user-1',
                action: 'UPDATE',
                oldData: { email: 'a@example.test', password: 'old-secret' },
                newData: { email: 'b@example.test', token: 'new-secret', auth_id: 'auth-1' },
            });

            const logs = await database.get('action_logs').query().fetch() as any[];
            const log = logs[0];
            expect(log.oldData).toContain('"password":"[REDACTED]"');
            expect(log.newData).toContain('"token":"[REDACTED]"');
            expect(log.newData).toContain('"auth_id":"auth-1"');
        });

        it('serializes circular and non-json audit payloads without aborting the log', async () => {
            const circular: any = { amount: 1000, createdAt: new Date(0), unsafe: undefined };
            circular.self = circular;

            await service.logAction({
                entityType: 'loans',
                entityId: 'loan-circular',
                action: 'CREATE',
                newData: circular,
            });

            const logs = await database.get('action_logs').query().fetch() as any[];
            const log = logs.find(l => l.entityId === 'loan-circular');
            expect(log).toBeTruthy();
            expect(log.newData).toContain('"self":"[Circular]"');
            expect(log.newData).toContain('"createdAt":"1970-01-01T00:00:00.000Z"');
            expect(log.newData).toContain('"unsafe":"[undefined]"');
        });

        it('skips malformed audit params instead of failing the whole batch', async () => {
            await service.logActions([
                { entityType: '', entityId: 'missing-type', action: 'CREATE' },
                { entityType: 'loans', entityId: 'loan-1', action: 'INVALID' as any },
                { entityType: 'loans', entityId: 'loan-2', action: 'UPDATE' },
            ]);

            const logs = await database.get('action_logs').query().fetch() as any[];
            expect(logs).toHaveLength(1);
            expect(logs[0].entityId).toBe('loan-2');
        });

        it('handles errors gracefully in logActions', async () => {
            const spy = jest.spyOn(database, 'write').mockImplementation(() => { throw new Error('Write Failed'); });
            await service.logAction({ entityType: 'e', entityId: '1', action: 'CREATE' as const });
            // Should not throw, should just catch and log
            expect(spy).toHaveBeenCalled();
        });

        it('returns early if database is not available', async () => {
             const brokenService = new ActionLogService(null as any);
             // Should not throw
             await brokenService.logAction({ entityType: 'e', entityId: '1', action: 'CREATE' as const });
        });

        it('handles missing collections', async () => {
             const mockDb = { get: jest.fn().mockReturnValue(null), write: jest.fn() } as any;
             const brokenService = new ActionLogService(mockDb);
             await brokenService.logAction({ entityType: 'e', entityId: '1', action: 'CREATE' as const });
             expect(mockDb.get).toHaveBeenCalled();
        });
    });

    describe('getLogs', () => {
        beforeEach(async () => {
            await database.write(async () => {
                const collection = database.get('action_logs');
                await database.batch(
                    collection.prepareCreate((l: any) => { l.entityType = 'type-A'; l.entityId = '1'; l.action = 'CREATE'; l.timestamp = 100; }),
                    collection.prepareCreate((l: any) => { l.entityType = 'type-B'; l.entityId = '2'; l.action = 'UPDATE'; l.timestamp = 200; }),
                    collection.prepareCreate((l: any) => { l.entityType = 'type-A'; l.entityId = '3'; l.action = 'DELETE'; l.timestamp = 300; })
                );
            });
        });

        it('returns all logs sorted by timestamp desc', async () => {
            const logs = await service.getLogs() as any[];
            expect(logs.length).toBe(3);
            expect(logs[0].entityId).toBe('3'); // Latest
            expect(logs[2].entityId).toBe('1'); // Oldest
        });

        it('filters logs by entityType', async () => {
            const logs = await service.getLogs(50, 'type-A') as any[];
            expect(logs.length).toBe(2);
            expect(logs.every(l => l.entityType === 'type-A')).toBe(true);
        });

        it('returns empty array on fetch error', async () => {
            jest.spyOn(database, 'get').mockImplementationOnce(() => {
                throw new Error('Fetch error');
            });
            const logs = await service.getLogs();
            expect(logs).toEqual([]);
        });

        it('limits the number of logs', async () => {
            const logs = await service.getLogs(1);
            expect(logs.length).toBe(1);
        });

        it('clamps invalid query limits to a safe default', async () => {
            const logs = await service.getLogs(Number.NaN);
            expect(logs.length).toBe(3);
        });

        it('ignores blank entity type filters', async () => {
            const logs = await service.getLogs(50, '   ');
            expect(logs).toHaveLength(3);
        });

        it('exposes an observable query for realtime audit trail updates', () => {
            const observable = service.observeLogs(100);
            expect(observable).toBeTruthy();
            expect(typeof observable?.subscribe).toBe('function');
        });

        it('handles errors in getLogs', async () => {
            jest.spyOn(database, 'get').mockImplementation(() => { throw new Error('Query Failed'); });
            const logs = await service.getLogs();
            expect(logs).toEqual([]);
        });

        it('returns empty if database is not available in getLogs', async () => {
             const brokenService = new ActionLogService(null as any);
             expect(await brokenService.getLogs()).toEqual([]);
        });
    });

    describe('Error Handling', () => {
        it('logs error when database is not initialized', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            const uninitializedService = new (service.constructor as any)(null);
            
            // Accessing db property through a method
            await uninitializedService.getLogs();
            
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Database is not initialized!'));
            consoleSpy.mockRestore();
        });

        it('handles error in logActions', async () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            jest.spyOn(database, 'write').mockRejectedValueOnce(new Error('Write error'));
            
            await service.logActions([{ entityType: 'Loan', entityId: '1', action: 'CREATE' as any }]);
            
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to log actions:'), expect.any(Error));
            consoleSpy.mockRestore();
        });
    });
});
