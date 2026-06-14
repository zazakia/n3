import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { database } from '../../../src/database';
import { Q } from '@nozbe/watermelondb';
import CashTransaction from '../../../src/database/models/CashTransaction';
import { MaterialIcons } from '@expo/vector-icons';
import { formatPHP } from '../../../src/utils/currency';
import { formatDate } from '../../../src/utils/dates';
import { CashService } from '../../../src/services/CashService';
import { PrintButton } from '../../../src/components/PrintButton';
import { PdfGenerator } from '../../../src/services/PdfGenerator';

export default function CashOnHandScreen() {
    const router = useRouter();
    const [txns, setTxns] = useState<CashTransaction[]>([]);
    const [balance, setBalance] = useState(0);
    const [loading, setLoading] = useState(true);

    const loadData = async () => {
        try {
            const fetched = await database.collections.get<CashTransaction>('cash_transactions').query(Q.sortBy('transaction_date', Q.desc)).fetch();
            const currentBal = await CashService.getCurrentBalance();
            setTxns(fetched);
            setBalance(currentBal);
        } catch (error) {
            console.error('Failed to load cash data:', error);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

    const renderItem = ({ item }: { item: CashTransaction }) => (
        <View className="bg-white p-4 rounded-2xl mb-3 border border-gray-100 shadow-sm flex-row items-center">
            <View className={`w-12 h-12 rounded-full items-center justify-center mr-4 ${item.type === 'in' || item.type === 'starting_balance' ? 'bg-green-50' : 'bg-red-50'
                }`}>
                <MaterialIcons
                    name={item.type === 'in' || item.type === 'starting_balance' ? 'add' : 'remove'}
                    size={24}
                    color={item.type === 'in' || item.type === 'starting_balance' ? '#388E3C' : '#D32F2F'}
                />
            </View>
            <View className="flex-1">
                <Text className="text-base font-bold text-gray-900">{item.particulars}</Text>
                <Text className="text-xs text-gray-700 mt-1">
                    {item.type.replace('_', ' ').toUpperCase()} • {formatDate(new Date(item.transactionDate))}
                </Text>
            </View>
            <View className="items-end pl-2">
                <Text className={`text-sm font-extrabold ${item.type === 'in' || item.type === 'starting_balance' ? 'text-green-700' : 'text-red-700'
                    }`}>
                    {item.type === 'in' || item.type === 'starting_balance' ? '+' : '-'}{formatPHP(item.amount)}
                </Text>
            </View>
        </View>
    );

    return (
        <View className="flex-1 bg-gray-50">
            <View className="bg-[#0288D1] p-8 pb-12 rounded-b-[40px] shadow-lg mb-6 items-center">
                <Text className="text-sky-100 text-sm font-bold uppercase tracking-widest mb-2">Current Cash Box Balance</Text>
                <Text className="text-4xl font-black text-white tracking-tighter">{formatPHP(balance)}</Text>
            </View>

            <View className="flex-1 px-4">
                <View className="flex-row justify-between items-center mb-4 px-2">
                    <Text className="text-lg font-extrabold text-gray-900">Manual Adjustments</Text>
                    <PrintButton
                        onPrint={async () => {
                            await PdfGenerator.generateGenericReport({
                                title: 'Cash on Hand Report',
                                subtitle: 'Manual Cash Adjustments',
                                headers: ['Date', 'Type', 'Particulars', 'Amount'],
                                data: txns.map((t) => [
                                    formatDate(new Date(t.transactionDate)),
                                    t.type.replace('_', ' ').toUpperCase(),
                                    t.particulars,
                                    (t.type === 'in' || t.type === 'starting_balance' ? '+' : '-') + formatPHP(t.amount)
                                ]),
                                summaryBoxes: [
                                    { label: 'Current Balance', value: formatPHP(balance) }
                                ]
                            });
                        }}
                        compact
                    />
                </View>

                {loading ? (
                    <ActivityIndicator size="large" color="#0288D1" className="mt-10" />
                ) : (
                    <FlatList
                        data={txns}
                        keyExtractor={(item) => item.id}
                        removeClippedSubviews={true}
                        windowSize={5}
                        maxToRenderPerBatch={10}
                        initialNumToRender={10}
                        renderItem={renderItem}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 100 }}
                        ListEmptyComponent={
                            <View className="items-center justify-center py-20">
                                <MaterialIcons name="account-balance-wallet" size={64} color="#E5E7EB" />
                                <Text className="text-gray-700 font-medium mt-4 text-base">No manual transactions</Text>
                            </View>
                        }
                    />
                )}
            </View>

            {/* FAB */}
            <Pressable
                className="absolute bottom-6 right-6 flex-row items-center bg-[#0288D1] px-6 py-4 rounded-full shadow-xl active:bg-sky-800"
                onPress={() => router.push('/(admin)/cash-on-hand/new')}
            >
                <MaterialIcons name="add" size={24} color="#FFFFFF" className="mr-2" />
                <Text className="text-white font-black uppercase tracking-wider">Add Cash Entry</Text>
            </Pressable>
        </View>
    );
}
