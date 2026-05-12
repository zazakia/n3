import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { formatDate } from '../utils/dates';
import { formatPHP } from '../utils/currency';

interface BorrowerInfo {
    fullName: string;
    address?: string;
    phone?: string;
    dateOfBirth?: number;
    gender?: string;
}

interface LoanInfo {
    loanNumber: string;
    principalAmount: number;
    interestRate: number;
    interestType: string;
    term: number;
    termUnit: string;
    frequency: string;
    installmentAmount: number;
    depositAmount?: number;
    insuranceAmount?: number;
    releaseDate?: number;
    maturityDate?: number;
    totalAmount: number;
    status: string;
}

interface PaymentRow {
    paymentDate: number;
    receiptNumber?: string;
    amount: number;
    pSavings?: number;
    runningBalance: number;
    notes?: string;
}

export class PdfGenerator {
    static async generateStatementOfAccount(
        borrower: BorrowerInfo,
        loan: LoanInfo,
        payments: PaymentRow[]
    ): Promise<void> {
        const totalPaid = payments.reduce((s, p) => s + p.amount, 0);

        // GROSS METHOD: Everything is grouped together. Total Balance is simply Total Loan - Total Paid.
        const depositAmount = loan.depositAmount || 0;
        const grossTotalLoan = loan.totalAmount || 1;
        
        // Fraction of each payment that goes to Savings (for informational tracking)
        const savingsRatio = depositAmount / grossTotalLoan;
        const accumulatedSavings = totalPaid * savingsRatio;
        
        const grossBalance = Math.max(0, grossTotalLoan - totalPaid);

        const generatedDate = formatDate(new Date());

        const paymentRows = payments.map((p, idx) => `
      <tr style="background:${idx % 2 === 0 ? '#fff' : '#f9f9f9'}">
        <td>${formatDate(new Date(p.paymentDate))}</td>
        <td>${p.receiptNumber ?? '—'}</td>
        <td style="text-align:right">${formatPHP(p.amount)}</td>
        <td style="text-align:right; color:#E65100">${p.pSavings ? formatPHP(p.pSavings) : '—'}</td>
        <td style="text-align:right">${formatPHP(p.runningBalance)}</td>
        <td>${p.notes ?? ''}</td>
      </tr>
    `).join('');

        const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8"/>
      <style>
        body { font-family: Arial, sans-serif; margin: 32px; color: #222; font-size: 12px; }
        .header { text-align: center; margin-bottom: 24px; border-bottom: 3px solid #D32F2F; padding-bottom: 12px; }
        .header h1 { color: #D32F2F; margin: 0; font-size: 22px; letter-spacing: 2px; }
        .header h2 { margin: 4px 0 0; font-size: 14px; color: #555; font-weight: normal; }
        .section-title { background: #D32F2F; color: white; padding: 6px 12px; margin-top: 20px; font-weight: bold; }
        table.info { width: 100%; border-collapse: collapse; margin-top: 8px; }
        table.info td { padding: 5px 8px; border: 1px solid #ddd; }
        table.info td:first-child { font-weight: bold; background: #f5f5f5; width: 35%; }
        table.ledger { width: 100%; border-collapse: collapse; margin-top: 8px; }
        table.ledger th { background: #1A237E; color: white; padding: 8px; text-align: left; }
        table.ledger td { padding: 7px 8px; border-bottom: 1px solid #eee; }
        .summary { margin-top: 20px; display: flex; gap: 32px; }
        .summary-box { border: 2px solid #D32F2F; border-radius: 8px; padding: 12px 20px; text-align: center; }
        .summary-box .label { font-size: 11px; color: #666; }
        .summary-box .value { font-size: 18px; font-weight: bold; color: #D32F2F; }
        .footer { margin-top: 40px; border-top: 1px solid #ccc; padding-top: 12px; text-align: center; color: #999; font-size: 10px; }
        .outstanding { color: #C62828; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>♾ INFINITY FINANCE</h1>
        <h2>Statement of Account</h2>
      </div>

      <div class="section-title">Borrower Information</div>
      <table class="info">
        <tr><td>Full Name</td><td>${borrower.fullName}</td></tr>
        <tr><td>Address</td><td>${borrower.address ?? '—'}</td></tr>
        <tr><td>Phone</td><td>${borrower.phone ?? '—'}</td></tr>
        <tr><td>Date of Birth</td><td>${borrower.dateOfBirth ? formatDate(new Date(borrower.dateOfBirth)) : '—'}</td></tr>
        <tr><td>Gender</td><td>${borrower.gender ?? '—'}</td></tr>
      </table>

      <div class="section-title">Loan Information</div>
      <table class="info">
        <tr><td>Loan Number</td><td>${loan.loanNumber}</td></tr>
        <tr><td>Principal Amount</td><td>${formatPHP(loan.principalAmount)}</td></tr>
        <tr><td>Interest Rate</td><td>${loan.interestRate}% (${loan.interestType === 'flat' ? 'Flat Rate' : 'Diminishing Balance'})</td></tr>
        <tr><td>Term</td><td>${loan.term} ${loan.termUnit}</td></tr>
        <tr><td>Frequency</td><td>${loan.frequency}</td></tr>
        <tr><td>Installment Amount</td><td>${formatPHP(loan.installmentAmount)}</td></tr>
        <tr><td>Total Amount</td><td>${formatPHP(grossTotalLoan)}</td></tr>
        ${loan.depositAmount ? `<tr><td>Informational Deposit (Savings)</td><td>${formatPHP(loan.depositAmount)}</td></tr>` : ''}
        ${loan.insuranceAmount ? `<tr><td>Informational Insurance</td><td>${formatPHP(loan.insuranceAmount)}</td></tr>` : ''}
        <tr><td>Release Date</td><td>${loan.releaseDate ? formatDate(new Date(loan.releaseDate)) : '—'}</td></tr>
        <tr><td>Maturity Date</td><td>${loan.maturityDate ? formatDate(new Date(loan.maturityDate)) : '—'}</td></tr>
        <tr><td>Status</td><td>${loan.status.toUpperCase()}</td></tr>
      </table>

      <div class="section-title">Payment Ledger</div>
      ${payments.length > 0 ? `
        <table class="ledger">
          <thead>
            <tr>
              <th>Date</th>
              <th>Receipt No.</th>
              <th style="text-align:right">Amount</th>
              <th style="text-align:right">Savings</th>
              <th style="text-align:right">Running Balance</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>${paymentRows}</tbody>
        </table>
      ` : '<p style="color:#888;text-align:center;padding:16px">No payments recorded yet.</p>'}

      <div class="summary">
        <div class="summary-box">
          <div class="label">Total Paid</div>
          <div class="value">${formatPHP(totalPaid)}</div>
        </div>
        <div class="summary-box">
          <div class="label">Informational Savings</div>
          <div class="value" style="color:#E65100">${formatPHP(accumulatedSavings)}</div>
        </div>
        <div class="summary-box">
          <div class="label">Loan Balance</div>
          <div class="value outstanding">${formatPHP(grossBalance)}</div>
        </div>
      </div>

      <div class="footer">
        Generated on ${generatedDate} &bull; INFINITY FINANCE Loan Management System &bull; Confidential
      </div>
    </body>
    </html>
    `;

        if (Platform.OS === 'web') {
            await Print.printAsync({ html });
            return;
        }

        const { uri } = await Print.printToFileAsync({ html });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
            await Sharing.shareAsync(uri, {
                mimeType: 'application/pdf',
                dialogTitle: `Statement of Account — ${borrower.fullName}`,
            });
        }
    }
}
