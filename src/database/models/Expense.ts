import { Model } from '@nozbe/watermelondb'
import { field, date } from '@nozbe/watermelondb/decorators'

export default class Expense extends Model {
    static table = 'expenses'

    @field('category') category: string;
    @field('frequency') frequency: string;
    @field('description') description: string;
    @field('amount') amount: number;
    @date('expense_date') expenseDate: number;
    @field('encoded_by') encodedBy: string;
    @date('created_at') createdAt: number;
    @date('updated_at') updatedAt: number;
    @date('deleted_at') deletedAt: number | null;
}
