'use client';
import { create } from 'zustand';

export interface SelectedModifier {
  optionId: string;
  groupId: string;
  groupName?: string;
  optionLabel: string;
  priceDelta: number;
}

export interface CartItem {
  productId?: string;
  name: string;
  nameAr?: string;
  image?: string;
  /** Base unit price. For variant products, this is the variant price */
  price: number;
  quantity: number;
  notes?: string;
  /** Set when this line uses a specific variant of the product */
  variantId?: string;
  variantLabel?: string;
  /** Selected modifier options (priced deltas) */
  modifiers?: SelectedModifier[];
}

interface CartState {
  items: CartItem[];
  tableId?: string;
  tableNumber?: string;
  type: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  notes?: string;
  discount: number;
  selectedDeliveryOptions: string[];
  /**
   * F-H: per-option custom fee overrides. When the cashier selects a delivery
   * option that allows custom fees, they can type a new value here. The key
   * is the optionId, the value is the cashier-entered amount. Only options
   * with `allowCustomFee: true` should have entries here.
   */
  customDeliveryFees: Record<string, number>;
  /**
   * When set, the cart is editing/paying an existing order (e.g. one we just
   * resumed from HELD). Pay buttons should hit `/orders/:id/pay` instead of
   * creating a new one.
   */
  currentOrderId?: string;
  currentOrderNumber?: string;
  addItem: (item: Omit<CartItem, 'quantity'>, qty?: number) => void;
  removeItem: (key: string) => void;
  updateQuantity: (key: string, qty: number) => void;
  updateNotes: (key: string, notes: string) => void;
  setTable: (tableId?: string, tableNumber?: string) => void;
  setType: (type: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY') => void;
  setCustomer: (name?: string, phone?: string, address?: string) => void;
  setOrderNotes: (notes?: string) => void;
  setDiscount: (d: number) => void;
  toggleDeliveryOption: (id: string) => void;
  /** F-H: set a custom fee override for a delivery option. Pass 0 or null to clear. */
  setCustomDeliveryFee: (id: string, fee: number | null) => void;
  /**
   * Replace the entire cart contents (used when resuming a HELD order).
   * Preserves the existing tableId/type/notes unless overridden.
   */
  setAll: (data: Partial<Pick<CartState, 'items' | 'type' | 'customerName' | 'customerPhone' | 'customerAddress' | 'notes' | 'tableId' | 'tableNumber' | 'discount' | 'selectedDeliveryOptions' | 'customDeliveryFees' | 'currentOrderId' | 'currentOrderNumber'>>) => void;
  clear: () => void;
  subtotal: () => number;
  tax: () => number;
  /**
   * Sum of selected delivery option fees (e.g., 10 EGP). 0 for DINE_IN/TAKEAWAY.
   * Resolved at call time by looking up live `deliveryOptions` from the POS page —
   * we don't want to persist fees in the cart because they live on the server side.
   * If the cashier entered a custom fee for a selected option, that value is used
   * instead of the option's default.
   */
  deliveryFee: (options?: { id: string; fee: number; allowCustomFee?: boolean; minFee?: number | null; maxFee?: number | null }[]) => number;
  /**
   * F-H: returns the array of custom fees to send to the server, shaped as
   * `[{ optionId, fee }]`. Only includes options where the cashier actually
   * entered a custom value AND the option allows custom fees.
   */
  customDeliveryFeesPayload: (options?: { id: string; allowCustomFee?: boolean }[]) => { optionId: string; fee: number }[];
  total: (options?: { id: string; fee: number; allowCustomFee?: boolean; minFee?: number | null; maxFee?: number | null }[]) => number;
}

/** Tax applies to dine-in orders only; takeaway and delivery are tax-free. */
const TAX_RATE_DINE_IN = 0.12;
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Build a stable key for a cart line — same product + same variant + same modifiers = same line */
export const cartLineKey = (i: CartItem): string => {
  const modPart = (i.modifiers || []).map((m) => m.optionId).sort().join(',');
  return `prod:${i.productId}:${i.variantId || ''}:${modPart}`;
};

export const useCart = create<CartState>((set, get) => ({
  items: [],
  type: 'DINE_IN',
  discount: 0,
  selectedDeliveryOptions: [],
  customDeliveryFees: {},

  addItem: (item, qty = 1) => {
    const items = [...get().items];
    const key = cartLineKey({ ...item, quantity: 1 });
    const existing = items.find((i) => cartLineKey(i) === key);
    if (existing) existing.quantity += qty;
    else items.push({ ...item, quantity: qty });
    set({ items });
  },

  removeItem: (key) => set({ items: get().items.filter((i) => cartLineKey(i) !== key) }),

  updateQuantity: (key, qty) => {
    if (qty <= 0) {
      set({ items: get().items.filter((i) => cartLineKey(i) !== key) });
    } else {
      set({ items: get().items.map((i) => cartLineKey(i) === key ? { ...i, quantity: qty } : i) });
    }
  },

  updateNotes: (key, notes) => set({ items: get().items.map((i) => cartLineKey(i) === key ? { ...i, notes } : i) }),

  setTable: (tableId, tableNumber) => set({ tableId, tableNumber }),
  setType: (type) => set({ type, selectedDeliveryOptions: type !== 'DELIVERY' ? [] : get().selectedDeliveryOptions }),
  setCustomer: (customerName, customerPhone, customerAddress) => set({ customerName, customerPhone, customerAddress }),
  setOrderNotes: (notes) => set({ notes }),
  setDiscount: (discount) => set({ discount }),
  toggleDeliveryOption: (id) => {
    const cur = get().selectedDeliveryOptions;
    const customs = { ...(get().customDeliveryFees || {}) };
    if (cur.includes(id)) {
      // When deselecting, also clear any custom fee entry so the state stays clean
      delete customs[id];
      set({ selectedDeliveryOptions: cur.filter((x) => x !== id), customDeliveryFees: customs });
    } else {
      set({ selectedDeliveryOptions: [...cur, id], customDeliveryFees: customs });
    }
  },
  setCustomDeliveryFee: (id, fee) => {
    const customs = { ...(get().customDeliveryFees || {}) };
    if (fee == null || !isFinite(Number(fee)) || Number(fee) <= 0) {
      delete customs[id];
    } else {
      customs[id] = Number(fee);
    }
    set({ customDeliveryFees: customs });
  },
  setAll: (data) => set((s) => ({ ...s, ...data })),
  clear: () => set({
    items: [], tableId: undefined, tableNumber: undefined,
    customerName: undefined, customerPhone: undefined, customerAddress: undefined,
    notes: undefined, discount: 0, selectedDeliveryOptions: [],
    customDeliveryFees: {},
    currentOrderId: undefined, currentOrderNumber: undefined,
  }),
  subtotal: () => round2(get().items.reduce((s, i) => s + i.price * i.quantity, 0)),
  tax: () => {
    // Only dine-in orders carry tax
    if (get().type !== 'DINE_IN') return 0;
    return round2(Math.max(0, get().subtotal() - get().discount) * TAX_RATE_DINE_IN);
  },
  deliveryFee: (options) => {
    // Only delivery orders can carry a fee
    if (get().type !== 'DELIVERY') return 0;
    const selected = get().selectedDeliveryOptions || [];
    if (selected.length === 0) return 0;
    if (!options || options.length === 0) return 0;
    const byId = new Map(options.map((o) => [o.id, o]));
    return round2(selected.reduce((s, id) => {
      const opt = byId.get(id);
      if (!opt) return s;
      // F-H: use the cashier-entered custom fee if present, otherwise the default
      const customFees = get().customDeliveryFees || {};
      const custom = customFees[id];
      if (opt.allowCustomFee && custom != null && isFinite(Number(custom))) {
        return s + Number(custom);
      }
      return s + (Number(opt.fee) || 0);
    }, 0));
  },
  customDeliveryFeesPayload: (options) => {
    if (get().type !== 'DELIVERY') return [];
    const customs = get().customDeliveryFees || {};
    const allowMap = new Map((options || []).map((o) => [o.id, !!o.allowCustomFee]));
    return Object.entries(customs)
      .filter(([id, v]) => allowMap.get(id) && v != null && Number(v) > 0)
      .map(([optionId, fee]) => ({ optionId, fee: Number(fee) }));
  },
  total: (options) => round2(
    Math.max(0, get().subtotal() - get().discount) + get().tax() + get().deliveryFee(options)
  ),
}));
