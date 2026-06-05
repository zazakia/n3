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
    deductedAmount?: number;
    serviceChargeAmount?: number;
    loanBatch?: number | string;
    isReloan?: boolean;
}

interface PaymentRow {
    paymentDate: number;
    receiptNumber?: string;
    amount: number;
    pSavings?: number;
    pInsurance?: number;
    runningBalance: number;
    notes?: string;
}

export type VoucherPaperSize = 'letter' | 'a4' | 'legal';

export interface VoucherPrintOptions {
    paperSize?: VoucherPaperSize;
}

interface VoucherData {
    borrower: BorrowerInfo;
    loan: LoanInfo;
}

const VOUCHER_PAPER_SIZES: Record<VoucherPaperSize, string> = {
    letter: '8.5in 11in',
    a4: '210mm 297mm',
    legal: '8.5in 14in',
};

export class PdfGenerator {
    static async generateStatementOfAccount(
        borrower: BorrowerInfo,
        loan: LoanInfo,
        payments: PaymentRow[]
    ): Promise<void> {
        const totalPaid = payments.reduce((s, p) => s + p.amount, 0);

        const depositAmount = loan.depositAmount || 0;
        const insuranceAmount = loan.insuranceAmount || 0;
        const grossTotalLoan = loan.totalAmount || 1;
        
        const accumulatedSavings = payments.reduce((s, p) => s + (p.pSavings || 0), 0);
        const accumulatedInsurance = payments.reduce((s, p) => s + (p.pInsurance || 0), 0);
        
        const grossBalance = Math.max(0, grossTotalLoan - totalPaid);

        const generatedDate = formatDate(new Date());

        const paymentRows = payments.map((p, idx) => `
      <tr style="background:${idx % 2 === 0 ? '#fff' : '#f9f9f9'}">
        <td>${formatDate(new Date(p.paymentDate))}</td>
        <td>${p.receiptNumber ?? '—'}</td>
        <td style="text-align:right">${formatPHP(p.amount)}</td>
        <td style="text-align:right; color:#E65100">${p.pSavings ? formatPHP(p.pSavings) : '—'}</td>
        <td style="text-align:right; color:#4F46E5">${p.pInsurance ? formatPHP(p.pInsurance) : '—'}</td>
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
              <th style="text-align:right">Insurance</th>
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
          <div class="label">Informational Insurance</div>
          <div class="value" style="color:#4F46E5">${formatPHP(accumulatedInsurance)}</div>
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
            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(html);
                printWindow.document.close();
                printWindow.focus();
                setTimeout(() => {
                    printWindow.print();
                    printWindow.close();
                }, 250);
            } else {
                await Print.printAsync({ html });
            }
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

    private static buildVoucherCardHtml(borrower: BorrowerInfo, loan: LoanInfo): string {
        const generatedDate = loan.releaseDate ? formatDate(new Date(loan.releaseDate)) : formatDate(new Date());
        let batchText = loan.loanBatch ? loan.loanBatch.toString() : '';
        if (loan.isReloan && !batchText.toLowerCase().includes('reloan')) {
             batchText += ' (RELOAN)';
        }

        const previousLoanDeduction = loan.deductedAmount || 0;
        const serviceCharge = loan.serviceChargeAmount || 0;
        const totalDeductions = previousLoanDeduction + serviceCharge;
        const netAmount = loan.principalAmount - previousLoanDeduction - serviceCharge;
        const remarks = [
            loan.loanNumber,
            batchText ? `Batch ${batchText}` : '',
            loan.isReloan ? 'Reloan' : '',
        ].filter(Boolean).join(' • ');
        const stripCurrency = (value: string) => value.replace('₱', '').trim();

        return `
          <section class="voucher-card">
            <div class="receipt-header">
              <div class="receipt-mark">IF</div>
              <div class="receipt-title">CASH RECEIPT</div>
            </div>

            <div class="top-fields">
              <div class="field received">
                <span>RECEIVED FROM:</span>
                <b>${borrower.fullName}</b>
              </div>
              <div class="field date">
                <b>${generatedDate}</b>
                <small>DATE</small>
              </div>
            </div>

            <div class="field amount-received">
              <span>AMOUNT RECEIVED:</span>
              <b>${stripCurrency(formatPHP(netAmount))}</b>
            </div>
            <div class="field remarks">
              <span>REMARKS:</span>
              <b>${remarks || '&nbsp;'}</b>
            </div>

            <div class="salary-lines">
              <div class="money-line">
                <strong>${stripCurrency(formatPHP(loan.principalAmount))}</strong>
                <span>amt. of salary / pension</span>
              </div>
              <div class="money-line">
                <strong>${stripCurrency(formatPHP(totalDeductions))}</strong>
                <span>amt. due on</span>
                <em>${generatedDate}</em>
              </div>
              <div class="money-line">
                <strong>${stripCurrency(formatPHP(netAmount))}</strong>
                <span>amt. remaining</span>
              </div>
            </div>

            <div class="deductions">
              <h3>DEDUCTIONS:</h3>
              <div>${previousLoanDeduction > 0 ? `${stripCurrency(formatPHP(previousLoanDeduction))} - Previous Loan Balance` : '&nbsp;'}</div>
              <div>${serviceCharge > 0 ? `${stripCurrency(formatPHP(serviceCharge))} - Service Fee` : '&nbsp;'}</div>
            </div>

            <div class="receipt-footer">
              <div class="signature-name">${borrower.fullName}</div>
              <div class="signature-label">SIGNATURE OVER PRINTED NAME</div>
              <div class="recipient-label">RECIPIENT</div>
            </div>
          </section>
        `;
    }

    private static buildVoucherHtml(vouchers: VoucherData[], options: VoucherPrintOptions = {}): string {
        const paperSize = options.paperSize || 'letter';
        const pageSize = VOUCHER_PAPER_SIZES[paperSize] || VOUCHER_PAPER_SIZES.letter;
        const cards = vouchers.map(({ borrower, loan }) => this.buildVoucherCardHtml(borrower, loan)).join('');

        return `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8"/>
          <style>
            @page { size: ${pageSize}; margin: 0.22in; }
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; margin: 0; color: #173d3a; font-size: 8.5px; }
            .sheet {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              grid-auto-rows: calc((100vh - 0.01px) / 4);
              gap: 0;
              width: 100%;
              min-height: 100vh;
            }
            .voucher-card {
              break-inside: avoid;
              page-break-inside: avoid;
              border: 1.5px solid #2f5d55;
              padding: 0.08in 0.1in;
              display: flex;
              flex-direction: column;
              overflow: hidden;
              background: #fbfaf2;
            }
            .voucher-card:nth-child(8n) { break-after: page; page-break-after: always; }
            .receipt-header { display: flex; align-items: center; justify-content: center; gap: 7px; border-bottom: 1px solid #2f5d55; padding-bottom: 2px; margin-bottom: 5px; }
            .receipt-mark { width: 18px; height: 18px; border: 2px solid #2e8b83; color: #2e8b83; transform: rotate(45deg); display: flex; align-items: center; justify-content: center; font-size: 6px; font-weight: 900; }
            .receipt-mark::first-letter { transform: rotate(-45deg); }
            .receipt-title { color: #222; font-size: 18px; font-weight: 900; letter-spacing: 0.5px; }
            .top-fields { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
            .field { display: flex; align-items: baseline; gap: 4px; color: #1f4f49; font-weight: 900; line-height: 1.1; }
            .field span { color: #222; font-size: 8.5px; white-space: nowrap; }
            .field b { color: #111; font-size: 9.5px; border-bottom: 1px solid #333; min-height: 12px; flex: 1; padding: 0 3px; }
            .received { flex: 1; min-width: 0; }
            .date { width: 30%; flex-direction: column; align-items: center; gap: 0; }
            .date b { width: 100%; text-align: center; flex: none; }
            .date small { color: #333; font-size: 6.5px; font-weight: 900; }
            .amount-received, .remarks { margin-top: 3px; }
            .amount-received b, .remarks b { max-width: 72%; }
            .salary-lines { margin-top: 8px; }
            .money-line { display: flex; align-items: baseline; gap: 6px; margin-bottom: 2px; color: #2f7770; font-weight: 900; }
            .money-line::before { content: "P"; color: #0f6d69; font-size: 10px; font-weight: 900; }
            .money-line strong { color: #111; font-size: 11px; min-width: 55px; border-bottom: 1px solid #333; text-align: center; }
            .money-line span { color: #2f7770; font-size: 10px; }
            .money-line em { color: #111; font-size: 9px; border-bottom: 1px solid #333; min-width: 50px; text-align: center; font-style: normal; }
            .deductions { margin-top: 5px; color: #111; font-weight: 800; min-height: 34px; }
            .deductions h3 { color: #1f4f49; font-size: 10px; margin: 0 0 3px; letter-spacing: 0.5px; }
            .deductions div { margin-left: 26px; font-size: 9.5px; line-height: 1.25; }
            .receipt-footer { margin-top: auto; align-self: flex-end; width: 50%; text-align: center; color: #222; }
            .signature-name { border-bottom: 1px solid #333; min-height: 14px; font-size: 9px; font-weight: 900; text-transform: uppercase; }
            .signature-label, .recipient-label { font-size: 6.8px; font-weight: 900; line-height: 1.05; }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <main class="sheet">${cards}</main>
        </body>
        </html>
        `;
    }

    static async generateVoucher(
        borrower: BorrowerInfo,
        loan: LoanInfo,
        options: VoucherPrintOptions = {}
    ): Promise<void> {
        const html = this.buildVoucherHtml([{ borrower, loan }], options);

        if (Platform.OS === 'web') {
            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(html);
                printWindow.document.close();
                printWindow.focus();
                setTimeout(() => {
                    printWindow.print();
                    printWindow.close();
                }, 250);
            } else {
                await Print.printAsync({ html });
            }
            return;
        }

        const { uri } = await Print.printToFileAsync({ html });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
            await Sharing.shareAsync(uri, {
                mimeType: 'application/pdf',
                dialogTitle: `Voucher — ${borrower.fullName}`,
            });
        }
    }

    static async generateVoucherBatch(
        vouchers: VoucherData[],
        options: VoucherPrintOptions = {}
    ): Promise<void> {
        if (vouchers.length === 0) return;

        const html = this.buildVoucherHtml(vouchers, options);

        if (Platform.OS === 'web') {
            const printWindow = window.open('', '_blank');
            if (printWindow) {
                printWindow.document.write(html);
                printWindow.document.close();
                printWindow.focus();
                setTimeout(() => {
                    printWindow.print();
                    printWindow.close();
                }, 250);
            } else {
                await Print.printAsync({ html });
            }
            return;
        }

        const { uri } = await Print.printToFileAsync({ html });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
            await Sharing.shareAsync(uri, {
                mimeType: 'application/pdf',
                dialogTitle: `Vouchers — ${vouchers.length} loan${vouchers.length === 1 ? '' : 's'}`,
            });
        }
    }
}
