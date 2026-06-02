import React, { useState, useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
    View, Text, TextInput, Pressable, ScrollView,
    ActivityIndicator, Alert, SafeAreaView, StatusBar,
} from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { database } from '../../src/database';
import { BorrowerSelector } from '../../src/components/BorrowerSelector';
import { formatPHP } from '../../src/utils/currency';
import { MaterialIcons } from '@expo/vector-icons';
import Borrower from '../../src/database/models/Borrower';
import Loan from '../../src/database/models/Loan';
import { Q } from '@nozbe/watermelondb';
import { LinearGradient } from 'expo-linear-gradient';
import { SyncStatusIndicator } from '../../src/components/SyncStatusIndicator';
import { AuthService } from '../../src/services/AuthService';
import { useAuth } from '../../src/store/AuthContext';
import { PhpCurrencyText } from '../../src/components/PhpCurrencyText';
import { SeriesService } from '../../src/services/SeriesService';
import { DatePicker } from '../../src/components/DatePicker';
import { format, parseISO } from 'date-fns';
import { PaymentService } from '../../src/services/PaymentService';
import { LoanCalculatorService } from '../../src/services/LoanCalculatorService';


const schema = z.object({
    borrowerId: z.string().min(1, 'Borrower is required'),
    selectedLoanId: z.string().min(1, 'Loan selection is required'),
    amount: z.string().refine(v => !isNaN(parseFloat(v)) && parseFloat(v) > 0, 'Amount must be positive'),
    paymentDate: z.string().min(1, 'Payment date is required'),
    receiptNumber: z.string().optional(),
    notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function PaymentEncoderScreen() {
    const { user, role, collectorId, signOut } = useAuth();
    const { borrowerId: paramBorrowerId, loanId: paramLoanId } = useLocalSearchParams<{ borrowerId: string, loanId: string }>();
    const router = useRouter();
    const [saving, setSaving] = useState(false);
    const [loans, setLoans] = useState<Loan[]>([]);

    const { control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: { 
            borrowerId: paramBorrowerId || '', 
            selectedLoanId: paramLoanId || '', 
            amount: '', 
            paymentDate: format(new Date(), 'yyyy-MM-dd'),
            receiptNumber: SeriesService.generateReceiptNumber(), 
            notes: '' 
        },
    });

    // Handle case where params change after mount
    useEffect(() => {
        if (paramBorrowerId) setValue('borrowerId', paramBorrowerId);
        if (paramLoanId) setValue('selectedLoanId', paramLoanId);
    }, [paramBorrowerId, paramLoanId]);

    const borrowerId = watch('borrowerId');
    const selectedLoanId = watch('selectedLoanId');

    useEffect(() => {
        let cancelled = false;

        const loadActiveLoans = async () => {
            if (!borrowerId) {
                setLoans([]);
                setValue('selectedLoanId', '');
                return;
            }

            try {
                if (role === 'collector') {
                    if (!collectorId) {
                        setLoans([]);
                        setValue('selectedLoanId', '');
                        return;
                    }

                    const borrower = await database.collections.get<Borrower>('borrowers').find(borrowerId);
                    if (borrower.collectorId !== collectorId) {
                        setLoans([]);
                        setValue('selectedLoanId', '');
                        Alert.alert('Access denied', 'This borrower is not assigned to your collector account.');
                        return;
                    }
                }

                const activeLoans = await database.collections.get<Loan>('loans')
                    .query(Q.where('borrower_id', borrowerId), Q.where('status', 'active'))
                    .fetch();

                if (cancelled) return;

                setLoans(activeLoans);
                if (selectedLoanId && !activeLoans.some(loan => loan.id === selectedLoanId)) {
                    setValue('selectedLoanId', '');
                }
            } catch (error) {
                console.error('Failed to load active loans:', error);
                if (!cancelled) {
                    setLoans([]);
                    setValue('selectedLoanId', '');
                }
            }
        };

        loadActiveLoans();

        return () => {
            cancelled = true;
        };
    }, [borrowerId, collectorId, role, selectedLoanId, setValue]);

    useEffect(() => {
        const selectedLoan = loans.find(l => l.id === selectedLoanId);
        if (selectedLoan) setValue('amount', selectedLoan.installmentAmount.toString());
    }, [selectedLoanId, loans]);

    const onSubmit = async (data: FormData) => {
        setSaving(true);
        try {
            const selectedLoanForSubmit = loans.find(loan => loan.id === data.selectedLoanId);
            if (!selectedLoanForSubmit) {
                Alert.alert('Select loan', 'Choose an active loan for an assigned borrower before saving.');
                return;
            }

            let computedDeposit = 0;
            if (selectedLoanForSubmit && data.amount) {
                const numPayments = LoanCalculatorService.paymentsForFrequency(selectedLoanForSubmit.term, selectedLoanForSubmit.termUnit, selectedLoanForSubmit.frequency);
                const periodicDeposit = (selectedLoanForSubmit.depositAmount || 0) / numPayments;
                const ratio = parseFloat(data.amount) / selectedLoanForSubmit.installmentAmount;
                computedDeposit = ratio * periodicDeposit;
            }

            await PaymentService.postPayment({
                loanId: data.selectedLoanId,
                amount: parseFloat(data.amount),
                depositAmount: computedDeposit,
                paymentDate: parseISO(data.paymentDate),
                receiptNumber: data.receiptNumber,
                notes: data.notes,
                encodedBy: user?.id,
                collectorId: role === 'collector' ? collectorId : undefined,
                database,
            });

            Alert.alert('Payment saved', 'Payment recorded successfully.');
            setValue('amount', '');
            setValue('receiptNumber', SeriesService.generateReceiptNumber());
            setValue('notes', '');
            reset({ ...watch(), amount: '', receiptNumber: SeriesService.generateReceiptNumber(), notes: '' });
        } catch (error) {
            console.error('Save payment failed:', error);
            Alert.alert('Error', 'Failed to save payment.');
        } finally {
            setSaving(false);
        }
    };

    const selectedLoan = loans.find(l => l.id === selectedLoanId);

    const amountStr = watch('amount');
    let computedPrincipal = 0;
    let computedDeposit = 0;
    let computedInsurance = 0;

    if (selectedLoan && amountStr) {
        const amount = parseFloat(amountStr);
        if (!isNaN(amount) && selectedLoan.installmentAmount > 0) {
            const numPayments = LoanCalculatorService.paymentsForFrequency(selectedLoan.term, selectedLoan.termUnit, selectedLoan.frequency);
            const periodicDeposit = (selectedLoan.depositAmount || 0) / numPayments;
            const periodicInsurance = (selectedLoan.insuranceAmount || 0) / numPayments;
            
            const ratio = amount / selectedLoan.installmentAmount;
            computedDeposit = ratio * periodicDeposit;
            computedInsurance = ratio * periodicInsurance;
            computedPrincipal = amount - computedDeposit - computedInsurance;
        }
    }

    return (
        <SafeAreaView className="flex-1 bg-[#F8FAFC]">
            <StatusBar barStyle="light-content" />
            <ScrollView className="flex-1"   showsVerticalScrollIndicator={false} >
                {/* Gradient Header */}
                <LinearGradient
                    colors={['#B45309', '#78350F']}
                    className="pt-10 pb-20 px-6 rounded-b-[40px]"
                >
                    <View className="flex-row items-center justify-between">
                        <View>
                            <Text className="text-amber-50 text-xs font-black uppercase tracking-[3px]">Payment Encoder</Text>
                            <Text className="text-white text-3xl font-black mt-1">{user?.email?.split('@')[0]}</Text>
                        </View>
                        <View className="items-end gap-2">
                            <SyncStatusIndicator />
                            <Pressable
                                testID="logout-button"
                                onPress={signOut}
                                className="p-2.5 bg-white/10 rounded-2xl active:bg-white/20 border border-white/10"
                            >
                                <MaterialIcons name="logout" size={18} color="#FFF" />
                            </Pressable>
                        </View>
                    </View>
                </LinearGradient>

                {/* Form Card */}
                <View className="px-6 -mt-12 mb-10">
                    <View className="bg-white rounded-[32px] p-6 border border-gray-50" style={{ boxShadow: '0 20px 25px -5px rgba(120,53,15,0.1)' }}>
                        <Text testID="page-title" className="text-gray-900 text-xl font-black mb-6">Record Payment</Text>

                        {/* Borrower Selector */}
                            <Controller
                                control={control}
                                name="borrowerId"
                                render={({ field: { onChange, value } }) => (
                                <BorrowerSelector
                                    selectedBorrowerId={value}
                                    onSelect={(b) => onChange(b.id)}
                                    role={role}
                                    collectorId={collectorId}
                                />
                            )}
                        />
                        {errors.borrowerId ? <Text className="text-red-500 text-xs mt-1 mb-2">{errors.borrowerId.message}</Text> : null}

                        {/* Active Loan Selection */}
                        {borrowerId ? (
                            <View className="mt-6 mb-4">
                                <Text className="text-xs font-black text-gray-700 mb-3 uppercase tracking-wider">Select Active Loan</Text>
                                <Controller
                                    control={control}
                                    name="selectedLoanId"
                                    render={({ field: { onChange, value } }) => (
                                        loans.length === 0 ? (
                                            <View className="bg-red-50 p-4 rounded-2xl border border-red-100">
                                                <Text className="text-red-500 text-sm font-semibold text-center">No active loans for this borrower</Text>
                                            </View>
                                        ) : (
                                            <View className="flex-row flex-wrap gap-2">
                                                {loans.map(loan => (
                                                    <Pressable
                                                        key={loan.id}
                                                        onPress={() => onChange(loan.id)}
                                                        className={`px-4 py-3 rounded-2xl border ${value === loan.id ? 'bg-amber-50 border-amber-400' : 'bg-gray-50 border-gray-200'}`}
                                                    >
                                                        <Text className={`font-bold text-sm ${value === loan.id ? 'text-amber-800' : 'text-gray-600'}`}>
                                                            {loan.loanNumber}
                                                        </Text>
                                                        <Text className="text-[10px] text-gray-700 font-semibold mt-0.5">
                                                            {formatPHP(loan.installmentAmount)} / {loan.frequency}
                                                        </Text>
                                                    </Pressable>
                                                ))}
                                            </View>
                                        )
                                    )}
                                />
                                {errors.selectedLoanId ? <Text className="text-red-500 text-xs mt-1">{errors.selectedLoanId.message}</Text> : null}
                            </View>
                        ) : null}

                        {/* Loan Preview */}
                        {selectedLoan ? (
                            <View className="bg-amber-50 p-4 rounded-2xl border border-amber-100 mb-4">
                                <View className="flex-row justify-between mb-1">
                                    <Text className="text-amber-900 text-xs font-bold">Principal</Text>
                                    <Text className="text-amber-900 font-black text-sm">{formatPHP(selectedLoan.principalAmount)}</Text>
                                </View>
                                <View className="flex-row justify-between">
                                    <Text className="text-amber-900 text-xs font-bold">Installment</Text>
                                    <Text className="text-amber-900 font-black text-sm">{formatPHP(selectedLoan.installmentAmount)}</Text>
                                </View>
                            </View>
                        ) : null}

                        {/* Payment Date */}
                        <View className="mb-4">
                            <Text className="text-xs font-black text-gray-700 mb-2 uppercase tracking-wider">Date of Payment *</Text>
                            <Controller
                                control={control}
                                name="paymentDate"
                                render={({ field: { onChange, value } }) => (
                                    <DatePicker value={value} onChange={onChange} />
                                )}
                            />
                            {errors.paymentDate && <Text className="text-red-500 text-xs mt-1">{errors.paymentDate.message}</Text>}
                        </View>

                        {/* Amount */}
                        <View className="mb-4">
                            <Text className="text-xs font-black text-gray-700 mb-2 uppercase tracking-wider">Amount (PHP)</Text>
                            <Controller
                                control={control}
                                name="amount"
                                render={({ field: { onChange, value } }) => (
                                    <TextInput
                                        className={`bg-gray-50 px-5 py-4 rounded-2xl border text-gray-900 font-black text-2xl ${errors.amount ? 'border-red-400' : 'border-gray-200'}`}
                                        value={value} onChangeText={onChange} keyboardType="numeric"
                                        editable={!saving} placeholder="0.00" placeholderTextColor="#D1D5DB"
                                    />
                                )}
                            />
                            {errors.amount ? <Text className="text-red-500 text-xs mt-1">{errors.amount.message}</Text> : null}
                        </View>

                        {/* Breakdown Display */}
                        {selectedLoan && parseFloat(amountStr) > 0 ? (
                            <View className="mb-6 bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
                                <Text className="text-xs font-black text-indigo-900 mb-3 uppercase tracking-wider">Computed Breakdown</Text>
                                <View className="flex-row justify-between mb-2">
                                    <Text className="text-indigo-800 text-sm">Principal / Interest</Text>
                                    <Text className="text-indigo-900 font-bold text-sm">{formatPHP(computedPrincipal)}</Text>
                                </View>
                                <View className="flex-row justify-between mb-2">
                                    <Text className="text-indigo-800 text-sm">Deposit / Savings</Text>
                                    <Text className="text-indigo-900 font-bold text-sm">{formatPHP(computedDeposit)}</Text>
                                </View>
                                <View className="flex-row justify-between pt-2 border-t border-indigo-100">
                                    <Text className="text-indigo-800 text-sm">Insurance</Text>
                                    <Text className="text-indigo-900 font-bold text-sm">{formatPHP(computedInsurance)}</Text>
                                </View>
                            </View>
                        ) : null}

                        {/* Receipt */}
                        <View className="mb-4">
                            <Text className="text-xs font-black text-gray-700 mb-2 uppercase tracking-wider">Receipt Number</Text>
                            <Controller
                                control={control}
                                name="receiptNumber"
                                render={({ field: { onChange, value } }) => (
                                    <TextInput
                                        className="bg-gray-50 px-5 py-4 rounded-2xl border border-gray-200 text-gray-900 font-semibold"
                                        value={value} onChangeText={onChange}
                                        editable={!saving} placeholder="Optional" placeholderTextColor="#D1D5DB"
                                    />
                                )}
                            />
                        </View>

                        {/* Notes */}
                        <View className="mb-6">
                            <Text className="text-xs font-black text-gray-700 mb-2 uppercase tracking-wider">Notes</Text>
                            <Controller
                                control={control}
                                name="notes"
                                render={({ field: { onChange, value } }) => (
                                    <TextInput
                                        className="bg-gray-50 px-5 py-4 rounded-2xl border border-gray-200 text-gray-900 h-24"
                                        value={value} onChangeText={onChange}
                                        multiline textAlignVertical="top"
                                        editable={!saving} placeholder="Optional remarks..." placeholderTextColor="#D1D5DB"
                                    />
                                )}
                            />
                        </View>

                        <Pressable
                            className={`w-full py-4 rounded-2xl items-center flex-row justify-center ${saving ? 'bg-amber-300' : 'bg-amber-600 active:bg-amber-700'}`}
                            onPress={handleSubmit(onSubmit)}
                            disabled={saving}
                        >
                            {saving ? <ActivityIndicator color="#fff" /> : (
                                <>
                                    <MaterialIcons name="check-circle" size={20} color="#fff" />
                                    <Text className="text-white font-black text-lg ml-2">Confirm Payment</Text>
                                </>
                            )}
                        </Pressable>
                    </View>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}
