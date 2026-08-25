import { describe, it, expect, beforeEach } from 'vitest';
import { OrderCheckoutEngine } from './orders/order-checkout-engine';
import { OrderStore } from './orders/order-store';
import { ConversationSession } from './productization/session-store';
import { DataOperationContext } from './data/provider';

const context: DataOperationContext = {
  tenantId: 'tnt-altheebani',
  storeId: 'str-main',
  agentId: 'agt-sana'
};

describe('CMD-083: SANA INTENT GATE & SAFE PRODUCT RESOLUTION FIX', () => {
  let engine: OrderCheckoutEngine;
  let orderStore: OrderStore;
  let session: ConversationSession;

  beforeEach(() => {
    OrderStore.resetInstance();
    orderStore = OrderStore.getInstance();
    engine = new OrderCheckoutEngine();
    session = {
      conversationId: 'conv-cmd-083',
      tenantId: 'tnt-altheebani',
      storeId: 'str-main',
      agentId: 'agt-sana',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'ACTIVE',
      checkoutState: { cart: [], step: 'NO_ORDER' }
    };
  });

  it('1. "كم سعر سكر السعيد؟" must be PRICE_QUERY with 0 cart items and no activeOrderDraftId', async () => {
    const res = await engine.handleCheckoutMessage('كم سعر سكر السعيد؟', session, context);
    expect(res).toContain('500 YER');
    expect(session.checkoutState?.cart.length).toBe(0);
    expect(session.checkoutState?.activeOrderDraftId).toBeUndefined();
  });

  it('2. "هل يوجد سمن الماس؟" must be AVAILABILITY_QUERY with 0 cart items and no activeOrderDraftId', async () => {
    const res = await engine.handleCheckoutMessage('هل يوجد سمن الماس؟', session, context);
    expect(res).toContain('متوفر');
    expect(session.checkoutState?.cart.length).toBe(0);
    expect(session.checkoutState?.activeOrderDraftId).toBeUndefined();
  });

  it('3. "هل يوجد أناناس؟" must be AVAILABILITY_QUERY with 0 cart items and no activeOrderDraftId', async () => {
    const res = await engine.handleCheckoutMessage('هل يوجد أناناس؟', session, context);
    expect(res).toContain('متوفر');
    expect(session.checkoutState?.cart.length).toBe(0);
    expect(session.checkoutState?.activeOrderDraftId).toBeUndefined();
  });

  it('4. "كم سعر البسكوت؟" must be PRICE_QUERY with 0 cart items and no activeOrderDraftId', async () => {
    const res = await engine.handleCheckoutMessage('كم سعر البسكوت؟', session, context);
    expect(res).toBeDefined();
    expect(session.checkoutState?.cart.length).toBe(0);
    expect(session.checkoutState?.activeOrderDraftId).toBeUndefined();
  });

  it('5. "أريد كيلو سكر" must be PURCHASE_INTENT and add 1 sugar item to cart', async () => {
    const res = await engine.handleCheckoutMessage('أريد كيلو سكر', session, context);
    expect(res).toContain('تمت إضافة المنتجات');
    expect(session.checkoutState?.cart.length).toBe(1);
    expect(session.checkoutState?.cart[0].productId).toBe('prod-sugar');
    expect(session.checkoutState?.activeOrderDraftId).toBeDefined();
  });

  it('6. "أريد سمن الماس علب" must be PURCHASE_INTENT and add exactly 1 saman almas item', async () => {
    const res = await engine.handleCheckoutMessage('أريد سمن الماس علب', session, context);
    expect(res).toContain('تمت إضافة المنتجات');
    expect(session.checkoutState?.cart.length).toBe(1);
    expect(session.checkoutState?.cart[0].productName).toBe('سمن الماس');
    expect(session.checkoutState?.activeOrderDraftId).toBeDefined();
  });

  it('7. "هل يوجد سمن" with multiple catalog options must return list without mutating cart', async () => {
    // Add custom catalog supplier with multiple saman options
    engine.setCatalogProductsSupplier(async () => [
      { id: 's1', name: 'سمن البنت', price: 2000, inStock: true, tenantId: 't', storeId: 's', currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
      { id: 's2', name: 'سمن القمرية', price: 2200, inStock: true, tenantId: 't', storeId: 's', currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
      { id: 's3', name: 'سمن الماس', price: 2500, inStock: true, tenantId: 't', storeId: 's', currency: 'YER', createdAt: new Date(), updatedAt: new Date() }
    ]);

    const res = await engine.handleCheckoutMessage('هل يوجد سمن', session, context);
    expect(res).toContain('سمن البنت');
    expect(res).toContain('سمن القمرية');
    expect(res).toContain('سمن الماس');
    expect(session.checkoutState?.cart.length).toBe(0);
    expect(session.checkoutState?.activeOrderDraftId).toBeUndefined();
  });

  it('8. "أريد سمن" with multiple matches must return CLARIFICATION_REQUIRED and NOT add all to cart', async () => {
    engine.setCatalogProductsSupplier(async () => [
      { id: 's1', name: 'سمن البنت', price: 2000, inStock: true, tenantId: 't', storeId: 's', currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
      { id: 's2', name: 'سمن القمرية', price: 2200, inStock: true, tenantId: 't', storeId: 's', currency: 'YER', createdAt: new Date(), updatedAt: new Date() },
      { id: 's3', name: 'سمن الماس', price: 2500, inStock: true, tenantId: 't', storeId: 's', currency: 'YER', createdAt: new Date(), updatedAt: new Date() }
    ]);

    const res = await engine.handleCheckoutMessage('أريد سمن', session, context);
    expect(res).toContain('تتوفر لدينا عدة أنواع');
    expect(session.checkoutState?.cart.length).toBe(0);
    expect(session.checkoutState?.activeOrderDraftId).toBeUndefined();
  });

  it('9. "نعم" should only add lastOfferedProduct when offered in previous turn', async () => {
    // Turn 1: Availability query
    await engine.handleCheckoutMessage('هل يوجد سمن الماس؟', session, context);
    expect(session.checkoutState?.lastOfferedProduct?.name).toBe('سمن الماس');
    expect(session.checkoutState?.cart.length).toBe(0);

    // Turn 2: Confirming offer
    const res2 = await engine.handleCheckoutMessage('نعم', session, context);
    expect(res2).toContain('تمت إضافة 1 (سمن الماس)');
    expect(session.checkoutState?.cart.length).toBe(1);
    expect(session.checkoutState?.lastOfferedProduct).toBeUndefined();
  });

  it('10. Product search / catalog lookup must NEVER mutate cart', async () => {
    await engine.handleCheckoutMessage('ما سعر أناناس طازج؟', session, context);
    await engine.handleCheckoutMessage('ما سعر سمن الماس؟', session, context);
    expect(session.checkoutState?.cart.length).toBe(0);
    expect(session.checkoutState?.activeOrderDraftId).toBeUndefined();
  });

  it('11. PRICE_QUERY must never create activeOrderDraftId', async () => {
    await engine.handleCheckoutMessage('كم سعر سكر السعيد ابو كيلو؟', session, context);
    expect(session.checkoutState?.activeOrderDraftId).toBeUndefined();
  });

  it('12. AVAILABILITY_QUERY must never create activeOrderDraftId', async () => {
    await engine.handleCheckoutMessage('هل متوفر بسكوت ابو ولد؟', session, context);
    expect(session.checkoutState?.activeOrderDraftId).toBeUndefined();
  });

  it('13. Sequence of 3 consecutive informational queries must leave cart empty throughout', async () => {
    await engine.handleCheckoutMessage('كم سعر سكر السعيد؟', session, context);
    expect(session.checkoutState?.cart.length).toBe(0);

    await engine.handleCheckoutMessage('هل يوجد سمن الماس؟', session, context);
    expect(session.checkoutState?.cart.length).toBe(0);

    await engine.handleCheckoutMessage('كم سعر البسكوت؟', session, context);
    expect(session.checkoutState?.cart.length).toBe(0);
    expect(session.checkoutState?.activeOrderDraftId).toBeUndefined();
  });
});
