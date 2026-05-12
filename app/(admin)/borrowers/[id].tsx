import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Alert, Linking, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { safeBack } from '../../../src/utils/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { database } from '../../../src/database';
import Collector from '../../../src/database/models/Collector';
import Borrower from '../../../src/database/models/Borrower';
import Loan from '../../../src/database/models/Loan';
import Payment from '../../../src/database/models/Payment';
import { Q } from '@nozbe/watermelondb';
import { MaterialIcons } from '@expo/vector-icons';
import { formatPHP } from '../../../src/utils/currency';
import { format } from 'date-fns';
import { ReminderService } from '../../../src/services/ReminderService';
import ConfirmDialog from '../../../src/components/ConfirmDialog';
import { BorrowerSearchBar } from '../../../src/components/BorrowerSearchBar';
import BaseModelService from '../../../src/services/BaseModelService';
import { sortLoansChronologically } from '../../../src/utils/loanOrdering';

const schema = z.object({
    fullName: z.string().min(2, "Name is required"),
    address: z.string().optional(),
    phone: z.string().optional(),
    gender: z.enum(['male', 'female', 'other']).optional(),
    notes: z.string().optional(),
    collectorId: z.string().optional(),
    group: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    coMakerName: z.string().optional(),
    business: z.string().optional(),
    dateOfBirth: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function EditBorrowerScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const [borrower, setBorrower] = useState<Borrower | null>(null);
    const [collectors, setCollectors] = useState<Collector[]>([]);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [kpis, setKpis] = useState({ activeLoans: 0, outstandingBalance: 0 });
    const [recentPayments, setRecentPayments] = useState<Payment[]>([]);
    const [loans, setLoans] = useState<Loan[]>([]);
    const [isConfirmDeleteVisible, setIsConfirmDeleteVisible] = useState(false);
    const [isConfirmDeleteLoanVisible, setIsConfirmDeleteLoanVisible] = useState(false);
    const [isConfirmDeletePaymentVisible, setIsConfirmDeletePaymentVisible] = useState(false);
    const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
    const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
    const collectorName = collectors.find(c => c.id === borrower?.collectorId || c.authId === borrower?.collectorId)?.fullName;

    const { control, handleSubmit, reset, formState: { errors, isDirty } } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: { fullName: '', address: '', phone: '', gender: 'other', notes: '', collectorId: '', group: '', firstName: '', lastName: '', coMakerName: '', business: '', dateOfBirth: '' }
    });

    const loadData = async () => {
        try {
            const b = await database.collections.get<Borrower>('borrowers').find(id);
            const users = await database.collections.get<Collector>('collectors').query(Q.where('is_active', true)).fetch();
            const loans = await database.collections.get<Loan>('loans').query(
                Q.where('borrower_id', id),
                Q.where('deleted_at', Q.eq(null))
            ).fetch();
            const payments = await database.collections.get<Payment>('payments').query(
                Q.where('loan_id', Q.oneOf(loans.map(l => l.id))),
                Q.where('deleted_at', Q.eq(null))
            ).fetch();

            setBorrower(b);
            setCollectors(users);
            const orderedLoans = sortLoansChronologically(loans);
            setLoans(orderedLoans);

            const activeLoans = loans.filter(l => l.status === 'active' || l.status === 'defaulted');
            const outstanding = activeLoans.reduce((sum, loan) => {
                const paid = payments.filter(p => p.loanId === loan.id).reduce((s, p) => s + p.amount, 0);
                return sum + Math.max(0, loan.totalAmount - paid);
            }, 0);

            setKpis({ activeLoans: activeLoans.length, outstandingBalance: outstanding });
            setRecentPayments(payments.sort((a, b) => b.paymentDate - a.paymentDate).slice(0, 5));

            reset({
                fullName: b.fullName,
                address: b.address || '',
                phone: b.phone || '',
                gender: (b.gender as any) || 'other',
                notes: b.notes || '',
                collectorId: b.collectorId || '',
                group: b.group || '',
                firstName: b.firstName || '',
                lastName: b.lastName || '',
                coMakerName: b.coMakerName || '',
                business: b.business || '',
                dateOfBirth: b.dateOfBirth ? format(new Date(b.dateOfBirth), 'yyyy-MM-dd') : '',
            });
        } catch (error) {
            console.error('Failed to load borrower data', error);
            safeBack(router, '/(admin)');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [id]);

    const onSubmit = async (data: FormData) => {
        if (!borrower) return;
        setSaving(true);
        try {
            await BaseModelService.update(borrower, b => {
                b.fullName = data.fullName.trim();
                b.address = data.address?.trim() || null;
                b.phone = data.phone?.trim() || null;
                b.gender = data.gender || null;
                b.notes = data.notes?.trim() || null;
                b.collectorId = data.collectorId || null;
                b.group = data.group?.trim() || null;
                b.firstName = data.firstName?.trim() || null;
                b.lastName = data.lastName?.trim() || null;
                b.coMakerName = data.coMakerName?.trim() || null;
                b.business = data.business?.trim() || null;
                b.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth).getTime() : null;
            });

            if (Platform.OS === 'web') {
                window.alert("Borrower updated successfully.");
            } else {
                Alert.alert("Success", "Borrower updated successfully.");
            }
            setSaving(false);
            reset(data); // reset dirty state
        } catch (error) {
            console.error('Failed to update borrower', error);
            if (Platform.OS === 'web') {
                window.alert('Failed to update borrower');
            } else {
                Alert.alert('Error', 'Failed to update borrower');
            }
            setSaving(false);
        }
    };

    const handleDelete = () => {
        if (kpis.activeLoans > 0) {
            const msg = `Cannot delete — borrower has ${kpis.activeLoans} active loan(s). Close all loans first.`;
            if (Platform.OS === 'web') {
                window.alert(msg);
            } else {
                Alert.alert("Error", msg);
            }
            return;
        }
        setIsConfirmDeleteVisible(true);
    };

    const confirmDelete = async () => {
        if (!borrower) return;
        setSaving(true);
        setIsConfirmDeleteVisible(false);
        try {
            await BaseModelService.cascadeDeleteBorrower(borrower);
            router.replace('/(admin)/borrowers');
        } catch (e: any) {
            console.error('Failed to delete borrower', e);
            const msg = e.message || "Could not delete borrower.";
            if (Platform.OS === 'web') {
                window.alert(msg);
            } else {
                Alert.alert("Error", msg);
            }
            setSaving(false);
        }
    };

    const confirmDeleteLoan = async () => {
        if (!selectedLoan) return;
        setSaving(true);
        setIsConfirmDeleteLoanVisible(false);
        try {
            await BaseModelService.cascadeDeleteLoan(selectedLoan);
            await loadData();
            if (Platform.OS === 'web') {
                window.alert("Loan and related payments moved to trash.");
            } else {
                Alert.alert("Success", "Loan and related payments moved to trash.");
            }
        } catch (e: any) {
            console.error('Failed to delete loan', e);
            if (Platform.OS === 'web') {
                window.alert("Could not delete loan.");
            } else {
                Alert.alert("Error", "Could not delete loan.");
            }
        } finally {
            setSaving(false);
            setSelectedLoan(null);
        }
    };

    const confirmDeletePayment = async () => {
        if (!selectedPayment) return;
        setSaving(true);
        setIsConfirmDeletePaymentVisible(false);
        try {
            await BaseModelService.softDelete(selectedPayment);
            await loadData();
            if (Platform.OS === 'web') {
                window.alert("Payment record moved to trash.");
            } else {
                Alert.alert("Success", "Payment record moved to trash.");
            }
        } catch (e: any) {
            console.error('Failed to delete payment', e);
            if (Platform.OS === 'web') {
                window.alert("Could not delete payment.");
            } else {
                Alert.alert("Error", "Could not delete payment.");
            }
        } finally {
            setSaving(false);
            setSelectedPayment(null);
        }
    };

    if (loading) {
        return (
            <View className="flex-1 items-center justify-center bg-gray-50">
                <ActivityIndicator size="large" color="#D32F2F" />
            </View>
        );
    }
    return (
        <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 20 }}>
            <BorrowerSearchBar currentBorrowerId={id} />
            <View className="mb-6">
                <Text className="text-3xl font-black text-gray-900">{borrower?.fullName}</Text>
                <View className="flex-row items-center mt-2 flex-wrap gap-2">
                    {!!borrower?.group && (
                        <View className="bg-blue-100 px-3 py-1.5 rounded-full flex-row items-center">
                            <MaterialIcons name="group" size={14} color="#1D4ED8" />
                            <Text className="text-blue-700 text-xs font-bold ml-1 uppercase">{borrower.group}</Text>
                        </View>
                    )}
                    {!!borrower?.collectorId && (
                        <View className="bg-green-100 px-3 py-1.5 rounded-full flex-row items-center ml-2">
                            <MaterialIcons name="person" size={14} color="#15803D" />
                            <Text className="text-green-700 text-xs font-bold ml-1 uppercase">
                                {collectorName || 'Assign Collector'}
                            </Text>
                        </View>
                    )}
                    {!!borrower?.dateOfBirth && (
                        <View className="bg-purple-100 px-3 py-1.5 rounded-full flex-row items-center ml-2">
                            <MaterialIcons name="cake" size={14} color="#7E22CE" />
                            <Text className="text-purple-700 text-xs font-bold ml-1 uppercase">
                                {format(new Date(borrower.dateOfBirth), 'MMM d, yyyy')}
                            </Text>
                        </View>
                    )}
                    {!!borrower?.createdAt && (
                        <View className="bg-gray-100 px-3 py-1.5 rounded-full flex-row items-center ml-2">
                            <MaterialIcons name="calendar-today" size={14} color="#4B5563" />
                            <Text className="text-gray-700 text-xs font-bold ml-1 uppercase">
                                Added: {format(new Date(borrower.createdAt), 'MMM d, yyyy')}
                            </Text>
                        </View>
                    )}
                </View>
            </View>

            {/* KPI Cards */}
            <View className="flex-row mb-6">
                <View className="flex-1 bg-blue-50 p-4 rounded-xl border border-blue-100 mr-2 items-center">
                    <Text className="text-blue-500 text-xs font-bold uppercase mb-1">Active Loans</Text>
                    <Text className="text-blue-900 text-2xl font-extrabold">{kpis.activeLoans}</Text>
                </View>
                <View className="flex-1 bg-green-50 p-4 rounded-xl border border-green-100 ml-2 items-center">
                    <Text className="text-green-600 text-xs font-bold uppercase mb-1">Outstanding</Text>
                    <Text className="text-green-900 text-xl font-extrabold">{formatPHP(kpis.outstandingBalance)}</Text>
                </View>
            </View>

            {/* Passbook & Reminders */}
            <View className="flex-row mb-8">
                <Pressable
                    className="flex-1 bg-[#1A237E] flex-row p-4 rounded-xl items-center justify-center mr-2 shadow-sm active:bg-blue-900"
                    onPress={() => router.push(`/(admin)/borrowers/${id}/passbook`)}
                >
                    <MaterialIcons name="menu-book" size={20} color="#FFFFFF" className="mr-2" />
                    <Text className="text-white font-bold text-sm uppercase">Passbook</Text>
                </Pressable>

                <Pressable
                    className="flex-1 bg-[#F57C00] flex-row p-4 rounded-xl items-center justify-center mx-1 shadow-sm active:bg-orange-700"
                    onPress={() => router.push(`/(admin)/borrowers/${id}/savings`)}
                >
                    <MaterialIcons name="account-balance-wallet" size={20} color="#FFFFFF" className="mr-2" />
                    <Text className="text-white font-bold text-sm uppercase">Savings</Text>
                </Pressable>

                <Pressable
                    className="flex-1 bg-green-600 flex-row p-4 rounded-xl items-center justify-center ml-1 shadow-sm active:bg-green-700"
                    onPress={() => {
                        if (!borrower) return;
                        
                        const reminderData = {
                            borrowerName: borrower.fullName,
                            amountDue: kpis.outstandingBalance,
                            dueDate: Date.now(), // Fallback to now if no specific due date is selected
                            phoneNumber: borrower.phone || undefined
                        };

                        const whatsappUrl = ReminderService.generateWhatsAppLink('friendly', reminderData);
                        const smsUrl = ReminderService.generateSmsLink('friendly', reminderData);

                        if (whatsappUrl) {
                            Linking.openURL(whatsappUrl).catch(() => {
                                if (smsUrl) {
                                    if (Platform.OS === 'web') {
                                        window.alert("WhatsApp not found. Opening SMS instead.");
                                    } else {
                                        Alert.alert("WhatsApp not found", "Opening SMS instead.");
                                    }
                                    Linking.openURL(smsUrl);
                                }
                            });
                        } else if (smsUrl) {
                            Linking.openURL(smsUrl);
                        } else {
                            if (Platform.OS === 'web') {
                                window.alert("No phone number available for this borrower.");
                            } else {
                                Alert.alert("Error", "No phone number available for this borrower.");
                            }
                        }
                    }}
                >
                    <MaterialIcons name="chat" size={20} color="#FFFFFF" className="mr-2" />
                    <Text className="text-white font-bold text-sm uppercase">Remind</Text>
                </Pressable>
            </View>

            {/* Loan History */}
            <View className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm mb-8">
                <Text className="text-lg font-black text-gray-900 mb-4">Loan History</Text>
                {loans.length > 0 ? (
                    loans.map((l, idx) => (
                        <View key={l.id} className={`py-4 ${idx < loans.length - 1 ? 'border-b border-gray-50' : ''}`}>
                            <View className="flex-row justify-between items-start mb-1">
                                <View className="flex-1">
                                    <View className="flex-row items-center flex-wrap">
                                        <Text className="font-extrabold text-gray-900 mr-2">{l.loanNumber}</Text>
                                        <View className={`px-2 py-0.5 rounded-md ${
                                            l.status === 'active' ? 'bg-blue-100' : 
                                            l.status === 'closed' ? 'bg-green-100' : 'bg-red-100'
                                        }`}>
                                            <Text className={`text-[8px] font-black uppercase ${
                                                l.status === 'active' ? 'text-blue-700' : 
                                                l.status === 'closed' ? 'text-green-700' : 'text-red-700'
                                            }`}>{l.status}</Text>
                                        </View>
                                        {l.isReloan && (
                                            <View className="ml-2 bg-purple-100 px-2 py-0.5 rounded-md">
                                                <Text className="text-[8px] font-black uppercase text-purple-700">Renewal</Text>
                                            </View>
                                        )}
                                    </View>
                                    <View className="flex-row items-center mt-1">
                                        <Text className="text-[10px] text-gray-700 font-bold uppercase">
                                            {format(new Date(l.releaseDate as any), 'MMM d, yyyy')} • {formatPHP(l.principalAmount)}
                                        </Text>
                                        {l.insuranceAmount > 0 && (
                                            <Text className="text-[10px] text-orange-600 font-black uppercase ml-2">
                                                (Ins: {formatPHP(l.insuranceAmount)})
                                            </Text>
                                        )}
                                    </View>
                                    {l.isReloan && l.previousLoanId && (
                                        <Text className="text-[10px] text-purple-400 font-bold mt-1">
                                            Renewed from: {loans.find(prev => prev.id === l.previousLoanId)?.loanNumber || 'Previous Loan'}
                                        </Text>
                                    )}
                                </View>
                                <View className="flex-row items-center">
                                    <Pressable 
                                        onPress={() => router.push(`/(admin)/loans/${l.id}`)}
                                        className="p-2 bg-gray-50 rounded-xl active:bg-gray-100 mr-2"
                                    >
                                        <MaterialIcons name="chevron-right" size={18} color="#9CA3AF" />
                                    </Pressable>
                                    <Pressable 
                                        onPress={() => {
                                            setSelectedLoan(l);
                                            setIsConfirmDeleteLoanVisible(true);
                                        }}
                                        className="p-2 bg-red-50 rounded-xl active:bg-red-100"
                                    >
                                        <MaterialIcons name="delete-outline" size={18} color="#DC2626" />
                                    </Pressable>
                                </View>
                            </View>
                        </View>
                    ))
                ) : (
                    <Text className="text-gray-700 text-sm font-medium italic">No loan history found.</Text>
                )}
            </View>

            {/* Recent Activity (Payment History) */}
            <View className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm mb-8">
                <Text className="text-lg font-black text-gray-900 mb-4">Payment History</Text>
                {recentPayments.length > 0 ? (
                    recentPayments.map((p, idx) => {
                        const pLoan = loans.find(l => l.id === p.loanId);
                        const savingsRatio = pLoan ? (pLoan.depositAmount || 0) / (pLoan.totalAmount || 1) : 0;
                        const pSavings = p.amount * savingsRatio;

                        return (
                            <View key={p.id} className={`flex-row justify-between items-center py-3 ${idx < recentPayments.length - 1 ? 'border-b border-gray-50' : ''}`}>
                                <View>
                                    <Text className="font-extrabold text-gray-900">{formatPHP(p.amount)}</Text>
                                    <View className="flex-row items-center">
                                        <Text className="text-[10px] text-gray-700 font-bold uppercase">{new Date(p.paymentDate).toLocaleDateString()}</Text>
                                        {pSavings > 0 && (
                                            <Text className="text-[10px] text-orange-600 font-black uppercase ml-2">
                                                (Incl. {formatPHP(pSavings)} Savings)
                                            </Text>
                                        )}
                                    </View>
                                </View>
                                <View className="flex-row items-center">
                                    <View className="bg-green-50 px-3 py-1 rounded-full mr-2">
                                        <Text className="text-green-700 text-[10px] font-black uppercase">Paid</Text>
                                    </View>
                                    <Pressable 
                                        onPress={() => {
                                            setSelectedPayment(p);
                                            setIsConfirmDeletePaymentVisible(true);
                                        }}
                                        className="p-2 bg-red-50 rounded-xl active:bg-red-100"
                                    >
                                        <MaterialIcons name="delete-outline" size={18} color="#DC2626" />
                                    </Pressable>
                                </View>
                            </View>
                        );
                    })
                ) : (
                    <Text className="text-gray-700 text-sm font-medium italic">No recent payments recorded.</Text>
                )}
            </View>

            {/* Edit Form */}
            <View className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <Text className="text-xl font-extrabold text-gray-900 mb-6">Edit Contact Info</Text>

                <View className="mb-4">
                    <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Full Name *</Text>
                    <Controller
                        control={control}
                        name="fullName"
                        render={({ field: { onChange, value } }) => (
                            <TextInput
                                className={`bg-gray-50 p-4 rounded-xl border ${errors.fullName ? 'border-red-500' : 'border-gray-200'} text-gray-900`}
                                onChangeText={onChange}
                                value={value}
                                editable={!saving}
                            />
                        )}
                    />
                    {errors.fullName && <Text className="text-red-500 text-xs mt-1">{errors.fullName.message}</Text>}
                </View>

                <View className="flex-row mb-4">
                    <View className="flex-1 mr-2">
                        <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">First Name</Text>
                        <Controller control={control} name="firstName" render={({ field: { onChange, value } }) => (
                            <TextInput className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-gray-900" onChangeText={onChange} value={value || ''} editable={!saving} />
                        )} />
                    </View>
                    <View className="flex-1">
                        <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Last Name</Text>
                        <Controller control={control} name="lastName" render={({ field: { onChange, value } }) => (
                            <TextInput className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-gray-900" onChangeText={onChange} value={value || ''} editable={!saving} />
                        )} />
                    </View>
                </View>

                <View className="mb-4">
                    <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Date of Birth</Text>
                    <Controller control={control} name="dateOfBirth" render={({ field: { onChange, onBlur, value } }) => (
                        <TextInput className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-gray-900" onChangeText={onChange} onBlur={onBlur} value={value || ''} placeholder="YYYY-MM-DD" editable={!saving} />
                    )} />
                </View>

                {/* (Truncated for brevity, normally include Phone, Address, Collector exactly like new.tsx) */}
                <View className="mb-4">
                    <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Phone</Text>
                    <Controller control={control} name="phone" render={({ field: { onChange, value } }) => (
                        <TextInput className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-gray-900" onChangeText={onChange} value={value || ''} keyboardType="phone-pad" editable={!saving} />
                    )} />
                </View>

                <View className="mb-4">
                    <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Address</Text>
                    <Controller control={control} name="address" render={({ field: { onChange, value } }) => (
                        <TextInput className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-gray-900" onChangeText={onChange} value={value || ''} multiline editable={!saving} />
                    )} />
                </View>

                <View className="mb-4">
                    <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Group</Text>
                    <Controller control={control} name="group" render={({ field: { onChange, value } }) => (
                        <TextInput className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-gray-900" onChangeText={onChange} value={value || ''} placeholder="Group A, Market Group..." editable={!saving} />
                    )} />
                </View>

                <View className="mb-4">
                    <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Co-Maker Name</Text>
                    <Controller control={control} name="coMakerName" render={({ field: { onChange, value } }) => (
                        <TextInput className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-gray-900" onChangeText={onChange} value={value || ''} placeholder="Co-Maker Name" editable={!saving} />
                    )} />
                </View>

                <View className="mb-4">
                    <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Business</Text>
                    <Controller control={control} name="business" render={({ field: { onChange, value } }) => (
                        <TextInput className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-gray-900" onChangeText={onChange} value={value || ''} placeholder="Nature of Business" editable={!saving} />
                    )} />
                </View>

                <View className="mb-4">
                    <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Assign to Collector</Text>
                    <Controller
                        control={control}
                        name="collectorId"
                        render={({ field: { onChange, value } }) => (
                            <View className="border border-gray-200 rounded-xl overflow-hidden">
                                {collectors.length === 0 ? (
                                    <Text className="p-4 text-gray-700">No collectors found.</Text>
                                ) : (
                                    collectors.map((c, i) => (
                                        <Pressable key={c.id} onPress={() => onChange(value === c.id ? '' : c.id)} className={`p-4 flex-row justify-between items-center ${i < collectors.length - 1 ? 'border-b border-gray-100' : ''} ${value === c.id ? 'bg-blue-50' : 'bg-gray-50'}`}>
                                            <Text className={value === c.id ? 'text-blue-700 font-bold' : 'text-gray-700 font-medium'}>{c.fullName}</Text>
                                            {value === c.id && <MaterialIcons name="check" size={20} color="#1D4ED8" />}
                                        </Pressable>
                                    ))
                                )}
                            </View>
                        )}
                    />
                </View>

                <View className="mb-8">
                    <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Notes</Text>
                    <Controller control={control} name="notes" render={({ field: { onChange, value } }) => (
                        <TextInput className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-gray-900 h-24 text-top" onChangeText={onChange} value={value || ''} multiline textAlignVertical="top" editable={!saving} />
                    )} />
                </View>

                {isDirty && (
                    <Pressable
                        className={`w-full py-4 rounded-xl items-center mb-4 ${saving ? 'bg-red-400' : 'bg-red-600 active:bg-red-700'}`}
                        onPress={handleSubmit(onSubmit)}
                        disabled={saving}
                    >
                        {saving ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-bold text-lg">Save Changes</Text>}
                    </Pressable>
                )}

                <Pressable 
                    testID="delete-borrower-btn"
                    data-testid="delete-borrower-btn"
                    className="w-full py-4 rounded-xl items-center bg-gray-50 border border-gray-200 mt-2 active:bg-gray-100" onPress={handleDelete} disabled={saving}>
                    <Text className="text-red-600 font-bold">Delete Borrower</Text>
                </Pressable>
            </View>

            <ConfirmDialog
                visible={isConfirmDeleteVisible}
                title="Delete Borrower?"
                message={`Are you sure you want to delete ${borrower?.fullName}? This will hide them from all lists. This action can be reversed by an administrator.`}
                confirmLabel="Delete"
                onConfirm={confirmDelete}
                onCancel={() => setIsConfirmDeleteVisible(false)}
                isDestructive
            />

            <ConfirmDialog
                visible={isConfirmDeleteLoanVisible}
                title="Delete Loan"
                message={`Are you sure you want to delete Loan ${selectedLoan?.loanNumber}? This will also soft-delete all related payments and schedules. You can restore it from Trash.`}
                confirmLabel="Delete"
                onConfirm={confirmDeleteLoan}
                onCancel={() => {
                    setIsConfirmDeleteLoanVisible(false);
                    setSelectedLoan(null);
                }}
                isDestructive
            />

            <ConfirmDialog
                visible={isConfirmDeletePaymentVisible}
                title="Delete Payment"
                message={`Are you sure you want to delete this payment of ${selectedPayment ? formatPHP(selectedPayment.amount) : ''}? This can be recovered from Trash.`}
                confirmLabel="Delete"
                onConfirm={confirmDeletePayment}
                onCancel={() => {
                    setIsConfirmDeletePaymentVisible(false);
                    setSelectedPayment(null);
                }}
                isDestructive
            />
        </ScrollView>
    );
}
