import React from 'react';
import { View, Text, Platform, StyleSheet } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { AnimatedPressable } from '../AnimatedPressable';
import { useCollectorTheme } from '../../hooks/useCollectorTheme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ─── Tab definitions ─────────────────────────────────────────────

interface TabDef {
    key: string;
    label: string;
    icon: keyof typeof MaterialIcons.glyphMap;
    route: string;
    /** Routes that should also mark this tab as active */
    matchPrefixes?: string[];
}

const TABS: TabDef[] = [
    {
        key: 'home',
        label: 'Home',
        icon: 'home',
        route: '/(collector)',
        matchPrefixes: ['/(collector)'],
    },
    {
        key: 'collect',
        label: 'Collect',
        icon: 'assignment',
        route: '/(collector)/collection-sheet',
        matchPrefixes: ['/(collector)/collection-sheet', '/(collector)/borrowers'],
    },
    {
        key: 'reports',
        label: 'Reports',
        icon: 'assessment',
        route: '/(collector)/reports',
        matchPrefixes: ['/(collector)/reports', '/(collector)/collection-sheet-daily', '/(collector)/collection-sheet-weekly'],
    },
    {
        key: 'account',
        label: 'Account',
        icon: 'account-circle',
        route: '/(collector)/remittances',
        matchPrefixes: ['/(collector)/remittances', '/(collector)/help'],
    },
];

// ─── Screens where the tab bar should be hidden ──────────────────

const HIDDEN_ON_ROUTES = [
    '/(payment-encoder)',
];

// ─── Component ───────────────────────────────────────────────────

interface CollectorTabBarProps {
    /** Optional badge count for the Collect tab */
    pendingCount?: number;
}

export function CollectorTabBar({ pendingCount }: CollectorTabBarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const t = useCollectorTheme();

    // Hide tab bar on certain routes
    const shouldHide = HIDDEN_ON_ROUTES.some(r => pathname.startsWith(r));
    if (shouldHide) return null;

    const getActiveTab = (): string => {
        // Exact match for home (index)
        if (pathname === '/(collector)' || pathname === '/(collector)/') {
            return 'home';
        }
        // Check each tab's match prefixes (longest prefix first for specificity)
        for (const tab of [...TABS].reverse()) {
            if (tab.matchPrefixes?.some(prefix => pathname.startsWith(prefix))) {
                return tab.key;
            }
        }
        return 'home';
    };

    const activeTab = getActiveTab();

    const handlePress = (tab: TabDef) => {
        if (tab.key === activeTab) return; // Already on this tab
        if (Platform.OS !== 'web') {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        router.push(tab.route as any);
    };

    return (
        <View
            style={[
                styles.container,
                {
                    paddingBottom: Math.max(insets.bottom, 8),
                    backgroundColor: t.sunlightMode ? '#FFFFFF' : '#FFFFFF',
                    borderTopColor: t.sunlightMode ? '#000000' : '#E2E8F0',
                    borderTopWidth: t.sunlightMode ? 3 : 1,
                },
            ]}
        >
            <View style={styles.tabRow}>
                {TABS.map(tab => {
                    const isActive = tab.key === activeTab;
                    const showBadge = tab.key === 'collect' && pendingCount != null && pendingCount > 0;

                    return (
                        <TabItem
                            key={tab.key}
                            tab={tab}
                            isActive={isActive}
                            showBadge={showBadge}
                            badgeCount={pendingCount}
                            onPress={() => handlePress(tab)}
                            sunlightMode={t.sunlightMode}
                            accentColor={t.colorAccent}
                        />
                    );
                })}
            </View>
        </View>
    );
}

// ─── Individual Tab ──────────────────────────────────────────────

interface TabItemProps {
    tab: TabDef;
    isActive: boolean;
    showBadge: boolean;
    badgeCount?: number;
    onPress: () => void;
    sunlightMode: boolean;
    accentColor: string;
}

function TabItem({ tab, isActive, showBadge, badgeCount, onPress, sunlightMode, accentColor }: TabItemProps) {
    // Animated indicator dot
    const dotScale = useSharedValue(isActive ? 1 : 0);
    React.useEffect(() => {
        dotScale.value = withSpring(isActive ? 1 : 0, { damping: 15, stiffness: 200 });
    }, [isActive]);

    const dotStyle = useAnimatedStyle(() => ({
        transform: [{ scale: dotScale.value }],
        opacity: dotScale.value,
    }));

    const iconColor = isActive
        ? accentColor
        : sunlightMode ? '#9CA3AF' : '#9CA3AF';
    const labelColor = isActive
        ? accentColor
        : sunlightMode ? '#6B7280' : '#9CA3AF';

    return (
        <AnimatedPressable
            onPress={onPress}
            haptic={false}
            scaleFactor={0.9}
            style={styles.tabItem}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab.label}
        >
            <View style={styles.iconContainer}>
                <MaterialIcons name={tab.icon} size={24} color={iconColor} />
                {showBadge && (
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>
                            {(badgeCount ?? 0) > 99 ? '99+' : badgeCount}
                        </Text>
                    </View>
                )}
            </View>
            <Text
                style={[styles.label, { color: labelColor, fontWeight: isActive ? '800' : '600' }]}
                numberOfLines={1}
            >
                {tab.label}
            </Text>
            <Animated.View
                style={[
                    styles.activeDot,
                    dotStyle,
                    { backgroundColor: accentColor },
                ]}
            />
        </AnimatedPressable>
    );
}

// ─── Styles ──────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingTop: 8,
    },
    tabRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
    },
    tabItem: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 4,
    },
    iconContainer: {
        position: 'relative',
        marginBottom: 2,
    },
    badge: {
        position: 'absolute',
        top: -4,
        right: -10,
        backgroundColor: '#EF4444',
        borderRadius: 10,
        minWidth: 18,
        height: 18,
        paddingHorizontal: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    badgeText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: '800',
    },
    label: {
        fontSize: 10,
        letterSpacing: 0.3,
    },
    activeDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        marginTop: 3,
    },
});
