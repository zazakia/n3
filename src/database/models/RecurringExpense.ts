import { Model } from '@nozbe/watermelondb'
import { field, date, text } from '@nozbe/watermelondb/decorators'

export default class RecurringExpense extends Model {
    static table = 'recurring_expenses'

    @text('category') category: string;
    @text('description') description: string | null;
    @field('amount') amount: number;
    @text('frequency') frequency: string;
    @date('next_due_date') nextDueDate: number;
    @field('is_active') isActive: boolean;
    @field('reminders_enabled') remindersEnabled: boolean;
    @text('reminder_time') reminderTime: string | null;
    @text('encoded_by') encodedBy: string | null;
    @date('created_at') createdAt: number;
    @date('updated_at') updatedAt: number;
    @date('deleted_at') deletedAt: number | null;
}
