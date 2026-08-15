#!/bin/bash
# أبو الزلف - Final Setup Script
# This script sets up the entire restaurant POS system with all 8 new features

set -e

echo "🍖 مرحباً بك في إعداد نظام أبو الزلف"
echo "============================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check Node.js
echo "📋 التحقق من Node.js..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js مش متثبت!${NC}"
    echo "حمّله من https://nodejs.org"
    exit 1
fi
echo -e "${GREEN}✅ Node.js $(node -v) موجود${NC}"
echo ""

# Go to Desktop
cd ~/Desktop

# Check if old foodics-clone exists
if [ -d "foodics-clone" ]; then
    echo -e "${YELLOW}⚠️  مجلد foodics-clone موجود بالفعل${NC}"
    echo "هنسخه لـ foodics-clone-backup وعملك واحد جديد"
    mv foodics-clone foodics-clone-backup-$(date +%Y%m%d-%H%M%S) 2>/dev/null || true
fi

# Check if FINAL tar exists
if [ ! -f "foodics-clone-FINAL.tar.gz" ]; then
    echo -e "${RED}❌ ملف foodics-clone-FINAL.tar.gz مش موجود على Desktop!${NC}"
    echo ""
    echo "📥 حمّل الملف من الرسالة اللي بعتهالك (foodics-clone-FINAL.tar.gz)"
    echo "وحطه على Desktop، وبعدين ارجع شغّل السكريبت ده"
    exit 1
fi

echo "📦 فك ضغط النسخة النهائية..."
tar -xzf foodics-clone-FINAL.tar.gz
cd foodics-clone
echo -e "${GREEN}✅ تم فك الضغط${NC}"
echo ""

# Backend setup
echo "🔧 إعداد الـ Backend..."
cd backend
echo "  • تحميل الـ packages..."
npm install --silent
echo "  • إنشاء قاعدة البيانات..."
npx prisma generate
npx prisma db push
echo "  • تعبئة البيانات الأولية..."
npx tsx prisma/seed.ts
echo -e "${GREEN}✅ Backend جاهز${NC}"
echo ""

# Frontend setup
echo "🎨 إعداد الـ Frontend..."
cd ../frontend
echo "  • تحميل الـ packages..."
npm install --silent
echo -e "${GREEN}✅ Frontend جاهز${NC}"
echo ""

echo "============================================="
echo -e "${GREEN}🎉 تم الإعداد بنجاح!${NC}"
echo ""
echo "📋 للتشغيل:"
echo ""
echo "  Terminal 1 (Backend):"
echo "  $ cd ~/Desktop/foodics-clone/backend"
echo "  $ npm run dev"
echo ""
echo "  Terminal 2 (Frontend):"
echo "  $ cd ~/Desktop/foodics-clone/frontend"
echo "  $ npm start"
echo ""
echo "🌐 افتح المتصفح على: http://localhost:3000"
echo ""
echo "🔑 حسابات الدخول:"
echo "  👑 admin@abo-zoelf.com / admin123"
echo "  💰 cashier@abo-zoelf.com / cashier123"
echo "  🍳 kitchen@abo-zoelf.com / kitchen123"
echo ""
echo "📱 من الموبايل: http://YOUR_IP:3000 (نفس الـ WiFi)"
echo ""
echo "🎯 الـ 8 ملاحظات اللي اتعملت:"
echo "  ✅ 1) تصدير PDF + Excel للطلبات وتقارير الخزنه"
echo "  ✅ 2) خدمات التوصيل في الأوردر"
echo "  ✅ 3) ربط بطلبات ابلكيشن (API شغال على 0.0.0.0:4000)"
echo "  ✅ 4) Sidebar ثابت في كل الصفحات"
echo "  ✅ 5) الموردين والفواتير"
echo "  ✅ 6) إضافة/تعديل صنف في المخزون والمنيو"
echo "  ✅ 7) Recipe تلقائي يتخصم من المخزون"
echo "  ✅ 8) Responsive للموبايل"
echo ""
