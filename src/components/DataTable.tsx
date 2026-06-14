import React from 'react';
import { View, Text, ScrollView, Pressable, Platform, StyleProp, ViewStyle, DimensionValue } from 'react-native';

export type ColumnDef<T> = {
    key: string;
    label: string;
    width?: DimensionValue;
    flex?: number;
    align?: 'left' | 'center' | 'right';
    render?: (item: T) => React.ReactNode;
};

export type DataTableProps<T> = {
    columns: ColumnDef<T>[];
    data: T[];
    keyExtractor: (item: T) => string;
    onRowPress?: (item: T) => void;
    minWidth?: number;
    containerStyle?: StyleProp<ViewStyle>;
};

export function DataTable<T>({ columns, data, keyExtractor, onRowPress, minWidth = 800, containerStyle }: DataTableProps<T>) {
    const getAlignmentClass = (align?: 'left' | 'center' | 'right') => {
        if (align === 'center') return 'text-center';
        if (align === 'right') return 'text-right';
        return 'text-left';
    };

    const getAlignmentFlexClass = (align?: 'left' | 'center' | 'right') => {
        if (align === 'center') return 'items-center justify-center';
        if (align === 'right') return 'items-end justify-center';
        return 'items-start justify-center';
    };

    return (
        <View style={[{ flex: 1, backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden' }, containerStyle]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={true} bounces={false}>
                <View style={{ minWidth, flex: 1 }}>
                    {/* Header Row */}
                    <View className="flex-row border-b border-gray-200 bg-gray-50 px-4 py-3">
                        {columns.map((col) => (
                            <View
                                key={col.key}
                                style={[
                                    col.flex ? { flex: col.flex } : col.width ? { width: col.width } : { flex: 1 },
                                    { paddingHorizontal: 4 }
                                ]}
                                className={getAlignmentFlexClass(col.align)}
                            >
                                <Text className={`text-xs font-bold text-gray-500 uppercase tracking-wider ${getAlignmentClass(col.align)}`}>
                                    {col.label}
                                </Text>
                            </View>
                        ))}
                    </View>

                    {/* Data Rows */}
                    {data.length === 0 ? (
                        <View className="py-10 items-center justify-center">
                            <Text className="text-gray-500 font-medium">No records found</Text>
                        </View>
                    ) : (
                        <View>
                            {data.map((item, index) => {
                                const isLast = index === data.length - 1;
                                return (
                                    <Pressable
                                        key={keyExtractor(item)}
                                        onPress={() => onRowPress && onRowPress(item)}
                                        className={`flex-row px-4 py-3 bg-white active:bg-gray-50 ${!isLast ? 'border-b border-gray-100' : ''}`}
                                    >
                                        {columns.map((col) => (
                                            <View
                                                key={`${keyExtractor(item)}-${col.key}`}
                                                style={[
                                                    col.flex ? { flex: col.flex } : col.width ? { width: col.width } : { flex: 1 },
                                                    { paddingHorizontal: 4 }
                                                ]}
                                                className={getAlignmentFlexClass(col.align)}
                                            >
                                                {col.render ? (
                                                    col.render(item)
                                                ) : (
                                                    <Text className={`text-sm text-gray-800 ${getAlignmentClass(col.align)}`} numberOfLines={1}>
                                                        {String((item as any)[col.key] || '')}
                                                    </Text>
                                                )}
                                            </View>
                                        ))}
                                    </Pressable>
                                );
                            })}
                        </View>
                    )}
                </View>
            </ScrollView>
        </View>
    );
}
