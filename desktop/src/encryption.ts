/**
 * Encryption Utilities
 * End-to-end encryption using libsodium (NaCl)
 */

import sodium from 'libsodium-wrappers';
import type { EncryptedData, KeyPair } from './types.js';

// Ensure sodium is ready
await sodium.ready;

/**
 * Generate a new key pair for encryption
 */
export function generateKeyPair(): KeyPair {
  const keyPair = sodium.crypto_box_keypair();
  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey
  };
}

/**
 * Convert Uint8Array to Base64
 */
function toBase64(data: Uint8Array): string {
  return sodium.to_base64(data, sodium.base64_variants.ORIGINAL);
}

/**
 * Convert Base64 to Uint8Array
 */
function fromBase64(data: string): Uint8Array {
  return sodium.from_base64(data, sodium.base64_variants.ORIGINAL);
}

/**
 * Encrypt data using recipient's public key
 * Uses NaCl Box (X25519 + XSalsa20 + Poly1305)
 */
export function encrypt(
  plaintext: string,
  recipientPublicKey: Uint8Array,
  senderPrivateKey: Uint8Array
): EncryptedData {
  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  const plaintextBytes = sodium.from_string(plaintext);

  const ciphertext = sodium.crypto_box_easy(
    plaintextBytes,
    nonce,
    recipientPublicKey,
    senderPrivateKey
  );

  return {
    nonce: toBase64(nonce),
    ciphertext: toBase64(ciphertext)
  };
}

/**
 * Decrypt data using sender's public key
 */
export function decrypt(
  encrypted: EncryptedData,
  senderPublicKey: Uint8Array,
  recipientPrivateKey: Uint8Array
): string {
  const nonce = fromBase64(encrypted.nonce);
  const ciphertext = fromBase64(encrypted.ciphertext);

  const decrypted = sodium.crypto_box_open_easy(
    ciphertext,
    nonce,
    senderPublicKey,
    recipientPrivateKey
  );

  return sodium.to_string(decrypted);
}

/**
 * Symmetric encryption for data at rest
 * Uses XSalsa20-Poly1305
 */
export function encryptSymmetric(plaintext: string, key: Uint8Array): EncryptedData {
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const plaintextBytes = sodium.from_string(plaintext);

  const ciphertext = sodium.crypto_secretbox_easy(plaintextBytes, nonce, key);

  return {
    nonce: toBase64(nonce),
    ciphertext: toBase64(ciphertext)
  };
}

/**
 * Symmetric decryption
 */
export function decryptSymmetric(encrypted: EncryptedData, key: Uint8Array): string {
  const nonce = fromBase64(encrypted.nonce);
  const ciphertext = fromBase64(encrypted.ciphertext);

  const decrypted = sodium.crypto_secretbox_open_easy(ciphertext, nonce, key);

  return sodium.to_string(decrypted);
}

/**
 * Generate a symmetric key for data encryption
 */
export function generateSymmetricKey(): Uint8Array {
  return sodium.randombytes_buf(sodium.crypto_secretbox_KEYBYTES);
}

/**
 * Key pair to/from string (for storage)
 */
export function keyPairToStrings(keyPair: KeyPair): { publicKey: string; privateKey: string } {
  return {
    publicKey: toBase64(keyPair.publicKey),
    privateKey: toBase64(keyPair.privateKey)
  };
}

export function keyPairFromStrings(keys: { publicKey: string; privateKey: string }): KeyPair {
  return {
    publicKey: fromBase64(keys.publicKey),
    privateKey: fromBase64(keys.privateKey)
  };
}
