import React, { useState, useEffect } from 'react';
import { View, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SearchBarProps {
    value: string;
    onChangeText: (text: string) => void;
    placeholder?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({ value, onChangeText, placeholder = "Search..." }) => {
    const [localValue, setLocalValue] = useState(value);

    // Sync local value when external value changes unexpectedly (e.g. clear)
    useEffect(() => {
        if (value === '') {
            setLocalValue('');
        }
    }, [value]);

    useEffect(() => {
        const handler = setTimeout(() => {
            onChangeText(localValue);
        }, 300);
        return () => clearTimeout(handler);
    }, [localValue, onChangeText]);

    return (
        <View className="flex-row items-center bg-white border border-gray-200 rounded-2xl px-4 py-2 my-2 shadow-sm">
            <Ionicons name="search" size={20} color="#94a3b8" />
            <TextInput
                className="flex-1 ml-2 text-gray-700 h-10"
                value={localValue}
                onChangeText={setLocalValue}
                placeholder={placeholder}
                placeholderTextColor="#94a3b8"
                clearButtonMode="while-editing"
            />
        </View>
    );
};
