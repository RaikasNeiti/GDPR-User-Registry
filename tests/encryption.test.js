const sodium = require('libsodium-wrappers');

// Kopioidaan samat funktiot server.js:stä testejä varten
let sodiumReady = false;
const TEST_KEY_HEX = 'a'.repeat(64); // 32 bytes testiin

beforeAll(async () => {
  await sodium.ready;
  sodiumReady = true;
});

function getEncryptionKey() {
  return sodium.from_hex(TEST_KEY_HEX);
}

function encryptField(value) {
  if (value === null || value === undefined) return null;
  const key = getEncryptionKey();
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const cipher = sodium.crypto_secretbox_easy(
    sodium.from_string(String(value)), nonce, key
  );
  return sodium.to_hex(nonce) + sodium.to_hex(cipher);
}

function decryptField(encryptedValue) {
  if (!encryptedValue) return null;
  const key = getEncryptionKey();
  const nonceHex = encryptedValue.slice(0, sodium.crypto_secretbox_NONCEBYTES * 2);
  const cipherHex = encryptedValue.slice(sodium.crypto_secretbox_NONCEBYTES * 2);
  const nonce = sodium.from_hex(nonceHex);
  const cipher = sodium.from_hex(cipherHex);
  try {
    return sodium.to_string(sodium.crypto_secretbox_open_easy(cipher, nonce, key));
  } catch (err) {
    return null;
  }
}

describe('Encryption', () => {
  test('encrypts a string value', () => {
    const result = encryptField('Matti');
    expect(result).not.toBe('Matti');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('decrypts back to original value', () => {
    const original = 'Matti Meikäläinen';
    const encrypted = encryptField(original);
    const decrypted = decryptField(encrypted);
    expect(decrypted).toBe(original);
  });

  test('encrypts email correctly', () => {
    const email = 'test@example.com';
    const encrypted = encryptField(email);
    const decrypted = decryptField(encrypted);
    expect(decrypted).toBe(email);
  });

  test('returns null for null input', () => {
    expect(encryptField(null)).toBeNull();
    expect(decryptField(null)).toBeNull();
  });

  test('each encryption produces unique ciphertext', () => {
    const value = 'sama teksti';
    const encrypted1 = encryptField(value);
    const encrypted2 = encryptField(value);
    // Nonce on aina erilainen joten ciphertext on erilainen
    expect(encrypted1).not.toBe(encrypted2);
    // Mutta molemmat purkautuvat samaan
    expect(decryptField(encrypted1)).toBe(value);
    expect(decryptField(encrypted2)).toBe(value);
  });

  test('returns null for tampered ciphertext', () => {
    const encrypted = encryptField('testi');
    const tampered = encrypted.slice(0, -4) + 'ffff';
    expect(decryptField(tampered)).toBeNull();
  });
});