import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, ScrollView, Alert, Platform } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { database } from '../../../src/database';
import { Q } from '@nozbe/watermelondb';
import Borrower from '../../../src/database/models/Borrower';
import UserProfile from '../../../src/database/models/UserProfile';
import Loan from '../../../src/database/models/Loan';
import Payment from '../../../src/database/models/Payment';
import LoanPenalty from '../../../src/database/models/LoanPenalty';
import { formatPHP } from '../../../src/utils/currency';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { SearchBar } from '../../../src/components/SearchBar';
import BaseModelService from '../../../src/services/BaseModelService';
import SwipeableItem from '../../../src/components/SwipeableItem';
import ActionSheet from '../../../src/components/ActionSheet';
import ConfirmDialog from '../../../src/components/ConfirmDialog';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { format, isAfter, startOfToday, startOfWeek, startOfMonth } from 'date-fns';

const MemoizedBorrowerItem = React.memo(({ item, borrowerBalances, borrowerFrequencies, borrowerNetReleases, onPress, onLongPress, onActionsVisibilityChange, onEdit, onDelete }: {
    item: Borrower,
    borrowerBalances: Record<string, number>,
    borrowerFrequencies: Record<string, string>,
    borrowerNetReleases: Record<string, number>,
    onPress: () => void,
    onLongPress: () => void,
    onActionsVisibilityChange: (isVisible: boolean) => void,
    onEdit: () => void,
    onDelete: () => void
}) => (
    <SwipeableItem
        onActionsVisibilityChange={onActionsVisibilityChange}
        onEdit={onEdit}
        onDelete={onDelete}
    >
        <Pressable
            testID={`borrower-item-${item.id}`}
            data-testid={`borrower-item-${item.id}`}
            className="bg-white p-4 border-b border-gray-100 flex-row items-center active:opacity-70"
            onPress={onPress}
            onLongPress={onLongPress}
        >
            <View className="w-12 h-12 rounded-full bg-blue-50 items-center justify-center mr-3">
                <Text className="text-blue-700 font-bold text-lg">{item.fullName.charAt(0).toUpperCase()}</Text>
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
                {!!item.decryptedPhone && (
                    <View className="flex-row items-center mt-1">
                        <MaterialIcons name="phone" size={12} color="#4B5563" />
                        <Text className="text-xs text-gray-700 ml-1" numberOfLines={1} ellipsizeMode="tail">
                            {item.decryptedPhone}
                        </Text>
                    </View>
                )}
                {!!item.decryptedAddress && (
                    <View className="flex-row items-center mt-1">
                        <MaterialIcons name="location-on" size={12} color="#9CA3AF" />
                        <Text className="flex-1 text-xs text-gray-700 ml-1" numberOfLines={1} ellipsizeMode="tail">
                            {item.decryptedAddress}
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
    const [collectors, setCollectors] = useState<Record<string, string>>({});
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [frequencyFilter, setFrequencyFilter] = useState('all');
    const [groupFilter, setGroupFilter] = useState('all');
    const [dateFilter, setDateFilter] = useState('all');
    const [borrowerFrequencies, setBorrowerFrequencies] = useState<Record<string, string>>({});
    const [borrowerBalances, setBorrowerBalances] = useState<Record<string, number>>({});
    const [borrowerNetReleases, setBorrowerNetReleases] = useState<Record<string, number>>({});
    
    // Action & Confirm States
    const [selectedBorrower, setSelectedBorrower] = useState<Borrower | null>(null);
    const [isActionSheetVisible, setIsActionSheetVisible] = useState(false);
    const [isConfirmDeleteVisible, setIsConfirmDeleteVisible] = useState(false);
    const [visibleSwipeActionId, setVisibleSwipeActionId] = useState<string | null>(null);

    const frequencies = [
        { id: 'all', label: 'All' },
        { id: 'daily', label: 'Daily' },
        { id: 'weekly', label: 'Weekly' },
        { id: 'bi_monthly', label: 'Bi-Monthly' },
        { id: 'monthly', label: 'Monthly' },
        { id: 'other', label: 'Other' }
    ];

    const dateFilters = [
        { id: 'all', label: 'All Time' },
        { id: 'today', label: 'Today' },
        { id: 'this_week', label: 'This Week' },
        { id: 'this_month', label: 'This Month' }
    ];

    const loadData = async () => {
        try {
            const fetchedBorrowers = await BaseModelService.fetchActive<Borrower>('borrowers');
            const fetchedUsers = await database.collections.get<UserProfile>('user_profiles').query(Q.where('role', 'collector')).fetch();
            const fetchedLoans = await database.collections.get<Loan>('loans').query(Q.where('status', 'active')).fetch();
            const fetchedPayments = await database.collections.get<Payment>('payments').query(Q.where('deleted_at', Q.eq(null))).fetch();
            const fetchedPenalties = await database.collections.get<LoanPenalty>('loan_penalties').query(Q.where('deleted_at', Q.eq(null))).fetch();

            const collectorMap: Record<string, string> = {};
            fetchedUsers.forEach(u => collectorMap[u.id] = u.fullName);

            const frequencyMap: Record<string, string> = {};
            const activeLoanBalanceMap: Record<string, number> = {};
            const activeLoanNetReleaseMap: Record<string, number> = {};

            const paymentMap: Record<string, number> = {};
            fetchedPayments.forEach(p => {
                paymentMap[p.loanId] = (paymentMap[p.loanId] || 0) + (p.amount || 0);
            });

            const penaltyMap: Record<string, number> = {};
            fetchedPenalties.forEach(p => {
                penaltyMap[p.loanId] = (penaltyMap[p.loanId] || 0) + (p.amount || 0);
            });

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

            setBorrowerFrequencies(frequencyMap);
            setBorrowerBalances(activeLoanBalanceMap);
            setBorrowerNetReleases(activeLoanNetReleaseMap);
            setBorrowers(fetchedBorrowers);
            setCollectors(collectorMap);
        } catch (error) {
            console.error('Failed to load borrowers:', error);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

    const uniqueGroups = Array.from(new Set(borrowers.map(b => b.group).filter(Boolean))).sort();

    const filteredBorrowers = useMemo(() => borrowers.filter(b => {
        const freq = borrowerFrequencies[b.id] || '';
        const matchesSearch = b.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (b.decryptedPhone && b.decryptedPhone.includes(searchQuery)) ||
            (b.decryptedAddress && b.decryptedAddress.toLowerCase().includes(searchQuery.toLowerCase()));
        
        const matchesFrequency = frequencyFilter === 'all' || freq.toLowerCase() === frequencyFilter;
        const matchesGroup = groupFilter === 'all' || b.group === groupFilter;

        let matchesDate = true;
        if (dateFilter !== 'all') {
            const createdAtDate = new Date(b.createdAt);
            if (dateFilter === 'today') {
                matchesDate = isAfter(createdAtDate, startOfToday());
            } else if (dateFilter === 'this_week') {
                matchesDate = isAfter(createdAtDate, startOfWeek(new Date(), { weekStartsOn: 1 })); // Monday
            } else if (dateFilter === 'this_month') {
                matchesDate = isAfter(createdAtDate, startOfMonth(new Date()));
            }
        }

        return matchesSearch && matchesFrequency && matchesGroup && matchesDate;
    }), [borrowers, borrowerFrequencies, searchQuery, frequencyFilter, groupFilter, dateFilter]);

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

    const renderItem = ({ item }: { item: Borrower }) => (
        <SwipeableItem
            onActionsVisibilityChange={(isVisible) => {
                setVisibleSwipeActionId((currentId) => isVisible ? item.id : currentId === item.id ? null : currentId);
            }}
            onEdit={() => router.push(`/(admin)/borrowers/${item.id}/edit`)}
            onDelete={() => {
                setSelectedBorrower(item);
                setIsConfirmDeleteVisible(true);
            }}
        >
            <Pressable
                testID={`borrower-item-${item.id}`}
                data-testid={`borrower-item-${item.id}`}
                className="bg-white p-4 border-b border-gray-100 flex-row items-center active:opacity-70"
                onPress={() => router.push(`/(admin)/borrowers/${item.id}`)}
                onLongPress={() => {
                    setSelectedBorrower(item);
                    setIsActionSheetVisible(true);
                }}
            >
                <View className="w-12 h-12 rounded-full bg-blue-50 items-center justify-center mr-3">
                    <Text className="text-blue-700 font-bold text-lg">{item.fullName.charAt(0).toUpperCase()}</Text>
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
                    {!!item.decryptedPhone && (
                        <View className="flex-row items-center mt-1">
                            <MaterialIcons name="phone" size={12} color="#4B5563" />
                            <Text className="text-xs text-gray-700 ml-1" numberOfLines={1} ellipsizeMode="tail">
                                {item.decryptedPhone}
                            </Text>
                        </View>
                    )}
                    {!!item.decryptedAddress && (
                        <View className="flex-row items-center mt-1">
                            <MaterialIcons name="location-on" size={12} color="#9CA3AF" />
                            <Text className="flex-1 text-xs text-gray-700 ml-1" numberOfLines={1} ellipsizeMode="tail">
                                {item.decryptedAddress}
                            </Text>
                        </View>
                    )}
                </View>
                <MaterialIcons name="chevron-right" size={24} color="#D1D5DB" className="ml-2" />
            </Pressable>
        </SwipeableItem>
    );

    return (
        <GestureHandlerRootView className="flex-1">
            <View className="flex-1 bg-gray-50 p-4">
            <View className="mb-4">
                <SearchBar
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search name, phone, or address..."
                />
                {searchQuery.trim().length > 0 && (
                    <Text className="text-xs text-gray-500 mt-1 ml-2 font-medium">
                        Showing {filteredBorrowers.length} result(s)
                    </Text>
                )}
                
                <View className="mt-3">
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                        {frequencies.map(f => (
                            <Pressable
                                key={f.id}
                                onPress={() => setFrequencyFilter(f.id)}
                                className={`px-4 py-1.5 rounded-full mr-2 border ${
                                    frequencyFilter === f.id
                                        ? 'bg-[#D32F2F] border-[#D32F2F]'
                                        : 'bg-white border-gray-200'
                                }`}
                            >
                                <Text className={`text-sm font-bold ${
                                    frequencyFilter === f.id ? 'text-white' : 'text-gray-600'
                                }`}>
                                    {f.label}
                                </Text>
                            </Pressable>
                        ))}
                    </ScrollView>
                </View>

                <View className="mt-2">
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                        {dateFilters.map(d => (
                            <Pressable
                                key={d.id}
                                onPress={() => setDateFilter(d.id)}
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

                {uniqueGroups.length > 0 && (
                    <View className="mt-2">
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
                            <Pressable
                                onPress={() => setGroupFilter('all')}
                                className={`px-4 py-1.5 rounded-full mr-2 border ${
                                    groupFilter === 'all'
                                        ? 'bg-[#1976D2] border-[#1976D2]'
                                        : 'bg-white border-gray-200'
                                }`}
                            >
                                <Text className={`text-sm font-bold ${
                                    groupFilter === 'all' ? 'text-white' : 'text-gray-600'
                                }`}>
                                    All Groups
                                </Text>
                            </Pressable>
                            {uniqueGroups.map(g => (
                                <Pressable
                                    key={g}
                                    onPress={() => setGroupFilter(g)}
                                    className={`px-4 py-1.5 rounded-full mr-2 border ${
                                        groupFilter === g
                                            ? 'bg-[#1976D2] border-[#1976D2]'
                                            : 'bg-white border-gray-200'
                                    }`}
                                >
                                    <Text className={`text-sm font-bold ${
                                        groupFilter === g ? 'text-white' : 'text-gray-600'
                                    }`}>
                                        {g}
                                    </Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                    </View>
                )}
            </View>

            {loading ? (
                <ActivityIndicator size="large" color="#D32F2F" className="mt-10" />
            ) : (
                <FlatList
                    data={filteredBorrowers}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 100 }}
                    ListEmptyComponent={
                        <View className="items-center justify-center py-20">
                            <MaterialIcons name="group-off" size={64} color="#E5E7EB" />
                            <Text className="text-gray-700 font-medium mt-4 text-base">No borrowers found</Text>
                        </View>
                    }
                />
            )}

                {/* FAB */}
                {!visibleSwipeActionId && (
                    <Pressable
                        className={`${Platform.OS === 'web' ? 'absolute bottom-6 left-6' : 'absolute bottom-6 right-6'} w-14 h-14 bg-[#D32F2F] rounded-full items-center justify-center shadow-lg active:bg-red-800`}
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
