import { describe, it, expect } from 'vitest';
import { normalizePrivateKey, validatePrivateKey } from './key-utils';

describe('CMD-019 Private Key Normalization and Validation', () => {
  const samplePEMBody = 'MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC12345';

  it('1. handles PEM with actual newlines correctly', () => {
    const pem = `-----BEGIN PRIVATE KEY-----\n${samplePEMBody}\n-----END PRIVATE KEY-----`;
    const normalized = normalizePrivateKey(pem);
    expect(normalized).toBe(`-----BEGIN PRIVATE KEY-----\n${samplePEMBody}\n-----END PRIVATE KEY-----`);

    const validation = validatePrivateKey(pem);
    expect(validation.valid).toBe(true);
  });

  it('2. handles PEM with literal \\n sequences correctly', () => {
    const pem = `-----BEGIN PRIVATE KEY-----\\n${samplePEMBody}\\n-----END PRIVATE KEY-----`;
    const normalized = normalizePrivateKey(pem);
    expect(normalized).toBe(`-----BEGIN PRIVATE KEY-----\n${samplePEMBody}\n-----END PRIVATE KEY-----`);

    const validation = validatePrivateKey(pem);
    expect(validation.valid).toBe(true);
  });

  it('3. handles PEM surrounded by external quotes correctly', () => {
    const pemWithDoubleQuotes = `"-----BEGIN PRIVATE KEY-----\\n${samplePEMBody}\\n-----END PRIVATE KEY-----"`;
    const normalizedDouble = normalizePrivateKey(pemWithDoubleQuotes);
    expect(normalizedDouble).toBe(`-----BEGIN PRIVATE KEY-----\n${samplePEMBody}\n-----END PRIVATE KEY-----`);
    expect(validatePrivateKey(pemWithDoubleQuotes).valid).toBe(true);

    const pemWithSingleQuotes = `'-----BEGIN PRIVATE KEY-----\n${samplePEMBody}\n-----END PRIVATE KEY-----'`;
    const normalizedSingle = normalizePrivateKey(pemWithSingleQuotes);
    expect(normalizedSingle).toBe(`-----BEGIN PRIVATE KEY-----\n${samplePEMBody}\n-----END PRIVATE KEY-----`);
    expect(validatePrivateKey(pemWithSingleQuotes).valid).toBe(true);
  });

  it('4. handles PEM with CRLF (\\r\\n) correctly', () => {
    const pemCRLF = `-----BEGIN PRIVATE KEY-----\r\n${samplePEMBody}\r\n-----END PRIVATE KEY-----\r\n`;
    const normalized = normalizePrivateKey(pemCRLF);
    expect(normalized).toBe(`-----BEGIN PRIVATE KEY-----\n${samplePEMBody}\n-----END PRIVATE KEY-----`);

    const validation = validatePrivateKey(pemCRLF);
    expect(validation.valid).toBe(true);
  });

  it('5. handles missing value cleanly', () => {
    expect(normalizePrivateKey(undefined)).toBe('');
    expect(normalizePrivateKey('')).toBe('');

    const valUndefined = validatePrivateKey(undefined);
    expect(valUndefined.valid).toBe(false);
    expect(valUndefined.reason).toBe('Invalid Google service account private key format');

    const valEmpty = validatePrivateKey('');
    expect(valEmpty.valid).toBe(false);
    expect(valEmpty.reason).toBe('Invalid Google service account private key format');
  });

  it('6. handles invalid private key value cleanly without exposing content', () => {
    const invalidKey1 = 'not-a-valid-key';
    const val1 = validatePrivateKey(invalidKey1);
    expect(val1.valid).toBe(false);
    expect(val1.reason).toBe('Invalid Google service account private key format');

    const invalidKey2 = '-----BEGIN PUBLIC KEY-----\nFOO\n-----END PUBLIC KEY-----';
    const val2 = validatePrivateKey(invalidKey2);
    expect(val2.valid).toBe(false);
    expect(val2.reason).toBe('Invalid Google service account private key format');

    const invalidKeyNoNewlines = '-----BEGIN PRIVATE KEY----- FOO -----END PRIVATE KEY-----';
    const val3 = validatePrivateKey(invalidKeyNoNewlines);
    expect(val3.valid).toBe(false);
    expect(val3.reason).toBe('Invalid Google service account private key format');
  });

  it('7. handles escaped quotes and double-escaped newlines correctly', () => {
    const pemEscapedQuotes = `\\"-----BEGIN PRIVATE KEY-----\\\\n${samplePEMBody}\\\\n-----END PRIVATE KEY-----\\"`;
    const normalized = normalizePrivateKey(pemEscapedQuotes);
    expect(normalized).toBe(`-----BEGIN PRIVATE KEY-----\n${samplePEMBody}\n-----END PRIVATE KEY-----`);
    expect(validatePrivateKey(pemEscapedQuotes).valid).toBe(true);
  });
});
