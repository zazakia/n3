import React, { useState } from 'react';
import { View, Text, Pressable, Modal, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, interpolateColor, useDerivedValue } from 'react-native-reanimated';
import { useAppStore, AccountingBasis } from '../store/useAppStore';

interface AccountingBasisToggleProps {
    /** Compact mode: smaller text and padding, for use inside report headers */
    compact?: boolean;
    /** Override the value (controlled mode). If not provided, reads from global store. */
    value?: AccountingBasis;
    /** Override the setter (controlled mode). If not provided, writes to global store. */
    onChange?: (basis: AccountingBasis) => void;
}

export function AccountingBasisToggle({ compact = false, value, onChange }: AccountingBasisToggleProps) {
    const { accountingBasis: storedBasis, setAccountingBasis } = useAppStore();
    const [infoVisible, setInfoVisible] = useState(false);

    const activeBasis = value ?? storedBasis;
    const handleChange = onChange ?? setAccountingBasis;

    const isCash = activeBasis === 'cash';

    const progress = useSharedValue(isCash ? 1 : 0);

    React.useEffect(() => {
        progress.value = withSpring(isCash ? 1 : 0, { damping: 20, stiffness: 200 });
    }, [activeBasis]);

    const accrualPillStyle = useAnimatedStyle(() => ({
        backgroundColor: interpolateColor(
            progress.value,
            [0, 1],
            ['#1A237E', 'transparent']
        ),
    }));

    const cashPillStyle = useAnimatedStyle(() => ({
        backgroundColor: interpolateColor(
            progress.value,
            [0, 1],
            ['transparent', '#059669']
        ),
    }));

    const paddingV = compact ? 6 : 8;
    const paddingH = compact ? 10 : 16;
    const fontSize = compact ? 11 : 12;

    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {/* Segmented toggle */}
            <View
                style={{
                    flexDirection: 'row',
                    backgroundColor: '#F1F5F9',
                    borderRadius: 100,
                    padding: 3,
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                }}
            >
                {/* Accrual segment */}
                <Pressable onPress={() => handleChange('accrual')} style={{ borderRadius: 100, overflow: 'hidden' }}>
                    <Animated.View
                        style={[
                            accrualPillStyle,
                            { paddingVertical: paddingV, paddingHorizontal: paddingH, borderRadius: 100 },
                        ]}
                    >
                        <Text
                            style={{
                                fontSize,
                                fontWeight: '800',
                                color: activeBasis === 'accrual' ? '#FFFFFF' : '#64748B',
                                letterSpacing: 0.3,
                            }}
                        >
                            Accrual
                        </Text>
                    </Animated.View>
                </Pressable>

                {/* Cash segment */}
                <Pressable onPress={() => handleChange('cash')} style={{ borderRadius: 100, overflow: 'hidden' }}>
                    <Animated.View
                        style={[
                            cashPillStyle,
                            { paddingVertical: paddingV, paddingHorizontal: paddingH, borderRadius: 100 },
                        ]}
                    >
                        <Text
                            style={{
                                fontSize,
                                fontWeight: '800',
                                color: activeBasis === 'cash' ? '#FFFFFF' : '#64748B',
                                letterSpacing: 0.3,
                            }}
                        >
                            Cash
                        </Text>
                    </Animated.View>
                </Pressable>
            </View>

            {/* Info icon */}
            <Pressable
                onPress={() => setInfoVisible(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ padding: 2 }}
            >
                <MaterialIcons name="info-outline" size={compact ? 16 : 18} color="#94A3B8" />
            </Pressable>

            {/* Info Modal */}
            <Modal visible={infoVisible} transparent animationType="fade" onRequestClose={() => setInfoVisible(false)}>
                <Pressable
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 }}
                    onPress={() => setInfoVisible(false)}
                >
                    <Pressable
                        style={{ backgroundColor: '#FFF', borderRadius: 28, padding: 28, width: '100%', maxWidth: 380 }}
                        onPress={() => {}} // prevent close on inner press
                    >
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                            <View style={{ backgroundColor: '#EEF2FF', width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                                <MaterialIcons name="account-balance" size={22} color="#4338CA" />
                            </View>
                            <Text style={{ fontSize: 18, fontWeight: '900', color: '#0F172A', flex: 1 }}>
                                Accounting Basis
                            </Text>
                            <Pressable onPress={() => setInfoVisible(false)}>
                                <MaterialIcons name="close" size={22} color="#94A3B8" />
                            </Pressable>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {/* Accrual */}
                            <View style={{ backgroundColor: '#EEF2FF', borderRadius: 16, padding: 16, marginBottom: 12 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                    <View style={{ backgroundColor: '#1A237E', borderRadius: 8, paddingVertical: 3, paddingHorizontal: 10, marginRight: 8 }}>
                                        <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '800' }}>ACCRUAL</Text>
                                    </View>
                                    <Text style={{ color: '#4338CA', fontSize: 11, fontWeight: '700' }}>Default · MFI Standard</Text>
                                </View>
                                <Text style={{ color: '#1E293B', fontSize: 13, lineHeight: 20 }}>
                                    Interest income is recognized proportionally as payments are collected, allocated across the loan's interest balance. This is the{' '}
                                    <Text style={{ fontWeight: '800' }}>GAAP-aligned and BSP/SEC-required</Text>{' '}
                                    method for MFI regulatory reporting (OSS, FSS).
                                </Text>
                                <Text style={{ color: '#6366F1', fontSize: 12, marginTop: 8, fontWeight: '600' }}>
                                    Best for: Formal reports, investor presentations, regulatory compliance
                                </Text>
                            </View>

                            {/* Cash */}
                            <View style={{ backgroundColor: '#ECFDF5', borderRadius: 16, padding: 16, marginBottom: 16 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                    <View style={{ backgroundColor: '#059669', borderRadius: 8, paddingVertical: 3, paddingHorizontal: 10, marginRight: 8 }}>
                                        <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '800' }}>CASH</Text>
                                    </View>
                                    <Text style={{ color: '#065F46', fontSize: 11, fontWeight: '700' }}>Cash-in View</Text>
                                </View>
                                <Text style={{ color: '#1E293B', fontSize: 13, lineHeight: 20 }}>
                                    Income is recognized only when cash is physically received. Shows the interest-share of actual payments collected in the reporting period — useful for cash flow management.
                                </Text>
                                <Text style={{ color: '#059669', fontSize: 12, marginTop: 8, fontWeight: '600' }}>
                                    Best for: Internal cash flow management, tax preparation
                                </Text>
                            </View>

                            <View style={{ backgroundColor: '#FFF7ED', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'flex-start' }}>
                                <MaterialIcons name="info" size={16} color="#EA580C" style={{ marginRight: 8, marginTop: 1 }} />
                                <Text style={{ color: '#92400E', fontSize: 12, flex: 1, lineHeight: 18 }}>
                                    The Balance Sheet and MFI KPIs (OSS/FSS) are always shown on an accrual basis, regardless of this setting.
                                </Text>
                            </View>
                        </ScrollView>
                    </Pressable>
                </Pressable>
            </Modal>
        </View>
    );
}
