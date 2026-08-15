/**
 * Receipt printer (ESC/POS thermal) integration.
 *
 * Supports three connection types via env vars:
 *
 *  PRINTER_TYPE=network  → TCP to a network/WiFi printer at PRINTER_IP:PRINTER_PORT
 *  PRINTER_TYPE=usb      → USB printer on the local host (Windows: needs Zadig driver)
 *  PRINTER_TYPE=mock     → no physical printer; receipt body is returned in the API response
 *
 * For restaurants, the most common setup is:
 *   - Printer has built-in WiFi → connect to restaurant router → use PRINTER_TYPE=network
 *   - Printer is USB only → plug into the POS machine → use PRINTER_TYPE=usb (Windows: install
 *     Zadig driver for libusb; Mac: usually works out of the box; Linux: udev rules needed)
 *
 * The renderer outputs a fixed-width text body (42 chars for 80mm, 32 for 58mm) that
 * is then sent to the printer. The same `body` is returned by mock mode so the cashier
 * can always see what the receipt would look like, even if the printer is offline.
 */
import { ThermalPrinter, PrinterTypes, CharacterSet } from 'node-thermal-printer';
import { db } from '../config/prisma';
import { round2 } from './finance';

type ConnectionType = 'network' | 'usb' | 'mock';

interface PrinterConfig {
  type: ConnectionType;
  ip?: string;
  port?: number;
  usbVendorId?: number;
  usbProductId?: number;
  width: number; // character width: 32 for 58mm, 42 for 80mm
  characterSet: CharacterSet;
  cut: boolean;
  openDrawer: boolean;
  /** printer dpi — affects character height on some models */
  dpi?: 203 | 300;
}

function getConfig(): PrinterConfig {
  const type = (process.env.PRINTER_TYPE as ConnectionType) || 'mock';
  return {
    type,
    ip: process.env.PRINTER_IP,
    port: process.env.PRINTER_PORT ? parseInt(process.env.PRINTER_PORT) : 9100,
    usbVendorId: process.env.PRINTER_USB_VENDOR_ID
      ? parseInt(process.env.PRINTER_USB_VENDOR_ID.replace(/^0x/i, ''), 16)
      : undefined,
    usbProductId: process.env.PRINTER_USB_PRODUCT_ID
      ? parseInt(process.env.PRINTER_USB_PRODUCT_ID.replace(/^0x/i, ''), 16)
      : undefined,
    width: process.env.PRINTER_WIDTH === '58' ? 32 : 42,
    characterSet: (process.env.PRINTER_CHARSET as CharacterSet) || CharacterSet.PC850_MULTILINGUAL,
    cut: process.env.PRINTER_CUT !== 'false',
    openDrawer: process.env.PRINTER_OPEN_DRAWER !== 'false',
    dpi: process.env.PRINTER_DPI === '300' ? 300 : 203,
  };
}

/** Returns the rendered receipt body as text (for mock + as a debug view). */
export function buildReceiptBody(order: any, branch: any, width = 42): string {
  const W = width;
  const center = (s: string) => {
    const pad = Math.max(0, Math.floor((W - s.length) / 2));
    return ' '.repeat(pad) + s;
  };
  const hr = '-'.repeat(W);
  const lines: string[] = [];

  // Header
  lines.push(center(branch?.nameAr || branch?.name || 'Receipt'));
  if (branch?.address) lines.push(center(branch.address));
  if (branch?.phone) lines.push(center('Tel: ' + branch.phone));
  lines.push(hr);
  lines.push(pad('Order #', String(order.orderNumber || order.id?.slice(0, 6) || ''), W));
  lines.push(pad('Date', new Date(order.createdAt).toLocaleString('en-EG'), W));
  if (order.user?.name) lines.push(pad('Cashier', order.user.name, W));
  if (order.table) lines.push(pad('Table', String(order.table.number), W));
  if (order.customerName) {
    lines.push(pad('Customer', order.customerName, W));
    if (order.customerPhone) lines.push(pad('Phone', order.customerPhone, W));
  }
  lines.push(hr);

  // Items
  for (const it of order.items || []) {
    const name = (it.product?.nameAr || it.product?.name || 'Item').slice(0, W - 12);
    const linePrice = fmtMoney(Number(it.price) * Number(it.quantity), 12);
    lines.push(pad(name, linePrice, W));
    lines.push('  x' + it.quantity + ' @ ' + Number(it.price).toFixed(2) + ' EGP');
    if (it.variantLabel) lines.push('  - ' + it.variantLabel);
    if (Array.isArray(it.modifiers) && it.modifiers.length) {
      const mods = it.modifiers.map((m: any) => m.optionLabel || m.label || '').filter(Boolean).join(', ');
      if (mods) lines.push('  + ' + mods);
    }
    if (it.notes) lines.push('  note: ' + it.notes);
  }
  lines.push(hr);

  // Totals
  const tax = Number(order.tax || 0);
  const discount = Number(order.discount || 0);
  const deliveryFee = Number(order.deliveryFee || 0);
  const tip = Number(order.tip || 0);
  const subtotal = Number(order.subtotal || 0);
  if (discount > 0) {
    lines.push(pad('Subtotal', fmtMoney(subtotal, 12), W));
    lines.push(pad('Discount', '-' + fmtMoney(discount, 12), W));
  }
  if (tax > 0) lines.push(pad('Tax', fmtMoney(tax, 12), W));
  if (deliveryFee > 0) lines.push(pad('Delivery', fmtMoney(deliveryFee, 12), W));
  lines.push(hr);
  lines.push(pad('TOTAL', fmtMoney(Number(order.total), 12), W));
  if (tip > 0) lines.push(pad('Tip', fmtMoney(tip, 12), W));
  lines.push(hr);

  // Payments
  if (Array.isArray(order.payments) && order.payments.length) {
    for (const p of order.payments) {
      lines.push(pad(p.method, fmtMoney(Number(p.amount), 12), W));
    }
    lines.push(hr);
  }
  lines.push(center('Thank you!'));
  return lines.join('\n');
}

function fmtMoney(n: number, width: number): string {
  return `${round2(n).toFixed(2).padStart(width - 4)} EGP`;
}

function pad(label: string, value: string, width: number): string {
  const spaces = Math.max(1, width - label.length - value.length);
  return label + ' '.repeat(spaces) + value;
}

/** Build a self-test receipt body. */
function buildTestBody(config: PrinterConfig): string {
  const W = config.width;
  const sep = '='.repeat(W);
  return [
    sep,
    center(W, 'PRINTER TEST'),
    sep,
    'If you can read this, the connection works.',
    '',
    'Date:  ' + new Date().toLocaleString(),
    'Type:  ' + config.type,
    'IP:    ' + (config.ip || 'n/a'),
    'Port:  ' + (config.port || 'n/a'),
    'Width: ' + W + ' chars',
    '',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    'abcdefghijklmnopqrstuvwxyz',
    '0123456789  |  EGP 12.50',
    sep,
  ].join('\n');
}

function center(width: number, s: string): string {
  const pad = Math.max(0, Math.floor((width - s.length) / 2));
  return ' '.repeat(pad) + s;
}

/** Open a ThermalPrinter for the network path. */
function buildNetworkPrinter(config: PrinterConfig): ThermalPrinter {
  if (!config.ip) {
    throw new Error('PRINTER_IP is required when PRINTER_TYPE=network');
  }
  return new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: `tcp://${config.ip}:${config.port}`,
    characterSet: config.characterSet,
    width: config.width,
    removeSpecialCharacters: false,
    options: { timeout: 5000 },
  });
}

/** Open a ThermalPrinter for the USB path via escpos adapter. */
async function buildUsbPrinter(config: PrinterConfig): Promise<ThermalPrinter> {
  // Lazy-load so platforms without escpos-usb (e.g. some Linux servers) don't crash on boot.
  // @ts-ignore
  const { default: Escpos } = await import('escpos');
  // @ts-ignore
  const usbModule = await import('escpos-usb');
  // @ts-ignore
  const USB = usbModule.USB || usbModule.default;
  const vendorId = config.usbVendorId ?? 0x04b8; // default Epson
  const productId = config.usbProductId;
  // @ts-ignore
  const device = productId ? new USB(vendorId, productId) : new USB();
  // @ts-ignore
  await new Promise<void>((resolve, reject) => {
    device.open((err: any) => err ? reject(err) : resolve());
  });
  // @ts-ignore
  const printer = new Escpos.Printer(device);
  // For the USB path we return a minimal ThermalPrinter-shaped object that
  // delegates to escpos. node-thermal-printer's high-level API is geared to
  // the network path, so for USB we just call escpos directly inside `printBody`.
  // To keep a single code path, we wrap escpos in a tiny adapter object.
  // @ts-ignore
  return makeEscposAdapter(printer, config);
}

/** Adapter that gives the Escpos printer the same surface as ThermalPrinter for
 *  the operations we use. Lets us share the body-printing code across network + USB. */
function makeEscposAdapter(esc: any, config: PrinterConfig): any {
  return {
    isRaw: true,
    _esc: esc,
    _config: config,
    _buffer: [] as Buffer[],
    async execute() { /* no-op for escpos, it streams directly */ },
    alignCenter() { esc.align('ct'); return this; },
    alignLeft() { esc.align('lt'); return this; },
    cut() {
      try { esc.cut(); } catch { /* some printers don't support cut */ }
      return this;
    },
    openCashDrawer() {
      try { esc.cashdraw(2); } catch { /* may not be wired */ }
      return this;
    },
    drawLine() { esc.text('-'.repeat(config.width) + '\n'); return this; },
    println(s: string) { esc.text(s + '\n'); return this; },
  };
}

/** Print a pre-built body to whichever printer is configured. */
async function printBodyToHardware(config: PrinterConfig, body: string): Promise<void> {
  if (config.type === 'mock') return; // handled by caller

  if (config.type === 'network') {
    const printer = buildNetworkPrinter(config);
    // The full ThermalPrinter has `isRaw: false` and buffers; we send via execute().
    const tp = printer as any;
    if (tp.isRaw) {
      // Not actually used for the network path, but for safety
      for (const ln of body.split('\n')) tp.text(ln + '\n');
    } else {
      for (const ln of body.split('\n')) tp.println(ln);
    }
    if (config.cut) tp.cut();
    if (config.openDrawer) tp.openCashDrawer();
    await tp.execute();
    return;
  }

  if (config.type === 'usb') {
    const adapter = await buildUsbPrinter(config);
    for (const ln of body.split('\n')) adapter.println(ln);
    if (config.cut) adapter.cut();
    if (config.openDrawer) adapter.openCashDrawer();
    return;
  }
}

/** Print the receipt for an order. Returns the body in mock mode and on error. */
export async function printOrderReceipt(orderId: string): Promise<{ ok: boolean; body?: string; error?: string; printerStatus?: string }> {
  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      items: { include: { product: true } },
      payments: true,
      user: { select: { id: true, name: true } },
      table: true,
      deliveryOptions: { include: { deliveryOption: true } },
    },
  });
  if (!order) return { ok: false, error: 'Order not found' };

  const branch = order.branchId
    ? await db.branch.findUnique({ where: { id: order.branchId } })
    : null;

  const config = getConfig();
  const body = buildReceiptBody(order, branch, config.width);

  if (config.type === 'mock') {
    // eslint-disable-next-line no-console
    console.log('--- PRINTER MOCK ---\n' + body + '\n---');
    return { ok: true, body, printerStatus: 'mock' };
  }

  try {
    await printBodyToHardware(config, body);
    return { ok: true, body, printerStatus: config.type };
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error('Printer error:', e?.message || e);
    return { ok: false, error: e?.message || 'Printer error', body, printerStatus: config.type };
  }
}

/** Print a self-test page. */
export async function printTestPage(): Promise<{ ok: boolean; body?: string; error?: string; printerStatus?: string }> {
  const config = getConfig();
  const body = buildTestBody(config);
  if (config.type === 'mock') {
    // eslint-disable-next-line no-console
    console.log('--- PRINTER MOCK ---\n' + body + '\n---');
    return { ok: true, body, printerStatus: 'mock' };
  }
  try {
    await printBodyToHardware(config, body);
    return { ok: true, body, printerStatus: config.type };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Printer error', body, printerStatus: config.type };
  }
}

/** Read the current printer config (no secrets) for the settings UI. */
export function getPrinterPublicConfig() {
  const c = getConfig();
  return {
    type: c.type,
    ip: c.ip || '',
    port: c.port,
    width: c.width === 32 ? 58 : 80,
    characterSet: c.characterSet,
    cut: c.cut,
    openDrawer: c.openDrawer,
    usbVendorId: c.usbVendorId ? '0x' + c.usbVendorId.toString(16).padStart(4, '0') : '',
    usbProductId: c.usbProductId ? '0x' + c.usbProductId.toString(16).padStart(4, '0') : '',
    platform: process.platform,
  };
}
