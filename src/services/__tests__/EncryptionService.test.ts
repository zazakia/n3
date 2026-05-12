import { EncryptionService } from '../EncryptionService';
import * as Crypto from 'expo-crypto';
import CryptoJS from 'crypto-js';

jest.mock('expo-crypto', () => ({
    CryptoDigestAlgorithm: {
        SHA256: 'sha256',
    },
    digestStringAsync: jest.fn().mockResolvedValue('mock-hash'),
}));

describe('EncryptionService', () => {
    describe('encrypt & decrypt', () => {
        it('should encrypt and decrypt a string correctly using AES', () => {
            const original = 'SecretPassword123';
            const encrypted = EncryptionService.encrypt(original);
            expect(encrypted).toMatch(/^AES::v1::/);
            
            const decrypted = EncryptionService.decrypt(encrypted);
            expect(decrypted).toBe(original);
        });

        it('should decrypt legacy records using XOR fallback', () => {
            // "SecretPassword123" XORed with "LoanBrick_Sec_2024_Ph" and base64 encoded
            const legacyEncrypted = 'enc:HwoCHCcGOQIYLCQKETsDAgE='; 
            const decrypted = EncryptionService.decrypt(legacyEncrypted);
            
            expect(decrypted).toBe('SecretPassword123');
        });

        it('should return null if input is null or undefined', () => {
            expect(EncryptionService.encrypt(null)).toBeNull();
            expect(EncryptionService.encrypt(undefined)).toBeNull();
            expect(EncryptionService.decrypt(null)).toBeNull();
            expect(EncryptionService.decrypt(undefined)).toBeNull();
        });

        it('should return the text if it does not have the enc: or AES::v1:: prefix on decrypt', () => {
            const plain = 'Not Encrypted';
            expect(EncryptionService.decrypt(plain)).toBe(plain);
        });

        it('should handle encryption errors gracefully', () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            const originalEncrypt = CryptoJS.AES.encrypt;
            // @ts-ignore
            CryptoJS.AES.encrypt = jest.fn(() => { throw new Error('AES fail'); });

            const result = EncryptionService.encrypt('test');
            expect(result).toBe('test');
            expect(consoleSpy).toHaveBeenCalled();

            CryptoJS.AES.encrypt = originalEncrypt;
            consoleSpy.mockRestore();
        });

        it('should handle decryption errors gracefully', () => {
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            
            // To trigger the catch block, we mock the decrypt function to throw
            const originalDecrypt = CryptoJS.AES.decrypt;
            // @ts-ignore
            CryptoJS.AES.decrypt = jest.fn(() => { throw new Error('AES fail'); });

            const invalidAES = 'AES::v1::completely-invalid-content-that-will-fail-aes';
            const result = EncryptionService.decrypt(invalidAES);
            expect(result).toBe(invalidAES);
            expect(consoleSpy).toHaveBeenCalled();

            CryptoJS.AES.decrypt = originalDecrypt;

            consoleSpy.mockRestore();
        });
    });

    describe('hash', () => {
        it('should call expo-crypto to generate a hash', async () => {
            const text = 'HelloWorld';
            const result = await EncryptionService.hash(text);
            expect(result).toBe('mock-hash');
            expect(Crypto.digestStringAsync).toHaveBeenCalledWith(
                Crypto.CryptoDigestAlgorithm.SHA256,
                text
            );
        });
    });
});
