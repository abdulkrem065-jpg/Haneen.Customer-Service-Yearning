import { Product } from '../data/domain';
import { ProductRequestItem } from '../nlu/language-understanding';

export interface ProductResolutionResult {
  status: 'RESOLVED' | 'AMBIGUOUS' | 'NOT_FOUND';
  rawText: string;
  queryPhrase: string;
  product?: Product;
  quantity: number;
  candidates?: Product[];
}

export class BusinessResolver {
  public static normalizeArabic(text: string): string {
    if (!text) return '';
    return text
      .trim()
      .toLowerCase()
      .replace(/[إأآا]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/ئ/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[[\],.!؟?]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  public static resolveSingleProduct(
    request: ProductRequestItem,
    catalog: Product[]
  ): ProductResolutionResult {
    const rawText = request.rawText || request.queryPhrase;
    const queryPhrase = request.queryPhrase || rawText;
    const normQuery = this.normalizeArabic(queryPhrase);
    const qty = request.quantity || 1;

    if (!catalog || catalog.length === 0) {
      return { status: 'NOT_FOUND', rawText, queryPhrase, quantity: qty };
    }

    // 1. Semantic / Recommendation criteria (e.g. "ينحط مع الرز" or "الأرخص اللي ينحط مع الرز")
    if (
      request.productDescription?.includes('ينحط مع الرز') ||
      normQuery.includes('ينحط مع الرز') ||
      normQuery.includes('مع الرز') ||
      normQuery.includes('ينطبخ مع')
    ) {
      // Find food items that go with rice (e.g. Ghee / سمن)
      const riceItems = catalog.filter(p => {
        const np = this.normalizeArabic(p.name);
        return np.includes('سمن') || np.includes('تونه') || np.includes('تونة');
      });

      if (riceItems.length > 0) {
        // Sort by price ascending if cheapest requested or default
        riceItems.sort((a, b) => a.price - b.price);
        return { status: 'RESOLVED', rawText, queryPhrase, product: riceItems[0], quantity: qty };
      }
    }

    // 2. Direct exact or ID match
    const exactMatch = catalog.find(p => p.id === queryPhrase || this.normalizeArabic(p.name) === normQuery);
    if (exactMatch) {
      return { status: 'RESOLVED', rawText, queryPhrase, product: exactMatch, quantity: qty };
    }

    // 3. Synonym / Brand / Distinctive Keyword Mappings
    let targetKeyword = normQuery;
    if (normQuery.includes('الماس') || (normQuery.includes('سمن') && !normQuery.includes('قمر'))) {
      targetKeyword = 'سمن الماس';
    } else if (normQuery.includes('سكر') || normQuery.includes('السعيد') || normQuery.includes('ابو كيلو')) {
      targetKeyword = 'سكر السعيد ابو كيلو';
    } else if (normQuery.includes('ابو ولد') || normQuery.includes('أبو ولد')) {
      targetKeyword = 'بسكوت ابو ولد';
    } else if (normQuery.includes('بسكريم')) {
      targetKeyword = 'بسكوت بسكريم كبير';
    } else if (normQuery.includes('اناناس')) {
      targetKeyword = 'اناناس طازج';
    } else if (normQuery.includes('دلسي احمر صغير') || (normQuery.includes('دلسي') && normQuery.includes('صغير'))) {
      targetKeyword = 'دلسي صغير احمر';
    } else if (normQuery.includes('دلسي احمر كبير') || (normQuery.includes('دلسي') && normQuery.includes('كبير'))) {
      targetKeyword = 'دلسي كبير احمر';
    }

    const mappedMatch = catalog.find(p => this.normalizeArabic(p.name) === targetKeyword);
    if (mappedMatch) {
      return { status: 'RESOLVED', rawText, queryPhrase, product: mappedMatch, quantity: qty };
    }

    // 4. Candidate Matching
    const candidates = catalog.filter(p => {
      const normProdName = this.normalizeArabic(p.name);
      return normProdName.includes(targetKeyword) || targetKeyword.includes(normProdName);
    });

    if (candidates.length === 1) {
      return { status: 'RESOLVED', rawText, queryPhrase, product: candidates[0], quantity: qty };
    } else if (candidates.length > 1) {
      return { status: 'AMBIGUOUS', rawText, queryPhrase, candidates, quantity: qty };
    }

    // 5. Token-based matching
    const tokens = normQuery
      .split(/\s+/)
      .filter(t => t.length > 2 && !['علبة', 'علب', 'حبة', 'حبات', 'كيلو', 'كجم', 'حقكم', 'حق', 'من', 'ابو', 'الشيء', 'الارخص', 'اللي'].includes(t));

    if (tokens.length > 0) {
      const partialCandidates = catalog.filter(p => {
        const normProdName = this.normalizeArabic(p.name);
        return tokens.some(t => normProdName.includes(t));
      });

      if (partialCandidates.length === 1) {
        return { status: 'RESOLVED', rawText, queryPhrase, product: partialCandidates[0], quantity: qty };
      } else if (partialCandidates.length > 1) {
        return { status: 'AMBIGUOUS', rawText, queryPhrase, candidates: partialCandidates, quantity: qty };
      }
    }

    // 6. Explicit Not Found
    return { status: 'NOT_FOUND', rawText, queryPhrase, quantity: qty };
  }
}
