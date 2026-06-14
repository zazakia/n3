import React from 'react';
import { View, Pressable, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export type ViewMode = 'table' | 'card';

export function ViewToggle({ mode, onToggle }: { mode: ViewMode; onToggle: (m: ViewMode) => void }) {
    return (
        <View className="flex-row bg-gray-100 p-1 rounded-lg border border-gray-200 self-start">
            <Pressable
                onPress={() => onToggle('table')}
                className={`flex-row items-center px-3 py-1.5 rounded-md ${mode === 'table' ? 'bg-white shadow-sm border border-gray-200' : 'opacity-60'}`}
            >
                <MaterialIcons name="table-chart" size={16} color={mode === 'table' ? '#059669' : '#4B5563'} />
                <Text className={`ml-1.5 text-xs font-bold ${mode === 'table' ? 'text-gray-900' : 'text-gray-600'}`}>Table</Text>
            </Pressable>
            
            <Pressable
                onPress={() => onToggle('card')}
                className={`flex-row items-center px-3 py-1.5 rounded-md ${mode === 'card' ? 'bg-white shadow-sm border border-gray-200' : 'opacity-60'}`}
            >
                <MaterialIcons name="view-agenda" size={16} color={mode === 'card' ? '#059669' : '#4B5563'} />
                <Text className={`ml-1.5 text-xs font-bold ${mode === 'card' ? 'text-gray-900' : 'text-gray-600'}`}>Cards</Text>
            </Pressable>
        </View>
    );
}
