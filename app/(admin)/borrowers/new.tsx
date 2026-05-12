import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { safeBack } from '../../../src/utils/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { database } from '../../../src/database';
import UserProfile from '../../../src/database/models/UserProfile';
import Collector from '../../../src/database/models/Collector';
import Borrower from '../../../src/database/models/Borrower';
import { Q } from '@nozbe/watermelondb';
import { BaseModelService } from '../../../src/services/BaseModelService';

import uuid from 'react-native-uuid';
import { useAuth } from '../../../src/store/AuthContext';
import { MaterialIcons } from '@expo/vector-icons';
import { EncryptionService } from '../../../src/services/EncryptionService';

const schema = z.object({
    fullName: z.string().min(2, "Name is required"),
    address: z.string().optional(),
    phone: z.string().optional(),
    gender: z.enum(['male', 'female', 'other']).optional(),
    notes: z.string().optional(),
    collectorId: z.string().optional(),
    group: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    coMakerName: z.string().optional(),
    business: z.string().optional(),
    dateOfBirth: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function NewBorrowerScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const [collectors, setCollectors] = useState<Collector[]>([]);
    const [saving, setSaving] = useState(false);

    const { control, handleSubmit, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            fullName: '',
            address: '',
            phone: '',
            gender: 'other',
            notes: '',
            collectorId: '',
            group: '',
            firstName: '',
            lastName: '',
            coMakerName: '',
            business: '',
            dateOfBirth: '',
        }
    });

    useEffect(() => {
        const fetchCollectors = async () => {
            const items = await database.collections.get<Collector>('collectors').query(
                Q.where('is_active', true)
            ).fetch();
            setCollectors(items);
        };
        fetchCollectors();
    }, []);

    const onSubmit = async (data: FormData) => {
        setSaving(true);
        try {
            await BaseModelService.create<Borrower>('borrowers', borrower => {

                borrower._raw.id = uuid.v4().toString();
                borrower.fullName = data.fullName.trim();
                borrower.address = EncryptionService.encrypt(data.address?.trim() || null);
                borrower.phone = EncryptionService.encrypt(data.phone?.trim() || null);
                borrower.gender = data.gender || null;
                borrower.notes = data.notes?.trim() || null;
                borrower.collectorId = data.collectorId || null;
                borrower.group = data.group?.trim() || null;
                borrower.firstName = data.firstName?.trim() || null;
                borrower.lastName = data.lastName?.trim() || null;
                borrower.coMakerName = data.coMakerName?.trim() || null;
                borrower.business = data.business?.trim() || null;
                borrower.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth).getTime() : null;
                borrower.createdBy = user?.id || null;
                // dates handled by TS model / default values
            });

            safeBack(router, '/(admin)');
        } catch (error) {
            console.error('Failed to save borrower', error);
            if (Platform.OS === 'web') {
                window.alert('Failed to save borrower');
            } else {
                Alert.alert('Error', 'Failed to save borrower');
            }
            setSaving(false);
        }
    };

    return (
        <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 20 }}>
            <View className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
                <Text className="text-2xl font-extrabold text-gray-900 mb-6">New Borrower</Text>

                <View className="mb-4">
                    <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Full Name *</Text>
                    <Controller
                        control={control}
                        name="fullName"
                        render={({ field: { onChange, onBlur, value } }) => (
                            <TextInput
                                className={`bg-gray-50 p-4 rounded-xl border ${errors.fullName ? 'border-red-500' : 'border-gray-200'} text-gray-900`}
                                onChangeText={onChange}
                                onBlur={onBlur}
                                value={value}
                                placeholder="Juan Dela Cruz"
                                editable={!saving}
                            />
                        )}
                    />
                    {errors.fullName && <Text className="text-red-500 text-xs mt-1">{errors.fullName.message}</Text>}
                </View>

                <View className="flex-row mb-4">
                    <View className="flex-1 mr-2">
                        <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">First Name</Text>
                        <Controller
                            control={control}
                            name="firstName"
                            render={({ field: { onChange, onBlur, value } }) => (
                                <TextInput
                                    className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-gray-900"
                                    onChangeText={onChange}
                                    onBlur={onBlur}
                                    value={value || ''}
                                    placeholder="First Name"
                                    editable={!saving}
                                />
                            )}
                        />
                    </View>
                    <View className="flex-1">
                        <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Last Name</Text>
                        <Controller
                            control={control}
                            name="lastName"
                            render={({ field: { onChange, onBlur, value } }) => (
                                <TextInput
                                    className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-gray-900"
                                    onChangeText={onChange}
                                    onBlur={onBlur}
                                    value={value || ''}
                                    placeholder="Last Name"
                                    editable={!saving}
                                />
                            )}
                        />
                    </View>
                </View>

                <View className="mb-4">
                    <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Phone</Text>
                    <Controller
                        control={control}
                        name="phone"
                        render={({ field: { onChange, onBlur, value } }) => (
                            <TextInput
                                className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-gray-900"
                                onChangeText={onChange}
                                onBlur={onBlur}
                                value={value || ''}
                                placeholder="09XX-XXX-XXXX"
                                keyboardType="phone-pad"
                                editable={!saving}
                            />
                        )}
                    />
                </View>

                <View className="mb-4">
                    <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Address</Text>
                    <Controller
                        control={control}
                        name="address"
                        render={({ field: { onChange, onBlur, value } }) => (
                            <TextInput
                                className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-gray-900"
                                onChangeText={onChange}
                                onBlur={onBlur}
                                value={value || ''}
                                placeholder="Block 1, Lot 2, Phase 3..."
                                multiline
                                editable={!saving}
                            />
                        )}
                    />
                </View>

                <View className="flex-row mb-4">
                    <View className="flex-1 mr-2">
                        <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Gender</Text>
                        <Controller
                            control={control}
                            name="gender"
                            render={({ field: { onChange, value } }) => (
                                <View className="flex-row items-center">
                                    {['male', 'female', 'other'].map(g => (
                                        <Pressable
                                            key={g}
                                            onPress={() => onChange(g)}
                                            disabled={saving}
                                            className={`px-3 py-3 rounded-xl border mr-2 flex-1 items-center ${value === g ? 'bg-blue-50 border-blue-500' : 'bg-white border-gray-200'}`}
                                        >
                                            <Text className={`capitalize font-bold text-xs ${value === g ? 'text-blue-700' : 'text-gray-600'}`}>
                                                {g.charAt(0).toUpperCase()}
                                            </Text>
                                        </Pressable>
                                    ))}
                                </View>
                            )}
                        />
                    </View>
                    <View className="flex-1">
                        <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Date of Birth</Text>
                        <Controller
                            control={control}
                            name="dateOfBirth"
                            render={({ field: { onChange, onBlur, value } }) => (
                                <TextInput
                                    className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-gray-900"
                                    onChangeText={onChange}
                                    onBlur={onBlur}
                                    value={value || ''}
                                    placeholder="YYYY-MM-DD"
                                    editable={!saving}
                                />
                            )}
                        />
                    </View>
                </View>

                <View className="mb-4">
                    <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Group</Text>
                    <Controller
                        control={control}
                        name="group"
                        render={({ field: { onChange, onBlur, value } }) => (
                            <TextInput
                                className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-gray-900"
                                onChangeText={onChange}
                                onBlur={onBlur}
                                value={value || ''}
                                placeholder="e.g. Group A, Market Group..."
                                editable={!saving}
                            />
                        )}
                    />
                </View>

                <View className="mb-4">
                    <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Co-Maker Name</Text>
                    <Controller
                        control={control}
                        name="coMakerName"
                        render={({ field: { onChange, onBlur, value } }) => (
                            <TextInput
                                className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-gray-900"
                                onChangeText={onChange}
                                onBlur={onBlur}
                                value={value || ''}
                                placeholder="Co-Maker Name"
                                editable={!saving}
                            />
                        )}
                    />
                </View>

                <View className="mb-4">
                    <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Business</Text>
                    <Controller
                        control={control}
                        name="business"
                        render={({ field: { onChange, onBlur, value } }) => (
                            <TextInput
                                className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-gray-900"
                                onChangeText={onChange}
                                onBlur={onBlur}
                                value={value || ''}
                                placeholder="Nature of Business"
                                editable={!saving}
                            />
                        )}
                    />
                </View>

                <View className="mb-4">
                    <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Assign to Collector</Text>
                    <Controller
                        control={control}
                        name="collectorId"
                        render={({ field: { onChange, value } }) => (
                            <View className="border border-gray-200 rounded-xl overflow-hidden">
                                {collectors.length === 0 ? (
                                    <Text className="p-4 text-gray-700">No collectors found.</Text>
                                ) : (
                                    collectors.map((c, i) => (
                                        <Pressable
                                            key={c.id}
                                            onPress={() => onChange(value === c.id ? '' : c.id)}
                                            className={`p-4 flex-row justify-between items-center ${i < collectors.length - 1 ? 'border-b border-gray-100' : ''} ${value === c.id ? 'bg-blue-50' : 'bg-gray-50'}`}
                                        >
                                            <Text className={value === c.id ? 'text-blue-700 font-bold' : 'text-gray-700 font-medium'}>{c.fullName}</Text>
                                            {value === c.id && <MaterialIcons name="check" size={20} color="#1D4ED8" />}
                                        </Pressable>
                                    ))
                                )}
                            </View>
                        )}
                    />
                </View>

                <View className="mb-8">
                    <Text className="text-xs font-bold text-gray-700 mb-2 uppercase">Notes</Text>
                    <Controller
                        control={control}
                        name="notes"
                        render={({ field: { onChange, value } }) => (
                            <TextInput
                                className="bg-gray-50 p-4 rounded-xl border border-gray-200 text-gray-900 h-24 text-top"
                                onChangeText={onChange}
                                value={value || ''}
                                multiline
                                textAlignVertical="top"
                                editable={!saving}
                            />
                        )}
                    />
                </View>

                <Pressable
                    className={`w-full py-4 rounded-xl items-center flex-row justify-center ${saving ? 'bg-red-400' : 'bg-[#D32F2F] active:bg-red-800'}`}
                    onPress={handleSubmit(onSubmit)}
                    disabled={saving}
                >
                    {saving ? <ActivityIndicator color="#fff" /> : (
                        <>
                            <MaterialIcons name="save" size={20} color="#fff" className="mr-2" />
                            <Text className="text-white font-bold text-lg">Save Borrower</Text>
                        </>
                    )}
                </Pressable>
            </View>
        </ScrollView>
    );
}
