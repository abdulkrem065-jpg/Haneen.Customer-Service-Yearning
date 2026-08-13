import { Request, Response } from 'express';
import { ConfigValidator } from '../config';
import { GoogleServiceAccountAuth } from '../auth';
import { SecureGoogleSheetsTransport } from '../secure-transport';
import { GoogleSheetsDataProvider } from '../provider';
import {
  PaymentMethodMapper,
  StoreContactMapper,
  BusinessHourMapper,
  DeliveryConfigurationMapper,
  DeliveryZoneMapper,
  StoreLocationMapper,
  StorePolicyMapper,
  DigitalServiceMapper,
  StoreNoticeMapper,
  FeatureToggleMapper
} from '../domain-mappers';
import { ALTHEIBANI_TENANT_ID, ALTHEIBANI_STORE_ID } from '../import-altheibani-catalog';
import { UnauthorizedDataAccessError } from '../../../core/data/errors';

export const ALLOWED_WRITE_DOMAINS = [
  'payment_methods',
  'store_contacts',
  'business_hours',
  'delivery_configuration',
  'delivery_zones',
  'store_locations',
  'store_policies',
  'digital_services',
  'store_notices',
  'feature_toggles'
] as const;

export function validateTrustedContextSecurity(req: Request, trustedContext: { tenantId: string; storeId: string }) {
  const bodyTenant = req.body?.tenantId;
  const bodyStore = req.body?.storeId;
  const queryTenant = req.query?.tenantId;
  const queryStore = req.query?.storeId;
  const headerTenant = req.headers['x-tenant-id'];
  const headerStore = req.headers['x-store-id'];

  if (bodyTenant && bodyTenant !== trustedContext.tenantId) {
    throw new UnauthorizedDataAccessError(`Attempted tenantId override in body detected: ${bodyTenant}`);
  }
  if (bodyStore && bodyStore !== trustedContext.storeId) {
    throw new UnauthorizedDataAccessError(`Attempted storeId override in body detected: ${bodyStore}`);
  }
  if (queryTenant && queryTenant !== trustedContext.tenantId) {
    throw new UnauthorizedDataAccessError(`Attempted tenantId override in query detected: ${queryTenant}`);
  }
  if (queryStore && queryStore !== trustedContext.storeId) {
    throw new UnauthorizedDataAccessError(`Attempted storeId override in query detected: ${queryStore}`);
  }
  if (headerTenant && headerTenant !== trustedContext.tenantId) {
    throw new UnauthorizedDataAccessError(`Attempted tenantId override in header detected: ${headerTenant}`);
  }
  if (headerStore && headerStore !== trustedContext.storeId) {
    throw new UnauthorizedDataAccessError(`Attempted storeId override in header detected: ${headerStore}`);
  }
}

export async function getOwnerSettingsEndpoint(req: Request, res: Response) {
  try {
    const trustedContext = {
      tenantId: ALTHEIBANI_TENANT_ID,
      storeId: ALTHEIBANI_STORE_ID,
      agentId: 'agt-c93183d5'
    };

    validateTrustedContextSecurity(req, trustedContext);

    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_ID || '1b8x4Ub263-Yxbs8_ypjTWrV1_sgM9gLoE3gRx8U2mLo';
    const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;

    if (!clientEmail || !privateKey) {
      return res.status(200).json({
        success: false,
        message: 'Google Sheets credentials not configured. Returning fallback state.'
      });
    }

    const config = ConfigValidator.validate({ spreadsheetId, clientEmail, privateKey, mockMode: false });
    const authClient = new GoogleServiceAccountAuth(config);
    const transport = new SecureGoogleSheetsTransport(authClient, config);

    const pmProvider = new GoogleSheetsDataProvider(transport, new PaymentMethodMapper());
    const cntProvider = new GoogleSheetsDataProvider(transport, new StoreContactMapper());
    const bhProvider = new GoogleSheetsDataProvider(transport, new BusinessHourMapper());
    const dcProvider = new GoogleSheetsDataProvider(transport, new DeliveryConfigurationMapper());
    const dzProvider = new GoogleSheetsDataProvider(transport, new DeliveryZoneMapper());
    const locProvider = new GoogleSheetsDataProvider(transport, new StoreLocationMapper());
    const polProvider = new GoogleSheetsDataProvider(transport, new StorePolicyMapper());
    const dsProvider = new GoogleSheetsDataProvider(transport, new DigitalServiceMapper());
    const notProvider = new GoogleSheetsDataProvider(transport, new StoreNoticeMapper());

    const pmResult = await pmProvider.search({}, trustedContext);
    const cntResult = await cntProvider.search({}, trustedContext);
    const bhResult = await bhProvider.search({}, trustedContext);
    const dcResult = await dcProvider.search({}, trustedContext);
    const dzResult = await dzProvider.search({}, trustedContext);
    const locResult = await locProvider.search({}, trustedContext);
    const polResult = await polProvider.search({}, trustedContext);
    const dsResult = await dsProvider.search({}, trustedContext);
    const notResult = await notProvider.search({}, trustedContext);

    return res.status(200).json({
      success: true,
      trustedContext: {
        tenantId: trustedContext.tenantId,
        storeId: trustedContext.storeId,
        agentId: trustedContext.agentId
      },
      paymentMethods: pmResult.items,
      storeContacts: cntResult.items,
      businessHours: bhResult.items,
      deliveryConfiguration: dcResult.items[0] || null,
      deliveryZones: dzResult.items,
      storeLocations: locResult.items,
      storePolicies: polResult.items,
      digitalServices: dsResult.items,
      storeNotices: notResult.items
    });
  } catch (error: any) {
    if (error instanceof UnauthorizedDataAccessError) {
      return res.status(403).json({
        success: false,
        error: 'UnauthorizedDataAccessError',
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

export async function updateOwnerSettingEndpoint(req: Request, res: Response) {
  try {
    const trustedContext = {
      tenantId: ALTHEIBANI_TENANT_ID,
      storeId: ALTHEIBANI_STORE_ID,
      agentId: 'agt-c93183d5'
    };

    // 1. Validate Context Security (reject override attempts)
    validateTrustedContextSecurity(req, trustedContext);

    // 2. Validate Domain Scope Boundary
    const { domain, id, isActive, data } = req.body || {};

    if (!domain || !ALLOWED_WRITE_DOMAINS.includes(domain as any)) {
      return res.status(403).json({
        success: false,
        error: 'OUT_OF_SCOPE_WRITE_BLOCKED',
        message: `Modification of table '${domain}' is strictly forbidden.`
      });
    }

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameter: id.'
      });
    }

    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || process.env.GOOGLE_SHEETS_ID || '1b8x4Ub263-Yxbs8_ypjTWrV1_sgM9gLoE3gRx8U2mLo';
    const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;

    if (!clientEmail || !privateKey) {
      return res.status(400).json({
        success: false,
        message: 'Google Sheets credentials missing in environment variables.'
      });
    }

    const config = ConfigValidator.validate({ spreadsheetId, clientEmail, privateKey, mockMode: false });
    const authClient = new GoogleServiceAccountAuth(config);
    const transport = new SecureGoogleSheetsTransport(authClient, config);

    let updatedEntity: any = null;
    let readBackEntity: any = null;

    const updates = data || (typeof isActive === 'boolean' ? { isActive } : {});

    if (domain === 'payment_methods') {
      const pmProvider = new GoogleSheetsDataProvider(transport, new PaymentMethodMapper());
      updatedEntity = await pmProvider.update(id, updates, trustedContext);
      readBackEntity = await pmProvider.getById(id, trustedContext);
    } else if (domain === 'store_contacts') {
      const cntProvider = new GoogleSheetsDataProvider(transport, new StoreContactMapper());
      updatedEntity = await cntProvider.update(id, updates, trustedContext);
      readBackEntity = await cntProvider.getById(id, trustedContext);
    } else if (domain === 'business_hours') {
      const bhProvider = new GoogleSheetsDataProvider(transport, new BusinessHourMapper());
      updatedEntity = await bhProvider.update(id, updates, trustedContext);
      readBackEntity = await bhProvider.getById(id, trustedContext);
    } else if (domain === 'delivery_configuration') {
      const dcProvider = new GoogleSheetsDataProvider(transport, new DeliveryConfigurationMapper());
      updatedEntity = await dcProvider.update(id, updates, trustedContext);
      readBackEntity = await dcProvider.getById(id, trustedContext);
    } else if (domain === 'delivery_zones') {
      const dzProvider = new GoogleSheetsDataProvider(transport, new DeliveryZoneMapper());
      updatedEntity = await dzProvider.update(id, updates, trustedContext);
      readBackEntity = await dzProvider.getById(id, trustedContext);
    } else if (domain === 'store_locations') {
      const locProvider = new GoogleSheetsDataProvider(transport, new StoreLocationMapper());
      updatedEntity = await locProvider.update(id, updates, trustedContext);
      readBackEntity = await locProvider.getById(id, trustedContext);
    } else if (domain === 'store_policies') {
      const polProvider = new GoogleSheetsDataProvider(transport, new StorePolicyMapper());
      updatedEntity = await polProvider.update(id, updates, trustedContext);
      readBackEntity = await polProvider.getById(id, trustedContext);
    } else if (domain === 'digital_services') {
      const dsProvider = new GoogleSheetsDataProvider(transport, new DigitalServiceMapper());
      updatedEntity = await dsProvider.update(id, updates, trustedContext);
      readBackEntity = await dsProvider.getById(id, trustedContext);
    } else if (domain === 'store_notices') {
      const notProvider = new GoogleSheetsDataProvider(transport, new StoreNoticeMapper());
      updatedEntity = await notProvider.update(id, updates, trustedContext);
      readBackEntity = await notProvider.getById(id, trustedContext);
    }

    return res.status(200).json({
      success: true,
      domain,
      recordId: id,
      writePerformed: true,
      updatedEntity,
      readBackEntity
    });
  } catch (error: any) {
    if (error instanceof UnauthorizedDataAccessError) {
      return res.status(403).json({
        success: false,
        error: 'UnauthorizedDataAccessError',
        message: error.message
      });
    }
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
