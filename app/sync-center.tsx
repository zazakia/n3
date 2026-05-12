import React from 'react';
import {
    View,
    Text,
    ScrollView,
    Pressable,
    ActivityIndicator,
    SafeAreaView,
    StatusBar,
    Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSyncStore, SyncLogEntry } from '../src/stores/syncStore';
import { SyncService } from '../src/services/SyncService';
import { format, formatDistanceToNow } from 'date-fns';

function LogIcon({ type }: { type: SyncLogEntry['type'] }) {
    switch (type) {
        case 'success':
            return <MaterialIcons name="check-circle" size={16} color="#22C55E" />;
        case 'error':
            return <MaterialIcons name="error" size={16} color="#EF4444" />;
        case 'table':
            return <MaterialIcons name="table-chart" size={16} color="#6366F1" />;
        default:
            return <MaterialIcons name="info" size={16} color="#60A5FA" />;
    }
}

function LogRow({ log }: { log: SyncLogEntry }) {
    return (
        <View className="flex-row items-start py-3 border-b border-gray-100">
            <View className="mt-0.5 mr-3">
                <LogIcon type={log.type} />
            </View>
            <View className="flex-1">
                <Text className="text-gray-900 text-sm font-semibold">{log.message}</Text>
                {log.detail ? (
                    <Text className="text-gray-700 text-xs mt-0.5">{log.detail}</Text>
                ) : null}
                <View className="flex-row items-center mt-1 gap-3">
                    <Text className="text-gray-700 text-[11px]">
                        {format(log.timestamp, 'HH:mm:ss')}
                    </Text>
                    {log.duration !== undefined && (
                        <Text className="text-gray-700 text-[11px]">{log.duration}ms</Text>
                    )}
                    {log.rowCount !== undefined && log.rowCount > 0 && (
                        <Text className="text-gray-700 text-[11px]">{log.rowCount} rows</Text>
                    )}
                </View>
            </View>
        </View>
    );
}

export default function SyncCenter() {
    const router = useRouter();
    const { status, progress, currentModel, lastSyncAt, isOnline, logs, errorMessage, clearLogs } =
        useSyncStore();

    const isSyncing = status === 'syncing';

    const handleSyncNow = async () => {
        await SyncService.checkAndSync({ force: true });
    };

    const handleClearLogs = () => {
        Alert.alert('Clear Logs', 'Are you sure you want to clear all sync logs?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Clear', style: 'destructive', onPress: clearLogs },
        ]);
    };

    const progressPercent = Math.round(progress * 100);

    return (
        <SafeAreaView className="flex-1 bg-[#F8FAFC]">
            <StatusBar barStyle="light-content" />

            {/* Header */}
            <LinearGradient
                colors={['#1E293B', '#0F172A']}
                className="px-6 pt-12 pb-8 rounded-b-[32px]"
            >
                <View className="flex-row items-center justify-between mb-6">
                    <Pressable
                        onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
                        className="p-2 bg-white/10 rounded-xl active:bg-white/20"
                    >
                        <MaterialIcons name="arrow-back" size={22} color="#FFF" />
                    </Pressable>
                    <Text className="text-white text-xl font-black">Sync Center</Text>
                    <Pressable
                        onPress={handleSyncNow}
                        disabled={isSyncing}
                        className="p-2 bg-white/10 rounded-xl active:bg-white/20"
                    >
                        {isSyncing ? (
                            <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                            <MaterialIcons name="sync" size={22} color="#FFF" />
                        )}
                    </Pressable>
                </View>

                {/* Status Row */}
                <View className="flex-row items-center gap-3 mb-5">
                    <View
                        className={`flex-row items-center px-3 py-1.5 rounded-full ${
                            isOnline ? 'bg-green-500/20 border border-green-500/30' : 'bg-red-500/20 border border-red-500/30'
                        }`}
                    >
                        <View
                            className={`w-2 h-2 rounded-full mr-2 ${isOnline ? 'bg-green-400' : 'bg-red-400'}`}
                        />
                        <Text className={`text-xs font-bold ${isOnline ? 'text-green-300' : 'text-red-300'}`}>
                            {isOnline ? 'Online' : 'Offline'}
                        </Text>
                    </View>
                    {lastSyncAt && (
                        <Text className="text-white/90 text-xs">
                            Last sync {formatDistanceToNow(lastSyncAt, { addSuffix: true })}
                        </Text>
                    )}
                </View>

                {/* Progress Bar */}
                {isSyncing && (
                    <View>
                        <View className="flex-row justify-between mb-1">
                            <Text className="text-white/70 text-xs">{currentModel}</Text>
                            <Text className="text-white/70 text-xs">{progressPercent}%</Text>
                        </View>
                        <View className="h-2 bg-white/10 rounded-full overflow-hidden">
                            <View
                                className="h-2 bg-teal-400 rounded-full"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </View>
                    </View>
                )}

                {/* Error Message */}
                {status === 'error' && !!errorMessage && (
                    <View className="bg-red-500/20 border border-red-500/30 p-3 rounded-2xl mt-2">
                        <Text className="text-red-300 text-xs font-semibold">⚠ Last sync failed</Text>
                        <Text className="text-red-200/80 text-xs mt-0.5">{errorMessage}</Text>
                    </View>
                )}
            </LinearGradient>

            <ScrollView  className="flex-1 px-6"  showsVerticalScrollIndicator={false} >
                {/* Sync Now Card */}
                <Pressable
                    onPress={handleSyncNow}
                    disabled={isSyncing}
                    className="mt-6 bg-teal-600 p-5 rounded-3xl flex-row items-center justify-between active:bg-teal-700"
                    style={{ boxShadow: '0 10px 15px -3px rgba(15,78,100,0.2)' }}
                >
                    <View>
                        <Text className="text-white font-black text-lg">
                            {isSyncing ? 'Syncing...' : 'Sync Now'}
                        </Text>
                        <Text className="text-teal-100/70 text-xs mt-0.5">
                            {isSyncing ? currentModel : 'Pull latest data & push local changes'}
                        </Text>
                    </View>
                    {isSyncing ? (
                        <ActivityIndicator color="#FFF" />
                    ) : (
                        <View className="bg-white/20 p-3 rounded-2xl">
                            <MaterialIcons name="sync" size={24} color="#FFF" />
                        </View>
                    )}
                </Pressable>

                {/* Sync Logs */}
                <View className="mt-8 mb-4 flex-row items-center justify-between">
                    <Text className="text-gray-900 font-black text-xl">Sync Log</Text>
                    {logs.length > 0 && (
                        <Pressable onPress={handleClearLogs} className="px-3 py-1.5 rounded-full bg-red-50 border border-red-100 active:bg-red-100">
                            <Text className="text-red-500 text-xs font-bold">Clear</Text>
                        </Pressable>
                    )}
                </View>

                {logs.length === 0 ? (
                    <View className="bg-white rounded-3xl p-10 items-center border border-gray-100 mb-10">
                        <View className="bg-gray-50 p-5 rounded-full mb-4">
                            <MaterialIcons name="history" size={40} color="#9CA3AF" />
                        </View>
                        <Text className="text-gray-900 font-black text-base">No logs yet</Text>
                        <Text className="text-gray-700 text-sm text-center mt-1">
                            Sync activity will appear here after your first sync.
                        </Text>
                    </View>
                ) : (
                    <View className="bg-white rounded-3xl px-4 border border-gray-100 mb-10">
                        {logs.map((log) => (
                            <LogRow key={log.id} log={log} />
                        ))}
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}
