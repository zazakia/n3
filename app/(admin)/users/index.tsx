import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { database } from '../../../src/database';
import { Q } from '@nozbe/watermelondb';
import UserProfile from '../../../src/database/models/UserProfile';
import { MaterialIcons } from '@expo/vector-icons';
import { SearchBar } from '../../../src/components/SearchBar';

export default function UsersListScreen() {
    const router = useRouter();
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);

    const loadData = async () => {
        try {
            const fetched = await database.collections.get<UserProfile>('user_profiles')
                .query(
                    Q.where('deleted_at', Q.eq(null)),
                    Q.where('role', Q.oneOf(['admin', 'collector', 'loan_encoder', 'payment_encoder', 'expenses_encoder', 'main_office', 'borrower'])),
                    Q.where('full_name', Q.notLike('%Diagnostic%')),
                    Q.where('full_name', Q.notLike('%Mock%'))
                )
                .fetch();
            // Sort fetched alphabetically by full name
            const sorted = fetched.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
            setUsers(sorted);
        } catch (error) {
            console.error('Failed to load users:', error);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

    const filtered = users.filter(u =>
        u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.role.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const renderItem = ({ item }: { item: UserProfile }) => (
        <Pressable 
            className="bg-white p-4 rounded-2xl mb-3 border border-gray-100 shadow-sm flex-row items-center active:opacity-70"
            onPress={() => router.push(`/(admin)/users/${item.id}`)}
        >
            <View className={`w-12 h-12 rounded-full items-center justify-center mr-4 ${item.role === 'admin' || item.role === 'main_office' ? 'bg-red-50' : 'bg-gray-50'
                }`}>
                <MaterialIcons name={item.role === 'admin' ? 'stars' : (item.role === 'main_office' ? 'business' : 'person')} size={24} color={item.role === 'admin' || item.role === 'main_office' ? '#D32F2F' : '#9CA3AF'} />
            </View>
            <View className="flex-1">
                <Text className="text-base font-bold text-gray-900">{item.fullName}</Text>
                <Text className={`text-[10px] font-black uppercase tracking-widest mt-0.5 ${item.role === 'admin' || item.role === 'main_office' ? 'text-red-600' : 'text-gray-700'
                    }`}>{item.role.replace('_', ' ')}</Text>
            </View>
            <View className="flex-row items-center">
                <View className={`w-2 h-2 rounded-full mr-2 ${item.isActive ? 'bg-green-500' : 'bg-red-500'}`} />
                <Text className="text-[10px] font-bold text-gray-700">{item.isActive ? 'ACTIVE' : 'INACTIVE'}</Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color="#D1D5DB" className="ml-2" />
        </Pressable>
    );

    return (
        <View className="flex-1 bg-gray-50 p-4">
            <View className="mb-4">
                <SearchBar
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search users/roles..."
                />
            </View>

            {loading ? (
                <ActivityIndicator size="large" color="#1A237E" className="mt-10" />
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 100 }}
                    ListEmptyComponent={
                        <View className="items-center justify-center py-20">
                            <MaterialIcons name="people-outline" size={64} color="#E5E7EB" />
                            <Text className="text-gray-700 font-medium mt-4 text-base">No users found</Text>
                        </View>
                    }
                />
            )}

            <Pressable
                className="absolute bottom-6 right-6 w-14 h-14 bg-[#1A237E] rounded-full items-center justify-center shadow-lg active:bg-blue-900"
                onPress={() => router.push('/(admin)/users/new')}
            >
                <MaterialIcons name="person-add" size={28} color="#FFFFFF" />
            </Pressable>
        </View>
    );
}
