import React, { useState } from 'react';
import { View, Text, ScrollView, Switch, Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeStore, THEME_PALETTES } from '../../../src/store/useThemeStore';
import { AnimatedPressable } from '../../../src/components/AnimatedPressable';
import { Stack } from 'expo-router';

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
    const { colors, setColors, resetColors } = useThemeStore();
    const primaryContrast = getContrastColor(colors.primary);

    return (
        <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16 }}>
            <Stack.Screen options={{ title: 'Theme Customization' }} />

            {/* Live Preview Card */}
            <View className="bg-white rounded-3xl p-6 mb-8 border border-gray-100 shadow-sm">
                <Text className="text-[10px] font-black text-gray-700 uppercase tracking-widest mb-4">Live Preview</Text>
                
                <View className="mb-4">
                    <Text className="text-gray-700 font-bold mb-2">App Header Mockup</Text>
                    <View style={{ backgroundColor: colors.primary }} className="h-14 rounded-xl items-center justify-center flex-row px-4 shadow-sm">
                        <MaterialIcons name="menu" size={24} color={primaryContrast} />
                        <Text style={{ color: primaryContrast }} className="font-bold flex-1 text-center text-lg">Infinity Finance</Text>
                        <MaterialIcons name="notifications" size={24} color={primaryContrast} />
                    </View>
                </View>

                <View className="mb-4">
                    <Text className="text-gray-700 font-bold mb-2">Primary Action</Text>
                    <Pressable style={{ backgroundColor: colors.primary }} className="py-3 rounded-xl items-center justify-center">
                        <Text style={{ color: primaryContrast }} className="font-bold uppercase tracking-wider">Save Changes</Text>
                    </Pressable>
                </View>

                <View className="flex-row items-center justify-between mt-2 p-4 bg-gray-50 rounded-2xl">
                    <View>
                        <Text className="text-gray-900 font-bold">Secondary Action Example</Text>
                        <Text className="text-gray-500 text-xs">Switch is active</Text>
                    </View>
                    <Switch value={true} trackColor={{ true: colors.secondary }} />
                </View>
            </View>

            {/* Color Palettes */}
            <View className="bg-white rounded-3xl p-6 mb-8 border border-gray-100 shadow-sm">
                <Text className="text-[10px] font-black text-gray-700 uppercase tracking-widest mb-4">Color Palettes</Text>
                <View className="gap-y-4">
                    {THEME_PALETTES.map((palette) => {
                        const isActive = colors.primary === palette.primary && colors.secondary === palette.secondary;
                        return (
                            <AnimatedPressable 
                                key={palette.name}
                                onPress={() => setColors({ primary: palette.primary, secondary: palette.secondary })}
                            >
                                <View className={`flex-row items-center p-4 rounded-2xl border ${isActive ? 'border-2 border-gray-900 bg-gray-50' : 'border border-gray-100 bg-white'}`}>
                                    <View className="flex-row mr-4 shadow-sm rounded-full overflow-hidden">
                                        <View style={{ backgroundColor: palette.primary }} className="w-6 h-12" />
                                        <View style={{ backgroundColor: palette.secondary }} className="w-6 h-12" />
                                    </View>
                                    <View className="flex-1">
                                        <Text className="font-bold text-gray-900 text-base">{palette.name}</Text>
                                        <View className="flex-row items-center mt-1">
                                            <View style={{ backgroundColor: palette.primary }} className="w-2 h-2 rounded-full mr-1" />
                                            <Text className="text-xs text-gray-500 mr-3 uppercase">{palette.primary}</Text>
                                            <View style={{ backgroundColor: palette.secondary }} className="w-2 h-2 rounded-full mr-1" />
                                            <Text className="text-xs text-gray-500 uppercase">{palette.secondary}</Text>
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
                <View className="flex-row items-center justify-center p-4 bg-gray-100 rounded-2xl">
                    <MaterialIcons name="restore" size={20} color="#374151" style={{ marginRight: 8 }} />
                    <Text className="text-gray-700 font-bold uppercase tracking-widest">Reset to Default</Text>
                </View>
            </AnimatedPressable>
            
            <View className="h-10" />
        </ScrollView>
    );
}
