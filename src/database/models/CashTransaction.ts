import { Model } from '@nozbe/watermelondb'
import { field, date } from '@nozbe/watermelondb/decorators'

export default class CashTransaction extends Model {
    static table = 'cash_transactions'

    @date('transaction_date') transactionDate: number;
    @field('particulars') particulars: string;
    @field('type') type: string; // 'in' | 'out' | 'starting_balance'
    @field('amount') amount: number;
    @field('remarks') remarks: string;
    @field('recorded_by') recordedBy: string;
    @date('created_at') createdAt: number;
    @date('updated_at') updatedAt: number;
    @date('deleted_at') deletedAt: number | null;
}
