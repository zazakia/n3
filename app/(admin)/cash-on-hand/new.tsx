import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { safeBack } from '../../../src/utils/navigation';
import { database } from '../../../src/database';
import CashTransaction from '../../../src/database/models/CashTransaction';
import { MaterialIcons } from '@expo/vector-icons';
import uuid from 'react-native-uuid';
import { useAuth } from '../../../src/store/AuthContext';
import { BaseModelService } from '../../../src/services/BaseModelService';


export default function NewCashTransactionScreen() {
    const router = useRouter();
    const { user } = useAuth();

    const [description, setDescription] = useState('');
    const [amount, setAmount] = useState('');
    const [type, setType] = useState<'in' | 'out'>('in');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        const val = parseFloat(amount);
        if (!description.trim()) {
            Alert.alert("Error", "Please enter a description.");
            return;
        }
        if (isNaN(val) || val <= 0) {
            Alert.alert("Error", "Please enter a valid amount.");
            return;
        }

        setSaving(true);
        try {
            await BaseModelService.create<CashTransaction>('cash_transactions', txn => {
                txn._raw.id = uuid.v4().toString();
                txn.particulars = description.trim();
                txn.amount = val;
                txn.type = type;
                txn.transactionDate = new Date().getTime();
                txn.recordedBy = user?.id || null;
            });


            Alert.alert("Success", "Cash entry saved.");
            safeBack(router, '/(admin)');
        } catch (error) {
            console.error('Failed to save cash transaction', error);
            Alert.alert("Error", "Failed to save cash entry.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <ScrollView  className="flex-1 bg-gray-50"  contentContainerStyle={{ padding: 16 }}>
            <View className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <Text className="text-xl font-extrabold text-gray-900 mb-6">Cash Entry</Text>

                <View className="mb-6">
                    <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Entry Type</Text>
                    <View className="flex-row bg-gray-50 p-1 rounded-xl">
                        <Pressable
                            onPress={() => setType('in')}
                            className={`flex-1 flex-row py-3 items-center justify-center rounded-lg ${type === 'in' ? 'bg-white shadow-sm' : ''}`}
                        >
                            <MaterialIcons name="add-circle" size={18} color={type === 'in' ? '#388E3C' : '#9CA3AF'} className="mr-2" />
                            <Text className={`font-bold uppercase ${type === 'in' ? 'text-green-700' : 'text-gray-700'}`}>Cash In</Text>
                        </Pressable>
                        <Pressable
                            onPress={() => setType('out')}
                            className={`flex-1 flex-row py-3 items-center justify-center rounded-lg ${type === 'out' ? 'bg-white shadow-sm' : ''}`}
                        >
                            <MaterialIcons name="remove-circle" size={18} color={type === 'out' ? '#D32F2F' : '#9CA3AF'} className="mr-2" />
                            <Text className={`font-bold uppercase ${type === 'out' ? 'text-red-700' : 'text-gray-700'}`}>Cash Out</Text>
                        </Pressable>
                    </View>
                </View>

                <View className="mb-4">
                    <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Amount (₱) *</Text>
                    <TextInput
                        className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-gray-900 font-extrabold text-2xl"
                        value={amount} onChangeText={setAmount} keyboardType="numeric" editable={!saving}
                        placeholder="0.00"
                    />
                </View>

                <View className="mb-8">
                    <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Description *</Text>
                    <TextInput
                        className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-gray-900 h-24 text-top"
                        value={description} onChangeText={setDescription} editable={!saving} multiline
                        placeholder="e.g. Starting Cash, Fuel replenishment..."
                        textAlignVertical="top"
                    />
                </View>

                <Pressable
                    className={`w-full py-4 rounded-xl items-center flex-row justify-center ${saving ? 'bg-sky-400' : 'bg-[#0288D1] active:bg-sky-900'}`}
                    onPress={handleSave} disabled={saving}
                >
                    {saving ? <ActivityIndicator color="#fff" /> : (
                        <>
                            <MaterialIcons name="save" size={24} color="#fff" className="mr-2" />
                            <Text className="text-white font-black text-xl uppercase tracking-wider">Save Entry</Text>
                        </>
                    )}
                </Pressable>
            </View>
        </ScrollView>
    );
}
