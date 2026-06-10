import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useCollectorTheme } from '../../hooks/useCollectorTheme';

interface AreaSectionHeaderProps {
    /** Area name (e.g. "Market Area") */
    area: string;
    /** Number of pending collections in this area */
    pendingCount: number;
    /** Whether this area has overdue items */
    hasOverdue?: boolean;
    /** Whether the section is collapsed */
    isCollapsed: boolean;
    /** Toggle collapse */
    onToggle: () => void;
    /** Animation delay (for staggered entry) */
    delay?: number;
}

/**
 * Sticky section header for area-based grouping in the Collection Sheet.
 *
 * Shows area name, pending count, overdue indicator, and
 * expand/collapse toggle.
 */
export function AreaSectionHeader({
    area,
    pendingCount,
    hasOverdue = false,
    isCollapsed,
    onToggle,
    delay = 0,
}: AreaSectionHeaderProps) {
    const t = useCollectorTheme();

    return (
        <Animated.View entering={FadeInDown.delay(delay)}>
            <Pressable
                onPress={onToggle}
                className={`flex-row items-center justify-between px-4 py-3 rounded-2xl mb-2 ${
                    t.sunlightMode
                        ? 'bg-gray-100 border-2 border-black'
                        : 'bg-gray-50 border border-gray-100'
                }`}
            >
                <View className="flex-row items-center flex-1">
                    <MaterialIcons
                        name="place"
                        size={18}
                        color={hasOverdue ? '#EF4444' : t.colorAccent}
                    />
                    <Text
                        className={`ml-2 font-black text-sm ${t.cardText}`}
                        numberOfLines={1}
                    >
                        {area}
                    </Text>
                    <View
                        className={`ml-2 px-2 py-0.5 rounded-full ${
                            hasOverdue
                                ? t.sunlightMode ? 'bg-black' : 'bg-red-100'
                                : t.sunlightMode ? 'bg-black' : 'bg-gray-200'
                        }`}
                    >
                        <Text
                            className={`text-[10px] font-black ${
                                hasOverdue
                                    ? t.sunlightMode ? 'text-white' : 'text-red-600'
                                    : t.sunlightMode ? 'text-white' : 'text-gray-600'
                            }`}
                        >
                            {pendingCount}
                        </Text>
                    </View>
                </View>
                <MaterialIcons
                    name={isCollapsed ? 'expand-more' : 'expand-less'}
                    size={22}
                    color={t.sunlightMode ? '#000' : '#9CA3AF'}
                />
            </Pressable>
        </Animated.View>
    );
}
