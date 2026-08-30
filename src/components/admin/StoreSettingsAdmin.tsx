import React, { useState, useEffect } from 'react';
import {
  Store,
  Clock,
  Truck,
  MapPin,
  CreditCard,
  PhoneCall,
  FileText,
  Sparkles,
  Bell,
  Bot,
  ToggleLeft,
  CheckCircle2,
  XCircle,
  Building2,
  RefreshCw,
  AlertTriangle,
  Coins,
  Map,
  ShieldCheck,
  Edit2,
  Check,
  Save,
  ShoppingBag,
  Search,
  Package,
  Eye,
  UserCheck,
  Calendar
} from 'lucide-react';

interface SettingCategory {
  id: string;
  nameAr: string;
  icon: React.ElementType;
  descriptionAr: string;
}

const CATEGORIES: SettingCategory[] = [
  { id: 'orders', nameAr: 'مركز إدارة الطلبات', icon: ShoppingBag, descriptionAr: 'عرض طلبات العملاء الحقيقية ومتابعة الحالات وتحديث Google Sheets' },
  { id: 'identity', nameAr: 'هوية المتجر', icon: Store, descriptionAr: 'اسم المتجر، الشعار والمستندات' },
  { id: 'haneen', nameAr: 'إعدادات المساعد الذكي', icon: Bot, descriptionAr: 'اسم الوكيل (سناء)، الشخصية والنبرة' },
  { id: 'currency', nameAr: 'العملة (YER)', icon: Coins, descriptionAr: 'العملة الأساسية (الريال اليمني - YER)' },
  { id: 'hours', nameAr: 'ساعات العمل', icon: Clock, descriptionAr: '24/7، الأيام، فترات العمل والتوقيت' },
  { id: 'delivery', nameAr: 'إعدادات التوصيل', icon: Truck, descriptionAr: 'تفعيل التوصيل، الحد الأدنى والرسوم' },
  { id: 'zones', nameAr: 'مناطق التوصيل', icon: Map, descriptionAr: 'مناطق التوصيل المستقلة والرسوم' },
  { id: 'payment', nameAr: 'طرق الدفع', icon: CreditCard, descriptionAr: 'الحسابات البنكية، الكاش وتفعيل الوسائل' },
  { id: 'contact', nameAr: 'وسائل الاتصال', icon: PhoneCall, descriptionAr: 'الواتساب، الهاتف والقنوات الرسمية' },
  { id: 'location', nameAr: 'الموقع والفروع', icon: MapPin, descriptionAr: 'العناوين، روابط الخرائط والإحداثيات' },
  { id: 'policies', nameAr: 'السياسات والشروط', icon: FileText, descriptionAr: 'الإرجاع، التوصيل، الخصوصية والأحكام' },
  { id: 'digital', nameAr: 'الخدمات الرقمية', icon: Sparkles, descriptionAr: 'الخدمات الرقمية والاستشارية' },
  { id: 'notices', nameAr: 'الإعلانات والتنبيهات', icon: Bell, descriptionAr: 'التنبيهات المباشرة للعملاء' },
];

export interface PaymentMethodItem {
  id: string;
  methodType: string;
  displayName: string;
  accountDetails?: string;
  isActive: boolean;
  displayOrder: number;
}

export interface StoreContactItem {
  id: string;
  channelType: string;
  contactValue: string;
  isActive: boolean;
  displayOrder: number;
}

export interface BusinessHourItem {
  id: string;
  dayOfWeek: string;
  isClosed: boolean;
  is24Hours?: boolean;
  openingTime?: string;
  closingTime?: string;
  shifts?: string;
  timezone?: string;
  isActive?: boolean;
}

export interface DeliveryConfigItem {
  id: string;
  isEnabled: boolean;
  deliveryFee?: number;
  currency?: string;
  minimumOrderAmount?: number;
  estimatedDeliveryMinutes?: string | number;
  cashOnDeliveryEnabled?: boolean;
}

export interface DeliveryZoneItem {
  id: string;
  name: string;
  isActive: boolean;
  deliveryFee?: number;
  estimatedDeliveryMinutes?: string | number;
  displayOrder: number;
}

export interface StoreLocationItem {
  id: string;
  name?: string;
  address: string;
  googleMapsUrl?: string;
  latitude?: number;
  longitude?: number;
  isActive: boolean;
  displayOrder: number;
}

export interface StorePolicyItem {
  id: string;
  policyType: string;
  title: string;
  content: string;
  isActive: boolean;
  displayOrder: number;
}

export interface DigitalServiceItem {
  id: string;
  name: string;
  serviceType: string;
  description: string;
  isActive: boolean;
  displayOrder: number;
}

export interface StoreNoticeItem {
  id: string;
  title: string;
  content: string;
  isActive: boolean;
  displayOrder: number;
}

interface StoreSettingsAdminProps {
  onClose?: () => void;
}

export const StoreSettingsAdmin: React.FC<StoreSettingsAdminProps> = ({ onClose }) => {
  const [activeCategory, setActiveCategory] = useState('orders');
  const [isLoading, setIsLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);

  // Admin Order Center State
  const [adminOrders, setAdminOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);

  // CMD-094 Admin Order Operations State
  const [activeOrderTab, setActiveOrderTab] = useState<'active' | 'historical'>('active');
  const [orderSearchTerm, setOrderSearchTerm] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('ALL');
  const [catalogProducts, setCatalogProducts] = useState<any[]>([]);
  const [cancellationModalOrder, setCancellationModalOrder] = useState<any | null>(null);
  const [cancellationReasonInput, setCancellationReasonInput] = useState('');
  const [cancellationModalError, setCancellationModalError] = useState<string | null>(null);

  // Admin Notification Alert State (CMD-092)
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadNotifCount, setUnreadNotifCount] = useState<number>(0);

  const fetchCatalogProducts = async () => {
    try {
      const res = await fetch(`/api/admin/products?tenantId=${trustedContext.tenantId}&storeId=${trustedContext.storeId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.products)) {
          setCatalogProducts(data.products);
        }
      }
    } catch {
      // Non-blocking
    }
  };

  const resolveItemName = (item: any) => {
    if (item?.productNameSnapshot && item.productNameSnapshot.trim() && !item.productNameSnapshot.startsWith('prd-')) {
      return item.productNameSnapshot;
    }
    if (item?.productName && item.productName.trim() && !item.productName.startsWith('prd-')) {
      return item.productName;
    }
    const pid = item?.productId;
    if (pid) {
      const matched = catalogProducts.find((p: any) => p.id === pid);
      if (matched && matched.name) return matched.name;
      return `${pid} (غير متوفر بالفهرس)`;
    }
    return 'منتج غير محدد';
  };

  const fetchOrders = async (keepSelectedOrder = true) => {
    setOrdersLoading(true);
    setErrorStatus(null);
    try {
      const res = await fetch(`/api/admin/orders?tenantId=${trustedContext.tenantId}&storeId=${trustedContext.storeId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.orders)) {
          setAdminOrders(data.orders);
          if (keepSelectedOrder && selectedOrder) {
            const updated = data.orders.find((o: any) => o.id === selectedOrder.id);
            if (updated) {
              setSelectedOrder(updated);
            }
          }
        }
      } else {
        const errData = await res.json();
        setErrorStatus(errData.error || 'فشل في جلب الطلبات من Google Sheets');
      }
    } catch (err: any) {
      setErrorStatus(`خطأ اتصال: ${err.message}`);
    } finally {
      setOrdersLoading(false);
    }
  };

  const fetchNotifications = async () => {
    try {
      const res = await fetch(`/api/admin/notifications?tenantId=${trustedContext.tenantId}&storeId=${trustedContext.storeId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.notifications)) {
          setNotifications(data.notifications);
          setUnreadNotifCount(data.unreadCount || 0);
        }
      }
    } catch (err) {
      // Non-blocking background notification fetch failure
    }
  };

  const handleMarkNotificationRead = async (notifId: string, orderId?: string) => {
    try {
      const res = await fetch('/api/admin/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notificationId: notifId,
          orderId,
          tenantId: trustedContext.tenantId,
          storeId: trustedContext.storeId
        })
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => (n.id === notifId || n.orderId === orderId) ? { ...n, isRead: true } : n));
        setUnreadNotifCount(prev => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.warn('Failed to mark notification as read:', err);
    }
  };

  useEffect(() => {
    fetchOrders(true);
    fetchNotifications();
    fetchCatalogProducts();

    // CMD-092-FIX: Lightweight background check ONLY for notifications
    // NO automatic re-fetching of adminOrders list to avoid disrupting open modal / details view
    const interval = setInterval(() => {
      fetchNotifications();
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  const handleUpdateOrderStatus = async (orderId: string, newStatus: string, cancellationReason?: string) => {
    if (newStatus === 'CANCELLED' && !cancellationReason) {
      const targetOrder = adminOrders.find(o => o.id === orderId);
      if (targetOrder) {
        setCancellationModalOrder(targetOrder);
        setCancellationReasonInput('');
        setCancellationModalError(null);
      }
      return;
    }

    setUpdatingOrderId(orderId);
    setErrorStatus(null);
    setSaveStatus(null);
    try {
      const res = await fetch('/api/admin/orders/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          status: newStatus,
          tenantId: trustedContext.tenantId,
          storeId: trustedContext.storeId,
          cancellationReason: cancellationReason || undefined,
          cancelledBy: 'ADMIN',
          cancelledAt: new Date().toISOString()
        })
      });
      const data = await res.json();
      if (res.ok && data.success && data.order) {
        setSaveStatus(`تم تحديث حالة الطلب (${orderId}) إلى (${newStatus}) وتوثيقها في Google Sheets`);
        setAdminOrders(prev => prev.map(o => o.id === orderId ? data.order : o));
        if (selectedOrder?.id === orderId) {
          setSelectedOrder(data.order);
        }
      } else {
        setErrorStatus(data.error || `فشل تحديث حالة الطلب (${orderId})`);
      }
    } catch (err: any) {
      setErrorStatus(`خطأ في الاتصال أثناء تحديث الحالة: ${err.message}`);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleConfirmCancelOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellationModalOrder) return;
    if (!cancellationReasonInput.trim()) {
      setCancellationModalError('يرجى تحديد سبب الإلغاء قبل المتابعة.');
      return;
    }

    const targetId = cancellationModalOrder.id;
    const reason = cancellationReasonInput.trim();
    setCancellationModalOrder(null);
    await handleUpdateOrderStatus(targetId, 'CANCELLED', reason);
  };

  const handleUpdatePaymentStatus = async (orderId: string, newPaymentStatus: string) => {
    setUpdatingOrderId(orderId);
    setErrorStatus(null);
    setSaveStatus(null);
    try {
      const res = await fetch('/api/admin/orders/payment-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          paymentStatus: newPaymentStatus,
          tenantId: trustedContext.tenantId,
          storeId: trustedContext.storeId
        })
      });
      const data = await res.json();
      if (res.ok && data.success && data.order) {
        setSaveStatus(`تم تحديث حالة الدفع للطلب (${orderId}) إلى (${newPaymentStatus}) وتوثيقها في Google Sheets`);
        setAdminOrders(prev => prev.map(o => o.id === orderId ? data.order : o));
        if (selectedOrder?.id === orderId) {
          setSelectedOrder(data.order);
        }
      } else {
        setErrorStatus(data.error || `فشل تحديث حالة الدفع للطلب (${orderId})`);
      }
    } catch (err: any) {
      setErrorStatus(`خطأ في الاتصال أثناء تحديث حالة الدفع: ${err.message}`);
    } finally {
      setUpdatingOrderId(null);
    }
  };

  useEffect(() => {
    if (activeCategory === 'orders') {
      fetchOrders();
    }
  }, [activeCategory]);

  const [agentIdentityData, setAgentIdentityData] = useState({
    displayName: 'سناء',
    role: 'المساعد الذكي لخدمة العملاء',
    greeting: 'أهلًا بك 👋 أنا سناء من متجر الذيباني.\nماذا تبحث عنه اليوم؟ اترك الباقي لي.'
  });

  const [trustedContext] = useState({
    tenantId: 'tnt-41f0d530',
    tenantName: 'متجر الذيباني',
    storeId: 'str-2c6ad81f',
    storeName: 'بقالة الذيباني',
    agentId: 'agt-c93183d5'
  });

  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodItem[]>([
    { id: 'pm-001', methodType: 'bank_account', displayName: 'بنك الكريمي (حساب تجاري)', accountDetails: '3055981242', isActive: true, displayOrder: 1 },
    { id: 'pm-002', methodType: 'money_transfer', displayName: 'النجم للصرافة والتحويلات', accountDetails: 'اسم المستلم: متجر الذيباني', isActive: true, displayOrder: 2 },
    { id: 'pm-003', methodType: 'wallet', displayName: 'وان كاش', accountDetails: '770493341', isActive: true, displayOrder: 2 },
    { id: 'pm-004', methodType: 'wallet', displayName: 'جيب', accountDetails: '774780112', isActive: true, displayOrder: 3 },
    { id: 'pm-005', methodType: 'wallet', displayName: 'جوالي', accountDetails: '770493341', isActive: true, displayOrder: 4 },
    { id: 'pm-006', methodType: 'cash_on_delivery', displayName: 'الدفع كاش عند الاستلام', accountDetails: '', isActive: true, displayOrder: 5 }
  ]);

  const [storeContacts, setStoreContacts] = useState<StoreContactItem[]>([
    { id: 'cnt-001', channelType: 'whatsapp', contactValue: 'https://wa.me/967770493341', isActive: true, displayOrder: 1 },
    { id: 'cnt-002', channelType: 'phone', contactValue: 'tel:770493341', isActive: true, displayOrder: 2 }
  ]);

  const [businessHours, setBusinessHours] = useState<BusinessHourItem[]>([
    { id: 'bh-sat', dayOfWeek: 'SATURDAY', isClosed: false, is24Hours: false, openingTime: '08:00', closingTime: '23:00', timezone: 'Asia/Aden' },
    { id: 'bh-sun', dayOfWeek: 'SUNDAY', isClosed: false, is24Hours: false, openingTime: '08:00', closingTime: '23:00', timezone: 'Asia/Aden' },
    { id: 'bh-mon', dayOfWeek: 'MONDAY', isClosed: false, is24Hours: false, openingTime: '08:00', closingTime: '23:00', timezone: 'Asia/Aden' },
    { id: 'bh-tue', dayOfWeek: 'TUESDAY', isClosed: false, is24Hours: false, openingTime: '08:00', closingTime: '23:00', timezone: 'Asia/Aden' },
    { id: 'bh-wed', dayOfWeek: 'WEDNESDAY', isClosed: false, is24Hours: false, openingTime: '08:00', closingTime: '23:00', timezone: 'Asia/Aden' },
    { id: 'bh-thu', dayOfWeek: 'THURSDAY', isClosed: false, is24Hours: false, openingTime: '08:00', closingTime: '23:00', timezone: 'Asia/Aden' },
    { id: 'bh-fri', dayOfWeek: 'FRIDAY', isClosed: true, is24Hours: false, openingTime: '', closingTime: '', timezone: 'Asia/Aden' }
  ]);

  const [deliveryConfig, setDeliveryConfig] = useState<DeliveryConfigItem>({
    id: 'dc-001',
    isEnabled: true,
    deliveryFee: 1000,
    currency: 'YER',
    minimumOrderAmount: 2000,
    estimatedDeliveryMinutes: '30 - 60',
    cashOnDeliveryEnabled: true
  });

  const [deliveryZones, setDeliveryZones] = useState<DeliveryZoneItem[]>([
    { id: 'dz-001', name: 'وسط المدينة - صنعاء', isActive: true, deliveryFee: 1000, estimatedDeliveryMinutes: '30-45', displayOrder: 1 },
    { id: 'dz-002', name: 'حي حدة والأصبحي', isActive: true, deliveryFee: 1500, estimatedDeliveryMinutes: '45-60', displayOrder: 2 }
  ]);

  const [storeLocations, setStoreLocations] = useState<StoreLocationItem[]>([
    { id: 'loc-001', name: 'الفرع الرئيسي', address: 'صنعاء - شارع الزبيري - بجوار الجسر', googleMapsUrl: 'https://maps.google.com/?q=15.3522,44.2081', latitude: 15.3522, longitude: 44.2081, isActive: true, displayOrder: 1 }
  ]);

  const [storePolicies, setStorePolicies] = useState<StorePolicyItem[]>([
    { id: 'pol-001', policyType: 'RETURN', title: 'سياسة الاسترجاع والإبدال', content: 'يمكن استبدال المنتجات التالفة أو غير المطابقة خلال 24 ساعة من الاستلام.', isActive: true, displayOrder: 1 },
    { id: 'pol-002', policyType: 'DELIVERY', title: 'سياسة التوصيل والاستلام', content: 'يتم توصيل الطلبات داخل أمانة العاصمة عبر مناديب المتجر المعتمدين.', isActive: true, displayOrder: 2 }
  ]);

  const [digitalServices, setDigitalServices] = useState<DigitalServiceItem[]>([
    { id: 'ds-001', name: 'إنشاء متاجر إلكترونية للشركات', serviceType: 'STORE_BUILDING', description: 'تصميم وبناء متاجر متكاملة مع ربط المساعد الذكي لخدمة العملاء.', isActive: true, displayOrder: 1 }
  ]);

  const [storeNotices, setStoreNotices] = useState<StoreNoticeItem[]>([
    { id: 'not-001', title: 'عروض الموسم والخصومات', content: 'استمتع بتوصيل مجاني للطلبات فوق 10,000 ريال يمني.', isActive: true, displayOrder: 1 }
  ]);

  const fetchLiveSettings = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/owner-settings');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          if (data.paymentMethods && data.paymentMethods.length > 0) setPaymentMethods(data.paymentMethods);
          if (data.storeContacts && data.storeContacts.length > 0) setStoreContacts(data.storeContacts);
          if (data.businessHours && data.businessHours.length > 0) setBusinessHours(data.businessHours);
          if (data.deliveryConfiguration) setDeliveryConfig(data.deliveryConfiguration);
          if (data.deliveryZones && data.deliveryZones.length > 0) setDeliveryZones(data.deliveryZones);
          if (data.storeLocations && data.storeLocations.length > 0) setStoreLocations(data.storeLocations);
          if (data.storePolicies && data.storePolicies.length > 0) setStorePolicies(data.storePolicies);
          if (data.digitalServices && data.digitalServices.length > 0) setDigitalServices(data.digitalServices);
          if (data.storeNotices && data.storeNotices.length > 0) setStoreNotices(data.storeNotices);
        }
      }

      // Fetch Agent Identity
      const identityRes = await fetch('/api/agent-identity');
      if (identityRes.ok) {
        const identity = await identityRes.json();
        if (identity && identity.displayName) {
          setAgentIdentityData({
            displayName: identity.displayName,
            role: identity.role || 'المساعد الذكي لخدمة العملاء',
            greeting: identity.greeting || ''
          });
        }
      }
    } catch {
      console.warn('Could not fetch live settings, using local initial state.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveSettings();
  }, []);

  const handleSaveAgentIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setSaveStatus(null);
    setErrorStatus(null);

    try {
      const res = await fetch('/api/admin/agent-identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: agentIdentityData.displayName,
          role: agentIdentityData.role,
          greeting: agentIdentityData.greeting,
          tenantId: trustedContext.tenantId,
          storeId: trustedContext.storeId,
          agentId: trustedContext.agentId
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSaveStatus(`تم تحديث اسم المساعد إلى (${data.identity.displayName}) بنجاح (agentId: ${data.identity.agentId} ثابت)`);
      } else {
        setErrorStatus(data.error || 'فشلت عملية تحديث إعدادات هوية المساعد.');
      }
    } catch (err: any) {
      setErrorStatus(`خطأ في الاتصال: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateDomainItem = async (domain: string, id: string, payload: Record<string, any>) => {
    setIsLoading(true);
    setSaveStatus(null);
    setErrorStatus(null);

    try {
      const res = await fetch('/api/admin/owner-settings/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain, id, data: payload, ...payload })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSaveStatus(`تم تحديث وحفظ الإعدادات بنجاح في جدول (${domain})`);
        fetchLiveSettings();
      } else {
        setErrorStatus(data.message || `فشلت عملية التحديث في (${domain})`);
      }
    } catch (err: any) {
      setErrorStatus(`خطأ في الاتصال: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 rounded-xl overflow-hidden shadow-2xl border border-slate-800" dir="rtl">
      {/* Header Bar */}
      <header className="bg-slate-950 border-b border-slate-800 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-600/20 p-2 rounded-lg border border-emerald-500/30 text-emerald-400">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              لوحة التحكم والإعدادات التشغيلية لمالك المتجر
              <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono">
                CMD-047 IDENTITY & HARDENING
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              المتجر: {trustedContext.tenantName} ({trustedContext.tenantId}) - {trustedContext.storeName} ({trustedContext.storeId})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md text-xs">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Trusted Context Enforced</span>
          </div>

          <button
            onClick={fetchLiveSettings}
            disabled={isLoading}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-slate-700"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>تحديث الإعدادات</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      </header>

      {/* Status Notifications */}
      {saveStatus && (
        <div className="bg-emerald-950/80 border-b border-emerald-500/30 px-6 py-2.5 text-emerald-300 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{saveStatus}</span>
          </div>
          <span className="text-xs font-mono text-emerald-400/80">Owner Live Control</span>
        </div>
      )}

      {errorStatus && (
        <div className="bg-red-950/80 border-b border-red-500/30 px-6 py-2.5 text-red-300 text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorStatus}</span>
          </div>
        </div>
      )}

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Categories Sidebar */}
        <aside className="w-64 bg-slate-950 border-l border-slate-800 p-3 overflow-y-auto space-y-1 shrink-0">
          <p className="text-xs font-semibold text-slate-400 px-3 py-2 uppercase tracking-wider">أقسام التحكم للمالك</p>
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-right text-sm transition-all ${
                  isActive
                    ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 font-medium'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span className="truncate flex-1">{cat.nameAr}</span>
              </button>
            );
          })}
        </aside>

        {/* View Details Area */}
        <main className="flex-1 overflow-y-auto p-6 bg-slate-900 space-y-6">
          {/* Order Center (CMD-090) */}
          {activeCategory === 'orders' && (
            <section className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-950 border border-slate-800 p-4 rounded-xl">
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <ShoppingBag className="w-5 h-5 text-emerald-400" />
                    مركز إدارة الطلبات الحقيقية (Google Sheets Order Store)
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    مصدر البيانات: Google Sheets (جدول orders & order_items) | التكلفة التشغيلية: $0 | العزل التام للمتاجر مفعل
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchOrders}
                    disabled={ordersLoading}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors border border-emerald-500/30 shadow-lg"
                  >
                    <RefreshCw className={`w-4 h-4 ${ordersLoading ? 'animate-spin' : ''}`} />
                    <span>تحديث الطلبات من Google Sheets</span>
                  </button>
                </div>
              </div>

              {/* Admin Notification Alerts Section (CMD-092) */}
              <div className="bg-slate-950 border border-emerald-500/30 rounded-xl p-4 space-y-3 shadow-xl">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <Bell className="w-5 h-5 text-emerald-400 animate-pulse" />
                    <h4 className="text-md font-bold text-white">
                      🔔 تنبيهات الطلبات الجديدة (In-App Admin Alerts)
                    </h4>
                    {unreadNotifCount > 0 && (
                      <span className="bg-emerald-500 text-slate-950 px-2.5 py-0.5 rounded-full text-xs font-black animate-bounce font-mono">
                        {unreadNotifCount} طلبات جديدة غير مقروءة
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 font-mono">
                    آلية التحديث: Live Polling (0$ External Cost)
                  </span>
                </div>

                {notifications.length === 0 ? (
                  <p className="text-xs text-slate-400 py-2">لا توجد تنبيهات طلبات جديدة حالياً.</p>
                ) : (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {notifications.map((n) => {
                      const isUnread = !n.isRead;
                      const matchingOrder = adminOrders.find(o => o.id === n.orderId);

                      return (
                        <div
                          key={n.id}
                          onClick={() => {
                            handleMarkNotificationRead(n.id, n.orderId);
                            if (matchingOrder) {
                              setSelectedOrder(matchingOrder);
                            }
                          }}
                          className={`p-3 rounded-lg border transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                            isUnread
                              ? 'bg-emerald-950/30 border-emerald-500/50 hover:bg-emerald-900/40 text-white'
                              : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/60 text-slate-300'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-emerald-300">{n.title || `🔔 طلب جديد - ${n.orderId}`}</span>
                              {isUnread ? (
                                <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] px-2 py-0.5 rounded font-bold">
                                  UNREAD (غير مقروء)
                                </span>
                              ) : (
                                <span className="bg-slate-800 text-slate-400 text-[10px] px-2 py-0.5 rounded font-semibold">
                                  READ (تمت المراجعة)
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-300 line-clamp-2 whitespace-pre-line font-mono">
                              {n.content}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                            {isUnread && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMarkNotificationRead(n.id, n.orderId);
                                }}
                                className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1 rounded-md border border-slate-700 transition-colors"
                              >
                                تعليم كمقروء
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMarkNotificationRead(n.id, n.orderId);
                                if (matchingOrder) {
                                  setSelectedOrder(matchingOrder);
                                }
                              }}
                              className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1 rounded-md font-medium transition-colors"
                            >
                              عرض تفاصيل الطلب
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Summary Stats Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                <div className="bg-slate-950 border border-slate-800 p-3 rounded-xl text-center">
                  <span className="text-xs text-slate-400 block mb-1">إجمالي الطلبات</span>
                  <span className="text-lg font-bold text-white font-mono">{adminOrders.length}</span>
                </div>
                <div className="bg-slate-950 border border-yellow-500/30 p-3 rounded-xl text-center">
                  <span className="text-xs text-yellow-400 block mb-1">قيد الانتظار</span>
                  <span className="text-lg font-bold text-yellow-300 font-mono">
                    {adminOrders.filter(o => o.status === 'PENDING').length}
                  </span>
                </div>
                <div className="bg-slate-950 border border-blue-500/30 p-3 rounded-xl text-center">
                  <span className="text-xs text-blue-400 block mb-1">مؤكد</span>
                  <span className="text-lg font-bold text-blue-300 font-mono">
                    {adminOrders.filter(o => o.status === 'CONFIRMED').length}
                  </span>
                </div>
                <div className="bg-slate-950 border border-purple-500/30 p-3 rounded-xl text-center">
                  <span className="text-xs text-purple-400 block mb-1">قيد التجهيز</span>
                  <span className="text-lg font-bold text-purple-300 font-mono">
                    {adminOrders.filter(o => o.status === 'PREPARING').length}
                  </span>
                </div>
                <div className="bg-slate-950 border border-cyan-500/30 p-3 rounded-xl text-center">
                  <span className="text-xs text-cyan-400 block mb-1">جاهز / خرج للتوصيل</span>
                  <span className="text-lg font-bold text-cyan-300 font-mono">
                    {adminOrders.filter(o => o.status === 'READY_FOR_DELIVERY' || o.status === 'OUT_FOR_DELIVERY').length}
                  </span>
                </div>
                <div className="bg-slate-950 border border-emerald-500/30 p-3 rounded-xl text-center">
                  <span className="text-xs text-emerald-400 block mb-1">تم التوصيل</span>
                  <span className="text-lg font-bold text-emerald-300 font-mono">
                    {adminOrders.filter(o => o.status === 'DELIVERED').length}
                  </span>
                </div>
                <div className="bg-slate-950 border border-red-500/30 p-3 rounded-xl text-center">
                  <span className="text-xs text-red-400 block mb-1">ملغي</span>
                  <span className="text-lg font-bold text-red-300 font-mono">
                    {adminOrders.filter(o => o.status === 'CANCELLED').length}
                  </span>
                </div>
              </div>

              {/* CMD-094 Active vs Historical Tabs & Search/Filter Bar */}
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveOrderTab('active')}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                        activeOrderTab === 'active'
                          ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/30'
                          : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <ShoppingBag className="w-4 h-4" />
                      <span>الطلبات النشطة</span>
                      <span className="bg-slate-950/60 px-2 py-0.5 rounded text-[11px] font-mono">
                        {adminOrders.filter(o => ['PENDING', 'CONFIRMED', 'PREPARING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY'].includes(o.status)).length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveOrderTab('historical')}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                        activeOrderTab === 'historical'
                          ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/30'
                          : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <History className="w-4 h-4" />
                      <span>سجل الطلبات التاريخية</span>
                      <span className="bg-slate-950/60 px-2 py-0.5 rounded text-[11px] font-mono">
                        {adminOrders.filter(o => ['DELIVERED', 'CANCELLED'].includes(o.status)).length}
                      </span>
                    </button>
                  </div>

                  <div className="text-xs text-slate-400 font-mono">
                    عرض {adminOrders.filter((order) => {
                      const isActive = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY'].includes(order.status);
                      if (activeOrderTab === 'active' && !isActive) return false;
                      if (activeOrderTab === 'historical' && isActive) return false;
                      if (orderStatusFilter !== 'ALL' && order.status !== orderStatusFilter) return false;
                      if (orderSearchTerm.trim()) {
                        const q = orderSearchTerm.trim().toLowerCase();
                        const mId = (order.id || '').toLowerCase().includes(q);
                        const mName = (order.customerName || '').toLowerCase().includes(q);
                        const mPhone = (order.customerPhone || '').toLowerCase().includes(q);
                        if (!mId && !mName && !mPhone) return false;
                      }
                      return true;
                    }).length} من إجمالي {adminOrders.length} طلب
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 relative">
                    <Search className="w-4 h-4 absolute right-3 top-3 text-slate-500" />
                    <input
                      type="text"
                      value={orderSearchTerm}
                      onChange={(e) => setOrderSearchTerm(e.target.value)}
                      placeholder="بحث برقم الطلب (ORD-...)، اسم العميل، أو رقم الهاتف..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg pr-9 pl-3 py-2 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <select
                      value={orderStatusFilter}
                      onChange={(e) => setOrderStatusFilter(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="ALL">جميع الحالات التابعة للتبويب</option>
                      <option value="PENDING">PENDING - قيد الانتظار</option>
                      <option value="CONFIRMED">CONFIRMED - مؤكد</option>
                      <option value="PREPARING">PREPARING - قيد التجهيز</option>
                      <option value="READY_FOR_DELIVERY">READY_FOR_DELIVERY - جاهز للتوصيل</option>
                      <option value="OUT_FOR_DELIVERY">OUT_FOR_DELIVERY - خرج للتوصيل</option>
                      <option value="DELIVERED">DELIVERED - تم التوصيل</option>
                      <option value="CANCELLED">CANCELLED - ملغي</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Orders List */}
              {ordersLoading ? (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-12 text-center text-slate-400 space-y-3">
                  <RefreshCw className="w-8 h-8 animate-spin mx-auto text-emerald-400" />
                  <p>جارٍ تحميل الطلبات من Google Sheets...</p>
                </div>
              ) : adminOrders.length === 0 ? (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-12 text-center text-slate-400 space-y-3">
                  <ShoppingBag className="w-10 h-10 mx-auto text-slate-600" />
                  <p className="text-base font-semibold text-slate-300">لا يوجد طلبات مسجلة حالياً في Google Sheets</p>
                  <p className="text-xs text-slate-500">قم بتقديم طلب عبر نافذة المحادثة مع سناء ليتم توثيقه هنا تلقائياً.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {adminOrders
                    .filter((order) => {
                      const isActive = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY_FOR_DELIVERY', 'OUT_FOR_DELIVERY'].includes(order.status);
                      if (activeOrderTab === 'active' && !isActive) return false;
                      if (activeOrderTab === 'historical' && isActive) return false;
                      if (orderStatusFilter !== 'ALL' && order.status !== orderStatusFilter) return false;
                      if (orderSearchTerm.trim()) {
                        const q = orderSearchTerm.trim().toLowerCase();
                        const mId = (order.id || '').toLowerCase().includes(q);
                        const mName = (order.customerName || '').toLowerCase().includes(q);
                        const mPhone = (order.customerPhone || '').toLowerCase().includes(q);
                        if (!mId && !mName && !mPhone) return false;
                      }
                      return true;
                    })
                    .map((order) => {
                    const isUpdating = updatingOrderId === order.id;

                    // Color code status badge
                    const getStatusColor = (st: string) => {
                      switch (st) {
                        case 'PENDING': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
                        case 'CONFIRMED': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
                        case 'PREPARING': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
                        case 'READY_FOR_DELIVERY': return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30';
                        case 'OUT_FOR_DELIVERY': return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
                        case 'DELIVERED': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
                        case 'CANCELLED': return 'bg-red-500/20 text-red-400 border-red-500/30';
                        default: return 'bg-slate-800 text-slate-300 border-slate-700';
                      }
                    };

                    const getPaymentColor = (pst: string) => {
                      switch (pst) {
                        case 'PAID': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
                        case 'PENDING': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
                        case 'FAILED': return 'bg-red-500/20 text-red-400 border-red-500/30';
                        default: return 'bg-slate-800 text-slate-400 border-slate-700';
                      }
                    };

                    return (
                      <div key={order.id} className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4 hover:border-slate-700 transition-colors">
                        {/* Order Card Header */}
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                          <div className="flex items-center gap-3">
                            <span className="font-mono font-bold text-emerald-400 text-base">{order.id}</span>
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-slate-500" />
                              {order.createdAt ? new Date(order.createdAt).toLocaleString('ar-YE') : 'الآن'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className={`text-xs px-2.5 py-1 rounded-full font-bold border ${getPaymentColor(order.paymentStatus || 'UNPAID')}`}>
                              الدفع: {order.paymentStatus || 'UNPAID'}
                            </span>
                            <span className={`text-xs px-2.5 py-1 rounded-full font-bold border ${getStatusColor(order.status)}`}>
                              الحالة: {order.status}
                            </span>
                          </div>
                        </div>

                        {/* Customer & Address Details */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm bg-slate-900/60 p-3.5 rounded-lg border border-slate-800/60">
                          <div>
                            <span className="text-xs text-slate-400 block mb-1">العميل والاتصال:</span>
                            <p className="text-slate-200 font-semibold flex items-center gap-2">
                              <UserCheck className="w-4 h-4 text-emerald-400" />
                              {order.customerName || 'عميل المتجر'}
                              {order.customerPhone && (
                                <span className="text-xs text-emerald-300 font-mono dir-ltr">({order.customerPhone})</span>
                              )}
                            </p>
                            <p className="text-xs text-slate-400 mt-1">طريقة الدفع: <span className="text-slate-300 font-medium">{order.paymentMethodName || 'كاش عند الاستلام'}</span></p>
                          </div>

                          <div>
                            <span className="text-xs text-slate-400 block mb-1">عنوان التوصيل:</span>
                            <p className="text-slate-300 text-xs leading-relaxed">
                              {order.deliveryAddress || 'لم يحدد بعد'}
                            </p>
                          </div>
                        </div>

                        {/* Cancellation Reason Audit Block if Cancelled */}
                        {(order.status === 'CANCELLED' || order.cancellationReason) && (
                          <div className="bg-red-950/40 border border-red-500/30 p-3 rounded-lg text-xs space-y-1">
                            <p className="text-red-300 font-bold flex items-center gap-1.5">
                              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                              <span>سبب الإلغاء / الرفض:</span>
                              <span className="text-white font-medium">{order.cancellationReason || 'غير محدد'}</span>
                            </p>
                            <div className="flex items-center gap-4 text-slate-400 text-[11px] font-mono">
                              <span>بواسطة: {order.cancelledBy || 'ADMIN'}</span>
                              {order.cancelledAt && (
                                <span>التاريخ: {new Date(order.cancelledAt).toLocaleString('ar-YE')}</span>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Order Items Table */}
                        <div className="space-y-2">
                          <span className="text-xs font-semibold text-slate-400 block">عناصر الطلب ({order.items?.length || 0}):</span>
                          <div className="bg-slate-900 border border-slate-800/80 rounded-lg overflow-hidden">
                            <table className="w-full text-right text-xs">
                              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                                <tr>
                                  <th className="p-2.5">المنتج</th>
                                  <th className="p-2.5">الكمية</th>
                                  <th className="p-2.5">السعر الفردي</th>
                                  <th className="p-2.5">الإجمالي</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                                {order.items?.map((item: any, idx: number) => (
                                  <tr key={idx} className="hover:bg-slate-800/40">
                                    <td className="p-2.5 font-medium">{resolveItemName(item)}</td>
                                    <td className="p-2.5 font-mono">{item.quantity}</td>
                                    <td className="p-2.5 font-mono">{item.unitPriceSnapshot ?? item.unitPrice ?? 0} YER</td>
                                    <td className="p-2.5 font-mono text-emerald-400 font-bold">{item.totalPrice} YER</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Totals Summary */}
                        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 text-xs border-t border-slate-800/60">
                          <div className="flex items-center gap-4 font-mono text-slate-300">
                            <span>المجموع الفرعي: <strong className="text-white">{order.subtotal} YER</strong></span>
                            <span>التوصيل: <strong className="text-white">{order.deliveryFee} YER</strong></span>
                            <span className="text-sm text-emerald-400">الإجمالي النهائي: <strong className="text-emerald-400 font-bold">{order.totalAmount} YER</strong></span>
                          </div>

                          <button
                            onClick={() => setSelectedOrder(order)}
                            className="bg-slate-800 hover:bg-slate-700 text-emerald-400 px-3 py-1.5 rounded-lg border border-slate-700 font-semibold text-xs transition-colors flex items-center gap-1.5"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>فتح التفاصيل</span>
                          </button>
                        </div>

                        {/* Admin Action Controls (Status & Payment Updates) */}
                        <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-slate-800 bg-slate-900/80 p-3 rounded-lg">
                          {/* Order Status Selector */}
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-bold text-slate-300">تغيير حالة الطلب:</label>
                            <select
                              value={order.status}
                              disabled={isUpdating}
                              onChange={(e) => handleUpdateOrderStatus(order.id, e.target.value)}
                              className="bg-slate-950 border border-slate-700 text-slate-100 text-xs rounded-lg px-3 py-1.5 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                            >
                              <option value="PENDING">PENDING - قيد الانتظار</option>
                              <option value="CONFIRMED">CONFIRMED - تم التأكيد</option>
                              <option value="PREPARING">PREPARING - قيد التجهيز</option>
                              <option value="READY_FOR_DELIVERY">READY_FOR_DELIVERY - جاهز للتوصيل</option>
                              <option value="OUT_FOR_DELIVERY">OUT_FOR_DELIVERY - خرج للتوصيل</option>
                              <option value="DELIVERED">DELIVERED - تم التوصيل بنجاح</option>
                              <option value="CANCELLED">CANCELLED - إلغاء الطلب</option>
                            </select>
                          </div>

                          {/* Payment Status Selector */}
                          <div className="flex items-center gap-2">
                            <label className="text-xs font-bold text-slate-300">حالة الدفع:</label>
                            <select
                              value={order.paymentStatus || 'UNPAID'}
                              disabled={isUpdating}
                              onChange={(e) => handleUpdatePaymentStatus(order.id, e.target.value)}
                              className="bg-slate-950 border border-slate-700 text-slate-100 text-xs rounded-lg px-3 py-1.5 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
                            >
                              <option value="UNPAID">UNPAID - غير مدفوع</option>
                              <option value="PENDING">PENDING - قيد التحقق</option>
                              <option value="PAID">PAID - مدفوع</option>
                              <option value="FAILED">FAILED - فشل الدفع</option>
                            </select>

                            {isUpdating && (
                              <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Selected Order Detail Modal (CMD-092-FIX) */}
              {selectedOrder && (
                <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
                  <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full p-6 space-y-6 shadow-2xl relative max-h-[90vh] overflow-y-auto text-right dir-rtl">
                    {/* Modal Header */}
                    <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                      <div>
                        <h3 className="text-lg font-bold text-emerald-400 font-mono">تفاصيل الطلب: {selectedOrder.id}</h3>
                        <p className="text-xs text-slate-400 mt-1">تاريخ الإنشاء: {selectedOrder.createdAt ? new Date(selectedOrder.createdAt).toLocaleString('ar-YE') : 'غير محدد'}</p>
                      </div>
                      <button
                        onClick={() => setSelectedOrder(null)}
                        className="text-slate-400 hover:text-white bg-slate-800 p-2 rounded-lg transition-colors"
                      >
                        ✕
                      </button>
                    </div>

                    {/* Customer & Delivery Info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-slate-950 p-4 rounded-xl border border-slate-800">
                      <div>
                        <span className="text-slate-400 block mb-1 font-semibold">بيانات العميل:</span>
                        <p className="font-semibold text-slate-100 text-sm">{selectedOrder.customerName || 'عميل المتجر'}</p>
                        <p className="text-slate-300 mt-1 font-mono">الهاتف: {selectedOrder.customerPhone || 'غير محدد'}</p>
                        <p className="text-slate-400 mt-1">طريقة الدفع: <span className="text-slate-200">{selectedOrder.paymentMethodName || 'كاش عند الاستلام'}</span></p>
                      </div>
                      <div>
                        <span className="text-slate-400 block mb-1 font-semibold">عنوان التوصيل والحالة:</span>
                        <p className="text-slate-200 text-xs leading-relaxed">{selectedOrder.deliveryAddress || 'لم يحدد بعد'}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">حالة الطلب: {selectedOrder.status}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">الدفع: {selectedOrder.paymentStatus || 'UNPAID'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Cancellation Audit Block in Modal if Cancelled */}
                    {(selectedOrder.status === 'CANCELLED' || selectedOrder.cancellationReason) && (
                      <div className="bg-red-950/40 border border-red-500/30 p-3.5 rounded-xl text-xs space-y-1.5">
                        <p className="text-red-300 font-bold flex items-center gap-1.5">
                          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                          <span>سبب الإلغاء / الرفض:</span>
                          <span className="text-white font-medium">{selectedOrder.cancellationReason || 'غير محدد'}</span>
                        </p>
                        <div className="flex items-center gap-4 text-slate-400 text-[11px] font-mono">
                          <span>تم بواسطة: {selectedOrder.cancelledBy || 'ADMIN'}</span>
                          {selectedOrder.cancelledAt && (
                            <span>التاريخ: {new Date(selectedOrder.cancelledAt).toLocaleString('ar-YE')}</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Items List */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">الأصناف المطلوبة ({selectedOrder.items?.length || 0}):</h4>
                      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden divide-y divide-slate-800/80">
                        {selectedOrder.items?.map((item: any, idx: number) => {
                          const itemName = resolveItemName(item);
                          const unitPrice = item.unitPriceSnapshot ?? item.unitPrice ?? 0;
                          const qty = item.quantity ?? 1;
                          const total = item.totalPrice ?? (unitPrice * qty);

                          return (
                            <div key={idx} className="p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-900/50">
                              <div>
                                <p className="font-bold text-slate-100 text-sm">{itemName}</p>
                                <p className="text-[11px] text-slate-400 mt-0.5">رمز المنتج (ID): <span className="font-mono text-slate-300">{item.productId}</span></p>
                              </div>
                              <div className="flex items-center gap-4 text-right sm:text-left font-mono">
                                <div>
                                  <span className="text-[10px] text-slate-400 block">الكمية</span>
                                  <span className="text-slate-200 font-bold">{qty}</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block">سعر الوحدة</span>
                                  <span className="text-slate-300">{unitPrice} YER</span>
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-400 block">الإجمالي</span>
                                  <span className="text-emerald-400 font-bold">{total} YER</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Totals Summary */}
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs font-mono">
                      <div className="flex justify-between text-slate-300">
                        <span>المجموع الفرعي (Subtotal):</span>
                        <span>{selectedOrder.subtotal} YER</span>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span>رسوم التوصيل (Delivery Fee):</span>
                        <span>{selectedOrder.deliveryFee} YER</span>
                      </div>
                      <div className="flex justify-between text-sm font-bold text-emerald-400 border-t border-slate-800 pt-2 mt-1">
                        <span>الإجمالي النهائي (Total Amount):</span>
                        <span>{selectedOrder.totalAmount} YER</span>
                      </div>
                    </div>

                    {/* Modal Controls */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-slate-300">تحديث حالة الطلب:</label>
                        <select
                          value={selectedOrder.status}
                          disabled={updatingOrderId === selectedOrder.id}
                          onChange={(e) => handleUpdateOrderStatus(selectedOrder.id, e.target.value)}
                          className="bg-slate-950 border border-slate-700 text-slate-100 text-xs rounded-lg px-3 py-1.5 focus:border-emerald-500 focus:outline-none"
                        >
                          <option value="PENDING">PENDING - قيد الانتظار</option>
                          <option value="CONFIRMED">CONFIRMED - تم التأكيد</option>
                          <option value="PREPARING">PREPARING - قيد التجهيز</option>
                          <option value="READY_FOR_DELIVERY">READY_FOR_DELIVERY - جاهز للتوصيل</option>
                          <option value="OUT_FOR_DELIVERY">OUT_FOR_DELIVERY - خرج للتوصيل</option>
                          <option value="DELIVERED">DELIVERED - تم التوصيل بنجاح</option>
                          <option value="CANCELLED">CANCELLED - إلغاء الطلب</option>
                        </select>
                      </div>

                      <button
                        onClick={() => setSelectedOrder(null)}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-xs font-semibold transition-colors"
                      >
                        إغلاق التفاصيل
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* CMD-094 Cancellation Reason Modal */}
              {cancellationModalOrder && (
                <div className="fixed inset-0 z-[60] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
                  <div className="bg-slate-900 border border-red-500/40 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative text-right dir-rtl">
                    <h3 className="text-base font-bold text-red-400 flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                      <span>إلغاء الطلب: {cancellationModalOrder.id}</span>
                    </h3>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      يرجى تحديد سبب أو مبرر إلغاء الطلب ليتم توثيقه وحفظه في سجلات المتجر وGoogle Sheets.
                    </p>

                    {cancellationModalError && (
                      <p className="text-xs text-red-400 bg-red-950/50 p-2 rounded border border-red-800">
                        {cancellationModalError}
                      </p>
                    )}

                    <form onSubmit={handleConfirmCancelOrder} className="space-y-4">
                      <div>
                        <label className="text-xs font-bold text-slate-200 block mb-1">سبب الإلغاء / الرفض *</label>
                        <textarea
                          rows={3}
                          value={cancellationReasonInput}
                          onChange={(e) => setCancellationReasonInput(e.target.value)}
                          placeholder="مثال: عدم توفر المنتج في المخزن الرئيسي / بناءً على طلب العميل / العنوان غير واضح"
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
                        />
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setCancellationModalOrder(null)}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3.5 py-1.5 rounded-lg text-xs transition-colors"
                        >
                          تراجع
                        </button>
                        <button
                          type="submit"
                          className="bg-red-600 hover:bg-red-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-colors"
                        >
                          تأكيد إلغاء الطلب
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Identity */}
          {activeCategory === 'identity' && (
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Store className="w-5 h-5 text-emerald-400" />
                هوية المتجر والمعلومات الأساسية
              </h3>
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">اسم المتجر الرسمي</label>
                    <input readOnly value={trustedContext.storeName} className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-200" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">اسم المؤسسة/المستأجر</label>
                    <input readOnly value={trustedContext.tenantName} className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-200" />
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Agent Identity & Config */}
          {activeCategory === 'haneen' && (
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Bot className="w-5 h-5 text-emerald-400" />
                إعدادات هوية المساعد الذكي (Agent Identity Configuration)
              </h3>
              <form onSubmit={handleSaveAgentIdentity} className="bg-slate-950 border border-slate-800 p-5 rounded-xl space-y-4 text-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">الاسم الظاهر للمساعد (Display Name) *</label>
                    <input
                      type="text"
                      required
                      value={agentIdentityData.displayName}
                      onChange={(e) => setAgentIdentityData({ ...agentIdentityData, displayName: e.target.value })}
                      placeholder="سناء"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-emerald-500 font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">معرّف المساعد الداخلي الثابت (agentId)</label>
                    <input
                      readOnly
                      value={trustedContext.agentId}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-400 font-mono text-xs cursor-not-allowed"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">الدور الوظيفي (Role)</label>
                  <input
                    type="text"
                    value={agentIdentityData.role}
                    onChange={(e) => setAgentIdentityData({ ...agentIdentityData, role: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs text-slate-400 block mb-1">رسالة الترحيب الأولى (Greeting Message)</label>
                  <textarea
                    rows={3}
                    value={agentIdentityData.greeting}
                    onChange={(e) => setAgentIdentityData({ ...agentIdentityData, greeting: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-emerald-500 text-xs leading-relaxed"
                  />
                </div>

                <div className="pt-2 flex items-center justify-between border-t border-slate-800">
                  <p className="text-xs text-slate-400">
                    تغيير اسم المساعد مقتصر على الواجهة والرسائل الظاهرة (Display Identity)، مع الحفاظ الصارم على معرّف `agentId` وعدم الكتابة في شيتات جوجل.
                  </p>
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0"
                  >
                    <Save className="w-4 h-4" />
                    حفظ هوية المساعد
                  </button>
                </div>
              </form>
            </section>
          )}

          {/* Currency */}
          {activeCategory === 'currency' && (
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Coins className="w-5 h-5 text-emerald-400" />
                إعدادات العملة الأساسية (Currency)
              </h3>
              <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl space-y-2 text-sm">
                <p className="text-slate-300">العملة الأساسية للمتجر: <span className="font-bold text-emerald-400">YER (الريال اليمني)</span></p>
                <p className="text-xs text-slate-400">يتم إظهار جميع الأسعار بالريال اليمني دون إجراء أي تحويلات تلقائية أو استخدام أسعار صرف وهمية.</p>
              </div>
            </section>
          )}

          {/* Business Hours */}
          {activeCategory === 'hours' && (
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-400" />
                إدارة ساعات العمل (Business Hours)
              </h3>
              <p className="text-xs text-slate-400">إدارة وضع 24/7، الأيام المغلقة، وفترات الفتح والإغلاق لكل يوم بشكل مستقل.</p>

              <div className="space-y-3">
                {businessHours.map((bh) => (
                  <div key={bh.id} className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white">{bh.dayOfWeek}</span>
                      <p className="text-xs text-slate-400 mt-1">
                        {bh.is24Hours
                          ? 'مفتوح 24/7'
                          : bh.isClosed
                          ? 'مغلق طوال اليوم'
                          : `من ${bh.openingTime || '08:00'} إلى ${bh.closingTime || '23:00'}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleUpdateDomainItem('business_hours', bh.id, { is24Hours: !bh.is24Hours, isClosed: false })}
                        className={`px-3 py-1.5 rounded text-xs font-bold border ${
                          bh.is24Hours ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-900 text-slate-400 border-slate-800'
                        }`}
                      >
                        24/7
                      </button>

                      <button
                        onClick={() => handleUpdateDomainItem('business_hours', bh.id, { isClosed: !bh.isClosed, is24Hours: false })}
                        className={`px-3 py-1.5 rounded text-xs font-bold border ${
                          bh.isClosed ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        }`}
                      >
                        {bh.isClosed ? 'مغلق' : 'مفتوح'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Delivery Configuration */}
          {activeCategory === 'delivery' && (
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Truck className="w-5 h-5 text-emerald-400" />
                إعدادات التوصيل والشحن
              </h3>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <div>
                    <span className="font-bold text-white">خدمة التوصيل للمنازل</span>
                    <p className="text-xs text-slate-400 mt-0.5">تفعيل أو إيقاف استلام طلبات التوصيل</p>
                  </div>
                  <button
                    onClick={() => handleUpdateDomainItem('delivery_configuration', deliveryConfig.id, { isEnabled: !deliveryConfig.isEnabled })}
                    className={`px-4 py-2 rounded-lg text-xs font-bold border ${
                      deliveryConfig.isEnabled ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-900 text-slate-400 border-slate-800'
                    }`}
                  >
                    {deliveryConfig.isEnabled ? 'مفعل' : 'معطل'}
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="text-slate-400 block mb-1">رسوم التوصيل الثابتة (YER)</label>
                    <input
                      type="number"
                      value={deliveryConfig.deliveryFee || 1000}
                      onChange={(e) => setDeliveryConfig({ ...deliveryConfig, deliveryFee: Number(e.target.value) })}
                      onBlur={() => handleUpdateDomainItem('delivery_configuration', deliveryConfig.id, { deliveryFee: deliveryConfig.deliveryFee })}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 block mb-1">الحد الأدنى للطلب (YER)</label>
                    <input
                      type="number"
                      value={deliveryConfig.minimumOrderAmount || 2000}
                      onChange={(e) => setDeliveryConfig({ ...deliveryConfig, minimumOrderAmount: Number(e.target.value) })}
                      onBlur={() => handleUpdateDomainItem('delivery_configuration', deliveryConfig.id, { minimumOrderAmount: deliveryConfig.minimumOrderAmount })}
                      className="w-full bg-slate-900 border border-slate-800 rounded px-3 py-2 text-slate-200"
                    />
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Payment Methods */}
          {activeCategory === 'payment' && (
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-400" />
                طرق الحسابات والدفع المفعلة
              </h3>

              <div className="space-y-3">
                {paymentMethods.map((pm) => (
                  <div key={pm.id} className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white">{pm.displayName}</span>
                      {pm.accountDetails && <p className="text-xs text-slate-400 mt-1">{pm.accountDetails}</p>}
                    </div>

                    <button
                      onClick={() => handleUpdateDomainItem('payment_methods', pm.id, { isActive: !pm.isActive })}
                      className={`px-4 py-2 rounded-lg text-xs font-bold border ${
                        pm.isActive ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-900 text-slate-400 border-slate-800'
                      }`}
                    >
                      {pm.isActive ? 'مفعل' : 'معطل'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Store Contacts */}
          {activeCategory === 'contact' && (
            <section className="space-y-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <PhoneCall className="w-5 h-5 text-emerald-400" />
                قنوات الاتصال والتواصل
              </h3>

              <div className="space-y-3">
                {storeContacts.map((sc) => (
                  <div key={sc.id} className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white uppercase">{sc.channelType}</span>
                      <p className="text-xs text-slate-400 mt-1">{sc.contactValue}</p>
                    </div>

                    <button
                      onClick={() => handleUpdateDomainItem('store_contacts', sc.id, { isActive: !sc.isActive })}
                      className={`px-4 py-2 rounded-lg text-xs font-bold border ${
                        sc.isActive ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-900 text-slate-400 border-slate-800'
                      }`}
                    >
                      {sc.isActive ? 'مفعل' : 'معطل'}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
};
