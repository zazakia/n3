import React from 'react';
import { render, fireEvent, waitFor, screen, act } from '@testing-library/react-native';
import NewLoanScreen from '../(admin)/loans/new';

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('expo-router', () => ({
    useRouter: jest.fn(() => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() })),
    useLocalSearchParams: jest.fn(() => ({})),
}));

jest.mock('../../src/store/AuthContext', () => ({
    useAuth: jest.fn(() => ({ user: { id: 'test-user-id' } })),
}));

jest.mock('../../src/database', () => {
    const mockCollection = {
        find: jest.fn().mockResolvedValue({ collectorId: 'col-1' }),
        query: jest.fn(() => ({ fetch: jest.fn().mockResolvedValue([]) })),
    };
    return {
        database: {
            get: jest.fn(() => mockCollection),
            collections: {
                get: jest.fn(() => mockCollection),
            },
        },
    };
});

jest.mock('../../src/services/LoanService', () => ({
    LoanService: { saveLoan: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../../src/services/LoanCalculatorService', () => ({
    LoanCalculatorService: {
        calculateServiceCharge: jest.fn((principal: number) => principal * 0.02),
        calculate: jest.fn(() => ({
            totalAmount: 6000,
            totalInterest: 1000,
            installmentAmount: 1000,
            maturityDate: new Date('2027-01-01'),
            firstPaymentDate: new Date('2026-07-01'),
            schedule: [],
        })),
        generateLoanNumber: jest.fn(() => 'L-TEST-001'),
    },
}));

jest.mock('../../src/services/AuditService', () => ({
    AuditService: jest.fn().mockImplementation(() => ({
        validateLoanPreSave: jest.fn().mockResolvedValue([]),
    })),
}));

jest.mock('../../src/components/BorrowerSelector', () => {
    const { View, Text } = require('react-native');
    return {
        BorrowerSelector: ({ onSelect }: any) => (
            <View testID="borrower-selector">
                <Text onPress={() => onSelect({ id: 'borrower-1', collectorId: 'col-1' })}>
                    Select Borrower
                </Text>
            </View>
        ),
    };
});

jest.mock('../../src/components/DatePicker', () => {
    const { View, Text } = require('react-native');
    return {
        DatePicker: ({ value, onChange }: any) => (
            <View testID="date-picker">
                <Text onPress={() => onChange(value)}>{value}</Text>
            </View>
        ),
    };
});

jest.mock('../../src/components/AuditReportDialog', () => ({
    AuditReportDialog: () => null,
}));

jest.mock('../../src/components/CalculationBasisCard', () => ({
    CalculationBasisCard: () => null,
}));

jest.mock('../../src/utils/navigation', () => ({
    safeBack: jest.fn(),
}));

jest.mock('react-native/Libraries/Alert/Alert', () => ({
    __esModule: true,
    default: {
        alert: jest.fn(),
    },
}));

jest.mock('../../src/components/SyncStatusIndicator', () => ({
    SyncStatusIndicator: () => null,
}));

jest.mock('../../src/components/ConfirmDialog', () => () => null);

// ── Tests ──────────────────────────────────────────────────────────────────

describe('NewLoanScreen', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'time').mockImplementation(() => {});
        jest.spyOn(console, 'timeEnd').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('renders the form with default values', async () => {
        render(<NewLoanScreen />);
        await waitFor(() => {
            expect(screen.getByDisplayValue('5000')).toBeTruthy();
            expect(screen.getByDisplayValue('20')).toBeTruthy();
            expect(screen.getByDisplayValue('6')).toBeTruthy();
        });
    });

    it('shows validation error when borrower is not selected', async () => {
        render(<NewLoanScreen />);
        await waitFor(() => screen.getByDisplayValue('5000'));

        const saveBtn = screen.getByText(/Save Draft/i);
        fireEvent.press(saveBtn);

        await waitFor(() => {
            expect(screen.getByText(/Borrower is required/i)).toBeTruthy();
        });
    });

    it('shows validation error for invalid principal', async () => {
        render(<NewLoanScreen />);
        await waitFor(() => screen.getByDisplayValue('5000'));

        fireEvent.changeText(screen.getByDisplayValue('5000'), '-100');
        fireEvent.press(screen.getByText(/Save Draft/i));

        await waitFor(() => {
            expect(screen.getByText(/Principal must be positive/i)).toBeTruthy();
        });
    });

    it('shows validation error for invalid term', async () => {
        render(<NewLoanScreen />);
        await waitFor(() => screen.getByDisplayValue('6'));

        fireEvent.changeText(screen.getByDisplayValue('6'), '0');
        fireEvent.press(screen.getByText(/Save Draft/i));

        await waitFor(() => {
            expect(screen.getByText(/Term must be at least 1/i)).toBeTruthy();
        });
    });

    it('shows calc preview after valid inputs are entered', async () => {
        render(<NewLoanScreen />);
        // Calc preview appears automatically once principal/rate/term are valid (defaults are valid)
        await waitFor(() => {
            expect(screen.getByText(/PHP 6,000/i)).toBeTruthy();
        });
    });

    it('calls LoanService.saveLoan with status=pending on Save as Draft', async () => {
        const { LoanService } = require('../../src/services/LoanService');
        render(<NewLoanScreen />);
        await waitFor(() => screen.getByText(/PHP 6,000/i));

        // Select a borrower so validation passes
        fireEvent.press(screen.getAllByText('Select Borrower')[1]);

        fireEvent.press(screen.getByText('Save Draft'));

        await waitFor(() => {
            expect(LoanService.saveLoan).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'pending' })
            );
        });
    });

    it('calls LoanService.saveLoan with status=active on Disburse', async () => {
        const { LoanService } = require('../../src/services/LoanService');
        render(<NewLoanScreen />);
        await waitFor(() => screen.getByText(/PHP 6,000/i));

        fireEvent.press(screen.getAllByText('Select Borrower')[1]);

        fireEvent.press(screen.getByText('Disburse'));

        await waitFor(() => {
            expect(LoanService.saveLoan).toHaveBeenCalledWith(
                expect.objectContaining({ status: 'active' })
            );
        });
    });

    it('disables save buttons while saving', async () => {
        const { LoanService } = require('../../src/services/LoanService');
        LoanService.saveLoan.mockImplementation(() => new Promise(() => {}));

        render(<NewLoanScreen />);
        await waitFor(() => screen.getByText(/PHP 6,000/i));

        fireEvent.press(screen.getAllByText('Select Borrower')[1]);
        fireEvent.press(screen.getByText('Save Draft'));

        await waitFor(() => {
            // While saving, the Save Draft button is disabled
            let el: any = screen.getByText('Save Draft');
            while (el && el.props.disabled === undefined && el.parent) {
                el = el.parent;
            }
            expect(el?.props.disabled).toBe(true);
        });
    });
});
