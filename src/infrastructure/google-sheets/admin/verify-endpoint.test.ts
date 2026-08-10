import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Request, Response } from 'express';
import { verifyGoogleSheetsConnection } from './verify-endpoint';

describe('CMD-019 Secure Verify Endpoint', () => {
  const originalEnv = process.env;
  
  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('blocks request if ADMIN_VERIFY_SECRET is not configured in environment', async () => {
    delete process.env.ADMIN_VERIFY_SECRET;
    
    const req = { headers: {} } as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as unknown as Response;

    await verifyGoogleSheetsConnection(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      status: 'BLOCKED',
      message: 'Admin verification secret is not configured in the environment.'
    });
  });

  it('blocks request if authorization header is missing or incorrect', async () => {
    process.env.ADMIN_VERIFY_SECRET = 'super-secret';
    
    const req = { headers: { authorization: 'Bearer wrong-secret' } } as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as unknown as Response;

    await verifyGoogleSheetsConnection(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      status: 'BLOCKED',
      message: 'Unauthorized. Invalid or missing Admin secret.'
    });
  });

  it('reports missing google credentials without leaking values', async () => {
    process.env.ADMIN_VERIFY_SECRET = 'super-secret';
    process.env.GOOGLE_SHEETS_CLIENT_EMAIL = 'my-email@test.com';
    delete process.env.GOOGLE_SHEETS_PRIVATE_KEY;
    delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    
    const req = { headers: { authorization: 'Bearer super-secret' } } as Request;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    } as unknown as Response;

    await verifyGoogleSheetsConnection(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    const jsonCall = (res.json as any).mock.calls[0][0];
    
    expect(jsonCall.status).toBe('BLOCKED');
    expect(jsonCall.envStatus).toEqual({
      CLIENT_EMAIL: 'PRESENT',
      PRIVATE_KEY: 'MISSING',
      SPREADSHEET_ID: 'MISSING'
    });
    // Ensure actual values are NOT present in the response
    expect(JSON.stringify(jsonCall)).not.toContain('my-email@test.com');
  });
});
