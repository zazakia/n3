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

    static async generateVoucher(
        borrower: BorrowerInfo,
        loan: LoanInfo
    ): Promise<void> {
        const generatedDate = loan.releaseDate ? formatDate(new Date(loan.releaseDate)) : formatDate(new Date());
        
        let batchText = loan.loanBatch ? loan.loanBatch.toString() : '';
        if (loan.isReloan && !batchText.toLowerCase().includes('reloan')) {
             batchText += ' (RELOAN)';
        }

        // Formatted Values
        const formattedAmount = formatPHP(loan.principalAmount);
        const isReloanFormat = !!loan.isReloan;
        const deduction = loan.deductedAmount || 0;
        const formattedBalance = isReloanFormat ? formatPHP(deduction) : '';
        const netAmount = loan.principalAmount - (isReloanFormat ? deduction : 0);
        const formattedNetAmount = formatPHP(netAmount);

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8"/>
          <style>
            @page { size: 8.5in 5.5in; margin: 0; }
            body { font-family: Arial, sans-serif; margin: 0.5in; margin-bottom: 0.6in; color: #222; font-size: 14px; box-sizing: border-box; }
            .header-info { display: flex; flex-direction: column; margin-bottom: 15px; font-weight: bold; }
            .header-info div { margin-bottom: 3px; }
            .title { text-align: center; font-size: 36px; font-weight: bold; border-bottom: 1px solid #000; padding-bottom: 8px; margin-bottom: 20px; letter-spacing: 2px; }
            
            .row { display: flex; justify-content: space-between; margin-bottom: 10px; }
            
            .table-container { width: 100%; display: flex; justify-content: center; margin-bottom: 25px; }
            table { width: 80%; border-collapse: collapse; text-align: center; }
            th { font-weight: bold; color: #555; padding-bottom: 8px; font-size: 14px; }
            td { font-weight: bold; font-size: 16px; padding: 8px 0; }
            
            .series { text-align: right; margin-right: 10%; margin-top: 15px; font-weight: bold; font-size: 12px; color: #555;}
            
            .signatures { display: flex; justify-content: space-between; margin-top: 45px; text-align: center; font-size: 12px; font-weight: bold; }
            .sig-block { width: 30%; }
            .sig-line { border-bottom: 1px solid #000; margin-bottom: 5px; height: 30px; }
            .sig-label { color: #555; font-weight: normal; margin-top: 5px; }
          </style>
        </head>
        <body>
          <div class="header-info">
            <div>DATE: ${generatedDate}</div>
            <div>Batch #: ${batchText}</div>
          </div>
          
          <div class="title">Voucher</div>

          <div class="table-container">
            <table>
              <thead>
                <tr>
                  <th>Client name</th>
                  ${isReloanFormat ? '<th>Loan Balance</th>' : ''}
                  <th>Amount</th>
                  ${isReloanFormat ? '<th>Net Amount</th>' : ''}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>${borrower.fullName}</td>
                  ${isReloanFormat ? `<td>${formattedBalance.replace('₱', '').trim()}</td>` : ''}
                  <td>${formattedAmount.replace('₱', '').trim()}</td>
                  ${isReloanFormat ? `<td>${formattedNetAmount.replace('₱', '').trim()}</td>` : ''}
                </tr>
              </tbody>
            </table>
          </div>

          <div class="series">
            Series N0.${loan.loanNumber.slice(-4) /* Using last 4 chars as rough series proxy or just the loan number */}
          </div>

          <div class="signatures">
             <div class="sig-block" style="text-align: left; width: 40%;">
                <div class="sig-line"></div>
                <div>Signature over Printed Name</div>
             </div>
          </div>

          <div class="signatures" style="margin-top: 25px;">
             <div class="sig-block" style="text-align: left;">
                <div class="sig-label" style="font-weight: bold; color: #000;">Noted By: ____________________</div>
                <div style="margin-left: 65px;">Account Officer</div>
             </div>
             <div class="sig-block" style="text-align: right;">
                <div class="sig-label" style="font-weight: bold; color: #000;">Approve By: ____________________</div>
                <div style="margin-right: 25px;">OIC</div>
             </div>
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
                dialogTitle: `Voucher — ${borrower.fullName}`,
            });
        }
    }
}
