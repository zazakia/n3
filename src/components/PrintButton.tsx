import React, { useState } from 'react';
import { Pressable, ActivityIndicator, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Toast from 'react-native-toast-message';

interface PrintButtonProps {
    onPrint: () => Promise<void>;
    label?: string;
    compact?: boolean;
}

export function PrintButton({ onPrint, label = 'Print', compact = false }: PrintButtonProps) {
    const [printing, setPrinting] = useState(false);

    const handlePrint = async () => {
        if (printing) return;
        setPrinting(true);
        try {
            await onPrint();
        } catch (error: any) {
            console.error('Print failed:', error);
            Toast.show({
                type: 'error',
                text1: 'Print Failed',
                text2: error?.message || 'Unable to generate document',
            });
        } finally {
            setPrinting(false);
        }
    };

    if (compact) {
        return (
            <Pressable
                onPress={handlePrint}
                disabled={printing}
                className="w-10 h-10 rounded-full bg-blue-50 items-center justify-center active:bg-blue-100"
            >
                {printing ? (
                    <ActivityIndicator size="small" color="#3B82F6" />
                ) : (
                    <MaterialIcons name="print" size={20} color="#3B82F6" />
                )}
            </Pressable>
        );
    }

    return (
        <Pressable
            onPress={handlePrint}
            disabled={printing}
            className={`flex-row items-center px-4 py-2 rounded-xl border border-gray-200 bg-white active:bg-gray-50 ${printing ? 'opacity-70' : ''}`}
        >
            {printing ? (
                <ActivityIndicator size="small" color="#374151" style={{ marginRight: 8 }} />
            ) : (
                <MaterialIcons name="print" size={18} color="#374151" style={{ marginRight: 8 }} />
            )}
            <Text className="text-sm font-semibold text-gray-700">{printing ? 'Generating...' : label}</Text>
        </Pressable>
    );
}
