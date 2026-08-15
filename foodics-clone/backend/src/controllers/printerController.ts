import { Request, Response } from 'express';
import { printOrderReceipt, printTestPage, getPrinterPublicConfig } from '../utils/printer';

/** Print the receipt for an order. Auth required. */
export const printReceipt = async (req: Request, res: Response) => {
  try {
    const orderId = req.params.orderId;
    const result = await printOrderReceipt(orderId);
    // Always 200 with `ok: false` + `body` for the "I didn't get my receipt" case
    // (cashier can see what would have been printed and re-print if needed).
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || 'Print failed' });
  }
};

/** Print a self-test page. Useful for "is the printer even on the network?" */
export const testPrint = async (req: Request, res: Response) => {
  try {
    const result = await printTestPage();
    return res.json(result);
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || 'Print failed' });
  }
};

/** Return the current printer config (no secrets) for the settings UI. */
export const getPrinterConfig = async (req: Request, res: Response) => {
  return res.json(getPrinterPublicConfig());
};
