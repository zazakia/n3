import * as Crypto from 'expo-crypto';

/**
 * Lightweight Encryption Service for sensitive data protection.
 * Note: In a production mobile environment, use a secure key storage (like expo-secure-store).
 * For this implementation, we use a simple XOR/Base64 approach as a placeholder for a full 
 * AES implementation if specific native modules aren't fully configured, or as a 
 * supplementary layer for obfuscation.
 */

import CryptoJS from 'crypto-js';

// In a real app, this would be fetched from SecureStore and never hardcoded.
const APP_SECRET = 'LoanBrick_Sec_2024_Ph';
const AES_PREFIX = 'AES::v1::';

export class EncryptionService {
    /**
     * Obfuscates/Encrypts a string.
     * Truly sensitive data should be encrypted with AES on the device.
     */
    static encrypt(text: string | null | undefined): string | null {
        if (!text) return null;
        try {
            // New records use strong AES encryption with a prefix marker
            const encrypted = CryptoJS.AES.encrypt(text, APP_SECRET).toString();
            return `${AES_PREFIX}${encrypted}`;
        } catch (e) {
            console.error('[EncryptionService] Encryption failed:', e);
            return text;
        }
    }

    /**
     * De-obfuscates/Decrypts a string.
     * Uses Hybrid Fallback: AES for new data, XOR for legacy data.
     */
    static decrypt(encryptedText: string | null | undefined): string | null {
        if (!encryptedText) return null;

        try {
            // Smart Fallback 1: Try AES first and strip the prefix
            if (encryptedText.startsWith(AES_PREFIX)) {
                try {
                    const pureEncrypted = encryptedText.substring(AES_PREFIX.length);
                    const bytes = CryptoJS.AES.decrypt(pureEncrypted, APP_SECRET);
                    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
                    
                    // If decryption results in empty string, it might be a failure or Corrupt record
                    return decrypted || encryptedText;
                } catch (e) {
                    console.error('[EncryptionService] AES Decryption failed:', e);
                    return encryptedText;
                }
            }

            // Smart Fallback 2: Fall back to legacy XOR obfuscation
            if (encryptedText.startsWith('enc:')) {
                const base64Part = encryptedText.substring(4);
                const decoded = atob(base64Part);
                return this.xor(decoded, APP_SECRET);
            }

            // Fallback 3: Plain text (unencrypted old records)
            return encryptedText;
        } catch (e) {
            console.error('[EncryptionService] Decryption failed:', e);
            return encryptedText;
        }
    }

    private static xor(input: string, key: string): string {
        let output = '';
        for (let i = 0; i < input.length; i++) {
            const charCode = input.charCodeAt(i) ^ key.charCodeAt(i % key.length);
            output += String.fromCharCode(charCode);
        }
        return output;
    }

    /**
     * Generates a hash for consistency checks (e.g. for PII hashing).
     */
    static async hash(text: string): Promise<string> {
        return await Crypto.digestStringAsync(
            Crypto.CryptoDigestAlgorithm.SHA256,
            text
        );
    }
}
