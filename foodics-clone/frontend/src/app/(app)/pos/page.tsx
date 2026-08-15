'use client';
import { useEffect, useState, useMemo } from 'react';
import { api, formatSAR } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { useCart, cartLineKey, CartItem } from '@/store/cart';
import ProductPickerModal, { Variant, ModifierGroup, SelectedModifier } from '@/components/ProductPickerModal';
import SplitPaymentModal, { PaymentLine, PaymentMethod } from '@/components/SplitPaymentModal';
import RefundModal from '@/components/RefundModal';
import { toast } from '@/components/Toast';
import { ProductImage } from '@/components/ProductImage';
import { Search, Plus, Minus, Trash2, ShoppingCart, X, Check, CreditCard, Banknote, Smartphone, User, Phone, MapPin, ChefHat, RefreshCw, Receipt, FileText, Store, FileText as FileIcon, Bike, Utensils, Layers, Pause, Play, Clock, Trash, Edit3, Edit2, Save, Undo2, History, Printer } from 'lucide-react';
import { clsx } from 'clsx';

export default function POSPage() {
  const { user, token, _hydrated } = useAuth();
  const cart = useCart();
  const [categories, setCategories] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [tables, setTables] = useState<any[]>([]);
  const [deliveryOptions, setDeliveryOptions] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState('all');
  const [showTable, setShowTable] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<any>(null);
  const [showOrderDetails, setShowOrderDetails] = useState<any>(null);
  const [showDelivery, setShowDelivery] = useState(false);
  const [pickerProduct, setPickerProduct] = useState<any | null>(null);
  const [showCartPanel, setShowCartPanel] = useState(true);
  const [showSplitPay, setShowSplitPay] = useState(false);
  const [heldOrders, setHeldOrders] = useState<any[]>([]);
  const [showHeld, setShowHeld] = useState(false);
  const [editingHeld, setEditingHeld] = useState<any | null>(null);
  const [refundOrder, setRefundOrder] = useState<any | null>(null);
  const [showOrderLookup, setShowOrderLookup] = useState(false);
  // F-A: editing a paid order (price correction) — modal state
  const [editingPaidOrder, setEditingPaidOrder] = useState<any | null>(null);
  // P1.3: when discount > 20% and user is a cashier, we collect a manager PIN before pay
  const [discountManagerPin, setDiscountManagerPin] = useState('');
  const [pendingPayment, setPendingPayment] = useState<{ method?: PaymentMethod; lines?: PaymentLine[]; tip?: number } | null>(null);

  useEffect(() => {
    if (!_hydrated || !token) return;
    loadData();
    loadHeld();
    const i = setInterval(() => { loadData(); loadHeld(); }, 15000);
    return () => clearInterval(i);
  }, [token, _hydrated]);

  // F-K: keyboard shortcuts. We only attach the listener when there's no modal
  // open (so typing in an input doesn't accidentally pay).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if the user is typing in an input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      // Skip if a modal is open
      if (completedOrder || refundOrder !== null || showOrderLookup || showHeld || showTable || showDelivery || showSplitPay || editingHeld || pickerProduct || pendingPayment) return;

      // F1 = help (for now: open the order lookup)
      if (e.key === 'F1') { e.preventDefault(); setShowOrderLookup(true); return; }
      // F2 = focus search
      if (e.key === 'F2') { e.preventDefault(); (document.querySelector('input[placeholder*=\"ابحث عن منتج\"]') as HTMLInputElement)?.focus(); return; }
      // F4 = show held orders
      if (e.key === 'F4') { e.preventDefault(); setShowHeld(true); return; }
      // F8 = cash
      if (e.key === 'F8' && cart.items.length > 0) { e.preventDefault(); onPayClick('CASH'); return; }
      // F9 = card
      if (e.key === 'F9' && cart.items.length > 0) { e.preventDefault(); onPayClick('CARD'); return; }
      // F10 = instapay
      if (e.key === 'F10' && cart.items.length > 0) { e.preventDefault(); onPayClick('INSTAPAY'); return; }
      // Escape = clear cart if there are items
      if (e.key === 'Escape' && cart.items.length > 0) {
        if (confirm('إفراغ السلة؟')) cart.clear();
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [cart, completedOrder, refundOrder, showOrderLookup, showHeld, showTable, showDelivery, showSplitPay, editingHeld, pickerProduct, pendingPayment, user?.role]);

  const loadData = async () => {
    const [c, p, t, d] = await Promise.all([
      api.get('/categories'), api.get('/products'),
      api.get('/tables'), api.get('/delivery-options'),
    ]);
    setCategories(c.data.categories);
    setProducts(p.data.products);
    setTables(t.data.tables);
    setDeliveryOptions(d.data.options);
  };

  const loadHeld = async () => {
    try {
      const r = await api.get('/orders?status=HELD&limit=50');
      setHeldOrders(r.data.orders || []);
    } catch {}
  };

  /**
   * Suspend the current cart as a HELD order on the server.
   * - The order is saved but does NOT go to the kitchen and does NOT deduct stock.
   * - Customer/table validation is relaxed (a quick pause-and-resume shouldn't fail).
   */
  const holdCurrentOrder = async () => {
    if (cart.items.length === 0) return;
    if (cart.currentOrderId) { toast.warning('الأوردر ده معلق بالفعل — استخدم استئناف'); return; }
    setSubmitting(true);
    try {
      const payload = {
        type: cart.type,
        customerName: cart.customerName,
        customerPhone: cart.customerPhone,
        customerAddress: cart.customerAddress,
        notes: cart.notes,
        tableId: cart.tableId,
        branchId: user?.branchId,
        discount: cart.discount,
        deliveryOptionIds: cart.selectedDeliveryOptions,
        customDeliveryFees: cart.customDeliveryFeesPayload(deliveryOptions as any),
        hold: true,
        items: cart.items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: i.quantity,
          notes: i.notes,
          modifiers: (i.modifiers || []).map((m) => ({ optionId: m.optionId })),
        })),
      };
      await api.post('/orders', payload);
      cart.clear();
      await loadHeld();
      toast.success('تم تعليق الأوردر', 'تلاقيه في قائمة المعلق');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'فشل تعليق الأوردر');
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Resume a HELD order: server converts it to PENDING (sends to kitchen,
   * deducts inventory). Frontend loads the items into the cart and remembers
   * the order id so the next pay call hits /orders/:id/pay instead of /orders.
   */
  const resumeHeld = async (id: string) => {
    setSubmitting(true);
    try {
      // 1. Resume on server (HELD → PENDING, deduct inventory)
      const r = await api.post(`/orders/${id}/resume`);
      const order = r.data.order;
      // 2. Load items into the cart
      const items = (order.items || []).map((it: any) => ({
        productId: it.productId,
        name: it.product?.nameAr || it.product?.name || 'صنف',
        image: it.product?.image || '🍽️',
        price: it.price,
        quantity: it.quantity,
        notes: it.notes || undefined,
        variantId: it.variantId || undefined,
        variantLabel: it.variantLabel || undefined,
        modifiers: (it.modifiers || []).map((m: any) => ({
          optionId: m.optionId,
          groupId: m.groupId,
          groupName: m.groupName,
          optionLabel: m.optionLabel,
          priceDelta: m.priceDelta,
        })),
      }));
      cart.setAll({
        items,
        type: order.type,
        customerName: order.customerName || undefined,
        customerPhone: order.customerPhone || undefined,
        customerAddress: order.customerAddress || undefined,
        notes: order.notes || undefined,
        tableId: order.tableId || undefined,
        tableNumber: order.table?.number ? String(order.table.number) : undefined,
        discount: order.discount || 0,
        // Preserve any custom delivery fees from the held order
        customDeliveryFees: (() => {
          const map: Record<string, number> = {};
          for (const d of (order.deliveryOptions || [])) {
            if (d.fee != null) map[d.deliveryOptionId] = Number(d.fee);
          }
          return map;
        })(),
        currentOrderId: order.id,
        currentOrderNumber: order.orderNumber,
      });
      await loadHeld();
      setShowHeld(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'فشل استئناف الأوردر');
    } finally {
      setSubmitting(false);
    }
  };

  const discardHeld = async (id: string, num: string) => {
    if (!confirm(`حذف الأوردر المعلق #${num}؟`)) return;
    try {
      await api.delete(`/orders/${id}/hold`);
      await loadHeld();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'فشل الحذف');
    }
  };

  /**
   * Save edits to a HELD order. The order keeps its number (assigned at hold time)
   * and stays HELD — inventory is not touched yet; it's only deducted on resume.
   */
  const saveHeldEdit = async (heldId: string, items: any[], type: string, customer: any) => {
    try {
      const payload = {
        type,
        customerName: customer.name,
        customerPhone: customer.phone,
        customerAddress: customer.address,
        items: items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: i.quantity,
          notes: i.notes,
          modifiers: (i.modifiers || []).map((m: any) => ({ optionId: m.optionId })),
        })),
      };
      const r = await api.put(`/orders/${heldId}`, payload);
      await loadHeld();
      // If we just edited the order whose number matches the one shown in the held panel, refresh
      return r.data.order;
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'فشل حفظ التعديل');
      throw err;
    }
  };

  const filtered = useMemo(() => {
    let list = products;
    if (activeCat !== 'all') list = list.filter((p) => p.categoryId === activeCat);
    if (search) {
      const q = search.toLowerCase();
      // F-B: barcode search — if the user types something that looks like a barcode
      // (mostly digits, or matches a product's barcode exactly), we add it to the
      // cart instead of filtering. The bar code scanners send a string with an
      // Enter key at the end.
      if (/^\d{6,}$/.test(search)) {
        const exact = products.find((p) => p.barcode === search);
        if (exact) {
          // Auto-add and reset
          setTimeout(() => {
            onProductClick(exact);
            setSearch('');
          }, 50);
          return products; // show full list while scanner works
        }
      }
      list = list.filter((p) => (p.name || '').toLowerCase().includes(q) || (p.nameAr || '').toLowerCase().includes(q));
    }
    return list;
  }, [products, activeCat, search]);

  // F-D: hide products that are temporarily out of stock (outOfStockUntil > now)
  const visibleProducts = useMemo(() => {
    const now = Date.now();
    return filtered.filter((p) => !p.outOfStockUntil || new Date(p.outOfStockUntil).getTime() <= now);
  }, [filtered]);

  const productHasOptions = (p: any) => (p.variants && p.variants.length > 0) || (p.modifierGroups && p.modifierGroups.length > 0);

  const onProductClick = (p: any) => {
    if (productHasOptions(p)) {
      setPickerProduct(p);
    } else {
      cart.addItem({ productId: p.id, name: p.nameAr || p.name, price: p.price, image: p.image });
    }
  };

  const onPickerAdd = (sel: { productId: string; variantId?: string; variantLabel?: string; modifiers: SelectedModifier[]; finalPrice: number; quantity: number }) => {
    const p = products.find((x) => x.id === sel.productId);
    if (!p) return;
    cart.addItem({
      productId: sel.productId,
      name: p.nameAr || p.name,
      price: sel.finalPrice,
      image: p.image,
      variantId: sel.variantId,
      variantLabel: sel.variantLabel,
      modifiers: sel.modifiers,
    }, sel.quantity);
    setPickerProduct(null);
  };

  // P1.3: if a cashier applies a discount > 20% they need a manager PIN.
  // Computed each render so the cart total updates live as items change.
  const subtotal = cart.subtotal();
  const discountPct = subtotal > 0 ? (cart.discount / subtotal) * 100 : 0;
  const discountNeedsManager = user?.role === 'CASHIER' && discountPct > 20;

  // P1.3: gate the actual pay calls. If discount needs manager, we hold the user's
  // click and pop a PIN modal; on submit we retry with the PIN in the payload.
  const placeOrder = async (payMethod?: PaymentMethod, managerPin?: string) => {
    if (cart.items.length === 0) return;
    if (cart.type === 'DINE_IN' && !cart.tableId) { setShowTable(true); return; }
    if (cart.type === 'DELIVERY' && (!cart.customerName || !cart.customerPhone || !cart.customerAddress)) {
      toast.warning('بيانات العميل ناقصة للتوصيل', 'برجاء إدخال اسم العميل ورقم الهاتف والعنوان');
      return;
    }
    setSubmitting(true);
    try {
      let orderId = cart.currentOrderId;
      if (!orderId) {
        const payload: any = {
          type: cart.type,
          customerName: cart.customerName,
          customerPhone: cart.customerPhone,
          customerAddress: cart.customerAddress,
          notes: cart.notes,
          tableId: cart.tableId,
          branchId: user?.branchId,
          discount: cart.discount,
          deliveryOptionIds: cart.selectedDeliveryOptions,
          customDeliveryFees: cart.customDeliveryFeesPayload(deliveryOptions as any),
          items: cart.items.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            quantity: i.quantity,
            notes: i.notes,
            modifiers: (i.modifiers || []).map((m) => ({ optionId: m.optionId })),
          })),
        };
        if (managerPin) payload.managerPin = managerPin;
        const { data } = await api.post('/orders', payload);
        orderId = data.order.id;
        if (payMethod) {
          const paid = await api.post(`/orders/${orderId}/pay`, { paymentMethod: payMethod, tip: 0 });
          setCompletedOrder(paid.data.order);
        } else {
          setCompletedOrder(data.order);
        }
      } else {
        // Resumed order — pay on the existing id
        const paid = await api.post(`/orders/${orderId}/pay`, { paymentMethod: payMethod, tip: 0 });
        setCompletedOrder(paid.data.order);
      }
      cart.clear();
      await loadData();
    } catch (err: any) {
      // 403 with requiresManager → pop the PIN modal
      if (err?.response?.status === 403 && err?.response?.data?.requiresManager) {
        setPendingPayment({ method: payMethod });
        return;
      }
      toast.error(err?.response?.data?.error || 'فشل إرسال الأوردر');
    } finally {
      setSubmitting(false);
    }
  };

  /** Place order + pay with multiple methods (split). Returns the order on success. */
  const placeOrderSplit = async (lines: PaymentLine[], tip: number, managerPin?: string): Promise<void> => {
    if (cart.items.length === 0) throw new Error('السلة فارغة');
    if (cart.type === 'DINE_IN' && !cart.tableId) { setShowTable(true); throw new Error('اختار طاولة'); }
    if (cart.type === 'DELIVERY' && (!cart.customerName || !cart.customerPhone || !cart.customerAddress)) {
      throw new Error('بيانات العميل ناقصة للتوصيل');
    }
    setSubmitting(true);
    try {
      let orderId = cart.currentOrderId;
      if (!orderId) {
        const payload: any = {
          type: cart.type,
          customerName: cart.customerName,
          customerPhone: cart.customerPhone,
          customerAddress: cart.customerAddress,
          notes: cart.notes,
          tableId: cart.tableId,
          branchId: user?.branchId,
          discount: cart.discount,
          deliveryOptionIds: cart.selectedDeliveryOptions,
          customDeliveryFees: cart.customDeliveryFeesPayload(deliveryOptions as any),
          items: cart.items.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            quantity: i.quantity,
            notes: i.notes,
            modifiers: (i.modifiers || []).map((m) => ({ optionId: m.optionId })),
          })),
        };
        if (managerPin) payload.managerPin = managerPin;
        const { data } = await api.post('/orders', payload);
        orderId = data.order.id;
      }
      // F-E: pass `tip` to the first line (so we only record one tip entry per order).
      // Putting it on the first line is consistent with how the SplitPaymentModal UI works
      // (one tip field, attached to the order total).
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        const lineTip = i === 0 ? tip : 0;
        const r = await api.post(`/orders/${orderId}/payments`, { method: l.method, amount: l.amount, tip: lineTip });
        if (r.data?.order) setCompletedOrder(r.data.order);
      }
      cart.clear();
      setShowSplitPay(false);
      await loadData();
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Public entry point used by the pay buttons. Checks the discount gate first;
   * if it needs a manager PIN, holds the click in `pendingPayment` and pops the modal.
   * After the modal submits, the actual pay call runs with the managerPin in payload.
   */
  const onPayClick = (payMethod?: PaymentMethod) => {
    if (discountNeedsManager && !discountManagerPin) {
      setPendingPayment({ method: payMethod });
      return;
    }
    return placeOrder(payMethod, discountNeedsManager ? discountManagerPin : undefined);
  };

  const onSplitPaySubmit = (lines: PaymentLine[], tip: number) => {
    if (discountNeedsManager && !discountManagerPin) {
      setPendingPayment({ lines, tip });
      return;
    }
    return placeOrderSplit(lines, tip, discountNeedsManager ? discountManagerPin : undefined);
  };

  const submitPendingWithPin = () => {
    if (!pendingPayment) return;
    const { method, lines, tip } = pendingPayment;
    setPendingPayment(null);
    if (lines) {
      placeOrderSplit(lines, tip || 0, discountManagerPin);
    } else {
      placeOrder(method, discountManagerPin);
    }
    setDiscountManagerPin('');
  };

  const printThermalReceipt = async (id: string) => {
    const token = localStorage.getItem('token');
    try {
      const r = await fetch(`/api/print/receipt/${id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      if (data.ok) {
        if (data.printerStatus === 'mock') {
          toast.success('تم تجهيز الإيصال (وضع التجربة — لم يطبع فعلياً)');
        } else {
          toast.success('تم إرسال الإيصال للطابعة');
        }
      } else {
        // body is always returned even on error so the cashier can re-print
        toast.error('فشل الطباعة: ' + (data.error || 'غير معروف') + ' (يمكنك إعادة المحاولة)');
      }
    } catch (e: any) {
      toast.error('فشل الطباعة: ' + (e?.message || 'network error'));
    }
  };

  const downloadOrderPDF = async (id: string) => {
    const token = localStorage.getItem('token');
    const r = await fetch(`/api/exports/orders/${id}.pdf`, { headers: { Authorization: `Bearer ${token}` } });
    const b = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = `order-${id}.pdf`;
    a.click();
  };

  const orderTypeLabel = (t: string) => t === 'DINE_IN' ? '🍽️ صالة' : t === 'TAKEAWAY' ? '🛍️ تيك أواي' : '🚚 توصيل';
  const orderStatusLabel = (s: string) => {
    const map: any = { PENDING: 'قيد الانتظار', CONFIRMED: 'مؤكد', PREPARING: 'قيد التحضير', READY: 'جاهز', SERVED: 'تم التقديم', COMPLETED: 'مكتمل', CANCELLED: 'ملغي' };
    return map[s] || s;
  };
  const orderStatusColor = (s: string) => {
    const map: any = { PENDING: 'bg-gray-100 text-gray-700', CONFIRMED: 'bg-blue-100 text-blue-700', PREPARING: 'bg-amber-100 text-amber-700', READY: 'bg-emerald-100 text-emerald-700', SERVED: 'bg-blue-100 text-blue-700', COMPLETED: 'bg-emerald-100 text-emerald-700', CANCELLED: 'bg-red-100 text-red-700' };
    return map[s] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div className="h-screen flex flex-col bg-ink-50" dir="rtl">
      <header className="bg-white border-b border-ink-200 px-4 py-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-brand-600 p-3 rounded-xl shadow-sm"><ChefHat className="w-5 h-5 text-white" /></div>
          <div>
            <div className="font-bold text-lg">أبو الزلف — كاشير</div>
            <div className="text-xs text-ink-500">{user?.name} • {user?.role === 'CASHIER' ? 'كاشير' : user?.role === 'WAITER' ? 'ويتر' : 'مدير'}</div>
          </div>
        </div>
        <div className="flex-1 max-w-xl relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث عن منتج..." className="input pr-10 text-right" />
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="flex bg-ink-100 rounded-lg p-1 shadow-sm">
            {[
              { v: 'DINE_IN', l: '🍽️ صالة' },
              { v: 'TAKEAWAY', l: '🛍️ تيك أواي' },
              { v: 'DELIVERY', l: '🚚 توصيل' },
            ].map((it) => (
              <button key={it.v} onClick={() => cart.setType(it.v as any)}
                className={`px-4 py-2 text-xs rounded-lg font-medium transition ${cart.type === it.v ? 'bg-brand-600 text-white shadow' : 'text-ink-700 hover:bg-white'}`}>
                {it.l}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowCartPanel((v) => !v)}
            className="btn-secondary text-sm"
            title={showCartPanel ? 'إخفاء السلة' : 'إظهار السلة'}
          >
            <ShoppingCart className="w-4 h-4" /> {showCartPanel ? 'إخفاء السلة' : 'إظهار السلة'}
          </button>
          <button
            onClick={() => setShowHeld((v) => !v)}
            className={clsx(
              'relative text-sm font-medium rounded-lg px-3 py-2 flex items-center gap-2 transition',
              showHeld ? 'bg-amber-600 text-white shadow' : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200',
            )}
            title="الطلبات المعلقة"
          >
            <Pause className="w-4 h-4" /> معلق
            {heldOrders.length > 0 && (
              <span className="absolute -top-1.5 -left-1.5 bg-red-600 text-white text-[10px] font-bold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center shadow">
                {heldOrders.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowOrderLookup(true)}
            className="text-sm font-medium rounded-lg px-3 py-2 flex items-center gap-2 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition"
            title="البحث عن أوردر قديم (استرداد / إعادة طباعة)"
          >
            <History className="w-4 h-4" /> بحث
          </button>
          <button onClick={() => { loadData(); loadHeld(); }} className="btn-ghost" title="تحديث">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-hidden px-4 py-3">
        <div className={clsx(
          'grid h-full gap-4',
          showCartPanel ? 'grid-cols-1 lg:grid-cols-[1fr_420px]' : 'grid-cols-1',
        )}>
          <div className="flex flex-col overflow-hidden rounded-[24px] bg-white shadow-sm border border-ink-200 min-w-0">
            <div className="border-b border-ink-200 px-4 py-3 bg-ink-50 rounded-t-[24px]">
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setActiveCat('all')} className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition ${activeCat === 'all' ? 'bg-brand-600 text-white shadow' : 'bg-white text-ink-700 border border-ink-200'}`}>
                  الكل
                </button>
                {categories.map((c) => (
                  <button key={c.id} onClick={() => setActiveCat(c.id)} className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap flex items-center gap-2 transition ${activeCat === c.id ? 'bg-brand-600 text-white shadow' : 'bg-white text-ink-700 border border-ink-200 hover:border-brand-200'}`}>
                    <span>{c.image}</span> {c.nameAr || c.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                {visibleProducts.map((p) => {
                  const hasOptions = productHasOptions(p);
                  const minVarPrice = p.variants && p.variants.length > 0 ? Math.min(...p.variants.map((v: any) => v.price)) : null;
                  const outOfStock = p.outOfStockUntil && new Date(p.outOfStockUntil).getTime() > Date.now();
                  return (
                    <button key={p.id} onClick={() => onProductClick(p)}
                      disabled={!p.isAvailable || outOfStock}
                      className={`card p-4 text-right hover:shadow-md transition relative ${(!p.isAvailable || outOfStock) ? 'opacity-40' : ''}`}>
                      {(p.variants?.length > 0 || p.modifierGroups?.length > 0) && (
                        <div className="absolute top-2 left-2 flex gap-1">
                          {p.variants?.length > 0 && (
                            <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">⚖</span>
                          )}
                          {p.modifierGroups?.length > 0 && (
                            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">➕</span>
                          )}
                        </div>
                      )}
                      {/* F-D: visual badge for temporarily out-of-stock items */}
                      {outOfStock && (
                        <div className="absolute top-2 right-2 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-semibold">
                          🚫 نفد
                        </div>
                      )}
                      <div className="text-5xl mb-2 text-center"><ProductImage value={p.image} className="h-16 w-16 object-cover rounded-lg mx-auto" alt={p.nameAr || p.name} /></div>
                      <div className="text-sm font-semibold line-clamp-1">{p.nameAr || p.name}</div>
                      <div className="mt-2 flex items-center justify-between">
                        <div className="text-brand-600 font-bold text-base">
                          {minVarPrice !== null ? (
                            <span>من {formatSAR(minVarPrice)}</span>
                          ) : (
                            formatSAR(p.price)
                          )}
                        </div>
                        {p.inventory && <div className={`text-xs ${p.inventory.stock <= p.inventory.minStock ? 'text-amber-600' : 'text-ink-500'}`}>{p.inventory.stock}</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
              {visibleProducts.length === 0 && <div className="text-center text-ink-400 py-20">لا توجد منتجات</div>}
            </div>
          </div>

          {showCartPanel && (
          <aside className="bg-white rounded-3xl shadow-sm border border-ink-200 grid grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden min-h-0">
          <div className="p-3 border-b border-ink-200">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold flex items-center gap-2 text-sm"><ShoppingCart className="w-4 h-4" /> الأوردر الحالي</h2>
              <div className="text-xs text-ink-500">{cart.items.length} منتج</div>
            </div>
            {cart.type === 'DINE_IN' && (
              <button onClick={() => setShowTable(true)} className="w-full btn-secondary text-xs justify-start py-1.5">
                <Store className="w-3.5 h-3.5" />
                {cart.tableNumber ? `طاولة ${cart.tableNumber}` : 'اختر طاولة'}
              </button>
            )}
            {cart.type === 'DELIVERY' && (
              <div className="space-y-1.5 mt-1.5">
                <div className="relative">
                  <User className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400" />
                  <input value={cart.customerName || ''} onChange={(e) => cart.setCustomer(e.target.value, cart.customerPhone, cart.customerAddress)} placeholder="اسم العميل" className="input pr-8 text-right text-xs py-1.5" />
                </div>
                <div className="relative">
                  <Phone className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400" />
                  <input value={cart.customerPhone || ''} onChange={(e) => cart.setCustomer(cart.customerName, e.target.value, cart.customerAddress)} placeholder="رقم الهاتف" className="input pr-8 text-right text-xs py-1.5" />
                </div>
                <div className="relative">
                  <MapPin className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-ink-400" />
                  <textarea value={cart.customerAddress || ''} onChange={(e) => cart.setCustomer(cart.customerName, cart.customerPhone, e.target.value)} placeholder="العنوان" className="input pr-8 min-h-[44px] text-right text-xs py-1.5" rows={2} />
                </div>
                <button onClick={() => setShowDelivery(true)} className="w-full btn-secondary text-xs justify-start py-1.5">
                  <Bike className="w-3.5 h-3.5" />
                  {cart.selectedDeliveryOptions?.length > 0
                    ? (
                      <>
                        {cart.selectedDeliveryOptions.length} خدمة توصيل
                        {Object.keys(cart.customDeliveryFees || {}).length > 0 && (
                          <span className="text-[10px] text-amber-600 mr-1">• قيمة مخصصة</span>
                        )}
                      </>
                    )
                    : 'اختر خدمة التوصيل'}
                </button>
              </div>
            )}
            <div className="mt-1.5">
              <div className="relative">
                <FileIcon className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-400" />
                <input value={cart.notes || ''} onChange={(e) => cart.setOrderNotes(e.target.value)} placeholder="ملاحظات (اختياري)" className="input pr-8 text-xs text-right py-1.5" />
              </div>
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto px-2 py-2 space-y-1.5">
            {cart.items.length === 0 ? (
              <div className="text-center text-ink-400 py-12">
                <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">السلة فارغة</p>
                <p className="text-xs mt-1">اضغط على أي منتج لإضافته</p>
              </div>
            ) : cart.items.map((i) => {
              const key = cartLineKey(i);
              return (
                <div key={key} className="flex items-center gap-2 p-2 hover:bg-ink-50 rounded-lg border border-ink-100 bg-white">
                  <div className="text-xl flex-shrink-0 w-8 h-8 flex items-center justify-center bg-ink-50 rounded-md overflow-hidden"><ProductImage value={i.image} className="w-8 h-8 object-cover" alt={i.nameAr || i.name} /></div>
                  <div className="flex-1 min-w-0 text-right">
                    <div className="text-sm font-semibold truncate leading-tight">
                      {i.name}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-ink-500 mt-0.5 leading-tight">
                      <span className="font-bold text-brand-600">{formatSAR(i.price)}</span>
                      <span className="text-ink-400">×</span>
                      <span className="font-semibold text-ink-800">{i.quantity}</span>
                      <span className="text-ink-400">=</span>
                      <span className="font-bold text-ink-900">{formatSAR(i.price * i.quantity)}</span>
                    </div>
                    {i.variantLabel && <div className="text-[10px] text-blue-600 font-medium truncate leading-tight">⚖ {i.variantLabel}</div>}
                    {i.modifiers && i.modifiers.length > 0 && (
                      <div className="text-[10px] text-ink-500 truncate leading-tight">
                        {i.modifiers.map((m) => m.optionLabel).join(' • ')}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button onClick={() => cart.updateQuantity(key, i.quantity - 1)} className="w-6 h-6 hover:bg-ink-200 rounded flex items-center justify-center" title="إنقاص"><Minus className="w-3 h-3" /></button>
                    <span className="w-6 text-center text-xs font-bold">{i.quantity}</span>
                    <button onClick={() => cart.updateQuantity(key, i.quantity + 1)} className="w-6 h-6 hover:bg-ink-200 rounded flex items-center justify-center" title="زيادة"><Plus className="w-3 h-3" /></button>
                    <button onClick={() => cart.removeItem(key)} className="w-6 h-6 hover:bg-red-100 text-red-600 rounded flex items-center justify-center" title="حذف"><Trash2 className="w-3 h-3" /></button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-3 border-t border-ink-200 space-y-1 bg-ink-50">
            <div className="flex justify-between text-xs"><span className="text-ink-600">المجموع الفرعي</span><span className="font-bold">{formatSAR(cart.subtotal())}</span></div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-ink-600">خصم</span>
              <input type="number" value={cart.discount} onChange={(e) => cart.setDiscount(parseFloat(e.target.value) || 0)} className="w-16 text-right px-1.5 py-0.5 border border-ink-200 rounded text-xs" />
            </div>
            {discountNeedsManager && (
              <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-1">
                ⚠ خصم {discountPct.toFixed(0)}% — يحتاج موافقة مدير قبل الدفع
              </div>
            )}
            {cart.type === 'DINE_IN' ? (
              <div className="flex justify-between text-xs"><span className="text-ink-600">ضريبة (12% — صالة)</span><span className="font-bold">{formatSAR(cart.tax())}</span></div>
            ) : (
              <div className="flex justify-between text-xs text-emerald-600"><span>بدون ضريبة ({cart.type === 'TAKEAWAY' ? 'تيك أواي' : 'توصيل'})</span><span className="font-bold">—</span></div>
            )}
            {cart.type === 'DELIVERY' && cart.deliveryFee(deliveryOptions as any) > 0 && (
              <div className="flex justify-between text-xs"><span className="text-ink-600">خدمة التوصيل</span><span className="font-bold">{formatSAR(cart.deliveryFee(deliveryOptions as any))}</span></div>
            )}
            <div className="flex justify-between text-sm font-bold pt-1 border-t border-ink-200"><span>الإجمالي</span><span className="text-brand-600">{formatSAR(cart.total(deliveryOptions as any))}</span></div>
            <div className="grid grid-cols-3 gap-1.5 pt-1">
              <button onClick={() => onPayClick('CASH')} disabled={submitting || cart.items.length === 0} className="bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-bold rounded-lg py-2 flex items-center justify-center gap-1 disabled:opacity-50">
                <Banknote className="w-3.5 h-3.5" /> كاش
              </button>
              <button onClick={() => onPayClick('CARD')} disabled={submitting || cart.items.length === 0} className="bg-blue-600 text-white hover:bg-blue-700 text-xs font-bold rounded-lg py-2 flex items-center justify-center gap-1 disabled:opacity-50">
                <CreditCard className="w-3.5 h-3.5" /> فيزا
              </button>
              <button onClick={() => onPayClick('INSTAPAY')} disabled={submitting || cart.items.length === 0} className="bg-purple-600 text-white hover:bg-purple-700 text-xs font-bold rounded-lg py-2 flex items-center justify-center gap-1 disabled:opacity-50">
                <Smartphone className="w-3.5 h-3.5" /> إنستاباي
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => {
                  // Pre-validate so the cashier sees a clear error BEFORE the modal opens
                  if (cart.items.length === 0) return;
                  if (cart.type === 'DINE_IN' && !cart.tableId) { setShowTable(true); return; }
                  if (cart.type === 'DELIVERY' && (!cart.customerName || !cart.customerPhone || !cart.customerAddress)) {
                    toast.warning('بيانات العميل ناقصة للتوصيل', 'برجاء إدخال اسم العميل ورقم الهاتف والعنوان');
                    return;
                  }
                  setShowSplitPay(true);
                }}
                disabled={submitting || cart.items.length === 0}
                className="btn-secondary text-xs justify-center py-1.5"
              >
                <Layers className="w-3.5 h-3.5" /> دفع متعدد
              </button>
              <button
                onClick={holdCurrentOrder}
                disabled={submitting || cart.items.length === 0 || !!cart.currentOrderId}
                className="text-xs font-bold rounded-lg py-1.5 flex items-center justify-center gap-1 transition bg-amber-100 text-amber-800 hover:bg-amber-200 disabled:opacity-50 border border-amber-300"
                title={cart.currentOrderId ? 'الأوردر ده معلق بالفعل' : 'تعليق الأوردر (يحفظ في قائمة المعلق، ما يروحش المطبخ)'}
              >
                <Pause className="w-3.5 h-3.5" /> تعليق
              </button>
            </div>
            {cart.currentOrderId && (
              <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-1 text-center">
                🔄 دفع على أوردر مستأنف #{cart.currentOrderNumber}
              </div>
            )}
          </div>
          </aside>
          )}
        </div>
      </main>

      {/* Product Picker Modal (variants + modifiers) */}
      <ProductPickerModal
        open={!!pickerProduct}
        product={pickerProduct}
        onClose={() => setPickerProduct(null)}
        onAdd={onPickerAdd}
      />

      {/* Split Payment Modal */}
      <SplitPaymentModal
        open={showSplitPay}
        total={cart.total(deliveryOptions as any)}
        onClose={() => setShowSplitPay(false)}
        onSubmit={onSplitPaySubmit}
      />

      {/* P1.3: Manager PIN modal for large discount */}
      {pendingPayment && (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={() => setPendingPayment(null)} dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-ink-200 bg-amber-50 flex items-center justify-between">
              <h3 className="font-bold text-lg flex items-center gap-2 text-amber-800">🔒 موافقة المدير</h3>
              <button onClick={() => setPendingPayment(null)} className="p-1 hover:bg-amber-100 rounded"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-ink-600">
                الخصم {discountPct.toFixed(0)}% أكبر من الحد المسموح للـ cashiers (20%). اطلب من المدير إدخال كلمة المرور للموافقة.
              </p>
              <input
                type="password"
                value={discountManagerPin}
                onChange={(e) => setDiscountManagerPin(e.target.value)}
                placeholder="كلمة مرور المدير"
                className="input w-full"
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Enter' && discountManagerPin) submitPendingWithPin(); }}
              />
            </div>
            <div className="p-4 border-t border-ink-200 flex gap-2">
              <button onClick={() => setPendingPayment(null)} className="btn-secondary flex-1">إلغاء</button>
              <button
                onClick={submitPendingWithPin}
                disabled={!discountManagerPin}
                className="btn-primary flex-1 disabled:opacity-50"
              >تأكيد</button>
            </div>
          </div>
        </div>
      )}

      {/* Held Orders Panel */}
      {showHeld && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 pt-16" onClick={() => setShowHeld(false)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[75vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()} dir="rtl">
            <div className="p-4 border-b border-ink-200 flex items-center justify-between bg-amber-50">
              <div className="flex items-center gap-2">
                <Pause className="w-5 h-5 text-amber-700" />
                <h3 className="font-bold text-lg">الطلبات المعلقة ({heldOrders.length})</h3>
              </div>
              <button onClick={() => setShowHeld(false)} className="p-1.5 hover:bg-amber-100 rounded"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {heldOrders.length === 0 ? (
                <div className="text-center text-ink-400 py-16">
                  <Pause className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>مفيش طلبات معلقة</p>
                  <p className="text-xs mt-1">لما تعلّق أوردر هيتحفظ هنا</p>
                </div>
              ) : (
                heldOrders.map((o) => {
                  const ageMins = Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 60000);
                  // P1.4: held orders older than 2h get a warning, older than 4h get critical
                  const ageWarning = ageMins > 240 ? 'critical' : ageMins > 120 ? 'warning' : null;
                  return (
                    <div key={o.id} className={`card p-4 border-2 ${ageWarning === 'critical' ? 'border-red-300 bg-red-50/50' : ageWarning === 'warning' ? 'border-amber-300 bg-amber-50/50' : 'border-amber-200 bg-amber-50/50'}`}>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-lg">#{o.orderNumber}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                              o.type === 'DINE_IN' ? 'bg-blue-100 text-blue-700' :
                              o.type === 'TAKEAWAY' ? 'bg-purple-100 text-purple-700' :
                              'bg-orange-100 text-orange-700'
                            }`}>
                              {o.type === 'DINE_IN' ? '🍽️ صالة' : o.type === 'TAKEAWAY' ? '🛍️ تيك أواي' : '🚚 توصيل'}
                            </span>
                          </div>
                          <div className="text-xs text-ink-500 flex items-center gap-2 flex-wrap">
                            <span>{(o.items || []).length} صنف • {o.items?.reduce((s: number, i: any) => s + i.quantity, 0)} قطعة</span>
                            <span>•</span>
                            <span className={`flex items-center gap-1 ${ageWarning === 'critical' ? 'text-red-700 font-semibold' : ageWarning === 'warning' ? 'text-amber-700 font-medium' : ''}`}>
                              <Clock className="w-3 h-3" /> قبل {ageMins < 60 ? `${ageMins} دقيقة` : `${Math.floor(ageMins / 60)} س ${ageMins % 60} د`}
                              {ageWarning === 'critical' && ' ⚠️ قديم جداً'}
                              {ageWarning === 'warning' && ' ⚠'}
                            </span>
                            {o.customerName && <><span>•</span><span>{o.customerName}</span></>}
                          </div>
                        </div>
                        <div className="text-left">
                          <div className="font-bold text-brand-600 text-lg">{formatSAR(o.total)}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        <button
                          onClick={() => resumeHeld(o.id)}
                          disabled={submitting || cart.items.length > 0}
                          className="flex-1 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 text-sm font-bold rounded-lg py-2 flex items-center justify-center gap-1"
                          title={cart.items.length > 0 ? 'السلة فيها أصناف — امسحها الأول' : 'استئناف الأوردر في السلة'}
                        >
                          <Play className="w-4 h-4" /> استئناف
                        </button>
                        <button
                          onClick={() => { setEditingHeld({ ...o }); setShowHeld(false); }}
                          className="flex-1 bg-blue-600 text-white hover:bg-blue-700 text-sm font-bold rounded-lg py-2 flex items-center justify-center gap-1"
                          title="تعديل الأصناف (إضافة / حذف / تغيير الكمية)"
                        >
                          <Edit3 className="w-4 h-4" /> تعديل
                        </button>
                        <button
                          onClick={() => discardHeld(o.id, o.orderNumber)}
                          className="bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 text-sm font-bold rounded-lg py-2 px-3 flex items-center justify-center gap-1"
                          title="حذف نهائي"
                        >
                          <Trash className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Table modal */}
      {showTable && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowTable(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} dir="rtl">
            <h3 className="font-bold text-lg mb-4">اختر طاولة</h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {tables.filter((t) => t.status === 'AVAILABLE' || t.id === cart.tableId).map((t) => (
                <button key={t.id} onClick={() => { cart.setTable(t.id, t.number); setShowTable(false); }} className={`p-4 rounded-xl border-2 transition ${cart.tableId === t.id ? 'border-brand-600 bg-brand-50' : 'border-ink-200 hover:border-brand-300'}`}>
                  <div className="text-2xl">🍽️</div>
                  <div className="font-bold mt-1">طاولة {t.number}</div>
                  <div className="text-xs text-ink-500">{t.capacity} أشخاص</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Delivery modal */}
      {showDelivery && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowDelivery(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()} dir="rtl">
            <h3 className="font-bold text-lg mb-4">اختر خدمة التوصيل</h3>
            <div className="space-y-2">
              {deliveryOptions.map((opt) => {
                const isSelected = cart.selectedDeliveryOptions?.includes(opt.id);
                const customFee = cart.customDeliveryFees?.[opt.id];
                return (
                  <div key={opt.id} className={`border rounded-lg p-3 ${isSelected ? 'border-brand-500 bg-brand-50/30' : 'hover:bg-ink-50'}`}>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => cart.toggleDeliveryOption(opt.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold flex items-center gap-1.5">
                          {opt.nameAr || opt.name}
                          {opt.allowCustomFee && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">
                              قيمة مخصصة
                            </span>
                          )}
                        </div>
                        {opt.description && <div className="text-xs text-ink-500">{opt.description}</div>}
                      </div>
                      <div className={`font-bold ${isSelected && customFee != null ? 'text-ink-400 line-through' : 'text-brand-600'}`}>
                        {opt.fee} ج.م
                      </div>
                    </label>
                    {isSelected && opt.allowCustomFee && (
                      <div className="mt-2 pt-2 border-t border-ink-200">
                        <label className="text-[11px] text-ink-600 block mb-1">
                          أدخل القيمة المخصصة
                          {opt.minFee != null && <> ({opt.minFee} – {opt.maxFee ?? '∞'} ج.م)</>}
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.01"
                            min={opt.minFee ?? 0}
                            max={opt.maxFee ?? undefined}
                            value={customFee ?? ''}
                            onChange={(e) => {
                              const v = e.target.value === '' ? null : parseFloat(e.target.value);
                              cart.setCustomDeliveryFee(opt.id, v);
                            }}
                            placeholder={`${opt.fee} (افتراضي)`}
                            className="input flex-1 text-left"
                          />
                          <span className="text-xs text-ink-500">ج.م</span>
                          {customFee != null && (
                            <button
                              onClick={() => cart.setCustomDeliveryFee(opt.id, null)}
                              className="text-[10px] text-ink-500 hover:text-red-600"
                              title="إعادة للافتراضي"
                            >
                              ↺
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {deliveryOptions.length === 0 && (
                <div className="text-center text-ink-400 py-4 text-sm">لا توجد خدمات توصيل مفعّلة</div>
              )}
            </div>
            <button onClick={() => setShowDelivery(false)} className="btn-primary w-full mt-4">تم</button>
          </div>
        </div>
      )}

      {/* Completed order */}
      {completedOrder && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full">
            <div className="text-center">
              <div className="text-6xl mb-3">✅</div>
              <h3 className="font-bold text-xl mb-2">تم تنفيذ الأوردر</h3>
              <div className="text-ink-500 text-sm mb-1">رقم الأوردر</div>
              <div className="font-bold text-2xl mb-3">{completedOrder.orderNumber}</div>
              <div className="text-2xl font-bold text-brand-600 mb-4">{formatSAR(completedOrder.total)}</div>
              <div className="flex gap-2 mb-2">
                <button onClick={() => downloadOrderPDF(completedOrder.id)} className="btn-secondary flex-1"><Receipt className="w-4 h-4" /> PDF</button>
                <button
                  onClick={() => printThermalReceipt(completedOrder.id)}
                  className="flex-1 bg-ink-800 text-white hover:bg-ink-900 rounded-lg py-2 text-sm font-semibold flex items-center justify-center gap-2"
                  title="طباعة الإيصال على الطابعة الحرارية (80mm)"
                >
                  <Printer className="w-4 h-4" /> طباعة الإيصال
                </button>
                <button onClick={() => setCompletedOrder(null)} className="btn-primary flex-1">أوردر جديد</button>
              </div>
              {completedOrder.paymentStatus === 'PAID' && (
                <div className="flex gap-2 mb-2">
                  <button
                    onClick={() => { setEditingPaidOrder(completedOrder); }}
                    className="flex-1 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 rounded-lg py-2 text-sm font-semibold flex items-center justify-center gap-2"
                    title="تعديل السعر بعد الدفع (يحتاج موافقة مدير)"
                  >
                    <Edit2 className="w-4 h-4" /> تعديل السعر
                  </button>
                  <button
                    onClick={() => setRefundOrder(completedOrder)}
                    className="flex-1 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-lg py-2 text-sm font-semibold flex items-center justify-center gap-2"
                    title="استرداد دفعة على هذا الأوردر"
                  >
                    <Undo2 className="w-4 h-4" /> استرداد دفعة
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* F-A: Edit Paid Order modal — price correction with manager PIN */}
      {editingPaidOrder && (
        <EditPaidOrderModal
          order={editingPaidOrder}
          onClose={() => setEditingPaidOrder(null)}
          onUpdated={async (updated) => {
            setEditingPaidOrder(null);
            if (updated?.id) {
              try {
                const r = await api.get(`/orders/${updated.id}`);
                setCompletedOrder(r.data.order);
              } catch {}
            }
            await loadData();
            toast.success('تم تعديل الأوردر — يُرجى تحصيل/ردّ الفرق من العميل');
          }}
        />
      )}

      {/* Refund modal (wired into the completed-order flow) */}
      <RefundModal
        open={!!refundOrder}
        orderId={refundOrder?.id || null}
        orderNumber={refundOrder?.orderNumber || null}
        orderTotal={refundOrder?.total || 0}
        onClose={() => setRefundOrder(null)}
        onRefunded={async () => {
          // Refresh the completedOrder with the latest totals (paidAmount may have changed)
          if (refundOrder?.id) {
            try {
              const r = await api.get(`/orders/${refundOrder.id}`);
              setCompletedOrder(r.data.order);
            } catch {}
          }
          await loadData();
        }}
      />

      {/* Order lookup (search past orders for refund / reprint) */}
      {showOrderLookup && (
        <OrderLookupModal
          onClose={() => setShowOrderLookup(false)}
          onPickOrder={(o) => { setShowOrderLookup(false); setRefundOrder(o); }}
          onPrintOrder={async (o) => { setShowOrderLookup(false); await downloadOrderPDF(o.id); }}
        />
      )}

      {/* Order details */}
      {showOrderDetails && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowOrderDetails(null)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">أوردر #{showOrderDetails.orderNumber}</h3>
              <button onClick={() => setShowOrderDetails(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-2">
              {showOrderDetails.items.map((it: any) => (
                <div key={it.id} className="p-3 bg-ink-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold">{it.product?.nameAr || it.product?.name}</div>
                      {it.variantLabel && <div className="text-xs text-blue-600 mt-0.5">⚖ {it.variantLabel}</div>}
                      {it.modifiers && it.modifiers.length > 0 && (
                        <div className="text-xs text-ink-500 mt-0.5">{it.modifiers.map((m: any) => m.optionLabel).join(' • ')}</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-bold">{formatSAR(it.price * it.quantity)}</div>
                      <div className="text-xs text-ink-500">× {it.quantity}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Edit Held Order Modal */}
      {editingHeld && (
        <EditHeldOrderModal
          order={editingHeld}
          products={products}
          categories={categories}
          saving={submitting}
          onClose={() => setEditingHeld(null)}
          onSave={async (items, type, customer) => {
            await saveHeldEdit(editingHeld.id, items, type, customer);
            setEditingHeld(null);
            setShowHeld(true);
          }}
        />
      )}
    </div>
  );
}

/** Modal for editing a HELD order: change quantities, remove items, add new products. */
function EditHeldOrderModal({ order, products, categories, saving, onClose, onSave }: {
  order: any;
  products: any[];
  categories: any[];
  saving: boolean;
  onClose: () => void;
  onSave: (items: any[], type: string, customer: { name?: string; phone?: string; address?: string }) => Promise<void>;
}) {
  const [items, setItems] = useState<any[]>(
    (order.items || []).map((it: any) => ({
      id: it.id,
      productId: it.productId,
      name: it.product?.nameAr || it.product?.name || 'صنف',
      image: it.product?.image || '🍽️',
      price: it.price,
      quantity: it.quantity,
      notes: it.notes || '',
      variantId: it.variantId || undefined,
      variantLabel: it.variantLabel || undefined,
      modifiers: it.modifiers || [],
    }))
  );
  const [type, setType] = useState(order.type || 'TAKEAWAY');
  const [customer, setCustomer] = useState({
    name: order.customerName || '',
    phone: order.customerPhone || '',
    address: order.customerAddress || '',
  });
  const [pickerProduct, setPickerProduct] = useState<any | null>(null);
  const [search, setSearch] = useState('');
  const [activeCat, setActiveCat] = useState('all');

  const setQty = (idx: number, q: number) => {
    if (q <= 0) {
      setItems((arr) => arr.filter((_, i) => i !== idx));
    } else {
      setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, quantity: q } : it)));
    }
  };
  const removeItem = (idx: number) => setItems((arr) => arr.filter((_, i) => i !== idx));
  const addItem = (sel: { productId: string; variantId?: string; variantLabel?: string; modifiers: any[]; finalPrice: number; quantity: number }) => {
    const p = products.find((x) => x.id === sel.productId);
    if (!p) return;
    setItems((arr) => [...arr, {
      productId: sel.productId,
      name: p.nameAr || p.name,
      image: p.image,
      price: sel.finalPrice,
      quantity: sel.quantity,
      variantId: sel.variantId,
      variantLabel: sel.variantLabel,
      modifiers: sel.modifiers,
    }]);
    setPickerProduct(null);
  };
  const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
  const filtered = useMemo(() => {
    let list = products;
    if (activeCat !== 'all') list = list.filter((p) => p.categoryId === activeCat);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) => (p.name || '').toLowerCase().includes(q) || (p.nameAr || '').toLowerCase().includes(q));
    }
    return list;
  }, [products, activeCat, search]);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden">
        <div className="p-4 border-b border-ink-200 flex items-center justify-between bg-amber-50">
          <div className="flex items-center gap-3">
            <div className="bg-amber-200 p-2 rounded-lg"><Pause className="w-5 h-5 text-amber-700" /></div>
            <div>
              <h3 className="font-bold text-lg">تعديل أوردر معلق #{order.orderNumber}</h3>
              <p className="text-xs text-ink-500">الرقم محجوز من وقت التعليق • هيتم خصم المخزون لما الاستئناف</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-amber-100 rounded"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_1.4fr]">
          {/* Left: current items + customer */}
          <div className="border-l border-ink-200 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-ink-200 bg-ink-50">
              <div className="text-sm font-bold mb-2">الأصناف الحالية ({items.length})</div>
              <div className="flex gap-2">
                {[
                  { v: 'DINE_IN', l: '🍽️ صالة' },
                  { v: 'TAKEAWAY', l: '🛍️ تيك أواي' },
                  { v: 'DELIVERY', l: '🚚 توصيل' },
                ].map((it) => (
                  <button key={it.v} onClick={() => setType(it.v)}
                    className={`px-3 py-1.5 text-xs rounded-lg font-medium ${type === it.v ? 'bg-brand-600 text-white' : 'bg-white text-ink-700 border border-ink-200'}`}>
                    {it.l}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {items.length === 0 && (
                <div className="text-center text-ink-400 py-8 text-sm">مفيش أصناف — أضف من القائمة</div>
              )}
              {items.map((it, idx) => (
                <div key={idx} className="p-3 bg-white rounded-lg border border-ink-200 flex items-center gap-2">
                  <div className="text-2xl flex-shrink-0 w-10 h-10 flex items-center justify-center bg-ink-50 rounded-md overflow-hidden"><ProductImage value={it.image} className="w-10 h-10 object-cover" alt={it.nameAr || it.name} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate">{it.name}</div>
                    {it.variantLabel && <div className="text-[10px] text-blue-600">⚖ {it.variantLabel}</div>}
                    {it.modifiers && it.modifiers.length > 0 && (
                      <div className="text-[10px] text-ink-500 truncate">{it.modifiers.map((m: any) => m.optionLabel).join(' • ')}</div>
                    )}
                    <div className="text-xs text-brand-600 font-bold mt-0.5">{formatSAR(it.price * it.quantity)}</div>
                  </div>
                  <div className="flex items-center gap-1 bg-ink-100 rounded-lg p-0.5">
                    <button onClick={() => setQty(idx, it.quantity - 1)} className="p-1.5 hover:bg-white rounded"><Minus className="w-3 h-3" /></button>
                    <span className="font-bold text-sm w-7 text-center">{it.quantity}</span>
                    <button onClick={() => setQty(idx, it.quantity + 1)} className="p-1.5 hover:bg-white rounded"><Plus className="w-3 h-3" /></button>
                  </div>
                  <button onClick={() => removeItem(idx)} className="p-1.5 text-red-500 hover:bg-red-50 rounded" title="حذف"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-ink-200 bg-ink-50 space-y-2">
              <div className="relative">
                <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                <input value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} placeholder="اسم العميل" className="input pr-9 text-right text-sm" />
              </div>
              <div className="relative">
                <Phone className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                <input value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} placeholder="رقم الهاتف" className="input pr-9 text-right text-sm" />
              </div>
              {type === 'DELIVERY' && (
                <div className="relative">
                  <MapPin className="absolute right-3 top-3 w-4 h-4 text-ink-400" />
                  <textarea value={customer.address} onChange={(e) => setCustomer({ ...customer, address: e.target.value })} placeholder="العنوان" className="input pr-9 min-h-[50px] text-right text-sm" rows={2} />
                </div>
              )}
            </div>
          </div>

          {/* Right: product grid to add new */}
          <div className="flex flex-col overflow-hidden">
            <div className="p-3 border-b border-ink-200 bg-ink-50">
              <div className="relative mb-2">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث عن منتج لإضافته..." className="input pr-9 text-right text-sm" />
              </div>
              <div className="flex gap-1 overflow-x-auto pb-1">
                <button onClick={() => setActiveCat('all')} className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${activeCat === 'all' ? 'bg-brand-600 text-white' : 'bg-white text-ink-700 border border-ink-200'}`}>الكل</button>
                {categories.map((c) => (
                  <button key={c.id} onClick={() => setActiveCat(c.id)} className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${activeCat === c.id ? 'bg-brand-600 text-white' : 'bg-white text-ink-700 border border-ink-200'}`}>
                    {c.image} {c.nameAr || c.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {filtered.map((p) => {
                  const hasOpts = (p.variants && p.variants.length > 0) || (p.modifierGroups && p.modifierGroups.length > 0);
                  return (
                    <button key={p.id} onClick={() => {
                      if (hasOpts) setPickerProduct(p);
                      else addItem({ productId: p.id, modifiers: [], finalPrice: p.price, quantity: 1 });
                    }} className="card p-2 text-right hover:shadow-md">
                      <div className="text-3xl text-center mb-1"><ProductImage value={p.image} className="h-10 w-10 object-cover rounded mx-auto" alt={p.nameAr || p.name} /></div>
                      <div className="text-[11px] font-semibold line-clamp-1">{p.nameAr || p.name}</div>
                      <div className="text-brand-600 font-bold text-xs mt-0.5">{formatSAR(p.price)}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-ink-200 flex items-center justify-between bg-white">
          <div className="text-sm text-ink-500">
            {items.length} صنف • {items.reduce((s, i) => s + i.quantity, 0)} قطعة
            <span className="font-bold text-brand-600 text-lg mr-3">{formatSAR(subtotal)}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary text-sm">إلغاء</button>
            <button
              onClick={() => onSave(items, type, customer)}
              disabled={saving || items.length === 0}
              className="bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 text-sm font-bold rounded-lg px-5 py-2 flex items-center gap-2"
            >
              <Save className="w-4 h-4" /> حفظ التعديلات
            </button>
          </div>
        </div>
      </div>

      {pickerProduct && (
        <ProductPickerModal
          open={!!pickerProduct}
          product={pickerProduct}
          onClose={() => setPickerProduct(null)}
          onAdd={addItem}
        />
      )}
    </div>
  );
}

/**
 * Search past orders for refund / reprint. Fetches the last 50 PAID/PARTIAL orders
 * from the current business day by default; cashier can type a number to filter.
 * Picks the order → onPickOrder callback (used to open refund modal).
 */
function OrderLookupModal({ onClose, onPickOrder, onPrintOrder }: {
  onClose: () => void;
  onPickOrder: (o: any) => void;
  onPrintOrder: (o: any) => void;
}) {
  const [orders, setOrders] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Last 100 paid/partial orders (across all days, not just today)
    api.get('/orders?limit=100&startDate=' + new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .then((r) => {
        if (cancelled) return;
        // Only orders that have actually been paid (or partially) — refundable
        const list = (r.data.orders || []).filter((o: any) =>
          o.paymentStatus === 'PAID' || o.paymentStatus === 'PARTIAL'
        );
        setOrders(list);
      })
      .catch((e) => setError(e?.response?.data?.error || e?.message || 'فشل التحميل'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = orders.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      String(o.orderNumber).includes(q) ||
      (o.customerName || '').toLowerCase().includes(q) ||
      (o.customerPhone || '').toLowerCase().includes(q)
    );
  });

  const statusBadge: any = {
    PAID: 'bg-emerald-100 text-emerald-700',
    PARTIAL: 'bg-amber-100 text-amber-700',
  };
  const statusLabel: any = { PAID: 'مدفوع', PARTIAL: 'جزئي' };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center p-4 pt-16" onClick={onClose} dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-ink-200 bg-blue-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-blue-700" />
            <h3 className="font-bold text-lg">البحث عن أوردر</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-blue-100 rounded"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-3 border-b border-ink-200">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث برقم الأوردر، اسم العميل، أو رقم الهاتف..."
              className="input pr-10 text-right"
              autoFocus
            />
          </div>
          <p className="text-xs text-ink-500 mt-2">آخر 100 أوردر مدفوع / جزئي في آخر 7 أيام</p>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading && <div className="text-center text-ink-400 py-8">جاري التحميل...</div>}
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">{error}</div>}
          {!loading && filtered.length === 0 && (
            <div className="text-center text-ink-400 py-12">
              <Search className="w-10 h-10 mx-auto mb-3 opacity-50" />
              <p>مفيش نتائج</p>
            </div>
          )}
          {filtered.map((o) => {
            const ageMins = Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 60000);
            const typeLabel = o.type === 'DINE_IN' ? '🍽️ صالة' : o.type === 'TAKEAWAY' ? '🛍️ تيك أواي' : '🚚 توصيل';
            return (
              <div key={o.id} className="card p-3 hover:shadow-md transition">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-base">#{o.orderNumber}</span>
                    <span className="text-[10px]">{typeLabel}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${statusBadge[o.paymentStatus]}`}>
                      {statusLabel[o.paymentStatus]}
                    </span>
                  </div>
                  <div className="font-bold text-brand-600">{formatSAR(o.total)}</div>
                </div>
                <div className="text-xs text-ink-500 flex items-center gap-2 flex-wrap mb-3">
                  <span>{new Date(o.createdAt).toLocaleString('ar-EG')}</span>
                  {ageMins < 60 && <span className="text-ink-400">• قبل {ageMins} دقيقة</span>}
                  {o.customerName && <span>• {o.customerName}</span>}
                  {o.paidAmount !== undefined && o.paidAmount !== o.total && (
                    <span className="text-amber-600">• متبقي {formatSAR(o.total - o.paidAmount)}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  {o.paymentStatus !== 'CANCELLED' && o.paidAmount > 0 && (
                    <button
                      onClick={() => onPickOrder(o)}
                      className="flex-1 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 text-xs font-bold rounded-lg py-2 flex items-center justify-center gap-1"
                    >
                      <Undo2 className="w-3.5 h-3.5" /> استرداد
                    </button>
                  )}
                  <button
                    onClick={() => onPrintOrder(o)}
                    className="flex-1 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 text-xs font-bold rounded-lg py-2 flex items-center justify-center gap-1"
                  >
                    <Receipt className="w-3.5 h-3.5" /> إعادة طباعة
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="p-3 border-t border-ink-200 bg-ink-50 text-center text-xs text-ink-500">
          💡 اضغط "استرداد" لفتح نافذة الاسترداد، أو "إعادة طباعة" لإصدار إيصال جديد
        </div>
      </div>
    </div>
  );
}

/**
 * F-A: Edit Paid Order modal — price correction with manager PIN.
 *
 * Lets the cashier adjust the unit price of any line item (or remove items) on a
 * paid order. The total is recomputed server-side, and the difference is shown
 * to the cashier (collect from / refund to the customer). Requires a manager PIN
 * because the order is already PAID.
 */
function EditPaidOrderModal({ order, onClose, onUpdated }: { order: any; onClose: () => void; onUpdated: (updated: any) => void }) {
  const [items, setItems] = useState<any[]>(
    (order.items || []).map((it: any) => ({
      // server response shape → our working copy
      productId: it.productId,
      variantId: it.variantId || null,
      modifiers: (it.modifiers || []).map((m: any) => ({ optionId: m.optionId })),
      quantity: it.quantity,
      notes: it.notes,
      originalPrice: Number(it.price),
      priceOverride: Number(it.price),  // start at current price
      productName: it.product?.nameAr || it.product?.name || 'صنف',
      productNameEn: it.product?.name || '',
      variantLabel: it.variantLabel || '',
    })),
  );
  const [managerPin, setManagerPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const newSubtotal = useMemo(
    () => items.reduce((s, i) => s + (Number(i.priceOverride) || 0) * i.quantity, 0),
    [items],
  );
  const newTotal = useMemo(
    () => Math.round((newSubtotal + (order.tax || 0) - (order.discount || 0) + (order.deliveryFee || 0)) * 100) / 100,
    [newSubtotal, order.tax, order.discount, order.deliveryFee],
  );
  const oldTotal = Number(order.total) || 0;
  const diff = Math.round((newTotal - oldTotal) * 100) / 100;

  const updateItem = (idx: number, patch: any) => {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };
  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = async () => {
    setError(null);
    if (items.length === 0) return setError('لازم يبقى فيه صنف واحد على الأقل');
    if (!managerPin) return setError('كلمة مرور المدير مطلوبة');
    setSubmitting(true);
    try {
      // F-A: send the same items array but with priceOverride per line. Backend
      // recomputes totals, validates, and requires managerPin since this is a paid order.
      const payload = {
        type: order.type,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        customerAddress: order.customerAddress,
        notes: order.notes,
        tableId: order.tableId,
        discount: order.discount,
        deliveryOptionIds: (order.deliveryOptions || []).map((d: any) => d.deliveryOptionId),
        customDeliveryFees: (order.deliveryOptions || []).map((d: any) => ({ optionId: d.deliveryOptionId, fee: Number(d.fee) })),
        items: items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          quantity: i.quantity,
          notes: i.notes,
          modifiers: i.modifiers,
          priceOverride: Number(i.priceOverride),
        })),
        managerPin,
      };
      const r = await api.put(`/orders/${order.id}`, payload);
      onUpdated(r.data.order);
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'فشل تعديل الأوردر';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" dir="rtl" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-ink-200 flex items-center justify-between bg-amber-50">
          <div>
            <div className="font-bold text-lg flex items-center gap-2 text-amber-800">
              <Edit2 className="w-5 h-5" /> تعديل سعر أوردر مدفوع #{order.orderNumber}
            </div>
            <div className="text-xs text-amber-700 mt-1">
              عدّل سعر الصنف أو احذف صنف — الإجمالي هيحسب تاني
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-amber-100 rounded"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {items.map((it, idx) => (
            <div key={idx} className="border border-ink-200 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold">{it.productName}</div>
                  {it.variantLabel && <div className="text-xs text-ink-500">{it.variantLabel}</div>}
                  <div className="text-xs text-ink-500">الكمية: {it.quantity} • السعر الأصلي: {formatSAR(it.originalPrice)}</div>
                </div>
                <button onClick={() => removeItem(idx)} className="p-1.5 text-red-500 hover:bg-red-50 rounded" title="حذف الصنف">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-ink-500 whitespace-nowrap">السعر الجديد:</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={it.priceOverride}
                  onChange={(e) => updateItem(idx, { priceOverride: parseFloat(e.target.value) || 0 })}
                  className="input flex-1 text-left"
                />
                <span className="text-xs text-ink-500 whitespace-nowrap">جنيه</span>
              </div>
            </div>
          ))}
        </div>

        {/* Diff summary */}
        <div className="p-3 border-t border-ink-200 bg-ink-50 space-y-1 text-sm">
          <div className="flex justify-between">
            <span>الإجمالي القديم:</span>
            <span className="font-bold">{formatSAR(oldTotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>الإجمالي الجديد:</span>
            <span className="font-bold text-brand-600">{formatSAR(newTotal)}</span>
          </div>
          <div className="flex justify-between border-t border-ink-300 pt-1">
            <span>الفرق:</span>
            <span className={`font-bold ${diff > 0 ? 'text-amber-600' : diff < 0 ? 'text-emerald-600' : 'text-ink-500'}`}>
              {diff > 0 ? `تحصيل ${formatSAR(diff)} من العميل` : diff < 0 ? `ردّ ${formatSAR(-diff)} للعميل` : 'بدون فرق'}
            </span>
          </div>
        </div>

        {/* Manager PIN */}
        <div className="p-4 border-t border-ink-200 space-y-2">
          <label className="text-sm font-semibold flex items-center gap-1 text-amber-800">
            🔒 كلمة مرور المدير (مطلوبة لتعديل أوردر مدفوع)
          </label>
          <input
            type="password"
            value={managerPin}
            onChange={(e) => setManagerPin(e.target.value)}
            className="input w-full"
            placeholder="********"
            autoFocus
          />
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-2 text-sm">{error}</div>}
        </div>

        <div className="p-4 border-t border-ink-200 flex gap-2 justify-end">
          <button onClick={onClose} className="btn-secondary">إلغاء</button>
          <button onClick={submit} disabled={submitting || !managerPin || items.length === 0} className="btn-primary">
            {submitting ? 'جاري الحفظ...' : 'تأكيد التعديل'}
          </button>
        </div>
      </div>
    </div>
  );
}
