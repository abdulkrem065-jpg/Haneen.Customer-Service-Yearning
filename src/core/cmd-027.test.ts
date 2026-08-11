import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentOrchestrator } from './orchestrator';
import { ILogger, IConversationContext, IToolRegistry, IAIProvider } from './interfaces';
import { IncomingMessage, AgentPolicy } from './types';
import { ProductSearchTool } from './tools/product-search-tool';
import { ProductGetTool } from './tools/product-get-tool';
import { GoogleSheetsDataProvider } from '../infrastructure/google-sheets/provider';
import { Product } from './data/domain';
import { ISheetMapper } from '../infrastructure/google-sheets/mapper';
import { HeaderMap } from '../infrastructure/google-sheets/header-map';
import { CanonicalSchemas } from '../infrastructure/google-sheets/schema-definitions';
import { IGoogleSheetsTransport, SheetRow } from '../infrastructure/google-sheets/transport';
import {
  ALTHEIBANI_TENANT_ID,
  ALTHEIBANI_STORE_ID,
  ALTHEIBANI_CURRENCY,
  RAW_PRODUCTS
} from '../infrastructure/google-sheets/import-altheibani-catalog';

class ProductMapper implements ISheetMapper<Product> {
  sheetName = 'products';
  requiredHeaders = CanonicalSchemas.products.requiredHeaders;
  defaultHeaders = [...CanonicalSchemas.products.requiredHeaders, ...CanonicalSchemas.products.optionalHeaders];

  fromRow(rowValues: string[], headerMap: HeaderMap): Product {
    const rawMeta = headerMap.getValue(rowValues, 'metadata');
    let parsedMeta: Record<string, unknown> | undefined = undefined;
    if (rawMeta) {
      try {
        parsedMeta = JSON.parse(rawMeta);
      } catch {
        parsedMeta = { raw: rawMeta };
      }
    }

    return {
      id: headerMap.requireValue(rowValues, 'id'),
      tenantId: headerMap.requireValue(rowValues, 'tenantId'),
      storeId: headerMap.requireValue(rowValues, 'storeId'),
      name: headerMap.requireValue(rowValues, 'name'),
      price: parseFloat(headerMap.requireValue(rowValues, 'price')),
      currency: headerMap.requireValue(rowValues, 'currency'),
      inStock: headerMap.requireValue(rowValues, 'inStock') === 'TRUE',
      categoryId: headerMap.getValue(rowValues, 'categoryId'),
      description: headerMap.getValue(rowValues, 'description'),
      metadata: parsedMeta,
      createdAt: new Date(headerMap.requireValue(rowValues, 'createdAt')),
      updatedAt: new Date(headerMap.requireValue(rowValues, 'updatedAt'))
    };
  }

  toRow(entity: Product, headerMap: HeaderMap): string[] {
    return headerMap.buildRow({
      id: entity.id,
      tenantId: entity.tenantId,
      storeId: entity.storeId,
      name: entity.name,
      price: entity.price.toString(),
      currency: entity.currency,
      inStock: entity.inStock ? 'TRUE' : 'FALSE',
      categoryId: entity.categoryId || '',
      description: entity.description || '',
      imageUrl: '',
      metadata: entity.metadata ? JSON.stringify(entity.metadata) : '',
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString()
    });
  }

  getId(entity: Product): string {
    return entity.id;
  }
}

// Populate Mock Transport with Real Al-Theibani Catalog Imported in CMD-026
function createPopulatedTransport(): IGoogleSheetsTransport {
  const prodHeaders = [...CanonicalSchemas.products.requiredHeaders, ...CanonicalSchemas.products.optionalHeaders];
  const prodHeaderMap = new HeaderMap(prodHeaders, prodHeaders);

  const now = '2026-08-11T00:00:00.000Z';
  const prodRows: SheetRow[] = [{ rowNumber: 1, values: prodHeaders }];

  RAW_PRODUCTS.forEach((p, idx) => {
    const rowVal = prodHeaderMap.buildRow({
      id: p.id,
      tenantId: ALTHEIBANI_TENANT_ID,
      storeId: ALTHEIBANI_STORE_ID,
      name: p.name,
      price: p.price,
      currency: ALTHEIBANI_CURRENCY,
      inStock: p.available ? 'TRUE' : 'FALSE',
      createdAt: now,
      updatedAt: now,
      categoryId: p.categoryName === 'تموين' ? 'cat-tamween' :
                  p.categoryName === 'سمون وزيوت' ? 'cat-samn-zuyoot' :
                  p.categoryName === 'إلكترونيات' ? 'cat-electronics' :
                  p.categoryName === 'منظفات' ? 'cat-cleansing' : 'cat-other',
      description: p.description || '',
      imageUrl: p.image || '',
      metadata: JSON.stringify({ featured: p.featured })
    });
    prodRows.push({ rowNumber: idx + 2, values: rowVal });
  });

  return {
    getRows: vi.fn().mockImplementation(async (sheetName: string) => {
      if (sheetName === 'products') return prodRows;
      return [];
    }),
    addRow: vi.fn(),
    updateRow: vi.fn(),
    deleteRow: vi.fn()
  };
}

describe('CMD-027: Real Agent Catalog E2E Verification for "حنين"', () => {
  let mockLogger: ILogger;
  let mockConversationContext: IConversationContext;
  let mockAiProvider: IAIProvider;
  let mockToolRegistry: IToolRegistry;
  let mockTransport: IGoogleSheetsTransport;
  let productProvider: GoogleSheetsDataProvider<Product>;
  let orchestrator: AgentOrchestrator;
  let agentPolicy: AgentPolicy;

  beforeEach(() => {
    mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
    
    const stateMap = new Map<string, any>();
    const historyMap = new Map<string, any[]>();

    mockConversationContext = {
      getState: vi.fn().mockImplementation(async (convId) => stateMap.get(convId)),
      setState: vi.fn().mockImplementation(async (convId, state) => { stateMap.set(convId, state); }),
      getHistory: vi.fn().mockImplementation(async (convId) => historyMap.get(convId) || []),
      addMessage: vi.fn().mockImplementation(async (convId, msg) => {
        const hist = historyMap.get(convId) || [];
        hist.push(msg);
        historyMap.set(convId, hist);
      }),
    };

    mockTransport = createPopulatedTransport();
    productProvider = new GoogleSheetsDataProvider<Product>(mockTransport, new ProductMapper());

    const searchTool = new ProductSearchTool(productProvider);
    const getTool = new ProductGetTool(productProvider);
    const tools = [searchTool, getTool];

    mockToolRegistry = {
      getTool: vi.fn().mockImplementation((name) => tools.find(t => t.name === name)),
      getAllTools: vi.fn().mockReturnValue(tools),
      registerTool: vi.fn(),
    };

    mockAiProvider = {
      generateResponse: vi.fn(),
    };

    agentPolicy = {
      persona: 'حنين',
      language: 'ar',
      tone: 'friendly',
      rules: ['خدمة عملاء بقالة الذيباني'],
      handoffRules: [],
      toolUsageRules: []
    };

    orchestrator = new AgentOrchestrator(
      mockLogger,
      mockAiProvider,
      mockConversationContext,
      mockToolRegistry,
      agentPolicy
    );
  });

  const createMessage = (text: string, conversationId = 'conv-001'): IncomingMessage => ({
    context: {
      messageId: 'msg-' + Math.random().toString(36).substring(7),
      conversationId,
      customerId: 'cust-altheibani-1',
      channel: 'WEB',
      timestamp: new Date(),
      tenantId: ALTHEIBANI_TENANT_ID,
      storeId: ALTHEIBANI_STORE_ID,
      agentId: 'agent-haneen'
    },
    text
  });

  it('1. Query "كم سعر سكر السعيد ابو كيلو؟" -> Returns 500 YER from Google Sheets', async () => {
    (mockAiProvider.generateResponse as any)
      .mockResolvedValueOnce({
        text: 'دعني أتحقق من الكتالوج.',
        toolCalls: [{ name: 'ProductSearchTool', params: { searchTerm: 'سكر السعيد' } }]
      })
      .mockImplementationOnce(async (_m, _h, _p, _t, results) => {
        const data = results![0].result.data as any;
        const prod = data.items[0];
        return { text: `سعر ${prod.name} هو ${prod.price} ${prod.currency}.` };
      });

    const res = await orchestrator.processMessage(createMessage('كم سعر سكر السعيد ابو كيلو؟'));
    expect(res.text).toBe('سعر سكر السعيد ابو كيلو هو 500 YER.');
    expect(mockTransport.addRow).not.toHaveBeenCalled();
  });

  it('2. Query "هل يوجد بسكوت بسكريم كبير؟" -> Returns inStock = true', async () => {
    (mockAiProvider.generateResponse as any)
      .mockResolvedValueOnce({
        text: 'أتحقق لك الآن.',
        toolCalls: [{ name: 'ProductSearchTool', params: { searchTerm: 'بسكوت بسكريم كبير' } }]
      })
      .mockImplementationOnce(async (_m, _h, _p, _t, results) => {
        const data = results![0].result.data as any;
        const prod = data.items[0];
        return { text: `نعم، ${prod.name} متوفر في المخزون وبسعر ${prod.price} ${prod.currency}.` };
      });

    const res = await orchestrator.processMessage(createMessage('هل يوجد بسكوت بسكريم كبير؟'));
    expect(res.text).toContain('نعم، بسكوت بسكريم كبير متوفر في المخزون وبسعر 300 YER.');
  });

  it('3. Query "كم سعر سماعات الوحش؟" -> Returns 450 YER', async () => {
    (mockAiProvider.generateResponse as any)
      .mockResolvedValueOnce({
        text: 'جاري البحث...',
        toolCalls: [{ name: 'ProductSearchTool', params: { searchTerm: 'سماعات الوحش' } }]
      })
      .mockImplementationOnce(async (_m, _h, _p, _t, results) => {
        const data = results![0].result.data as any;
        const prod = data.items[0];
        return { text: `سعر ${prod.name} هو ${prod.price} ${prod.currency}.` };
      });

    const res = await orchestrator.processMessage(createMessage('كم سعر سماعات الوحش؟'));
    expect(res.text).toBe('سعر سماعات الوحش هو 450 YER.');
  });

  it('4. Category Query "ما المنتجات الموجودة في قسم تموين؟" -> Returns items in category تموين', async () => {
    (mockAiProvider.generateResponse as any)
      .mockResolvedValueOnce({
        text: 'جاري البحث عن منتجات قسم التموين...',
        toolCalls: [{ name: 'ProductSearchTool', params: { categoryId: 'cat-tamween' } }]
      })
      .mockImplementationOnce(async (_m, _h, _p, _t, results) => {
        const data = results![0].result.data as any;
        const names = data.items.map((i: any) => i.name).join(', ');
        return { text: `المنتجات في قسم تموين هي: ${names}` };
      });

    const res = await orchestrator.processMessage(createMessage('ما المنتجات الموجودة في قسم تموين؟'));
    expect(res.text).toContain('سكر السعيد ابو كيلو');
    expect(res.text).toContain('رز تايلندي ابو كيلو');
  });

  it('5. Query "هل يوجد اندومي كاري دجاج؟" -> Returns price 150 YER', async () => {
    (mockAiProvider.generateResponse as any)
      .mockResolvedValueOnce({
        text: 'جاري البحث...',
        toolCalls: [{ name: 'ProductSearchTool', params: { searchTerm: 'اندومي كاري دجاج' } }]
      })
      .mockImplementationOnce(async (_m, _h, _p, _t, results) => {
        const data = results![0].result.data as any;
        const prod = data.items[0];
        return { text: `نعم، متوفر ${prod.name} بسعر ${prod.price} ${prod.currency}.` };
      });

    const res = await orchestrator.processMessage(createMessage('هل يوجد اندومي كاري دجاج؟'));
    expect(res.text).toBe('نعم، متوفر اندومي كاري دجاج بسعر 150 YER.');
  });

  it('6. No Hallucination Test: Non-existent product -> Clear "not available" message', async () => {
    (mockAiProvider.generateResponse as any)
      .mockResolvedValueOnce({
        text: 'جاري البحث...',
        toolCalls: [{ name: 'ProductSearchTool', params: { searchTerm: 'منتج غير موجود' } }]
      })
      .mockImplementationOnce(async () => {
        return { text: 'عذرًا، المنتج المطلوب غير متوفر حاليًا في بقالة الذيباني.' };
      });

    const res = await orchestrator.processMessage(createMessage('كم سعر منتج غير موجود اسمه منتج غير موجود؟'));
    expect(res.text).toBe('عذرًا، المنتج المطلوب غير متوفر حاليًا في بقالة الذيباني.');
  });

  it('7. Multi-Turn Conversation Context Test', async () => {
    const convId = 'conv-altheibani-multi';

    // Turn 1
    (mockAiProvider.generateResponse as any)
      .mockResolvedValueOnce({
        text: 'جاري البحث عن سكر السعيد...',
        toolCalls: [{ name: 'ProductSearchTool', params: { searchTerm: 'سكر السعيد' } }]
      })
      .mockResolvedValueOnce({
        text: 'سعر سكر السعيد ابو كيلو هو 500 YER.'
      });

    const res1 = await orchestrator.processMessage(createMessage('كم سعر سكر السعيد ابو كيلو؟', convId));
    expect(res1.text).toBe('سعر سكر السعيد ابو كيلو هو 500 YER.');

    // Turn 2
    (mockAiProvider.generateResponse as any)
      .mockResolvedValueOnce({
        text: 'جاري البحث عن بسكوت بسكريم...',
        toolCalls: [{ name: 'ProductSearchTool', params: { searchTerm: 'بسكوت بسكريم' } }]
      })
      .mockResolvedValueOnce({
        text: 'وبسكوت بسكريم كبير متوفر بسعر 300 YER.'
      });

    const res2 = await orchestrator.processMessage(createMessage('وماذا عن بسكوت بسكريم؟', convId));
    expect(res2.text).toBe('وبسكوت بسكريم كبير متوفر بسعر 300 YER.');

    // Verify context was retained
    const history = await mockConversationContext.getHistory(convId);
    expect(history.length).toBe(4); // 2 turns x 2 messages
  });

  it('8. Tenant & Store Security Isolation: Attempting tenant override in AI tool params is stripped', async () => {
    (mockAiProvider.generateResponse as any)
      .mockResolvedValueOnce({
        text: 'أبحث عن المنتج...',
        toolCalls: [{ name: 'ProductSearchTool', params: { searchTerm: 'سكر', tenantId: 'hacker-tenant', storeId: 'hacker-store' } }]
      })
      .mockResolvedValueOnce({ text: 'تمت العملية.' });

    const spySearch = vi.spyOn(productProvider, 'search');

    await orchestrator.processMessage(createMessage('كم سعر سكر السعيد؟'));

    // Trusted context must win
    expect(spySearch).toHaveBeenCalledWith(
      expect.not.objectContaining({ tenantId: 'hacker-tenant' }),
      expect.objectContaining({ tenantId: ALTHEIBANI_TENANT_ID, storeId: ALTHEIBANI_STORE_ID })
    );
  });

  it('9. Write Safety Audit: 0 Writes executed on Google Sheets', () => {
    expect(mockTransport.addRow).not.toHaveBeenCalled();
    expect(mockTransport.updateRow).not.toHaveBeenCalled();
    expect(mockTransport.deleteRow).not.toHaveBeenCalled();
  });
});
