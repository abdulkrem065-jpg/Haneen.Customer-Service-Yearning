import { IGoogleSheetsTransport } from './transport';
import { CanonicalSchemas } from './schema-definitions';
import { HeaderMap } from './header-map';

export interface RawCategoryInput {
  id: string;
  name: string;
  description?: string;
}

export interface RawProductInput {
  id: string;
  name: string;
  description: string;
  categoryName: string;
  price: string;
  image: string;
  featured: boolean;
  available: boolean;
}

export const ALTHEIBANI_TENANT_ID = 'tnt-41f0d530';
export const ALTHEIBANI_STORE_ID = 'str-2c6ad81f';
export const ALTHEIBANI_CURRENCY = 'YER';

export const RAW_CATEGORIES: RawCategoryInput[] = [
  { id: 'cat-tamween', name: 'تموين', description: 'مواد تموينية وغذائية' },
  { id: 'cat-samn-zuyoot', name: 'سمون وزيوت', description: 'سمون وزيوت طعام' },
  { id: 'cat-electronics', name: 'إلكترونيات', description: 'أجهزة وإلكترونيات' },
  { id: 'cat-cleansing', name: 'منظفات', description: 'أدوات ومواد تنظيف' },
  { id: 'cat-diapers', name: 'حفاضات', description: 'حفاضات وفوط صحية' },
  { id: 'cat-houseware', name: 'ادوات منزليه', description: 'أدوات ومستلزمات منزلية' },
  { id: 'cat-cosmetics', name: 'ادوات التجميل', description: 'أدوات ومستحضرات تجميل' },
  { id: 'cat-baby', name: 'مستلزمات اطفال', description: 'مستلزمات وأدوات الأطفال' },
  { id: 'cat-electric', name: 'ادوات كهرباء', description: 'أدوات ومستلزمات كهربائية' },
  { id: 'cat-entertainment', name: 'ترفيه', description: 'بطاقات وكروت ترفيه' }
];

export const RAW_PRODUCTS: RawProductInput[] = [
  { id: 'prod-001', name: 'سكر السعيد ابو كيلو', description: 'سكر ممتاز', categoryName: 'تموين', price: '500', image: '', featured: false, available: true },
  { id: 'prod-002', name: 'سمن البنت', description: '', categoryName: 'سمون وزيوت', price: '1600', image: '', featured: false, available: true },
  { id: 'prod-003', name: 'رز تايلندي ابو كيلو', description: 'رز ممتاز', categoryName: 'تموين', price: '400', image: '', featured: false, available: true },
  { id: 'prod-004', name: 'بسكوت ابو ولد', description: 'بسكوت', categoryName: 'تموين', price: '200', image: 'a.jpg', featured: false, available: true },
  { id: 'prod-005', name: 'بسكوت بسكريم كبير', description: '', categoryName: 'تموين', price: '300', image: 'a4.jpg', featured: true, available: true },
  { id: 'prod-006', name: 'سماعات الوحش', description: '', categoryName: 'إلكترونيات', price: '450', image: 'a6.jpg', featured: true, available: true },
  { id: 'prod-007', name: 'زيت صغير', description: '', categoryName: 'سمون وزيوت', price: '350', image: '', featured: false, available: true },
  { id: 'prod-008', name: 'كلوركس صغير', description: '', categoryName: 'منظفات', price: '400', image: '', featured: false, available: true },
  { id: 'prod-009', name: 'فلاش صغير الاصلي', description: '', categoryName: 'منظفات', price: '1000', image: '', featured: false, available: true },
  { id: 'prod-010', name: 'فوط سوفي طويل', description: '', categoryName: 'حفاضات', price: '500', image: '', featured: false, available: true },
  { id: 'prod-011', name: 'مكانس الهلال والنجمه صغير', description: '', categoryName: 'ادوات منزليه', price: '500', image: '', featured: false, available: true },
  { id: 'prod-012', name: 'زيت الزيتون رؤى', description: '', categoryName: 'ادوات التجميل', price: '800', image: '', featured: false, available: true },
  { id: 'prod-013', name: 'رضاعات الاصلي وسط', description: '', categoryName: 'مستلزمات اطفال', price: '600', image: '', featured: false, available: true },
  { id: 'prod-014', name: 'لمبات تورش 5w', description: '', categoryName: 'ادوات كهرباء', price: '500', image: 'a5.jpg', featured: true, available: true },
  { id: 'prod-015', name: 'زيت الجبل الأخضر ابو لتر ونصف', description: '', categoryName: 'سمون وزيوت', price: '1600', image: '', featured: true, available: true },
  { id: 'prod-016', name: 'زيت القمريه طويل', description: '', categoryName: 'سمون وزيوت', price: '1100', image: '', featured: false, available: true },
  { id: 'prod-017', name: '60 شده بوبجي', description: '', categoryName: 'ترفيه', price: '500', image: '', featured: false, available: true },
  { id: 'prod-018', name: 'اندومي كاري دجاج', description: '', categoryName: 'تموين', price: '150', image: 'a2.jpg', featured: false, available: true },
  { id: 'prod-019', name: 'اندومي خضار', description: '', categoryName: 'تموين', price: '150', image: 'a1.jpg', featured: false, available: true },
  { id: 'prod-020', name: 'اندومي ليمون', description: '', categoryName: 'تموين', price: '150', image: 'a3.jpg', featured: false, available: true },
  { id: 'prod-021', name: 'شاحن كهرباء سامسونج', description: '', categoryName: 'إلكترونيات', price: '1200', image: '', featured: false, available: true },
  { id: 'prod-022', name: 'سمن القمرية', description: '', categoryName: 'سمون وزيوت', price: '1600', image: '', featured: false, available: true },
  { id: 'prod-023', name: 'زيت سفري يماني', description: '', categoryName: 'سمون وزيوت', price: '100', image: '', featured: false, available: true },
  { id: 'prod-024', name: 'كمفورت', description: '', categoryName: 'منظفات', price: '1500', image: '', featured: false, available: true },
  { id: 'prod-025', name: 'فاين فل اصفر', description: '', categoryName: 'تموين', price: '1000', image: '', featured: false, available: true },
  { id: 'prod-026', name: 'فاين باكت', description: '', categoryName: 'تموين', price: '250', image: '', featured: false, available: true },
  { id: 'prod-027', name: 'فاخر عائلي', description: '', categoryName: 'تموين', price: '800', image: '', featured: false, available: true },
  { id: 'prod-028', name: 'فاخر وسط', description: '', categoryName: 'تموين', price: '550', image: '', featured: false, available: true },
  { id: 'prod-029', name: 'فاخر زجاج', description: '', categoryName: 'تموين', price: '200', image: '', featured: false, available: true },
  { id: 'prod-030', name: 'فمتو قوارير الاصلي', description: '', categoryName: 'تموين', price: '1500', image: '', featured: false, available: true },
  { id: 'prod-031', name: 'راني علب منوع', description: '', categoryName: 'تموين', price: '300', image: '', featured: false, available: true }
];

export interface ImportResult {
  categoriesCreated: number;
  productsCreated: number;
  categoriesSkipped: number;
  productsSkipped: number;
  duplicatesFound: number;
  totalCategoriesReadBack: number;
  totalProductsReadBack: number;
  errors: string[];
}

export class CatalogImporter {
  constructor(private transport: IGoogleSheetsTransport) {}

  public async importCatalog(): Promise<ImportResult> {
    const result: ImportResult = {
      categoriesCreated: 0,
      productsCreated: 0,
      categoriesSkipped: 0,
      productsSkipped: 0,
      duplicatesFound: 0,
      totalCategoriesReadBack: 0,
      totalProductsReadBack: 0,
      errors: []
    };

    // 1. Fetch existing categories rows
    const catSchema = CanonicalSchemas.categories;
    const catHeaders = [...catSchema.requiredHeaders, ...catSchema.optionalHeaders];
    const catRows = await this.transport.getRows(catSchema.sheetName);

    let catHeaderMap: HeaderMap;
    const existingCatNames = new Set<string>();
    const categoryNameToId = new Map<string, string>();

    if (catRows.length > 0) {
      catHeaderMap = new HeaderMap(catRows[0].values, catHeaders);
      for (let i = 1; i < catRows.length; i++) {
        const row = catRows[i].values;
        const tenantId = catHeaderMap.getValue(row, 'tenantId');
        const storeId = catHeaderMap.getValue(row, 'storeId');
        const name = catHeaderMap.getValue(row, 'name');
        const id = catHeaderMap.getValue(row, 'id');

        if (tenantId === ALTHEIBANI_TENANT_ID && storeId === ALTHEIBANI_STORE_ID && name) {
          existingCatNames.add(name);
          if (id) {
            categoryNameToId.set(name, id);
          }
        }
      }
    } else {
      catHeaderMap = new HeaderMap(catHeaders, catHeaders);
      if (this.transport.writeHeaderRow) {
        await this.transport.writeHeaderRow(catSchema.sheetName, catHeaders);
      } else {
        await this.transport.addRow(catSchema.sheetName, catHeaders);
      }
    }

    // Insert categories
    for (const catInput of RAW_CATEGORIES) {
      if (existingCatNames.has(catInput.name)) {
        result.categoriesSkipped++;
        result.duplicatesFound++;
        continue;
      }

      const rowValues = catHeaderMap.buildRow({
        id: catInput.id,
        tenantId: ALTHEIBANI_TENANT_ID,
        storeId: ALTHEIBANI_STORE_ID,
        name: catInput.name,
        description: catInput.description || ''
      });

      await this.transport.addRow(catSchema.sheetName, rowValues);
      result.categoriesCreated++;
      categoryNameToId.set(catInput.name, catInput.id);
      existingCatNames.add(catInput.name);
    }

    // 2. Fetch existing product rows
    const prodSchema = CanonicalSchemas.products;
    const prodHeaders = [...prodSchema.requiredHeaders, ...prodSchema.optionalHeaders];
    const prodRows = await this.transport.getRows(prodSchema.sheetName);

    let prodHeaderMap: HeaderMap;
    const existingProdNames = new Set<string>();

    if (prodRows.length > 0) {
      prodHeaderMap = new HeaderMap(prodRows[0].values, prodHeaders);
      for (let i = 1; i < prodRows.length; i++) {
        const row = prodRows[i].values;
        const tenantId = prodHeaderMap.getValue(row, 'tenantId');
        const storeId = prodHeaderMap.getValue(row, 'storeId');
        const name = prodHeaderMap.getValue(row, 'name');

        if (tenantId === ALTHEIBANI_TENANT_ID && storeId === ALTHEIBANI_STORE_ID && name) {
          existingProdNames.add(name);
        }
      }
    } else {
      prodHeaderMap = new HeaderMap(prodHeaders, prodHeaders);
      if (this.transport.writeHeaderRow) {
        await this.transport.writeHeaderRow(prodSchema.sheetName, prodHeaders);
      } else {
        await this.transport.addRow(prodSchema.sheetName, prodHeaders);
      }
    }

    // Insert products
    const now = new Date().toISOString();

    for (const prodInput of RAW_PRODUCTS) {
      if (existingProdNames.has(prodInput.name)) {
        result.productsSkipped++;
        result.duplicatesFound++;
        continue;
      }

      const categoryId = categoryNameToId.get(prodInput.categoryName) || '';
      if (!categoryId) {
        result.errors.push(`Missing category mapping for product '${prodInput.name}' (Category: '${prodInput.categoryName}')`);
      }

      const rowValues = prodHeaderMap.buildRow({
        id: prodInput.id,
        tenantId: ALTHEIBANI_TENANT_ID,
        storeId: ALTHEIBANI_STORE_ID,
        name: prodInput.name,
        price: prodInput.price,
        currency: ALTHEIBANI_CURRENCY,
        inStock: prodInput.available ? 'TRUE' : 'FALSE',
        createdAt: now,
        updatedAt: now,
        categoryId: categoryId,
        description: prodInput.description || '',
        imageUrl: prodInput.image || '',
        metadata: JSON.stringify({ featured: prodInput.featured })
      });

      await this.transport.addRow(prodSchema.sheetName, rowValues);
      result.productsCreated++;
      existingProdNames.add(prodInput.name);
    }

    // 3. Post-write Read-back Verification
    const readBackCatRows = await this.transport.getRows(catSchema.sheetName);
    const readBackProdRows = await this.transport.getRows(prodSchema.sheetName);

    let countCats = 0;
    if (readBackCatRows.length > 0) {
      const hMap = new HeaderMap(readBackCatRows[0].values, catHeaders);
      for (let i = 1; i < readBackCatRows.length; i++) {
        const r = readBackCatRows[i].values;
        if (hMap.getValue(r, 'tenantId') === ALTHEIBANI_TENANT_ID && hMap.getValue(r, 'storeId') === ALTHEIBANI_STORE_ID) {
          countCats++;
        }
      }
    }

    let countProds = 0;
    if (readBackProdRows.length > 0) {
      const hMap = new HeaderMap(readBackProdRows[0].values, prodHeaders);
      for (let i = 1; i < readBackProdRows.length; i++) {
        const r = readBackProdRows[i].values;
        if (hMap.getValue(r, 'tenantId') === ALTHEIBANI_TENANT_ID && hMap.getValue(r, 'storeId') === ALTHEIBANI_STORE_ID) {
          countProds++;
        }
      }
    }

    result.totalCategoriesReadBack = countCats;
    result.totalProductsReadBack = countProds;

    return result;
  }
}
