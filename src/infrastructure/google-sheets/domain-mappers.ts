import { ISheetMapper, parseBoolean, formatBoolean } from './mapper';
import { HeaderMap } from './header-map';
import {
  PaymentMethod,
  StoreContact,
  BusinessHour,
  DeliveryConfiguration,
  DeliveryZone,
  StoreLocation,
  StorePolicy,
  DigitalService,
  Lead,
  StoreNotice,
  FeatureToggle
} from '../../core/data/domain';
import { CanonicalSchemas } from './schema-definitions';

export class PaymentMethodMapper implements ISheetMapper<PaymentMethod> {
  sheetName = CanonicalSchemas.payment_methods.sheetName;
  requiredHeaders = CanonicalSchemas.payment_methods.requiredHeaders;
  defaultHeaders = [...CanonicalSchemas.payment_methods.requiredHeaders, ...CanonicalSchemas.payment_methods.optionalHeaders];

  fromRow(rowValues: string[], headerMap: HeaderMap): PaymentMethod {
    const id = headerMap.requireValue(rowValues, 'id');
    const tenantId = headerMap.requireValue(rowValues, 'tenantId');
    const storeId = headerMap.requireValue(rowValues, 'storeId');
    const methodType = headerMap.requireValue(rowValues, 'methodType');
    const displayName = headerMap.requireValue(rowValues, 'displayName');
    const accountDetails = headerMap.getValue(rowValues, 'accountDetails') || '';
    const isActiveStr = headerMap.requireValue(rowValues, 'isActive');
    const displayOrderStr = headerMap.requireValue(rowValues, 'displayOrder');
    const createdAtStr = headerMap.requireValue(rowValues, 'createdAt');
    const updatedAtStr = headerMap.requireValue(rowValues, 'updatedAt');

    return {
      id,
      tenantId,
      storeId,
      methodType,
      displayName,
      accountDetails,
      isActive: parseBoolean(isActiveStr),
      displayOrder: parseInt(displayOrderStr, 10) || 1,
      createdAt: new Date(createdAtStr),
      updatedAt: new Date(updatedAtStr)
    };
  }

  toRow(entity: PaymentMethod, headerMap: HeaderMap): string[] {
    return headerMap.buildRow({
      id: entity.id,
      tenantId: entity.tenantId,
      storeId: entity.storeId,
      methodType: entity.methodType,
      displayName: entity.displayName,
      accountDetails: entity.accountDetails || '',
      isActive: formatBoolean(entity.isActive),
      displayOrder: entity.displayOrder.toString(),
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString()
    });
  }

  getId(entity: PaymentMethod): string {
    return entity.id;
  }
}

export class StoreContactMapper implements ISheetMapper<StoreContact> {
  sheetName = CanonicalSchemas.store_contacts.sheetName;
  requiredHeaders = CanonicalSchemas.store_contacts.requiredHeaders;
  defaultHeaders = [...CanonicalSchemas.store_contacts.requiredHeaders, ...CanonicalSchemas.store_contacts.optionalHeaders];

  fromRow(rowValues: string[], headerMap: HeaderMap): StoreContact {
    const id = headerMap.requireValue(rowValues, 'id');
    const tenantId = headerMap.requireValue(rowValues, 'tenantId');
    const storeId = headerMap.requireValue(rowValues, 'storeId');
    const channelType = headerMap.requireValue(rowValues, 'channelType');
    const contactValue = headerMap.requireValue(rowValues, 'contactValue');
    const isActiveStr = headerMap.requireValue(rowValues, 'isActive');
    const displayOrderStr = headerMap.requireValue(rowValues, 'displayOrder');
    const createdAtStr = headerMap.requireValue(rowValues, 'createdAt');
    const updatedAtStr = headerMap.requireValue(rowValues, 'updatedAt');

    return {
      id,
      tenantId,
      storeId,
      channelType,
      contactValue,
      isActive: parseBoolean(isActiveStr),
      displayOrder: parseInt(displayOrderStr, 10) || 1,
      createdAt: new Date(createdAtStr),
      updatedAt: new Date(updatedAtStr)
    };
  }

  toRow(entity: StoreContact, headerMap: HeaderMap): string[] {
    return headerMap.buildRow({
      id: entity.id,
      tenantId: entity.tenantId,
      storeId: entity.storeId,
      channelType: entity.channelType,
      contactValue: entity.contactValue,
      isActive: formatBoolean(entity.isActive),
      displayOrder: entity.displayOrder.toString(),
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString()
    });
  }

  getId(entity: StoreContact): string {
    return entity.id;
  }
}

export class BusinessHourMapper implements ISheetMapper<BusinessHour> {
  sheetName = CanonicalSchemas.business_hours.sheetName;
  requiredHeaders = CanonicalSchemas.business_hours.requiredHeaders;
  defaultHeaders = [...CanonicalSchemas.business_hours.requiredHeaders, ...CanonicalSchemas.business_hours.optionalHeaders];

  fromRow(rowValues: string[], headerMap: HeaderMap): BusinessHour {
    const id = headerMap.requireValue(rowValues, 'id');
    const tenantId = headerMap.requireValue(rowValues, 'tenantId');
    const storeId = headerMap.requireValue(rowValues, 'storeId');
    const dayOfWeek = headerMap.requireValue(rowValues, 'dayOfWeek');
    const isClosedStr = headerMap.requireValue(rowValues, 'isClosed');
    const is24HoursStr = headerMap.getValue(rowValues, 'is24Hours') || 'false';
    const shiftsStr = headerMap.getValue(rowValues, 'shifts') || '';
    const openingTime = headerMap.getValue(rowValues, 'openingTime') || '';
    const closingTime = headerMap.getValue(rowValues, 'closingTime') || '';
    const timezone = headerMap.getValue(rowValues, 'timezone') || 'Asia/Aden';
    const isActiveStr = headerMap.getValue(rowValues, 'isActive') || 'true';
    const displayOrderStr = headerMap.getValue(rowValues, 'displayOrder') || '1';
    const notes = headerMap.getValue(rowValues, 'notes') || '';
    const createdAtStr = headerMap.requireValue(rowValues, 'createdAt');
    const updatedAtStr = headerMap.requireValue(rowValues, 'updatedAt');

    return {
      id,
      tenantId,
      storeId,
      dayOfWeek,
      isClosed: parseBoolean(isClosedStr),
      is24Hours: parseBoolean(is24HoursStr),
      shifts: shiftsStr,
      openingTime,
      closingTime,
      timezone,
      isActive: parseBoolean(isActiveStr),
      displayOrder: parseInt(displayOrderStr, 10) || 1,
      notes,
      createdAt: new Date(createdAtStr),
      updatedAt: new Date(updatedAtStr)
    };
  }

  toRow(entity: BusinessHour, headerMap: HeaderMap): string[] {
    return headerMap.buildRow({
      id: entity.id,
      tenantId: entity.tenantId,
      storeId: entity.storeId,
      dayOfWeek: entity.dayOfWeek,
      isClosed: formatBoolean(entity.isClosed),
      is24Hours: formatBoolean(!!entity.is24Hours),
      shifts: typeof entity.shifts === 'string' ? entity.shifts : JSON.stringify(entity.shifts || []),
      openingTime: entity.openingTime || '',
      closingTime: entity.closingTime || '',
      timezone: entity.timezone || 'Asia/Aden',
      isActive: formatBoolean(entity.isActive !== false),
      displayOrder: (entity.displayOrder || 1).toString(),
      notes: entity.notes || '',
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString()
    });
  }

  getId(entity: BusinessHour): string {
    return entity.id;
  }
}

export class DeliveryConfigurationMapper implements ISheetMapper<DeliveryConfiguration> {
  sheetName = CanonicalSchemas.delivery_configuration.sheetName;
  requiredHeaders = CanonicalSchemas.delivery_configuration.requiredHeaders;
  defaultHeaders = [...CanonicalSchemas.delivery_configuration.requiredHeaders, ...CanonicalSchemas.delivery_configuration.optionalHeaders];

  fromRow(rowValues: string[], headerMap: HeaderMap): DeliveryConfiguration {
    const id = headerMap.requireValue(rowValues, 'id');
    const tenantId = headerMap.requireValue(rowValues, 'tenantId');
    const storeId = headerMap.requireValue(rowValues, 'storeId');
    const isEnabledStr = headerMap.requireValue(rowValues, 'isEnabled');
    const deliveryAreas = headerMap.getValue(rowValues, 'deliveryAreas') || '';
    const deliveryFeeStr = headerMap.getValue(rowValues, 'deliveryFee') || '0';
    const currency = headerMap.getValue(rowValues, 'currency') || 'YER';
    const minAmountStr = headerMap.getValue(rowValues, 'minimumOrderAmount') || headerMap.getValue(rowValues, 'minimumOrder') || '0';
    const estMinutes = headerMap.getValue(rowValues, 'estimatedDeliveryMinutes') || headerMap.getValue(rowValues, 'estimatedDelivery') || '';
    const codStr = headerMap.getValue(rowValues, 'cashOnDeliveryEnabled') || 'true';
    const notes = headerMap.getValue(rowValues, 'notes') || '';
    const createdAtStr = headerMap.requireValue(rowValues, 'createdAt');
    const updatedAtStr = headerMap.requireValue(rowValues, 'updatedAt');

    return {
      id,
      tenantId,
      storeId,
      isEnabled: parseBoolean(isEnabledStr),
      deliveryAreas,
      deliveryFee: parseFloat(deliveryFeeStr) || 0,
      currency,
      minimumOrderAmount: parseFloat(minAmountStr) || 0,
      estimatedDeliveryMinutes: estMinutes,
      cashOnDeliveryEnabled: parseBoolean(codStr),
      notes,
      createdAt: new Date(createdAtStr),
      updatedAt: new Date(updatedAtStr)
    };
  }

  toRow(entity: DeliveryConfiguration, headerMap: HeaderMap): string[] {
    return headerMap.buildRow({
      id: entity.id,
      tenantId: entity.tenantId,
      storeId: entity.storeId,
      isEnabled: formatBoolean(entity.isEnabled),
      deliveryAreas: entity.deliveryAreas || '',
      deliveryFee: (entity.deliveryFee || 0).toString(),
      currency: entity.currency || 'YER',
      minimumOrderAmount: (entity.minimumOrderAmount || 0).toString(),
      estimatedDeliveryMinutes: (entity.estimatedDeliveryMinutes || '').toString(),
      cashOnDeliveryEnabled: formatBoolean(entity.cashOnDeliveryEnabled !== false),
      notes: entity.notes || '',
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString()
    });
  }

  getId(entity: DeliveryConfiguration): string {
    return entity.id;
  }
}

export class DeliveryZoneMapper implements ISheetMapper<DeliveryZone> {
  sheetName = CanonicalSchemas.delivery_zones.sheetName;
  requiredHeaders = CanonicalSchemas.delivery_zones.requiredHeaders;
  defaultHeaders = [...CanonicalSchemas.delivery_zones.requiredHeaders, ...CanonicalSchemas.delivery_zones.optionalHeaders];

  fromRow(rowValues: string[], headerMap: HeaderMap): DeliveryZone {
    const id = headerMap.requireValue(rowValues, 'id');
    const tenantId = headerMap.requireValue(rowValues, 'tenantId');
    const storeId = headerMap.requireValue(rowValues, 'storeId');
    const name = headerMap.requireValue(rowValues, 'name');
    const isActiveStr = headerMap.requireValue(rowValues, 'isActive');
    const displayOrderStr = headerMap.requireValue(rowValues, 'displayOrder');
    const deliveryFeeStr = headerMap.getValue(rowValues, 'deliveryFee') || '0';
    const currency = headerMap.getValue(rowValues, 'currency') || 'YER';
    const estMinutes = headerMap.getValue(rowValues, 'estimatedDeliveryMinutes') || '';
    const createdAtStr = headerMap.requireValue(rowValues, 'createdAt');
    const updatedAtStr = headerMap.requireValue(rowValues, 'updatedAt');

    return {
      id,
      tenantId,
      storeId,
      name,
      isActive: parseBoolean(isActiveStr),
      displayOrder: parseInt(displayOrderStr, 10) || 1,
      deliveryFee: parseFloat(deliveryFeeStr) || 0,
      currency,
      estimatedDeliveryMinutes: estMinutes,
      createdAt: new Date(createdAtStr),
      updatedAt: new Date(updatedAtStr)
    };
  }

  toRow(entity: DeliveryZone, headerMap: HeaderMap): string[] {
    return headerMap.buildRow({
      id: entity.id,
      tenantId: entity.tenantId,
      storeId: entity.storeId,
      name: entity.name,
      isActive: formatBoolean(entity.isActive),
      displayOrder: entity.displayOrder.toString(),
      deliveryFee: (entity.deliveryFee || 0).toString(),
      currency: entity.currency || 'YER',
      estimatedDeliveryMinutes: (entity.estimatedDeliveryMinutes || '').toString(),
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString()
    });
  }

  getId(entity: DeliveryZone): string {
    return entity.id;
  }
}

export class StoreLocationMapper implements ISheetMapper<StoreLocation> {
  sheetName = CanonicalSchemas.store_locations.sheetName;
  requiredHeaders = CanonicalSchemas.store_locations.requiredHeaders;
  defaultHeaders = [...CanonicalSchemas.store_locations.requiredHeaders, ...CanonicalSchemas.store_locations.optionalHeaders];

  fromRow(rowValues: string[], headerMap: HeaderMap): StoreLocation {
    const id = headerMap.requireValue(rowValues, 'id');
    const tenantId = headerMap.requireValue(rowValues, 'tenantId');
    const storeId = headerMap.requireValue(rowValues, 'storeId');
    const address = headerMap.requireValue(rowValues, 'address');
    const isActiveStr = headerMap.requireValue(rowValues, 'isActive');
    const name = headerMap.getValue(rowValues, 'name') || '';
    const googleMapsUrl = headerMap.getValue(rowValues, 'googleMapsUrl') || headerMap.getValue(rowValues, 'mapUrl') || '';
    const lat = headerMap.getValue(rowValues, 'latitude') || '';
    const lng = headerMap.getValue(rowValues, 'longitude') || '';
    const displayOrderStr = headerMap.getValue(rowValues, 'displayOrder') || '1';
    const createdAtStr = headerMap.requireValue(rowValues, 'createdAt');
    const updatedAtStr = headerMap.requireValue(rowValues, 'updatedAt');

    return {
      id,
      tenantId,
      storeId,
      name,
      address,
      googleMapsUrl,
      latitude: lat ? parseFloat(lat) : undefined,
      longitude: lng ? parseFloat(lng) : undefined,
      isActive: parseBoolean(isActiveStr),
      displayOrder: parseInt(displayOrderStr, 10) || 1,
      createdAt: new Date(createdAtStr),
      updatedAt: new Date(updatedAtStr)
    };
  }

  toRow(entity: StoreLocation, headerMap: HeaderMap): string[] {
    return headerMap.buildRow({
      id: entity.id,
      tenantId: entity.tenantId,
      storeId: entity.storeId,
      name: entity.name || '',
      address: entity.address,
      googleMapsUrl: entity.googleMapsUrl || '',
      latitude: entity.latitude !== undefined ? entity.latitude.toString() : '',
      longitude: entity.longitude !== undefined ? entity.longitude.toString() : '',
      isActive: formatBoolean(entity.isActive),
      displayOrder: (entity.displayOrder || 1).toString(),
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString()
    });
  }

  getId(entity: StoreLocation): string {
    return entity.id;
  }
}

export class StorePolicyMapper implements ISheetMapper<StorePolicy> {
  sheetName = CanonicalSchemas.store_policies.sheetName;
  requiredHeaders = CanonicalSchemas.store_policies.requiredHeaders;
  defaultHeaders = [...CanonicalSchemas.store_policies.requiredHeaders, ...CanonicalSchemas.store_policies.optionalHeaders];

  fromRow(rowValues: string[], headerMap: HeaderMap): StorePolicy {
    const id = headerMap.requireValue(rowValues, 'id');
    const tenantId = headerMap.requireValue(rowValues, 'tenantId');
    const storeId = headerMap.requireValue(rowValues, 'storeId');
    const policyType = headerMap.requireValue(rowValues, 'policyType');
    const title = headerMap.requireValue(rowValues, 'title');
    const content = headerMap.requireValue(rowValues, 'content');
    const isActiveStr = headerMap.requireValue(rowValues, 'isActive');
    const displayOrderStr = headerMap.requireValue(rowValues, 'displayOrder');
    const createdAtStr = headerMap.requireValue(rowValues, 'createdAt');
    const updatedAtStr = headerMap.requireValue(rowValues, 'updatedAt');

    return {
      id,
      tenantId,
      storeId,
      policyType,
      title,
      content,
      isActive: parseBoolean(isActiveStr),
      displayOrder: parseInt(displayOrderStr, 10) || 1,
      createdAt: new Date(createdAtStr),
      updatedAt: new Date(updatedAtStr)
    };
  }

  toRow(entity: StorePolicy, headerMap: HeaderMap): string[] {
    return headerMap.buildRow({
      id: entity.id,
      tenantId: entity.tenantId,
      storeId: entity.storeId,
      policyType: entity.policyType,
      title: entity.title,
      content: entity.content,
      isActive: formatBoolean(entity.isActive),
      displayOrder: entity.displayOrder.toString(),
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString()
    });
  }

  getId(entity: StorePolicy): string {
    return entity.id;
  }
}

export class DigitalServiceMapper implements ISheetMapper<DigitalService> {
  sheetName = CanonicalSchemas.digital_services.sheetName;
  requiredHeaders = CanonicalSchemas.digital_services.requiredHeaders;
  defaultHeaders = [...CanonicalSchemas.digital_services.requiredHeaders, ...CanonicalSchemas.digital_services.optionalHeaders];

  fromRow(rowValues: string[], headerMap: HeaderMap): DigitalService {
    const id = headerMap.requireValue(rowValues, 'id');
    const tenantId = headerMap.requireValue(rowValues, 'tenantId');
    const storeId = headerMap.requireValue(rowValues, 'storeId');
    const name = headerMap.requireValue(rowValues, 'name');
    const serviceType = headerMap.requireValue(rowValues, 'serviceType');
    const isActiveStr = headerMap.requireValue(rowValues, 'isActive');
    const displayOrderStr = headerMap.requireValue(rowValues, 'displayOrder');
    const description = headerMap.getValue(rowValues, 'description') || '';
    const metadata = headerMap.getValue(rowValues, 'metadata') || '';
    const createdAtStr = headerMap.requireValue(rowValues, 'createdAt');
    const updatedAtStr = headerMap.requireValue(rowValues, 'updatedAt');

    return {
      id,
      tenantId,
      storeId,
      name,
      serviceType,
      description,
      metadata,
      isActive: parseBoolean(isActiveStr),
      displayOrder: parseInt(displayOrderStr, 10) || 1,
      createdAt: new Date(createdAtStr),
      updatedAt: new Date(updatedAtStr)
    };
  }

  toRow(entity: DigitalService, headerMap: HeaderMap): string[] {
    return headerMap.buildRow({
      id: entity.id,
      tenantId: entity.tenantId,
      storeId: entity.storeId,
      name: entity.name,
      serviceType: entity.serviceType,
      description: entity.description || '',
      metadata: typeof entity.metadata === 'string' ? entity.metadata : JSON.stringify(entity.metadata || {}),
      isActive: formatBoolean(entity.isActive),
      displayOrder: entity.displayOrder.toString(),
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString()
    });
  }

  getId(entity: DigitalService): string {
    return entity.id;
  }
}

export class LeadMapper implements ISheetMapper<Lead> {
  sheetName = CanonicalSchemas.leads.sheetName;
  requiredHeaders = CanonicalSchemas.leads.requiredHeaders;
  defaultHeaders = [...CanonicalSchemas.leads.requiredHeaders, ...CanonicalSchemas.leads.optionalHeaders];

  fromRow(rowValues: string[], headerMap: HeaderMap): Lead {
    const id = headerMap.requireValue(rowValues, 'id');
    const tenantId = headerMap.requireValue(rowValues, 'tenantId');
    const storeId = headerMap.requireValue(rowValues, 'storeId');
    const name = headerMap.requireValue(rowValues, 'name');
    const phone = headerMap.requireValue(rowValues, 'phone');
    const status = headerMap.requireValue(rowValues, 'status');
    const email = headerMap.getValue(rowValues, 'email') || '';
    const businessType = headerMap.getValue(rowValues, 'businessType') || '';
    const requestedService = headerMap.getValue(rowValues, 'requestedService') || '';
    const branchCountStr = headerMap.getValue(rowValues, 'branchCount') || '0';
    const currentSystem = headerMap.getValue(rowValues, 'currentSystem') || '';
    const customerNeed = headerMap.getValue(rowValues, 'customerNeed') || '';
    const source = headerMap.getValue(rowValues, 'source') || 'HANEEN_AGENT';
    const notes = headerMap.getValue(rowValues, 'notes') || '';
    const createdAtStr = headerMap.requireValue(rowValues, 'createdAt');
    const updatedAtStr = headerMap.requireValue(rowValues, 'updatedAt');

    return {
      id,
      tenantId,
      storeId,
      name,
      phone,
      email,
      businessType,
      requestedService,
      branchCount: parseInt(branchCountStr, 10) || 0,
      currentSystem,
      customerNeed,
      status,
      source,
      notes,
      createdAt: new Date(createdAtStr),
      updatedAt: new Date(updatedAtStr)
    };
  }

  toRow(entity: Lead, headerMap: HeaderMap): string[] {
    return headerMap.buildRow({
      id: entity.id,
      tenantId: entity.tenantId,
      storeId: entity.storeId,
      name: entity.name,
      phone: entity.phone,
      status: entity.status,
      email: entity.email || '',
      businessType: entity.businessType || '',
      requestedService: entity.requestedService || '',
      branchCount: (entity.branchCount || 0).toString(),
      currentSystem: entity.currentSystem || '',
      customerNeed: entity.customerNeed || '',
      source: entity.source || 'HANEEN_AGENT',
      notes: entity.notes || '',
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString()
    });
  }

  getId(entity: Lead): string {
    return entity.id;
  }
}

export class StoreNoticeMapper implements ISheetMapper<StoreNotice> {
  sheetName = CanonicalSchemas.store_notices.sheetName;
  requiredHeaders = CanonicalSchemas.store_notices.requiredHeaders;
  defaultHeaders = [...CanonicalSchemas.store_notices.requiredHeaders, ...CanonicalSchemas.store_notices.optionalHeaders];

  fromRow(rowValues: string[], headerMap: HeaderMap): StoreNotice {
    const id = headerMap.requireValue(rowValues, 'id');
    const tenantId = headerMap.requireValue(rowValues, 'tenantId');
    const storeId = headerMap.requireValue(rowValues, 'storeId');
    const title = headerMap.requireValue(rowValues, 'title');
    const content = headerMap.requireValue(rowValues, 'content');
    const isActiveStr = headerMap.requireValue(rowValues, 'isActive');
    const displayOrderStr = headerMap.requireValue(rowValues, 'displayOrder');
    const imageUrl = headerMap.getValue(rowValues, 'imageUrl') || '';
    const validFromStr = headerMap.getValue(rowValues, 'validFrom') || '';
    const validUntilStr = headerMap.getValue(rowValues, 'validUntil') || '';
    const createdAtStr = headerMap.requireValue(rowValues, 'createdAt');
    const updatedAtStr = headerMap.requireValue(rowValues, 'updatedAt');

    return {
      id,
      tenantId,
      storeId,
      title,
      content,
      imageUrl,
      isActive: parseBoolean(isActiveStr),
      displayOrder: parseInt(displayOrderStr, 10) || 1,
      validFrom: validFromStr ? new Date(validFromStr) : undefined,
      validUntil: validUntilStr ? new Date(validUntilStr) : undefined,
      createdAt: new Date(createdAtStr),
      updatedAt: new Date(updatedAtStr)
    };
  }

  toRow(entity: StoreNotice, headerMap: HeaderMap): string[] {
    return headerMap.buildRow({
      id: entity.id,
      tenantId: entity.tenantId,
      storeId: entity.storeId,
      title: entity.title,
      content: entity.content,
      imageUrl: entity.imageUrl || '',
      isActive: formatBoolean(entity.isActive),
      displayOrder: entity.displayOrder.toString(),
      validFrom: entity.validFrom ? entity.validFrom.toISOString() : '',
      validUntil: entity.validUntil ? entity.validUntil.toISOString() : '',
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString()
    });
  }

  getId(entity: StoreNotice): string {
    return entity.id;
  }
}

export class FeatureToggleMapper implements ISheetMapper<FeatureToggle> {
  sheetName = CanonicalSchemas.feature_toggles.sheetName;
  requiredHeaders = CanonicalSchemas.feature_toggles.requiredHeaders;
  defaultHeaders = [...CanonicalSchemas.feature_toggles.requiredHeaders, ...CanonicalSchemas.feature_toggles.optionalHeaders];

  fromRow(rowValues: string[], headerMap: HeaderMap): FeatureToggle {
    const id = headerMap.requireValue(rowValues, 'id');
    const tenantId = headerMap.requireValue(rowValues, 'tenantId');
    const storeId = headerMap.requireValue(rowValues, 'storeId');
    const key = headerMap.requireValue(rowValues, 'key');
    const isEnabledStr = headerMap.requireValue(rowValues, 'isEnabled');
    const metadata = headerMap.getValue(rowValues, 'metadata') || '';
    const createdAtStr = headerMap.requireValue(rowValues, 'createdAt');
    const updatedAtStr = headerMap.requireValue(rowValues, 'updatedAt');

    return {
      id,
      tenantId,
      storeId,
      key,
      isEnabled: parseBoolean(isEnabledStr),
      metadata,
      createdAt: new Date(createdAtStr),
      updatedAt: new Date(updatedAtStr)
    };
  }

  toRow(entity: FeatureToggle, headerMap: HeaderMap): string[] {
    return headerMap.buildRow({
      id: entity.id,
      tenantId: entity.tenantId,
      storeId: entity.storeId,
      key: entity.key,
      isEnabled: formatBoolean(entity.isEnabled),
      metadata: typeof entity.metadata === 'string' ? entity.metadata : JSON.stringify(entity.metadata || {}),
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString()
    });
  }

  getId(entity: FeatureToggle): string {
    return entity.id;
  }
}
