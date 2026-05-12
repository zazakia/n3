import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { PhpCurrencyText } from './PhpCurrencyText';

interface Props {
    title: string;
    value: number | string;
    icon: keyof typeof MaterialIcons.glyphMap;
    color: string;
    onPress?: () => void;
    onInfoPress?: () => void;
    isCurrency?: boolean;
    subtitle?: string;
}

export function StatCard({ title, value, icon, color, onPress, onInfoPress, isCurrency = false, subtitle }: Props) {
    const Component = onPress ? Pressable : View;

    return (
        <Component
            className={`bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex-1 m-2 ${onPress ? 'active:opacity-70' : ''}`}
            onPress={onPress}
            style={{ minWidth: 150 }}
        >
            <View className="flex-row items-center justify-between mb-3">
                <View className={`p-2 rounded-xl ${color.replace('text-', 'bg-').replace('-600', '-100')}`}>
                    <MaterialIcons name={icon} size={24} color={color} />
                </View>
                {onInfoPress && (
                    <Pressable 
                        onPress={onInfoPress} 
                        className="p-1 items-center justify-center -mr-2 bg-gray-50 rounded-full active:bg-gray-200"
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <MaterialIcons name="info-outline" size={20} color="#9CA3AF" />
                    </Pressable>
                )}
            </View>

            <View>
                <Text className="text-gray-700 text-xs font-bold uppercase tracking-wider mb-1" numberOfLines={1}>
                    {title}
                </Text>

                {isCurrency && typeof value === 'number' ? (
                    <PhpCurrencyText amount={value} className="text-2xl font-extrabold text-gray-900 tracking-tight" />
                ) : (
                    <Text className="text-2xl font-extrabold text-gray-900 tracking-tight">{value}</Text>
                )}

                {!!subtitle && (
                    <Text className="text-xs text-gray-700 mt-1">{subtitle}</Text>
                )}
            </View>
        </Component>
    );
}
