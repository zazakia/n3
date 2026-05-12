import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, ActivityIndicator, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AuthService } from '../src/services/AuthService';
import { InfinityLogo } from '../src/components/InfinityLogo';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../src/components/AnimatedPressable';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, FadeIn, FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';

const ROLE_STYLES: Record<string, {
    gradient: [string, string];
    iconBg: string;
    icon: keyof typeof MaterialIcons.glyphMap;
    badge: string;
    badgeText: string;
}> = {
    admin: {
        gradient: ['#7F1D1D', '#991B1B'],
        iconBg: 'rgba(220, 38, 38, 0.25)',
        icon: 'admin-panel-settings',
        badge: 'rgba(239, 68, 68, 0.30)',
        badgeText: '#FCA5A5',
    },
    collector: {
        gradient: ['#064E3B', '#065F46'],
        iconBg: 'rgba(16, 185, 129, 0.25)',
        icon: 'directions-walk',
        badge: 'rgba(16, 185, 129, 0.30)',
        badgeText: '#A7F3D0',
    },
    loan_encoder: {
        gradient: ['#1E3A8A', '#1D4ED8'],
        iconBg: 'rgba(59, 130, 246, 0.25)',
        icon: 'post-add',
        badge: 'rgba(59, 130, 246, 0.30)',
        badgeText: '#BAD0FB',
    },
    payment_encoder: {
        gradient: ['#78350F', '#92400E'],
        iconBg: 'rgba(245, 158, 11, 0.25)',
        icon: 'payments',
        badge: 'rgba(245, 158, 11, 0.30)',
        badgeText: '#FDE68A',
    },
    expenses_encoder: {
        gradient: ['#4C1D95', '#5B21B6'],
        iconBg: 'rgba(139, 92, 246, 0.25)',
        icon: 'receipt-long',
        badge: 'rgba(139, 92, 246, 0.30)',
        badgeText: '#DDD6FE',
    },
    borrower: {
        gradient: ['#1E293B', '#334155'],
        iconBg: 'rgba(148, 163, 184, 0.25)',
        icon: 'person-outline',
        badge: 'rgba(148, 163, 184, 0.25)',
        badgeText: '#CBD5E1',
    },
};

const HARDCODED_USERS = [
    { id: 'cybergada', full_name: 'Cybergada Master', role: 'admin', email: 'cybergada@gmail.com' },
    { id: 'admin', full_name: 'Admin User', role: 'admin', email: 'admin@loanbrick.com' },
    { id: 'bisayang', full_name: 'Bisayang Collector', role: 'collector', email: 'bisayangcollector@gmail.com' },
    { id: 'master_collector', full_name: 'Master Collector', role: 'collector', email: 'collector@loanbrick.com' },
    { id: 'main_office', full_name: 'Main Office', role: 'collector', email: 'mainoffice@loanbrick.com' },
    { id: 'jayson', full_name: 'Jayson Cayanong', role: 'collector', email: 'jayson.cayanong@loanbrick.com' },
    { id: 'cresencio', full_name: 'Cresencio Junco', role: 'collector', email: 'cresencio.junco@loanbrick.com' },
    { id: 'gerald', full_name: 'Gerald Gera', role: 'collector', email: 'gerald.gera@loanbrick.com' },
    { id: 'bernie', full_name: 'Bernie Casera', role: 'collector', email: 'bernie.casera@loanbrick.com' },
    { id: 'encoder', full_name: 'Loan Encoder', role: 'loan_encoder', email: 'loan_encoder@loanbrick.com' },
    { id: 'test_member', full_name: 'Test Member', role: 'borrower', email: 'member.test@loanbrick.com' },
];

const PRIORITY_ORDER = [
    'cybergada@gmail.com',
    'admin@loanbrick.com',
    'member.test@loanbrick.com',
    'bisayangcollector@gmail.com',
    'collector@loanbrick.com',
    'mainoffice@loanbrick.com',
    'jayson.cayanong@loanbrick.com',
    'cresencio.junco@loanbrick.com',
    'gerald.gera@loanbrick.com',
    'bernie.casera@loanbrick.com',
    'loan_encoder@loanbrick.com',
];

function getInitials(name: string) {
    return name
        .split(' ')
        .slice(0, 2)
        .map(n => n[0])
        .join('')
        .toUpperCase();
}

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [activeEmail, setActiveEmail] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState('');
    const [quickUsers, setQuickUsers] = useState<any[]>([]);
    const router = useRouter();
    const quickLoginEnabled = AuthService.isQuickLoginEnabled();

    useEffect(() => {
        if (quickLoginEnabled) {
            loadQuickUsers();
        }
    }, [quickLoginEnabled]);

    async function loadQuickUsers() {
        try {
            const users = await AuthService.getQuickLoginUsers();
            setQuickUsers(users);
        } catch (e) {
            console.error('Failed to load quick users', e);
        }
    }

    async function signIn() {
        if (!email || !password) {
            setErrorMsg('Please enter both email and password.');
            return;
        }
        setLoading(true);
        setErrorMsg('');
        try {
            await AuthService.signIn(email, password);
            router.replace('/loading');
        } catch (error: any) {
            if (error.message?.includes('Email not confirmed')) {
                setErrorMsg('Account email not confirmed. Please check your inbox.');
            } else {
                setErrorMsg(error.message);
            }
            setLoading(false);
        }
    }

    // Merge remote + hardcoded, deduplicate by email
    const seenEmails = new Set<string>();
    const displayUsers: any[] = [];

    if (quickLoginEnabled) {
        quickUsers.forEach(u => {
            const uEmail = (u.email || '').toLowerCase();
            if (uEmail && !seenEmails.has(uEmail)) {
                seenEmails.add(uEmail);
                displayUsers.push(u);
            }
        });

        HARDCODED_USERS.forEach(u => {
            const uEmail = (u.email || '').toLowerCase();
            if (uEmail && !seenEmails.has(uEmail)) {
                seenEmails.add(uEmail);
                displayUsers.push(u);
            }
        });
    }

    displayUsers.sort((a, b) => {
        const aEmail = (a.email || '').toLowerCase();
        const bEmail = (b.email || '').toLowerCase();
        const aIdx = PRIORITY_ORDER.indexOf(aEmail);
        const bIdx = PRIORITY_ORDER.indexOf(bEmail);
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
        if (aIdx !== -1) return -1;
        if (bIdx !== -1) return 1;
        return (a.full_name || '').localeCompare(b.full_name || '');
    });

    async function handleQuickLogin(userEmail: string) {
        if (loading) return;
        setActiveEmail(userEmail);
        setLoading(true);
        setErrorMsg('');

        try {
            await AuthService.signIn(userEmail, '12345678');
            router.replace('/loading');
        } catch (error: any) {
            const msg = error.message?.includes('Email not confirmed')
                ? 'Account email not verified. Please contact admin.'
                : error.message || 'Login failed. Please try again.';
            setErrorMsg(msg);
            setLoading(false);
            setActiveEmail(null);
        }
    }

    return (
        <SafeAreaView className="flex-1">
            <LinearGradient
                colors={['#0F0C29', '#1E1B4B', '#0F172A']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                className="flex-1"
            >
                <ScrollView
                    contentContainerStyle={{ flexGrow: 1, paddingVertical: 40, paddingHorizontal: 20 }}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Header */}
                    <Animated.View
                        entering={FadeInDown.duration(600).springify()}
                        className="items-center mb-8"
                    >
                        <View
                            style={{
                                backgroundColor: 'rgba(255,255,255,0.05)',
                                borderWidth: 1,
                                borderColor: 'rgba(255,255,255,0.1)',
                                borderRadius: 28,
                                padding: 24,
                                marginBottom: 16,
                            }}
                        >
                            <InfinityLogo size="lg" />
                        </View>
                    </Animated.View>

                    {/* Error Message */}
                    {errorMsg ? (
                        <Animated.View
                            entering={FadeIn.duration(300)}
                            style={{
                                backgroundColor: 'rgba(239,68,68,0.12)',
                                borderWidth: 1,
                                borderColor: 'rgba(239,68,68,0.3)',
                                borderRadius: 16,
                                padding: 16,
                                flexDirection: 'row',
                                alignItems: 'center',
                                marginBottom: 20,
                                alignSelf: 'center',
                                width: '100%',
                                maxWidth: 420,
                            }}
                        >
                            <MaterialIcons name="error-outline" size={22} color="#F87171" />
                            <Text style={{ color: '#FCA5A5', marginLeft: 12, flex: 1, fontWeight: '700', fontSize: 14 }}>
                                {errorMsg}
                            </Text>
                        </Animated.View>
                    ) : null}

                    {/* Standard Login Form */}
                    <Animated.View
                        entering={FadeInUp.duration(600).delay(100).springify()}
                        style={{
                            width: '100%',
                            maxWidth: 420,
                            alignSelf: 'center',
                            backgroundColor: 'rgba(15,23,42,0.6)',
                            borderRadius: 32,
                            borderWidth: 1,
                            borderColor: 'rgba(255,255,255,0.08)',
                            padding: 24,
                            marginBottom: 24,
                        }}
                    >
                        <View className="mb-6">
                            <View>
                                <Text style={{ color: '#94A3B8', fontSize: 10, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8, marginLeft: 4 }}>Email Address</Text>
                                <View style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    backgroundColor: 'rgba(15,23,42,0.4)',
                                    borderWidth: 1,
                                    borderColor: 'rgba(255,255,255,0.1)',
                                    borderRadius: 16,
                                    paddingHorizontal: 16,
                                }}>
                                    <MaterialIcons name="alternate-email" size={20} color="#64748B" />
                                    <TextInput
                                        style={{ flex: 1, padding: 14, color: '#fff', fontWeight: '700', fontSize: 15 }}
                                        onChangeText={setEmail}
                                        value={email}
                                        placeholder="user@infinityfinance.com"
                                        autoCapitalize="none"
                                        keyboardType="email-address"
                                        editable={!loading}
                                        placeholderTextColor="#475569"
                                    />
                                </View>
                            </View>

                            <View style={{ marginTop: 20 }}>
                                <Text style={{ color: '#94A3B8', fontSize: 10, fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8, marginLeft: 4 }}>Password</Text>
                                <View style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    backgroundColor: 'rgba(15,23,42,0.4)',
                                    borderWidth: 1,
                                    borderColor: 'rgba(255,255,255,0.1)',
                                    borderRadius: 16,
                                    paddingHorizontal: 16,
                                }}>
                                    <MaterialIcons name="lock-outline" size={20} color="#64748B" />
                                    <TextInput
                                        style={{ flex: 1, padding: 14, color: '#fff', fontWeight: '700', fontSize: 15 }}
                                        onChangeText={setPassword}
                                        value={password}
                                        secureTextEntry={!showPassword}
                                        placeholder="••••••••"
                                        autoCapitalize="none"
                                        editable={!loading}
                                        placeholderTextColor="#475569"
                                    />
                                    <AnimatedPressable
                                        testID="password-toggle"
                                        onPress={() => setShowPassword(!showPassword)}
                                        style={{ padding: 4 }}
                                    >
                                        <Ionicons
                                            name={showPassword ? "eye-off-outline" : "eye-outline"}
                                            size={20}
                                            color="#64748B"
                                        />
                                    </AnimatedPressable>
                                </View>
                            </View>
                        </View>

                        <View style={{ alignItems: 'flex-end', marginBottom: 24 }}>
                            <AnimatedPressable>
                                <Text style={{ color: '#6366F1', fontWeight: '900', fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }}>Forgot Password?</Text>
                            </AnimatedPressable>
                        </View>

                        <AnimatedPressable
                            onPress={signIn}
                            disabled={loading}
                        >
                            <LinearGradient
                                colors={loading ? ['#94A3B8', '#64748B'] : ['#E11D48', '#BE123C']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={{
                                    height: 56,
                                    borderRadius: 16,
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    ...Platform.select({
                                        web: {
                                            boxShadow: '0 4px 8px 0 rgba(225, 29, 72, 0.3)',
                                        },
                                        default: {
                                            shadowColor: '#E11D48',
                                            shadowOffset: { width: 0, height: 4 },
                                            shadowOpacity: 0.3,
                                            shadowRadius: 8,
                                            elevation: 5,
                                        },
                                    }),
                                }}
                            >
                                {loading && !activeEmail ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14, letterSpacing: 2, textTransform: 'uppercase' }}>Sign In</Text>
                                )}
                            </LinearGradient>
                        </AnimatedPressable>

                        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 20 }}>
                            <Text style={{ color: '#64748B', fontWeight: '700', fontSize: 12 }}>New member?</Text>
                            <AnimatedPressable onPress={() => router.push('/register')} style={{ marginLeft: 8 }}>
                                <Text style={{ color: '#FB7185', fontWeight: '900', fontSize: 12 }}>Register Now</Text>
                            </AnimatedPressable>
                        </View>
                    </Animated.View>

                    {/* Quick Login Card */}
                    {quickLoginEnabled && <Animated.View
                        entering={FadeInUp.duration(600).delay(200).springify()}
                        style={{
                            width: '100%',
                            maxWidth: 420,
                            alignSelf: 'center',
                            backgroundColor: 'rgba(15,23,42,0.6)',
                            borderRadius: 32,
                            borderWidth: 1,
                            borderColor: 'rgba(255,255,255,0.08)',
                            padding: 24,
                            overflow: 'hidden',
                        }}
                    >
                        {/* Section header */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                            <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />
                            <Text style={{
                                paddingHorizontal: 16,
                                color: '#475569',
                                fontSize: 10,
                                fontWeight: '900',
                                letterSpacing: 3,
                                textTransform: 'uppercase',
                            }}>
                                Quick Access
                            </Text>
                            <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.06)' }} />
                        </View>

                        {/* User List */}
                        {displayUsers.length === 0 ? (
                            <View style={{ alignItems: 'center', paddingVertical: 12 }}>
                                <ActivityIndicator color="#6366F1" size="small" />
                                <Text style={{ color: '#475569', marginTop: 8, fontWeight: '600', fontSize: 12 }}>Loading accounts…</Text>
                            </View>
                        ) : (
                            displayUsers.map((u, index) => {
                                const normalizedRole = (u.role || '').toLowerCase();
                                const style = ROLE_STYLES[normalizedRole] || ROLE_STYLES.collector;
                                const userEmail = (u.email || '').toLowerCase();
                                const isActive = activeEmail === userEmail && loading;

                                return (
                                    <Animated.View
                                        key={u.id + index}
                                        entering={FadeInUp.duration(400).delay(index * 40).springify()}
                                    >
                                        <AnimatedPressable
                                            testID={`quick-login-${userEmail}`}
                                            data-testid={`quick-login-${userEmail}`}
                                            onPress={() => handleQuickLogin(userEmail)}
                                            disabled={loading}
                                            style={{ marginBottom: 10, opacity: loading && !isActive ? 0.5 : 1 }}
                                        >
                                            <LinearGradient
                                                colors={isActive
                                                    ? ['rgba(99,102,241,0.25)', 'rgba(99,102,241,0.1)']
                                                    : ['rgba(255,255,255,0.03)', 'rgba(255,255,255,0.01)']}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 0 }}
                                                style={{
                                                    flexDirection: 'row',
                                                    alignItems: 'center',
                                                    padding: 12,
                                                    borderRadius: 16,
                                                    borderWidth: 1,
                                                    borderColor: isActive
                                                        ? 'rgba(99,102,241,0.3)'
                                                        : 'rgba(255,255,255,0.05)',
                                                }}
                                            >
                                                {/* Avatar */}
                                                <LinearGradient
                                                    colors={style.gradient}
                                                    style={{
                                                        width: 40,
                                                        height: 40,
                                                        borderRadius: 12,
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        marginRight: 12,
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    {isActive ? (
                                                        <ActivityIndicator color="#fff" size="small" />
                                                    ) : (
                                                        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>
                                                            {getInitials(u.full_name || 'U')}
                                                        </Text>
                                                    )}
                                                </LinearGradient>

                                                {/* Name + email */}
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ color: '#E2E8F0', fontWeight: '800', fontSize: 13, marginBottom: 1 }} numberOfLines={1}>
                                                        {u.full_name || 'Unknown'}
                                                    </Text>
                                                    <Text style={{ color: '#94A3B8', fontWeight: '600', fontSize: 10 }} numberOfLines={1}>
                                                        {userEmail}
                                                    </Text>
                                                </View>

                                                {/* Role badge */}
                                                <View style={{
                                                    paddingHorizontal: 8,
                                                    paddingVertical: 3,
                                                    borderRadius: 8,
                                                    backgroundColor: style.badge,
                                                    marginLeft: 6,
                                                }}>
                                                    <Text style={{
                                                        color: style.badgeText,
                                                        fontSize: 8,
                                                        fontWeight: '900',
                                                        textTransform: 'uppercase',
                                                        letterSpacing: 0.5,
                                                    }}>
                                                        {normalizedRole.replace('_', ' ')}
                                                    </Text>
                                                </View>
                                            </LinearGradient>
                                        </AnimatedPressable>
                                    </Animated.View>
                                );
                            })
                        )}
                    </Animated.View>}

                    {/* Footer */}
                    <Animated.View
                        entering={FadeIn.duration(600).delay(500)}
                        style={{ marginTop: 24, marginBottom: 20, alignItems: 'center' }}
                    >
                        <Text style={{ color: '#64748B', fontSize: 10, fontWeight: '700', textAlign: 'center', letterSpacing: 1 }}>
                            INFINITYFINANCE - SECURE ACCESS
                        </Text>
                    </Animated.View>
                </ScrollView>
            </LinearGradient>
        </SafeAreaView>
    );
}
