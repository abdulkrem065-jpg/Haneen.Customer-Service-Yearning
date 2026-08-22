import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateSequentialAutoId,
  validateAndCleanValue,
  validateStrictInput,
  VALIDATION_RULES
} from '../infrastructure/google-sheets/validation-and-autoid';
import { GoogleSheetsAdminReconciler } from '../infrastructure/google-sheets/admin-reconciler';
import { MockGoogleSheetsTransport } from '../infrastructure/google-sheets/mock-transport';
import { BusinessKnowledgeProvisioner } from '../infrastructure/google-sheets/provision-business-knowledge';
import { HaneenService } from './productization/haneen-service';
import { ChatRateLimiter } from './productization/rate-limiter';
import { HeaderMap } from '../infrastructure/google-sheets/header-map';

describe('CMD-077 — Google Sheets Input Validation & Business Data Entry Hardening', () => {

  describe('1. Numeric Validation Enforcements (price, quantity, fees)', () => {
    it('1.1 should REJECT price containing letters or currency units like "500 ريال"', () => {
      const res = validateStrictInput('products', 'price', '500 ريال');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('REJECT');
    });

    it('1.2 should REJECT negative price values like "-100"', () => {
      const res = validateStrictInput('products', 'price', '-100');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('REJECT');
    });

    it('1.3 should ACCEPT valid non-negative numbers for price', () => {
      const res1 = validateStrictInput('products', 'price', '500');
      expect(res1.valid).toBe(true);
      expect(res1.cleanedValue).toBe('500');

      const res2 = validateStrictInput('products', 'price', '1250.50');
      expect(res2.valid).toBe(true);
      expect(res2.cleanedValue).toBe('1250.5');
    });

    it('1.4 should REJECT quantity containing text like "عشر" or decimals like "5.5"', () => {
      const res1 = validateStrictInput('products', 'quantity', 'عشر');
      expect(res1.valid).toBe(false);
      expect(res1.error).toContain('REJECT');

      const res2 = validateStrictInput('products', 'quantity', '5.5');
      expect(res2.valid).toBe(false);
      expect(res2.error).toContain('REJECT');
    });

    it('1.5 should ACCEPT non-negative integer for quantity', () => {
      const res = validateStrictInput('products', 'quantity', '10');
      expect(res.valid).toBe(true);
      expect(res.cleanedValue).toBe('10');
    });
  });

  describe('2. Category Dropdown Validation', () => {
    const validCats = ['تموين', 'سمون وزيوت', 'إلكترونيات', 'cat-001', 'cat-002'];

    it('2.1 should ACCEPT valid category name or ID from category dropdown list', () => {
      const res1 = validateStrictInput('products', 'categoryId', 'تموين', { validCategories: validCats });
      expect(res1.valid).toBe(true);

      const res2 = validateStrictInput('products', 'categoryId', 'cat-001', { validCategories: validCats });
      expect(res2.valid).toBe(true);
    });

    it('2.2 should REJECT category not present in category list', () => {
      const res = validateStrictInput('products', 'categoryId', 'تصنيف وهمي غير موجود', { validCategories: validCats });
      expect(res.valid).toBe(false);
      expect(res.error).toContain('REJECT');
    });
  });

  describe('3. Currency Dropdown Validation', () => {
    it('3.1 should ACCEPT YER, SAR, USD', () => {
      expect(validateStrictInput('products', 'currency', 'YER').valid).toBe(true);
      expect(validateStrictInput('products', 'currency', 'SAR').valid).toBe(true);
      expect(validateStrictInput('products', 'currency', 'USD').valid).toBe(true);
    });

    it('3.2 should REJECT invalid currencies like "YEM" or "EUR"', () => {
      const res1 = validateStrictInput('products', 'currency', 'YEM');
      expect(res1.valid).toBe(false);
      expect(res1.error).toContain('REJECT');

      const res2 = validateStrictInput('products', 'currency', 'EUR');
      expect(res2.valid).toBe(false);
      expect(res2.error).toContain('REJECT');
    });
  });

  describe('4. Boolean Dropdowns Validation', () => {
    it('4.1 should ACCEPT canonical TRUE and FALSE', () => {
      expect(validateStrictInput('products', 'inStock', 'TRUE').valid).toBe(true);
      expect(validateStrictInput('products', 'inStock', 'FALSE').valid).toBe(true);
      expect(validateStrictInput('categories', 'isActive', 'TRUE').valid).toBe(true);
    });

    it('4.2 should REJECT non-canonical strings like "موجود" under strict input validation', () => {
      const res = validateStrictInput('products', 'inStock', 'موجود');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('REJECT');
    });
  });

  describe('5. Payment Method Type Dropdown Validation', () => {
    it('5.1 should ACCEPT WALLET, CASH, BANK, OTHER', () => {
      expect(validateStrictInput('payment_methods', 'methodType', 'WALLET').valid).toBe(true);
      expect(validateStrictInput('payment_methods', 'methodType', 'CASH').valid).toBe(true);
      expect(validateStrictInput('payment_methods', 'methodType', 'BANK').valid).toBe(true);
      expect(validateStrictInput('payment_methods', 'methodType', 'OTHER').valid).toBe(true);
    });

    it('5.2 should REJECT invalid payment method type like "BITCOIN"', () => {
      const res = validateStrictInput('payment_methods', 'methodType', 'BITCOIN');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('REJECT');
    });
  });

  describe('6. Store Contact Channel Type Dropdown Validation', () => {
    it('6.1 should ACCEPT PHONE, WHATSAPP, EMAIL, OTHER', () => {
      expect(validateStrictInput('store_contacts', 'channelType', 'PHONE').valid).toBe(true);
      expect(validateStrictInput('store_contacts', 'channelType', 'WHATSAPP').valid).toBe(true);
      expect(validateStrictInput('store_contacts', 'channelType', 'EMAIL').valid).toBe(true);
      expect(validateStrictInput('store_contacts', 'channelType', 'OTHER').valid).toBe(true);
    });

    it('6.2 should REJECT invalid contact channel type like "TELEGRAM"', () => {
      const res = validateStrictInput('store_contacts', 'channelType', 'TELEGRAM');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('REJECT');
    });
  });

  describe('7. Phone & WhatsApp Number Preservation', () => {
    it('7.1 should preserve phone numbers with leading zeros and country codes as raw strings', () => {
      const rawPhone = '+967770493341';
      const rawWa = 'https://wa.me/967770493341';
      const cleanPhone = validateAndCleanValue('contactValue', rawPhone);
      const cleanWa = validateAndCleanValue('contactValue', rawWa);

      expect(cleanPhone).toBe('+967770493341');
      expect(cleanWa).toBe('https://wa.me/967770493341');
    });
  });

  describe('8. Auto Fields & Duplicate Protection with Admin Reconciler', () => {
    let mockTransport: MockGoogleSheetsTransport;
    let reconciler: GoogleSheetsAdminReconciler;

    beforeEach(async () => {
      mockTransport = new MockGoogleSheetsTransport();
      reconciler = new GoogleSheetsAdminReconciler(mockTransport);

      // Seed categories
      await mockTransport.writeHeaderRow('categories', ['id', 'tenantId', 'storeId', 'name', 'isActive', 'createdAt', 'updatedAt']);
      await mockTransport.addRow('categories', ['cat-001', 'tnt-41f0d530', 'str-2c6ad81f', 'تموين', 'TRUE', '2026-08-21T00:00:00Z', '2026-08-21T00:00:00Z']);

      // Seed products with missing IDs and unmapped category names
      await mockTransport.writeHeaderRow('products', ['id', 'tenantId', 'storeId', 'name', 'price', 'quantity', 'currency', 'inStock', 'categoryId', 'createdAt', 'updatedAt']);
      await mockTransport.addRow('products', ['prod-001', '', '', 'سكر السعيد', '500', '10', 'YER', 'TRUE', 'cat-001', '2026-08-21T00:00:00Z', '2026-08-21T00:00:00Z']);
      // Incomplete row added manually by operator
      await mockTransport.addRow('products', ['', '', '', 'زيت الجبل الجديد', '800', '5', 'yer', 'TRUE', 'تموين', '', '']);
    });

    it('8.1 should auto-fill missing IDs, tenant context, category mapped ID, and timestamps', async () => {
      const summary = await reconciler.reconcileAll();
      expect(summary.productsAutoFieldsFilled).toBeGreaterThan(0);

      const prodRows = await mockTransport.getRows('products');
      const row2 = prodRows[2].values; // oils row

      expect(row2[0]).toBe('prod-002'); // auto ID generated
      expect(row2[1]).toBe('tnt-41f0d530'); // tenantId enforced
      expect(row2[2]).toBe('str-2c6ad81f'); // storeId enforced
      expect(row2[6]).toBe('YER'); // currency normalized
      expect(row2[8]).toBe('cat-001'); // category name 'تموين' mapped to 'cat-001'
    });

    it('8.2 should apply data validations and number validations to transport', async () => {
      await reconciler.reconcileAll();
      const catValidations = mockTransport.getValidations('products');
      const numValidations = mockTransport.getNumberValidations('products');

      expect(catValidations.length).toBeGreaterThan(0);
      expect(numValidations.length).toBeGreaterThan(0);
    });
  });

  describe('9. Live Dynamic Sana Policy Integration', () => {
    it('9.1 should reflect updated Google Sheets price and availability in Sana policy', async () => {
      const mockTransport = new MockGoogleSheetsTransport();
      const provisioner = new BusinessKnowledgeProvisioner(mockTransport);
      await provisioner.provisionAll();

      const rateLimiter = new ChatRateLimiter({ maxRequests: 1000, windowMs: 60000 });
      const service = new HaneenService(undefined, undefined, rateLimiter, { sheetsTransport: mockTransport });

      let policy = await service.getLiveKnowledgePolicy();
      expect(policy.persona).toContain('متجر الذيباني');

      // Update price of 'سكر السعيد ابو كيلو' to 850 YER
      const prodRows = await mockTransport.getRows('products');
      const hMap = new HeaderMap(prodRows[0].values, prodRows[0].values);

      for (let i = 1; i < prodRows.length; i++) {
        if (hMap.getValue(prodRows[i].values, 'name') === 'سكر السعيد ابو كيلو') {
          const rowVals = [...prodRows[i].values];
          for (let j = 0; j < rowVals.length; j++) {
            if (prodRows[0].values[j] === 'price') rowVals[j] = '850';
          }
          await mockTransport.updateRow('products', prodRows[i].rowNumber, rowVals);
        }
      }

      service.invalidatePolicyCache();
      policy = await service.getLiveKnowledgePolicy();
      expect(policy.persona).toContain('850 YER');
    });
  });

});
