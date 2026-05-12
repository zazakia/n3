import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Size = 'sm' | 'md' | 'lg';

interface Props {
    size?: Size;
}

const sizeMap = {
    sm: 24,
    md: 42,
    lg: 80,
};

const textMap = {
    sm: 'text-lg',
    md: 'text-3xl',
    lg: 'text-5xl',
};

export function InfinityLogo({ size = 'md' }: Props) {
    const iconSize = sizeMap[size];
    const textSize = textMap[size];

    return (
        <View className="flex-col items-center justify-center">
            <View className="bg-red-50 p-3 rounded-2xl mb-2 items-center justify-center">
                <Ionicons name="infinite" size={iconSize} color="#D32F2F" />
            </View>
            <Text className={`${textSize} font-extrabold text-gray-900 tracking-tighter`}>
                INFINITY<Text className="text-red-700">FINANCE</Text>
            </Text>
        </View>
    );
}
