import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import WeeklyDcsReport from '../weekly-dcs';
import { database } from '../../../../src/database';

jest.mock('../../../../src/database');

jest.mock('expo-router', () => {
    const React = require('react');
    return {
        useFocusEffect: (cb: any) => React.useEffect(() => {
            cb();
        }, [cb]),
        useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
    };
});

jest.mock('expo-print', () => ({
    printToFileAsync: jest.fn().mockResolvedValue({ uri: 'mock-uri' }),
}));

jest.mock('expo-sharing', () => ({
    shareAsync: jest.fn().mockResolvedValue({}),
}));

jest.mock('expo-file-system/legacy', () => ({
    documentDirectory: 'mock-dir/',
    writeAsStringAsync: jest.fn().mockResolvedValue({}),
    EncodingType: { UTF8: 'utf8' },
}));

describe('WeeklyDcsReport', () => {
    let testDb: any;

    beforeEach(async () => {
        testDb = database;
        await testDb.write(async () => {
            const tables = ['collectors', 'borrowers', 'loans', 'payment_schedules', 'payments', 'savings_transactions', 'collection_groups'];
            for (const table of tables) {
                const records = await testDb.collections.get(table).query().fetch();
                for (const record of records) {
                    await record.destroyPermanently();
                }
            }
        });
        jest.clearAllMocks();
    });

    const seedData = async () => {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const monday = new Date(now);
        monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        monday.setHours(12, 0, 0, 0);

        await testDb.write(async () => {
            const collectorA = await testDb.collections.get('collectors').create((record: any) => {
                record.fullName = 'Angelica Laluna';
                record.isActive = true;
            });
            const collectorB = await testDb.collections.get('collectors').create((record: any) => {
                record.fullName = 'Angelica Polo';
                record.isActive = true;
            });

            await testDb.collections.get('collection_groups').create((record: any) => {
                record.name = 'Magbangon';
                record.collectorId = collectorA.id;
                record.collectionDay = 5;
                record.isActive = true;
            });
            await testDb.collections.get('collection_groups').create((record: any) => {
                record.name = 'Salvacion';
                record.collectorId = collectorB.id;
                record.collectionDay = 1;
                record.isActive = true;
            });

            const borrowerA = await testDb.collections.get('borrowers').create((record: any) => {
                record.fullName = 'Esterlita Concillo';
                record.address = 'Magbangon Albuera';
                record.phone = '9001112222';
                record.collectorId = collectorA.id;
                record.group = 'Magbangon';
            });
            const borrowerB = await testDb.collections.get('borrowers').create((record: any) => {
                record.fullName = 'Rowena Dalida';
                record.address = 'Salvacion Albuera';
                record.phone = '9003334444';
                record.collectorId = collectorB.id;
                record.group = 'Salvacion';
            });

            const loanA = await testDb.collections.get('loans').create((record: any) => {
                record.borrowerId = borrowerA.id;
                record.collectorId = collectorA.id;
                record.principalAmount = 5000;
                record.totalAmount = 6000;
                record.installmentAmount = 250;
                record.depositAmount = 50;
                record.status = 'active';
                record.frequency = 'weekly';
            });
            const loanB = await testDb.collections.get('loans').create((record: any) => {
                record.borrowerId = borrowerB.id;
                record.collectorId = collectorB.id;
                record.principalAmount = 5000;
                record.totalAmount = 6000;
                record.installmentAmount = 250;
                record.depositAmount = 50;
                record.status = 'active';
                record.frequency = 'weekly';
            });

            await testDb.collections.get('payment_schedules').create((record: any) => {
                record.loanId = loanA.id;
                record.dueDate = monday.getTime();
                record.scheduledAmount = 250;
                record.principalAmount = 250;
                record.status = 'pending';
            });
            await testDb.collections.get('payment_schedules').create((record: any) => {
                record.loanId = loanB.id;
                record.dueDate = monday.getTime();
                record.scheduledAmount = 250;
                record.principalAmount = 250;
                record.status = 'pending';
            });

            await testDb.collections.get('payments').create((record: any) => {
                record.loanId = loanA.id;
                record.borrowerId = borrowerA.id;
                record.amount = 1000;
                record.paymentDate = monday.getTime();
            });

            await testDb.collections.get('savings_transactions').create((record: any) => {
                record.borrowerId = borrowerA.id;
                record.type = 'deposit';
                record.amount = 250;
                record.date = monday.getTime();
            });
        });
    };

    it('renders weekly DCS rows grouped by area', async () => {
        await seedData();

        render(<WeeklyDcsReport />);

        await waitFor(() => {
            expect(screen.getByText('Esterlita Concillo')).toBeTruthy();
            expect(screen.getByText('Rowena Dalida')).toBeTruthy();
        });

        expect(screen.getAllByText('Magbangon').length).toBeGreaterThan(0);
        expect(screen.getAllByText('Salvacion').length).toBeGreaterThan(0);
        expect(screen.getAllByText('5,000.00').length).toBeGreaterThan(0);
        expect(screen.getAllByText('300.00').length).toBeGreaterThan(0);
    });

    it('filters rows by group and collector', async () => {
        await seedData();

        render(<WeeklyDcsReport />);

        await waitFor(() => expect(screen.getByText('Esterlita Concillo')).toBeTruthy());

        fireEvent.press(screen.getAllByText('Salvacion')[0]);
        await waitFor(() => {
            expect(screen.getByText('Rowena Dalida')).toBeTruthy();
            expect(screen.queryByText('Esterlita Concillo')).toBeNull();
        });

        fireEvent.press(screen.getByText('All Groups'));
        fireEvent.press(screen.getAllByText('Angelica Laluna')[0]);
        await waitFor(() => {
            expect(screen.getByText('Esterlita Concillo')).toBeTruthy();
            expect(screen.queryByText('Rowena Dalida')).toBeNull();
        });
    });

    it('exports CSV on native', async () => {
        await seedData();
        (Platform as any).OS = 'ios';

        render(<WeeklyDcsReport />);

        const exportButton = await screen.findByTestId('export-weekly-dcs');
        fireEvent.press(exportButton);

        const FileSystem = require('expo-file-system/legacy');
        const Sharing = require('expo-sharing');

        await waitFor(() => {
            expect(FileSystem.writeAsStringAsync).toHaveBeenCalled();
            expect(Sharing.shareAsync).toHaveBeenCalled();
        });
    });
});
