import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { safeBack } from '../../../src/utils/navigation';
import { database } from '../../../src/database';
import BankAccount from '../../../src/database/models/BankAccount';
import { MaterialIcons } from '@expo/vector-icons';
import uuid from 'react-native-uuid';
import { EncryptionService } from '../../../src/services/EncryptionService';
import { BaseModelService } from '../../../src/services/BaseModelService';


export default function NewBankAccountScreen() {
    const router = useRouter();
    const [bankName, setBankName] = useState('');
    const [accountName, setAccountName] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [balance, setBalance] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        const bal = parseFloat(balance);
        if (!bankName || !accountNumber) {
            Alert.alert("Error", "Bank name and account number are required.");
            return;
        }
        if (isNaN(bal)) {
            Alert.alert("Error", "Please enter a valid starting balance.");
            return;
        }

        setSaving(true);
        try {
            await BaseModelService.create<BankAccount>('bank_accounts', acc => {
                acc._raw.id = uuid.v4().toString();
                acc.bankName = bankName.trim();
                acc.accountName = accountName.trim();
                acc.accountNumber = EncryptionService.encrypt(accountNumber.trim());
                acc.startingBalance = bal;
            });


            Alert.alert("Success", "Bank account registered.");
            safeBack(router, '/(admin)');
        } catch (error) {
            console.error('Failed to save bank account', error);
            Alert.alert("Error", "Failed to save account.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <ScrollView  className="flex-1 bg-gray-50"  contentContainerStyle={{ padding: 16 }}>
            <View className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <Text className="text-xl font-extrabold text-gray-900 mb-6">Setup Bank Account</Text>

                <View className="mb-4">
                    <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Bank Name *</Text>
                    <TextInput
                        className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-gray-900 font-bold"
                        value={bankName} onChangeText={setBankName} editable={!saving}
                        placeholder="e.g. BDO, BPI, GCash Business"
                    />
                </View>

                <View className="mb-4">
                    <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Account Holder Name</Text>
                    <TextInput
                        className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-gray-900 font-bold"
                        value={accountName} onChangeText={setAccountName} editable={!saving}
                        placeholder="Account name..."
                    />
                </View>

                <View className="mb-4">
                    <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Account Number *</Text>
                    <TextInput
                        className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-gray-900 font-bold"
                        value={accountNumber} onChangeText={setAccountNumber} editable={!saving}
                        placeholder="XXXX-XXXX-XXXX"
                    />
                </View>

                <View className="mb-8">
                    <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Current Balance (₱) *</Text>
                    <TextInput
                        className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-gray-900 font-extrabold text-2xl"
                        value={balance} onChangeText={setBalance} keyboardType="numeric" editable={!saving}
                        placeholder="0.00"
                    />
                </View>

                <Pressable
                    className={`w-full py-4 rounded-xl items-center flex-row justify-center ${saving ? 'bg-blue-300' : 'bg-primary active:bg-blue-900'}`}
                    onPress={handleSave} disabled={saving}
                >
                    {saving ? <ActivityIndicator color="#fff" /> : (
                        <>
                            <MaterialIcons name="account-balance" size={24} color="#fff" className="mr-2" />
                            <Text className="text-white font-black text-xl uppercase tracking-wider">Add Account</Text>
                        </>
                    )}
                </Pressable>
            </View>
        </ScrollView>
    );
}
