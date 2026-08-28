import dotenv from 'dotenv';
dotenv.config();

import { InMemoryDataProvider } from './src/core/data/mocks.js';
import { Product } from './src/core/data/domain.js';
import { ProductSearchTool } from './src/core/tools/product-search-tool.js';
import { ProductGetTool } from './src/core/tools/product-get-tool.js';

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

import { ChannelGateway } from './src/core/channels/gateway.js';
import { WebAdapter, WebPayload } from './src/infrastructure/channels/web-adapter.js';
import { DefaultContextResolver } from './src/infrastructure/channels/context-resolver.js';
import { InMemoryIdempotencyService } from './src/infrastructure/channels/idempotency.js';
import { AgentOrchestrator } from './src/core/orchestrator.js';
import { InMemoryConversationContext } from './src/infrastructure/data/memory-conversation-context.js';
import { SimpleToolRegistry } from './src/core/mocks.js';
import { GeminiAIProvider } from './src/infrastructure/ai/gemini/gemini-provider.js';
import { RealGeminiTransport } from './src/infrastructure/ai/gemini/gemini-transport.js';
import { AgentPolicy } from './src/core/types.js';
import { HaneenService, CANONICAL_TENANT_ID, CANONICAL_STORE_ID, CANONICAL_AGENT_ID } from './src/core/productization/haneen-service.js';
import { AgentIdentityStore } from './src/core/productization/agent-identity.js';
import { UnauthorizedDataAccessError } from './src/core/data/errors.js';

const haneenService = new HaneenService();

// Setup Mock/Real Dependencies
class ConsoleLogger {
  info(msg: string, meta?: any) { console.log(`[INFO] ${msg}`, meta || ''); }
  warn(msg: string, meta?: any) { console.warn(`[WARN] ${msg}`, meta || ''); }
  error(msg: string, meta?: any) { console.error(`[ERROR] ${msg}`, meta || ''); }
  debug(msg: string, meta?: any) { console.debug(`[DEBUG] ${msg}`, meta || ''); }
}

const logger = new ConsoleLogger();

// You must set GEMINI_API_KEY in the environment
const aiProvider = new GeminiAIProvider({ apiKey: process.env.GEMINI_API_KEY || 'MOCK_KEY', isMockMode: !process.env.GEMINI_API_KEY });

const conversationContext = new InMemoryConversationContext();
const toolRegistry = new SimpleToolRegistry();

const productProvider = new InMemoryDataProvider<Product>('Product');
productProvider.create({
  name: 'Awesome Laptop',
  description: 'A powerful laptop for developers',
  price: 1500,
  currency: 'USD',
  inStock: true
} as any, { tenantId: 'tenant-1', storeId: 'store-1', agentId: 'agent-1' });

productProvider.create({
  name: 'Secret Tenant 2 Product',
  description: 'Top secret product for tenant 2 only',
  price: 9999,
  currency: 'USD',
  inStock: true
} as any, { tenantId: 'tenant-2', storeId: 'store-1', agentId: 'agent-1' });

toolRegistry.registerTool(new ProductSearchTool(productProvider));
toolRegistry.registerTool(new ProductGetTool(productProvider));

const initialIdentity = AgentIdentityStore.getInstance().getIdentity();

const defaultPolicy: AgentPolicy = {
  persona: `اسمك ${initialIdentity.displayName}، تعملين كمساعد خدمة العملاء لصالح "متجر الذيباني" - "بقالة الذيباني". العملة الأساسية للمتجر هي الريال اليمني (YER).`,
  language: 'العربية والإنجليزية',
  tone: 'Professional and friendly',
  rules: [
    `Always identify yourself as ${initialIdentity.displayName} for Customer Service.`,
    'Represent Tenant "متجر الذيباني" and Store "بقالة الذيباني".',
    'Base currency is YER (الريال اليمني). Do not convert currencies or fabricate exchange rates.',
    'Be concise, polite, and helpful. Do not make up information.'
  ],
  handoffRules: ['Handoff to human if user requests to talk to an agent'],
  toolUsageRules: []
};

const orchestrator = new AgentOrchestrator(
  logger,
  aiProvider,
  conversationContext,
  toolRegistry,
  defaultPolicy
);

// Channel Gateway Setup
const contextResolver = new DefaultContextResolver('tenant-1', 'store-1', 'agent-1');
const idempotencyService = new InMemoryIdempotencyService();
const gateway = new ChannelGateway(contextResolver, idempotencyService);

const webAdapter = new WebAdapter();
gateway.registerAdapter(webAdapter);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // GET Agent Identity Configuration
  app.get('/api/agent-identity', (req, res) => {
    const identity = AgentIdentityStore.getInstance().getIdentity();
    res.status(200).json(identity);
  });

  // POST/PUT Update Agent Identity Configuration (Owner Settings)
  app.post('/api/admin/agent-identity', (req, res) => {
    try {
      const { displayName, role, greeting, enabled, tenantId, storeId, agentId } = req.body || {};

      if (tenantId && tenantId !== CANONICAL_TENANT_ID) {
        return res.status(403).json({ error: 'Unauthorized tenantId context override' });
      }
      if (storeId && storeId !== CANONICAL_STORE_ID) {
        return res.status(403).json({ error: 'Unauthorized storeId context override' });
      }

      const updated = AgentIdentityStore.getInstance().updateIdentity({
        ...(displayName ? { displayName } : {}),
        ...(role ? { role } : {}),
        ...(greeting ? { greeting } : {}),
        ...(typeof enabled === 'boolean' ? { enabled } : {})
      });

      res.status(200).json({
        success: true,
        identity: updated,
        googleSheetsWritesExecuted: 0,
        verdict: 'AGENT_IDENTITY_UPDATED'
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to update agent identity' });
    }
  });

  // API route for Web Chat (Production Haneen Service)
  app.post('/api/chat', async (req, res) => {
    try {
      const body = req.body || {};
      const userMessage = body.message || body.text || '';
      const conversationId = body.conversationId || body.sessionId;
      const clientTenantId = body.tenantId || body.clientTenantId;
      const clientStoreId = body.storeId || body.clientStoreId;
      const clientIp = req.ip || req.socket.remoteAddress || '127.0.0.1';

      const response = await haneenService.processMessage({
        message: userMessage,
        conversationId,
        clientTenantId,
        clientStoreId,
        clientIp,
        leadConfirmation: body.leadConfirmation
      });

      res.status(200).json({
        conversationId: response.conversationId,
        message: response.message,
        text: response.message, // Backward compatibility
        messageId: `msg-out-${Date.now()}`,
        status: response.status,
        handoffState: response.handoffState,
        leadState: response.leadState,
        timestamp: response.timestamp
      });
    } catch (error: any) {
      if (error instanceof UnauthorizedDataAccessError) {
        logger.warn('Unauthorized context access rejected on /api/chat', { error: error.message });
        return res.status(403).json({
          error: error.message,
          verdict: 'BLOCKED',
          writesExecuted: 0
        });
      }

      const agentName = AgentIdentityStore.getInstance().getIdentity().displayName;
      logger.error('Error processing web chat request', { error: error.message });
      res.status(200).json({
        conversationId: req.body?.conversationId || req.body?.sessionId || `conv-${Date.now()}`,
        message: `أهلاً بك في متجر الذيباني! أنا ${agentName}، الخدمة مشغولة حالياً بسبب كثرة الطلبات. يرجى إعادة المحاولة بعد لحظات.`,
        text: `أهلاً بك في متجر الذيباني! أنا ${agentName}، الخدمة مشغولة حالياً بسبب كثرة الطلبات. يرجى إعادة المحاولة بعد لحظات.`,
        status: 'ACTIVE',
        timestamp: new Date()
      });
    }
  });

  // Secure endpoint to execute CMD-023 Bootstrap
  app.post('/api/admin/bootstrap-tenant', async (req, res) => {
    const { bootstrapTenantEndpoint } = await import('./src/infrastructure/google-sheets/admin/bootstrap-endpoint.js');
    await bootstrapTenantEndpoint(req, res);
  });

  // UI interface for browser-based bootstrap
  app.get('/api/admin/bootstrap-ui', async (req, res) => {
    const { renderBootstrapUI } = await import('./src/infrastructure/google-sheets/admin/bootstrap-endpoint.js');
    renderBootstrapUI(req, res);
  });

  // Secure endpoint to verify Render Google Sheets connection
  app.get('/api/admin/verify-google-sheets', async (req, res) => {
    const { verifyGoogleSheetsConnection } = await import('./src/infrastructure/google-sheets/admin/verify-endpoint.js');
    await verifyGoogleSheetsConnection(req, res);
  });

  // UI interface for browser-based verification
  app.get('/api/admin/verify-ui', async (req, res) => {
    const { renderVerifyUI } = await import('./src/infrastructure/google-sheets/admin/verify-endpoint.js');
    renderVerifyUI(req, res);
  });

  // Secure endpoint to import Al-Theibani store catalog (CMD-026)
  app.post('/api/admin/import-catalog', async (req, res) => {
    const { importCatalogEndpoint } = await import('./src/infrastructure/google-sheets/admin/catalog-endpoint.js');
    await importCatalogEndpoint(req, res);
  });

  // Secure endpoint to provision real business knowledge (CMD-031)
  app.post('/api/admin/provision-business-knowledge', async (req, res) => {
    const { provisionBusinessKnowledgeEndpoint } = await import('./src/infrastructure/google-sheets/admin/business-knowledge-endpoint.js');
    await provisionBusinessKnowledgeEndpoint(req, res);
  });

  // UI interface for browser-based business knowledge provisioning
  app.get('/api/admin/provision-business-knowledge-ui', async (req, res) => {
    const { renderProvisionBusinessKnowledgeUI } = await import('./src/infrastructure/google-sheets/admin/business-knowledge-endpoint.js');
    renderProvisionBusinessKnowledgeUI(req, res);
  });

  // Secure read-only endpoint to read back business knowledge (CMD-032)
  app.get('/api/admin/readback-business-knowledge', async (req, res) => {
    const { readbackBusinessKnowledgeEndpoint } = await import('./src/infrastructure/google-sheets/admin/business-knowledge-endpoint.js');
    await readbackBusinessKnowledgeEndpoint(req, res);
  });

  // UI interface for browser-based business knowledge read-back
  app.get('/api/admin/readback-business-knowledge-ui', async (req, res) => {
    const { renderReadbackBusinessKnowledgeUI } = await import('./src/infrastructure/google-sheets/admin/business-knowledge-endpoint.js');
    renderReadbackBusinessKnowledgeUI(req, res);
  });

  // CMD-035 Live Owner Settings endpoints
  app.get('/api/admin/owner-settings', async (req, res) => {
    const { getOwnerSettingsEndpoint } = await import('./src/infrastructure/google-sheets/admin/owner-settings-endpoint.js');
    await getOwnerSettingsEndpoint(req, res);
  });

  app.post('/api/admin/owner-settings/update', async (req, res) => {
    const { updateOwnerSettingEndpoint } = await import('./src/infrastructure/google-sheets/admin/owner-settings-endpoint.js');
    await updateOwnerSettingEndpoint(req, res);
  });

  // CMD-041 Production Readiness Endpoint
  app.get('/api/admin/production-readiness', async (req, res) => {
    const { productionReadinessEndpoint } = await import('./src/infrastructure/google-sheets/admin/production-readiness-endpoint.js');
    await productionReadinessEndpoint(req, res);
  });

  // CMD-043 Production Readiness UI Interface
  app.get('/api/admin/production-readiness-ui', async (req, res) => {
    const { renderProductionReadinessUI } = await import('./src/infrastructure/google-sheets/admin/production-readiness-endpoint.js');
    renderProductionReadinessUI(req, res);
  });

  // CMD-044 Live Haneen Customer Service Verification Endpoint
  app.get('/api/admin/live-haneen-verification', async (req, res) => {
    const { liveHaneenVerificationEndpoint } = await import('./src/infrastructure/google-sheets/admin/live-haneen-verification-endpoint.js');
    await liveHaneenVerificationEndpoint(req, res);
  });

  // CMD-044 Live Haneen Customer Service Verification UI Interface
  app.get('/api/admin/live-haneen-verification-ui', async (req, res) => {
    const { renderLiveHaneenVerificationUI } = await import('./src/infrastructure/google-sheets/admin/live-haneen-verification-endpoint.js');
    renderLiveHaneenVerificationUI(req, res);
  });

  // CMD-080 Live Order Lifecycle Verification Endpoint
  app.get('/api/admin/live-order-verification', async (req, res) => {
    const { liveOrderVerificationEndpoint } = await import('./src/infrastructure/google-sheets/admin/live-order-verification-endpoint.js');
    await liveOrderVerificationEndpoint(req, res);
  });

  // CMD-088 & CMD-090 Admin Orders and Notifications Visibility API Endpoints
  app.get('/api/admin/orders', async (req, res) => {
    try {
      const { OrderStore } = await import('./src/core/orders/order-store.js');
      const { UnauthorizedDataAccessError } = await import('./src/core/data/errors.js');
      const store = OrderStore.getInstance();
      const tenantId = (req.query.tenantId as string) || CANONICAL_TENANT_ID;
      const storeId = (req.query.storeId as string) || CANONICAL_STORE_ID;
      const context = { tenantId, storeId };
      const orders = await store.getOrders(context);
      res.status(200).json({ success: true, count: orders.length, orders });
    } catch (err: any) {
      if (err.name === 'UnauthorizedDataAccessError' || err.message?.includes('Cross-')) {
        return res.status(403).json({ success: false, error: err.message });
      }
      res.status(500).json({ success: false, error: err.message || 'Failed to fetch orders' });
    }
  });

  app.get('/api/admin/orders/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { OrderStore } = await import('./src/core/orders/order-store.js');
      const store = OrderStore.getInstance();
      const tenantId = (req.query.tenantId as string) || CANONICAL_TENANT_ID;
      const storeId = (req.query.storeId as string) || CANONICAL_STORE_ID;
      const context = { tenantId, storeId };
      const order = await store.getOrderById(id, context);
      if (!order) {
        return res.status(404).json({ success: false, error: `Order ${id} not found` });
      }
      res.status(200).json({ success: true, order });
    } catch (err: any) {
      if (err.name === 'UnauthorizedDataAccessError' || err.message?.includes('Cross-') || err.message?.includes('Unauthorized')) {
        return res.status(403).json({ success: false, error: err.message });
      }
      res.status(500).json({ success: false, error: err.message || 'Failed to fetch order details' });
    }
  });

  app.post('/api/admin/orders/status', async (req, res) => {
    try {
      const { orderId, status, tenantId, storeId } = req.body || {};
      if (!orderId || !status) {
        return res.status(400).json({ success: false, error: 'orderId and status are required' });
      }
      const { OrderStore } = await import('./src/core/orders/order-store.js');
      const store = OrderStore.getInstance();
      const context = {
        tenantId: tenantId || CANONICAL_TENANT_ID,
        storeId: storeId || CANONICAL_STORE_ID
      };

      // Check if order exists and belongs to context before updating
      const existing = await store.getOrderById(orderId, context);
      if (!existing) {
        return res.status(404).json({ success: false, error: `Order ${orderId} not found` });
      }

      await store.updateOrderStatus(orderId, status, context);
      const updated = await store.getOrderById(orderId, context);
      res.status(200).json({ success: true, verdict: 'ORDER_STATUS_UPDATED', order: updated });
    } catch (err: any) {
      if (err.name === 'UnauthorizedDataAccessError' || err.message?.includes('Cross-') || err.message?.includes('Unauthorized')) {
        return res.status(403).json({ success: false, error: err.message });
      }
      if (err.name === 'DataNotFoundError' || err.message?.includes('not found')) {
        return res.status(404).json({ success: false, error: err.message });
      }
      res.status(500).json({ success: false, error: err.message || 'Failed to update order status' });
    }
  });

  app.post('/api/admin/orders/payment-status', async (req, res) => {
    try {
      const { orderId, paymentStatus, tenantId, storeId } = req.body || {};
      if (!orderId || !paymentStatus) {
        return res.status(400).json({ success: false, error: 'orderId and paymentStatus are required' });
      }
      const { OrderStore } = await import('./src/core/orders/order-store.js');
      const store = OrderStore.getInstance();
      const context = {
        tenantId: tenantId || CANONICAL_TENANT_ID,
        storeId: storeId || CANONICAL_STORE_ID
      };

      const existing = await store.getOrderById(orderId, context);
      if (!existing) {
        return res.status(404).json({ success: false, error: `Order ${orderId} not found` });
      }

      await store.updatePaymentStatus(orderId, paymentStatus, context);
      const updated = await store.getOrderById(orderId, context);
      res.status(200).json({ success: true, verdict: 'PAYMENT_STATUS_UPDATED', order: updated });
    } catch (err: any) {
      if (err.name === 'UnauthorizedDataAccessError' || err.message?.includes('Cross-') || err.message?.includes('Unauthorized')) {
        return res.status(403).json({ success: false, error: err.message });
      }
      if (err.name === 'DataNotFoundError' || err.message?.includes('not found')) {
        return res.status(404).json({ success: false, error: err.message });
      }
      res.status(500).json({ success: false, error: err.message || 'Failed to update payment status' });
    }
  });

  app.get('/api/admin/notifications', async (req, res) => {
    try {
      const tenantId = (req.query.tenantId as string) || CANONICAL_TENANT_ID;
      const storeId = (req.query.storeId as string) || CANONICAL_STORE_ID;

      if (tenantId !== CANONICAL_TENANT_ID || storeId !== CANONICAL_STORE_ID) {
        return res.status(403).json({ success: false, error: 'Unauthorized tenant or store access' });
      }

      const context = { tenantId, storeId };
      const { AdminNotifier } = await import('./src/core/orders/admin-notifier.js');
      const { OrderStore } = await import('./src/core/orders/order-store.js');
      const notifier = AdminNotifier.getInstance();
      const store = OrderStore.getInstance();

      // Sync persistent orders into notification records (restart survival)
      try {
        const orders = await store.getOrders(context);
        notifier.syncFromOrders(orders, context);
      } catch (err) {
        console.warn('[server] Non-blocking order sync warning:', err);
      }

      const notifications = notifier.getNotifications(context);
      const unreadCount = notifier.getUnreadCount(context);
      res.status(200).json({ success: true, count: notifications.length, unreadCount, notifications });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to fetch notifications' });
    }
  });

  app.post('/api/admin/notifications/mark-read', async (req, res) => {
    try {
      const { notificationId, orderId, id, tenantId = CANONICAL_TENANT_ID, storeId = CANONICAL_STORE_ID } = req.body || {};

      if (tenantId !== CANONICAL_TENANT_ID || storeId !== CANONICAL_STORE_ID) {
        return res.status(403).json({ success: false, error: 'Unauthorized tenant or store access' });
      }

      const targetId = notificationId || id || orderId;
      if (!targetId) {
        return res.status(400).json({ success: false, error: 'Missing notificationId or orderId' });
      }

      const context = { tenantId, storeId };
      const { AdminNotifier } = await import('./src/core/orders/admin-notifier.js');
      const notifier = AdminNotifier.getInstance();
      const updated = notifier.markAsRead(targetId, context);
      const unreadCount = notifier.getUnreadCount(context);

      res.status(200).json({ success: true, updated, unreadCount, count: notifier.getNotifications(context).length });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || 'Failed to mark notification as read' });
    }
  });

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
