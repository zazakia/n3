import React from 'react';
import { View, Text, Modal, Pressable, ScrollView, SafeAreaView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { formatPHP } from '../utils/currency';

export interface BreakdownItem {
    id: string;
    label: string;
    sublabel?: string;
    value: number | string;
    isCurrency?: boolean;
}

interface Props {
    visible: boolean;
    onClose: () => void;
    title: string;
    total: number | string;
    isTotalCurrency?: boolean;
    items: BreakdownItem[];
    color: string;
}

export function MetricBreakdownDialog({ visible, onClose, title, total, isTotalCurrency = true, items, color }: Props) {
    return (
        <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
            <View className="flex-1 justify-end bg-black/40">
                <Pressable className="absolute inset-0" onPress={onClose} />

                <View className="bg-white rounded-t-3xl min-h-[50%] max-h-[80%] pt-6 pb-8 px-6 shadow-2xl">
                    <View className="flex-row justify-between items-center mb-6">
                        <View>
                            <Text className="text-gray-700 text-xs font-bold uppercase tracking-widest mb-1">{title}</Text>
                            <Text className={`text-3xl font-extrabold ${color.replace('bg-', 'text-')}`}>
                                {isTotalCurrency && typeof total === 'number' ? formatPHP(total) : total}
                            </Text>
                        </View>
                        <Pressable onPress={onClose} className="bg-gray-100 p-2 rounded-full">
                            <MaterialIcons name="close" size={24} color="#4B5563" />
                        </Pressable>
                    </View>

                    <View className="h-px bg-gray-100 mb-4" />

                    <ScrollView  showsVerticalScrollIndicator={false} >
                        {items.length === 0 ? (
                            <View className="py-10 items-center justify-center">
                                <Text className="text-gray-700">No data available for this metric.</Text>
                            </View>
                        ) : (
                            items.map((item, idx) => (
                                <View key={item.id} className={`flex-row justify-between items-center py-4 ${idx < items.length - 1 ? 'border-b border-gray-100' : ''}`}>
                                    <View className="flex-1 mr-4">
                                        <Text className="text-gray-900 font-bold text-base">{item.label}</Text>
                                        {!!item.sublabel && <Text className="text-gray-700 text-xs mt-0.5">{item.sublabel}</Text>}
                                    </View>
                                    <View>
                                        <Text className="text-gray-900 font-extrabold text-base">
                                            {item.isCurrency && typeof item.value === 'number' ? formatPHP(item.value) : item.value}
                                        </Text>
                                    </View>
                                </View>
                            ))
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}
