import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native';
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
import { Alert, Platform } from 'react-native';

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
    <SwipeableItem
        onActionsVisibilityChange={onActionsVisibilityChange}
        onEdit={onEdit}
        onDelete={onDelete}
    >
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

    const loadData = async () => {
        try {
            const fetchedPayments = await database.collections.get<Payment>('payments')
                .query(
                    Q.where('deleted_at', Q.eq(null))
                ).fetch();
            const fetchedLoans = await database.collections.get<Loan>('loans').query(Q.where('deleted_at', Q.eq(null))).fetch();
            const fetchedBorrowers = await database.collections.get<Borrower>('borrowers').query(Q.where('deleted_at', Q.eq(null))).fetch();

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

            // Sort payments by payment_date desc safely in memory
            enriched.sort((a, b) => (b.payment.paymentDate || 0) - (a.payment.paymentDate || 0));

            setPayments(enriched);
        } catch (error) {
            console.error('Failed to load payments:', error);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

    const filteredPayments = useMemo(() => payments.filter(p => {
        const query = searchQuery.toLowerCase();
        if (!query) return true;
        
        const receiptMatch = p.payment.receiptNumber ? String(p.payment.receiptNumber).toLowerCase().includes(query) : false;
        const borrowerMatch = p.borrowerName ? String(p.borrowerName).toLowerCase().includes(query) : false;
        const loanMatch = p.loanNumber ? String(p.loanNumber).toLowerCase().includes(query) : false;
        
        return receiptMatch || borrowerMatch || loanMatch;
    }), [payments, searchQuery]);

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

    const renderItem = useCallback(({ item }: { item: EnrichedPayment }) => (
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
    ), [router]);

    return (
        <View className="flex-1 bg-gray-50 p-4">
            <View className="mb-4">
                <SearchBar
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search name, loan #, receipt..."
                />
                {searchQuery.trim().length > 0 && (
                    <Text className="text-xs text-gray-500 mt-1 ml-2 font-medium">
                        Showing {filteredPayments.length} result(s)
                    </Text>
                )}
            </View>

            {loading ? (
                <ActivityIndicator size="large" color="#D32F2F" className="mt-10" />
            ) : (
                <FlatList
                    data={filteredPayments}
                    keyExtractor={(item) => item.payment.id}
                    renderItem={renderItem}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 100 }}
                    ListEmptyComponent={
                        <View className="items-center justify-center py-20">
                            <MaterialIcons name="receipt-long" size={64} color="#E5E7EB" />
                            <Text className="text-gray-700 font-medium mt-4 text-base">No payments found</Text>
                        </View>
                    }
                />
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
                    className={`${Platform.OS === 'web' ? 'absolute bottom-6 left-6' : 'absolute bottom-6 right-6'} flex-row items-center bg-[#D32F2F] px-6 py-4 rounded-full shadow-xl active:bg-red-800`}
                    onPress={() => router.push('/(admin)/payments/new')}
                >
                    <MaterialIcons name="add" size={24} color="#FFFFFF" className="mr-2" />
                    <Text className="text-white font-black uppercase tracking-wider">Add Payment</Text>
                </Pressable>
            )}
        </View>
    );
}
