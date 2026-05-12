import { Model } from '@nozbe/watermelondb'
import { field, date, relation } from '@nozbe/watermelondb/decorators'

export default class Payment extends Model {
    static table = 'payments'

    @relation('loans', 'loan_id') loan: any;
    @field('loan_id') loanId: string;
    @field('borrower_id') borrowerId: string;  // ✅ NEW: Required FK for sync
    @field('schedule_id') scheduleId: string;
    @field('collector_id') collectorId: string;
    @field('amount') amount: number;
    @date('payment_date') paymentDate: number;
    @field('receipt_number') receiptNumber: string;
    @field('notes') notes: string;
    @date('encoded_at') encodedAt: number;
    @date('created_at') createdAt: number;
    @date('updated_at') updatedAt: number;
    @date('deleted_at') deletedAt: number | null;
}
