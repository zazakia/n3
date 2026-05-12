import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type AuthGateLoadingProps = {
    message?: string;
};

export function AuthGateLoading({ message = 'Checking access...' }: AuthGateLoadingProps) {
    return (
        <View style={styles.container}>
            <Text style={styles.brand}>INFINITY FINANCE</Text>
            <Text style={styles.message}>{message}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F9FAFB',
        padding: 24,
    },
    brand: {
        color: '#1A237E',
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 2,
        marginBottom: 10,
    },
    message: {
        color: '#4B5563',
        fontSize: 14,
        textAlign: 'center',
    },
});
