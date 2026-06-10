import React from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity, Animated as RNAnimated, StyleSheet } from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { formatPHP } from '../../utils/currency';
import { AnimatedPressable } from '../AnimatedPressable';
import { useCollectorTheme } from '../../hooks/useCollectorTheme';
import Borrower from '../../database/models/Borrower';
import Loan from '../../database/models/Loan';
import PaymentSchedule from '../../database/models/PaymentSchedule';

export interface CollectionItem {
    borrower: Borrower;
    loan: Loan;
    schedule: PaymentSchedule;
}

interface CollectionCardProps {
    item: CollectionItem;
    isOverdue: boolean;
    isProcessing: boolean;
    onQuickCollect: () => void;
    onViewPassbook: () => void;
    onCall?: () => void;
    onWhatsApp?: () => void;
    /** Number of days overdue (0 if not overdue) */
    overdueDays?: number;
}

/**
 * A single collection item card used in the Field List.
 *
 * Features:
 * - Compact layout with avatar initial, name, area, amount
 * - Quick Collect circle button (right side)
 * - Swipe left to reveal: View Passbook, Call, WhatsApp
 * - Overdue visual treatment (red accent)
 * - Sunlight mode via useCollectorTheme
 */
export function CollectionCard({
    item,
    isOverdue,
    isProcessing,
    onQuickCollect,
    onViewPassbook,
    onCall,
    onWhatsApp,
    overdueDays = 0,
}: CollectionCardProps) {
    const t = useCollectorTheme();

    const renderRightActions = (
        _progress: RNAnimated.AnimatedInterpolation<number>,
        _dragX: RNAnimated.AnimatedInterpolation<number>,
    ) => (
        <View style={styles.rightActionsContainer}>
            <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: '#3B82F6' }]}
                onPress={onViewPassbook}
            >
                <Ionicons name="person" size={20} color="#FFF" />
                <Text style={styles.actionText}>Passbook</Text>
            </TouchableOpacity>
            {onCall && (
                <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: '#059669' }]}
                    onPress={onCall}
                >
                    <Ionicons name="call" size={20} color="#FFF" />
                    <Text style={styles.actionText}>Call</Text>
                </TouchableOpacity>
            )}
            {onWhatsApp && (
                <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: '#22C55E' }]}
                    onPress={onWhatsApp}
                >
                    <Ionicons name="logo-whatsapp" size={20} color="#FFF" />
                    <Text style={styles.actionText}>Chat</Text>
                </TouchableOpacity>
            )}
        </View>
    );

    const avatarBgCls = isOverdue ? t.overdueAvatarCls : t.sunlightMode ? 'bg-black border-black' : 'bg-teal-500 border-teal-500';

    return (
        <Swipeable
            renderRightActions={renderRightActions}
            friction={2}
            rightThreshold={40}
            overshootRight={false}
        >
            <View
                className={`flex-row items-center p-4 rounded-[24px] mb-3 border ${
                    t.sunlightMode
                        ? 'bg-white border-4 border-black'
                        : isOverdue
                        ? 'border-red-100 bg-red-50/30'
                        : 'border-gray-50 bg-white shadow-sm'
                }`}
            >
                {/* Avatar */}
                <View className={`w-12 h-12 rounded-2xl items-center justify-center mr-3 border ${avatarBgCls}`}>
                    <Text className="text-white font-black text-lg">
                        {item.borrower.fullName.charAt(0)}
                    </Text>
                </View>

                {/* Name & meta */}
                <View className="flex-1 mr-3">
                    <Text
                        className={`${t.cardText} font-black text-base leading-tight`}
                        numberOfLines={1}
                    >
                        {item.borrower.fullName}
                    </Text>
                    <View className="flex-row items-center mt-1 flex-wrap gap-1">
                        {/* Status badge */}
                        <View className={`px-2 py-0.5 rounded-full ${isOverdue ? t.overdueBadgeCls : t.sunlightMode ? 'bg-gray-200' : 'bg-gray-100'}`}>
                            <Text className={`text-[9px] font-black uppercase tracking-tighter ${
                                isOverdue
                                    ? t.overdueBadgeTextCls
                                    : t.sunlightMode ? 'text-black' : 'text-gray-600'
                            }`}>
                                {isOverdue ? `Overdue ${overdueDays}d` : 'Due Today'}
                            </Text>
                        </View>
                        {/* Area */}
                        <View className="flex-row items-center">
                            <Ionicons name="navigate-circle" size={12} color={t.sunlightMode ? '#000' : '#9CA3AF'} />
                            <Text
                                className={`${t.sunlightMode ? 'text-black' : 'text-gray-500'} text-[10px] font-bold ml-0.5`}
                                numberOfLines={1}
                            >
                                {item.borrower.area || 'Field'}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* Amount & Quick Collect */}
                <View className="items-end">
                    <Text className={`${t.cardText} font-black text-lg tracking-tighter`}>
                        {formatPHP(item.schedule.scheduledAmount)}
                    </Text>
                    <AnimatedPressable
                        onPress={onQuickCollect}
                        disabled={isProcessing}
                        className={`mt-1.5 w-10 h-10 rounded-xl items-center justify-center ${
                            t.sunlightMode
                                ? 'bg-black'
                                : isOverdue
                                ? 'bg-red-600'
                                : 'bg-teal-600'
                        }`}
                    >
                        {isProcessing ? (
                            <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                            <Ionicons name="flash" size={18} color="#FFF" />
                        )}
                    </AnimatedPressable>
                </View>
            </View>
        </Swipeable>
    );
}

const styles = StyleSheet.create({
    rightActionsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        marginLeft: 4,
    },
    actionButton: {
        width: 64,
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 16,
        marginLeft: 4,
    },
    actionText: {
        color: '#FFF',
        fontSize: 10,
        fontWeight: '700',
        marginTop: 2,
    },
});
