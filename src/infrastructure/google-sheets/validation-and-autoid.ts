export interface ValidationRule {
  field: string;
  type: 'DROPDOWN' | 'NUMERIC' | 'BOOLEAN' | 'AUTO_ID' | 'REQUIRED_STRING';
  options?: string[];
  defaultValue?: string;
}

export const VALIDATION_RULES: Record<string, ValidationRule[]> = {
  products: [
    { field: 'id', type: 'AUTO_ID', defaultValue: 'prod-001' },
    { field: 'tenantId', type: 'REQUIRED_STRING', defaultValue: 'tnt-41f0d530' },
    { field: 'storeId', type: 'REQUIRED_STRING', defaultValue: 'str-2c6ad81f' },
    { field: 'currency', type: 'DROPDOWN', options: ['YER', 'SAR', 'USD'], defaultValue: 'YER' },
    { field: 'inStock', type: 'BOOLEAN', options: ['TRUE', 'FALSE'], defaultValue: 'TRUE' },
    { field: 'price', type: 'NUMERIC', defaultValue: '0' },
    { field: 'quantity', type: 'NUMERIC', defaultValue: '0' }
  ],
  categories: [
    { field: 'id', type: 'AUTO_ID', defaultValue: 'cat-001' },
    { field: 'tenantId', type: 'REQUIRED_STRING', defaultValue: 'tnt-41f0d530' },
    { field: 'storeId', type: 'REQUIRED_STRING', defaultValue: 'str-2c6ad81f' }
  ],
  payment_methods: [
    { field: 'id', type: 'AUTO_ID', defaultValue: 'pay-001' },
    { field: 'tenantId', type: 'REQUIRED_STRING', defaultValue: 'tnt-41f0d530' },
    { field: 'storeId', type: 'REQUIRED_STRING', defaultValue: 'str-2c6ad81f' },
    { field: 'methodType', type: 'DROPDOWN', options: ['WALLET', 'CASH', 'BANK', 'OTHER', 'bank', 'wallet', 'cash_on_delivery', 'other'], defaultValue: 'WALLET' },
    { field: 'isActive', type: 'BOOLEAN', options: ['TRUE', 'FALSE'], defaultValue: 'TRUE' }
  ],
  store_contacts: [
    { field: 'id', type: 'AUTO_ID', defaultValue: 'cnt-001' },
    { field: 'tenantId', type: 'REQUIRED_STRING', defaultValue: 'tnt-41f0d530' },
    { field: 'storeId', type: 'REQUIRED_STRING', defaultValue: 'str-2c6ad81f' },
    { field: 'channelType', type: 'DROPDOWN', options: ['PHONE', 'WHATSAPP', 'EMAIL', 'OTHER', 'whatsapp', 'phone', 'facebook', 'other'], defaultValue: 'WHATSAPP' },
    { field: 'isActive', type: 'BOOLEAN', options: ['TRUE', 'FALSE'], defaultValue: 'TRUE' }
  ]
};

export function generateAutoId(prefix: string, seed?: string, sequenceNumber?: number): string {
  if (sequenceNumber !== undefined && sequenceNumber > 0) {
    const pad = sequenceNumber.toString().padStart(3, '0');
    return `${prefix}-${pad}`;
  }
  if (seed && seed.trim().length > 0) {
    // Generate a short stable slug
    const cleanSeed = seed.trim().toLowerCase()
      .replace(/[^\w\u0600-\u06FF]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 20);
    if (cleanSeed) {
      return `${prefix}-${cleanSeed}`;
    }
  }
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  return `${prefix}-${randomSuffix}`;
}

export function validateAndCleanValue(
  field: string,
  rawVal: string | undefined,
  rule?: ValidationRule
): string {
  if (!rule) return rawVal || '';
  const trimmed = (rawVal || '').trim();

  switch (rule.type) {
    case 'BOOLEAN': {
      const upper = trimmed.toUpperCase();
      if (upper === 'TRUE' || upper === '1' || upper === 'YES' || trimmed === 'نعم') {
        return 'TRUE';
      }
      if (upper === 'FALSE' || upper === '0' || upper === 'NO' || trimmed === 'لا') {
        return 'FALSE';
      }
      return rule.defaultValue || 'TRUE';
    }
    case 'NUMERIC': {
      const num = parseFloat(trimmed);
      if (isNaN(num)) {
        return rule.defaultValue || '0';
      }
      return num.toString();
    }
    case 'DROPDOWN': {
      if (rule.options && rule.options.includes(trimmed)) {
        return trimmed;
      }
      // Case-insensitive fallback
      if (rule.options) {
        const match = rule.options.find(o => o.toLowerCase() === trimmed.toLowerCase());
        if (match) return match;
      }
      return rule.defaultValue || (rule.options ? rule.options[0] : '');
    }
    case 'REQUIRED_STRING': {
      if (trimmed.length > 0) return trimmed;
      return rule.defaultValue || '';
    }
    case 'AUTO_ID': {
      if (trimmed.length > 0) return trimmed;
      return generateAutoId(rule.field === 'id' ? 'auto' : rule.field);
    }
    default:
      return trimmed;
  }
}
