import { describe, it, expect, beforeEach } from 'vitest';
import { GoogleSheetsOrderStore } from './orders/google-sheets-order-store';
import { OrderStore } from './orders/order-store';
import { OrderCheckoutEngine } from './orders/order-checkout-engine';
import { AdminNotifier, IOrderNotificationService } from './orders/admin-notifier';
import { MockGoogleSheetsTransport } from '../infrastructure/google-sheets/mock-transport';
import { DataOperationContext } from './data/provider';
import { CANONICAL_TENANT_ID, CANONICAL_STORE_ID } from './productization/haneen-service';
import { ConversationSession } from './productization/session-store';
import fs from 'fs';
import path from 'path';

describe('CMD-089 — REAL ADMIN NOTIFICATION CHANNEL DISCOVERY & ZERO-COST LIVE VERIFICATION', () => {
  let mockTransport: MockGoogleSheetsTransport;
  let googleSheetsOrderStore: GoogleSheetsOrderStore;
  let orderStore: OrderStore;
  let adminNotifier: AdminNotifier;
  const testNotifPath = path.join(process.cwd(), 'data', 'test_cmd_089_admin_notifs.json');

  const context: DataOperationContext = {
    tenantId: CANONICAL_TENANT_ID,
    storeId: CANONICAL_STORE_ID
  };

  function createTestSession(id: string): ConversationSession {
    return {
      conversationId: id,
      tenantId: CANONICAL_TENANT_ID,
      storeId: CANONICAL_STORE_ID,
      agentId: 'sana-agent',
      status: 'ACTIVE',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      checkoutState: {
        cart: [
          {
            productId: 'prod-089-1',
            productName: 'عسل سدر دوعني ممتازة',
            quantity: 1,
            unitPriceSnapshot: 15000,
            subtotal: 15000
          }
        ],
        step: 'AWAITING_CONFIRMATION',
        deliveryAddress: 'صنعاء - شارع الزبيري',
        paymentMethodId: 'pay-cod',
        paymentMethodName: 'كاش عند الاستلام',
        deliveryFee: 500
      }
    };
  }

  beforeEach(() => {
    if (fs.existsSync(testNotifPath)) {
      try { fs.unlinkSync(testNotifPath); } catch (e) {}
    }

    mockTransport = new MockGoogleSheetsTransport();
    googleSheetsOrderStore = new GoogleSheetsOrderStore(mockTransport);

    OrderStore.resetInstance();
    orderStore = OrderStore.getInstance(googleSheetsOrderStore);

    AdminNotifier.resetInstance(true);
    adminNotifier = AdminNotifier.getInstance(testNotifPath);
  });

  it('1. channel discovery - inspects available notification channels and credentials in environment', () => {
    // Audit available channels in process.env
    const envKeys = Object.keys(process.env);
    const whatsappToken = process.env.WHATSAPP_TOKEN || process.env.META_ACCESS_TOKEN;
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    const smtpHost = process.env.SMTP_HOST || process.env.SENDGRID_API_KEY;
    const webhookUrl = process.env.ADMIN_WEBHOOK_URL;

    const channelsAudit = {
      whatsapp: { exists: !!whatsappToken, cost: 'Paid / Requires Meta Credentials' },
      telegram: { exists: !!telegramToken, cost: 'Free API / Requires Bot Token' },
      smtp: { exists: !!smtpHost, cost: 'Requires SMTP Service' },
      webhook: { exists: !!webhookUrl, cost: 'Requires Webhook Endpoint' },
      googleSheetsAdminUI: { exists: true, cost: '$0 Zero-Cost (Production Source of Truth for Orders)' }
    };

    expect(channelsAudit.whatsapp.exists).toBe(false);
    expect(channelsAudit.telegram.exists).toBe(false);
    expect(channelsAudit.smtp.exists).toBe(false);
    expect(channelsAudit.googleSheetsAdminUI.exists).toBe(true);
  });

  it('2. zero-cost check - verifies that without external API credentials, system defaults to NOTIFICATION_PENDING', async () => {
    const order = await orderStore.createOrder({
      customerId: 'cst-089-2',
      customerPhone: '777089002',
      items: [{ productId: 'p1', productNameSnapshot: 'تمر خلاص ممتازة', quantity: 2, unitPriceSnapshot: 2500 }],
      subtotal: 5000,
      deliveryFee: 500,
      totalAmount: 5500,
      currency: 'YER',
      paymentMethodId: 'pay-cod',
      paymentMethodName: 'كاش عند الاستلام',
      paymentStatus: 'UNPAID',
      deliveryAddress: 'صنعاء - شارع حدة'
    }, context);

    const notifRes = await adminNotifier.notifyNewOrder(order, context);

    expect(notifRes.success).toBe(true);
    expect(notifRes.status).toBe('PENDING');
    expect(notifRes.notificationId).toBeDefined();
  });

  it('3. notification abstraction - verifies IOrderNotificationService returns proper contract format', async () => {
    class ContractNotificationService implements IOrderNotificationService {
      async notifyNewOrder(order: any, ctx: any) {
        return {
          success: true,
          notificationId: `notif-contract-${order.id}`,
          status: 'PENDING' as const
        };
      }
      getNotifications(ctx: any) { return []; }
      clear() {}
    }

    const service: IOrderNotificationService = new ContractNotificationService();
    const mockOrder: any = { id: 'ORD-089-CONTRACT', items: [], subtotal: 1000, totalAmount: 1500, currency: 'YER' };

    const res = await service.notifyNewOrder(mockOrder, context);

    expect(res).toHaveProperty('success');
    expect(res).toHaveProperty('notificationId');
    expect(res).toHaveProperty('status');
    expect(['PENDING', 'SENT', 'FAILED']).toContain(res.status);
    expect(res.notificationId).toBe('notif-contract-ORD-089-CONTRACT');
  });

  it('4. PENDING status handling - verifies status remains PENDING when no active channel adapter resolves delivery', async () => {
    const order = await orderStore.createOrder({
      customerId: 'cst-089-4',
      customerPhone: '777089004',
      items: [{ productId: 'p1', productNameSnapshot: 'زيت زيتون يمني', quantity: 1, unitPriceSnapshot: 4000 }],
      subtotal: 4000,
      deliveryFee: 500,
      totalAmount: 4500,
      currency: 'YER',
      paymentMethodId: 'pay-cod',
      paymentMethodName: 'كاش عند الاستلام',
      paymentStatus: 'UNPAID',
      deliveryAddress: 'صنعاء - الصافية'
    }, context);

    const res = await adminNotifier.notifyNewOrder(order, context);
    expect(res.status).toBe('PENDING');

    const notifs = adminNotifier.getNotifications(context);
    expect(notifs[0].status).toBe('PENDING');
  });

  it('5. SENT status handling - verifies status becomes SENT when channel adapter succeeds', async () => {
    const mockAdapter = {
      async sendNotification(content: string, destination?: string) {
        return true;
      }
    };
    adminNotifier.setChannelAdapter(mockAdapter);

    const order = await orderStore.createOrder({
      customerId: 'cst-089-5',
      customerPhone: '777089005',
      items: [{ productId: 'p1', productNameSnapshot: 'بن يمني مطحون', quantity: 1, unitPriceSnapshot: 3500 }],
      subtotal: 3500,
      deliveryFee: 500,
      totalAmount: 4000,
      currency: 'YER',
      paymentMethodId: 'pay-cod',
      paymentMethodName: 'كاش عند الاستلام',
      paymentStatus: 'UNPAID',
      deliveryAddress: 'صنعاء - الروضة'
    }, context);

    const res = await adminNotifier.notifyNewOrder(order, context);
    expect(res.status).toBe('SENT');
  });

  it('6. FAILED status handling - verifies status becomes FAILED when channel adapter fails', async () => {
    const failingAdapter = {
      async sendNotification(content: string, destination?: string) {
        return false;
      }
    };
    adminNotifier.setChannelAdapter(failingAdapter);

    const order = await orderStore.createOrder({
      customerId: 'cst-089-6',
      customerPhone: '777089006',
      items: [{ productId: 'p1', productNameSnapshot: 'شاي ممتاز', quantity: 2, unitPriceSnapshot: 600 }],
      subtotal: 1200,
      deliveryFee: 500,
      totalAmount: 1700,
      currency: 'YER',
      paymentMethodId: 'pay-cod',
      paymentMethodName: 'كاش عند الاستلام',
      paymentStatus: 'UNPAID',
      deliveryAddress: 'صنعاء - حافد'
    }, context);

    const res = await adminNotifier.notifyNewOrder(order, context);
    expect(res.status).toBe('FAILED');
    expect(res.success).toBe(false);
  });

  it('7. customer response accuracy - verifies exact messages according to CMD-089 Section 7 rules', async () => {
    // 7.1 When Notification = PENDING
    class PendingService implements IOrderNotificationService {
      async notifyNewOrder(order: any, ctx: any) {
        return { success: true, notificationId: 'n-pending', status: 'PENDING' as const };
      }
      getNotifications(ctx: any) { return []; }
      clear() {}
    }

    const pendingEngine = new OrderCheckoutEngine(undefined, undefined, undefined, orderStore, new PendingService());
    const sessionPending = createTestSession('conv-res-pending');
    const replyPending = await pendingEngine.handleCheckoutMessage('نعم أؤكد الطلب', sessionPending, context);

    expect(replyPending).toContain('تم تسجيل طلبك، وجارٍ إرسال الإشعار للإدارة');

    // 7.2 When Notification = SENT
    class SentService implements IOrderNotificationService {
      async notifyNewOrder(order: any, ctx: any) {
        return { success: true, notificationId: 'n-sent', status: 'SENT' as const };
      }
      getNotifications(ctx: any) { return []; }
      clear() {}
    }

    const sentEngine = new OrderCheckoutEngine(undefined, undefined, undefined, orderStore, new SentService());
    const sessionSent = createTestSession('conv-res-sent');
    const replySent = await sentEngine.handleCheckoutMessage('نعم أؤكد الطلب', sessionSent, context);

    expect(replySent).toContain('تم استلام طلبك وتم إشعار الإدارة بنجاح');

    // 7.3 When Notification = FAILED
    class FailedService implements IOrderNotificationService {
      async notifyNewOrder(order: any, ctx: any) {
        return { success: false, notificationId: 'n-failed', status: 'FAILED' as const };
      }
      getNotifications(ctx: any) { return []; }
      clear() {}
    }

    const failedEngine = new OrderCheckoutEngine(undefined, undefined, undefined, orderStore, new FailedService());
    const sessionFailed = createTestSession('conv-res-failed');
    const replyFailed = await failedEngine.handleCheckoutMessage('نعم أؤكد الطلب', sessionFailed, context);

    expect(replyFailed).toContain('تم تسجيل طلبك، لكن تعذر إرسال إشعار تلقائي للإدارة حالياً');
  });

  it('8. order notification separation - verifies order persists in Google Sheets even if notification is PENDING or FAILED', async () => {
    class FailingNotificationService implements IOrderNotificationService {
      async notifyNewOrder() {
        return { success: false, notificationId: 'notif-fail-8', status: 'FAILED' as const };
      }
      getNotifications() { return []; }
      clear() {}
    }

    const engine = new OrderCheckoutEngine(undefined, undefined, undefined, orderStore, new FailingNotificationService());
    const session = createTestSession('conv-sep-89');

    await engine.handleCheckoutMessage('نعم أؤكد الطلب', session, context);

    const orderId = session.checkoutState.createdOrderId;
    expect(orderId).toBeDefined();

    // Verify stored in GoogleSheetsOrderStore
    const savedOrder = await orderStore.getOrderById(orderId!, context);
    expect(savedOrder).toBeDefined();
    expect(savedOrder?.id).toBe(orderId);
    expect(savedOrder?.totalAmount).toBe(15500);
  });

  it('9. no false success - verifies system never claims SENT when notification is PENDING', async () => {
    const engine = new OrderCheckoutEngine(undefined, undefined, undefined, orderStore, adminNotifier);
    const session = createTestSession('conv-no-false-success');

    const reply = await engine.handleCheckoutMessage('نعم أؤكد الطلب', session, context);

    expect(reply).not.toContain('تم إشعار الإدارة بنجاح');
    expect(reply).not.toContain('تم استلام طلبك وتم إشعار الإدارة بنجاح');
    expect(reply).toContain('تم تسجيل طلبك، وجارٍ إرسال الإشعار للإدارة');
  });

  it('10. order persistence after restart - verifies order survives container restart independently of notification JSON file', async () => {
    // 1. Create order
    const originalOrder = await orderStore.createOrder({
      customerId: 'cst-restart-10',
      customerPhone: '777089010',
      items: [{ productId: 'p1', productNameSnapshot: 'عسل سدر ملوكي', quantity: 1, unitPriceSnapshot: 20000 }],
      subtotal: 20000,
      deliveryFee: 500,
      totalAmount: 20500,
      currency: 'YER',
      paymentMethodId: 'pay-cod',
      paymentMethodName: 'كاش عند الاستلام',
      paymentStatus: 'UNPAID',
      deliveryAddress: 'صنعاء - حدة المظفر'
    }, context);

    expect(originalOrder.id).toBeDefined();

    // 2. Simulate container restart by re-instantiating GoogleSheetsOrderStore with mock transport
    // and resetting OrderStore singleton
    OrderStore.resetInstance();
    const freshSheetsStore = new GoogleSheetsOrderStore(mockTransport);
    const freshOrderStore = OrderStore.getInstance(freshSheetsStore);

    // 3. Verify order still exists in fresh OrderStore instance
    const fetchedOrder = await freshOrderStore.getOrderById(originalOrder.id, context);
    expect(fetchedOrder).toBeDefined();
    expect(fetchedOrder?.id).toBe(originalOrder.id);
    expect(fetchedOrder?.totalAmount).toBe(20500);
    expect(fetchedOrder?.deliveryAddress).toBe('صنعاء - حدة المظفر');
  });
});
