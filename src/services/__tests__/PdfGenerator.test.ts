import { PdfGenerator } from '../PdfGenerator';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

// Mock expo modules
jest.mock('expo-print', () => ({
  printToFileAsync: jest.fn().mockResolvedValue({ uri: 'mock-uri' }),
  printAsync: jest.fn().mockResolvedValue(true),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(true),
}));

// Mock utils
jest.mock('../../utils/dates', () => ({
  formatDate: jest.fn().mockReturnValue('2026-01-01'),
}));

jest.mock('../../utils/currency', () => ({
  formatPHP: jest.fn().mockImplementation((val) => `PHP ${val}`),
}));

describe('PdfGenerator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('generates and shares a statement of account', async () => {
    // Omitting optional fields to hit the ?? '—' fallbacks
    const borrower = { fullName: 'John Doe' };
    const loan = { 
      loanNumber: 'L-1001', 
      principalAmount: 10000, 
      interestRate: 3.5, 
      interestType: 'diminishing',
      term: 3,
      termUnit: 'months',
      frequency: 'weekly',
      installmentAmount: 800,
      totalAmount: 11050,
      status: 'active'
    };
    const payments = [
      { paymentDate: 1735689600000, amount: 800, runningBalance: 10250 } // Omitted receiptNumber and notes
    ];

    await PdfGenerator.generateStatementOfAccount(borrower as any, loan as any, payments as any);

    expect(Print.printToFileAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining('INFINITY FINANCE')
      })
    );
    expect(Sharing.isAvailableAsync).toHaveBeenCalled();
    expect(Sharing.shareAsync).toHaveBeenCalledWith('mock-uri', expect.objectContaining({
      mimeType: 'application/pdf',
      dialogTitle: expect.stringContaining('John Doe')
    }));
  });

  it('renders deposit and insurance rows if provided', async () => {
    const loanWithFees = { 
      loanNumber: 'L-5', totalAmount: 1100, installmentAmount: 200, status: 'active', principalAmount: 1000,
      depositAmount: 50, insuranceAmount: 20,
      releaseDate: 1735689600000, maturityDate: 1738689600000
    };
    const borrower = { fullName: 'Jane', dateOfBirth: 946684800000, address: '123 Test', phone: '123', gender: 'Female' };
    const payments = [{ paymentDate: 1735689600000, amount: 200, pSavings: 50, runningBalance: 900, notes: 'Paid', receiptNumber: 'R1' }];

    await PdfGenerator.generateStatementOfAccount(borrower as any, loanWithFees as any, payments as any);
    expect(Print.printToFileAsync).toHaveBeenCalled();
  });

  it('works correctly with zero payments', async () => {
    const borrower = { fullName: 'No Pay' };
    const loan = { loanNumber: 'L-0', totalAmount: 500, status: 'pending', principalAmount: 500 };
    
    await PdfGenerator.generateStatementOfAccount(borrower as any, loan as any, [] as any);
    
    expect(Print.printToFileAsync).toHaveBeenCalled();
    expect(Sharing.shareAsync).toHaveBeenCalled();
  });

  it('handles sharing unavailable gracefully', async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(false);
    
    await PdfGenerator.generateStatementOfAccount({ fullName: 'Broken Share' } as any, { status: 'X', principalAmount: 0 } as any, []);
    
    expect(Print.printToFileAsync).toHaveBeenCalled();
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
  });

  it('uses printAsync on web platform', async () => {
    const { Platform } = require('react-native');
    const originalOS = Platform.OS;
    Platform.OS = 'web';

    await PdfGenerator.generateStatementOfAccount({ fullName: 'Web' } as any, { status: 'X', principalAmount: 0 } as any, []);
    
    expect(Print.printAsync).toHaveBeenCalled();

    Platform.OS = originalOS;
  });
});

