import fs from 'fs';
import path from 'path';
import { Order } from '../data/domain';
import { DataOperationContext } from '../data/provider';

export interface AdminNotificationRecord {
  id: string;
  orderId: string;
  tenantId: string;
  storeId: string;
  title: string;
  content: string;
  destination?: string;
  channel?: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  isRead?: boolean;
  createdAt: Date;
}

export interface IOrderNotificationService {
  notifyNewOrder(order: Order, context: DataOperationContext): Promise<{ success: boolean; notificationId: string; status: 'PENDING' | 'SENT' | 'FAILED' }>;
  getNotifications(context: DataOperationContext): Promise<AdminNotificationRecord[]> | AdminNotificationRecord[];
  clear(): void | Promise<void>;
}

export class AdminNotifier implements IOrderNotificationService {
  private static instance: AdminNotifier | null = null;
  private notifications: AdminNotificationRecord[] = [];
  private filePath: string;
  private destinationSupplier?: () => Promise<string | null>;
  private channelAdapter?: { sendNotification: (content: string, destination?: string) => Promise<boolean> };

  constructor(
    customFilePath?: string,
    options?: {
      destinationSupplier?: () => Promise<string | null>;
      channelAdapter?: { sendNotification: (content: string, destination?: string) => Promise<boolean> };
    }
  ) {
    this.filePath = customFilePath || path.join(process.cwd(), 'data', 'admin_notifications.json');
    if (options?.destinationSupplier) {
      this.destinationSupplier = options.destinationSupplier;
    }
    if (options?.channelAdapter) {
      this.channelAdapter = options.channelAdapter;
    }
    this.loadFromDisk();
  }

  public setDestinationSupplier(supplier: () => Promise<string | null>): void {
    this.destinationSupplier = supplier;
  }

  public setChannelAdapter(adapter: { sendNotification: (content: string, destination?: string) => Promise<boolean> }): void {
    this.channelAdapter = adapter;
  }

  public static getInstance(
    customFilePath?: string,
    options?: {
      destinationSupplier?: () => Promise<string | null>;
      channelAdapter?: { sendNotification: (content: string, destination?: string) => Promise<boolean> };
    }
  ): AdminNotifier {
    if (!AdminNotifier.instance) {
      AdminNotifier.instance = new AdminNotifier(customFilePath, options);
    }
    return AdminNotifier.instance;
  }

  public static resetInstance(deleteFile: boolean = true): void {
    if (AdminNotifier.instance && deleteFile) {
      AdminNotifier.instance.clear();
    }
    AdminNotifier.instance = null;
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed: AdminNotificationRecord[] = JSON.parse(raw);
        this.notifications = parsed.map(n => ({
          ...n,
          createdAt: new Date(n.createdAt)
        }));
      }
    } catch (err) {
      console.warn('[AdminNotifier] Error loading notifications from disk:', err);
    }
  }

  private saveToDisk(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.notifications, null, 2), 'utf-8');
    } catch (err) {
      console.error('[AdminNotifier] Error saving notifications to disk:', err);
    }
  }

  private sanitizeContent(text: string): string {
    // Ensure no API keys, secrets, or internal bearer tokens are ever included in notification text
    return text
      .replace(/AIzaSy[A-Za-z0-9_-]+/g, '[REDACTED_API_KEY]')
      .replace(/bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED_TOKEN]')
      .replace(/key=[A-Za-z0-9_-]+/gi, 'key=[REDACTED_KEY]')
      .replace(/secret=[A-Za-z0-9_-]+/gi, 'secret=[REDACTED_SECRET]');
  }

  public async notifyNewOrder(order: Order, context: DataOperationContext): Promise<{ success: boolean; notificationId: string; status: 'PENDING' | 'SENT' | 'FAILED' }> {
    const notificationId = `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    const itemsSummary = order.items
      .map(i => `- ${i.productNameSnapshot || i.productName} (كمية: ${i.quantity}) - السعر الفردي: ${i.unitPriceSnapshot} ${order.currency} - الإجمالي: ${i.totalPrice} ${order.currency}`)
      .join('\n');

    const customerPhoneText = order.customerPhone ? order.customerPhone : 'غير محدد';

    let rawContent = `إشعار طلب جديد للإدارة:
رقم الطلب: ${order.id}
هاتف العميل: ${customerPhoneText}
تاريخ الطلب: ${order.createdAt ? new Date(order.createdAt).toISOString() : new Date().toISOString()}
المنتجات والكميات:
${itemsSummary}
المجموع الجزئي: ${order.subtotal} ${order.currency}
رسوم التوصيل: ${order.deliveryFee} ${order.currency}
الإجمالي الكلي: ${order.totalAmount} ${order.currency}
طريقة الدفع: ${order.paymentMethodName || order.paymentMethodId || 'غير محدد'}
حالة الدفع: ${order.paymentStatus || 'UNPAID'}
عنوان التوصيل: ${order.deliveryAddress || 'لم يحدد'}
حالة الطلب: ${order.status}`;

    const content = this.sanitizeContent(rawContent);

    let destination: string | undefined = undefined;
    if (this.destinationSupplier) {
      try {
        const dest = await this.destinationSupplier();
        if (dest) destination = dest;
      } catch (e) {
        console.warn('[AdminNotifier] Error fetching destination:', e);
      }
    }

    let notificationStatus: 'PENDING' | 'SENT' | 'FAILED' = 'PENDING';

    if (this.channelAdapter) {
      try {
        const delivered = await this.channelAdapter.sendNotification(content, destination);
        notificationStatus = delivered ? 'SENT' : 'FAILED';
      } catch (e) {
        console.error('[AdminNotifier] Channel adapter dispatch failed:', e);
        notificationStatus = 'FAILED';
      }
    }

    const record: AdminNotificationRecord = {
      id: notificationId,
      orderId: order.id,
      tenantId: context.tenantId,
      storeId: context.storeId,
      title: `طلب جديد - ${order.id}`,
      content,
      destination,
      channel: this.channelAdapter ? 'external' : 'durable_store',
      status: notificationStatus,
      isRead: false,
      createdAt: new Date()
    };

    try {
      this.notifications.push(record);
      this.saveToDisk();
      return { success: notificationStatus !== 'FAILED', notificationId, status: notificationStatus };
    } catch (err) {
      console.error('[AdminNotifier] Failed to persist admin notification', err);
      return { success: false, notificationId, status: 'FAILED' };
    }
  }

  public getNotifications(context: DataOperationContext): AdminNotificationRecord[] {
    return this.notifications.filter(
      n => n.tenantId === context.tenantId && n.storeId === context.storeId
    );
  }

  public getUnreadCount(context: DataOperationContext): number {
    return this.getNotifications(context).filter(n => !n.isRead).length;
  }

  public markAsRead(idOrOrderId: string, context: DataOperationContext): boolean {
    let found = false;
    this.notifications.forEach(n => {
      if ((n.id === idOrOrderId || n.orderId === idOrOrderId) && n.tenantId === context.tenantId && n.storeId === context.storeId) {
        n.isRead = true;
        found = true;
      }
    });
    if (found) {
      this.saveToDisk();
    }
    return found;
  }

  public syncFromOrders(orders: Order[], context: DataOperationContext): number {
    let addedCount = 0;
    const storeOrders = orders.filter(o => o.tenantId === context.tenantId && o.storeId === context.storeId);
    for (const order of storeOrders) {
      const exists = this.notifications.some(
        n => n.orderId === order.id && n.tenantId === context.tenantId && n.storeId === context.storeId
      );
      if (!exists) {
        const customerPhoneText = order.customerPhone ? order.customerPhone : 'غير محدد';
        const itemsSummary = (order.items || [])
          .map(i => `- ${i.productNameSnapshot || i.productName} (كمية: ${i.quantity}) - السعر الفردي: ${i.unitPriceSnapshot} ${order.currency || 'YER'} - الإجمالي: ${i.totalPrice || (i.quantity * i.unitPriceSnapshot)} ${order.currency || 'YER'}`)
          .join('\n');
        
        const rawContent = `إشعار طلب جديد للإدارة:
رقم الطلب: ${order.id}
هاتف العميل: ${customerPhoneText}
تاريخ الطلب: ${order.createdAt ? new Date(order.createdAt).toISOString() : new Date().toISOString()}
المنتجات والكميات:
${itemsSummary}
المجموع الجزئي: ${order.subtotal || 0} ${order.currency || 'YER'}
رسوم التوصيل: ${order.deliveryFee || 0} ${order.currency || 'YER'}
الإجمالي الكلي: ${order.totalAmount || 0} ${order.currency || 'YER'}
طريقة الدفع: ${order.paymentMethodName || order.paymentMethodId || 'غير محدد'}
حالة الدفع: ${order.paymentStatus || 'UNPAID'}
عنوان التوصيل: ${order.deliveryAddress || 'لم يحدد'}
حالة الطلب: ${order.status}`;

        const notificationId = `notif-sync-${order.id}`;
        const record: AdminNotificationRecord = {
          id: notificationId,
          orderId: order.id,
          tenantId: context.tenantId,
          storeId: context.storeId,
          title: `طلب جديد - ${order.id}`,
          content: this.sanitizeContent(rawContent),
          status: 'PENDING',
          isRead: false,
          createdAt: order.createdAt ? new Date(order.createdAt) : new Date()
        };
        this.notifications.push(record);
        addedCount++;
      }
    }
    if (addedCount > 0) {
      this.saveToDisk();
    }
    return addedCount;
  }

  public clear(): void {
    this.notifications = [];
    if (fs.existsSync(this.filePath)) {
      try {
        fs.unlinkSync(this.filePath);
      } catch (err) {
        // Ignore unlink error
      }
    }
  }
}

export class AdminOrderNotificationService extends AdminNotifier {}

