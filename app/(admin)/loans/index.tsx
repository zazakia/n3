import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { database } from '../../../src/database';
import { Q } from '@nozbe/watermelondb';
import Loan from '../../../src/database/models/Loan';
import Borrower from '../../../src/database/models/Borrower';
import { MaterialIcons } from '@expo/vector-icons';
import { SearchBar } from '../../../src/components/SearchBar';
import { formatPHP } from '../../../src/utils/currency';
import SwipeableItem from '../../../src/components/SwipeableItem';
import ConfirmDialog from '../../../src/components/ConfirmDialog';
import BaseModelService from '../../../src/services/BaseModelService';
import { Alert, Platform } from 'react-native';

export default function LoansListScreen() {
    const router = useRouter();
    const [loans, setLoans] = useState<(Loan & { borrowerName: string })[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [loading, setLoading] = useState(true);
    const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
    const [isConfirmDeleteVisible, setIsConfirmDeleteVisible] = useState(false);
    const [visibleSwipeActionId, setVisibleSwipeActionId] = useState<string | null>(null);

    const loadData = async () => {
        try {
            const fetchedLoans = await database.collections.get<Loan>('loans')
                .query(
                    Q.where('deleted_at', Q.eq(null)),
                    Q.sortBy('created_at', Q.desc)
                ).fetch();
            const fetchedBorrowers = await database.collections.get<Borrower>('borrowers').query(Q.where('deleted_at', Q.eq(null))).fetch();

            const borrowerMap: Record<string, string> = {};
            fetchedBorrowers.forEach(b => borrowerMap[b.id] = b.fullName);

            const enrichedLoans = fetchedLoans.map(l => {
                const loanAny = l as any;
                loanAny.borrowerName = l.borrowerId ? (borrowerMap[l.borrowerId] ?? 'Unknown') : 'Unknown';
                return loanAny;
            });

            setLoans(enrichedLoans);
        } catch (error) {
            console.error('Failed to load loans:', error);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

    const filteredLoans = loans.filter(l => {
        const matchesSearch = l.loanNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
            l.borrowerName.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = filterStatus === 'all' || l.status === filterStatus;
        return matchesSearch && matchesStatus;
    });

    const handleDelete = async () => {
        if (!selectedLoan) return;
        try {
            await BaseModelService.cascadeDeleteLoan(selectedLoan);
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

    const renderItem = ({ item }: { item: Loan & { borrowerName: string } }) => (
        <SwipeableItem
            onActionsVisibilityChange={(isVisible) => {
                setVisibleSwipeActionId((currentId) => isVisible ? item.id : currentId === item.id ? null : currentId);
            }}
            onDelete={() => {
                setSelectedLoan(item);
                setIsConfirmDeleteVisible(true);
            }}
        >
            <Pressable
                className="bg-white p-4 rounded-2xl mb-3 border border-gray-100 shadow-sm active:opacity-70"
                onPress={() => router.push(`/(admin)/loans/${item.id}`)}
            >
                <View className="flex-row justify-between items-start mb-2">
                    <View>
                        <Pressable onPress={() => router.push(`/(admin)/borrowers/${item.borrowerId}`)}>
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
                    <View>
                        <Text className="text-[10px] font-bold text-gray-700 uppercase tracking-widest">Principal</Text>
                        <Text className="text-sm font-extrabold text-[#1A237E] mt-0.5">{formatPHP(item.principalAmount)}</Text>
                    </View>
                    <View className="items-center">
                        <Text className="text-[10px] font-bold text-gray-700 uppercase tracking-widest">Insurance</Text>
                        <Text className="text-sm font-bold text-orange-600 mt-0.5">{formatPHP(item.insuranceAmount || 0)}</Text>
                    </View>
                    <View className="items-end">
                        <Text className="text-[10px] font-bold text-gray-700 uppercase tracking-widest">Total Amnt</Text>
                        <Text className="text-sm font-extrabold text-[#D32F2F] mt-0.5">{formatPHP(item.totalAmount)}</Text>
                    </View>
                </View>
            </Pressable>
        </SwipeableItem>
    );

    return (
        <View className="flex-1 bg-gray-50 p-4">
            <View className="mb-2">
                <SearchBar
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search by loan # or name..."
                />
            </View>

            <View className="mb-4">
                <ScrollView  horizontal showsHorizontalScrollIndicator={false} >
                    {['all', 'pending', 'active', 'paid', 'defaulted'].map(status => (
                        <Pressable
                            key={status}
                            onPress={() => setFilterStatus(status)}
                            className={`px-4 py-2 rounded-full border mr-2 ${filterStatus === status ? 'bg-[#1A237E] border-[#1A237E]' : 'bg-white border-gray-200'}`}
                        >
                            <Text className={`text-xs font-bold uppercase tracking-wider ${filterStatus === status ? 'text-white' : 'text-gray-700'}`}>
                                {status}
                            </Text>
                        </Pressable>
                    ))}
                </ScrollView>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color="#D32F2F" className="mt-10" />
            ) : (
                <FlatList
                    data={filteredLoans}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 100 }}
                    ListEmptyComponent={
                        <View className="items-center justify-center py-20">
                            <MaterialIcons name="money-off" size={64} color="#E5E7EB" />
                            <Text className="text-gray-700 font-medium mt-4 text-base">No loans found</Text>
                        </View>
                    }
                />
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

            {/* FAB */}
            {!visibleSwipeActionId && (
                <Pressable
                    className={`${Platform.OS === 'web' ? 'absolute bottom-6 left-6' : 'absolute bottom-6 right-6'} w-14 h-14 bg-[#D32F2F] rounded-full items-center justify-center shadow-lg active:bg-red-800`}
                    onPress={() => router.push('/(admin)/loans/new')}
                >
                    <MaterialIcons name="add" size={28} color="#FFFFFF" />
                </Pressable>
            )}
        </View>
    );
}
