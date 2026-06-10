import React from 'react';
import { View, Text } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
    Easing,
} from 'react-native-reanimated';
import { useCollectorTheme } from '../../hooks/useCollectorTheme';

interface CollectionProgressBarProps {
    /** Number of items collected */
    collected: number;
    /** Total number of items */
    total: number;
    /** Show the numeric label (default true) */
    showLabel?: boolean;
    /** Compact mode – thinner bar, no label (for use in headers) */
    compact?: boolean;
}

/**
 * Animated progress bar showing "X / Y collected".
 *
 * Used on the Dashboard (daily progress) and the Collection Sheet header.
 * Animates the fill width on mount and whenever `collected` changes.
 */
export function CollectionProgressBar({
    collected,
    total,
    showLabel = true,
    compact = false,
}: CollectionProgressBarProps) {
    const t = useCollectorTheme();
    const pct = total > 0 ? Math.min(100, (collected / total) * 100) : 0;

    // Animate the width
    const animatedWidth = useSharedValue(0);
    React.useEffect(() => {
        animatedWidth.value = withTiming(pct, {
            duration: 800,
            easing: Easing.out(Easing.cubic),
        });
    }, [pct]);

    const barStyle = useAnimatedStyle(() => ({
        width: `${animatedWidth.value}%`,
    }));

    // Color based on progress
    const barColorCls =
        pct >= 70
            ? t.sunlightMode ? 'bg-black' : 'bg-emerald-500'
            : pct >= 40
            ? t.sunlightMode ? 'bg-black' : 'bg-amber-500'
            : t.sunlightMode ? 'bg-black' : 'bg-red-500';

    const barTrackCls = t.sunlightMode
        ? `bg-gray-200 ${compact ? '' : 'border-2 border-black'}`
        : 'bg-gray-100';

    if (compact) {
        return (
            <View className={`h-1.5 rounded-full overflow-hidden ${barTrackCls}`}>
                <Animated.View
                    style={barStyle}
                    className={`h-full rounded-full ${barColorCls}`}
                />
            </View>
        );
    }

    return (
        <View>
            {showLabel && (
                <View className="flex-row justify-between items-center mb-2">
                    <Text className={`text-xs font-black ${t.cardSubtext}`}>
                        {collected} of {total} collected
                    </Text>
                    <Text className={`text-xs font-black ${t.cardText}`}>
                        {Math.round(pct)}%
                    </Text>
                </View>
            )}
            <View className={`${compact ? 'h-1.5' : 'h-3'} rounded-full overflow-hidden ${barTrackCls}`}>
                <Animated.View
                    style={barStyle}
                    className={`h-full rounded-full ${barColorCls}`}
                />
            </View>
        </View>
    );
}
