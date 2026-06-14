import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import BorrowersListScreen from '../index';
import { database } from '../../../../src/database';
import BaseModelService from '../../../../src/services/BaseModelService';

const mockPush = jest.fn();

jest.mock('@expo/vector-icons', () => {
    const React = require('react');
    const { Text } = require('react-native');
    return {
        MaterialIcons: ({ name }: any) => React.createElement(Text, null, name),
        Ionicons: ({ name }: any) => React.createElement(Text, null, name),
    };
});

jest.mock('@nozbe/watermelondb', () => ({
    Q: {
        where: jest.fn().mockReturnValue({}),
        on: jest.fn().mockReturnValue({}),
        and: jest.fn().mockReturnValue({}),
        or: jest.fn().mockReturnValue({}),
        eq: jest.fn().mockReturnValue({}),
        gte: jest.fn().mockReturnValue({}),
        lte: jest.fn().mockReturnValue({}),
        gt: jest.fn().mockReturnValue({}),
        lt: jest.fn().mockReturnValue({}),
        like: jest.fn().mockReturnValue({}),
        notLike: jest.fn().mockReturnValue({}),
        oneOf: jest.fn().mockReturnValue({}),
        notIn: jest.fn().mockReturnValue({}),
        sanitizeLikeString: jest.fn((s: string) => s),
        sortBy: jest.fn().mockReturnValue({}),
        skip: jest.fn().mockReturnValue({}),
        take: jest.fn().mockReturnValue({}),
        asc: 'asc',
        desc: 'desc',
    },
}));

jest.mock('date-fns', () => ({
    format: (d: any) => {
        try { return new Date(d).toISOString().split('T')[0]; }
        catch { return 'Invalid Date'; }
    },
    isAfter: jest.fn().mockReturnValue(false),
    startOfToday: jest.fn().mockReturnValue(new Date()),
    subDays: jest.fn().mockReturnValue(new Date()),
    startOfWeek: jest.fn().mockReturnValue(new Date()),
    startOfMonth: jest.fn().mockReturnValue(new Date()),
}));

jest.mock('expo-router', () => ({
    __esModule: true,
    useRouter: () => ({ push: mockPush }),
    useFocusEffect: jest.fn().mockImplementation((cb) => {
        const React = require('react');
        React.useEffect(() => cb(), [cb]);
    }),
}));

jest.mock('../../../../src/database', () => ({
    __esModule: true,
    database: {
        collections: {
            get: jest.fn(),
        },
    },
}));

jest.mock('../../../../src/components/SearchBar', () => ({
    __esModule: true,
    SearchBar: ({ value, onChangeText, placeholder }: any) => {
        const { TextInput } = require('react-native');
        return <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} />;
    }
}));

jest.mock('../../../../src/components/SwipeableItem', () => {
    const { Pressable, Text, View } = require('react-native');
    const React = require('react');
    return {
        __esModule: true,
        default: (props: any) => React.createElement(
            View,
            {},
            props.children,
            React.createElement(
                Pressable,
                { testID: 'mock-swipe-edit', onPress: props.onEdit },
                React.createElement(Text, null, 'Edit')
            )
        )
    };
});

jest.mock('../../../../src/components/ActionSheet', () => ({
    __esModule: true,
    default: () => null
}));

jest.mock('../../../../src/components/ConfirmDialog', () => ({
    __esModule: true,
    default: () => null
}));

jest.mock('../../../../src/components/DataTable', () => {
    const React = require('react');
    const { View, Text, Pressable } = require('react-native');
    return {
        __esModule: true,
        DataTable: ({ data, keyExtractor, columns, onRowPress }: any) =>
            React.createElement(
                View,
                { testID: 'data-table' },
                data.length === 0
                    ? React.createElement(Text, null, 'No records found')
                    : data.map((item: any) =>
                        React.createElement(
                            Pressable,
                            { key: keyExtractor(item), testID: `row-${keyExtractor(item)}`, onPress: () => onRowPress && onRowPress(item) },
                            React.createElement(Text, null, item.fullName)
                        )
                    )
            ),
    };
});

jest.mock('../../../../src/components/PaginationControls', () => ({
    __esModule: true,
    PaginationControls: () => null,
}));

jest.mock('../../../../src/components/ViewToggle', () => {
    const React = require('react');
    const { View, Pressable, Text } = require('react-native');
    return {
        __esModule: true,
        ViewToggle: ({ mode, onToggle }: any) =>
            React.createElement(
                View,
                null,
                React.createElement(Pressable, { testID: 'view-toggle-table', onPress: () => onToggle('table') }, React.createElement(Text, null, 'Table')),
                React.createElement(Pressable, { testID: 'view-toggle-card', onPress: () => onToggle('card') }, React.createElement(Text, null, 'Cards'))
            ),
        ViewMode: {},
    };
});

jest.mock('react-native-gesture-handler', () => {
    const React = require('react');
    const View = require('react-native').View;
    return {
        Swipeable: (props: any) => React.createElement(View, {}, props.children),
        GestureHandlerRootView: (props: any) => React.createElement(View, { className: props.className }, props.children),
        default: { install: () => {} }
    };
});

jest.mock('../../../../src/services/BaseModelService', () => ({
    __esModule: true,
    default: {
        fetchActive: jest.fn(),
        cascadeDeleteBorrower: jest.fn(),
    }
}));

describe('BorrowersListScreen', () => {
    const mockBorrowers = [
        { id: 'b1', fullName: 'Alice', decryptedPhone: '111', decryptedAddress: 'Street 1', createdAt: Date.now() },
        { id: 'b2', fullName: 'Bob', decryptedPhone: '222', decryptedAddress: 'Street 2', createdAt: Date.now() },
        { id: 'b3', fullName: 'Charlie', decryptedPhone: '333', decryptedAddress: 'Street 3', createdAt: Date.now() },
    ];

    const mockLoans = [
        { id: 'l1', borrowerId: 'b1', frequency: 'daily', status: 'active', totalAmount: 1000, principalAmount: 1000, deductedAmount: 0, serviceChargeAmount: 0 },
        { id: 'l2', borrowerId: 'b2', frequency: 'weekly', status: 'active', totalAmount: 2000, principalAmount: 2000, deductedAmount: 0, serviceChargeAmount: 0 },
        { id: 'l3', borrowerId: 'b3', frequency: 'monthly', status: 'active', totalAmount: 3000, principalAmount: 3000, deductedAmount: 0, serviceChargeAmount: 0 },
    ];

    /** Build a mock query object that supports the WatermelonDB chaining the component uses */
    function makeBorrowerQueryMock(data: any[]) {
        const extendFetch = jest.fn().mockResolvedValue(data);
        const extendObj = { fetch: extendFetch };
        return {
            fetchCount: jest.fn().mockResolvedValue(data.length),
            fetch: jest.fn().mockResolvedValue(data),
            extend: jest.fn().mockReturnValue(extendObj),
        };
    }

    function makeLoanQueryMock(data: any[]) {
        return {
            fetchCount: jest.fn().mockResolvedValue(data.length),
            fetch: jest.fn().mockResolvedValue(data),
            extend: jest.fn().mockReturnValue({ fetch: jest.fn().mockResolvedValue(data) }),
        };
    }

    beforeEach(() => {
        jest.clearAllMocks();

        (database.collections.get as jest.Mock).mockImplementation((collectionName) => {
            if (collectionName === 'borrowers') {
                const qMock = makeBorrowerQueryMock(mockBorrowers);
                return { query: jest.fn().mockReturnValue(qMock) };
            }
            if (collectionName === 'loans') {
                const qMock = makeLoanQueryMock(mockLoans);
                return { query: jest.fn().mockReturnValue(qMock) };
            }
            // payments, loan_penalties → empty
            return {
                query: jest.fn().mockReturnValue({
                    fetchCount: jest.fn().mockResolvedValue(0),
                    fetch: jest.fn().mockResolvedValue([]),
                    extend: jest.fn().mockReturnValue({ fetch: jest.fn().mockResolvedValue([]) }),
                }),
            };
        });
    });

    it('renders and displays all borrowers in DataTable (default view)', async () => {
        const view = render(<BorrowersListScreen />);
        await waitFor(() => {
            expect(view.getByText('Alice')).toBeTruthy();
            expect(view.getByText('Bob')).toBeTruthy();
            expect(view.getByText('Charlie')).toBeTruthy();
        }, { timeout: 3000 });
    });

    it('shows date-range filter tabs (All Time, Today, This Week, This Month)', async () => {
        const view = render(<BorrowersListScreen />);
        await waitFor(() => { expect(view.getByText('Alice')).toBeTruthy(); }, { timeout: 3000 });
        expect(view.getByText('All Time')).toBeTruthy();
        expect(view.getByText('Today')).toBeTruthy();
        expect(view.getByText('This Week')).toBeTruthy();
        expect(view.getByText('This Month')).toBeTruthy();
    });

    it('switching to card view renders the FlatList', async () => {
        const view = render(<BorrowersListScreen />);
        await waitFor(() => { expect(view.getByText('Alice')).toBeTruthy(); }, { timeout: 3000 });

        // Switch to card view
        fireEvent.press(view.getByTestId('view-toggle-card'));

        // Card view should re-render; all borrowers are still in mock data
        await waitFor(() => {
            expect(view.getByText('Alice')).toBeTruthy();
        }, { timeout: 3000 });
    });

    it('search bar is visible and accepts text input', async () => {
        const view = render(<BorrowersListScreen />);
        await waitFor(() => { expect(view.getByText('Alice')).toBeTruthy(); }, { timeout: 3000 });

        const searchInput = view.getByPlaceholderText('Search borrower name...');
        expect(searchInput).toBeTruthy();
        fireEvent.changeText(searchInput, 'Alice');
        // Mock always returns all borrowers; Alice should still be visible
        await waitFor(() => { expect(view.getByText('Alice')).toBeTruthy(); }, { timeout: 3000 });
    });

    it('pressing a borrower row navigates to detail', async () => {
        const view = render(<BorrowersListScreen />);
        await waitFor(() => { expect(view.getByTestId('row-b1')).toBeTruthy(); }, { timeout: 3000 });
        fireEvent.press(view.getByTestId('row-b1'));
        expect(mockPush).toHaveBeenCalledWith('/(admin)/borrowers/b1');
    });

    it('shows the add-borrower FAB', async () => {
        const view = render(<BorrowersListScreen />);
        await waitFor(() => { expect(view.getByText('Alice')).toBeTruthy(); }, { timeout: 3000 });
        // FAB icon name
        expect(view.getByText('person-add')).toBeTruthy();
    });
});
