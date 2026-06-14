import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, ScrollView, Modal, Alert, Platform } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { database } from '../../../src/database';
import { Q } from '@nozbe/watermelondb';
import Loan from '../../../src/database/models/Loan';
import Borrower from '../../../src/database/models/Borrower';
import Payment from '../../../src/database/models/Payment';
import LoanPenalty from '../../../src/database/models/LoanPenalty';
import { MaterialIcons } from '@expo/vector-icons';
import { SearchBar } from '../../../src/components/SearchBar';
import { formatPHP } from '../../../src/utils/currency';
import SwipeableItem from '../../../src/components/SwipeableItem';
import ConfirmDialog from '../../../src/components/ConfirmDialog';
import BaseModelService from '../../../src/services/BaseModelService';
import { format } from 'date-fns';
import { PdfGenerator, VoucherPaperSize } from '../../../src/services/PdfGenerator';
import { DataTable, ColumnDef } from '../../../src/components/DataTable';
import { PaginationControls } from '../../../src/components/PaginationControls';
import { ViewToggle, ViewMode } from '../../../src/components/ViewToggle';

const PAPER_SIZE_OPTIONS: { label: string; value: VoucherPaperSize; description: string }[] = [
    { label: 'Letter', value: 'letter', description: '8.5 x 11 in' },
    { label: 'A4', value: 'a4', description: '210 x 297 mm' },
    { label: 'Legal', value: 'legal', description: '8.5 x 14 in' },
];

export type EnrichedLoan = Loan & { borrowerName: string, balance: number };

const MemoizedLoanItem = React.memo(({ item, onPress, onPressBorrower, onDelete, onActionsVisibilityChange }: { 
    item: EnrichedLoan, 
    onPress: () => void, 
    onPressBorrower: () => void, 
    onDelete: () => void, 
    onActionsVisibilityChange: (isVisible: boolean) => void 
}) => (
    <SwipeableItem onActionsVisibilityChange={onActionsVisibilityChange} onDelete={onDelete}>
        <Pressable
            className="bg-white p-4 rounded-2xl mb-3 border border-gray-100 shadow-sm active:opacity-70"
            onPress={onPress}
        >
            <View className="flex-row justify-between items-start mb-2">
                <View>
                    <Pressable onPress={onPressBorrower}>
                        <Text className="text-base font-bold text-blue-700 underline">{item.borrowerName}</Text>
                    </Pressable>
                    <View className="flex-row items-center mt-0.5">
                        <Text className="text-xs font-bold text-gray-700">{item.loanNumber}</Text>
                        {item.isReloan && (
                            <View className="ml-2 px-1.5 py-0.5 bg-blue-100 rounded-md">
                                <Text className="text-[8px] font-black uppercase text-blue-700">Renewal</Text>
                            </View>
                        )}
                    </View>
                    {!!item.releaseDate && (
                        <View className="flex-row items-center mt-1">
                            <MaterialIcons name="event" size={12} color="#9CA3AF" />
                            <Text className="text-[10px] text-gray-600 ml-1 font-medium">
                                Released: {format(new Date(item.releaseDate as any), 'MMM dd, yyyy')}
                            </Text>
                        </View>
                    )}
                </View>
                <View className={`px-2 py-1 rounded ${item.status === 'active' ? 'bg-blue-50' :
                    item.status === 'paid' ? 'bg-green-50' :
                        item.status === 'defaulted' ? 'bg-red-50' : 'bg-gray-100'
                    }`}>
                    <Text className={`text-[10px] font-black uppercase tracking-wider ${item.status === 'active' ? 'text-blue-800' :
                        item.status === 'paid' ? 'text-green-800' :
                            item.status === 'defaulted' ? 'text-red-800' : 'text-gray-800'
                        }`}>{item.status}</Text>
                </View>
            </View>

            <View className="h-px bg-gray-50 my-2" />

            <View className="flex-row justify-between items-center">
                <View className="flex-1">
                    <Text className="text-[10px] font-bold text-gray-700 uppercase tracking-widest">Principal</Text>
                    <Text className="text-sm font-extrabold text-emerald-700 mt-0.5">{formatPHP(item.principalAmount)}</Text>
                </View>
                <View className="flex-1 items-center">
                    <Text className="text-[10px] font-bold text-gray-700 uppercase tracking-widest">Insurance</Text>
                    <Text className="text-sm font-bold text-orange-600 mt-0.5">{formatPHP(item.insuranceAmount || 0)}</Text>
                </View>
                <View className="flex-1 items-end">
                    <Text className="text-[10px] font-bold text-gray-700 uppercase tracking-widest">Net Rel.</Text>
                    <Text className="text-sm font-extrabold text-green-700 mt-0.5">{formatPHP(item.principalAmount - (item.deductedAmount || 0) - (item.serviceChargeAmount || 0))}</Text>
                </View>
            </View>
            
            <View className="flex-row justify-between items-center mt-2">
                <View className="flex-1">
                    <Text className="text-[10px] font-bold text-gray-700 uppercase tracking-widest">Total Amnt</Text>
                    <Text className="text-sm font-extrabold text-gray-900 mt-0.5">{formatPHP(item.totalAmount)}</Text>
                </View>
                <View className="flex-1 items-center">
                    <Text className="text-[10px] font-bold text-gray-700 uppercase tracking-widest">Interest</Text>
                    <Text className="text-sm font-extrabold text-blue-700 mt-0.5">{formatPHP(item.interestAmount > 0 ? item.interestAmount : item.principalAmount * (item.interestRate / 100))}</Text>
                </View>
                <View className="flex-1 items-end">
                    <Text className="text-[10px] font-bold text-gray-700 uppercase tracking-widest">Balance</Text>
                    <Text className="text-sm font-extrabold text-[#D32F2F] mt-0.5">{formatPHP(item.balance)}</Text>
                </View>
            </View>
        </Pressable>
    </SwipeableItem>
));

export default function LoansListScreen() {
    const router = useRouter();
    const [loans, setLoans] = useState<EnrichedLoan[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [loading, setLoading] = useState(true);
    const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
    const [isConfirmDeleteVisible, setIsConfirmDeleteVisible] = useState(false);
    const [isPrintOptionsVisible, setIsPrintOptionsVisible] = useState(false);
    const [selectedPaperSize, setSelectedPaperSize] = useState<VoucherPaperSize>('letter');
    const [printing, setPrinting] = useState(false);
    const [visibleSwipeActionId, setVisibleSwipeActionId] = useState<string | null>(null);

    // Pagination & View Mode
    const [viewMode, setViewMode] = useState<ViewMode>('table');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    const [totalRecords, setTotalRecords] = useState(0);

    const loadData = async () => {
        setLoading(true);
        try {
            const conditions: Q.Clause[] = [Q.where('deleted_at', Q.eq(null))];
            
            if (filterStatus !== 'all') {
                conditions.push(Q.where('status', filterStatus));
            }

            if (searchQuery.trim()) {
                const safeSearch = Q.sanitizeLikeString(searchQuery);
                // Pre-fetch matching borrowers to work around Q.or not supporting Q.on
                const matchingBorrowers = await database.get<Borrower>('borrowers')
                    .query(Q.where('full_name', Q.like(`%${safeSearch}%`))).fetch();
                
                const borrowerIds = matchingBorrowers.map(b => b.id);
                
                conditions.push(
                    Q.or(
                        Q.where('loan_number', Q.like(`%${safeSearch}%`)),
                        Q.where('borrower_id', Q.oneOf(borrowerIds))
                    )
                );
            }

            const baseQuery = database.collections.get<Loan>('loans').query(...conditions);

            const count = await baseQuery.fetchCount();
            setTotalRecords(count);

            const maxPage = Math.max(1, Math.ceil(count / itemsPerPage));
            if (currentPage > maxPage) {
                setCurrentPage(maxPage);
                return;
            }

            const offset = (currentPage - 1) * itemsPerPage;
            const fetchedLoans = await baseQuery.extend(
                Q.sortBy('created_at', Q.desc),
                Q.skip(offset),
                Q.take(itemsPerPage)
            ).fetch();

            if (fetchedLoans.length > 0) {
                const borrowerIds = fetchedLoans.map(l => l.borrowerId).filter(Boolean);
                const fetchedBorrowers = await database.collections.get<Borrower>('borrowers')
                    .query(Q.where('id', Q.oneOf(borrowerIds))).fetch();
                
                const loanIds = fetchedLoans.map(l => l.id);
                const fetchedPayments = await database.collections.get<Payment>('payments')
                    .query(Q.where('loan_id', Q.oneOf(loanIds)), Q.where('deleted_at', Q.eq(null))).fetch();
                const fetchedPenalties = await database.collections.get<LoanPenalty>('loan_penalties')
                    .query(Q.where('loan_id', Q.oneOf(loanIds)), Q.where('deleted_at', Q.eq(null))).fetch();

                const borrowerMap: Record<string, string> = {};
                fetchedBorrowers.forEach(b => borrowerMap[b.id] = b.fullName);

                const paymentMap: Record<string, number> = {};
                fetchedPayments.forEach(p => { paymentMap[p.loanId] = (paymentMap[p.loanId] || 0) + (p.amount || 0); });

                const penaltyMap: Record<string, number> = {};
                fetchedPenalties.forEach(p => { penaltyMap[p.loanId] = (penaltyMap[p.loanId] || 0) + (p.amount || 0); });

                const enrichedLoans = fetchedLoans.map(l => {
                    const loanAny = l as any;
                    loanAny.borrowerName = l.borrowerId ? (borrowerMap[l.borrowerId] ?? 'Unknown') : 'Unknown';
                    
                    const totalPaid = paymentMap[l.id] || 0;
                    const penaltyTotal = penaltyMap[l.id] || 0;
                    const totalExpected = (l.totalAmount || 0) + penaltyTotal;
                    loanAny.balance = Math.max(0, totalExpected - totalPaid);
                    
                    return loanAny as EnrichedLoan;
                });

                setLoans(enrichedLoans);
            } else {
                setLoans([]);
            }

        } catch (error) {
            console.error('Failed to load loans:', error);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [currentPage, itemsPerPage, searchQuery, filterStatus])
    );

    const handleDelete = async () => {
        try {
            await BaseModelService.softDelete(selectedLoan!);
            setIsConfirmDeleteVisible(false);
            loadData();
            if (Platform.OS === 'web') {
                window.alert('Loan record and related payments moved to trash.');
            }
        } catch (error) {
            console.error('Failed to delete loan:', error);
            const msg = error instanceof Error ? error.message : "Could not delete loan.";
            Alert.alert("Error", msg);
        }
    };

    const handleBatchPrint = async () => {
        if (loans.length === 0) return;

        setPrinting(true);
        try {
            await PdfGenerator.generateVoucherBatch(
                loans.map((loan) => ({
                    borrower: { fullName: loan.borrowerName },
                    loan: {
                        loanNumber: loan.loanNumber,
                        principalAmount: loan.principalAmount,
                        interestRate: loan.interestRate,
                        interestType: loan.interestType,
                        term: loan.term,
                        termUnit: loan.termUnit,
                        frequency: loan.frequency,
                        installmentAmount: loan.installmentAmount,
                        totalAmount: loan.totalAmount,
                        status: loan.status,
                        deductedAmount: loan.deductedAmount,
                        serviceChargeAmount: loan.serviceChargeAmount,
                        loanBatch: loan.loanBatch,
                        isReloan: loan.isReloan,
                        releaseDate: loan.releaseDate ? new Date(loan.releaseDate as number | Date).getTime() : undefined,
                    },
                })),
                { paperSize: selectedPaperSize }
            );
            setIsPrintOptionsVisible(false);
        } catch (error) {
            console.error('Failed to print vouchers:', error);
            if (Platform.OS === 'web') {
                window.alert('Failed to print vouchers.');
            } else {
                Alert.alert('Error', 'Failed to print vouchers.');
            }
        } finally {
            setPrinting(false);
        }
    };

    const columns: ColumnDef<EnrichedLoan>[] = [
        {
            key: 'loanNumber',
            label: 'Loan #',
            width: 100,
            render: (l) => (
                <View>
                    <Text className="font-bold text-gray-900">{l.loanNumber}</Text>
                    {l.isReloan && <Text className="text-[8px] font-black uppercase text-blue-700 mt-0.5 bg-blue-100 self-start px-1 rounded">Renewal</Text>}
                </View>
            )
        },
        {
            key: 'borrowerName',
            label: 'Borrower Name',
            flex: 2,
            render: (l) => (
                <Pressable onPress={() => router.push(`/(admin)/borrowers/${l.borrowerId}`)}>
                    <Text className="text-sm text-blue-700 underline font-bold" numberOfLines={1}>{l.borrowerName}</Text>
                </Pressable>
            )
        },
        {
            key: 'status',
            label: 'Status',
            width: 80,
            align: 'center',
            render: (l) => (
                <View className={`px-2 py-1 rounded ${l.status === 'active' ? 'bg-blue-50' : l.status === 'paid' ? 'bg-green-50' : l.status === 'defaulted' ? 'bg-red-50' : 'bg-gray-100'}`}>
                    <Text className={`text-[9px] font-black uppercase tracking-wider ${l.status === 'active' ? 'text-blue-800' : l.status === 'paid' ? 'text-green-800' : l.status === 'defaulted' ? 'text-red-800' : 'text-gray-800'}`}>
                        {l.status}
                    </Text>
                </View>
            )
        },
        {
            key: 'principalAmount',
            label: 'Principal',
            flex: 1,
            align: 'right',
            render: (l) => <Text className="font-bold text-emerald-700">{formatPHP(l.principalAmount)}</Text>
        },
        {
            key: 'balance',
            label: 'Balance',
            flex: 1,
            align: 'right',
            render: (l) => <Text className="font-bold text-[#D32F2F]">{formatPHP(l.balance)}</Text>
        },
        {
            key: 'releaseDate',
            label: 'Released',
            width: 100,
            align: 'right',
            render: (l) => <Text className="text-xs text-gray-600">{l.releaseDate ? format(new Date(l.releaseDate as any), 'MMM dd, yyyy') : '-'}</Text>
        }
    ];

    const totalPages = Math.max(1, Math.ceil(totalRecords / itemsPerPage));

    return (
        <View className="flex-1 bg-gray-50 p-4">
            <View className="mb-2">
                <View className="flex-row items-center justify-between mb-2">
                    <View className="flex-1 mr-3">
                        <SearchBar
                            value={searchQuery}
                            onChangeText={(t) => { setSearchQuery(t); setCurrentPage(1); }}
                            placeholder="Search by loan # or borrower name..."
                        />
                    </View>
                    <ViewToggle mode={viewMode} onToggle={setViewMode} />
                </View>
            </View>

            <View className="mb-4 flex-row items-center">
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1">
                    {['all', 'pending', 'active', 'paid', 'defaulted'].map(status => (
                        <Pressable
                            key={status}
                            onPress={() => { setFilterStatus(status); setCurrentPage(1); }}
                            className={`px-4 py-2 rounded-full border mr-2 ${filterStatus === status ? 'bg-emerald-600 border-emerald-600' : 'bg-white border-gray-200'}`}
                        >
                            <Text className={`text-xs font-bold uppercase tracking-wider ${filterStatus === status ? 'text-white' : 'text-gray-700'}`}>
                                {status}
                            </Text>
                        </Pressable>
                    ))}
                </ScrollView>
                <Pressable
                    className={`ml-3 px-5 py-2.5 rounded-full flex-row items-center border ${loans.length === 0 ? 'bg-gray-100 border-gray-200' : 'bg-purple-700 border-purple-700'}`}
                    onPress={() => setIsPrintOptionsVisible(true)}
                    disabled={loans.length === 0}
                >
                    <MaterialIcons name="print" size={16} color={loans.length === 0 ? '#9CA3AF' : '#FFFFFF'} className="mr-2" />
                    <Text className={`text-xs font-black uppercase tracking-wider ${loans.length === 0 ? 'text-gray-400' : 'text-white'}`}>
                        Batch Print
                    </Text>
                </Pressable>
            </View>

            {loading && loans.length === 0 ? (
                <ActivityIndicator size="large" color="#D32F2F" className="mt-10" />
            ) : (
                <>
                    <View className="flex-1">
                        {viewMode === 'table' ? (
                            <DataTable 
                                columns={columns} 
                                data={loans} 
                                keyExtractor={(l) => l.id} 
                                onRowPress={(l) => router.push(`/(admin)/loans/${l.id}`)}
                                minWidth={700}
                            />
                        ) : (
                            <FlatList
                                data={loans}
                                keyExtractor={(item) => item.id}
                                removeClippedSubviews={true}
                                windowSize={5}
                                maxToRenderPerBatch={10}
                                initialNumToRender={10}
                                renderItem={({ item }) => (
                                    <MemoizedLoanItem
                                        item={item}
                                        onPress={() => router.push(`/(admin)/loans/${item.id}`)}
                                        onPressBorrower={() => router.push(`/(admin)/borrowers/${item.borrowerId}`)}
                                        onDelete={() => {
                                            setSelectedLoan(item);
                                            setIsConfirmDeleteVisible(true);
                                        }}
                                        onActionsVisibilityChange={(isVisible) => {
                                            setVisibleSwipeActionId((currentId) => isVisible ? item.id : currentId === item.id ? null : currentId);
                                        }}
                                    />
                                )}
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={{ paddingBottom: 20 }}
                                ListEmptyComponent={
                                    <View className="items-center justify-center py-20">
                                        <MaterialIcons name="money-off" size={64} color="#E5E7EB" />
                                        <Text className="text-gray-700 font-medium mt-4 text-base">No loans found</Text>
                                    </View>
                                }
                            />
                        )}
                    </View>
                    <PaginationControls 
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalRecords={totalRecords}
                        itemsPerPage={itemsPerPage}
                        onPageChange={setCurrentPage}
                        onItemsPerPageChange={(limit) => {
                            setItemsPerPage(limit);
                            setCurrentPage(1);
                        }}
                    />
                </>
            )}

            <ConfirmDialog
                visible={isConfirmDeleteVisible}
                title="Delete Loan"
                message={`Are you sure you want to delete Loan ${selectedLoan?.loanNumber}? This will also soft-delete all related payments and schedules. You can restore it from Trash.`}
                confirmLabel="Delete"
                onConfirm={handleDelete}
                onCancel={() => setIsConfirmDeleteVisible(false)}
                isDestructive={true}
            />

            <Modal visible={isPrintOptionsVisible} transparent animationType="fade" onRequestClose={() => setIsPrintOptionsVisible(false)}>
                <View className="flex-1 bg-black/40 justify-center px-6">
                    <View className="bg-white rounded-2xl p-5 border border-gray-100">
                        <View className="flex-row justify-between items-center mb-4">
                            <View>
                                <Text className="text-lg font-black text-gray-900">Batch Print Vouchers</Text>
                                <Text className="text-xs font-bold text-gray-500 mt-1">
                                    8 vouchers per page · {loans.length} selected (this page)
                                </Text>
                            </View>
                            <Pressable className="p-2 bg-gray-100 rounded-full" onPress={() => setIsPrintOptionsVisible(false)}>
                                <MaterialIcons name="close" size={18} color="#374151" />
                            </Pressable>
                        </View>

                        <Text className="text-xs font-bold text-gray-700 uppercase tracking-widest mb-2">Paper Size</Text>
                        {PAPER_SIZE_OPTIONS.map((option) => {
                            const selected = selectedPaperSize === option.value;
                            return (
                                <Pressable
                                    key={option.value}
                                    className={`p-4 rounded-xl border mb-2 flex-row items-center ${selected ? 'bg-purple-50 border-purple-300' : 'bg-gray-50 border-gray-100'}`}
                                    onPress={() => setSelectedPaperSize(option.value)}
                                >
                                    <MaterialIcons name={selected ? 'radio-button-checked' : 'radio-button-unchecked'} size={20} color={selected ? '#7E22CE' : '#9CA3AF'} className="mr-3" />
                                    <View className="flex-1">
                                        <Text className={`text-sm font-black ${selected ? 'text-purple-800' : 'text-gray-900'}`}>{option.label}</Text>
                                        <Text className="text-xs font-medium text-gray-500 mt-0.5">{option.description}</Text>
                                    </View>
                                </Pressable>
                            );
                        })}

                        <View className="flex-row justify-end mt-4">
                            <Pressable className="px-5 py-3 mr-2" onPress={() => setIsPrintOptionsVisible(false)} disabled={printing}>
                                <Text className="text-gray-700 font-bold">Cancel</Text>
                            </Pressable>
                            <Pressable
                                className={`px-5 py-3 rounded-xl flex-row items-center ${printing ? 'bg-gray-400' : 'bg-purple-700'}`}
                                onPress={handleBatchPrint}
                                disabled={printing}
                            >
                                {printing ? <ActivityIndicator color="#fff" size="small" /> : <MaterialIcons name="print" size={16} color="#fff" className="mr-2" />}
                                <Text className="text-white font-black ml-2">Print</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* FAB */}
            {!visibleSwipeActionId && (
                <Pressable
                    className={`${Platform.OS === 'web' ? 'absolute bottom-20 left-6' : 'absolute bottom-20 right-6'} w-14 h-14 bg-[#D32F2F] rounded-full items-center justify-center shadow-lg active:bg-red-800 z-50`}
                    onPress={() => router.push('/(admin)/loans/new')}
                >
                    <MaterialIcons name="add" size={28} color="#FFFFFF" />
                </Pressable>
            )}
        </View>
    );
}
