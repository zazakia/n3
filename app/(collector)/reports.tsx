import React, { useState, useCallback } from 'react';
import { View, Text, SafeAreaView, ScrollView, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { AnimatedPressable } from '../../src/components/AnimatedPressable';
import { CollectorHeader } from '../../src/components/collector/CollectorHeader';
import { useCollectorTheme } from '../../src/hooks/useCollectorTheme';
import { useAuth } from '../../src/store/AuthContext';

/**
 * Reports Hub — "Reports" tab root.
 *
 * Combines Daily + Weekly collection sheet access in one place
 * with large tappable cards, icons, and descriptions.
 */
export default function ReportsHub() {
    const router = useRouter();
    const t = useCollectorTheme();
    const { sunlightMode } = useAuth();
    const [refreshing, setRefreshing] = useState(false);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        // No data to fetch — just a brief visual refresh
        setTimeout(() => setRefreshing(false), 400);
    }, []);

    const reports = [
        {
            id: 'daily',
            title: 'Daily Collection Sheet',
            subtitle: "Today's collection summary grouped by borrower group",
            icon: 'today' as keyof typeof MaterialIcons.glyphMap,
            route: '/(collector)/collection-sheet-daily',
            gradient: sunlightMode
                ? 'bg-white border-4 border-black'
                : 'bg-gradient-to-br from-teal-600 to-teal-800',
            bgCls: sunlightMode ? 'bg-white border-4 border-black' : 'bg-teal-600',
            iconBgCls: sunlightMode ? 'bg-black' : 'bg-white/20',
        },
        {
            id: 'weekly',
            title: 'Weekly Collection Sheet',
            subtitle: 'Weekly view grouped by day and collection group',
            icon: 'date-range' as keyof typeof MaterialIcons.glyphMap,
            route: '/(collector)/collection-sheet-weekly',
            bgCls: sunlightMode ? 'bg-white border-4 border-black' : 'bg-indigo-600',
            iconBgCls: sunlightMode ? 'bg-black' : 'bg-white/20',
        },
    ];

    return (
        <SafeAreaView className={`flex-1 ${t.screenBgCls}`}>
            <CollectorHeader
                label="Analytics"
                title="Reports"
                showBack={false}
                paddingBottom={24}
            />

            <ScrollView
                className="flex-1"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 100, paddingTop: 16 }}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.refreshTintColor} />
                }
            >
                <Text className={`${t.cardSubtext} text-xs font-bold uppercase tracking-widest mb-6`}>
                    Available Reports
                </Text>

                {reports.map((report, idx) => (
                    <Animated.View
                        key={report.id}
                        entering={FadeInDown.delay(idx * 150).springify().damping(15)}
                    >
                        <AnimatedPressable
                            onPress={() => router.push(report.route as any)}
                            className={`${report.bgCls} p-6 rounded-[32px] mb-5`}
                        >
                            <View className="flex-row items-start justify-between mb-6">
                                <View className={`${report.iconBgCls} w-14 h-14 rounded-2xl items-center justify-center`}>
                                    <MaterialIcons name={report.icon} size={28} color="#FFF" />
                                </View>
                                <View className={`${sunlightMode ? 'bg-black' : 'bg-white/20'} px-3 py-1.5 rounded-full`}>
                                    <Text className="text-white text-[10px] font-black uppercase tracking-wider">
                                        PDF Export
                                    </Text>
                                </View>
                            </View>

                            <Text className={`${sunlightMode ? 'text-black' : 'text-white'} font-black text-xl mb-1`}>
                                {report.title}
                            </Text>
                            <Text className={`${sunlightMode ? 'text-black' : 'text-white/70'} text-xs font-bold`}>
                                {report.subtitle}
                            </Text>

                            <View className="flex-row items-center mt-5">
                                <Text className={`${sunlightMode ? 'text-black' : 'text-white'} text-xs font-black uppercase tracking-wider`}>
                                    Open Report
                                </Text>
                                <MaterialIcons name="arrow-forward" size={16} color={sunlightMode ? '#000' : '#FFF'} style={{ marginLeft: 6 }} />
                            </View>
                        </AnimatedPressable>
                    </Animated.View>
                ))}

                {/* Help / Guide Card */}
                <Animated.View entering={FadeInDown.delay(400).springify()}>
                    <AnimatedPressable
                        onPress={() => router.push('/(collector)/help')}
                        className={`${t.sunlightMode ? 'bg-white border-4 border-black' : 'bg-gray-900 shadow-xl'} p-6 rounded-[32px] flex-row items-center justify-between`}
                    >
                        <View className="flex-row items-center flex-1">
                            <View className={`${t.sunlightMode ? 'bg-black' : 'bg-white/10'} p-3 rounded-2xl mr-4`}>
                                <MaterialIcons name="auto-awesome" size={24} color="#FFF" />
                            </View>
                            <View className="flex-1">
                                <Text className={`${t.sunlightMode ? 'text-black' : 'text-white'} font-black text-base`}>
                                    System Guide
                                </Text>
                                <Text className={`${t.sunlightMode ? 'text-black' : 'text-gray-400'} text-xs font-bold`}>
                                    Tips for efficient collection
                                </Text>
                            </View>
                        </View>
                        <MaterialIcons name="chevron-right" size={24} color={t.sunlightMode ? '#000' : '#FFF'} />
                    </AnimatedPressable>
                </Animated.View>
            </ScrollView>
        </SafeAreaView>
    );
}
