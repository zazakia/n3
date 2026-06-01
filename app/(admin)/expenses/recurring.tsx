import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Alert, SafeAreaView, ActivityIndicator, Switch, Modal, TextInput } from 'react-native';
import { database } from '../../../src/database';
import { Q } from '@nozbe/watermelondb';
import { useAuth } from '../../../src/store/AuthContext';
import RecurringExpense from '../../../src/database/models/RecurringExpense';
import Expense from '../../../src/database/models/Expense';
import { MaterialIcons } from '@expo/vector-icons';
import { formatPHP } from '../../../src/utils/currency';
import { format, addDays, addWeeks, addMonths, addYears } from 'date-fns';
import { notificationService } from '../../../src/services/NotificationService';
import uuid from 'react-native-uuid';
import { BaseModelService } from '../../../src/services/BaseModelService';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';

const schema = z.object({
    category: z.string().min(1, 'Category is required'),
    description: z.string().optional(),
    amount: z.string().refine(v => !isNaN(parseFloat(v)) && parseFloat(v) > 0, 'Amount must be positive'),
    frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
    remindersEnabled: z.boolean(),
    reminderTime: z.string().regex(/^([01]\d|2[0-3]):?([0-5]\d)$/, 'Invalid time format (HH:MM)').optional(),
});
type FormData = z.infer<typeof schema>;

export default function RecurringExpensesScreen() {
    const { user } = useAuth();
    const [expenses, setExpenses] = useState<RecurringExpense[]>([]);
    const [loading, setLoading] = useState(true);
    const [modalVisible, setModalVisible] = useState(false);
    const [editingExpense, setEditingExpense] = useState<RecurringExpense | null>(null);
    const [dbCategories, setDbCategories] = useState<string[]>([]);
    
    const { control, handleSubmit, reset, setValue, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: { category: '', description: '', amount: '', frequency: 'monthly', remindersEnabled: false, reminderTime: '09:00' },
    });

    const loadData = async () => {
        setLoading(true);
        try {
            const list = await database.get<RecurringExpense>('recurring_expenses')
                .query(Q.sortBy('next_due_date', Q.asc))
                .fetch();
            setExpenses(list);
            
            const cats = await database.get<any>('expense_categories')
                .query(Q.where('is_active', true), Q.sortBy('name', Q.asc))
                .fetch();
            setDbCategories(cats.map(c => c.name));
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const handleSave = async (data: FormData) => {
        try {
            let savedExpense: RecurringExpense;
            if (editingExpense) {
                savedExpense = await BaseModelService.update<RecurringExpense>(editingExpense, exp => {
                    exp.category = data.category;
                    exp.description = data.description?.trim() || null;
                    exp.amount = parseFloat(data.amount);
                    exp.frequency = data.frequency;
                    exp.remindersEnabled = data.remindersEnabled;
                    exp.reminderTime = data.reminderTime || '09:00';
                });
            } else {
                savedExpense = await BaseModelService.create<RecurringExpense>('recurring_expenses', exp => {
                    exp._raw.id = uuid.v4().toString();
                    exp.category = data.category;
                    exp.description = data.description?.trim() || null;
                    exp.amount = parseFloat(data.amount);
                    exp.frequency = data.frequency;
                    exp.remindersEnabled = data.remindersEnabled;
                    exp.reminderTime = data.reminderTime || '09:00';
                    exp.isActive = true;
                    exp.nextDueDate = new Date().getTime(); // Starts due now
                    exp.encodedBy = user?.id || '';
                });
            }
            if (savedExpense.remindersEnabled) {
                await notificationService.scheduleRecurringExpenseReminder(savedExpense);
            } else {
                await notificationService.cancelRecurringExpenseReminder(savedExpense.id);
            }
            setModalVisible(false);
            setEditingExpense(null);
            loadData();
        } catch (error) {
            console.error('Error saving recurring expense', error);
            Alert.alert('Error', 'Failed to save recurring expense.');
        }
    };

    const recordExpense = async (recurring: RecurringExpense) => {
        Alert.alert('Record Expense', `Are you sure you want to record ${formatPHP(recurring.amount)} for ${recurring.category}?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Record', onPress: async () => {
                try {
                    await BaseModelService.create<Expense>('expenses', exp => {
                        exp._raw.id = uuid.v4().toString();
                        exp.category = recurring.category;
                        exp.frequency = recurring.frequency;
                        exp.description = recurring.description;
                        exp.amount = recurring.amount;
                        exp.expenseDate = new Date().getTime();
                        exp.encodedBy = user?.id || '';
                        exp.recurringExpenseId = recurring.id;
                    });

                    // Advance next due date
                    const nextDate = new Date(recurring.nextDueDate);
                    let advancedDate;
                    switch (recurring.frequency) {
                        case 'daily': advancedDate = addDays(nextDate, 1); break;
                        case 'weekly': advancedDate = addWeeks(nextDate, 1); break;
                        case 'monthly': advancedDate = addMonths(nextDate, 1); break;
                        case 'yearly': advancedDate = addYears(nextDate, 1); break;
                        default: advancedDate = addMonths(nextDate, 1);
                    }

                    const updatedRecurring = await BaseModelService.update<RecurringExpense>(recurring, exp => {
                        exp.nextDueDate = advancedDate.getTime();
                    });

                    if (updatedRecurring.remindersEnabled) {
                        await notificationService.scheduleRecurringExpenseReminder(updatedRecurring);
                    }

                    Alert.alert('Success', 'Expense recorded successfully!');
                    loadData();
                } catch (error) {
                    console.error('Error recording expense', error);
                    Alert.alert('Error', 'Failed to record expense.');
                }
            }}
        ]);
    };

    const toggleActive = async (expense: RecurringExpense) => {
        try {
            const updated = await BaseModelService.update<RecurringExpense>(expense, exp => {
                exp.isActive = !exp.isActive;
            });
            if (updated.isActive && updated.remindersEnabled) {
                await notificationService.scheduleRecurringExpenseReminder(updated);
            } else {
                await notificationService.cancelRecurringExpenseReminder(updated.id);
            }
            loadData();
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-[#F8FAFC]">
            <ScrollView className="flex-1 px-4 pt-4">
                {loading ? <ActivityIndicator size="large" color="#7B1FA2" className="mt-10" /> : expenses.length === 0 ? (
                    <View className="items-center justify-center py-20">
                        <MaterialIcons name="event-repeat" size={64} color="#D1D5DB" />
                        <Text className="text-gray-500 mt-4">No recurring expenses set up.</Text>
                    </View>
                ) : (
                    expenses.map(exp => (
                        <View key={exp.id} className={`bg-white rounded-2xl p-5 mb-4 border ${exp.isActive ? 'border-purple-100' : 'border-gray-200 opacity-70'}`} style={{ elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05 }}>
                            <View className="flex-row justify-between items-start">
                                <View className="flex-1">
                                    <Text className="text-lg font-black text-gray-900">{exp.category}</Text>
                                    {exp.description && <Text className="text-gray-500 text-sm mt-1">{exp.description}</Text>}
                                    <Text className="text-purple-700 font-bold mt-2 text-lg">{formatPHP(exp.amount)} <Text className="text-xs text-gray-500 font-normal">/ {exp.frequency}</Text></Text>
                                </View>
                                <Switch value={exp.isActive} onValueChange={() => toggleActive(exp)} trackColor={{ true: '#A855F7', false: '#D1D5DB' }} />
                            </View>

                            <View className="bg-gray-50 p-3 rounded-xl mt-4 flex-row justify-between items-center">
                                <View className="flex-row items-center">
                                    <MaterialIcons name="event" size={16} color="#6B7280" />
                                    <Text className="text-gray-600 text-xs ml-1">Next: {format(new Date(exp.nextDueDate), 'MMM d, yyyy')}</Text>
                                </View>
                                {exp.remindersEnabled && (
                                    <View className="flex-row items-center">
                                        <MaterialIcons name="notifications-active" size={16} color="#A855F7" />
                                        <Text className="text-purple-600 text-xs ml-1">{exp.reminderTime}</Text>
                                    </View>
                                )}
                            </View>

                            {exp.isActive && (
                                <View className="flex-row mt-4 pt-4 border-t border-gray-100 justify-end gap-3">
                                    <Pressable onPress={() => {
                                        setEditingExpense(exp);
                                        reset({
                                            category: exp.category,
                                            description: exp.description || '',
                                            amount: exp.amount.toString(),
                                            frequency: exp.frequency as any,
                                            remindersEnabled: exp.remindersEnabled,
                                            reminderTime: exp.reminderTime || '09:00'
                                        });
                                        setModalVisible(true);
                                    }} className="px-4 py-2 rounded-xl bg-gray-100 active:bg-gray-200">
                                        <Text className="text-gray-700 font-bold text-xs">Edit</Text>
                                    </Pressable>
                                    <Pressable onPress={() => recordExpense(exp)} className="px-4 py-2 rounded-xl bg-purple-600 active:bg-purple-700 flex-row items-center">
                                        <MaterialIcons name="check-circle" size={16} color="#fff" />
                                        <Text className="text-white font-bold text-xs ml-1">Record Now</Text>
                                    </Pressable>
                                </View>
                            )}
                        </View>
                    ))
                )}
            </ScrollView>

            <Pressable onPress={() => {
                setEditingExpense(null);
                reset({ category: dbCategories[0] || '', description: '', amount: '', frequency: 'monthly', remindersEnabled: false, reminderTime: '09:00' });
                setModalVisible(true);
            }} className="absolute bottom-6 right-6 w-14 h-14 bg-purple-700 rounded-full items-center justify-center shadow-lg" style={{ elevation: 5 }}>
                <MaterialIcons name="add" size={28} color="#FFF" />
            </Pressable>

            {/* Modal Form */}
            <Modal visible={modalVisible} animationType="slide" transparent>
                <View className="flex-1 justify-end bg-black/50">
                    <View className="bg-white rounded-t-[32px] p-6 h-[80%]">
                        <View className="flex-row justify-between items-center mb-6">
                            <Text className="text-2xl font-black text-gray-900">{editingExpense ? 'Edit' : 'Add'} Recurring</Text>
                            <Pressable onPress={() => setModalVisible(false)} className="p-2 bg-gray-100 rounded-full">
                                <MaterialIcons name="close" size={20} color="#374151" />
                            </Pressable>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Category</Text>
                            <Controller control={control} name="category" render={({ field: { onChange, value } }) => (
                                <View className="flex-row flex-wrap mb-4">
                                    {dbCategories.map(cat => (
                                        <Pressable key={cat} onPress={() => onChange(cat)} className={`px-4 py-2 rounded-xl mr-2 mb-2 border ${value === cat ? 'bg-purple-100 border-purple-400' : 'bg-gray-50 border-gray-200'}`}>
                                            <Text className={`font-bold ${value === cat ? 'text-purple-700' : 'text-gray-600'}`}>{cat}</Text>
                                        </Pressable>
                                    ))}
                                </View>
                            )} />

                            <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Amount (₱)</Text>
                            <Controller control={control} name="amount" render={({ field: { onChange, value } }) => (
                                <TextInput className="bg-gray-50 px-4 py-3 rounded-xl border border-gray-200 text-gray-900 mb-4" value={value} onChangeText={onChange} keyboardType="numeric" placeholder="0.00" />
                            )} />
                            {errors.amount && <Text className="text-red-500 text-xs mb-4">{errors.amount.message}</Text>}

                            <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Frequency</Text>
                            <Controller control={control} name="frequency" render={({ field: { onChange, value } }) => (
                                <View className="flex-row flex-wrap mb-4">
                                    {['daily', 'weekly', 'monthly', 'yearly'].map(freq => (
                                        <Pressable key={freq} onPress={() => onChange(freq)} className={`px-4 py-2 rounded-xl mr-2 mb-2 border capitalize ${value === freq ? 'bg-purple-100 border-purple-400' : 'bg-gray-50 border-gray-200'}`}>
                                            <Text className={`font-bold ${value === freq ? 'text-purple-700' : 'text-gray-600'}`}>{freq}</Text>
                                        </Pressable>
                                    ))}
                                </View>
                            )} />

                            <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Description</Text>
                            <Controller control={control} name="description" render={({ field: { onChange, value } }) => (
                                <TextInput className="bg-gray-50 px-4 py-3 rounded-xl border border-gray-200 text-gray-900 mb-4" value={value} onChangeText={onChange} placeholder="Optional notes" />
                            )} />

                            <View className="bg-gray-50 p-4 rounded-xl border border-gray-200 mb-6">
                                <View className="flex-row justify-between items-center mb-3">
                                    <Text className="font-bold text-gray-800">App Reminders</Text>
                                    <Controller control={control} name="remindersEnabled" render={({ field: { onChange, value } }) => (
                                        <Switch value={value} onValueChange={onChange} trackColor={{ true: '#A855F7' }} />
                                    )} />
                                </View>
                                
                                <Controller control={control} name="remindersEnabled" render={({ field: { value: enabled } }) => (
                                    enabled ? (
                                        <View>
                                            <Text className="text-xs text-gray-500 mb-2">Time of day (HH:MM)</Text>
                                            <Controller control={control} name="reminderTime" render={({ field: { onChange, value } }) => (
                                                <TextInput className="bg-white px-4 py-2 rounded border border-gray-200 text-gray-900" value={value} onChangeText={onChange} placeholder="09:00" />
                                            )} />
                                            {errors.reminderTime && <Text className="text-red-500 text-xs mt-1">{errors.reminderTime.message}</Text>}
                                        </View>
                                    ) : <></>
                                )} />
                            </View>

                            <Pressable onPress={handleSubmit(handleSave)} className="w-full bg-purple-700 py-4 rounded-xl items-center mb-10">
                                <Text className="text-white font-black text-lg">Save</Text>
                            </Pressable>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}
