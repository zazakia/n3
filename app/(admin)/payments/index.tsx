import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, Alert, Platform } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { database } from '../../../src/database';
import { Q } from '@nozbe/watermelondb';
import Payment from '../../../src/database/models/Payment';
import Loan from '../../../src/database/models/Loan';
import Borrower from '../../../src/database/models/Borrower';
import { MaterialIcons } from '@expo/vector-icons';
import { SearchBar } from '../../../src/components/SearchBar';
import { formatPHP } from '../../../src/utils/currency';
import { formatDate } from '../../../src/utils/dates';
import SwipeableItem from '../../../src/components/SwipeableItem';
import ConfirmDialog from '../../../src/components/ConfirmDialog';
import BaseModelService from '../../../src/services/BaseModelService';
import { DataTable, ColumnDef } from '../../../src/components/DataTable';
import { PaginationControls } from '../../../src/components/PaginationControls';
import { ViewToggle, ViewMode } from '../../../src/components/ViewToggle';
import { format } from 'date-fns';

type EnrichedPayment = {
    payment: Payment;
    borrowerName: string;
    loanNumber: string;
    borrowerId?: string;
};

const MemoizedPaymentItem = React.memo(({ item, onPressBorrower, onEdit, onDelete, onActionsVisibilityChange }: {
    item: EnrichedPayment,
    onPressBorrower: () => void,
    onEdit: () => void,
    onDelete: () => void,
    onActionsVisibilityChange: (isVisible: boolean) => void
}) => (
    <SwipeableItem onActionsVisibilityChange={onActionsVisibilityChange} onEdit={onEdit} onDelete={onDelete}>
        <View className="bg-white p-4 rounded-2xl mb-3 border border-gray-100 shadow-sm flex-row items-center">
            <View className="w-12 h-12 rounded-full bg-green-50 items-center justify-center mr-4">
                <MaterialIcons name="done" size={24} color="#388E3C" />
            </View>
            <View className="flex-1">
                <Pressable onPress={onPressBorrower}>
                    <Text className="text-base font-bold text-blue-700 underline">{item.borrowerName}</Text>
                </Pressable>
                <Text className="text-xs text-gray-700 mt-0.5">{item.loanNumber} • {formatDate(new Date(item.payment.paymentDate))}</Text>
                {item.payment.receiptNumber ? (
                    <Text className="text-[10px] font-bold text-gray-700 mt-1 uppercase tracking-widest">RCT: {item.payment.receiptNumber}</Text>
                ) : null}
            </View>
            <View className="items-end pl-2">
                <Text className="text-sm font-extrabold text-[#388E3C]">{formatPHP(item.payment.amount)}</Text>
                <Pressable
                    testID={`edit-payment-${item.payment.id}`}
                    onPress={onEdit}
                    className="mt-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-100"
                >
                    <Text className="text-[10px] font-black text-blue-700 uppercase">Edit</Text>
                </Pressable>
            </View>
        </View>
    </SwipeableItem>
));

export default function PaymentsListScreen() {
    const router = useRouter();
    const [payments, setPayments] = useState<EnrichedPayment[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [selectedPayment, setSelectedPayment] = useState<EnrichedPayment | null>(null);
    const [isConfirmDeleteVisible, setIsConfirmDeleteVisible] = useState(false);
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

            if (searchQuery.trim()) {
                const safeSearch = Q.sanitizeLikeString(searchQuery);
                
                // Fetch matching loans
                const matchingLoans = await database.get<Loan>('loans').query(Q.where('loan_number', Q.like(`%${safeSearch}%`))).fetch();
                const loanIdsFromLoanNumber = matchingLoans.map(l => l.id);
                
                // Fetch matching borrowers
                const matchingBorrowers = await database.get<Borrower>('borrowers').query(Q.where('full_name', Q.like(`%${safeSearch}%`))).fetch();
                const borrowerIds = matchingBorrowers.map(b => b.id);
                
                let loanIdsFromBorrowers: string[] = [];
                if (borrowerIds.length > 0) {
                    const loansFromBorrowers = await database.get<Loan>('loans').query(Q.where('borrower_id', Q.oneOf(borrowerIds))).fetch();
                    loanIdsFromBorrowers = loansFromBorrowers.map(l => l.id);
                }
                
                const allMatchingLoanIds = Array.from(new Set([...loanIdsFromLoanNumber, ...loanIdsFromBorrowers]));
                
                // If it looks like a number, maybe it's a receipt search, else maybe just name
                conditions.push(
                    Q.or(
                        Q.where('receipt_number', Q.like(`%${safeSearch}%`)),
                        Q.where('loan_id', Q.oneOf(allMatchingLoanIds))
                    )
                );
            }

            const baseQuery = database.collections.get<Payment>('payments').query(...conditions);

            const count = await baseQuery.fetchCount();
            setTotalRecords(count);

            const maxPage = Math.max(1, Math.ceil(count / itemsPerPage));
            if (currentPage > maxPage) {
                setCurrentPage(maxPage);
                return;
            }

            const offset = (currentPage - 1) * itemsPerPage;
            const fetchedPayments = await baseQuery.extend(
                Q.sortBy('payment_date', Q.desc),
                Q.skip(offset),
                Q.take(itemsPerPage)
            ).fetch();

            if (fetchedPayments.length > 0) {
                const loanIds = Array.from(new Set(fetchedPayments.map(p => p.loanId)));
                const fetchedLoans = await database.collections.get<Loan>('loans').query(Q.where('id', Q.oneOf(loanIds))).fetch();
                
                const borrowerIds = Array.from(new Set(fetchedLoans.map(l => l.borrowerId).filter(Boolean)));
                const fetchedBorrowers = await database.collections.get<Borrower>('borrowers').query(Q.where('id', Q.oneOf(borrowerIds))).fetch();

                const loanMap = new Map<string, Loan>();
                fetchedLoans.forEach(l => loanMap.set(l.id, l));

                const borrowerMap = new Map<string, string>();
                fetchedBorrowers.forEach(b => borrowerMap.set(b.id, b.fullName));

                const enriched: EnrichedPayment[] = fetchedPayments.map(p => {
                    const loan = loanMap.get(p.loanId);
                    const borrowerName = loan && loan.borrowerId ? (borrowerMap.get(loan.borrowerId) ?? 'Unknown') : 'Unknown';
                    return {
                        payment: p,
                        borrowerName,
                        loanNumber: loan?.loanNumber ?? 'Unknown',
                        borrowerId: loan?.borrowerId
                    };
                });

                setPayments(enriched);
            } else {
                setPayments([]);
            }

        } catch (error) {
            console.error('Failed to load payments:', error);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [currentPage, itemsPerPage, searchQuery])
    );

    const handleDelete = async () => {
        if (!selectedPayment) return;
        try {
            await BaseModelService.softDelete(selectedPayment.payment);
            setIsConfirmDeleteVisible(false);
            loadData();
            if (Platform.OS === 'web') {
                window.alert('Payment record moved to trash.');
            }
        } catch (error) {
            console.error('Failed to delete payment:', error);
            Alert.alert("Error", "Could not delete payment.");
        }
    };

    const columns: ColumnDef<EnrichedPayment>[] = [
        {
            key: 'paymentDate',
            label: 'Date',
            width: 100,
            render: (p) => <Text className="font-bold text-gray-900">{formatDate(new Date(p.payment.paymentDate))}</Text>
        },
        {
            key: 'receiptNumber',
            label: 'Receipt #',
            width: 90,
            render: (p) => <Text className="text-gray-700">{p.payment.receiptNumber || '-'}</Text>
        },
        {
            key: 'borrowerName',
            label: 'Borrower Name',
            flex: 2,
            render: (p) => (
                <Pressable onPress={() => { if(p.borrowerId) router.push(`/(admin)/borrowers/${p.borrowerId}`) }}>
                    <Text className="text-sm text-blue-700 underline font-bold" numberOfLines={1}>{p.borrowerName}</Text>
                </Pressable>
            )
        },
        {
            key: 'loanNumber',
            label: 'Loan #',
            width: 100,
            render: (p) => <Text className="text-gray-700">{p.loanNumber}</Text>
        },
        {
            key: 'amount',
            label: 'Amount',
            width: 100,
            align: 'right',
            render: (p) => <Text className="font-extrabold text-[#388E3C]">{formatPHP(p.payment.amount)}</Text>
        },
        {
            key: 'actions',
            label: '',
            width: 60,
            align: 'center',
            render: (p) => (
                <Pressable
                    className="p-1.5 active:bg-blue-100 rounded-full bg-blue-50"
                    onPress={() => router.push(`/(admin)/payments/new?paymentId=${p.payment.id}`)}
                >
                    <Text className="text-[10px] font-black text-blue-700 uppercase">Edit</Text>
                </Pressable>
            )
        }
    ];

    const totalPages = Math.max(1, Math.ceil(totalRecords / itemsPerPage));

    return (
        <View className="flex-1 bg-gray-50 p-4">
            <View className="mb-4 flex-row items-center justify-between">
                <View className="flex-1 mr-3">
                    <SearchBar
                        value={searchQuery}
                        onChangeText={(t) => { setSearchQuery(t); setCurrentPage(1); }}
                        placeholder="Search name, loan #, receipt..."
                    />
                </View>
                <ViewToggle mode={viewMode} onToggle={setViewMode} />
            </View>

            {loading && payments.length === 0 ? (
                <ActivityIndicator size="large" color="#D32F2F" className="mt-10" />
            ) : (
                <>
                    <View className="flex-1">
                        {viewMode === 'table' ? (
                            <DataTable 
                                columns={columns} 
                                data={payments} 
                                keyExtractor={(p) => p.payment.id} 
                                minWidth={600}
                            />
                        ) : (
                            <FlatList
                                data={payments}
                                keyExtractor={(item) => item.payment.id}
                                removeClippedSubviews={true}
                                windowSize={5}
                                maxToRenderPerBatch={10}
                                initialNumToRender={10}
                                renderItem={({ item }) => (
                                    <MemoizedPaymentItem
                                        item={item}
                                        onPressBorrower={() => {
                                            if (item.borrowerId) router.push(`/(admin)/borrowers/${item.borrowerId}`);
                                        }}
                                        onEdit={() => router.push(`/(admin)/payments/new?paymentId=${item.payment.id}`)}
                                        onDelete={() => {
                                            setSelectedPayment(item);
                                            setIsConfirmDeleteVisible(true);
                                        }}
                                        onActionsVisibilityChange={(isVisible) => {
                                            setVisibleSwipeActionId((currentId) => isVisible ? item.payment.id : currentId === item.payment.id ? null : currentId);
                                        }}
                                    />
                                )}
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={{ paddingBottom: 20 }}
                                ListEmptyComponent={
                                    <View className="items-center justify-center py-20">
                                        <MaterialIcons name="receipt-long" size={64} color="#E5E7EB" />
                                        <Text className="text-gray-700 font-medium mt-4 text-base">No payments found</Text>
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
                title="Delete Payment"
                message={`Are you sure you want to delete this payment of ${selectedPayment ? formatPHP(selectedPayment.payment.amount) : ''}? This can be recovered from Trash.`}
                confirmLabel="Delete"
                onConfirm={handleDelete}
                onCancel={() => setIsConfirmDeleteVisible(false)}
                isDestructive={true}
            />

            {/* FAB */}
            {!visibleSwipeActionId && (
                <Pressable
                    className={`${Platform.OS === 'web' ? 'absolute bottom-20 left-6' : 'absolute bottom-20 right-6'} flex-row items-center bg-[#D32F2F] px-6 py-4 rounded-full shadow-xl active:bg-red-800 z-50`}
                    onPress={() => router.push('/(admin)/payments/new')}
                >
                    <MaterialIcons name="add" size={24} color="#FFFFFF" className="mr-2" />
                    <Text className="text-white font-black uppercase tracking-wider">Add Payment</Text>
                </Pressable>
            )}
        </View>
    );
}
