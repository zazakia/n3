// Mock references must start with 'mock' to be accessible in jest.mock factory
const mockFetch = jest.fn();
const mockFetchCount = jest.fn();
const mockQueryInstance = {
    fetch: mockFetch,
    fetchCount: mockFetchCount,
};
const mockQuery = jest.fn().mockReturnValue(mockQueryInstance);

const mockCollection = {
    query: mockQuery,
    create: jest.fn().mockImplementation(async (callback) => {
        const record = { id: 'mock-uuid-1234' };
        if (typeof callback === 'function') {
            callback(record);
        }
        return record;
    }),
    find: jest.fn().mockImplementation(async (id) => {
        if (id === 'nonexistent') throw new Error('Record not found');
        return {
            id,
            _status: 'synced',
            updated_at: 1700000000000,
            borrowerId: 'b-1',
            update: jest.fn().mockImplementation(async (callback) => {
                const record = { id };
                if (typeof callback === 'function') {
                    callback(record);
                }
                return record;
            })
        };
    }),
};

jest.mock('../../database', () => ({
    database: {
        collections: {
            get: jest.fn(() => mockCollection),
        },
    },
}));

jest.mock('react-native-get-random-values', () => ({}), { virtual: true });
jest.mock('react-native-uuid', () => ({
    v4: () => 'mock-uuid-1234',
}));

import {
    generateUUID,
    createBorrowerOffline,
    updateBorrowerOffline,
    createPaymentOffline,
    getBorrowersByCollector,
    getPendingChangesCount,
    verifyOfflineData,
    assignCollectorToBorrower,
    getRecordSyncStatus,
} from '../offlineUtils';

describe('offlineUtils', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFetch.mockResolvedValue([]);
        mockFetchCount.mockResolvedValue(0);
    });

    describe('generateUUID', () => {
        it('returns a non-empty string', () => {
            const uuid = generateUUID();
            expect(typeof uuid).toBe('string');
            expect(uuid.length).toBeGreaterThan(0);
        });
    });

    describe('createBorrowerOffline', () => {
        it('creates a borrower record with required fields', async () => {
            const result = await createBorrowerOffline({
                fullName: 'Test Borrower',
                phone: '09171234567',
                address: '123 Main St',
                collectorId: 'c-1',
                createdBy: 'user-1',
            });

            expect(result.id).toBe('mock-uuid-1234');
            expect(mockCollection.create).toHaveBeenCalled();
        });

        it('throws when createdBy is empty', async () => {
            await expect(
                createBorrowerOffline({
                    fullName: 'Test',
                    phone: '09171234567',
                    address: '123 Main St',
                    collectorId: 'c-1',
                    createdBy: '',
                })
            ).rejects.toThrow('createdBy cannot be empty');
        });
    });

    describe('updateBorrowerOffline', () => {
        it('updates a borrower with partial fields', async () => {
            const result = await updateBorrowerOffline('b-1', {
                fullName: 'Updated Name',
            });

            expect(mockCollection.find).toHaveBeenCalledWith('b-1');
        });

        it('propagates errors when borrower not found', async () => {
            await expect(
                updateBorrowerOffline('nonexistent', { fullName: 'Test' })
            ).rejects.toThrow('Record not found');
        });
    });

    describe('createPaymentOffline', () => {
        it('creates a payment record', async () => {
            const result = await createPaymentOffline({
                loanId: 'l-1',
                collectorId: 'c-1',
                amount: 500,
                borrowerId: 'b-1'
            });

            expect(result.id).toBe('mock-uuid-1234');
        });

        it('fetches borrowerId from loan when not provided', async () => {
            const result = await createPaymentOffline({
                loanId: 'l-1',
                collectorId: 'c-1',
                amount: 500,
            });

            expect(mockCollection.find).toHaveBeenCalledWith('l-1');
            expect(result.id).toBe('mock-uuid-1234');
        });

        it('handles failure to fetch borrower_id from loan gracefully', async () => {
            mockCollection.find.mockRejectedValueOnce(new Error('Loan fetch failed'));
            const result = await createPaymentOffline({
                loanId: 'l-1',
                collectorId: 'c-1',
                amount: 500,
            });
            expect(result.id).toBe('mock-uuid-1234');
        });

        it('propagates error on create failure', async () => {
            mockCollection.create.mockRejectedValueOnce(new Error('Create failed'));
            await expect(createPaymentOffline({
                loanId: 'l-1',
                collectorId: 'c-1',
                amount: 500,
            })).rejects.toThrow('Create failed');
        });
    });

    describe('getBorrowersByCollector', () => {
        it('returns borrowers filtered by collectorId', async () => {
            const mockBorrowers = [{ id: 'b-1' }];
            mockFetch.mockResolvedValue(mockBorrowers);

            const result = await getBorrowersByCollector('c-1');
            expect(result).toEqual(mockBorrowers);
        });

        it('propagates errors on fetch failure', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Fetch failed'));
            await expect(getBorrowersByCollector('c-1')).rejects.toThrow('Fetch failed');
        });
    });

    describe('getPendingChangesCount', () => {
        it('counts dirty records across tables', async () => {
            mockFetchCount.mockResolvedValue(3);

            const count = await getPendingChangesCount();
            // 6 tables × 3 each = 18
            expect(count).toBe(18);
        });

        it('returns 0 on total failure', async () => {
            mockQuery.mockImplementationOnce(() => {
                throw new Error('Total failure');
            });

            const count = await getPendingChangesCount();
            expect(count).toBe(0);
        });

        it('handles individual table errors gracefully', async () => {
            let callCount = 0;
            mockFetchCount.mockImplementation(() => {
                callCount++;
                if (callCount === 3) throw new Error('table error');
                return 2;
            });

            const count = await getPendingChangesCount();
            // 5 successful × 2 = 10
            expect(count).toBe(10);
        });
    });

    describe('verifyOfflineData', () => {
        it('returns valid when borrowers exist', async () => {
            mockFetch.mockResolvedValue([{ id: 'b-1' }]);

            const result = await verifyOfflineData('c-1');
            expect(result.isValid).toBe(true);
            expect(result.borrowerCount).toBe(1);
        });

        it('returns invalid state on failure', async () => {
            mockFetch.mockRejectedValueOnce(new Error('Fetch failed'));
            const result = await verifyOfflineData('c-1');
            expect(result.isValid).toBe(false);
            expect(result.hasData).toBe(false);
        });
    });

    describe('assignCollectorToBorrower', () => {
        it('assigns a collector and updates the record', async () => {
            const result = await assignCollectorToBorrower('b-1', 'c-2');
            expect(result.id).toBe('b-1');
            expect(mockCollection.find).toHaveBeenCalledWith('b-1');
        });

        it('propagates errors from update', async () => {
            mockCollection.find.mockResolvedValueOnce({
                id: 'b-1',
                update: jest.fn().mockRejectedValue(new Error('Update failed'))
            });
            await expect(assignCollectorToBorrower('b-1', 'c-2')).rejects.toThrow('Update failed');
        });
    });

    describe('getRecordSyncStatus', () => {
        it('returns sync status for found records', async () => {
            const result = await getRecordSyncStatus('borrowers', 'b-1');
            expect(result.status).toBe('synced');
            expect(result.lastUpdated).toBeInstanceOf(Date);
        });

        it('returns unknown on error', async () => {
            const result = await getRecordSyncStatus('borrowers', 'nonexistent');
            expect(result.status).toBe('unknown');
        });
    });
});
