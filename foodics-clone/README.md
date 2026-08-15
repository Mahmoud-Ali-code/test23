# 🍖 أبو الزلف — Restaurant POS

A complete, production-grade restaurant point-of-sale system built for **مطعم أبو الزلف**. Inspired by Foodics, customized for the Egyptian market. Runs locally or in the cloud.

![Status](https://img.shields.io/badge/status-ready-success) ![Stack](https://img.shields.io/badge/stack-Next.js_+_Node.js_+_Prisma-blue)

## ✨ Features

### 🎯 Core POS
- ✅ **Lightning-fast Cashier UI** with category browsing, search, quick add
- ✅ **Dine-in / Takeaway / Delivery** order types
- ✅ **Table management** — visual grid, auto status sync
- ✅ **Multi-payment** — Cash / Card / Wallet
- ✅ **Discounts & Tax** (15% VAT, configurable)
- ✅ **Real-time inventory** deduction per order
- ✅ **Receipt printing** (browser print + ESC/POS-ready for DPX 80)

### 👨‍🍳 Kitchen Display
- ✅ **Live KDS** — auto-refresh every 5s
- ✅ **Visual timer** with **red alert** for orders > 10 min
- ✅ **One-tap** Confirmed → Preparing → Ready → Served
- ✅ **Order notes** highlighted for chef

### 📊 Analytics & Reports
- ✅ **Real-time dashboard** — today / week / month
- ✅ **Sales charts** — daily revenue trend (Recharts)
- ✅ **Top products** analytics
- ✅ **Order type distribution** pie chart
- ✅ **Recent orders** stream

### 📦 Inventory
- ✅ **Per-product stock** tracking with **min-stock alerts**
- ✅ **Stock In / Out / Adjust** with reason logging
- ✅ **Movement history** (audit trail)
- ✅ **Auto-deduct on order**

### 👥 Multi-User
- ✅ **5 roles**: Admin, Manager, Cashier, Waiter, Kitchen
- ✅ **JWT auth** with 7-day sessions
- ✅ **Role-based access** (e.g. only Admins see Settings)
- ✅ **Branch management** for chains

### 💰 Expenses
- ✅ Track rent, utilities, salary, etc.
- ✅ Categorized entries
- ✅ Auto-calculated total

## 🏗️ Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────┐
│  Next.js Web     │────▶│  Express API     │────▶│   SQLite     │
│  (POS/KDS/Admin) │     │  (Node.js+TS)    │     │   (Prisma)   │
└──────────────────┘     └──────────────────┘     └──────────────┘
        │                         │
        ▼                         ▼
   Cashier PC              Owner Mobile
   Kitchen Screen          (PWA-friendly)
```

## 🚀 Quick Start

### Option 1: Local (Development)

**1. Backend (port 4000)**
```bash
cd backend
npm install
npx prisma generate
npx prisma db push
npx tsx prisma/seed.ts   # creates demo data
npm run dev
```

**2. Frontend (port 3000)**
```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000

### Option 2: Docker (Production-like)

```bash
docker-compose up --build
```

Open http://localhost:3000

## 👤 Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| 👑 Admin (محمد المدير) | admin@abo-zoelf.com | admin123 |
| 📋 Manager (أحمد المدير) | manager@abo-zoelf.com | admin123 |
| 💰 Cashier (خالد الكاشير) | cashier@abo-zoelf.com | cashier123 |
| 🍽️ Waiter (يوسف الويتر) | waiter@abo-zoelf.com | cashier123 |
| 🍳 Kitchen (الشيف عمر) | kitchen@abo-zoelf.com | kitchen123 |

## 🍽️ Menu (مطعم أبو الزلف) — 5 أقسام، 173 صنف

| القسم | الأصناف | أمثلة |
|------|---------|--------|
| 🌯 **شاورما** | 15 صنف | شاورما فراخ عربي دبل (390 ج)، شاورما عربي إكسترا (230 ج)، فتة شاورما (225 ج) + جبن حلومي (4 أصناف) |
| 🍔 **غربي** | 49 صنف | ريزو كربسي (115 ج)، ساندوتش كرسبي (145 ج)، وجبة كرسبي 5 قطع (245 ج)، وجبة أبو الرفف (280 ج) |
| 🍖 **مشوي** | 70 صنف | كباب ربع كيلو (320 ج)، فرخة كاملة فحم (470 ج)، وجبة أبو الزلف (420 ج)، منسف عائلي (1299 ج)، بوكس المونديال (1450 ج) |
| ➕ **إضافات** | 36 صنف | إضافة جبنة (20 ج)، أرز بسمتي (15 ج)، فتوش (60 ج)، كبة مقلية (40 ج) + 7 عروض |
| 🥤 **مشروبات** | 3 أصناف | في كولا (45 ج)، عيران (70 ج)، مياه صغيرة (25 ج) |

## 📡 API Endpoints (sample)

```
POST   /api/auth/login
GET    /api/categories
GET    /api/products?categoryId=...
POST   /api/orders            # { items, tableId, type, ... }
POST   /api/orders/:id/pay    # { paymentMethod: CASH }
GET    /api/tables
GET    /api/reports/dashboard
GET    /api/reports/sales?days=7
GET    /api/inventory?lowStock=true
```

## 🖨️ Receipt Printing (DPX 80)

For the DPX 80 thermal printer, two options:
1. **Browser print** — built-in, just connect printer to PC (default)
2. **Direct ESC/POS** — extend `orderController` to use `pdfkit` or `escpos` library

The receipt modal already has a "Print" button that triggers the system dialog.

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS, Zustand, Recharts, Lucide Icons |
| Backend | Node.js, Express, TypeScript, Prisma ORM |
| Database | SQLite (file-based, easy to backup) |
| Auth | JWT + bcrypt |
| Validation | Zod-style controllers |

## 📁 Project Structure

```
foodics-clone/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma      # Database schema
│   │   └── seed.ts            # Demo data
│   ├── src/
│   │   ├── controllers/       # Business logic
│   │   ├── routes/            # API routes
│   │   ├── middleware/        # Auth, error handling
│   │   ├── config/            # Prisma client
│   │   └── utils/             # JWT, helpers
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── app/               # Next.js app router
│   │   │   ├── login/
│   │   │   ├── dashboard/
│   │   │   ├── pos/           # Cashier
│   │   │   ├── kitchen/       # KDS
│   │   │   ├── menu/
│   │   │   ├── orders/
│   │   │   ├── inventory/
│   │   │   ├── reports/
│   │   │   ├── users/
│   │   │   ├── expenses/
│   │   │   ├── tables/
│   │   │   └── settings/
│   │   ├── components/        # Reusable UI
│   │   ├── lib/               # API client
│   │   └── store/             # Zustand stores
│   └── package.json
└── docker-compose.yml
```

## 🎯 Roadmap

- [ ] WhatsApp notifications for ready orders
- [ ] Driver app for delivery tracking
- [ ] Customer-facing menu QR
- [ ] Multi-language (Arabic RTL full support)
- [ ] Loyalty program
- [ ] Online payment integration (Mada, STC Pay)
- [ ] CSV export for accounting
- [ ] Native Android/iOS owner app (React Native)

## 📜 License

MIT — use freely for your restaurant.
