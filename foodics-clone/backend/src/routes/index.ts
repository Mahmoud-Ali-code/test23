import { Router } from 'express';
import { authController } from '../controllers/authController';
import { categoryController, productController } from '../controllers/menuController';
import { orderController, tableController } from '../controllers/orderController';
import { reportController } from '../controllers/reportController';
import { refundController } from '../controllers/refundController';
import { customerController } from '../controllers/customerController';
import { shiftController } from '../controllers/shiftController';
import { auditController } from '../controllers/auditController';
import { settingsController } from '../controllers/settingsController';
import { aggregatorController } from '../controllers/aggregatorController';
import {
  inventoryController, expenseController, branchController, userController,
  supplierController, invoiceController, deliveryController,
} from '../controllers/inventoryController';
import { exportOrdersExcel, exportCashierExcel, exportOrderPDF, exportDailyReportPDF, exportOrdersCsv, exportPaymentsCsv, exportRefundsCsv } from '../controllers/exportController';
import { variantController } from '../controllers/variantController';
import { modifierController } from '../controllers/modifierController';
import { printReceipt, testPrint, getPrinterConfig } from '../controllers/printerController';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();

// Public
router.post('/auth/login', authController.login);
router.post('/auth/register', authController.register);

// Authenticated
router.get('/auth/me', authenticate, authController.me);

// Categories
router.get('/categories', authenticate, categoryController.list);
router.get('/categories/:id', authenticate, categoryController.get);
router.post('/categories', authenticate, authorize('ADMIN', 'MANAGER'), categoryController.create);
router.put('/categories/:id', authenticate, authorize('ADMIN', 'MANAGER'), categoryController.update);
router.delete('/categories/:id', authenticate, authorize('ADMIN', 'MANAGER'), categoryController.remove);

// Products
router.get('/products', authenticate, productController.list);
router.get('/products/:id', authenticate, productController.get);
router.post('/products', authenticate, authorize('ADMIN', 'MANAGER'), productController.create);
router.put('/products/:id', authenticate, authorize('ADMIN', 'MANAGER'), productController.update);
router.delete('/products/:id', authenticate, authorize('ADMIN', 'MANAGER'), productController.remove);

// Tables
router.get('/tables', authenticate, tableController.list);
router.post('/tables', authenticate, authorize('ADMIN', 'MANAGER'), tableController.create);
router.put('/tables/:id', authenticate, authorize('ADMIN', 'MANAGER'), tableController.update);
router.delete('/tables/:id', authenticate, authorize('ADMIN', 'MANAGER'), tableController.remove);

// Orders
router.get('/orders', authenticate, orderController.list);
router.get('/orders/:id', authenticate, orderController.get);
router.post('/orders', authenticate, orderController.create);
router.put('/orders/:id', authenticate, orderController.update);
router.patch('/orders/:id/status', authenticate, orderController.updateStatus);
router.post('/orders/:id/pay', authenticate, orderController.pay);
router.post('/orders/:id/payments', authenticate, orderController.addPayment);
router.get('/orders/:id/payments', authenticate, orderController.getPayments);
router.delete('/orders/:id/payments/:paymentId', authenticate, authorize('ADMIN', 'MANAGER'), orderController.removePayment);
router.post('/orders/:id/cancel', authenticate, orderController.cancel);
// Hold / resume / discard
router.post('/orders/:id/resume', authenticate, orderController.resume);
router.delete('/orders/:id/hold', authenticate, orderController.discardHold);
router.delete('/orders/:id', authenticate, authorize('ADMIN', 'MANAGER'), orderController.remove);

// Refunds
router.post('/orders/:id/refunds', authenticate, refundController.create);
router.get('/orders/:id/refunds', authenticate, refundController.listForOrder);
router.get('/refunds', authenticate, refundController.list);
router.delete('/refunds/:id', authenticate, authorize('ADMIN', 'MANAGER'), refundController.remove);

// Customers (P1.3)
router.get('/customers', authenticate, customerController.list);
router.get('/customers/debt', authenticate, customerController.debtList);
router.get('/customers/:id', authenticate, customerController.get);
router.post('/customers', authenticate, customerController.create);
router.put('/customers/:id', authenticate, customerController.update);
router.delete('/customers/:id', authenticate, authorize('ADMIN', 'MANAGER'), customerController.remove);

// Shifts + X/Z Report (P1.4)
router.post('/shifts/open', authenticate, shiftController.open);
router.get('/shifts/active', authenticate, shiftController.active);
router.get('/shifts', authenticate, shiftController.list);
router.get('/shifts/:id/x-report', authenticate, shiftController.xReport);
router.post('/shifts/:id/close', authenticate, shiftController.close);
// F-F: X/Z report PDF export
router.get('/shifts/:id/report.pdf', authenticate, shiftController.reportPdf);

// Audit log (P2.3) — manager+ only (cashiers are auto-restricted to their own actions)
router.get('/audit', authenticate, authorize('ADMIN', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN'), auditController.list);

// F-H: Global settings (refund limit, discount limit, receipt footer, etc.)
router.get('/settings', authenticate, authorize('ADMIN'), settingsController.list);
router.put('/settings', authenticate, authorize('ADMIN'), settingsController.update);

// ════════════════════════════════════════════════════════════════
// Aggregator webhooks (Otiob Masr, Talabat, elmenus, etc.)
// ════════════════════════════════════════════════════════════════
// PUBLIC webhook receiver — auth is the HMAC signature (if configured on the aggregator).
// No `authenticate` middleware here on purpose — this is called by external systems.
router.post('/webhooks/aggregators/:code', aggregatorController.webhook);

// Admin: manage aggregators
router.get('/aggregators/default-mapping', authenticate, aggregatorController.defaultMapping);
router.get('/aggregators', authenticate, authorize('ADMIN', 'MANAGER'), aggregatorController.list);
router.post('/aggregators', authenticate, authorize('ADMIN'), aggregatorController.create);
router.put('/aggregators/:id', authenticate, authorize('ADMIN'), aggregatorController.update);
router.delete('/aggregators/:id', authenticate, authorize('ADMIN'), aggregatorController.remove);
router.get('/aggregators/logs', authenticate, authorize('ADMIN', 'MANAGER'), aggregatorController.listLogs);

// Cashier + kitchen: see pending aggregator orders and act on them
router.get('/aggregator-orders/pending', authenticate, aggregatorController.pendingOrders);
router.post('/orders/:id/approve-aggregator', authenticate, aggregatorController.approve);
router.post('/orders/:id/reject-aggregator', authenticate, aggregatorController.reject);

// Reports
router.get('/reports/dashboard', authenticate, reportController.dashboard);
router.get('/reports/sales', authenticate, reportController.salesByDay);
router.get('/reports/top-products', authenticate, reportController.topProducts);

// Inventory
router.get('/inventory', authenticate, inventoryController.list);
router.post('/inventory/:productId/adjust', authenticate, authorize('ADMIN', 'MANAGER'), inventoryController.adjust);
router.get('/inventory/movements', authenticate, inventoryController.movements);

// Ingredients
router.get('/ingredients', authenticate, inventoryController.listIngredients);
router.post('/ingredients', authenticate, authorize('ADMIN', 'MANAGER'), inventoryController.createIngredient);
router.put('/ingredients/:id', authenticate, authorize('ADMIN', 'MANAGER'), inventoryController.updateIngredient);
router.delete('/ingredients/:id', authenticate, authorize('ADMIN'), inventoryController.deleteIngredient);

// Recipes
router.get('/products/:productId/recipe', authenticate, inventoryController.getRecipe);
router.post('/products/:productId/recipe', authenticate, authorize('ADMIN', 'MANAGER'), inventoryController.setRecipe);

// Expenses
router.get('/expenses', authenticate, expenseController.list);
router.post('/expenses', authenticate, authorize('ADMIN', 'MANAGER'), expenseController.create);
router.put('/expenses/:id', authenticate, authorize('ADMIN', 'MANAGER'), expenseController.update);
router.delete('/expenses/:id', authenticate, authorize('ADMIN', 'MANAGER'), expenseController.remove);

// Suppliers
router.get('/suppliers', authenticate, supplierController.list);
router.post('/suppliers', authenticate, authorize('ADMIN', 'MANAGER'), supplierController.create);
router.put('/suppliers/:id', authenticate, authorize('ADMIN', 'MANAGER'), supplierController.update);
router.delete('/suppliers/:id', authenticate, authorize('ADMIN'), supplierController.remove);

// Invoices
router.get('/invoices', authenticate, invoiceController.list);
router.post('/invoices', authenticate, authorize('ADMIN', 'MANAGER'), invoiceController.create);
router.put('/invoices/:id', authenticate, authorize('ADMIN', 'MANAGER'), invoiceController.update);
router.delete('/invoices/:id', authenticate, authorize('ADMIN'), invoiceController.remove);

// Delivery options
router.get('/delivery-options', authenticate, deliveryController.list);
router.post('/delivery-options', authenticate, authorize('ADMIN', 'MANAGER'), deliveryController.create);
router.put('/delivery-options/:id', authenticate, authorize('ADMIN', 'MANAGER'), deliveryController.update);
router.delete('/delivery-options/:id', authenticate, authorize('ADMIN'), deliveryController.remove);

// Branches
router.get('/branches', authenticate, branchController.list);
router.post('/branches', authenticate, authorize('ADMIN'), branchController.create);
router.put('/branches/:id', authenticate, authorize('ADMIN'), branchController.update);
router.delete('/branches/:id', authenticate, authorize('ADMIN'), branchController.remove);

// Users
router.get('/users', authenticate, authorize('ADMIN', 'MANAGER'), userController.list);
router.post('/users', authenticate, authorize('ADMIN'), userController.create);
router.put('/users/:id', authenticate, authorize('ADMIN', 'MANAGER'), userController.update);
router.delete('/users/:id', authenticate, authorize('ADMIN'), userController.remove);

// Exports
router.get('/exports/orders.xlsx', authenticate, authorize('ADMIN', 'MANAGER'), exportOrdersExcel);
router.get('/exports/cashier.xlsx', authenticate, authorize('ADMIN', 'MANAGER'), exportCashierExcel);
router.get('/exports/orders.csv', authenticate, authorize('ADMIN', 'MANAGER'), exportOrdersCsv);
router.get('/exports/payments.csv', authenticate, authorize('ADMIN', 'MANAGER'), exportPaymentsCsv);
router.get('/exports/refunds.csv', authenticate, authorize('ADMIN', 'MANAGER'), exportRefundsCsv);
router.get('/exports/orders/:id.pdf', authenticate, exportOrderPDF);
router.get('/exports/daily-report.pdf', authenticate, authorize('ADMIN', 'MANAGER'), exportDailyReportPDF);

// Variants (per-product sizes/types)
router.get('/products/:productId/variants', authenticate, variantController.listByProduct);
router.post('/products/:productId/variants', authenticate, authorize('ADMIN', 'MANAGER'), variantController.create);
router.put('/variants/:id', authenticate, authorize('ADMIN', 'MANAGER'), variantController.update);
router.delete('/variants/:id', authenticate, authorize('ADMIN', 'MANAGER'), variantController.remove);

// Modifiers (per-product optional addons)
router.get('/products/:productId/modifier-groups', authenticate, modifierController.listByProduct);
router.post('/products/:productId/modifier-groups', authenticate, authorize('ADMIN', 'MANAGER'), modifierController.createGroup);
router.put('/modifier-groups/:id', authenticate, authorize('ADMIN', 'MANAGER'), modifierController.updateGroup);
router.delete('/modifier-groups/:id', authenticate, authorize('ADMIN', 'MANAGER'), modifierController.removeGroup);
router.post('/modifier-groups/:groupId/options', authenticate, authorize('ADMIN', 'MANAGER'), modifierController.addOption);
router.put('/modifier-options/:id', authenticate, authorize('ADMIN', 'MANAGER'), modifierController.updateOption);
router.delete('/modifier-options/:id', authenticate, authorize('ADMIN', 'MANAGER'), modifierController.removeOption);

// Receipt printer (ESC/POS thermal)
// Returns the rendered receipt body in `body` even on error, so the cashier
// can see what would have been printed (useful for "I didn't get my receipt" cases).
router.post('/print/receipt/:orderId', authenticate, printReceipt);
router.post('/print/test', authenticate, testPrint);
router.get('/print/config', authenticate, getPrinterConfig);

export default router;
