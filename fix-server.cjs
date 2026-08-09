const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Replace aiProvider creation
code = code.replace(
  "const aiProvider = new GeminiAIProvider({ apiKey: process.env.GEMINI_API_KEY || 'MOCK_KEY', isMockMode: true });",
  "const aiProvider = new GeminiAIProvider({ apiKey: process.env.GEMINI_API_KEY || 'MOCK_KEY', isMockMode: !process.env.GEMINI_API_KEY });"
);

// Add Imports
const imports = `
import { InMemoryDataProvider } from './src/core/data/mocks.js';
import { Product } from './src/core/data/domain.js';
import { ProductSearchTool } from './src/core/tools/product-search-tool.js';
import { ProductGetTool } from './src/core/tools/product-get-tool.js';
`;

code = imports + "\n" + code;

const providerSetup = `
const productProvider = new InMemoryDataProvider<Product>('Product');
productProvider.create({
  name: 'Awesome Laptop',
  description: 'A powerful laptop for developers',
  price: 1500,
  currency: 'USD',
  inStock: true
} as any, { tenantId: 'tenant-1', storeId: 'store-1', agentId: 'agent-1' });

toolRegistry.registerTool(new ProductSearchTool(productProvider));
toolRegistry.registerTool(new ProductGetTool(productProvider));
`;

code = code.replace("const toolRegistry = new SimpleToolRegistry();", "const toolRegistry = new SimpleToolRegistry();\n" + providerSetup);

fs.writeFileSync('server.ts', code);
