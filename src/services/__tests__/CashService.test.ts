import { CashService } from '../CashService';
import { createTestDatabase } from '../../__tests__/test-utils';
import { Database } from '@nozbe/watermelondb';

describe('CashService Integration', () => {
    let database: Database;
    let service: CashService;

    beforeEach(async () => {
        database = createTestDatabase();
        service = new CashService(database);
        (CashService as any).defaultInstance = service;
    });

    describe('Static Methods Delegation', () => {
        it('delegates all static methods to the instance', async () => {
            const spy1 = jest.spyOn(service, 'getCurrentBalance').mockResolvedValue(100);
            expect(await CashService.getCurrentBalance()).toBe(100);

            const spy2 = jest.spyOn(service, 'getCollectorBalance').mockResolvedValue(200);
            expect(await CashService.getCollectorBalance('c1')).toBe(200);

            const spy3 = jest.spyOn(service, 'getTodayCollection').mockResolvedValue(300);
            expect(await CashService.getTodayCollection()).toBe(300);

            const spy4 = jest.spyOn(service, 'getMonthCollection').mockResolvedValue(400);
            expect(await CashService.getMonthCollection()).toBe(400);
        });
    });

    describe('getCurrentBalance', () => {
        it('returns 0 balance for empty database', async () => {
            expect(await service.getCurrentBalance()).toBe(0);
        });

        it('calculates balance with all transaction types', async () => {
            await database.write(async () => {
                await database.get('cash_transactions').create((t: any) => {
                    t.type = 'starting_balance';
                    t.amount = 5000;
                });
                await database.get('cash_transactions').create((t: any) => {
                    t.type = 'in';
                    t.amount = 1000;
                });
                await database.get('cash_transactions').create((t: any) => {
                    t.type = 'out';
                    t.amount = 200;
                });
                await database.get('remittances').create((r: any) => {
                    r.amount = 1500;
                    r.status = 'approved';
                });
                await database.get('expenses').create((e: any) => {
                    e.amount = 300;
                });
            });

            // 5000 + 1000 + 1500 - 200 - 300 = 7000
            expect(await service.getCurrentBalance()).toBe(7000);
        });

        it('handles database errors gracefully in getCurrentBalance', async () => {
            jest.spyOn(database.collections, 'get').mockImplementation(() => { throw new Error('DB Error'); });
            expect(await service.getCurrentBalance()).toBe(0);
        });

        it('returns zero if database is not initialized', async () => {
            const brokenService = new CashService(null as any);
            expect(await brokenService.getCurrentBalance()).toBe(0);
        });

        it('returns zero if collections are missing', async () => {
             const mockDb = { collections: { get: jest.fn().mockReturnValue(null) } } as any;
             const brokenService = new CashService(mockDb);
             expect(await brokenService.getCurrentBalance()).toBe(0);
        });
    });

    describe('getCollectorBalance', () => {
        it('calculates collector balance correctly', async () => {
            const collectorId = 'coll-1';
            await database.write(async () => {
                await database.get('payments').create((p: any) => {
                    p.collectorId = collectorId;
                    p.amount = 1000;
                });
                await database.get('remittances').create((r: any) => {
                    r.collectorId = collectorId;
                    r.amount = 400;
                    r.status = 'approved';
                });
            });
            expect(await service.getCollectorBalance(collectorId)).toBe(600);
        });

        it('handles errors in getCollectorBalance', async () => {
            jest.spyOn(database.collections, 'get').mockImplementation(() => { throw new Error('DB Error'); });
            expect(await service.getCollectorBalance('any')).toBe(0);
        });

        it('returns zero if database is not initialized in getCollectorBalance', async () => {
            const brokenService = new CashService(null as any);
            expect(await brokenService.getCollectorBalance('any')).toBe(0);
        });
    });

    describe('Collection Timeframes', () => {
        it('filters today and month collections', async () => {
            const now = new Date();
            const today = now.getTime();
            const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
            
            await database.write(async () => {
                await database.get('payments').create((p: any) => {
                    p.amount = 500;
                    p.paymentDate = today;
                });
            });

            expect(await service.getTodayCollection()).toBe(500);
            expect(await service.getMonthCollection()).toBe(500);
        });

        it('handles errors in timeframe collections', async () => {
            const brokenService = new CashService(null as any);
            expect(await brokenService.getTodayCollection()).toBe(0);
            expect(await brokenService.getMonthCollection()).toBe(0);
        });
    });
});
