import { describe, it, expect } from 'vitest';
import { CanonicalSchemas } from '../infrastructure/google-sheets/schema-definitions';
import { 
  PaymentMethod, 
  BusinessHour, 
  DeliveryConfiguration, 
  StoreContact, 
  StoreLocation, 
  StoreNotice,
  StoreSettings
} from './data/domain';

describe('CMD-029 Business Knowledge Schema Tests', () => {
  it('should have payment_methods schema configured properly', () => {
    const schema = CanonicalSchemas['payment_methods'];
    expect(schema).toBeDefined();
    expect(schema.scope).toBe('STORE');
    expect(schema.requiredHeaders).toContain('methodType');
    expect(schema.requiredHeaders).toContain('isActive');
    expect(schema.foreignKeys).toContain('tenantId');
  });

  it('should have business_hours schema configured properly', () => {
    const schema = CanonicalSchemas['business_hours'];
    expect(schema).toBeDefined();
    expect(schema.scope).toBe('STORE');
    expect(schema.requiredHeaders).toContain('dayOfWeek');
    expect(schema.requiredHeaders).toContain('isClosed');
  });

  it('should have delivery_configuration schema configured properly', () => {
    const schema = CanonicalSchemas['delivery_configuration'];
    expect(schema).toBeDefined();
    expect(schema.scope).toBe('STORE');
    expect(schema.requiredHeaders).toContain('isEnabled');
    expect(schema.optionalHeaders).toContain('deliveryFee');
  });

  it('should have store_contacts schema configured properly', () => {
    const schema = CanonicalSchemas['store_contacts'];
    expect(schema).toBeDefined();
    expect(schema.scope).toBe('STORE');
    expect(schema.requiredHeaders).toContain('channelType');
    expect(schema.requiredHeaders).toContain('contactValue');
  });

  it('should distinguish baseCurrency in store_settings', () => {
    const schema = CanonicalSchemas['store_settings'];
    expect(schema.requiredHeaders).toContain('baseCurrency');
    expect(schema.requiredHeaders).not.toContain('currency');
  });
});
