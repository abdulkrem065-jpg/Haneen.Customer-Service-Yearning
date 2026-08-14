import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Request, Response } from 'express';
import { productionReadinessEndpoint, renderProductionReadinessUI } from '../infrastructure/google-sheets/admin/production-readiness-endpoint';
import { NoHallucinationGuard } from './tools/no-hallucination-guard';
import { UnauthorizedDataAccessError } from './data/errors';

describe('CMD-043 — SECURE BROWSER PRODUCTION VERIFICATION UI & GATE', () => {
  const originalEnv = process.env;
  const AUTHORITATIVE_SPREADSHEET_ID = '1b8x4Ub263-Yxbs8_ypjTWrV1_sgM9gLoE3gRx8U2mLo';
  const AUTHORITATIVE_TENANT_ID = 'tnt-41f0d530';
  const AUTHORITATIVE_STORE_ID = 'str-2c6ad81f';
  const AUTHORITATIVE_AGENT_ID = 'agt-c93183d5';
  const BASE_CURRENCY = 'YER';

  const trustedContext = {
    tenantId: AUTHORITATIVE_TENANT_ID,
    storeId: AUTHORITATIVE_STORE_ID,
    agentId: AUTHORITATIVE_AGENT_ID
  };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('1. Endpoint Authentication & Secret Non-Exposure', () => {
    it('should reject request if ADMIN_VERIFY_SECRET is not configured in environment', async () => {
      delete process.env.ADMIN_VERIFY_SECRET;

      const req = { headers: {} } as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as unknown as Response;

      await productionReadinessEndpoint(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        status: 'BLOCKED',
        message: 'Admin verification secret is not configured in the environment.',
        writesExecuted: 0
      });
    });

    it('should reject request if authorization header is missing or incorrect', async () => {
      process.env.ADMIN_VERIFY_SECRET = 'correct-admin-secret-999';

      const req = { headers: { authorization: 'Bearer wrong-secret' } } as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as unknown as Response;

      await productionReadinessEndpoint(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        status: 'BLOCKED',
        message: 'Unauthorized. Invalid or missing Admin secret.',
        writesExecuted: 0
      });
    });

    it('should succeed authentication when valid secret is supplied and report status without leaking secret value', async () => {
      process.env.ADMIN_VERIFY_SECRET = 'correct-admin-secret-999';
      delete process.env.RENDER;
      delete process.env.GOOGLE_SHEETS_PRIVATE_KEY;

      const req = { headers: { authorization: 'Bearer correct-admin-secret-999' } } as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as unknown as Response;

      await productionReadinessEndpoint(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const jsonCall = (res.json as any).mock.calls[0][0];

      expect(jsonCall.status).toBe('BLOCKED');
      expect(jsonCall.writesExecuted).toBe(0);
      
      // Ensure the actual secret string is never exposed anywhere in the response JSON
      const serializedResponse = JSON.stringify(jsonCall);
      expect(serializedResponse).not.toContain('correct-admin-secret-999');
    });
  });

  describe('2. Strict Read-Only & Zero Write Enforcement', () => {
    it('should guarantee writesExecuted is 0 in all scenarios', async () => {
      process.env.ADMIN_VERIFY_SECRET = 'test-secret';

      const req = { headers: { authorization: 'Bearer test-secret' } } as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as unknown as Response;

      await productionReadinessEndpoint(req, res);

      const jsonCall = (res.json as any).mock.calls[0][0];
      expect(jsonCall.writesExecuted).toBe(0);
    });
  });

  describe('3. Trusted Context Boundary & Anti-Hijack Guard', () => {

    it('should reject tenantId context override attempt from client payload', () => {
      expect(() => {
        NoHallucinationGuard.validateTrustedContext({ tenantId: 'attacker-tenant-999' }, trustedContext);
      }).toThrow(UnauthorizedDataAccessError);
    });

    it('should reject storeId context override attempt from client payload', () => {
      expect(() => {
        NoHallucinationGuard.validateTrustedContext({ storeId: 'attacker-store-999' }, trustedContext);
      }).toThrow(UnauthorizedDataAccessError);
    });

    it('should accept matching trusted context without error', () => {
      expect(() => {
        NoHallucinationGuard.validateTrustedContext({
          tenantId: AUTHORITATIVE_TENANT_ID,
          storeId: AUTHORITATIVE_STORE_ID
        }, trustedContext);
      }).not.toThrow();
    });
  });

  describe('4. Secure Browser UI Endpoint Verification', () => {
    it('should render HTML page containing required password field and submit button', () => {
      const req = {} as Request;
      let sentHtml = '';
      const res = {
        setHeader: vi.fn(),
        send: vi.fn((html: string) => { sentHtml = html; })
      } as unknown as Response;

      renderProductionReadinessUI(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
      expect(sentHtml).toContain('<!DOCTYPE html>');
      expect(sentHtml).toContain('input type="password" id="secret"');
      expect(sentHtml).toContain('تحقق من بيئة الإنتاج');
      expect(sentHtml).toContain('/api/admin/production-readiness');
      expect(sentHtml).not.toContain('localStorage.setItem');
      expect(sentHtml).not.toContain('sessionStorage.setItem');
    });
  });
});
