import React from 'react';
import { View, Pressable } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface DatePickerProps {
    value: string; // YYYY-MM-DD
    onChange: (date: string) => void;
    placeholder?: string;
    onClear?: () => void;
}

export const DatePicker: React.FC<DatePickerProps> = ({ value, onChange, placeholder = "Select Date", onClear }) => {
    return (
        <View className="flex-row items-center bg-white border border-gray-200 rounded-xl px-3 py-2.5 shadow-sm">
            <MaterialIcons name="calendar-today" size={18} color="#64748b" />
            <View style={{ flex: 1, marginLeft: 8, flexDirection: 'row', alignItems: 'center' }}>
                <input
                    type="date"
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    style={{
                        flex: 1,
                        border: 'none',
                        outline: 'none',
                        fontSize: 14,
                        fontFamily: 'inherit',
                        color: value ? '#111827' : '#9CA3AF',
                        backgroundColor: 'transparent',
                        width: '100%'
                    }}
                />
            </View>
            {value && onClear && (
                <Pressable onPress={onClear}>
                    <MaterialIcons name="close" size={18} color="#94a3b8" />
                </Pressable>
            )}
        </View>
    );
};
