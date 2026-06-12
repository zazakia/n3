import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { formatDate } from '../utils/dates';
import { formatPHP } from '../utils/currency';

export interface GenericReportOptions {
    title: string;
    subtitle?: string;
    headers: string[];
    data: (string | number | React.ReactNode)[][];
    summaryBoxes?: { label: string; value: string }[];
    landscape?: boolean;
}

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

        await this.printHtml(html, `Statement of Account — ${borrower.fullName}`);
    }

    private static async printHtml(html: string, dialogTitle: string = 'Document') {
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
                dialogTitle,
            });
        }
    }


    private static buildVoucherCardHtml(borrower: BorrowerInfo, loan: LoanInfo): string {
        const generatedDate = loan.releaseDate ? formatDate(new Date(loan.releaseDate)) : formatDate(new Date());
        let batchText = loan.loanBatch ? loan.loanBatch.toString() : '';
        if (loan.isReloan && !batchText.toLowerCase().includes('reloan')) {
             batchText += ' (RELOAN)';
        }

        let batchLine = batchText ? `Batch #: ${batchText}` : '&nbsp;';
        if (batchText.toLowerCase().startsWith('center:')) {
            batchLine = batchText;
        } else if (batchText.toLowerCase().includes('zone')) {
            batchLine = `Center: ${batchText}`;
        }

        const previousLoanDeduction = loan.deductedAmount || 0;
        const serviceCharge = loan.serviceChargeAmount || 0;
        const netAmount = loan.principalAmount - previousLoanDeduction - serviceCharge;
        const stripCurrency = (value: string) => value.replace('₱', '').trim();

        let rightColumnContent = '';

        if (previousLoanDeduction > 0) {
            rightColumnContent = `
                <table style="width: 100%; text-align: center; font-weight: bold; font-size: 14px;">
                    <tr>
                        <td style="padding-bottom: 10px;">Loan Balance</td>
                        <td style="padding-bottom: 10px;">Amount</td>
                        <td style="padding-bottom: 10px;">Net Amount</td>
                    </tr>
                    <tr>
                        <td>${stripCurrency(formatPHP(previousLoanDeduction))}</td>
                        <td>${stripCurrency(formatPHP(loan.principalAmount))}</td>
                        <td>${stripCurrency(formatPHP(netAmount))}</td>
                    </tr>
                </table>
            `;
        } else if (serviceCharge > 0) {
            const feePercentage = Math.round((serviceCharge / loan.principalAmount) * 100);
            rightColumnContent = `
                <div style="text-align: center; font-weight: bold; font-size: 14px;">
                    <div style="margin-bottom: 10px;">Amount</div>
                    <div style="margin-bottom: 10px;">${feePercentage}% service fee: ${stripCurrency(formatPHP(serviceCharge))}</div>
                    <div style="margin-bottom: 10px;">Net Amount: ${stripCurrency(formatPHP(netAmount))}</div>
                </div>
            `;
        } else {
            rightColumnContent = `
                <table style="width: 100%; text-align: center; font-weight: bold; font-size: 14px;">
                    <tr>
                        <td style="padding-bottom: 10px;">Amount</td>
                    </tr>
                    <tr>
                        <td>${stripCurrency(formatPHP(loan.principalAmount))}</td>
                    </tr>
                </table>
            `;
        }

        rightColumnContent += `
            <div style="margin-top: 20px; font-weight: bold; font-size: 14px;">
                Series No. ${loan.loanNumber || ''}
            </div>
        `;

        return `
          <div class="voucher-card" style="margin-bottom: 0.6in; page-break-inside: avoid; font-family: Arial, sans-serif; color: #000;">
            <div style="font-weight: bold; font-size: 12px; margin-bottom: 20px;">
              DATE: ${generatedDate}<br/>
              ${batchLine}
            </div>

            <h1 style="text-align: center; font-size: 36px; margin: 0; padding: 0;">Voucher</h1>
            <hr style="border: 0; border-top: 1px solid #000; margin-top: 10px; margin-bottom: 25px;" />

            <div style="display: flex; justify-content: space-between;">
              <div style="width: 50%; text-align: center;">
                <div style="font-weight: bold; margin-bottom: 10px; font-size: 12px;">Client name</div>
                <div style="font-weight: bold; font-size: 14px;">${borrower.fullName}</div>
                
                <div style="margin-top: 45px;">
                  <div style="border-top: 1px solid #000; width: 80%; margin: 0 auto; padding-top: 5px; font-size: 12px; font-weight: bold;">
                    Signature over Printed Name
                  </div>
                </div>
                
                <div style="margin-top: 25px; font-size: 12px; font-weight: bold; display: flex; flex-direction: column; align-items: center;">
                  <div>
                    <span style="font-weight: normal;">Checked By / Noted By:</span> _____________________
                  </div>
                  <div style="margin-top: 2px;">
                    Account Officer / Marketing
                  </div>
                </div>
              </div>

              <div style="width: 50%; text-align: center;">
                ${rightColumnContent}
                
                <div style="margin-top: 45px; font-size: 12px; font-weight: bold; display: flex; flex-direction: column; align-items: center;">
                  <div>
                    <span style="font-weight: normal;">Approve By:</span> _____________________
                  </div>
                  <div style="margin-top: 2px;">
                    OIC / OM
                  </div>
                </div>
              </div>
            </div>
          </div>
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
            @page { size: ${pageSize}; margin: 0.5in; }
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; margin: 0; color: #000; }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <main>${cards}</main>
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
        await this.printHtml(html, `Voucher — ${borrower.fullName}`);
    }

    static async generateVoucherBatch(
        vouchers: VoucherData[],
        options: VoucherPrintOptions = {}
    ): Promise<void> {
        if (vouchers.length === 0) return;

        const html = this.buildVoucherHtml(vouchers, options);
        await this.printHtml(html, `Vouchers — ${vouchers.length} loan${vouchers.length === 1 ? '' : 's'}`);
    }

    static async generateGenericReport(options: GenericReportOptions): Promise<void> {
        const { title, subtitle, headers, data, summaryBoxes, landscape } = options;
        const generatedDate = formatDate(new Date());

        const headersHtml = headers.map(h => `<th>${h}</th>`).join('');
        const rowsHtml = data.map((row, idx) => `
            <tr style="background:${idx % 2 === 0 ? '#fff' : '#f9f9f9'}">
                ${row.map(cell => `<td>${cell !== null && cell !== undefined ? cell : ''}</td>`).join('')}
            </tr>
        `).join('');

        const summaryHtml = summaryBoxes ? `
            <div class="summary-section">
                ${summaryBoxes.map(box => `
                    <div class="summary-box">
                        <div class="label">${box.label}</div>
                        <div class="value">${box.value}</div>
                    </div>
                `).join('')}
            </div>
        ` : '';

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8"/>
          <style>
            @page { size: ${landscape ? 'landscape' : 'portrait'}; margin: 0.5in; }
            body { font-family: Arial, sans-serif; margin: 32px; color: #222; font-size: 12px; }
            .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #000; padding-bottom: 16px; margin-bottom: 32px; }
            .brand { font-size: 24px; font-weight: 900; color: #000; letter-spacing: -1px; margin-bottom: 4px; }
            .subtitle { font-size: 14px; color: #555; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
            th { text-align: left; padding: 12px 8px; border-bottom: 2px solid #ddd; color: #555; font-size: 11px; text-transform: uppercase; }
            td { padding: 12px 8px; border-bottom: 1px solid #eee; }
            .summary-section { display: flex; gap: 16px; margin-bottom: 32px; flex-wrap: wrap; }
            .summary-box { background: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #e2e8f0; min-width: 150px; }
            .summary-box .label { font-size: 11px; color: #64748b; text-transform: uppercase; margin-bottom: 4px; }
            .summary-box .value { font-size: 18px; font-weight: bold; color: #0f172a; }
            .footer { text-align: center; font-size: 10px; color: #888; border-top: 1px solid #eee; padding-top: 16px; margin-top: 32px; }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="brand">${title}</div>
              ${subtitle ? `<div class="subtitle">${subtitle}</div>` : ''}
            </div>
          </div>
          
          ${summaryHtml}

          <table>
            <thead><tr>${headersHtml}</tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>

          <div class="footer">
            Generated on ${generatedDate} &bull; INFINITY FINANCE Loan Management System
          </div>
        </body>
        </html>
        `;

        await this.printHtml(html, title);
    }

    static async generateIncomeStatementPdf(title: string, subtitle: string, data: any, isCashBasis: boolean): Promise<void> {
        const generatedDate = formatDate(new Date());

        const opExHtml = Object.entries(data.opExBreakdown || {}).map(([cat, amt]: [string, any]) => `
            <tr>
                <td style="padding-left: 24px;">${cat}</td>
                <td style="text-align: right;">${formatPHP(amt)}</td>
            </tr>
        `).join('');

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8"/>
          <style>
            @page { size: portrait; margin: 0.5in; }
            body { font-family: Arial, sans-serif; margin: 32px; color: #222; font-size: 14px; }
            .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #000; padding-bottom: 16px; margin-bottom: 32px; }
            .brand { font-size: 24px; font-weight: 900; color: #000; letter-spacing: -1px; margin-bottom: 4px; }
            .subtitle { font-size: 14px; color: #555; }
            .basis-badge { display: inline-block; padding: 4px 8px; background: #eef2ff; color: #3730a3; border-radius: 4px; font-size: 12px; font-weight: bold; margin-bottom: 24px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
            td { padding: 10px 8px; border-bottom: 1px solid #f1f5f9; }
            .section-title { font-weight: bold; font-size: 12px; color: #3b82f6; text-transform: uppercase; padding-top: 16px; border-bottom: none; }
            .section-total { font-weight: bold; background-color: #f8fafc; }
            .net-income { background-color: #eff6ff; font-weight: bold; font-size: 18px; }
            .footer { text-align: center; font-size: 10px; color: #888; border-top: 1px solid #eee; padding-top: 16px; margin-top: 32px; }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="brand">${title}</div>
              <div class="subtitle">${subtitle}</div>
            </div>
          </div>
          
          <div class="basis-badge">
            ${isCashBasis ? 'CASH BASIS' : 'ACCRUAL BASIS'}
          </div>

          <table>
            <tbody>
                <tr><td colspan="2" class="section-title">Operating Revenue</td></tr>
                <tr>
                    <td style="padding-left: 24px;">Earned Interest Income</td>
                    <td style="text-align: right; font-weight: bold;">${formatPHP(data.earnedInterestIncome || 0)}</td>
                </tr>
                <tr>
                    <td style="padding-left: 24px;">Upfront Fee Income</td>
                    <td style="text-align: right; font-weight: bold;">${formatPHP(data.upfrontFeeIncome || 0)}</td>
                </tr>
                <tr>
                    <td style="padding-left: 24px;">Penalty Income</td>
                    <td style="text-align: right; font-weight: bold;">${formatPHP(data.penaltyIncome || 0)}</td>
                </tr>
                <tr class="section-total">
                    <td>Total Gross Income</td>
                    <td style="text-align: right; color: #2563eb;">${formatPHP(data.totalGrossIncome || data.operatingRevenue)}</td>
                </tr>

                <tr><td colspan="2" class="section-title" style="color: #ef4444;">Operating Expenses</td></tr>
                ${opExHtml}
                <tr class="section-total">
                    <td>Total Operating Expenses</td>
                    <td style="text-align: right; color: #dc2626;">(${formatPHP(data.operatingExpenses)})</td>
                </tr>

                <tr><td colspan="2" class="section-title" style="color: #f97316;">Financial & Provision Costs</td></tr>
                <tr>
                    <td style="padding-left: 24px;">Financial Costs</td>
                    <td style="text-align: right; font-weight: bold;">(${formatPHP(data.financialCosts)})</td>
                </tr>
                <tr>
                    <td style="padding-left: 24px;">Loan Loss Provisions</td>
                    <td style="text-align: right; font-weight: bold;">(${formatPHP(data.loanLossProvisions)})</td>
                </tr>

                <tr class="net-income">
                    <td style="padding: 16px 8px; color: #1e3a8a;">NET INCOME</td>
                    <td style="text-align: right; padding: 16px 8px; color: ${data.netIncome >= 0 ? '#16a34a' : '#dc2626'};">${formatPHP(data.netIncome)}</td>
                </tr>
            </tbody>
          </table>

          <div style="display: flex; justify-content: space-between; margin-top: 32px;">
            <div style="flex: 1; background: #f8fafc; padding: 16px; border-radius: 8px; margin-right: 16px;">
                <div style="font-size: 11px; color: #64748b; text-transform: uppercase;">Operational Self-Sufficiency (OSS)</div>
                <div style="font-size: 18px; font-weight: bold; color: ${data.oss >= 1 ? '#16a34a' : '#dc2626'}; margin-top: 4px;">${(data.oss * 100).toFixed(1)}%</div>
            </div>
            <div style="flex: 1; background: #f8fafc; padding: 16px; border-radius: 8px;">
                <div style="font-size: 11px; color: #64748b; text-transform: uppercase;">Financial Self-Sufficiency (FSS)</div>
                <div style="font-size: 18px; font-weight: bold; color: ${data.fss >= 1 ? '#16a34a' : '#dc2626'}; margin-top: 4px;">${(data.fss * 100).toFixed(1)}%</div>
            </div>
          </div>

          <div class="footer">
            Generated on ${generatedDate} &bull; INFINITY FINANCE Loan Management System
          </div>
        </body>
        </html>
        `;

        await this.printHtml(html, title);
    }

    static async generateBalanceSheetPdf(title: string, subtitle: string, data: any): Promise<void> {
        const generatedDate = formatDate(new Date());

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8"/>
          <style>
            @page { size: portrait; margin: 0.5in; }
            body { font-family: Arial, sans-serif; margin: 32px; color: #222; font-size: 14px; }
            .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #000; padding-bottom: 16px; margin-bottom: 32px; }
            .brand { font-size: 24px; font-weight: 900; color: #000; letter-spacing: -1px; margin-bottom: 4px; }
            .subtitle { font-size: 14px; color: #555; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 32px; }
            td { padding: 10px 8px; border-bottom: 1px solid #f1f5f9; }
            .section-title { font-weight: bold; font-size: 14px; text-transform: uppercase; padding-top: 24px; border-bottom: 2px solid #e2e8f0; }
            .item-title { padding-left: 24px; color: #475569; }
            .item-value { text-align: right; font-weight: bold; color: #0f172a; }
            .section-total { font-weight: bold; background-color: #f8fafc; font-size: 15px; }
            .section-total td { padding: 16px 8px; }
            .footer { text-align: center; font-size: 10px; color: #888; border-top: 1px solid #eee; padding-top: 16px; margin-top: 32px; }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="brand">${title}</div>
              <div class="subtitle">${subtitle}</div>
            </div>
          </div>
          
          <table>
            <tbody>
                <tr><td colspan="2" class="section-title" style="color: #059669;">Assets</td></tr>
                <tr>
                    <td class="item-title">Net Loan Portfolio</td>
                    <td class="item-value">${formatPHP(data.assets.loanPortfolio)}</td>
                </tr>
                <tr>
                    <td class="item-title">Cash on Hand (Admin)</td>
                    <td class="item-value">${formatPHP(data.assets.cashOnHand)}</td>
                </tr>
                <tr>
                    <td class="item-title">Cash in Transit (Collectors)</td>
                    <td class="item-value">${formatPHP(data.assets.cashInTransit)}</td>
                </tr>
                ${data.assets.otherAssets > 0 ? `
                <tr>
                    <td class="item-title">Other Assets</td>
                    <td class="item-value">${formatPHP(data.assets.otherAssets)}</td>
                </tr>` : ''}
                <tr class="section-total">
                    <td style="color: #047857;">Total Assets</td>
                    <td style="text-align: right; color: #047857;">${formatPHP(data.assets.totalAssets)}</td>
                </tr>

                <tr><td colspan="2" class="section-title" style="color: #dc2626;">Liabilities</td></tr>
                <tr>
                    <td class="item-title">Borrowings / Payables</td>
                    <td class="item-value">${formatPHP(data.liabilities.borrowings)}</td>
                </tr>
                <tr>
                    <td class="item-title">Borrower Savings Deposits</td>
                    <td class="item-value">${formatPHP(data.liabilities.savingsDeposits)}</td>
                </tr>
                <tr class="section-total">
                    <td style="color: #b91c1c;">Total Liabilities</td>
                    <td style="text-align: right; color: #b91c1c;">${formatPHP(data.liabilities.totalLiabilities)}</td>
                </tr>

                <tr><td colspan="2" class="section-title" style="color: #4338ca;">Equity</td></tr>
                <tr>
                    <td class="item-title">Paid-in Capital / Reserves</td>
                    <td class="item-value">${formatPHP(data.equity.paidInCapital)}</td>
                </tr>
                <tr>
                    <td class="item-title">Total Equity</td>
                    <td class="item-value">${formatPHP(data.equity.totalEquity)}</td>
                </tr>
                <tr class="section-total">
                    <td style="color: #3730a3;">Total Equity</td>
                    <td style="text-align: right; color: #3730a3;">${formatPHP(data.equity.totalEquity)}</td>
                </tr>
                
                <tr class="section-total" style="background-color: #eef2ff;">
                    <td style="color: #312e81; padding-top: 24px;">Total Liabilities & Equity</td>
                    <td style="text-align: right; color: #312e81; padding-top: 24px;">${formatPHP(data.liabilities.totalLiabilities + data.equity.totalEquity)}</td>
                </tr>
            </tbody>
          </table>

          <div class="footer">
            Generated on ${generatedDate} &bull; INFINITY FINANCE Loan Management System
          </div>
        </body>
        </html>
        `;

        await this.printHtml(html, title);
    }
}
