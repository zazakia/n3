import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, ScrollView, Alert, Platform } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { database } from '../../../src/database';
import { Q } from '@nozbe/watermelondb';
import Borrower from '../../../src/database/models/Borrower';
import Loan from '../../../src/database/models/Loan';
import Payment from '../../../src/database/models/Payment';
import LoanPenalty from '../../../src/database/models/LoanPenalty';
import { formatPHP } from '../../../src/utils/currency';
import { MaterialIcons } from '@expo/vector-icons';
import { SearchBar } from '../../../src/components/SearchBar';
import BaseModelService from '../../../src/services/BaseModelService';
import SwipeableItem from '../../../src/components/SwipeableItem';
import ActionSheet from '../../../src/components/ActionSheet';
import ConfirmDialog from '../../../src/components/ConfirmDialog';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { format, isAfter, startOfToday, startOfWeek, startOfMonth } from 'date-fns';
import { DataTable, ColumnDef } from '../../../src/components/DataTable';
import { PaginationControls } from '../../../src/components/PaginationControls';
import { ViewToggle, ViewMode } from '../../../src/components/ViewToggle';

// --- Card Item Component ---
const MemoizedBorrowerItem = React.memo(({ item, borrowerBalances, borrowerFrequencies, borrowerNetReleases, phone, address, onPress, onLongPress, onActionsVisibilityChange, onEdit, onDelete }: {
    item: Borrower,
    borrowerBalances: Record<string, number>,
    borrowerFrequencies: Record<string, string>,
    borrowerNetReleases: Record<string, number>,
    phone: string | null,
    address: string | null,
    onPress: () => void,
    onLongPress: () => void,
    onActionsVisibilityChange: (isVisible: boolean) => void,
    onEdit: () => void,
    onDelete: () => void
}) => (
    <SwipeableItem onActionsVisibilityChange={onActionsVisibilityChange} onEdit={onEdit} onDelete={onDelete}>
        <Pressable
            testID={`borrower-item-${item.id}`}
            className="bg-white p-4 border-b border-gray-100 flex-row items-center active:opacity-70"
            onPress={onPress}
            onLongPress={onLongPress}
        >
            <View className="w-12 h-12 rounded-full bg-blue-50 items-center justify-center mr-3">
                <Text className="text-blue-700 font-bold text-lg">{item.fullName?.charAt(0).toUpperCase() || '?'}</Text>
            </View>
            <View className="flex-1" style={{ minWidth: 0 }}>
                <View className="flex-row items-start" style={{ minWidth: 0 }}>
                    <Text className="flex-1 text-base font-bold text-gray-900 leading-5" numberOfLines={2} ellipsizeMode="tail">
                        {item.fullName}
                    </Text>
                    {!!borrowerFrequencies[item.id] && (
                        <View className="bg-purple-50 px-2 py-1 rounded border border-purple-100 ml-2 max-w-[92px]">
                            <Text className="text-[10px] text-purple-700 font-bold uppercase" numberOfLines={1} ellipsizeMode="tail">
                                {borrowerFrequencies[item.id].replace('_', '-')}
                            </Text>
                        </View>
                    )}
                </View>
                <View className="flex-row items-center mt-0.5">
                    <MaterialIcons name="calendar-today" size={12} color="#9CA3AF" />
                    <Text className="text-[10px] text-gray-700 ml-1" numberOfLines={1}>
                        Added: {format(item.createdAt, 'MMM dd, yyyy')}
                    </Text>
                </View>

                {borrowerBalances[item.id] !== undefined && (
                    <View className="flex-row items-center mt-1">
                        <MaterialIcons name="account-balance-wallet" size={12} color={borrowerBalances[item.id] > 0 ? "#D32F2F" : "#388E3C"} />
                        <Text className={`text-xs font-bold ml-1 ${borrowerBalances[item.id] > 0 ? "text-[#D32F2F]" : "text-[#388E3C]"}`}>
                            Balance: {formatPHP(borrowerBalances[item.id])}
                        </Text>
                    </View>
                )}
                {borrowerNetReleases[item.id] !== undefined && borrowerNetReleases[item.id] > 0 && (
                    <View className="flex-row items-center mt-1">
                        <MaterialIcons name="payments" size={12} color="#047857" />
                        <Text className="text-xs font-bold ml-1 text-emerald-700">
                            Net Release: {formatPHP(borrowerNetReleases[item.id])}
                        </Text>
                    </View>
                )}
                {!!phone && (
                    <View className="flex-row items-center mt-1">
                        <MaterialIcons name="phone" size={12} color="#4B5563" />
                        <Text className="text-xs text-gray-700 ml-1" numberOfLines={1} ellipsizeMode="tail">
                            {phone}
                        </Text>
                    </View>
                )}
                {!!address && (
                    <View className="flex-row items-center mt-1">
                        <MaterialIcons name="location-on" size={12} color="#9CA3AF" />
                        <Text className="flex-1 text-xs text-gray-700 ml-1" numberOfLines={1} ellipsizeMode="tail">
                            {address}
                        </Text>
                    </View>
                )}
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#D1D5DB" className="ml-2" />
        </Pressable>
    </SwipeableItem>
));

export default function BorrowersListScreen() {
    const router = useRouter();
    const [borrowers, setBorrowers] = useState<Borrower[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [dateFilter, setDateFilter] = useState('all');
    
    // Derived balances state
    const [borrowerFrequencies, setBorrowerFrequencies] = useState<Record<string, string>>({});
    const [borrowerBalances, setBorrowerBalances] = useState<Record<string, number>>({});
    const [borrowerNetReleases, setBorrowerNetReleases] = useState<Record<string, number>>({});
    const [decryptedData, setDecryptedData] = useState<Record<string, { phone: string | null; address: string | null }>>({});
    
    // Pagination & View Mode
    const [viewMode, setViewMode] = useState<ViewMode>('table');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    const [totalRecords, setTotalRecords] = useState(0);

    // Action & Confirm States
    const [selectedBorrower, setSelectedBorrower] = useState<Borrower | null>(null);
    const [isActionSheetVisible, setIsActionSheetVisible] = useState(false);
    const [isConfirmDeleteVisible, setIsConfirmDeleteVisible] = useState(false);
    const [visibleSwipeActionId, setVisibleSwipeActionId] = useState<string | null>(null);

    const dateFilters = [
        { id: 'all', label: 'All Time' },
        { id: 'today', label: 'Today' },
        { id: 'this_week', label: 'This Week' },
        { id: 'this_month', label: 'This Month' }
    ];

    const loadData = async () => {
        setLoading(true);
        try {
            // 1. Build Query Conditions
            const conditions: Q.Clause[] = [Q.where('deleted_at', Q.eq(null))];
            
            if (searchQuery.trim()) {
                conditions.push(Q.where('full_name', Q.like(`%${Q.sanitizeLikeString(searchQuery)}%`)));
            }

            if (dateFilter !== 'all') {
                const now = new Date();
                let start: number;
                if (dateFilter === 'today') start = startOfToday().getTime();
                else if (dateFilter === 'this_week') start = startOfWeek(now, { weekStartsOn: 1 }).getTime();
                else start = startOfMonth(now).getTime();
                conditions.push(Q.where('created_at', Q.gte(start)));
            }

            const baseQuery = database.collections.get<Borrower>('borrowers').query(...conditions);

            // 2. Fetch Total Count
            const count = await baseQuery.fetchCount();
            setTotalRecords(count);

            // If current page is beyond bounds due to filter change, adjust it
            const maxPage = Math.max(1, Math.ceil(count / itemsPerPage));
            if (currentPage > maxPage) {
                setCurrentPage(maxPage);
                // Return early so the effect triggers again with corrected page
                return;
            }

            // 3. Fetch Paginated Data
            const offset = (currentPage - 1) * itemsPerPage;
            const fetchedBorrowers = await baseQuery.extend(
                Q.sortBy('full_name', Q.asc),
                Q.skip(offset),
                Q.take(itemsPerPage)
            ).fetch();

            // 4. Fetch related data ONLY for these paginated borrowers
            const borrowerIds = fetchedBorrowers.map(b => b.id);
            const frequencyMap: Record<string, string> = {};
            const activeLoanBalanceMap: Record<string, number> = {};
            const activeLoanNetReleaseMap: Record<string, number> = {};

            if (borrowerIds.length > 0) {
                const fetchedLoans = await database.collections.get<Loan>('loans')
                    .query(
                        Q.where('borrower_id', Q.oneOf(borrowerIds)),
                        Q.where('status', 'active')
                    ).fetch();

                if (fetchedLoans.length > 0) {
                    const loanIds = fetchedLoans.map(l => l.id);
                    const fetchedPayments = await database.collections.get<Payment>('payments')
                        .query(Q.where('loan_id', Q.oneOf(loanIds)), Q.where('deleted_at', Q.eq(null))).fetch();
                    const fetchedPenalties = await database.collections.get<LoanPenalty>('loan_penalties')
                        .query(Q.where('loan_id', Q.oneOf(loanIds)), Q.where('deleted_at', Q.eq(null))).fetch();

                    const paymentMap: Record<string, number> = {};
                    fetchedPayments.forEach(p => { paymentMap[p.loanId] = (paymentMap[p.loanId] || 0) + (p.amount || 0); });

                    const penaltyMap: Record<string, number> = {};
                    fetchedPenalties.forEach(p => { penaltyMap[p.loanId] = (penaltyMap[p.loanId] || 0) + (p.amount || 0); });

                    fetchedLoans.forEach(l => {
                        frequencyMap[l.borrowerId] = l.frequency || 'other';
                        const totalPaid = paymentMap[l.id] || 0;
                        const penaltyTotal = penaltyMap[l.id] || 0;
                        const expected = (l.totalAmount || 0) + penaltyTotal;
                        const bal = Math.max(0, expected - totalPaid);

                        activeLoanBalanceMap[l.borrowerId] = (activeLoanBalanceMap[l.borrowerId] || 0) + bal;
                        
                        const netRel = l.principalAmount - (l.deductedAmount || 0) - (l.serviceChargeAmount || 0);
                        activeLoanNetReleaseMap[l.borrowerId] = (activeLoanNetReleaseMap[l.borrowerId] || 0) + netRel;
                    });
                }
            }

            // Cache decrypted phone/address so we don't AES-decrypt on every render
            const decrypted: Record<string, { phone: string | null; address: string | null }> = {};
            fetchedBorrowers.forEach(b => {
                decrypted[b.id] = {
                    phone: b.decryptedPhone,
                    address: b.decryptedAddress,
                };
            });

            setBorrowerFrequencies(frequencyMap);
            setBorrowerBalances(activeLoanBalanceMap);
            setBorrowerNetReleases(activeLoanNetReleaseMap);
            setDecryptedData(decrypted);
            setBorrowers(fetchedBorrowers);

        } catch (error) {
            console.error('Failed to load borrowers:', error);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [currentPage, itemsPerPage, searchQuery, dateFilter])
    );

    const handleDelete = async () => {
        if (!selectedBorrower) return;
        try {
            await BaseModelService.cascadeDeleteBorrower(selectedBorrower);
            loadData();
            setIsConfirmDeleteVisible(false);
        } catch (error: any) {
            console.error('Failed to delete borrower:', error);
            setIsConfirmDeleteVisible(false);
            const msg = error.message || "Failed to delete borrower";
            if (Platform.OS === 'web') {
                window.alert(msg);
            } else {
                Alert.alert("Cannot Delete", msg);
            }
        }
    };

    // Columns for DataTable
    const columns: ColumnDef<Borrower>[] = [
        {
            key: 'fullName',
            label: 'Name',
            flex: 2,
            render: (b) => (
                <View>
                    <Text className="font-bold text-gray-900" numberOfLines={1}>{b.fullName}</Text>
                    {decryptedData[b.id]?.phone && <Text className="text-xs text-gray-500 mt-0.5">{decryptedData[b.id]?.phone}</Text>}
                </View>
            )
        },
        {
            key: 'balance',
            label: 'Balance',
            flex: 1,
            align: 'right',
            render: (b) => {
                const bal = borrowerBalances[b.id];
                if (bal === undefined) return <Text className="text-sm text-gray-400">-</Text>;
                return (
                    <Text className={`font-bold ${bal > 0 ? 'text-[#D32F2F]' : 'text-[#388E3C]'}`}>
                        {formatPHP(bal)}
                    </Text>
                );
            }
        },
        {
            key: 'frequency',
            label: 'Freq',
            width: 80,
            align: 'center',
            render: (b) => {
                const freq = borrowerFrequencies[b.id];
                if (!freq) return <Text className="text-sm text-gray-400">-</Text>;
                return (
                    <View className="bg-purple-50 px-2 py-1 rounded">
                        <Text className="text-[10px] text-purple-700 font-bold uppercase">{freq.replace('_', '-')}</Text>
                    </View>
                );
            }
        },
        {
            key: 'createdAt',
            label: 'Added',
            width: 100,
            align: 'right',
            render: (b) => <Text className="text-sm text-gray-700">{format(b.createdAt, 'MMM dd, yyyy')}</Text>
        },
        {
            key: 'actions',
            label: '',
            width: 60,
            align: 'center',
            render: (b) => (
                <Pressable
                    className="p-2 active:bg-gray-100 rounded-full"
                    onPress={() => {
                        setSelectedBorrower(b);
                        setIsActionSheetVisible(true);
                    }}
                >
                    <MaterialIcons name="more-vert" size={20} color="#4B5563" />
                </Pressable>
            )
        }
    ];

    const totalPages = Math.max(1, Math.ceil(totalRecords / itemsPerPage));

    // Must be declared unconditionally at top level — not inside JSX conditionals
    const renderBorrowerItem = useCallback(({ item }: { item: Borrower }) => (
        <MemoizedBorrowerItem
            item={item}
            borrowerBalances={borrowerBalances}
            borrowerFrequencies={borrowerFrequencies}
            borrowerNetReleases={borrowerNetReleases}
            phone={decryptedData[item.id]?.phone ?? null}
            address={decryptedData[item.id]?.address ?? null}
            onPress={() => router.push(`/(admin)/borrowers/${item.id}`)}
            onLongPress={() => {
                setSelectedBorrower(item);
                setIsActionSheetVisible(true);
            }}
            onActionsVisibilityChange={(isVisible) => {
                setVisibleSwipeActionId((currentId) => isVisible ? item.id : currentId === item.id ? null : currentId);
            }}
            onEdit={() => router.push(`/(admin)/borrowers/${item.id}/edit`)}
            onDelete={() => {
                setSelectedBorrower(item);
                setIsConfirmDeleteVisible(true);
            }}
        />
    ), [router, borrowerBalances, borrowerFrequencies, borrowerNetReleases, decryptedData]);

    return (
        <GestureHandlerRootView className="flex-1">
            <View className="flex-1 bg-gray-50 p-4">
                <View className="mb-4">
                    <View className="flex-row items-center justify-between mb-3">
                        <View className="flex-1 mr-3">
                            <SearchBar
                                value={searchQuery}
                                onChangeText={(t) => {
                                    setSearchQuery(t);
                                    setCurrentPage(1);
                                }}
                                placeholder="Search borrower name..."
                            />
                        </View>
                        <ViewToggle mode={viewMode} onToggle={setViewMode} />
                    </View>

                    <View className="mt-2">
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                            {dateFilters.map(d => (
                                <Pressable
                                    key={d.id}
                                    onPress={() => { setDateFilter(d.id); setCurrentPage(1); }}
                                    className={`px-4 py-1.5 rounded-full mr-2 border ${
                                        dateFilter === d.id
                                            ? 'bg-[#388E3C] border-[#388E3C]'
                                            : 'bg-white border-gray-200'
                                    }`}
                                >
                                    <Text className={`text-sm font-bold ${
                                        dateFilter === d.id ? 'text-white' : 'text-gray-600'
                                    }`}>
                                        {d.label}
                                    </Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                    </View>
                </View>

                {loading && borrowers.length === 0 ? (
                    <ActivityIndicator size="large" color="#D32F2F" className="mt-10" />
                ) : (
                    <>
                        <View className="flex-1">
                            {viewMode === 'table' ? (
                                <DataTable 
                                    columns={columns} 
                                    data={borrowers} 
                                    keyExtractor={(b) => b.id} 
                                    onRowPress={(b) => router.push(`/(admin)/borrowers/${b.id}`)}
                                    minWidth={500}
                                />
                            ) : (
                                <FlatList
                                    data={borrowers}
                                    keyExtractor={(item) => item.id}
                                    removeClippedSubviews={true}
                                    windowSize={5}
                                    maxToRenderPerBatch={10}
                                    initialNumToRender={10}
                                    renderItem={renderBorrowerItem}
                                    showsVerticalScrollIndicator={false}
                                    contentContainerStyle={{ paddingBottom: 20 }}
                                    ListEmptyComponent={
                                        <View className="items-center justify-center py-20">
                                            <MaterialIcons name="group-off" size={64} color="#E5E7EB" />
                                            <Text className="text-gray-700 font-medium mt-4 text-base">No borrowers found</Text>
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

                {/* FAB */}
                {!visibleSwipeActionId && (
                    <Pressable
                        className={`${Platform.OS === 'web' ? 'absolute bottom-20 left-6' : 'absolute bottom-20 right-6'} w-14 h-14 bg-[#D32F2F] rounded-full items-center justify-center shadow-lg active:bg-red-800 z-50`}
                        onPress={() => router.push('/(admin)/borrowers/new')}
                    >
                        <MaterialIcons name="person-add" size={28} color="#FFFFFF" />
                    </Pressable>
                )}
            </View>

            {/* Action Sheet */}
            <ActionSheet
                visible={isActionSheetVisible}
                onClose={() => setIsActionSheetVisible(false)}
                title={selectedBorrower?.fullName}
                actions={[
                    { 
                        id: 'view', 
                        label: 'View Details', 
                        icon: 'eye-outline', 
                        onPress: () => router.push(`/(admin)/borrowers/${selectedBorrower?.id}`) 
                    },
                    { 
                        id: 'edit', 
                        label: 'Edit Borrower', 
                        icon: 'pencil-outline', 
                        onPress: () => router.push(`/(admin)/borrowers/${selectedBorrower?.id}/edit`) 
                    },
                    { 
                        id: 'delete', 
                        label: 'Delete Borrower', 
                        icon: 'trash-outline', 
                        onPress: () => setIsConfirmDeleteVisible(true), 
                        isDestructive: true 
                    },
                ]}
            />

            {/* Confirm Delete */}
            <ConfirmDialog
                visible={isConfirmDeleteVisible}
                title="Delete Borrower?"
                message={`Are you sure you want to delete ${selectedBorrower?.fullName}? This action is reversible by administrators but will hide the borrower from all lists.`}
                confirmLabel="Delete"
                onConfirm={handleDelete}
                onCancel={() => setIsConfirmDeleteVisible(false)}
                isDestructive
            />
        </GestureHandlerRootView>
    );
}
