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


const defaultPolicy: AgentPolicy = {
  persona: 'You are a helpful customer support agent.',
  language: 'Arabic and English',
  tone: 'Professional and friendly',
  rules: ['Be concise', 'Do not make up information'],
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

  // API route for Web Chat
  app.post('/api/chat', async (req, res) => {
    try {
      const payload = req.body as WebPayload;
      // 1. Process via gateway
      const incomingMessage = await gateway.processIncomingPayload('WEB', payload);
      
      // 2. Process via orchestrator
      const outgoingMessage = await orchestrator.processMessage(incomingMessage);
      
      // 3. (Optional) Route back through gateway if needed, but for HTTP we can just return it.
      await gateway.routeOutgoingMessage('WEB', outgoingMessage);
      
      res.json(outgoingMessage);
    } catch (error: any) {
      logger.error('Error processing web chat request', { error: error.message });
      res.status(400).json({
        error: 'Failed to process message',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
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
