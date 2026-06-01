import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { database } from '../../../src/database';
import BankAccount from '../../../src/database/models/BankAccount';
import { MaterialIcons } from '@expo/vector-icons';
import { formatPHP } from '../../../src/utils/currency';

export default function BankAccountsScreen() {
    const router = useRouter();
    const [accounts, setAccounts] = useState<BankAccount[]>([]);
    const [loading, setLoading] = useState(true);

    const loadData = async () => {
        try {
            const fetched = await database.collections.get<BankAccount>('bank_accounts').query().fetch();
            setAccounts(fetched);
        } catch (error) {
            console.error('Failed to load bank accounts:', error);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

    const renderItem = ({ item }: { item: BankAccount }) => (
        <Pressable
            className="bg-white p-6 rounded-3xl mb-4 border border-gray-100 shadow-sm flex-row items-center active:bg-gray-50"
            onPress={() => { }}
        >
            <View className="w-14 h-14 rounded-2xl bg-indigo-50 items-center justify-center mr-4">
                <MaterialIcons name="account-balance" size={28} color="#1A237E" />
            </View>
            <View className="flex-1">
                <Text className="text-lg font-black text-gray-900">{item.bankName}</Text>
                <Text className="text-xs text-gray-700 font-bold uppercase tracking-widest">{item.decryptedAccountNumber}</Text>
                <Text className="text-gray-700 text-[10px] mt-1">{item.accountName}</Text>
            </View>
            <View className="items-end">
                <Text className="text-sm font-bold text-gray-700 uppercase tracking-tighter mb-1">Balance</Text>
                <Text className="text-lg font-black text-primary">{formatPHP(item.startingBalance)}</Text>
            </View>
        </Pressable>
    );

    return (
        <View className="flex-1 bg-gray-50 p-4">
            <View className="mb-6 px-2">
                <Text className="text-2xl font-black text-gray-900">Bank Accounts</Text>
                <Text className="text-gray-700 font-medium">Manage institutional funds</Text>
            </View>

            {loading ? (
                <ActivityIndicator size="large" color="#1A237E" className="mt-10" />
            ) : (
                <FlatList
                    data={accounts}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 100 }}
                    ListEmptyComponent={
                        <View className="items-center justify-center py-20">
                            <MaterialIcons name="savings" size={64} color="#E5E7EB" />
                            <Text className="text-gray-700 font-medium mt-4 text-base">No accounts added</Text>
                        </View>
                    }
                />
            )}

            {/* FAB */}
            <Pressable
                className="absolute bottom-6 right-6 flex-row items-center bg-primary px-6 py-4 rounded-full shadow-xl active:bg-blue-900"
                onPress={() => router.push('/(admin)/bank-accounts/new')}
            >
                <MaterialIcons name="add" size={24} color="#FFFFFF" className="mr-2" />
                <Text className="text-white font-black uppercase tracking-wider">Add Bank Account</Text>
            </Pressable>
        </View>
    );
}
