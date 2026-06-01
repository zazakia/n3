import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, RefreshControl, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import ActionLogService from '../../../src/services/ActionLogService';
import ActionLog from '../../../src/database/models/ActionLog';
import { formatDistanceToNow } from 'date-fns';
import { SyncService } from '../../../src/services/SyncService';
import { supabase } from '../../../src/database/supabase';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function AuditTrailScreen() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [logs, setLogs] = useState<ActionLog[]>([]);
    const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
    const realtimeSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const loadLogs = useCallback(async (isRefreshing = false) => {
        if (isRefreshing) setRefreshing(true);
        else setLoading(true);

        try {
            if (isRefreshing) {
                await SyncService.sync(true);
            }
            const data = await ActionLogService.getLogs(100);
            setLogs(data);
        } catch (error) {
            console.error('[AuditTrail] Error loading logs:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        let isMounted = true;
        setLoading(true);

        const subscription = ActionLogService.observeLogs(100)?.subscribe({
            next: (data) => {
                if (!isMounted) return;
                setLogs(data);
                setLoading(false);
            },
            error: (error) => {
                console.error('[AuditTrail] Error observing logs:', error);
                if (isMounted) setLoading(false);
            },
        });

        if (!subscription) {
            loadLogs();
        }

        return () => {
            isMounted = false;
            subscription?.unsubscribe();
        };
    }, [loadLogs]);

    // useFocusEffect ensures the realtime channel is only opened when the
    // screen is actually visible. Using useEffect caused a WebSocket race
    // condition: the channel tried to connect during pre-render, then the
    // cleanup fired before the WS handshake finished, producing the browser
    // error: "WebSocket closed before the connection was established".
    useFocusEffect(
        useCallback(() => {
            const channel = supabase
                .channel('audit-trail-action-logs')
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'app_action_logs' },
                    () => {
                        if (realtimeSyncTimer.current) {
                            clearTimeout(realtimeSyncTimer.current);
                        }

                        realtimeSyncTimer.current = setTimeout(() => {
                            SyncService.sync(true).catch(error => {
                                console.error('[AuditTrail] Realtime sync failed:', error);
                            });
                        }, 500);
                    }
                )
                .subscribe();

            return () => {
                if (realtimeSyncTimer.current) {
                    clearTimeout(realtimeSyncTimer.current);
                }
                // .catch() handles the rare case where cleanup fires before
                // the WebSocket handshake completes (fast navigation).
                supabase.removeChannel(channel).catch(() => {});
            };
        }, [])
    );

    const toggleExpand = (id: string) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpandedLogId(expandedLogId === id ? null : id);
    };

    const getActionColor = (action: string) => {
        switch (action) {
            case 'CREATE': return '#2E7D32'; // Green
            case 'UPDATE': return '#1976D2'; // Blue
            case 'DELETE': return '#C62828'; // Red
            case 'RESTORE': return '#EF6C00'; // Orange
            default: return '#4B5563';
        }
    };

    const getActionIcon = (action: string) => {
        switch (action) {
            case 'CREATE': return 'add-circle';
            case 'UPDATE': return 'edit';
            case 'DELETE': return 'delete';
            case 'RESTORE': return 'restore';
            default: return 'info';
        }
    };

    const renderVisualDiff = (oldData: string, newData: string) => {
        if (!oldData && !newData) return <Text className="text-gray-700 text-[10px] italic text-center py-2">No detailed data captured</Text>;
        
        let oldObj: any = null;
        let newObj: any = null;
        let isJson = true;

        try {
            if (oldData && oldData !== '') oldObj = JSON.parse(oldData);
            if (newData && newData !== '') newObj = JSON.parse(newData);
        } catch (e) {
            isJson = false;
        }

        // If not JSON or both are empty, fallback to raw view
        if (!isJson) {
            return (
                <View>
                    {renderDataSection('Previous State', oldData)}
                    {renderDataSection('New State', newData)}
                </View>
            );
        }

        const keys = Array.from(new Set([
            ...Object.keys(oldObj || {}), 
            ...Object.keys(newObj || {})
        ])).filter(k => !['id', '_status', '_changed', 'sync_status', 'created_at', 'updated_at'].includes(k));

        const changes = keys.filter(k => JSON.stringify(oldObj?.[k]) !== JSON.stringify(newObj?.[k]));

        if (changes.length === 0) {
            return <Text className="text-gray-700 text-[10px] italic text-center py-2">No field-level changes detected</Text>;
        }

        return (
            <View className="mt-2 gap-y-2">
                {changes.map(key => {
                    const hasOld = oldObj && key in oldObj;
                    const hasNew = newObj && key in newObj;
                    const valOld = hasOld ? String(oldObj[key]) : null;
                    const valNew = hasNew ? String(newObj[key]) : null;

                    return (
                        <View key={key} className="bg-gray-50/50 p-2.5 rounded-xl border border-gray-100">
                            <Text className="text-[9px] font-black text-gray-700 uppercase tracking-tighter mb-1">{key.replace(/_/g, ' ')}</Text>
                            <View className="flex-row items-center flex-wrap">
                                {hasOld ? (
                                    <View className="bg-red-50 px-1.5 py-0.5 rounded border border-red-100">
                                        <Text className="text-red-600 text-[10px] font-medium strike-through">{valOld}</Text>
                                    </View>
                                ) : (
                                    <Text className="text-gray-300 italic text-[10px]">None</Text>
                                )}
                                
                                <MaterialIcons name="arrow-right-alt" size={16} color="#9CA3AF" className="mx-2" />
                                
                                {hasNew ? (
                                    <View className="bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                        <Text className="text-emerald-700 text-[10px] font-bold">{valNew}</Text>
                                    </View>
                                ) : (
                                    <View className="bg-red-50 px-1.5 py-0.5 rounded border border-red-100">
                                        <Text className="text-red-700 text-[10px] font-bold">Deleted</Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    );
                })}
            </View>
        );
    };

    const renderDataSection = (title: string, data: string) => {
        if (!data || data === '' || data === '{}') return null;
        
        try {
            const parsed = JSON.parse(data);
            return (
                <View className="mt-3">
                    <Text className="text-[10px] font-bold text-gray-700 uppercase tracking-widest mb-1">{title}</Text>
                    <View className="bg-gray-900 p-3 rounded-lg overflow-hidden">
                        <Text className="text-green-400 font-mono text-[10px]" numberOfLines={20}>
                            {JSON.stringify(parsed, null, 2)}
                        </Text>
                    </View>
                </View>
            );
        } catch (e) {
            return (
                <View className="mt-3">
                    <Text className="text-[10px] font-bold text-gray-700 uppercase tracking-widest mb-1">{title}</Text>
                    <View className="bg-gray-900 p-3 rounded-lg">
                        <Text className="text-gray-300 font-mono text-[10px]">{data}</Text>
                    </View>
                </View>
            );
        }
    };

    return (
        <View className="flex-1 bg-gray-50">
            <Stack.Screen options={{ 
                title: 'Audit Trail',
                headerShadowVisible: false,
                headerStyle: { backgroundColor: '#F9FAFB' }
            }} />

            <ScrollView 
                className="flex-1" 
                contentContainerStyle={{ padding: 16 }}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={() => loadLogs(true)} colors={['#1A237E']} />
                }
            >
                <View className="mb-6">
                    <Text className="text-2xl font-black text-gray-900">Activity Log</Text>
                    <Text className="text-gray-700 text-xs">History of system actions and data changes</Text>
                </View>

                {loading && logs.length === 0 ? (
                    <View className="py-20 items-center justify-center">
                        <ActivityIndicator color="#1A237E" size="large" />
                        <Text className="text-gray-700 mt-4 font-medium">Fetching logs...</Text>
                    </View>
                ) : logs.length === 0 ? (
                    <View className="py-20 items-center justify-center bg-white rounded-3xl border border-gray-100 shadow-sm">
                        <MaterialIcons name="history" size={64} color="#E5E7EB" />
                        <Text className="text-gray-700 font-bold mt-4">No activity logs found</Text>
                    </View>
                ) : (
                    <View className="gap-y-3">
                        {logs.map((log) => {
                            const isExpanded = expandedLogId === log.id;
                            const actionColor = getActionColor(log.action);
                            
                            return (
                                <Pressable 
                                    key={log.id}
                                    onPress={() => toggleExpand(log.id)}
                                    className={`bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden ${isExpanded ? 'border-primary/30 ring-1 ring-[#1A237E]/10' : ''}`}
                                >
                                    <View className="p-4">
                                        <View className="flex-row justify-between items-start">
                                            <View className="flex-row items-center flex-1 pr-2">
                                                <View 
                                                    className="w-10 h-10 rounded-full items-center justify-center mr-3" 
                                                    style={{ backgroundColor: actionColor + '15' }}
                                                >
                                                    <MaterialIcons name={getActionIcon(log.action)} size={20} color={actionColor} />
                                                </View>
                                                <View className="flex-1">
                                                    <View className="flex-row items-center">
                                                        <Text className="font-black text-gray-900 mr-2">{log.action}</Text>
                                                        <View className="bg-gray-100 px-2 py-0.5 rounded-md">
                                                            <Text className="text-[10px] font-bold text-gray-700 uppercase tracking-tighter">{log.entityType}</Text>
                                                        </View>
                                                    </View>
                                                    <Text className="text-gray-700 text-xs mt-0.5">ID: {log.entityId.substring(0, 8)}...</Text>
                                                </View>
                                            </View>
                                            <View className="items-end">
                                                <Text className="text-gray-700 text-[10px] font-bold uppercase">
                                                    {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                                                </Text>
                                                <MaterialIcons name={isExpanded ? "expand-less" : "expand-more"} size={20} color="#9CA3AF" className="mt-1" />
                                            </View>
                                        </View>

                                        <View className="mt-3 flex-row items-center">
                                            <View className="w-5 h-5 rounded-full bg-gray-100 items-center justify-center mr-2">
                                                <MaterialIcons name="person" size={12} color="#6B7280" />
                                            </View>
                                            <Text className="text-[10px] font-bold text-gray-600">By: {log.performedBy}</Text>
                                        </View>

                                        {isExpanded && (
                                            <View className="mt-4 pt-4 border-t border-gray-50">
                                                <Text className="text-[10px] font-black text-gray-700 uppercase tracking-widest mb-2">Changes</Text>
                                                {renderVisualDiff(log.oldData, log.newData)}
                                            </View>
                                        )}
                                    </View>
                                </Pressable>
                            );
                        })}
                    </View>
                )}
                <View className="h-20" />
            </ScrollView>
        </View>
    );
}

