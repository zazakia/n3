import React, { useState } from 'react';
import { View, Text, TextInput, SafeAreaView, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { AuthService } from '../src/services/AuthService';
import { BorrowerPortalService } from '../src/services/BorrowerPortalService';
import { InfinityLogo } from '../src/components/InfinityLogo';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { AnimatedPressable } from '../src/components/AnimatedPressable';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp, FadeIn } from 'react-native-reanimated';

export default function RegisterScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [loading, setLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const router = useRouter();

    async function handleRegister() {
        if (!email || !password || !fullName || !phone) {
            setErrorMsg('Please fill in all fields (including phone number).');
            return;
        }
        
        if (password.length < 8) {
            setErrorMsg('Password must be at least 8 characters long.');
            return;
        }

        setLoading(true);
        setErrorMsg('');
        setSuccessMsg('');
        
        try {
            const res = await BorrowerPortalService.registerBorrower(email, password, fullName, phone);
            
            if (res.success) {
                setSuccessMsg(res.message);
                // Clear form
                setEmail('');
                setPassword('');
                setFullName('');
                setPhone('');
            } else {
                setErrorMsg(res.message);
            }
        } catch (error: any) {
            setErrorMsg(error.message || 'An unexpected error occurred during registration.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <SafeAreaView className="flex-1">
            <LinearGradient
                colors={['#1E1B4B', '#1E3A8A', '#0F172A']}
                className="flex-1"
            >
                <ScrollView 
                    contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}
                    showsVerticalScrollIndicator={false}
                >
                    <Animated.View 
                        entering={FadeInUp.duration(600).springify()}
                        className="w-full max-w-md bg-slate-900/60 rounded-[40px] p-8 shadow-2xl overflow-hidden border border-white/10"
                        style={{ backdropFilter: 'blur(20px)' } as any}
                    >
                        {/* Logo Section */}
                        <View className="mb-10 items-center">
                            <View className="bg-white/5 p-6 rounded-3xl border border-white/10">
                                <InfinityLogo size="lg" />
                            </View>
                            <Text className="text-slate-700 mt-4 font-bold tracking-widest uppercase text-[10px]">Create Your Account</Text>
                        </View>

                        {/* Error Message */}
                        {errorMsg ? (
                            <Animated.View 
                                entering={FadeIn.duration(400)}
                                className="bg-rose-50 p-4 rounded-2xl border border-rose-100 mb-6 flex-row items-center"
                            >
                                <MaterialIcons name="error-outline" size={22} color="#E11D48" />
                                <Text className="text-rose-700 ml-3 flex-1 font-bold text-sm">
                                    {errorMsg}
                                </Text>
                            </Animated.View>
                        ) : null}

                        {/* Success Message */}
                        {successMsg ? (
                            <Animated.View 
                                entering={FadeIn.duration(400)}
                                className="bg-emerald-50 p-4 rounded-2xl border border-emerald-100 mb-6 flex-row items-center"
                            >
                                <MaterialIcons name="check-circle-outline" size={22} color="#10B981" />
                                <Text className="text-emerald-700 ml-3 flex-1 font-bold text-sm">
                                    {successMsg}
                                </Text>
                            </Animated.View>
                        ) : null}

                        {/* Form Fields */}
                        <View className="mb-8">
                            <View>
                                <Text className="text-[11px] font-black text-slate-700 mb-2 uppercase tracking-[2px] ml-1">Full Name</Text>
                                <View className="flex-row items-center bg-slate-800/50 border-2 border-white/5 rounded-2xl px-4">
                                    <MaterialIcons name="person-outline" size={20} color="#94A3B8" />
                                    <TextInput
                                        className="flex-1 p-4 text-base text-white font-bold"
                                        onChangeText={setFullName}
                                        value={fullName}
                                        placeholder="Juan Dela Cruz"
                                        editable={!loading}
                                        placeholderTextColor="#64748B"
                                    />
                                </View>
                            </View>

                            <View className="mt-5">
                                <Text className="text-[11px] font-black text-slate-700 mb-2 uppercase tracking-[2px] ml-1">Phone Number</Text>
                                <View className="flex-row items-center bg-slate-800/50 border-2 border-white/5 rounded-2xl px-4">
                                    <MaterialIcons name="phone" size={20} color="#94A3B8" />
                                    <TextInput
                                        className="flex-1 p-4 text-base text-white font-bold"
                                        onChangeText={setPhone}
                                        value={phone}
                                        placeholder="+63 912 345 6789"
                                        keyboardType="phone-pad"
                                        editable={!loading}
                                        placeholderTextColor="#64748B"
                                    />
                                </View>
                            </View>

                            <View className="mt-5">
                                <Text className="text-[11px] font-black text-slate-700 mb-2 uppercase tracking-[2px] ml-1">Email Address</Text>
                                <View className="flex-row items-center bg-slate-800/50 border-2 border-white/5 rounded-2xl px-4">
                                    <MaterialIcons name="alternate-email" size={20} color="#94A3B8" />
                                    <TextInput
                                        className="flex-1 p-4 text-base text-white font-bold"
                                        onChangeText={setEmail}
                                        value={email}
                                        placeholder="user@infinityfinance.com"
                                        autoCapitalize="none"
                                        keyboardType="email-address"
                                        editable={!loading}
                                        placeholderTextColor="#64748B"
                                    />
                                </View>
                            </View>

                            <View className="mt-5">
                                <Text className="text-[11px] font-black text-slate-700 mb-2 uppercase tracking-[2px] ml-1">Password</Text>
                                <View className="flex-row items-center bg-slate-800/50 border-2 border-white/5 rounded-2xl px-4">
                                    <MaterialIcons name="lock-outline" size={20} color="#94A3B8" />
                                    <TextInput
                                        className="flex-1 p-4 text-base text-white font-bold"
                                        onChangeText={setPassword}
                                        value={password}
                                        secureTextEntry={!showPassword}
                                        placeholder="••••••••"
                                        autoCapitalize="none"
                                        editable={!loading}
                                        placeholderTextColor="#64748B"
                                    />
                                    <AnimatedPressable 
                                        onPress={() => setShowPassword(!showPassword)}
                                        className="p-2"
                                    >
                                        <Ionicons 
                                            name={showPassword ? "eye-off-outline" : "eye-outline"} 
                                            size={22} 
                                            color="#94A3B8" 
                                        />
                                    </AnimatedPressable>
                                </View>
                            </View>
                        </View>

                        {/* Action Buttons */}
                        <AnimatedPressable
                            onPress={handleRegister}
                            disabled={loading}
                        >
                            <LinearGradient
                                colors={loading ? ['#FDA4AF', '#F43F5E'] : ['#E11D48', '#BE123C']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                className="w-full h-16 rounded-2xl justify-center items-center shadow-lg shadow-rose-500/40"
                            >
                                {loading ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text className="text-white font-black text-lg tracking-widest uppercase">
                                        Register
                                    </Text>
                                )}
                            </LinearGradient>
                        </AnimatedPressable>

                        <View className="flex-row justify-center mt-8">
                            <Text className="text-slate-700 font-bold">Already have an account?</Text>
                            <AnimatedPressable onPress={() => router.back()} className="ml-2">
                                <Text className="text-rose-400 font-black">Sign In</Text>
                            </AnimatedPressable>
                        </View>

                        <View className="mt-12 items-center">
                            <Text className="text-slate-700 text-[10px] text-center px-4 leading-4 font-medium uppercase tracking-widest">
                                Data protected by standard end-to-end encryption protocols.
                            </Text>
                        </View>
                    </Animated.View>
                </ScrollView>
            </LinearGradient>
        </SafeAreaView>
    );
}

