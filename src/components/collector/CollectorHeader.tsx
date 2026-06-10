import React from 'react';
import { View, Text, StatusBar, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AnimatedPressable } from '../AnimatedPressable';
import { SyncStatusIndicator } from '../SyncStatusIndicator';
import { useCollectorTheme } from '../../hooks/useCollectorTheme';
import { safeBack } from '../../utils/navigation';
import Animated, { FadeInUp } from 'react-native-reanimated';

interface CollectorHeaderProps {
    /** Small label above the title (e.g. "Daily Operations") */
    label?: string;
    /** Screen title (e.g. "Collection Sheet") */
    title: string;
    /** Show back arrow (default true for sub-screens, false for tab roots) */
    showBack?: boolean;
    /** Custom fallback route for back navigation */
    backFallback?: string;
    /** Show sync status indicator (default true) */
    showSync?: boolean;
    /** Additional content rendered below the title inside the header */
    children?: React.ReactNode;
    /** Bottom padding of the header — use larger values when content overlaps */
    paddingBottom?: number;
    /** testID for the title text */
    testID?: string;
}

/**
 * Shared gradient/sunlight header used across all Collector screens.
 *
 * Eliminates the duplicated sunlight / normal JSX blocks that previously
 * existed in every single collector screen file.
 */
export function CollectorHeader({
    label,
    title,
    showBack = true,
    backFallback = '/(collector)',
    showSync = true,
    children,
    paddingBottom = 56,
    testID,
}: CollectorHeaderProps) {
    const router = useRouter();
    const t = useCollectorTheme();

    const headerContent = (
        <>
            <View className="flex-row justify-between items-center mb-6">
                <View className="flex-row items-center">
                    {showBack && (
                        <AnimatedPressable
                            onPress={() => safeBack(router, backFallback)}
                            className={t.backBtnCls}
                        >
                            <MaterialIcons name="arrow-back" size={24} color={t.backBtnIconColor} />
                        </AnimatedPressable>
                    )}
                    <View>
                        {label && (
                            <Text className={t.headerLabelCls}>{label}</Text>
                        )}
                        <Text testID={testID} className={t.headerTitleCls}>{title}</Text>
                    </View>
                </View>
                {showSync && <SyncStatusIndicator />}
            </View>

            {children && (
                <Animated.View entering={FadeInUp}>
                    {children}
                </Animated.View>
            )}
        </>
    );

    if (t.sunlightMode) {
        return (
            <>
                <StatusBar barStyle="dark-content" />
                <View
                    className={`px-6 rounded-b-[48px] ${t.headerFlatCls}`}
                    style={{ paddingTop: Platform.OS === 'ios' ? 12 : 12, paddingBottom }}
                >
                    {headerContent}
                </View>
            </>
        );
    }

    return (
        <>
            <StatusBar barStyle="light-content" />
            <LinearGradient
                colors={t.headerGradientColors!}
                className="px-6 rounded-b-[48px] shadow-2xl"
                style={{ paddingTop: Platform.OS === 'ios' ? 12 : 12, paddingBottom }}
            >
                {headerContent}
            </LinearGradient>
        </>
    );
}
