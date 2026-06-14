import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, TextInput, Platform, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

type Props = {
    currentPage: number;
    totalPages: number;
    totalRecords: number;
    itemsPerPage: number;
    onPageChange: (page: number) => void;
    onItemsPerPageChange: (limit: number) => void;
};

const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100];

export function PaginationControls({
    currentPage,
    totalPages,
    totalRecords,
    itemsPerPage,
    onPageChange,
    onItemsPerPageChange
}: Props) {
    const [pageInput, setPageInput] = useState(String(currentPage));
    const [showLimitOptions, setShowLimitOptions] = useState(false);

    useEffect(() => {
        setPageInput(String(currentPage));
    }, [currentPage]);

    const handleJumpToPage = () => {
        const page = parseInt(pageInput, 10);
        if (!isNaN(page) && page >= 1 && page <= totalPages) {
            onPageChange(page);
        } else {
            setPageInput(String(currentPage)); // reset if invalid
        }
    };

    const startIdx = totalRecords === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
    const endIdx = Math.min(currentPage * itemsPerPage, totalRecords);

    return (
        <View className="bg-white border-t border-gray-200 px-4 py-3 flex-row items-center justify-between flex-wrap gap-y-3">
            {/* Left side: Record count & Limit selector */}
            <View className="flex-row items-center gap-4">
                <Text className="text-sm text-gray-600 font-medium">
                    Showing <Text className="font-bold text-gray-900">{startIdx}-{endIdx}</Text> of <Text className="font-bold text-gray-900">{totalRecords.toLocaleString()}</Text>
                </Text>

                <View className="flex-row items-center relative z-10">
                    <Text className="text-xs text-gray-500 mr-2 uppercase font-bold">Rows:</Text>
                    <Pressable
                        onPress={() => setShowLimitOptions(!showLimitOptions)}
                        className="flex-row items-center bg-gray-50 border border-gray-200 rounded px-2 py-1"
                    >
                        <Text className="text-sm font-bold text-gray-700 mr-1">{itemsPerPage}</Text>
                        <MaterialIcons name={showLimitOptions ? "arrow-drop-up" : "arrow-drop-down"} size={16} color="#6B7280" />
                    </Pressable>

                    {showLimitOptions && (
                        <View className="absolute bottom-full left-10 mb-1 bg-white border border-gray-200 rounded shadow-lg overflow-hidden">
                            {ITEMS_PER_PAGE_OPTIONS.map(opt => (
                                <Pressable
                                    key={opt}
                                    onPress={() => {
                                        onItemsPerPageChange(opt);
                                        setShowLimitOptions(false);
                                    }}
                                    className={`px-4 py-2 ${itemsPerPage === opt ? 'bg-blue-50' : 'bg-white'} border-b border-gray-100 last:border-b-0`}
                                >
                                    <Text className={`text-sm ${itemsPerPage === opt ? 'font-bold text-blue-700' : 'text-gray-700'}`}>{opt}</Text>
                                </Pressable>
                            ))}
                        </View>
                    )}
                </View>
            </View>

            {/* Right side: Controls */}
            <View className="flex-row items-center">
                {/* First Page */}
                <Pressable
                    disabled={currentPage <= 1}
                    onPress={() => onPageChange(1)}
                    className={`p-1.5 rounded mr-1 ${currentPage <= 1 ? 'opacity-30' : 'active:bg-gray-100'}`}
                >
                    <MaterialIcons name="first-page" size={22} color="#374151" />
                </Pressable>

                {/* Prev Page */}
                <Pressable
                    disabled={currentPage <= 1}
                    onPress={() => onPageChange(currentPage - 1)}
                    className={`p-1.5 rounded mr-3 ${currentPage <= 1 ? 'opacity-30' : 'active:bg-gray-100'}`}
                >
                    <MaterialIcons name="chevron-left" size={22} color="#374151" />
                </Pressable>

                {/* Jump input */}
                <View className="flex-row items-center bg-gray-50 border border-gray-200 rounded px-2 h-8">
                    <Text className="text-xs text-gray-500 mr-1">Page</Text>
                    <TextInput
                        value={pageInput}
                        onChangeText={setPageInput}
                        onSubmitEditing={handleJumpToPage}
                        onBlur={handleJumpToPage}
                        keyboardType="number-pad"
                        className="text-sm font-bold text-gray-900 w-10 text-center p-0 h-full"
                        style={Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}}
                        returnKeyType="done"
                    />
                    <Text className="text-xs text-gray-500 ml-1">of {totalPages}</Text>
                </View>

                {/* Next Page */}
                <Pressable
                    disabled={currentPage >= totalPages}
                    onPress={() => onPageChange(currentPage + 1)}
                    className={`p-1.5 rounded ml-3 ${currentPage >= totalPages ? 'opacity-30' : 'active:bg-gray-100'}`}
                >
                    <MaterialIcons name="chevron-right" size={22} color="#374151" />
                </Pressable>

                {/* Last Page */}
                <Pressable
                    disabled={currentPage >= totalPages}
                    onPress={() => onPageChange(totalPages)}
                    className={`p-1.5 rounded ml-1 ${currentPage >= totalPages ? 'opacity-30' : 'active:bg-gray-100'}`}
                >
                    <MaterialIcons name="last-page" size={22} color="#374151" />
                </Pressable>
            </View>
        </View>
    );
}
