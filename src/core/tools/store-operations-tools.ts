import { 
  IDataProvider, 
  DataOperationContext,
  SearchQuery
} from '../data/provider';
import { 
  PaymentMethod, 
  BusinessHour, 
  DeliveryConfiguration,
  StoreContact,
  StoreLocation,
  StoreNotice
} from '../data/domain';

export class StoreOperationsTools {
  constructor(
    private paymentMethods: IDataProvider<PaymentMethod>,
    private businessHours: IDataProvider<BusinessHour>,
    private deliveryConfig: IDataProvider<DeliveryConfiguration>,
    private storeContacts: IDataProvider<StoreContact>,
    private storeLocations: IDataProvider<StoreLocation>,
    private storeNotices: IDataProvider<StoreNotice>
  ) {}

  async getPaymentMethods(context: DataOperationContext): Promise<PaymentMethod[]> {
    const result = await this.paymentMethods.search({}, context);
    return result.items.filter(m => m.isActive).sort((a, b) => a.displayOrder - b.displayOrder);
  }

  async getBusinessHours(context: DataOperationContext): Promise<BusinessHour[]> {
    const result = await this.businessHours.search({}, context);
    return result.items;
  }

  async getDeliveryConfiguration(context: DataOperationContext): Promise<DeliveryConfiguration | null> {
    const result = await this.deliveryConfig.search({}, context);
    const active = result.items.filter(c => c.isEnabled);
    return active.length > 0 ? active[0] : null;
  }

  async getStoreContacts(context: DataOperationContext): Promise<StoreContact[]> {
    const result = await this.storeContacts.search({}, context);
    return result.items.filter(c => c.isActive).sort((a, b) => a.displayOrder - b.displayOrder);
  }

  async getStoreLocations(context: DataOperationContext): Promise<StoreLocation[]> {
    const result = await this.storeLocations.search({}, context);
    return result.items.filter(l => l.isActive);
  }

  async getActiveNotices(context: DataOperationContext): Promise<StoreNotice[]> {
    const result = await this.storeNotices.search({}, context);
    const now = new Date();
    return result.items
      .filter(n => n.isActive)
      .filter(n => !n.validFrom || new Date(n.validFrom) <= now)
      .filter(n => !n.validUntil || new Date(n.validUntil) >= now)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  }
}
