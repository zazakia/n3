import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Alert, Switch, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { safeBack } from '../../../src/utils/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { database } from '../../../src/database';
import UserProfile from '../../../src/database/models/UserProfile';
import Borrower from '../../../src/database/models/Borrower';
import { Q } from '@nozbe/watermelondb';
import { MaterialIcons } from '@expo/vector-icons';
import { ROLES, ROLE_LABELS } from '../../../src/constants/roles';
import ActionLogService from '../../../src/services/ActionLogService';


const schema = z.object({
    fullName: z.string().min(2, "Name is required"),
    email: z.string().email("Invalid email address"),
    role: z.string().min(1, "Role is required"),
    isActive: z.boolean(),
    borrowerId: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function NewUserScreen() {
    const router = useRouter();
    const [saving, setSaving] = useState(false);
    const [borrowers, setBorrowers] = useState<Borrower[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loadingBorrowers, setLoadingBorrowers] = useState(false);

    const { control, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
        resolver: zodResolver(schema),
        defaultValues: {
            fullName: '',
            email: '',
            role: ROLES.collector,
            isActive: true,
            borrowerId: '',
        }
    });

    const selectedRole = watch('role');

    useEffect(() => {
        if (selectedRole === ROLES.borrower) {
            loadBorrowers();
        }
    }, [selectedRole]);

    const loadBorrowers = async () => {
        setLoadingBorrowers(true);
        try {
            const fetched = await database.collections.get<Borrower>('borrowers').query(Q.sortBy('full_name', Q.asc)).fetch();
            setBorrowers(fetched);
        } catch (error) {
            console.error('Failed to load borrowers:', error);
        } finally {
            setLoadingBorrowers(false);
        }
    };

    const onSubmit = async (data: FormData) => {
        setSaving(true);
        try {
            await database.write(async () => {
                const batchOps: any[] = [];
                const logs: any[] = [];

                const newUser = database.collections.get<UserProfile>('user_profiles').prepareCreate(u => {
                    u.fullName = data.fullName.trim();
                    u.email = data.email.toLowerCase().trim();
                    u.role = data.role;
                    u.isActive = data.isActive;
                });
                batchOps.push(newUser);

                logs.push({
                    entityType: 'user_profiles',
                    entityId: newUser.id,
                    action: 'CREATE',
                    newData: { fullName: data.fullName, email: data.email, role: data.role, isActive: data.isActive }
                });

                // If it's a collector, create a collector profile
                if (data.role === ROLES.collector) {
                    const newCollector = database.collections.get<any>('collectors').prepareCreate((c: any) => {
                        c.fullName = data.fullName.trim();
                        c.authId = newUser.id;
                        c.isActive = data.isActive;
                    });
                    batchOps.push(newCollector);

                    logs.push({
                        entityType: 'collectors',
                        entityId: newCollector.id,
                        action: 'CREATE',
                        newData: { fullName: data.fullName, authId: newUser.id, isActive: data.isActive }
                    });
                }

                // If it's a borrower, link them
                if (data.role === ROLES.borrower && data.borrowerId) {
                    const borrower = await database.collections.get<Borrower>('borrowers').find(data.borrowerId);
                    const oldAuthId = borrower.authId;
                    batchOps.push(borrower.prepareUpdate(b => {
                        b.authId = newUser.id;
                    }));

                    logs.push({
                        entityType: 'borrowers',
                        entityId: borrower.id,
                        action: 'UPDATE',
                        oldData: { authId: oldAuthId },
                        newData: { authId: newUser.id }
                    });
                }

                const auditLogs = await ActionLogService.prepareLogActions(logs);
                await database.batch(...batchOps, ...auditLogs);
            });

            if (Platform.OS === 'web') {
                window.alert("User profile created.");
            } else {
                Alert.alert("Success", "User profile created.");
            }
            safeBack(router, '/(admin)');
        } catch (error: any) {
            console.error('Failed to create user:', error);
            if (Platform.OS === 'web') {
                window.alert(error?.message || 'Failed to create user profile. Make sure the email is unique.');
            } else {
                Alert.alert('Error', error?.message || 'Failed to create user profile. Make sure the email is unique.');
            }
        } finally {
            setSaving(false);
        }
    };

    const filteredBorrowers = borrowers.filter(b => 
        b.fullName.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 20 }}>
            <View className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 mb-6">
                <Text className="text-2xl font-black text-gray-900 mb-6">Create New User</Text>

                <View className="mb-4">
                    <Text className="text-xs font-bold text-gray-700 mb-2 uppercase tracking-widest">Full Name</Text>
                    <Controller
                        control={control}
                        name="fullName"
                        render={({ field: { onChange, value } }) => (
                            <TextInput
                                className={`bg-gray-50 p-4 rounded-xl border ${errors.fullName ? 'border-red-500' : 'border-gray-200'} text-gray-900`}
                                placeholder="Enter full name"
                                onChangeText={onChange}
                                value={value}
                                editable={!saving}
                            />
                        )}
                    />
                    {errors.fullName && <Text className="text-red-500 text-xs mt-1 font-bold">{errors.fullName.message}</Text>}
                </View>

                <View className="mb-4">
                    <Text className="text-xs font-bold text-gray-700 mb-2 uppercase tracking-widest">Email Address</Text>
                    <Controller
                        control={control}
                        name="email"
                        render={({ field: { onChange, value } }) => (
                            <TextInput
                                className={`bg-gray-50 p-4 rounded-xl border ${errors.email ? 'border-red-500' : 'border-gray-200'} text-gray-900`}
                                placeholder="user@example.com"
                                keyboardType="email-address"
                                autoCapitalize="none"
                                onChangeText={onChange}
                                value={value}
                                editable={!saving}
                            />
                        )}
                    />
                    {errors.email && <Text className="text-red-500 text-xs mt-1 font-bold">{errors.email.message}</Text>}
                </View>

                <View className="mb-4">
                    <Text className="text-xs font-bold text-gray-700 mb-2 uppercase tracking-widest">Assigned Role</Text>
                    <Controller
                        control={control}
                        name="role"
                        render={({ field: { onChange, value } }) => (
                            <View className="flex-row flex-wrap">
                                {Object.entries(ROLES).map(([key, roleValue]) => (
                                    <Pressable
                                        key={roleValue}
                                        onPress={() => onChange(roleValue)}
                                        className={`mr-2 mb-2 px-4 py-2 rounded-full border ${value === roleValue ? 'bg-primary border-blue-900' : 'bg-gray-100 border-gray-200'}`}
                                    >
                                        <Text className={`text-xs font-bold ${value === roleValue ? 'text-white' : 'text-gray-600'}`}>
                                            {ROLE_LABELS[roleValue as keyof typeof ROLE_LABELS]}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        )}
                    />
                    {errors.role && <Text className="text-red-500 text-xs mt-1 font-bold">{errors.role.message}</Text>}
                </View>

                {selectedRole === ROLES.borrower && (
                    <View className="mb-4 bg-blue-50 p-4 rounded-2xl border border-blue-100">
                        <Text className="text-xs font-bold text-blue-800 mb-2 uppercase tracking-widest">Link to Borrower Profile</Text>
                        {loadingBorrowers ? (
                            <ActivityIndicator size="small" color="#1A237E" />
                        ) : (
                            <View>
                                <TextInput
                                    className="bg-white p-3 rounded-xl border border-blue-200 text-gray-900 mb-2 font-medium"
                                    placeholder="Search borrowers..."
                                    value={searchQuery}
                                    onChangeText={setSearchQuery}
                                />
                                <Controller
                                    control={control}
                                    name="borrowerId"
                                    render={({ field: { onChange, value } }) => (
                                        <View>
                                            {filteredBorrowers.length === 0 ? (
                                                <Text className="text-gray-700 text-xs py-2 italic flex-wrap">
                                                    {borrowers.length === 0 ? 'No borrowers found backend database.' : 'No matching borrowers.'}
                                                </Text>
                                            ) : (
                                                <ScrollView className="max-h-40" nestedScrollEnabled>
                                                    {filteredBorrowers.map(b => (
                                                        <Pressable
                                                            key={b.id}
                                                            onPress={() => onChange(b.id)}
                                                            className={`p-3 rounded-lg mb-1 flex-row justify-between items-center ${value === b.id ? 'bg-blue-600' : 'bg-white'}`}
                                                        >
                                                            <Text className={`text-sm ${value === b.id ? 'text-white font-bold' : 'text-gray-700'}`}>{b.fullName}</Text>
                                                            {value === b.id && <MaterialIcons name="check" size={16} color="#FFF" />}
                                                        </Pressable>
                                                    ))}
                                                </ScrollView>
                                            )}
                                        </View>
                                    )}
                                />
                            </View>
                        )}
                        {errors.borrowerId && <Text className="text-red-500 text-xs mt-1 font-bold">{errors.borrowerId.message}</Text>}
                    </View>
                )}

                <View className="flex-row items-center justify-between mb-8 p-4 bg-gray-50 rounded-2xl">
                    <View>
                        <Text className="text-sm font-bold text-gray-900">Active Status</Text>
                        <Text className="text-xs text-gray-700">Allow user to log in</Text>
                    </View>
                    <Controller
                        control={control}
                        name="isActive"
                        render={({ field: { onChange, value } }) => (
                            <Switch
                                value={value}
                                onValueChange={onChange}
                                trackColor={{ false: '#D1D5DB', true: '#1A237E' }}
                            />
                        )}
                    />
                </View>

                <Pressable
                    className={`w-full py-4 rounded-2xl items-center shadow-lg ${saving ? 'bg-blue-400' : 'bg-primary active:bg-blue-900'}`}
                    onPress={handleSubmit(onSubmit)}
                    disabled={saving}
                >
                    {saving ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text className="text-white font-black text-lg uppercase tracking-widest">Create Profile</Text>
                    )}
                </Pressable>

                <View className="mt-4 p-4 bg-orange-50 rounded-2xl border border-orange-100 flex-row items-start">
                    <MaterialIcons name="info-outline" size={20} color="#F57C00" className="mr-2 mt-0.5" />
                    <Text className="text-[10px] items-center text-orange-800 flex-1 font-medium leading-4">
                        Note: This creates a local profile. The user must still have a valid authentication account in Supabase with the same email address.
                    </Text>
                </View>
            </View>
        </ScrollView>
    );
}
