import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { database } from '../database';
import RecurringExpense from '../database/models/RecurringExpense';

// Setup notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

class NotificationService {
  public async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    return finalStatus === 'granted';
  }

  public async scheduleRecurringExpenseReminder(expense: RecurringExpense): Promise<void> {
    if (Platform.OS === 'web') return;
    if (!expense.remindersEnabled || !expense.isActive) return;

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) return;

    // Parse reminder time "HH:mm"
    const [hours, minutes] = (expense.reminderTime || '09:00').split(':').map(Number);
    const triggerDate = new Date(expense.nextDueDate);
    triggerDate.setHours(hours, minutes, 0, 0);

    // If trigger date is in the past, skip scheduling
    if (triggerDate.getTime() <= Date.now()) return;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: `Reminder: ${expense.category}`,
        body: `Your recurring expense of ₱${expense.amount.toFixed(2)} for ${expense.description || 'this item'} is due.`,
        data: { recurringExpenseId: expense.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
      },
      identifier: `recurring_expense_${expense.id}`,
    });
  }

  public async cancelRecurringExpenseReminder(expenseId: string): Promise<void> {
    if (Platform.OS === 'web') return;
    await Notifications.cancelScheduledNotificationAsync(`recurring_expense_${expenseId}`);
  }

  public async rescheduleAllActiveReminders(): Promise<void> {
    if (Platform.OS === 'web') return;
    
    const recurringExpenses = await database.get<RecurringExpense>('recurring_expenses').query().fetch();
    
    for (const expense of recurringExpenses) {
      await this.cancelRecurringExpenseReminder(expense.id);
      if (expense.isActive && expense.remindersEnabled) {
        await this.scheduleRecurringExpenseReminder(expense);
      }
    }
  }
}

export const notificationService = new NotificationService();
