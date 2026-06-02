import React, { useEffect, useState } from 'react';
import {
    View, Text, TextInput, Pressable, ScrollView,
    ActivityIndicator, Alert, SafeAreaView, StatusBar, Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { database } from '../../src/database';
import { BorrowerSelector } from '../../src/components/BorrowerSelector';
import { LoanCalculatorService, LoanCalcResult } from '../../src/services/LoanCalculatorService';
import { CalculationBasisCard } from '../../src/components/CalculationBasisCard';
import { formatPHP } from '../../src/utils/currency';
import { MaterialIcons } from '@expo/vector-icons';
import { LoanService } from '../../src/services/LoanService';
import { DatePicker } from '../../src/components/DatePicker';
import uuid from 'react-native-uuid';
import { Q } from '@nozbe/watermelondb';
import Loan from '../../src/database/models/Loan';
import Borrower from '../../src/database/models/Borrower';
import Payment from '../../src/database/models/Payment';
import LoanPenalty from '../../src/database/models/LoanPenalty';
import PaymentSchedule from '../../src/database/models/PaymentSchedule';
import { LinearGradient } from 'expo-linear-gradient';
import { SyncStatusIndicator } from '../../src/components/SyncStatusIndicator';
import { AuthService } from '../../src/services/AuthService';
import { useAuth } from '../../src/store/AuthContext';
import { format } from 'date-fns';
import { AuditService, AuditIssue } from '../../src/services/AuditService';
import { AuditReportDialog } from '../../src/components/AuditReportDialog';
import ConfirmDialog from '../../src/components/ConfirmDialog';
import { calculatePreviousLoanBalances } from '../../src/utils/loanFormDefaults';

const schema = z.object({
    borrowerId: z.string().min(1, 'Borrower is required'),
    principal: z.string().refine(v => !isNaN(parseFloat(v)) && parseFloat(v) > 0, 'Principal must be positive'),
    ratePercent: z.string().refine(v => !isNaN(parseFloat(v)) && parseFloat(v) >= 0, 'Rate cannot be negative'),
    term: z.string().refine(v => !isNaN(parseInt(v)) && parseInt(v) > 0, 'Term must be at least 1'),
    termUnit: z.enum(['months', 'days', 'weeks']),
    interestType: z.enum(['flat', 'diminishing']),
    frequency: z.enum(['daily', 'weekly', 'bi_monthly', 'monthly']),
    deposit: z.string().refine(v => !isNaN(parseFloat(v)) && parseFloat(v) >= 0, 'Deposit cannot be negative'),
    insurance: z.string().refine(v => !isNaN(parseFloat(v)) && parseFloat(v) >= 0, 'Insurance cannot be negative'),
    isReloan: z.boolean(),
    previousLoanId: z.string().optional(),
    releaseDate: z.string().min(1, 'Release date is required'),
});

type FormData = z.infer<typeof schema>;

function FormLabel({ children }: { children: React.ReactNode }) {
    return <Text className="text-xs font-bold text-gray-700 mb-2 uppercase tracking-wider">{children}</Text>;
}

function FormInput({ value, onChange, error, disabled, keyboardType = 'default', placeholder = '' }: any) {
    return (
        <>
            <TextInput
                className={`bg-gray-50 px-4 py-3.5 rounded-2xl border font-bold text-gray-900 ${error ? 'border-red-400' : 'border-gray-200'}`}
                value={value} onChangeText={onChange} keyboardType={keyboardType}
                editable={!disabled} placeholder={placeholder} placeholderTextColor="#D1D5DB"
            />
            {!!error && <Text className="text-red-500 text-xs mt-1 mb-1">{error}</Text>}
        </>
    );
}

function SegmentControl({ options, value, onChange, labels }: { options: string[]; value: string; onChange: (v: string) => void; labels?: string[] }) {
    return (
        <View className="flex-row bg-gray-100 p-1 rounded-2xl">
            {options.map((opt, i) => (
                <Pressable
                    key={opt}
                    onPress={() => onChange(opt)}
                    className={`flex-1 py-2.5 items-center rounded-xl ${value === opt ? 'bg-white shadow-sm' : ''}`}
                >
                    <Text className={`text-[11px] font-black capitalize ${value === opt ? 'text-blue-600' : 'text-gray-700'}`}>
                        {labels?.[i] ?? opt}
                    </Text>
                </Pressable>
            ))}
        </View>
    );
}

export default function LoanEncoderScreen() {
    const router = useRouter();
    const { user, signOut } = useAuth();
    const [saving, setSaving] = useState(false);
    const [calcResult, setCalcResult] = useState<LoanCalcResult | null>(null);

    const { control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            borrowerId: '', releaseDate: format(new Date(), 'yyyy-MM-dd'), principal: '10000', ratePercent: '5',
            term: '3', termUnit: 'months', interestType: 'flat',
            frequency: 'monthly', deposit: '50', insurance: '17',
            isReloan: false, previousLoanId: '',
        },
    });

    const [previousLoans, setPreviousLoans] = useState<Loan[]>([]);
    const [activeLoan, setActiveLoan] = useState<Loan | null>(null);
    const [activeLoanBalance, setActiveLoanBalance] = useState(0);
    const [previousLoanBalances, setPreviousLoanBalances] = useState<Record<string, number>>({});
    const [loadingPreviousLoans, setLoadingPreviousLoans] = useState(false);
    const [auditIssues, setAuditIssues] = useState<AuditIssue[]>([]);
    const [showAudit, setShowAudit] = useState(false);
    const [pendingData, setPendingData] = useState<FormData | null>(null);
    const [showConfirmReloan, setShowConfirmReloan] = useState(false);
    const [reloanConfirmInfo, setReloanConfirmInfo] = useState<{ balance: number; net: number } | null>(null);

    const watchedValues = watch();

    useEffect(() => {
        const fetchPreviousLoans = async () => {
            if (watchedValues.borrowerId) {
                setLoadingPreviousLoans(true);
                try {
                    const loans = await database.collections.get<Loan>('loans').query(
                        Q.where('deleted_at', Q.eq(null)),
                        Q.where('borrower_id', watchedValues.borrowerId),
                        Q.where('status', Q.oneOf(['active', 'closed', 'paid', 'defaulted']))
                    ).fetch();
                    
                    const active = loans.find(l => l.status === 'active');
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

                        if (active) {
                            setActiveLoanBalance(balances[active.id] || 0);
                        } else {
                            setActiveLoanBalance(0);
                        }
                    } else {
                        setPreviousLoanBalances({});
                        setActiveLoanBalance(0);
                    }

                    if (active) {
                        reset({
                            ...watchedValues,
                            isReloan: true,
                            previousLoanId: active.id,
                        });
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
                setActiveLoanBalance(0);
            }
        };
        fetchPreviousLoans();
    }, [watchedValues.borrowerId]);

    useEffect(() => {
        const p = parseFloat(watchedValues.principal);
        const r = parseFloat(watchedValues.ratePercent);
        const t = parseInt(watchedValues.term, 10);
        const d = parseFloat(watchedValues.deposit);
        const i = parseFloat(watchedValues.insurance);

        if (!isNaN(p) && p > 0 && !isNaN(r) && !isNaN(t) && t > 0) {
            const parsedDate = new Date(watchedValues.releaseDate || new Date());
            const res = LoanCalculatorService.calculate(
                p, r, t, watchedValues.termUnit,
                watchedValues.interestType, watchedValues.frequency, parsedDate,
                !isNaN(d) ? d : 0, !isNaN(i) ? i : 0
            );
            setCalcResult(res);
        } else {
            setCalcResult(null);
        }
    }, [watchedValues.principal, watchedValues.ratePercent, watchedValues.term, watchedValues.termUnit, watchedValues.interestType, watchedValues.frequency, watchedValues.deposit, watchedValues.insurance, watchedValues.releaseDate]);

    // Auto-set term to 40 when unit is 'days'
    useEffect(() => {
        if (watchedValues.termUnit === 'days') {
            setValue('term', '40');
        }
    }, [watchedValues.termUnit, setValue]);

    const performSave = async (data: FormData) => {
        if (!calcResult) return;
        setSaving(true);
        const balanceToDeduct = (data.isReloan && data.previousLoanId === activeLoan?.id) ? activeLoanBalance : 0;
        
        try {
            const borrower = await database.collections.get<Borrower>('borrowers').find(data.borrowerId);
            const loanId = uuid.v4().toString();
            const ln = LoanCalculatorService.generateLoanNumber();

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
                releaseDate: new Date(data.releaseDate || new Date()),
                status: 'active',
                isReloan: data.isReloan,
                previousLoanId: data.previousLoanId,
                deductedAmount: balanceToDeduct,
                interestAmount: calcResult.totalInterest,
                isEditing: false
            });

            if (Platform.OS === 'web') {
                window.alert('Loan created and schedules generated.');
            } else {
                Alert.alert('✓ Disbursed', 'Loan created and schedules generated.');
            }
            reset();
            router.replace('/(loan-encoder)');
        } catch (error) {
            console.error('Save loan failed:', error);
            if (Platform.OS === 'web') {
                window.alert('Failed to save loan. Please check your data or connection.');
            } else {
                Alert.alert('Error', 'Failed to save loan. Please check your data or connection.');
            }
        } finally {
            setSaving(false);
            setShowAudit(false);
            setPendingData(null);
        }
    };

    const onSubmit = async (data: FormData) => {
        if (!calcResult) {
            if (Platform.OS === 'web') {
                window.alert('Invalid loan parameters.');
            } else {
                Alert.alert('Error', 'Invalid loan parameters.');
            }
            return;
        }

        // Final safety check for parallel active loans
        if (activeLoan && !data.isReloan) {
            if (Platform.OS === 'web') {
                window.alert('Borrower already has an active loan. You must use the Renewal option.');
            } else {
                Alert.alert('Error', 'Borrower already has an active loan. You must use the Renewal option.');
            }
            return;
        }
        
        const balanceToDeduct = (data.isReloan && data.previousLoanId === activeLoan?.id) ? activeLoanBalance : 0;
        const netProceeds = LoanCalculatorService.calculateNetProceeds(
            parseFloat(data.principal), 
            parseFloat(data.deposit), 
            parseFloat(data.insurance), 
            balanceToDeduct
        );

        setSaving(true);
        try {
            // 1. Run Auto-Audit
            const audit = new AuditService(database);
            const issues = await audit.validateLoanPreSave(
                { ...data, deductedAmount: balanceToDeduct }, 
                calcResult, 
                false
            );

            if (issues.length > 0) {
                setAuditIssues(issues);
                setPendingData(data);
                setShowAudit(true);
                return;
            }

            // 2. Extra confirmation for high balance reloans
            if (balanceToDeduct > 0) {
                if (Platform.OS === 'web') {
                    setReloanConfirmInfo({ balance: balanceToDeduct, net: netProceeds });
                    setPendingData(data);
                    setShowConfirmReloan(true);
                    setSaving(false);
                    return;
                }

                const confirm = await new Promise((resolve) => {
                    Alert.alert(
                        'Confirm Renewal',
                        `This will close the active loan (Balance: ${formatPHP(balanceToDeduct)}) and deduct it from the new loan.\n\nNet Cash Released: ${formatPHP(netProceeds)}`,
                        [
                            { text: 'Cancel', onPress: () => resolve(false), style: 'cancel' },
                            { text: 'Proceed', onPress: () => resolve(true) }
                        ]
                    );
                });
                if (!confirm) {
                    setSaving(false);
                    return;
                }
            }

            // 3. Proceed to save
            await performSave(data);
        } catch (error) {
            console.error('Audit/Save failed:', error);
            if (Platform.OS === 'web') {
                window.alert('Operation failed. Please try again.');
            } else {
                Alert.alert('Error', 'Operation failed. Please try again.');
            }
        } finally {
            setSaving(false);
        }
    };

    return (
        <SafeAreaView className="flex-1 bg-[#F8FAFC]">
            <StatusBar barStyle="light-content" />
            <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
                {/* Gradient Header */}
                <LinearGradient
                    colors={['#1E40AF', '#1E3A5F']}
                    className="pt-10 pb-20 px-6 rounded-b-[40px]"
                >
                    <View className="flex-row items-center justify-between">
                        <View>
                            <Text className="text-blue-200/70 text-xs font-bold uppercase tracking-[3px]">Loan Encoder</Text>
                            <Text className="text-white text-3xl font-black mt-1">{user?.email?.split('@')[0]}</Text>
                        </View>
                        <View className="items-end gap-2">
                            <SyncStatusIndicator />
                            <Pressable
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
                    <View className="bg-white rounded-[32px] p-6 shadow-xl shadow-blue-900/10 border border-gray-50">
                        <Text testID="page-title" className="text-gray-900 text-xl font-black mb-6">New Loan Entry</Text>

                        {/* Borrower */}
                        <View className="mb-4">
                            <FormLabel>Borrower</FormLabel>
                            <Controller
                                control={control}
                                name="borrowerId"
                                render={({ field: { onChange, value } }) => (
                                    <BorrowerSelector selectedBorrowerId={value} onSelect={(b) => onChange(b.id)} />
                                )}
                            />
                            {errors.borrowerId && <Text className="text-red-500 text-xs mt-1 mb-2">{errors.borrowerId.message}</Text>}
                        </View>

                        {/* Release Date */}
                        <View className="mb-4">
                            <FormLabel>Release Date</FormLabel>
                            <Controller
                                control={control}
                                name="releaseDate"
                                render={({ field: { onChange, value } }) => (
                                    <DatePicker value={value} onChange={onChange} />
                                )}
                            />
                            {errors.releaseDate && <Text className="text-red-500 text-xs mt-1 mb-2">{errors.releaseDate.message}</Text>}
                        </View>

                        {/* Renewal Toggle */}
                        {watchedValues.borrowerId !== '' && (
                            <View className={`mt-4 flex-row items-center justify-between p-4 rounded-2xl border ${activeLoan ? 'bg-amber-50 border-amber-100' : 'bg-blue-50/50 border-blue-100'}`}>
                                <View className="flex-1 mr-4">
                                    <Text className={`${activeLoan ? 'text-amber-900' : 'text-blue-900'} font-bold text-sm`}>
                                        {activeLoan ? 'Loan Renewal Required' : 'Is this a Renewal?'}
                                    </Text>
                                    <Text className={`${activeLoan ? 'text-amber-500' : 'text-blue-400'} text-xs mt-0.5`}>
                                        {activeLoan ? `Borrower has an active loan (${activeLoan.loanNumber})` : 'Link this to a previous loan'}
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
                                                onPress={() => !activeLoan && onChange(!value)}
                                                disabled={previousLoans.length === 0 || !!activeLoan}
                                                className={`w-12 h-6 rounded-full p-1 ${value ? 'bg-blue-600' : 'bg-gray-200'} ${(previousLoans.length === 0 || !!activeLoan) ? 'opacity-50' : ''}`}
                                            >
                                                <View className={`w-4 h-4 rounded-full bg-white shadow-sm transition-all ${value ? 'ml-6' : 'ml-0'}`} />
                                            </Pressable>
                                        </View>
                                    )}
                                />
                            </View>
                        )}

                        {/* Previous Loan Selector */}
                        {watchedValues.isReloan && previousLoans.length > 0 && (
                            <View className="mt-4">
                                <FormLabel>Previous Loan to Renew</FormLabel>
                                <Controller
                                    control={control}
                                    name="previousLoanId"
                                    render={({ field: { onChange, value } }) => (
                                        <View className="bg-gray-50 rounded-2xl border border-gray-200 overflow-hidden">
                                            {previousLoans.map((loan, idx) => (
                                                <Pressable
                                                    key={loan.id}
                                                    onPress={() => !activeLoan && onChange(loan.id)}
                                                    className={`p-4 flex-row justify-between items-center ${idx < previousLoans.length - 1 ? 'border-b border-gray-100' : ''} ${value === loan.id ? 'bg-blue-50' : ''} ${activeLoan ? 'opacity-70' : ''}`}
                                                >
                                                    <View>
                                                        <Text className={`font-bold ${value === loan.id ? 'text-blue-700' : 'text-gray-900'}`}>{loan.loanNumber}</Text>
                                                        <View className="flex-row items-center">
                                                            <Text className="text-[10px] text-gray-700 font-bold uppercase">{new Date(loan.releaseDate as any).toLocaleDateString()} • {formatPHP(loan.principalAmount)}</Text>
                                                            <Text className="text-[10px] text-green-700 font-black uppercase ml-1"> • Net: {formatPHP(loan.principalAmount - (loan.deductedAmount || 0))}</Text>
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

                        {/* Principal + Rate */}
                        <View className="flex-row mt-5 mb-4 gap-3">
                            <View className="flex-1">
                                <FormLabel>Principal (₱)</FormLabel>
                                <Controller control={control} name="principal" render={({ field: { onChange, value } }) =>
                                    <FormInput value={value} onChange={onChange} error={errors.principal?.message} disabled={saving} keyboardType="numeric" />
                                } />
                            </View>
                            <View className="flex-1">
                                <FormLabel>Rate (%)</FormLabel>
                                <Controller control={control} name="ratePercent" render={({ field: { onChange, value } }) =>
                                    <FormInput value={value} onChange={onChange} error={errors.ratePercent?.message} disabled={saving} keyboardType="numeric" />
                                } />
                            </View>
                        </View>

                        {/* Term + Unit */}
                        <View className="flex-row mb-4 gap-3">
                            <View className="w-20">
                                <FormLabel>Term</FormLabel>
                                <Controller control={control} name="term" render={({ field: { onChange, value } }) =>
                                    <FormInput value={value} onChange={onChange} error={errors.term?.message} disabled={saving} keyboardType="numeric" />
                                } />
                            </View>
                            <View className="flex-1">
                                <FormLabel>Unit</FormLabel>
                                <Controller control={control} name="termUnit" render={({ field: { onChange, value } }) =>
                                    <SegmentControl options={['months', 'days', 'weeks']} value={value} onChange={onChange} />
                                } />
                            </View>
                        </View>

                        {/* Interest Type */}
                        <View className="mb-4">
                            <FormLabel>Interest Type</FormLabel>
                            <Controller control={control} name="interestType" render={({ field: { onChange, value } }) =>
                                <SegmentControl options={['flat', 'diminishing']} value={value} onChange={onChange} />
                            } />
                        </View>

                        {/* Frequency */}
                        <View className="mb-4">
                            <FormLabel>Payment Frequency</FormLabel>
                            <Controller control={control} name="frequency" render={({ field: { onChange, value } }) =>
                                <SegmentControl
                                    options={['daily', 'weekly', 'bi_monthly', 'monthly']}
                                    value={value} onChange={onChange}
                                    labels={['Daily', 'Weekly', 'Bi-Mo', 'Monthly']}
                                />
                            } />
                        </View>

                        {/* Deposit + Insurance */}
                        <View className="flex-row mb-4 gap-3">
                            <View className="flex-1">
                                <FormLabel>Deposit (₱)</FormLabel>
                                <Controller control={control} name="deposit" render={({ field: { onChange, value } }) =>
                                    <FormInput value={value} onChange={onChange} error={errors.deposit?.message} disabled={saving} keyboardType="numeric" placeholder="0" />
                                } />
                            </View>
                            <View className="flex-1">
                                <FormLabel>Insurance (₱)</FormLabel>
                                <Controller control={control} name="insurance" render={({ field: { onChange, value } }) =>
                                    <FormInput value={value} onChange={onChange} error={errors.insurance?.message} disabled={saving} keyboardType="numeric" placeholder="0" />
                                } />
                            </View>
                        </View>

                        {/* Live Calculation Preview */}
                        {calcResult && (
                            <View className="bg-blue-50 p-5 rounded-2xl border border-blue-100 mb-6">
                                <Text className="text-blue-500 text-xs font-black uppercase tracking-wider mb-3">Loan Preview</Text>
                                <View className="flex-row justify-between mb-2">
                                    <Text className="text-blue-700 font-semibold text-sm">Installment Amount</Text>
                                    <Text className="text-blue-900 font-black">{formatPHP(calcResult.installmentAmount)}</Text>
                                </View>
                                <View className="flex-row justify-between mb-2">
                                    <Text className="text-blue-700 font-semibold text-sm">Total to Pay</Text>
                                    <Text className="text-blue-900 font-black">{formatPHP(calcResult.totalAmount)}</Text>
                                </View>

                                {activeLoanBalance > 0 && watchedValues.isReloan && watchedValues.previousLoanId === activeLoan?.id && (
                                    <>
                                        <View className="flex-row justify-between mb-2">
                                            <Text className="text-amber-600 font-semibold text-sm">Previous Loan Balance</Text>
                                            <Text className="text-red-500 font-black">- {formatPHP(activeLoanBalance)}</Text>
                                        </View>
                                        <View className="h-px bg-blue-200 my-2" />
                                        <View className="flex-row justify-between mb-2">
                                            <Text className="text-blue-800 font-black text-sm">NET CASH RELEASED</Text>
                                            <Text className="text-blue-900 font-black text-lg">
                                                {formatPHP(LoanCalculatorService.calculateNetProceeds(
                                                    parseFloat(watchedValues.principal),
                                                    parseFloat(watchedValues.deposit),
                                                    parseFloat(watchedValues.insurance),
                                                    activeLoanBalance
                                                ))}
                                            </Text>
                                        </View>
                                    </>
                                )}

                                <View className="h-px bg-blue-200 my-2" />
                                <View className="flex-row justify-between">
                                    <Text className="text-blue-700 font-semibold text-sm">Maturity Date</Text>
                                    <Text className="text-blue-900 font-black">{format(calcResult.maturityDate, 'MMM d, yyyy')}</Text>
                                </View>
                            </View>
                        )}

                        <Pressable
                            className={`w-full py-4 rounded-2xl items-center flex-row justify-center ${saving ? 'bg-blue-300' : 'bg-blue-700 active:bg-blue-800'}`}
                            onPress={handleSubmit(onSubmit)}
                            disabled={saving}
                        >
                            {saving ? <ActivityIndicator color="#fff" /> : (
                                <>
                                    <MaterialIcons name="send" size={20} color="#fff" />
                                    <Text className="text-white font-black text-lg ml-2">Disburse Loan</Text>
                                </>
                            )}
                        </Pressable>
                    </View>
                </View>
            </ScrollView>

            <ConfirmDialog
                visible={showConfirmReloan}
                title="Confirm Renewal"
                message={`This will close the active loan (Balance: ${reloanConfirmInfo ? formatPHP(reloanConfirmInfo.balance) : ''}) and deduct it from the new loan.\n\nNet Cash Released: ${reloanConfirmInfo ? formatPHP(reloanConfirmInfo.net) : ''}`}
                confirmLabel="Proceed"
                cancelLabel="Cancel"
                isDestructive={false}
                onConfirm={() => {
                    setShowConfirmReloan(false);
                    if (pendingData) performSave(pendingData);
                }}
                onCancel={() => setShowConfirmReloan(false)}
            />

            <AuditReportDialog
                visible={showAudit}
                issues={auditIssues}
                isSaving={saving}
                onCancel={() => setShowAudit(false)}
                onConfirm={() => pendingData && performSave(pendingData)}
            />
        </SafeAreaView>
    );
}
