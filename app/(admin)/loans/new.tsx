import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Alert, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { safeBack } from '../../../src/utils/navigation';
import { format } from 'date-fns';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { database } from '../../../src/database';
import { Q } from '@nozbe/watermelondb';
import Loan from '../../../src/database/models/Loan';
import Borrower from '../../../src/database/models/Borrower';
import Payment from '../../../src/database/models/Payment';
import LoanPenalty from '../../../src/database/models/LoanPenalty';
import PaymentSchedule from '../../../src/database/models/PaymentSchedule';
import { BorrowerSelector } from '../../../src/components/BorrowerSelector';
import { DatePicker } from '../../../src/components/DatePicker';
import { LoanCalculatorService, LoanCalcResult } from '../../../src/services/LoanCalculatorService';
import { formatPHP } from '../../../src/utils/currency';
import { LoanService } from '../../../src/services/LoanService';
import { MaterialIcons } from '@expo/vector-icons';
import uuid from 'react-native-uuid';
import { useAuth } from '../../../src/store/AuthContext';
import { AuditService, AuditIssue } from '../../../src/services/AuditService';
import { AuditReportDialog } from '../../../src/components/AuditReportDialog';
import { CalculationBasisCard } from '../../../src/components/CalculationBasisCard';
import { calculatePreviousLoanBalances, shouldAutoPopulateLoanCycle, shouldDefaultDailyTerm } from '../../../src/utils/loanFormDefaults';
import { toDate } from '../../../src/utils/dates';

const schema = z.object({
    borrowerId: z.string().min(1, "Borrower is required"),
    principal: z.string().refine(v => !isNaN(parseFloat(v)) && parseFloat(v) > 0, "Principal must be positive"),
    ratePercent: z.string().refine(v => !isNaN(parseFloat(v)) && parseFloat(v) >= 0, "Rate cannot be negative"),
    term: z.string().refine(v => !isNaN(parseInt(v, 10)) && parseInt(v, 10) > 0, "Term must be at least 1"),
    termUnit: z.enum(['months', 'days', 'weeks']),
    interestType: z.enum(['flat', 'diminishing']),
    frequency: z.enum(['daily', 'weekly', 'bi_monthly', 'monthly']),
    deposit: z.string().refine(v => !isNaN(parseFloat(v)) && parseFloat(v) >= 0, "Invalid deposit"),
    insurance: z.string().refine(v => !isNaN(parseFloat(v)) && parseFloat(v) >= 0, "Invalid insurance"),
    isReloan: z.boolean(),
    previousLoanId: z.string().optional(),
    loanBatch: z.string().optional(),
    loanCycle: z.string().optional(),
    releaseDate: z.string().min(1, 'Release date is required'),
});

type FormData = z.infer<typeof schema>;

export default function NewLoanScreen() {
    const { id: editLoanId } = useLocalSearchParams<{ id?: string }>();
    const router = useRouter();
    const { user } = useAuth();
    const [saving, setSaving] = useState(false);
    const [calcResult, setCalcResult] = useState<LoanCalcResult | null>(null);
    const [previousLoanBalance, setPreviousLoanBalance] = useState(0);
    const [previousLoanBalances, setPreviousLoanBalances] = useState<Record<string, number>>({});
    const [existingLoan, setExistingLoan] = useState<Loan | null>(null);
    const [isEditing, setIsEditing] = useState(!!editLoanId);
    const [activeLoan, setActiveLoan] = useState<Loan | null>(null);
    const [auditIssues, setAuditIssues] = useState<AuditIssue[]>([]);
    const [showAudit, setShowAudit] = useState(false);
    const [pendingData, setPendingData] = useState<{ data: FormData, status: 'pending' | 'active' } | null>(null);

    const [originalPrevLoanId, setOriginalPrevLoanId] = useState<string | null>(null);
    const [originalDeducted, setOriginalDeducted] = useState<number>(0);
    const [previousTermUnit, setPreviousTermUnit] = useState<string>('months');

    const { control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            borrowerId: '',
            principal: '5000',
            ratePercent: '20',
            term: '6',
            termUnit: 'months',
            interestType: 'flat',
            frequency: 'monthly',
            deposit: '50',
            insurance: '17',
            isReloan: false,
            previousLoanId: '',
            loanBatch: '',
            loanCycle: '1',
            releaseDate: format(new Date(), 'yyyy-MM-dd'),
        }
    });

    const [previousLoans, setPreviousLoans] = useState<Loan[]>([]);
    const [loadingPreviousLoans, setLoadingPreviousLoans] = useState(false);

    const editingLoanId = typeof editLoanId === 'string' && editLoanId.trim().length > 0 ? editLoanId : null;
    const isEditMode = !!editingLoanId;

    const watchedFields = watch();

    useEffect(() => {
        if (editLoanId) {
            const fetchExistingLoan = async () => {
                try {
                    const l = await database.collections.get<Loan>('loans').find(editLoanId);
                    setExistingLoan(l);
                    setIsEditing(true);

                    const rDate = l.releaseDate ? new Date(l.releaseDate) : new Date();

                    reset({
                        borrowerId: l.borrowerId,
                        principal: l.principalAmount.toString(),
                        ratePercent: l.interestRate.toString(),
                        term: l.term.toString(),
                        termUnit: l.termUnit as 'months' | 'days' | 'weeks',
                        interestType: l.interestType as 'flat' | 'diminishing',
                        frequency: l.frequency as 'daily' | 'weekly' | 'bi_monthly' | 'monthly',
                        deposit: (l.depositAmount || 0).toString(),
                        insurance: (l.insuranceAmount || 0).toString(),
                        isReloan: l.isReloan,
                        previousLoanId: l.previousLoanId || '',
                        loanBatch: l.loanBatch ? l.loanBatch.toString() : '',
                        loanCycle: l.loanCycle ? l.loanCycle.toString() : '1',
                        releaseDate: format(rDate, 'yyyy-MM-dd'),
                    });
                    
                    setOriginalPrevLoanId(l.previousLoanId || '');
                    setOriginalDeducted(l.deductedAmount || 0);
                    setPreviousLoanBalance(l.deductedAmount || 0);
                } catch (error) {
                    console.error("Failed to load existing loan", error);
                }
            };
            fetchExistingLoan();
        }
    }, [editLoanId, reset]);

    useEffect(() => {
        const p = parseFloat(watchedFields.principal);
        const r = parseFloat(watchedFields.ratePercent);
        const t = parseInt(watchedFields.term, 10);
        const dep = parseFloat(watchedFields.deposit);
        const ins = parseFloat(watchedFields.insurance);

        if (!isNaN(p) && p > 0 && !isNaN(r) && !isNaN(t) && t > 0) {
            const parsedDate = toDate(watchedFields.releaseDate) || new Date();
            const res = LoanCalculatorService.calculate(
                p, r, t, watchedFields.termUnit, 
                watchedFields.interestType, watchedFields.frequency, 
                parsedDate, !isNaN(dep) ? dep : 0, !isNaN(ins) ? ins : 0
            );
            setCalcResult(res);
        } else {
            setCalcResult(null);
        }
    }, [watchedFields.principal, watchedFields.ratePercent, watchedFields.term, watchedFields.termUnit, watchedFields.interestType, watchedFields.frequency, watchedFields.deposit, watchedFields.insurance, watchedFields.releaseDate]);

    useEffect(() => {
        const fetchPreviousLoans = async () => {
            if (watchedFields.borrowerId) {
                setLoadingPreviousLoans(true);
                try {
                    const loans = await database.collections.get<Loan>('loans').query(
                        Q.where('deleted_at', Q.eq(null)),
                        Q.where('borrower_id', watchedFields.borrowerId),
                        Q.where('status', Q.oneOf(['active', 'closed', 'paid', 'defaulted']))
                    ).fetch();
                    
                    const active = loans.find(l => l.status === 'active' && l.id !== editLoanId);
                    setActiveLoan(active || null);
                    setPreviousLoans(loans);

                    if (loans.length > 0) {
                        const loanIds = loans.map(l => l.id);
                        const [payments, penalties] = await Promise.all([
                            database.collections.get<Payment>('payments').query(
                                Q.where('deleted_at', Q.eq(null)),
                                Q.where('loan_id', Q.oneOf(loanIds))
                            ).fetch(),
                            database.collections.get<LoanPenalty>('loan_penalties').query(
                                Q.where('deleted_at', Q.eq(null)),
                                Q.where('loan_id', Q.oneOf(loanIds))
                            ).fetch()
                        ]);

                        const balances = calculatePreviousLoanBalances(loans, payments, penalties);
                        setPreviousLoanBalances(balances);
                    } else {
                        setPreviousLoanBalances({});
                    }

                    if (active && !isEditing) {
                        setValue('isReloan', true);
                        setValue('previousLoanId', active.id);
                    }
                } catch (error) {
                    console.error('Failed to fetch previous loans:', error);
                } finally {
                    setLoadingPreviousLoans(false);
                }
            } else {
                setPreviousLoans([]);
                setPreviousLoanBalances({});
                setActiveLoan(null);
            }
        };
        fetchPreviousLoans();
    }, [watchedFields.borrowerId, isEditing, editLoanId, setValue]);

    // Auto-calculate Loan Cycle
    useEffect(() => {
        if (shouldAutoPopulateLoanCycle(isEditing, watchedFields.borrowerId)) {
            setValue('loanCycle', (previousLoans.length + 1).toString());
        }
    }, [previousLoans, watchedFields.borrowerId, isEditing, setValue]);

    // Auto-set term to 40 when unit is 'days'
    useEffect(() => {
        if (shouldDefaultDailyTerm({
            isEditing,
            previousTermUnit,
            nextTermUnit: watchedFields.termUnit,
            currentTerm: watchedFields.term,
        })) {
            setValue('term', '40');
        }
        setPreviousTermUnit(watchedFields.termUnit);
    }, [watchedFields.termUnit, watchedFields.term, previousTermUnit, isEditing, setValue]);

    // Calculate previous loan balance when selection changes
    useEffect(() => {
        const calcPrevBalance = async () => {
            if (watchedFields.isReloan && watchedFields.previousLoanId) {
                // Preserve historical data if this is an edit and the link hasn't changed.
                if (isEditing && watchedFields.previousLoanId === originalPrevLoanId) {
                    setPreviousLoanBalance(originalDeducted);
                    return;
                }
                setPreviousLoanBalance(previousLoanBalances[watchedFields.previousLoanId] || 0);
            } else {
                setPreviousLoanBalance(0);
            }
        };
        calcPrevBalance();
    }, [watchedFields.isReloan, watchedFields.previousLoanId, previousLoanBalances, isEditing, originalPrevLoanId, originalDeducted]);

    const performSave = async (data: FormData, status: 'pending' | 'active') => {
        if (!calcResult) return;
        setSaving(true);
        try {
            const borrower = await database.collections.get<Borrower>('borrowers').find(data.borrowerId);
            const loanId = isEditing && existingLoan ? existingLoan.id : uuid.v4().toString();
            const ln = isEditing && existingLoan ? existingLoan.loanNumber : LoanCalculatorService.generateLoanNumber();

            await LoanService.saveLoan({
                loanId,
                loanNumber: ln,
                borrowerId: data.borrowerId,
                principalAmount: parseFloat(data.principal),
                interestRate: parseFloat(data.ratePercent),
                interestType: data.interestType as any,
                term: parseInt(data.term, 10),
                termUnit: data.termUnit as any,
                frequency: data.frequency as any,
                calcResult,
                depositAmount: parseFloat(data.deposit),
                insuranceAmount: parseFloat(data.insurance),
                collectorId: borrower.collectorId || '',
                encodedBy: user?.id || '',
                releaseDate: toDate(data.releaseDate) || new Date(),
                status,
                isReloan: data.isReloan,
                previousLoanId: data.previousLoanId,
                deductedAmount: previousLoanBalance,
                loanBatch: data.loanBatch ? parseInt(data.loanBatch, 10) : null,
                loanCycle: data.loanCycle ? parseInt(data.loanCycle, 10) : null,
                interestAmount: calcResult.totalInterest,
                isEditing,
                existingLoan: existingLoan
            });

            if (Platform.OS === 'web') {
                window.alert(`Loan ${status === 'active' ? 'disbursed' : 'saved as draft'}.`);
            } else {
                Alert.alert("Success", `Loan ${status === 'active' ? 'disbursed' : 'saved as draft'}.`);
            }
            safeBack(router, '/(admin)');
        } catch (error) {
            console.error('Save loan failed:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            if (Platform.OS === 'web') {
                window.alert(`Failed to save loan: ${errorMessage}`);
            } else {
                Alert.alert('Error', `Failed to save loan: ${errorMessage}`);
            }
        } finally {
            setSaving(false);
            setShowAudit(false);
            setPendingData(null);
        }
    };

    const onSubmit = async (data: FormData, status: 'pending' | 'active') => {
        if (!calcResult) return;

        // Final safety check for parallel active loans
        if (status === 'active' && activeLoan && !data.isReloan) {
            if (Platform.OS === 'web') {
                window.alert('Borrower already has an active loan. You must use the Renewal option.');
            } else {
                Alert.alert('Error', 'Borrower already has an active loan. You must use the Renewal option.');
            }
            return;
        }

        setSaving(true);
        try {
            // 1. Run Auto-Audit
            const audit = new AuditService(database);
            const issues = await audit.validateLoanPreSave(
                { ...data, deductedAmount: previousLoanBalance }, 
                calcResult, 
                isEditing
            );

            if (issues.length > 0) {
                setAuditIssues(issues);
                setPendingData({ data, status });
                setShowAudit(true);
                setSaving(false);
                return;
            }

            // 2. If no issues, proceed to save directly
            await performSave(data, status);
        } catch (error) {
            console.error('Audit failed:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            if (Platform.OS === 'web') {
                window.alert(`Safety audit failed: ${errorMessage}`);
            } else {
                Alert.alert('Error', `Safety audit failed: ${errorMessage}`);
            }
        } finally {
            setSaving(false);
        }
    };

    const onFormError = (formErrors: any) => {
        const errorMessages = Object.values(formErrors).map((err: any) => err.message).join('\n');
        if (Platform.OS === 'web') {
            window.alert(`Please fix the following validation errors:\n\n${errorMessages}`);
        } else {
            Alert.alert('Validation Error', `Please fix the following validation errors:\n\n${errorMessages}`);
        }
    };

    return (
        <ScrollView className="flex-1 bg-gray-50"  contentContainerStyle={{ padding: 16 }}>
            <View className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 mb-6">
                <Text testID="page-title" className="text-xl font-extrabold text-gray-900 mb-6">Loan Parameters</Text>

                <View className="mb-4">
                    <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Select Borrower</Text>
                    <Controller
                        control={control}
                        name="borrowerId"
                        render={({ field: { onChange, value } }) => (
                            <BorrowerSelector
                                selectedBorrowerId={value}
                                onSelect={(b) => onChange(b.id)}
                                disabled={isEditMode}
                            />
                        )}
                    />
                    {errors.borrowerId && <Text className="text-red-500 text-xs mt-1">{errors.borrowerId.message}</Text>}
                </View>

                {/* Release Date Picker */}
                <View className="mb-4">
                    <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Loan Release Date</Text>
                    <Controller
                        control={control}
                        name="releaseDate"
                        render={({ field: { onChange, value } }) => (
                            <DatePicker
                                value={value}
                                onChange={(date: string) => {
                                    onChange(date);
                                }}
                            />
                        )}
                    />
                    {errors.releaseDate && <Text className="text-red-500 text-xs mt-1">{errors.releaseDate.message}</Text>}
                    <Text className="text-[10px] text-gray-700 mt-1 italic">Calculations will be based on this date</Text>
                </View>

                {/* Renewal Toggle */}
                {watchedFields.borrowerId !== '' && (
                    <View className={`mb-4 flex-row items-center justify-between p-4 rounded-2xl border ${activeLoan ? 'bg-amber-50 border-amber-100' : 'bg-blue-50/50 border-blue-100'}`}>
                        <View className="flex-1 mr-4">
                            <Text className={`${activeLoan ? 'text-amber-900' : 'text-blue-900'} font-bold text-sm`}>
                                {activeLoan ? 'Loan Renewal Required' : 'Is this a Renewal?'}
                            </Text>
                            <Text className={`${activeLoan ? 'text-amber-500' : 'text-blue-400'} text-xs mt-0.5`}>
                                {activeLoan ? `Borrower has an active loan (${activeLoan.loanNumber}). Renewal is required to proceed.` : 'Link this to a previous loan'}
                            </Text>
                        </View>
                        <Controller
                            control={control}
                            name="isReloan"
                            render={({ field: { onChange, value } }) => (
                                <View className="flex-row items-center">
                                    {previousLoans.length === 0 && !loadingPreviousLoans && (
                                        <Text className="text-[10px] text-gray-700 italic mr-3">(No history)</Text>
                                    )}
                                    <Pressable
                                        onPress={() => !activeLoan && !(isEditing && existingLoan?.status === 'active') && onChange(!value)}
                                        disabled={previousLoans.length === 0 || !!activeLoan || (isEditing && existingLoan?.status === 'active')}
                                        className={`w-12 h-6 rounded-full p-1 ${value ? 'bg-blue-600' : 'bg-gray-200'} ${(previousLoans.length === 0 || !!activeLoan || (isEditing && existingLoan?.status === 'active')) ? 'opacity-50' : ''}`}
                                    >
                                        <View className={`w-4 h-4 rounded-full bg-white shadow-sm transition-all ${value ? 'ml-6' : 'ml-0'}`} />
                                    </Pressable>
                                </View>
                            )}
                        />
                    </View>
                )}

                {/* Previous Loan Selector */}
                {watchedFields.isReloan && previousLoans.length > 0 && (
                    <View className="mb-4">
                        <Text className="text-xs font-bold text-gray-700 mb-2 uppercase tracking-wider">Previous Loan to Renew</Text>
                        <Controller
                            control={control}
                            name="previousLoanId"
                            render={({ field: { onChange, value } }) => (
                                <View className="bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden">
                                    {previousLoans.map((loan, idx) => (
                                        <Pressable
                                            key={loan.id}
                                            onPress={() => !activeLoan && !(isEditing && existingLoan?.status === 'active') && onChange(loan.id)}
                                            className={`p-4 flex-row justify-between items-center ${idx < previousLoans.length - 1 ? 'border-b border-gray-100' : ''} ${value === loan.id ? 'bg-blue-50' : ''} ${ (activeLoan || (isEditing && existingLoan?.status === 'active')) ? 'opacity-70' : ''}`}
                                        >
                                            <View>
                                                <Text className={`font-bold ${value === loan.id ? 'text-blue-700' : 'text-gray-900'}`}>{loan.loanNumber}</Text>
                                                <View className="flex-row items-center">
                                                    <Text className="text-[10px] text-gray-700 font-bold uppercase">{new Date(loan.releaseDate as any).toLocaleDateString()} • {formatPHP(loan.principalAmount)}</Text>
                                                    {previousLoanBalances[loan.id] > 0 && (
                                                        <Text className="text-[10px] text-amber-600 font-bold uppercase"> • Balance: {formatPHP(previousLoanBalances[loan.id])}</Text>
                                                    )}
                                                </View>
                                            </View>
                                            <View className="flex-row items-center">
                                                <View className={`px-2 py-0.5 rounded-full mr-2 ${loan.status === 'active' ? 'bg-green-100' : 'bg-gray-200'}`}>
                                                    <Text className={`text-[8px] font-black uppercase ${loan.status === 'active' ? 'text-green-700' : 'text-gray-600'}`}>{loan.status}</Text>
                                                </View>
                                                {value === loan.id && <MaterialIcons name="check-circle" size={18} color="#1D4ED8" />}
                                            </View>
                                        </Pressable>
                                    ))}
                                </View>
                            )}
                        />
                        {errors.previousLoanId && <Text className="text-red-500 text-xs mt-1">{errors.previousLoanId.message}</Text>}
                    </View>
                )}

                <View className="flex-row mb-4">
                    <View className="flex-1 mr-2">
                        <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Loan Amount (Principal) (₱) *</Text>
                        <Controller
                            control={control}
                            name="principal"
                            render={({ field: { onChange, value } }) => (
                                <TextInput
                                    className={`bg-gray-50 p-4 rounded-xl border ${errors.principal ? 'border-red-500' : 'border-gray-200'} text-gray-900 font-bold`}
                                    value={value} onChangeText={onChange} keyboardType="numeric" editable={!saving} placeholder="e.g. 5000"
                                />
                            )}
                        />
                        {errors.principal && <Text className="text-red-500 text-xs mt-1">{errors.principal.message}</Text>}
                    </View>
                    <View className="flex-1 ml-2">
                        <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Int. Rate (%) *</Text>
                        <Controller
                            control={control}
                            name="ratePercent"
                            render={({ field: { onChange, value } }) => (
                                <TextInput
                                    className={`bg-gray-50 p-4 rounded-xl border ${errors.ratePercent ? 'border-red-500' : 'border-gray-200'} text-gray-900 font-bold`}
                                    value={value} onChangeText={onChange} keyboardType="numeric" editable={!saving}
                                />
                            )}
                        />
                        {errors.ratePercent && <Text className="text-red-500 text-xs mt-1">{errors.ratePercent.message}</Text>}
                    </View>
                </View>

                <View className="flex-row mb-4">
                    <View className="flex-1 mr-2">
                        <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Batch Number</Text>
                        <Controller
                            control={control}
                            name="loanBatch"
                            render={({ field: { onChange, value } }) => (
                                <TextInput
                                    className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-gray-900 font-bold"
                                    value={value} onChangeText={onChange} placeholder="e.g. 1" keyboardType="numeric" editable={!saving}
                                />
                            )}
                        />
                    </View>
                    <View className="flex-1 ml-2">
                        <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Loan Cycle</Text>
                        <Controller
                            control={control}
                            name="loanCycle"
                            render={({ field: { onChange, value } }) => (
                                <TextInput
                                    className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-gray-900 font-bold"
                                    value={value} onChangeText={onChange} placeholder="e.g. 1" keyboardType="numeric" editable={!saving}
                                />
                            )}
                        />
                    </View>
                </View>

                <View className="flex-row mb-4">
                    <View className="flex-1 mr-2">
                        <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Savings / Payment (₱) *</Text>
                        <Controller
                            control={control}
                            name="deposit"
                            render={({ field: { onChange, value } }) => (
                                <TextInput
                                    className={`bg-gray-50 p-4 rounded-xl border ${errors.deposit ? 'border-red-500' : 'border-gray-200'} text-gray-900 font-bold`}
                                    value={value} onChangeText={onChange} keyboardType="numeric" editable={!saving}
                                />
                            )}
                        />
                        {errors.deposit && <Text className="text-red-500 text-xs mt-1">{errors.deposit.message}</Text>}
                    </View>
                    <View className="flex-1 ml-2">
                        <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Insurance / Payment (₱) *</Text>
                        <Controller
                            control={control}
                            name="insurance"
                            render={({ field: { onChange, value } }) => (
                                <TextInput
                                    className={`bg-gray-50 p-4 rounded-xl border ${errors.insurance ? 'border-red-500' : 'border-gray-200'} text-gray-900 font-bold`}
                                    value={value} onChangeText={onChange} keyboardType="numeric" editable={!saving}
                                />
                            )}
                        />
                        {errors.insurance && <Text className="text-red-500 text-xs mt-1">{errors.insurance.message}</Text>}
                    </View>
                </View>

                <View className="flex-row mb-4">
                    <View className="flex-[2] mr-2">
                        <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Term *</Text>
                        <Controller
                            control={control}
                            name="term"
                            render={({ field: { onChange, value } }) => (
                                <TextInput
                                    className={`bg-gray-50 p-4 rounded-xl border ${errors.term ? 'border-red-500' : 'border-gray-200'} text-gray-900 font-bold`}
                                    value={value} onChangeText={onChange} keyboardType="numeric" editable={!saving}
                                />
                            )}
                        />
                        {errors.term && <Text className="text-red-500 text-xs mt-1">{errors.term.message}</Text>}
                    </View>
                    <View className="flex-[1] ml-2">
                        <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Unit</Text>
                        <Controller
                            control={control}
                            name="termUnit"
                            render={({ field: { onChange, value } }) => (
                                <View className="flex-row bg-gray-50 p-1 rounded-xl">
                                    {['months', 'days', 'weeks'].map(unit => (
                                        <Pressable
                                            key={unit}
                                            onPress={() => onChange(unit)}
                                            className={`flex-1 py-3 items-center rounded-lg ${value === unit ? 'bg-white shadow-sm' : ''}`}
                                        >
                                            <Text className={`text-xs font-bold capitalize ${value === unit ? 'text-primary' : 'text-gray-700'}`}>{unit}</Text>
                                        </Pressable>
                                    ))}
                                </View>
                            )}
                        />
                    </View>
                </View>

                <View className="mb-4">
                    <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Interest Type</Text>
                    <Controller
                        control={control}
                        name="interestType"
                        render={({ field: { onChange, value } }) => (
                            <View className="flex-row bg-gray-50 p-1 rounded-xl">
                                {['flat', 'diminishing'].map(type => (
                                    <Pressable
                                        key={type}
                                        onPress={() => onChange(type)}
                                        className={`flex-1 py-3 items-center rounded-lg ${value === type ? 'bg-white shadow-sm' : ''}`}
                                    >
                                        <Text className={`font-bold capitalize ${value === type ? 'text-primary' : 'text-gray-700'}`}>{type}</Text>
                                    </Pressable>
                                ))}
                            </View>
                        )}
                    />
                </View>

                <View className="mb-4">
                    <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Payment Frequency</Text>
                    <Controller
                        control={control}
                        name="frequency"
                        render={({ field: { onChange, value } }) => (
                            <View className="flex-row flex-wrap bg-gray-50 p-1 rounded-xl">
                                {['daily', 'weekly', 'bi_monthly', 'monthly'].map(freq => (
                                    <Pressable
                                        key={freq}
                                        onPress={() => onChange(freq)}
                                        className={`w-1/2 py-3 items-center rounded-lg ${value === freq ? 'bg-white shadow-sm' : ''}`}
                                    >
                                        <Text className={`font-bold capitalize ${value === freq ? 'text-primary' : 'text-gray-700'}`}>
                                            {freq.replace('_', '-')}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        )}
                    />
                </View>
            </View>

            {calcResult && (
                <View className="mb-6">
                    <View className="bg-primary p-6 rounded-3xl shadow-md relative overflow-hidden">
                        <View className="absolute -right-10 -top-10 bg-white/10 w-40 h-40 rounded-full" />
                        <Text className="text-indigo-200 text-xs font-bold uppercase tracking-widest mb-1">Total Loan Amount</Text>
                        <Text className="text-4xl font-extrabold text-white mb-6">{formatPHP(calcResult.totalAmount)}</Text>
                        <View className="flex-row mb-2">
                            <View className="flex-1 bg-white/10 p-4 rounded-2xl mr-2">
                                <Text className="text-indigo-200 text-[10px] font-bold uppercase tracking-widest mb-1">Installment Amount</Text>
                                <Text className="text-xl font-bold text-white">{formatPHP(calcResult.installmentAmount)}</Text>
                                <Text className="text-xs text-indigo-300 mt-1">per {watchedFields.frequency.replace('_', '-')}</Text>
                            </View>
                            <View className="flex-1 bg-white/10 p-4 rounded-2xl ml-2 justify-center">
                                <Text className="text-indigo-200 text-[10px] font-bold uppercase tracking-widest mb-1">Total Payments</Text>
                                <Text className="text-xl font-bold text-white">{calcResult.numPayments} payments</Text>
                            </View>
                        </View>
                    </View>

                    <View className="bg-white p-4 rounded-2xl border border-gray-100 mt-4">
                        <Text className="text-xs font-bold text-gray-700 uppercase mb-3">Breakdown</Text>
                        <View className="flex-row justify-between mb-2">
                            <Text className="text-gray-600">Loan Amount (Principal)</Text>
                            <Text className="font-bold text-gray-900">{formatPHP(parseFloat(watchedFields.principal))}</Text>
                        </View>
                        <View className="flex-row justify-between mb-2">
                            <Text className="text-gray-600">Interest ({watchedFields.ratePercent}%)</Text>
                            <Text className="font-bold text-gray-900">{formatPHP(calcResult.totalInterest)}</Text>
                        </View>
                        <View className="flex-row justify-between mb-2">
                            <View>
                                <Text className="text-gray-600">Savings Portion</Text>
                                <Text className="text-[10px] text-gray-700">{formatPHP(parseFloat(watchedFields.deposit))} per {watchedFields.frequency.replace('_', '-')}</Text>
                            </View>
                            <Text className="font-bold text-gray-900">{formatPHP(parseFloat(watchedFields.deposit) * calcResult.numPayments)} Total</Text>
                        </View>
                         <View className="flex-row justify-between">
                            <View>
                                <Text className="text-gray-600">Insurance Portion</Text>
                                <Text className="text-[10px] text-gray-700">{formatPHP(parseFloat(watchedFields.insurance))} per {watchedFields.frequency.replace('_', '-')}</Text>
                            </View>
                            <Text className="font-bold text-gray-900">{formatPHP(parseFloat(watchedFields.insurance) * calcResult.numPayments)} Total</Text>
                        </View>

                        {previousLoanBalance > 0 && (
                            <View className="flex-row justify-between mt-2 pt-2 border-t border-gray-100">
                                <Text className="text-red-600 font-bold">Previous Balance Deducted</Text>
                                <Text className="font-bold text-red-600">-{formatPHP(previousLoanBalance)}</Text>
                            </View>
                        )}

                        <View className="flex-row justify-between mt-4 pt-4 border-t-2 border-gray-100">
                            <Text className="text-lg font-black text-gray-900">Net Release (Disbursement)</Text>
                            <Text className="text-lg font-black text-green-700">
                                {formatPHP(Math.max(0, parseFloat(watchedFields.principal) - previousLoanBalance))}
                            </Text>
                        </View>
                    </View>

                    <CalculationBasisCard interestType={watchedFields.interestType} />
                </View>
            )}

            <View className="flex-row mb-10">
                <Pressable
                    className="flex-1 bg-white border border-primary py-4 rounded-xl items-center mr-2 active:bg-gray-50"
                    onPress={handleSubmit(d => onSubmit(d, 'pending'), onFormError)}
                    disabled={saving}
                >
                    <Text className="text-primary font-bold text-lg">Save Draft</Text>
                </Pressable>
                <Pressable
                    className={`flex-1 flex-row py-4 rounded-xl items-center justify-center ml-2 ${saving ? 'bg-green-400' : 'bg-[#388E3C] active:bg-green-800'}`}
                    onPress={handleSubmit(d => onSubmit(d, 'active'), onFormError)}
                    disabled={saving}
                >
                    {saving ? <ActivityIndicator color="#fff" /> : (
                        <>
                            <MaterialIcons name="local-atm" size={20} color="#fff" className="mr-2" />
                            <Text className="text-white font-bold text-lg">Disburse</Text>
                        </>
                    )}
                </Pressable>
            </View>
            <AuditReportDialog
                visible={showAudit}
                issues={auditIssues}
                onCancel={() => {
                    setShowAudit(false);
                    setSaving(false);
                }}
                onConfirm={() => {
                    if (pendingData) {
                        performSave(pendingData.data, pendingData.status);
                    }
                }}
                isSaving={saving}
            />
        </ScrollView>
    );
}
