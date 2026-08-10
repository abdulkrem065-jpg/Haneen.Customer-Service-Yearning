export function normalizePrivateKey(rawKey?: string): string {
  if (!rawKey) {
    return '';
  }

  let key = rawKey.trim();

  // Strip wrapping double or single quotes if present around the full value
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }

  // Also strip escaped quotes like \"...\"
  if ((key.startsWith('\\"') && key.endsWith('\\"')) || (key.startsWith("\\'") && key.endsWith("\\'"))) {
    key = key.slice(2, -2).trim();
  }

  // Convert all escaped newline sequences (\r\n, \n, \\r\\n, \\n) and real CRLF (\r\n) to real newlines (\n)
  key = key
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n');

  // Ensure newline after BEGIN PRIVATE KEY if missing
  if (key.includes('-----BEGIN PRIVATE KEY-----') && !key.includes('-----BEGIN PRIVATE KEY-----\n')) {
    key = key.replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\n');
  }

  // Ensure newline before END PRIVATE KEY if missing
  if (key.includes('-----END PRIVATE KEY-----') && !key.includes('\n-----END PRIVATE KEY-----')) {
    key = key.replace('-----END PRIVATE KEY-----', '\n-----END PRIVATE KEY-----');
  }

  return key.trim();
}

export interface KeyValidationResult {
  valid: boolean;
  reason?: string;
}

export function validatePrivateKey(key?: string): KeyValidationResult {
  if (!key || !key.trim()) {
    return { valid: false, reason: 'Invalid Google service account private key format' };
  }

  // The raw input must contain line break indicators (\n, \r, or escaped \\n)
  if (!key.includes('\n') && !key.includes('\\n') && !key.includes('\r')) {
    return { valid: false, reason: 'Invalid Google service account private key format' };
  }

  const normalized = normalizePrivateKey(key);

  if (!normalized.includes('-----BEGIN PRIVATE KEY-----')) {
    return { valid: false, reason: 'Invalid Google service account private key format' };
  }

  if (!normalized.includes('-----END PRIVATE KEY-----')) {
    return { valid: false, reason: 'Invalid Google service account private key format' };
  }

  const lines = normalized.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 3) {
    return { valid: false, reason: 'Invalid Google service account private key format' };
  }

  const headerIdx = normalized.indexOf('-----BEGIN PRIVATE KEY-----');
  const footerIdx = normalized.indexOf('-----END PRIVATE KEY-----');

  if (headerIdx >= footerIdx) {
    return { valid: false, reason: 'Invalid Google service account private key format' };
  }

  return { valid: true };
}
