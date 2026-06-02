import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Linking } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { safeBack } from '../../../../src/utils/navigation';
import { database } from '../../../../src/database';
import Borrower from '../../../../src/database/models/Borrower';
import Loan from '../../../../src/database/models/Loan';
import Payment from '../../../../src/database/models/Payment';
import { Q } from '@nozbe/watermelondb';
import { MaterialIcons } from '@expo/vector-icons';
import { formatPHP } from '../../../../src/utils/currency';
import Collector from '../../../../src/database/models/Collector';
import { formatDate } from '../../../../src/utils/dates';
import { PdfGenerator } from '../../../../src/services/PdfGenerator';
import { LoanCalculatorService } from '../../../../src/services/LoanCalculatorService';
import ConfirmDialog from '../../../../src/components/ConfirmDialog';
import { Alert, Platform } from 'react-native';
import { BorrowerSearchBar } from '../../../../src/components/BorrowerSearchBar';
import { CalculationBasisCard } from '../../../../src/components/CalculationBasisCard';
import { sortLoansChronologically } from '../../../../src/utils/loanOrdering';
import { PaymentService } from '../../../../src/services/PaymentService';

function SpecItem({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
    return (
        <View className="w-1/2 mb-4 pr-2">
            <Text className="text-[10px] font-bold text-gray-700 uppercase tracking-widest mb-0.5">{label}</Text>
            <Text className={`text-sm font-black ${highlight ? 'text-[#D32F2F]' : 'text-gray-900'}`}>{value}</Text>
        </View>
    );
}

export default function ClientPassbookScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();

    const [borrower, setBorrower] = useState<Borrower | null>(null);
    const [loans, setLoans] = useState<Loan[]>([]);
    const [payments, setPayments] = useState<Payment[]>([]);
    const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [isConfirmDeletePaymentVisible, setIsConfirmDeletePaymentVisible] = useState(false);
    const [selectedPaymentToDelete, setSelectedPaymentToDelete] = useState<Payment | null>(null);
    const [saving, setSaving] = useState(false);
    const [collectorName, setCollectorName] = useState<string>('—');

    const loadData = async () => {
        try {
            const b = await database.collections.get<Borrower>('borrowers').find(id);
            const l = await database.collections.get<Loan>('loans').query(
                Q.where('borrower_id', id),
                Q.where('deleted_at', Q.eq(null)),
                Q.sortBy('created_at', Q.desc)
            ).fetch();
            const p = await database.collections.get<Payment>('payments').query(
                Q.where('loan_id', Q.oneOf(l.map(loan => loan.id))),
                Q.where('deleted_at', Q.eq(null)),
                Q.sortBy('payment_date', Q.asc)
            ).fetch();

            const orderedLoans = sortLoansChronologically(l);

            let cName = '—';
            if (b.collectorId) {
                try {
                    const c = await database.collections.get<Collector>('collectors').find(b.collectorId);
                    if (c) cName = c.fullName;
                } catch (e) {
                    // Ignore if collector not found
                }
            }
            setCollectorName(cName);

            setBorrower(b);
            setLoans(orderedLoans);
            setPayments(p);

            if (orderedLoans.length > 0 && !selectedLoanId) {
                const activeLoan = orderedLoans.find(loan => loan.status === 'active') || orderedLoans[0];
                setSelectedLoanId(activeLoan.id);
            }
        } catch (error) {
            console.error('Passbook load error:', error);
            safeBack(router, '/(admin)');
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        React.useCallback(() => {
            loadData();
        }, [id])
    );

    const confirmDeletePayment = async () => {
        if (!selectedPaymentToDelete) return;
        setSaving(true);
        setIsConfirmDeletePaymentVisible(false);
        try {
            await PaymentService.softDeletePayment(selectedPaymentToDelete.id);
            await loadData();
            if (Platform.OS === 'web') {
                window.alert("Payment record moved to trash.");
            }
        } catch (e: any) {
            console.error('Failed to delete payment', e);
            Alert.alert("Error", "Could not delete payment.");
        } finally {
            setSaving(false);
            setSelectedPaymentToDelete(null);
        }
    };

    if (loading || !borrower) {
        return <ActivityIndicator size="large" color="#D32F2F" className="flex-1 bg-gray-50" style={{ paddingTop: 100 }} />;
    }

    const selectedLoan = loans.find(l => l.id === selectedLoanId);
    const loanPayments = selectedLoan ? payments.filter(p => p.loanId === selectedLoan.id) : [];

    const totalPaid = loanPayments.reduce((s, p) => s + p.amount, 0);

    const depositAmount = selectedLoan?.depositAmount || 0;
    const insuranceAmount = selectedLoan?.insuranceAmount || 0;
    
    const expectedPrincipal = selectedLoan?.principalAmount || 0;
    const expectedInterest = selectedLoan?.interestAmount > 0 ? selectedLoan.interestAmount : expectedPrincipal * ((selectedLoan?.interestRate || 0) / 100);
    const expectedTotal = expectedPrincipal + expectedInterest + depositAmount + insuranceAmount;
    const principalRatio = expectedTotal > 0 ? expectedPrincipal / expectedTotal : 0;
    const savingsRatio = expectedTotal > 0 ? depositAmount / expectedTotal : 0;
    const insuranceRatio = expectedTotal > 0 ? insuranceAmount / expectedTotal : 0;
    
    const accumulatedPrincipal = totalPaid * principalRatio;
    const grossTotalLoan = selectedLoan?.totalAmount || 1;
    const grossBalance = Math.max(0, grossTotalLoan - totalPaid);

    const netLoanReleased = selectedLoan ? selectedLoan.principalAmount - (selectedLoan.deductedAmount || 0) : 0;
    const numTerms = selectedLoan ? LoanCalculatorService.paymentsForFrequency(selectedLoan.term, selectedLoan.termUnit, selectedLoan.frequency) : 1;

    const periodicDeposit = depositAmount;
    const periodicInsurance = insuranceAmount;
    const expectedInstallment = selectedLoan?.installmentAmount || 1;

    let accumulatedSavings = 0;
    let accumulatedInsurance = 0;

    // Process Ledger with Gross Method
    let currentBalance = grossTotalLoan;
    const ledgerRows = [...loanPayments]
        .sort((a, b) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime())
        .map(p => {
            const paymentRatio = p.amount / expectedInstallment;
            const pSavings = paymentRatio * periodicDeposit;
            const pInsurance = paymentRatio * periodicInsurance;
            
            accumulatedSavings += pSavings;
            accumulatedInsurance += pInsurance;
            
            currentBalance -= p.amount;
            return {
                id: p.id,
                paymentDate: p.paymentDate,
                amount: p.amount,
                pLoan: p.amount,
                pSavings,
                pInsurance,
                runningBalance: Math.max(0, currentBalance)
            };
        })
        .reverse();

    const handlePrint = async () => {
        if (!selectedLoan || !borrower) return;

        try {
            await PdfGenerator.generateStatementOfAccount(
                {
                    fullName: borrower.fullName,
                    address: borrower.decryptedAddress || undefined,
                    phone: borrower.decryptedPhone || undefined, 
                    dateOfBirth: borrower.dateOfBirth,
                    gender: borrower.gender || undefined,
                },
                {
                    loanNumber: selectedLoan.loanNumber,
                    principalAmount: selectedLoan.principalAmount,
                    interestRate: selectedLoan.interestRate,
                    interestType: selectedLoan.interestType,
                    term: selectedLoan.term,
                    termUnit: selectedLoan.termUnit,
                    frequency: selectedLoan.frequency,
                    installmentAmount: selectedLoan.installmentAmount,
                    totalAmount: selectedLoan.totalAmount,
                    status: selectedLoan.status,
                    releaseDate: selectedLoan.releaseDate as number,
                    maturityDate: selectedLoan.maturityDate as number,
                },
                loanPayments.map(p => {
                    let rb = selectedLoan.totalAmount;
                    for (const past of loanPayments) {
                        rb -= past.amount;
                        if (past.id === p.id) break;
                    }
                    return {
                        paymentDate: p.paymentDate,
                        amount: p.amount,
                        pSavings: p.amount * savingsRatio,
                        pInsurance: p.amount * insuranceRatio,
                        receiptNumber: p.receiptNumber || undefined,
                        notes: p.notes || undefined,
                        runningBalance: Math.max(0, rb)
                    };
                })
            );
        } catch (e) {
            console.error('Generate PDF failed:', e);
            alert('Failed to generate PDF.');
        }
    };

    const handlePrintVoucher = async () => {
        if (!selectedLoan || !borrower) return;
        try {
            await PdfGenerator.generateVoucher(
                { fullName: borrower.fullName },
                {
                    loanNumber: selectedLoan.loanNumber,
                    principalAmount: selectedLoan.principalAmount,
                    interestRate: selectedLoan.interestRate,
                    interestType: selectedLoan.interestType,
                    term: selectedLoan.term,
                    termUnit: selectedLoan.termUnit,
                    frequency: selectedLoan.frequency,
                    installmentAmount: selectedLoan.installmentAmount,
                    totalAmount: selectedLoan.totalAmount,
                    status: selectedLoan.status,
                    deductedAmount: selectedLoan.deductedAmount,
                    loanBatch: selectedLoan.loanBatch,
                    isReloan: selectedLoan.isReloan,
                    releaseDate: selectedLoan.releaseDate ? new Date(selectedLoan.releaseDate as number | Date).getTime() : undefined,
                }
            );
        } catch (error) {
            console.error('Failed to generate voucher', error);
            if (Platform.OS === 'web') {
                window.alert('Failed to generate voucher.');
            } else {
                Alert.alert('Error', 'Failed to generate voucher.');
            }
        }
    };

    return (
        <View className="flex-1 bg-gray-50">
            <ScrollView contentContainerStyle={{ padding: 16 }}>
                <BorrowerSearchBar currentBorrowerId={id} placeholder="Jump to another borrower..." />
                {/* Header Info Card */}
                <View className="bg-primary p-6 rounded-3xl shadow-md mb-6 relative overflow-hidden">
                    <View className="absolute -right-10 -top-10 bg-white/10 w-40 h-40 rounded-full" />
                    <View className="absolute -left-10 -bottom-10 bg-white/5 w-32 h-32 rounded-full" />

                    <View className="flex-row items-center mb-4">
                        <View className="w-14 h-14 bg-white/20 rounded-full items-center justify-center mr-4 border border-white/30">
                            <Text className="text-white font-black text-2xl">{borrower.fullName.charAt(0)}</Text>
                        </View>
                        <View className="flex-1">
                            <Text className="text-2xl font-extrabold text-white mb-1" numberOfLines={1}>{borrower.fullName}</Text>
                            {!!borrower.phone && (
                                <Pressable className="flex-row items-center bg-white/10 px-3 py-1.5 rounded-full self-start" onPress={() => Linking.openURL(`tel:${borrower.phone}`)}>
                                    <MaterialIcons name="phone" size={14} color="#FFF" className="mr-1.5" />
                                    <Text className="text-white font-bold text-xs tracking-wider">{borrower.decryptedPhone}</Text>
                                </Pressable>
                            )}
                        </View>
                    </View>

                    {!!borrower.address && (
                        <View className="flex-row items-start mt-2 bg-white/10 p-3 rounded-xl">
                            <MaterialIcons name="location-on" size={16} color="#FFF" className="mr-2 mt-0.5" />
                            <Text className="text-white/90 text-sm flex-1">{borrower.decryptedAddress}</Text>
                        </View>
                    )}

                    <View className="flex-row flex-wrap mt-3 gap-2">
                        {!!borrower.group && (
                            <View className="flex-row items-center bg-white/20 px-2 py-1.5 rounded-md">
                                <MaterialIcons name="groups" size={14} color="#FFF" className="mr-1" />
                                <Text className="text-white text-xs font-bold">{borrower.group}</Text>
                            </View>
                        )}
                        {!!borrower.business && (
                            <View className="flex-row items-center bg-white/20 px-2 py-1.5 rounded-md">
                                <MaterialIcons name="store" size={14} color="#FFF" className="mr-1" />
                                <Text className="text-white text-xs font-bold">{borrower.business}</Text>
                            </View>
                        )}
                        {collectorName !== '—' && (
                            <View className="flex-row items-center bg-white/20 px-2 py-1.5 rounded-md">
                                <MaterialIcons name="person-pin" size={14} color="#FFF" className="mr-1" />
                                <Text className="text-white text-xs font-bold">{collectorName}</Text>
                            </View>
                        )}
                    </View>
                </View>

                {/* Loan Selector (if multiple) */}
                {loans.length > 1 && (
                    <View className="mb-6">
                        <Text className="text-xs font-bold text-gray-700 uppercase tracking-widest mb-3">Select Loan Timeline</Text>
                        <View className="flex-row flex-wrap">
                            {loans.map(loan => (
                                <Pressable
                                    key={loan.id}
                                    onPress={() => setSelectedLoanId(loan.id)}
                                    className={`px-5 py-3 rounded-2xl border mr-3 mb-3 flex-row items-center ${selectedLoanId === loan.id ? 'bg-[#D32F2F] border-red-700' : 'bg-white border-gray-200'}`}
                                >
                                    <MaterialIcons name={loan.status === 'active' ? 'play-circle-outline' : 'check-circle'} size={18} color={selectedLoanId === loan.id ? '#FFF' : '#6B7280'} className="mr-2" />
                                    <View>
                                        <View className="flex-row items-center">
                                            <Text className={`font-extrabold ${selectedLoanId === loan.id ? 'text-white' : 'text-gray-900'}`}>{loan.loanNumber}</Text>
                                            {loan.isReloan && (
                                                <View className={`ml-2 px-1.5 py-0.5 rounded-md ${selectedLoanId === loan.id ? 'bg-white/20' : 'bg-blue-100'}`}>
                                                    <Text className={`text-[8px] font-black uppercase ${selectedLoanId === loan.id ? 'text-white' : 'text-blue-700'}`}>Renewal</Text>
                                                </View>
                                            )}
                                        </View>
                                        <View className="flex-row justify-between items-center mt-0.5">
                                            <Text className={`text-[10px] font-bold uppercase ${selectedLoanId === loan.id ? 'text-white/80' : 'text-gray-700'}`}>{loan.status}</Text>
                                            <Text className={`text-[8px] font-bold ml-4 ${selectedLoanId === loan.id ? 'text-white/60' : 'text-gray-500'}`}>
                                                {loan.releaseDate ? formatDate(new Date(loan.releaseDate)) : '—'}
                                            </Text>
                                        </View>
                                    </View>
                                </Pressable>
                            ))}
                        </View>
                    </View>
                )}

                {/* Loan Summary */}
                {selectedLoan ? (
                    <View>
                        <View className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 mb-6 relative overflow-hidden">
                            <View className={`absolute top-0 right-0 px-4 py-1.5 rounded-bl-xl ${selectedLoan.status === 'active' ? 'bg-blue-100' :
                                selectedLoan.status === 'paid' ? 'bg-green-100' :
                                    selectedLoan.status === 'defaulted' ? 'bg-red-100' : 'bg-gray-100'
                                }`}>
                                <Text className={`text-xs font-black uppercase tracking-wider ${selectedLoan.status === 'active' ? 'text-blue-800' :
                                    selectedLoan.status === 'paid' ? 'text-green-800' :
                                        selectedLoan.status === 'defaulted' ? 'text-red-800' : 'text-gray-800'
                                    }`}>{selectedLoan.status}</Text>
                            </View>

                            <Text className="text-xs font-bold text-gray-700 uppercase tracking-widest mb-1 mt-2">Loan Balance</Text>
                            <Text className="text-4xl font-black text-gray-900 mb-2 tracking-tighter">{formatPHP(grossBalance)}</Text>

                            {selectedLoan.isReloan && (
                                <View className="flex-row items-center bg-blue-50 self-start px-2 py-1 rounded-lg mb-4">
                                    <MaterialIcons name="loop" size={14} color="#1D4ED8" className="mr-1.5" />
                                    <Text className="text-[10px] font-bold text-blue-700 uppercase">
                                        Renewal of {loans.find(l => l.id === selectedLoan.previousLoanId)?.loanNumber || 'Previous Loan'}
                                    </Text>
                                </View>
                            )}

                            <View className="flex-row border-t border-gray-100 pt-5">
                                <View className="flex-1 items-center border-r border-gray-100">
                                    <Text className="text-[10px] font-bold text-gray-700 uppercase tracking-widest mb-1 text-center">Loan Amount (Principal)</Text>
                                    <Text className="text-base font-extrabold text-primary">{formatPHP(selectedLoan.principalAmount)}</Text>
                                </View>
                                <View className="flex-1 items-center border-r border-gray-100">
                                    <Text className="text-[10px] font-bold text-gray-700 uppercase tracking-widest mb-1 text-center">Total Loan (P+I)</Text>
                                    <Text className="text-base font-extrabold text-blue-600">{formatPHP(grossTotalLoan)}</Text>
                                </View>
                                <View className="flex-1 items-center border-r border-gray-100">
                                    <Text className="text-[10px] font-bold text-gray-700 uppercase tracking-widest mb-1 text-center">Total Paid</Text>
                                    <Text className="text-base font-extrabold text-[#388E3C]">{formatPHP(totalPaid)}</Text>
                                </View>
                                <View className="flex-1 items-center">
                                    <Text className="text-[10px] font-bold text-gray-700 uppercase tracking-widest mb-1 text-center">Total Savings</Text>
                                    <Text className="text-base font-extrabold text-orange-600">{formatPHP(accumulatedSavings)}</Text>
                                </View>
                            </View>

                            <View className="flex-row border-t border-gray-100 pt-4 mt-4">
                                <View className="flex-1 items-center border-r border-gray-100">
                                    <Text className="text-[10px] font-bold text-gray-700 uppercase tracking-widest mb-1 text-center">Prin. Paid</Text>
                                    <Text className="text-base font-extrabold text-gray-900">{formatPHP(accumulatedPrincipal)}</Text>
                                </View>
                                <View className="flex-1 items-center border-r border-gray-100">
                                    <Text className="text-[10px] font-bold text-gray-700 uppercase tracking-widest mb-1 text-center">Total Insurance</Text>
                                    <Text className="text-base font-extrabold text-indigo-600">{formatPHP(accumulatedInsurance)}</Text>
                                </View>
                                <View className="flex-[2] items-center">
                                    <Text className="text-[10px] font-bold text-gray-700 uppercase tracking-widest mb-1 text-center">Remaining Balance</Text>
                                    <Text className="text-base font-extrabold text-gray-900">{formatPHP(grossBalance)}</Text>
                                </View>
                            </View>

                            {(selectedLoan.isReloan || (selectedLoan.deductedAmount || 0) > 0) && (
                                <View className="flex-row border-t border-gray-100 pt-4 mt-4">
                                    <View className="flex-1 items-center border-r border-gray-100">
                                        <Text className="text-[10px] font-bold text-red-700 uppercase tracking-widest mb-1 text-center">Upfront Deduction (Prev. Bal)</Text>
                                        <Text className="text-base font-extrabold text-red-600">-{formatPHP(selectedLoan.deductedAmount || 0)}</Text>
                                    </View>
                                    <View className="flex-1 items-center">
                                        <Text className="text-[10px] font-bold text-green-700 uppercase tracking-widest mb-1 text-center">Net Loan Release</Text>
                                        <Text className="text-base font-extrabold text-green-600">{formatPHP(netLoanReleased)}</Text>
                                    </View>
                                </View>
                            )}

                            <View className="flex-row mt-6 gap-2">
                                <Pressable
                                    className="flex-1 flex-row items-center justify-center p-3 bg-gray-50 rounded-xl"
                                    onPress={handlePrint}
                                >
                                    <MaterialIcons name="picture-as-pdf" size={20} color="#D32F2F" className="mr-2" />
                                    <Text className="text-[#D32F2F] font-bold uppercase tracking-wider text-xs">Statement</Text>
                                </Pressable>
                                <Pressable
                                    className="flex-1 flex-row items-center justify-center p-3 bg-purple-50 rounded-xl border border-purple-100"
                                    onPress={handlePrintVoucher}
                                >
                                    <MaterialIcons name="print" size={20} color="#7E22CE" className="mr-2" />
                                    <Text className="text-purple-700 font-bold uppercase tracking-wider text-xs">Voucher</Text>
                                </Pressable>
                            </View>
                        </View>

                        {/* Loan Specifications Section */}
                        <View className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 mb-6">
                            <Text className="text-xs font-bold text-gray-700 uppercase tracking-widest mb-4">Loan Specifications</Text>
                            
                            <View className="flex-row flex-wrap">
                                <SpecItem label="Batch" value={selectedLoan.loanBatch?.toString() || '—'} />
                                <SpecItem label="Cycle" value={selectedLoan.loanCycle?.toString() || '—'} />
                                <SpecItem label="Date Released" value={selectedLoan.releaseDate ? formatDate(new Date(selectedLoan.releaseDate)) : '—'} />
                                <SpecItem label="Maturity Date" value={selectedLoan.maturityDate ? formatDate(new Date(selectedLoan.maturityDate)) : '—'} />
                                <SpecItem label="Term" value={`${selectedLoan.term} ${selectedLoan.termUnit.charAt(0).toUpperCase() + selectedLoan.termUnit.slice(1)}`} />
                                <SpecItem label="Loan Amount (Principal)" value={formatPHP(selectedLoan.principalAmount)} />
                                <SpecItem label={`${selectedLoan.frequency.charAt(0).toUpperCase() + selectedLoan.frequency.slice(1).replace('_', ' ')} Collection`} value={formatPHP(selectedLoan.installmentAmount)} />
                                <SpecItem label="Interest Rate" value={`${selectedLoan.interestRate}%`} />
                                <SpecItem label="Interest Amount" value={formatPHP(selectedLoan.interestAmount > 0 ? selectedLoan.interestAmount : selectedLoan.principalAmount * (selectedLoan.interestRate / 100))} />
                                <SpecItem label="Insurance Portion" value={formatPHP(selectedLoan.insuranceAmount || 0)} />
                                <SpecItem label="Savings Portion" value={formatPHP(selectedLoan.depositAmount || 0)} />
                                <SpecItem label="Net Loan Released" value={formatPHP(netLoanReleased)} highlight />
                            </View>

                            {selectedLoan.deductedAmount > 0 && (
                                <View className="mt-4 p-3 bg-red-50 rounded-xl border border-red-100 flex-row justify-between items-center">
                                    <View className="flex-row items-center">
                                        <MaterialIcons name="history" size={16} color="#D32F2F" className="mr-2" />
                                        <Text className="text-[10px] font-bold text-red-700 uppercase">Upfront Deductions</Text>
                                    </View>
                                    <Text className="text-sm font-black text-red-700">{formatPHP(selectedLoan.deductedAmount)}</Text>
                                </View>
                            )}
                        </View>

                        <CalculationBasisCard 
                            interestType={selectedLoan.interestType} 
                            title="Payment Distribution Logic" 
                            principalAmount={selectedLoan.principalAmount}
                            interestRate={selectedLoan.interestRate}
                            interestAmount={selectedLoan.interestAmount > 0 ? selectedLoan.interestAmount : selectedLoan.principalAmount * (selectedLoan.interestRate / 100)}
                            totalAmount={selectedLoan.totalAmount}
                            depositAmount={selectedLoan.depositAmount || 0}
                            insuranceAmount={selectedLoan.insuranceAmount || 0}
                            installmentAmount={selectedLoan.installmentAmount}
                            numPayments={numTerms}
                            deductedAmount={selectedLoan.deductedAmount || 0}
                        />
                    </View>
                ) : (
                    <View className="bg-white rounded-2xl p-8 mb-6 border border-gray-100 items-center justify-center">
                        <MaterialIcons name="money-off" size={48} color="#D1D5DB" />
                        <Text className="text-gray-700 font-bold mt-4">No loans found for this borrower.</Text>
                    </View>
                )}

                {/* Ledger */}
                {selectedLoan && (
                    <View className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 mb-20">
                        <Text className="text-lg font-extrabold text-gray-900 mb-6">Payment Ledger</Text>

                        <View className="flex-row border-b-2 border-gray-100 pb-3 mb-2">
                            <Text className="flex-1 text-xs font-bold text-gray-700 uppercase tracking-widest">Date</Text>
                            <Text className="flex-[1.2] text-xs font-bold text-gray-700 uppercase tracking-widest text-right">Amount</Text>
                            <Text className="flex-1 text-xs font-bold text-gray-700 uppercase tracking-widest text-right">Savings</Text>
                            <Text className="flex-1 text-xs font-bold text-gray-700 uppercase tracking-widest text-right">Insurance</Text>
                            <Text className="flex-[1.2] text-xs font-bold text-gray-700 uppercase tracking-widest text-right">Balance</Text>
                            <View className="w-8 ml-2"></View>
                        </View>

                        {ledgerRows.length === 0 ? (
                            <Text className="text-center text-gray-700 py-8 font-medium">No payments recorded</Text>
                        ) : (
                            ledgerRows.map((row, idx) => (
                                <View key={row.id} className={`flex-row items-center py-4 ${idx < ledgerRows.length - 1 ? 'border-b border-gray-50' : ''}`}>
                                    <View className="flex-1 flex-row items-center">
                                        <View className="w-2 h-2 rounded-full bg-green-500 mr-2" />
                                        <Text className="text-sm font-bold text-gray-900">{formatDate(new Date(row.paymentDate))}</Text>
                                    </View>
                                    <Text className="flex-[1.2] text-sm font-extrabold text-[#388E3C] text-right">+{formatPHP(row.amount)}</Text>
                                    <Text className="flex-1 text-sm font-bold text-orange-600 text-right">{formatPHP(row.pSavings)}</Text>
                                    <Text className="flex-1 text-sm font-bold text-indigo-600 text-right">{formatPHP(row.pInsurance)}</Text>
                                    <View className="flex-[1.2] items-end justify-center">
                                        <Text className="text-sm font-bold text-gray-900">{formatPHP(row.runningBalance)}</Text>
                                    </View>
                                    <Pressable 
                                        onPress={() => {
                                            const p = loanPayments.find(lp => lp.id === row.id);
                                            if (p) {
                                                setSelectedPaymentToDelete(p);
                                                setIsConfirmDeletePaymentVisible(true);
                                            }
                                        }}
                                        className="w-8 ml-2 p-1 bg-red-50 rounded-lg active:bg-red-100 items-center justify-center"
                                    >
                                        <MaterialIcons name="delete-outline" size={16} color="#DC2626" />
                                    </Pressable>
                                </View>
                            ))
                        )}

                        {/* Initial Loan Disbursement Row */}
                        <View className="flex-row items-center py-4 border-t-2 border-dashed border-gray-100 mt-2 bg-gray-50 -mx-6 px-6">
                            <View className="flex-1 flex-row items-center">
                                <View className="w-2 h-2 rounded-full bg-blue-500 mr-2" />
                                <Text className="text-sm font-bold text-gray-900">
                                    {selectedLoan.releaseDate ? formatDate(new Date(selectedLoan.releaseDate)) : 'Disbursement'}
                                </Text>
                            </View>
                            <Text className="flex-[1.2] text-sm font-extrabold text-primary text-right">Loan Issued</Text>
                            <Text className="flex-1 text-sm font-bold text-gray-700 text-right">—</Text>
                            <Text className="flex-1 text-sm font-bold text-gray-700 text-right">—</Text>
                            <View className="flex-[1.2] items-end justify-center">
                                <Text className="text-sm font-extrabold text-gray-900">{formatPHP(grossTotalLoan)}</Text>
                            </View>
                            <View className="w-8 ml-2"></View>
                        </View>
                    </View>
                )}
            </ScrollView>

            {/* FAB to Add Payment */}
            {selectedLoan && selectedLoan.status !== 'paid' && (
                <Pressable
                    className="absolute bottom-6 right-6 flex-row items-center bg-[#D32F2F] px-6 py-4 rounded-full shadow-xl active:bg-red-800"
                    onPress={() => router.push(`/(admin)/payments/new?loanId=${selectedLoan.id}`)}
                >
                    <MaterialIcons name="add" size={24} color="#FFFFFF" className="mr-2" />
                    <Text className="text-white font-black uppercase tracking-wider">Record Payment</Text>
                </Pressable>
            )}

            <ConfirmDialog
                visible={isConfirmDeletePaymentVisible}
                title="Delete Payment Record?"
                message={`Are you sure you want to delete this payment of ${selectedPaymentToDelete ? formatPHP(selectedPaymentToDelete.amount) : ''}? This will update the loan balance and can be restored from Trash.`}
                confirmLabel="Delete"
                onConfirm={confirmDeletePayment}
                onCancel={() => {
                    setIsConfirmDeletePaymentVisible(false);
                    setSelectedPaymentToDelete(null);
                }}
                isDestructive
            />
        </View>
    );
}
