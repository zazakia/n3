import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import {
    APP_UPDATE_CATEGORY_COLORS,
    APP_UPDATE_CATEGORY_LABELS,
    APP_UPDATES,
    AppUpdateEntry,
} from '../../../src/constants/appUpdates';

function formatUpdateDate(value: string) {
    const date = new Date(`${value}T00:00:00`);
    return date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

function UpdateBullet({ text }: { text: string }) {
    return (
        <View className="flex-row items-start mb-2">
            <View className="w-1.5 h-1.5 rounded-full bg-gray-400 mt-2 mr-3" />
            <Text className="flex-1 text-sm text-gray-600 leading-5">{text}</Text>
        </View>
    );
}

function UpdateCard({ update, isLatest }: { update: AppUpdateEntry; isLatest: boolean }) {
    const color = APP_UPDATE_CATEGORY_COLORS[update.category];
    const releaseLabel = update.versionLabel ? `${update.versionLabel} ${update.version}` : `v${update.version}`;

    return (
        <View className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 mb-4">
            <View className="flex-row items-start mb-4">
                <View className="w-12 h-12 rounded-2xl items-center justify-center mr-4" style={{ backgroundColor: `${color}14` }}>
                    <MaterialIcons name={update.icon} size={24} color={color} />
                </View>
                <View className="flex-1">
                    <View className="flex-row flex-wrap items-center mb-1">
                        <Text className="text-lg font-black text-gray-900 mr-2">{update.title}</Text>
                        {isLatest && (
                            <View className="px-2 py-1 rounded-full bg-emerald-50 border border-emerald-100">
                                <Text className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Latest</Text>
                            </View>
                        )}
                    </View>
                    <Text className="text-xs font-bold text-gray-700 uppercase tracking-widest">
                        {APP_UPDATE_CATEGORY_LABELS[update.category]} · {releaseLabel} · {formatUpdateDate(update.date)}
                    </Text>
                </View>
            </View>

            <Text className="text-sm text-gray-700 leading-5 mb-5">{update.summary}</Text>

            <View className="mb-4">
                <Text className="text-[10px] font-black text-gray-700 uppercase tracking-widest mb-3">Change Summary</Text>
                {update.changes.map(change => (
                    <UpdateBullet key={change} text={change} />
                ))}
            </View>

            <View className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
                <View className="flex-row items-center mb-3">
                    <MaterialIcons name="code" size={16} color="#4B5563" style={{ marginRight: 6 }} />
                    <Text className="text-[10px] font-black text-gray-700 uppercase tracking-widest">Files Touched</Text>
                </View>
                {update.codeChanges.map(change => (
                    <UpdateBullet key={change} text={change} />
                ))}
            </View>
        </View>
    );
}

export default function UpdatesScreen() {
    return (
        <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, paddingBottom: 80 }}>
            <View className="bg-primary rounded-3xl p-6 mb-6 shadow-sm">
                <View className="w-14 h-14 rounded-2xl bg-white/10 items-center justify-center mb-4">
                    <MaterialIcons name="campaign" size={28} color="#FFFFFF" />
                </View>
                <Text className="text-white/90 text-xs font-bold uppercase tracking-[3px] mb-1">Repository History</Text>
                <Text className="text-white text-3xl font-black mb-2">What Changed</Text>
                <Text className="text-white/80 text-sm leading-5">
                    Full app change history generated from repository commits so staff can review what changed over time.
                </Text>
            </View>

            {APP_UPDATES.map((update, index) => (
                <UpdateCard key={update.id} update={update} isLatest={index === 0} />
            ))}
        </ScrollView>
    );
}
