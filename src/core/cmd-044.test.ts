import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Request, Response } from 'express';
import { liveHaneenVerificationEndpoint, renderLiveHaneenVerificationUI } from '../infrastructure/google-sheets/admin/live-haneen-verification-endpoint';
import { NoHallucinationGuard } from './tools/no-hallucination-guard';
import { UnauthorizedDataAccessError } from './data/errors';

describe('CMD-044 — LIVE RENDER HANEEN READ-BACK & REAL CUSTOMER SERVICE VERIFICATION', () => {
  const originalEnv = process.env;
  const AUTHORITATIVE_TENANT_ID = 'tnt-41f0d530';
  const AUTHORITATIVE_STORE_ID = 'str-2c6ad81f';
  const AUTHORITATIVE_AGENT_ID = 'agt-c93183d5';

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

  describe('1. Endpoint Authentication & Security Guard', () => {
    it('should reject request with 403 if ADMIN_VERIFY_SECRET is not configured', async () => {
      delete process.env.ADMIN_VERIFY_SECRET;

      const req = { headers: {}, query: {} } as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as unknown as Response;

      await liveHaneenVerificationEndpoint(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        verdict: 'BLOCKED',
        message: 'Admin verification secret is not configured in the environment.',
        writesExecuted: 0
      });
    });

    it('should reject request with 401 if authorization header is missing or incorrect', async () => {
      process.env.ADMIN_VERIFY_SECRET = 'secret-haneen-044';

      const req = { headers: { authorization: 'Bearer invalid-secret' }, query: {} } as unknown as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as unknown as Response;

      await liveHaneenVerificationEndpoint(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        verdict: 'BLOCKED',
        message: 'Unauthorized. Invalid or missing Admin secret.',
        writesExecuted: 0
      });
    });

    it('should reject tenant context override attack with 403', async () => {
      process.env.ADMIN_VERIFY_SECRET = 'secret-haneen-044';

      const req = {
        headers: { authorization: 'Bearer secret-haneen-044' },
        query: { tenantId: 'attacker-tenant-999' },
        body: {}
      } as unknown as Request;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as unknown as Response;

      await liveHaneenVerificationEndpoint(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      const body = (res.json as any).mock.calls[0][0];
      expect(body.verdict).toBe('BLOCKED');
      expect(body.error).toContain('Cross-tenant context override rejected');
      expect(body.writesExecuted).toBe(0);
    });

    it('should reject store context override attack with 403', async () => {
      process.env.ADMIN_VERIFY_SECRET = 'secret-haneen-044';

      const req = {
        headers: { authorization: 'Bearer secret-haneen-044' },
        query: { storeId: 'attacker-store-999' },
        body: {}
      } as unknown as Request;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as unknown as Response;

      await liveHaneenVerificationEndpoint(req, res);

      expect(res.status).toHaveBeenCalledWith(403);
      const body = (res.json as any).mock.calls[0][0];
      expect(body.verdict).toBe('BLOCKED');
      expect(body.error).toContain('Cross-store context override rejected');
      expect(body.writesExecuted).toBe(0);
    });
  });

  describe('2. Environment & Local Execution Detection', () => {
    it('should report verdict BLOCKED — LOCAL VERIFICATION ONLY when running outside Render', async () => {
      process.env.ADMIN_VERIFY_SECRET = 'secret-haneen-044';
      delete process.env.RENDER;
      delete process.env.RENDER_SERVICE_ID;

      const req = {
        headers: { authorization: 'Bearer secret-haneen-044' },
        query: {},
        body: {}
      } as unknown as Request;

      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn()
      } as unknown as Response;

      await liveHaneenVerificationEndpoint(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const body = (res.json as any).mock.calls[0][0];
      expect(body.verdict).toContain('BLOCKED');
      expect(body.writesExecuted).toBe(0);
    });
  });

  describe('3. NoHallucination Guard & Context Validation', () => {
    it('should throw UnauthorizedDataAccessError if requested tenant context differs', () => {
      expect(() => {
        NoHallucinationGuard.validateTrustedContext(
          { tenantId: 'malicious-tenant' },
          trustedContext
        );
      }).toThrow(UnauthorizedDataAccessError);
    });

    it('should throw UnauthorizedDataAccessError if requested store context differs', () => {
      expect(() => {
        NoHallucinationGuard.validateTrustedContext(
          { storeId: 'malicious-store' },
          trustedContext
        );
      }).toThrow(UnauthorizedDataAccessError);
    });

    it('should pass validation when matching trusted context', () => {
      expect(() => {
        NoHallucinationGuard.validateTrustedContext(
          { tenantId: AUTHORITATIVE_TENANT_ID, storeId: AUTHORITATIVE_STORE_ID },
          trustedContext
        );
      }).not.toThrow();
    });
  });

  describe('4. Secure Live Haneen UI Interface', () => {
    it('should render HTML page containing form and required fields', () => {
      const req = {} as Request;
      let htmlResponse = '';
      const res = {
        setHeader: vi.fn(),
        send: vi.fn((content: string) => { htmlResponse = content; })
      } as unknown as Response;

      renderLiveHaneenVerificationUI(req, res);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
      expect(htmlResponse).toContain('<!DOCTYPE html>');
      expect(htmlResponse).toContain('input type="password" id="secret"');
      expect(htmlResponse).toContain('فحص خدمة العملاء حنين المباشر');
      expect(htmlResponse).toContain('/api/admin/live-haneen-verification');
      expect(htmlResponse).not.toContain('localStorage.setItem');
      expect(htmlResponse).not.toContain('sessionStorage.setItem');
    });
  });
});
