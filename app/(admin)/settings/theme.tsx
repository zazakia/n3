import React, { useState } from 'react';
import { View, Text, ScrollView, Switch, Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeStore, THEME_PALETTES } from '../../../src/store/useThemeStore';
import { Colors, DarkColors } from '../../../src/constants/colors';
import { AnimatedPressable } from '../../../src/components/AnimatedPressable';
import { Stack } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Utility to determine if text should be dark or light based on bg color
const getContrastColor = (hexcolor: string) => {
    // If a leading # is provided, remove it
    if (hexcolor.slice(0, 1) === '#') {
        hexcolor = hexcolor.slice(1);
    }
    // If a three-character hexcode, make six-character
    if (hexcolor.length === 3) {
        hexcolor = hexcolor.split('').map(function (hex) {
            return hex + hex;
        }).join('');
    }
    // Convert to RGB value
    const r = parseInt(hexcolor.substr(0, 2), 16);
    const g = parseInt(hexcolor.substr(2, 2), 16);
    const b = parseInt(hexcolor.substr(4, 2), 16);

    // Get YIQ ratio
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;

    // Check contrast
    return (yiq >= 128) ? '#000000' : '#FFFFFF';
};

export default function ThemeCustomizationScreen() {
    const { colors, setColors, resetColors, isDarkMode, setDarkMode } = useThemeStore();
    const background = isDarkMode ? DarkColors.background : Colors.background;
    const surface = isDarkMode ? DarkColors.surface : Colors.surface;
    const text = isDarkMode ? DarkColors.text : Colors.text;
    const textSecondary = isDarkMode ? DarkColors.textSecondary : Colors.textSecondary;
    const border = isDarkMode ? DarkColors.border : Colors.border;
    const primary = isDarkMode ? DarkColors.primary : Colors.primary;
    const primaryContrast = getContrastColor(colors.primary);

    const handleDarkModeChange = async (value: boolean) => {
        setDarkMode(value);
        try {
            await AsyncStorage.setItem('dark-mode', JSON.stringify(value));
        } catch (e) {
            console.error('Failed to persist dark mode', e);
        }
    };

    return (
        <ScrollView className="flex-1" style={{ backgroundColor: background }} contentContainerStyle={{ padding: 16 }}>
            <Stack.Screen options={{ title: 'Theme Customization' }} />

            {/* Appearance */}
            <View className="mb-8 p-6 rounded-3xl border shadow-sm" style={{ backgroundColor: surface, borderColor: border }}>
                <Text className="text-[10px] font-black uppercase tracking-widest mb-4" style={{ color: textSecondary }}>Appearance</Text>
                <View className="flex-row items-center justify-between">
                    <View>
                        <Text className="font-bold text-base" style={{ color: text }}>Dark Mode</Text>
                        <Text className="text-xs mt-1" style={{ color: textSecondary }}>Use dark colors across the app</Text>
                    </View>
                    <Switch value={isDarkMode} trackColor={{ true: primary }} onValueChange={handleDarkModeChange} />
                </View>
            </View>

            {/* Live Preview Card */}
            <View className="mb-8 p-6 rounded-3xl border shadow-sm" style={{ backgroundColor: surface, borderColor: border }}>
                <Text className="text-[10px] font-black uppercase tracking-widest mb-4" style={{ color: textSecondary }}>Live Preview</Text>

                <View className="mb-4">
                    <Text className="font-bold mb-2" style={{ color: text }}>App Header Mockup</Text>
                    <View style={{ backgroundColor: colors.primary }} className="h-14 rounded-xl items-center justify-center flex-row px-4 shadow-sm">
                        <MaterialIcons name="menu" size={24} color={primaryContrast} />
                        <Text style={{ color: primaryContrast }} className="font-bold flex-1 text-center text-lg">Infinity Finance</Text>
                        <MaterialIcons name="notifications" size={24} color={primaryContrast} />
                    </View>
                </View>

                <View className="mb-4">
                    <Text className="font-bold mb-2" style={{ color: text }}>Primary Action</Text>
                    <Pressable style={{ backgroundColor: colors.primary }} className="py-3 rounded-xl items-center justify-center">
                        <Text style={{ color: primaryContrast }} className="font-bold uppercase tracking-wider">Save Changes</Text>
                    </Pressable>
                </View>

                <View className="flex-row items-center justify-between mt-2 p-4 rounded-2xl" style={{ backgroundColor: isDarkMode ? '#0F172A' : '#F8FAFC' }}>
                    <View>
                        <Text className="font-bold" style={{ color: text }}>Secondary Action Example</Text>
                        <Text className="text-xs mt-1" style={{ color: textSecondary }}>Switch is active</Text>
                    </View>
                    <Switch value={true} trackColor={{ true: colors.secondary }} />
                </View>
            </View>

            {/* Color Palettes */}
            <View className="mb-8 p-6 rounded-3xl border shadow-sm" style={{ backgroundColor: surface, borderColor: border }}>
                <Text className="text-[10px] font-black uppercase tracking-widest mb-4" style={{ color: textSecondary }}>Color Palettes</Text>
                <View className="gap-y-4">
                    {THEME_PALETTES.map((palette) => {
                        const isActive = colors.primary === palette.primary && colors.secondary === palette.secondary;
                        return (
                            <AnimatedPressable
                                key={palette.name}
                                onPress={() => setColors({ primary: palette.primary, secondary: palette.secondary })}
                            >
                                <View className={`flex-row items-center p-4 rounded-2xl border ${isActive ? 'border-2' : 'border'}`} style={{ backgroundColor: isActive ? (isDarkMode ? '#1E293B' : '#F8FAFC') : surface, borderColor: isActive ? text : border }}>
                                    <View className="flex-row mr-4 shadow-sm rounded-full overflow-hidden">
                                        <View style={{ backgroundColor: palette.primary }} className="w-6 h-12" />
                                        <View style={{ backgroundColor: palette.secondary }} className="w-6 h-12" />
                                    </View>
                                    <View className="flex-1">
                                        <Text className="font-bold text-base" style={{ color: text }}>{palette.name}</Text>
                                        <View className="flex-row items-center mt-1">
                                            <View style={{ backgroundColor: palette.primary }} className="w-2 h-2 rounded-full mr-1" />
                                            <Text className="text-xs mr-3 uppercase" style={{ color: textSecondary }}>{palette.primary}</Text>
                                            <View style={{ backgroundColor: palette.secondary }} className="w-2 h-2 rounded-full mr-1" />
                                            <Text className="text-xs uppercase" style={{ color: textSecondary }}>{palette.secondary}</Text>
                                        </View>
                                    </View>
                                    {isActive && (
                                        <MaterialIcons name="check-circle" size={24} color={colors.primary} />
                                    )}
                                </View>
                            </AnimatedPressable>
                        )
                    })}
                </View>
            </View>

            {/* Reset */}
            <AnimatedPressable onPress={resetColors} className="mb-10 w-full">
                <View className="flex-row items-center justify-center p-4 rounded-2xl" style={{ backgroundColor: isDarkMode ? '#1E293B' : '#F3F4F6' }}>
                    <MaterialIcons name="restore" size={20} color={textSecondary} style={{ marginRight: 8 }} />
                    <Text className="font-bold uppercase tracking-widest" style={{ color: textSecondary }}>Reset to Default</Text>
                </View>
            </AnimatedPressable>

            <View className="h-10" />
        </ScrollView>
    );
}
