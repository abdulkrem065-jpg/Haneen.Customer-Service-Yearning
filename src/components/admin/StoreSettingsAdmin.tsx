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
  Save
} from 'lucide-react';

interface SettingCategory {
  id: string;
  nameAr: string;
  icon: React.ElementType;
  descriptionAr: string;
}

const CATEGORIES: SettingCategory[] = [
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
  const [activeCategory, setActiveCategory] = useState('haneen');
  const [isLoading, setIsLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);

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
