import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const db = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database (full version)...');

  // Clean
  await db.modifierOption.deleteMany();
  await db.productModifierGroup.deleteMany();
  await db.productVariant.deleteMany();
  await db.orderDeliveryOption.deleteMany();
  await db.supplierInvoiceItem.deleteMany();
  await db.supplierInvoice.deleteMany();
  await db.recipe.deleteMany();
  await db.productIngredient.deleteMany();
  await db.ingredient.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.inventoryMovement.deleteMany();
  await db.inventory.deleteMany();
  await db.product.deleteMany();
  await db.category.deleteMany();
  await db.table.deleteMany();
  await db.supplier.deleteMany();
  await db.deliveryOption.deleteMany();
  await db.branch.deleteMany();
  await db.expense.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();
  await db.setting.deleteMany();

  // ============== Branch ==============
  const mainBranch = await db.branch.create({
    data: { name: 'Abu El-Zelf', nameAr: 'أبو الزلف', address: '', phone: '' },
  });

  // ============== Users ==============
  const adminPwd = await bcrypt.hash('admin123', 10);
  const cashierPwd = await bcrypt.hash('cashier123', 10);
  const kitchenPwd = await bcrypt.hash('kitchen123', 10);

  await db.user.createMany({
    data: [
      { email: 'admin@abo-zoelf.com', password: adminPwd, name: 'المدير', role: 'ADMIN', branchId: mainBranch.id, phone: '' },
      { email: 'manager@abo-zoelf.com', password: adminPwd, name: 'مدير', role: 'MANAGER', branchId: mainBranch.id, phone: '' },
      { email: 'cashier@abo-zoelf.com', password: cashierPwd, name: 'كاشير', role: 'CASHIER', branchId: mainBranch.id, phone: '' },
      { email: 'kitchen@abo-zoelf.com', password: kitchenPwd, name: 'مطبخ', role: 'KITCHEN', branchId: mainBranch.id, phone: '' },
    ],
  });

  // Ensure all users have branchId set
  await db.user.updateMany({ data: { branchId: mainBranch.id } });

  // ============== Categories ==============
  const catShawarma = await db.category.create({ data: { name: 'Shawarma', nameAr: 'شاورما', sortOrder: 1, image: '🌯' } });
  const catWestern = await db.category.create({ data: { name: 'Western', nameAr: 'غربي', sortOrder: 2, image: '🍔' } });
  const catGrills = await db.category.create({ data: { name: 'Grills', nameAr: 'مشوي', sortOrder: 3, image: '🍖' } });
  const catExtras = await db.category.create({ data: { name: 'Extras', nameAr: 'إضافات', sortOrder: 4, image: '➕' } });
  const catDrinks = await db.category.create({ data: { name: 'Drinks', nameAr: 'مشروبات', sortOrder: 5, image: '🥤' } });

  // ============== Suppliers ==============
  const supplier1 = await db.supplier.create({
    data: { name: 'مورد اللحوم', nameAr: 'مورد اللحوم', phone: '01000000001', email: 'meat@supplier.com', address: 'القاهرة', branchId: mainBranch.id },
  });
  const supplier2 = await db.supplier.create({
    data: { name: 'مورد الخضروات', nameAr: 'مورد الخضروات', phone: '01000000002', email: 'veg@supplier.com', address: 'الإسكندرية', branchId: mainBranch.id },
  });
  const supplier3 = await db.supplier.create({
    data: { name: 'مورد المشروبات', nameAr: 'مورد المشروبات', phone: '01000000003', email: 'drinks@supplier.com', address: 'الجيزة', branchId: mainBranch.id },
  });

  // ============== Ingredients (Raw materials) ==============
  const ingChicken = await db.ingredient.create({ data: { name: 'Chicken Breast', nameAr: 'فراخ (صدر)', unit: 'kg', stock: 50, minStock: 10, cost: 80, supplierId: supplier1.id } });
  const ingMeat = await db.ingredient.create({ data: { name: 'Beef', nameAr: 'لحم بقري', unit: 'kg', stock: 30, minStock: 5, cost: 200, supplierId: supplier1.id } });
  const ingLamb = await db.ingredient.create({ data: { name: 'Lamb', nameAr: 'لحم ضاني', unit: 'kg', stock: 20, minStock: 5, cost: 280, supplierId: supplier1.id } });
  const ingCheese = await db.ingredient.create({ data: { name: 'Halloumi Cheese', nameAr: 'جبنة حلومي', unit: 'kg', stock: 10, minStock: 3, cost: 180, supplierId: supplier1.id } });
  const ingBread = await db.ingredient.create({ data: { name: 'Bread', nameAr: 'عيش', unit: 'pcs', stock: 200, minStock: 50, cost: 1, supplierId: supplier2.id } });
  const ingFries = await db.ingredient.create({ data: { name: 'Potato Fries', nameAr: 'بطاطس', unit: 'kg', stock: 30, minStock: 10, cost: 15, supplierId: supplier2.id } });
  const ingRice = await db.ingredient.create({ data: { name: 'Basmati Rice', nameAr: 'أرز بسمتي', unit: 'kg', stock: 25, minStock: 5, cost: 30, supplierId: supplier2.id } });
  const ingCola = await db.ingredient.create({ data: { name: 'V Cola', nameAr: 'في كولا', unit: 'pcs', stock: 100, minStock: 30, cost: 18, supplierId: supplier3.id } });
  const ingWater = await db.ingredient.create({ data: { name: 'Water', nameAr: 'مياه', unit: 'pcs', stock: 200, minStock: 50, cost: 5, supplierId: supplier3.id } });
  const ingOil = await db.ingredient.create({ data: { name: 'Cooking Oil', nameAr: 'زيت طبخ', unit: 'l', stock: 20, minStock: 5, cost: 50, supplierId: supplier2.id } });
  const ingSalt = await db.ingredient.create({ data: { name: 'Salt', nameAr: 'ملح', unit: 'kg', stock: 10, minStock: 2, cost: 5 } });
  const ingGarlic = await db.ingredient.create({ data: { name: 'Garlic Sauce', nameAr: 'ثومية', unit: 'kg', stock: 8, minStock: 2, cost: 30 } });
  const ingTahini = await db.ingredient.create({ data: { name: 'Tahini', nameAr: 'طحينة', unit: 'kg', stock: 5, minStock: 2, cost: 80 } });

  // ============== Products ==============
  const p = (nameAr: string, name: string, price: number, categoryId: string, image: string) =>
    db.product.create({ data: { name, nameAr, price, cost: 0, categoryId, image, isActive: true, isAvailable: true } });

  const products: any[] = [];
  const addP = async (nameAr: string, name: string, price: number, categoryId: string, image: string) => {
    const prod = await p(nameAr, name, price, categoryId, image);
    products.push(prod);
    return prod;
  };

  // شاورما + جبن حلومي
  await addP('شاورما فراخ عربي دبل', 'Chicken Shawarma Double', 390, catShawarma.id, '🌯');
  await addP('شاورما عربي إكسترا', 'Arabian Shawarma Extra', 230, catShawarma.id, '🌯');
  await addP('شاورما فراخ عربي سنجل', 'Chicken Shawarma Single', 210, catShawarma.id, '🌯');
  await addP('وجبة ماريا فراخ', 'Maria Chicken Meal', 240, catShawarma.id, '🍱');
  await addP('فتة شاورما فراخ', 'Fattet Chicken Shawarma', 225, catShawarma.id, '🥘');
  await addP('ساندوتش شاورما فراخ صاج', 'Chicken Shawarma Saj', 100, catShawarma.id, '🥙');
  await addP('ساندوتش شاورما فراخ صاروخ', 'Chicken Shawarma Rocket', 120, catShawarma.id, '🚀');
  await addP('ساندوتش شاورما فرنساوي', 'Chicken Shawarma French', 140, catShawarma.id, '🥖');
  await addP('ساندوتش شاورما كايزر', 'Chicken Shawarma Kaiser', 115, catShawarma.id, '🍞');
  await addP('شاورما فراخ بالوزن — ربع كيلو', 'Chicken Shawarma 250g', 245, catShawarma.id, '⚖️');
  await addP('شاورما فراخ بالوزن — نص كيلو', 'Chicken Shawarma 500g', 460, catShawarma.id, '⚖️');
  await addP('ساندوتش جبنة حلوم صاج', 'Halloumi Saj', 100, catShawarma.id, '🧀');
  await addP('ساندوتش جبنة حلوم لباني', 'Halloumi Labanieh', 100, catShawarma.id, '🧀');
  await addP('ساندوتش جبنة حلوم فرنساوي', 'Halloumi French', 100, catShawarma.id, '🧀');
  await addP('طبق حلومي + بطاطس', 'Halloumi Plate + Fries', 220, catShawarma.id, '🍽️');

  // غربي
  await addP('رزرو كربسي', 'Crispy Rizzo', 115, catWestern.id, '🍚');
  await addP('رزرو زنجر', 'Zinger Rizzo', 150, catWestern.id, '🍚');
  await addP('رزرو فاهيتا', 'Fajita Rizzo', 165, catWestern.id, '🍚');
  await addP('رزرو مكسيكي سبايسي', 'Mexican Spicy Rizzo', 160, catWestern.id, '🌮');
  await addP('ساندوتش بطلبنس سوري', 'Bologna Syrian', 60, catWestern.id, '🥖');
  await addP('ساندوتش بطلبنس فرنساوي', 'Bologna French', 75, catWestern.id, '🥖');
  await addP('ساندوتش لانشون', 'Luncheon', 60, catWestern.id, '🥖');
  await addP('ساندوتش بطاطس تشيز', 'Potato Cheese', 90, catWestern.id, '🥔');
  await addP('ساندوتش كرسبي', 'Crispy', 145, catWestern.id, '🍗');
  await addP('ساندوتش زنجر', 'Zinger', 160, catWestern.id, '🍗');
  await addP('ساندوتش اسكالوب', 'Escalope', 145, catWestern.id, '🍗');
  await addP('ساندوتش تشيكن رول', 'Chicken Roll', 160, catWestern.id, '🌯');
  await addP('ساندوتش فاهيتا', 'Fajita Sandwich', 160, catWestern.id, '🌮');
  await addP('ساندوتش مكسيكي سبايسي', 'Mexican Spicy', 150, catWestern.id, '🌮');
  await addP('ساندوتش برجر لحمة', 'Beef Burger', 160, catWestern.id, '🍔');
  await addP('ساندوتش برجر فراخ', 'Chicken Burger', 145, catWestern.id, '🍔');
  await addP('ساندوتش كفة لحمة', 'Beef Kofta', 75, catWestern.id, '🥙');
  await addP('ساندوتش كباب شقف', 'Kebab Shaka', 80, catWestern.id, '🥙');
  await addP('وجبة كرسبي — 3 قطع', 'Crispy 3pc', 200, catWestern.id, '🍗');
  await addP('وجبة كرسبي — 5 قطع', 'Crispy 5pc', 245, catWestern.id, '🍗');
  await addP('وجبة زنجر — 3 قطع', 'Zinger 3pc', 215, catWestern.id, '🍗');
  await addP('وجبة زنجر — 5 قطع', 'Zinger 5pc', 260, catWestern.id, '🍗');
  await addP('وجبة فاهيتا فراخ', 'Chicken Fajita', 250, catWestern.id, '🌮');
  await addP('وجبة مكسيكي فراخ', 'Chicken Mexican', 235, catWestern.id, '🌮');
  await addP('وجبة اسكالوب — 3 قطع', 'Escalope 3pc', 200, catWestern.id, '🍗');
  await addP('وجبة اسكالوب — 5 قطع', 'Escalope 5pc', 245, catWestern.id, '🍗');
  await addP('وجبة تشيكن رول 4 قطع', 'Chicken Roll 4pc', 265, catWestern.id, '🌯');
  await addP('وجبة أبو الرفف', 'Abu El-Reff Meal', 280, catWestern.id, '🍱');
  await addP('وجبة تشيك طاووق', 'Chicken Tawook', 120, catWestern.id, '🍢');
  await addP('وجبة كباب شقف', 'Kebab Shaka Meal', 210, catWestern.id, '🥙');

  // مشوي
  await addP('كباب شقف — ربع كيلو', 'Kebab Shaka 250g', 320, catGrills.id, '🍖');
  await addP('كباب شقف — نص كيلو', 'Kebab Shaka 500g', 610, catGrills.id, '🍖');
  await addP('كباب شقف — كيلو', 'Kebab Shaka 1kg', 1180, catGrills.id, '🍖');
  await addP('كفتة لحمة — ربع كيلو', 'Beef Kofta 250g', 290, catGrills.id, '🥩');
  await addP('كفتة لحمة — نص كيلو', 'Beef Kofta 500g', 540, catGrills.id, '🥩');
  await addP('كفتة لحمة — كيلو', 'Beef Kofta 1kg', 1040, catGrills.id, '🥩');
  await addP('شيش طاووق صدور — ربع كيلو', 'Shish Tawook 250g', 195, catGrills.id, '🍢');
  await addP('شيش طاووق صدور — نص كيلو', 'Shish Tawook 500g', 370, catGrills.id, '🍢');
  await addP('شيش طاووق صدور — كيلو', 'Shish Tawook 1kg', 710, catGrills.id, '🍢');
  await addP('كفتة فراخ — ربع كيلو', 'Chicken Kofta 250g', 185, catGrills.id, '🍗');
  await addP('كفتة فراخ — نص كيلو', 'Chicken Kofta 500g', 340, catGrills.id, '🍗');
  await addP('كفتة فراخ — كيلو', 'Chicken Kofta 1kg', 640, catGrills.id, '🍗');
  await addP('فرخة مخلية فحم — نص', 'Boneless Coal Half', 260, catGrills.id, '🍗');
  await addP('فرخة مخلية فحم — كاملة', 'Boneless Coal Full', 490, catGrills.id, '🍗');
  await addP('فرخة فحم عادي — نص', 'Coal Chicken Half', 245, catGrills.id, '🍗');
  await addP('فرخة فحم عادي — كاملة', 'Coal Chicken Full', 470, catGrills.id, '🍗');
  await addP('فراخ شواية — كاملة', 'Grilled Chicken Full', 490, catGrills.id, '🍗');
  await addP('ساندوتش كفتة لحمة', 'Beef Kofta Sandwich', 120, catGrills.id, '🥙');
  await addP('ساندوتش كباب', 'Kebab Sandwich', 140, catGrills.id, '🥙');
  await addP('ساندوتش كفتة فراخ', 'Chicken Kofta Sandwich', 100, catGrills.id, '🥙');
  await addP('وجبة كفتة لحمة', 'Beef Kofta Meal', 285, catGrills.id, '🍱');
  await addP('وجبة كباب شقف', 'Kebab Shaka Meal', 320, catGrills.id, '🍱');
  await addP('وجبة شيش طاووق صدور', 'Shish Tawook Meal', 215, catGrills.id, '🍱');
  await addP('وجبة كفتة فراخ', 'Chicken Kofta Meal', 190, catGrills.id, '🍱');
  await addP('وجبة أبو الزلف', 'Abu El-Zelf Meal', 420, catGrills.id, '🍱');
  await addP('منسف عائلي', 'Family Mansaf', 1299, catGrills.id, '🥘');
  await addP('صينية الأكيلة', 'Al-Akeela Tray', 1599, catGrills.id, '🍽️');
  await addP('صينية اللمة', 'Al-Lama Tray', 1749, catGrills.id, '🍽️');
  await addP('بوكس المونديال', 'World Cup Box', 1450, catGrills.id, '🏆');
  await addP('صينية التوفير', 'Savings Tray', 1830, catGrills.id, '🍽️');

  // إضافات
  await addP('إضافة جبنة (شاورما)', 'Add Cheese (Shawarma)', 20, catExtras.id, '🧀');
  await addP('إضافة بطاطس (شاورما)', 'Add Fries (Shawarma)', 10, catExtras.id, '🍟');
  await addP('أرز بسمتي صغير', 'Basmati Rice Small', 15, catExtras.id, '🍚');
  await addP('أرز بسمتي كبير', 'Basmati Rice Large', 20, catExtras.id, '🍚');
  await addP('طبق بطاطس صغير', 'Fries Plate Small', 45, catExtras.id, '🍟');
  await addP('طبق بطاطس كبير', 'Fries Plate Large', 60, catExtras.id, '🍟');
  await addP('يالنجي ورق عنب', 'Yalanji Grape Leaves', 75, catExtras.id, '🌿');
  await addP('سلطة خضرا', 'Green Salad', 25, catExtras.id, '🥗');
  await addP('فتوش / تبولة', 'Fattoush / Tabbouleh', 60, catExtras.id, '🥗');
  await addP('طحينة / حمص', 'Tahini / Hummus', 60, catExtras.id, '🧆');
  await addP('ثومية', 'Garlic Sauce', 10, catExtras.id, '🥣');
  await addP('عيش صاج', 'Saj Bread', 5, catExtras.id, '🫓');

  // مشروبات
  await addP('في كولا', 'V Cola', 45, catDrinks.id, '🥤');
  await addP('عيران', 'Irane', 70, catDrinks.id, '🥤');
  await addP('مياه صغيرة', 'Small Water', 25, catDrinks.id, '💧');

  // ============== Recipes (automatic inventory deduction) ==============
  // Find products by name
  const findProduct = (ar: string) => products.find((p) => p.nameAr === ar);
  const findIng = (ar: string) => [ingChicken, ingMeat, ingLamb, ingCheese, ingBread, ingFries, ingRice, ingCola, ingWater, ingOil, ingSalt, ingGarlic, ingTahini].find((i) => i.nameAr === ar);

  const recipes: [string, [string, number][]][] = [
    ['شاورما فراخ عربي دبل', [['فراخ (صدر)', 0.3], ['عيش', 2]]],
    ['شاورما عربي إكسترا', [['فراخ (صدر)', 0.2], ['عيش', 1.5]]],
    ['ساندوتش شاورما فراخ صاج', [['فراخ (صدر)', 0.15], ['عيش', 1]]],
    ['ساندوتش جبنة حلوم صاج', [['جبنة حلومي', 0.15], ['عيش', 1]]],
    ['ساندوتش برجر لحمة', [['لحم بقري', 0.2], ['عيش', 1]]],
    ['ساندوتش برجر فراخ', [['فراخ (صدر)', 0.18], ['عيش', 1]]],
    ['وجبة كرسبي — 3 قطع', [['فراخ (صدر)', 0.4], ['بطاطس', 0.2], ['زيت طبخ', 0.05]]],
    ['وجبة زنجر — 3 قطع', [['فراخ (صدر)', 0.4], ['بطاطس', 0.2], ['زيت طبخ', 0.05]]],
    ['وجبة أبو الزلف', [['فراخ (صدر)', 0.3], ['لحم بقري', 0.2], ['أرز بسمتي', 0.15], ['بطاطس', 0.1]]],
    ['وجبة كفتة لحمة', [['لحم بقري', 0.3], ['عيش', 1], ['أرز بسمتي', 0.15]]],
    ['وجبة كفتة فراخ', [['فراخ (صدر)', 0.25], ['عيش', 1], ['أرز بسمتي', 0.15]]],
    ['طبق حلومي + بطاطس', [['جبنة حلومي', 0.25], ['بطاطس', 0.2]]],
    ['في كولا', [['في كولا', 1]]],
    ['مياه صغيرة', [['مياه', 1]]],
  ];

  for (const [prodName, ings] of recipes) {
    const prod = findProduct(prodName);
    if (!prod) continue;
    for (const [ingName, qty] of ings) {
      const ing = findIng(ingName);
      if (!ing) continue;
      await db.recipe.create({
        data: { productId: prod.id, ingredientId: ing.id, quantity: qty },
      });
    }
  }

  // ============== Product inventory (100 each) ==============
  for (const prod of products) {
    await db.inventory.create({
      data: { productId: prod.id, stock: 100, minStock: 10, unit: 'pcs' },
    });
  }

  // ============== Delivery Options ==============
  await db.deliveryOption.create({ data: { name: 'Standard Delivery', nameAr: 'توصيل عادي', description: 'خلال 60 دقيقة', fee: 25 } });
  await db.deliveryOption.create({ data: { name: 'Express Delivery', nameAr: 'توصيل سريع', description: 'خلال 30 دقيقة', fee: 50 } });
  await db.deliveryOption.create({ data: { name: 'Free Delivery', nameAr: 'توصيل مجاني', description: 'لأوردرات أكتر من 500 جنيه', fee: 0 } });

  // ============== Supplier Invoices ==============
  await db.supplierInvoice.create({
    data: {
      number: 'INV-001',
      supplierId: supplier1.id,
      amount: 5000,
      paid: 2500,
      status: 'PARTIAL',
      date: new Date(),
      dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      notes: 'فاتورة لحوم شهر يناير',
      items: {
        create: [
          { description: 'لحم بقري 50 كيلو', quantity: 50, unit: 'kg', unitPrice: 80, total: 4000 },
          { description: 'فراخ 20 كيلو', quantity: 20, unit: 'kg', unitPrice: 50, total: 1000 },
        ],
      },
    },
  });
  await db.supplierInvoice.create({
    data: {
      number: 'INV-002',
      supplierId: supplier3.id,
      amount: 2000,
      paid: 2000,
      status: 'PAID',
      date: new Date(),
      notes: 'فاتورة مشروبات',
      items: {
        create: [
          { description: 'في كولا 50 قطعة', quantity: 50, unit: 'pcs', unitPrice: 30, total: 1500 },
          { description: 'مياه 50 قطعة', quantity: 50, unit: 'pcs', unitPrice: 10, total: 500 },
        ],
      },
    },
  });

  // ============== 4 Tables ==============
  for (let i = 1; i <= 4; i++) {
    await db.table.create({
      data: { number: String(i), capacity: 4, branchId: mainBranch.id, status: 'AVAILABLE' },
    });
  }

  // ============== Variants (per-product sizes) ==============
  // Find specific products to attach variants to
  const allProducts = await db.product.findMany();
  const findP = (nameAr: string) => allProducts.find((x) => x.nameAr === nameAr);
  const findPStarts = (prefix: string) => allProducts.find((x) => (x.nameAr || '').startsWith(prefix));

  const crispyMeal = findPStarts('وجبة كرسبي');
  const zingerMeal = findPStarts('وجبة زنجر');
  const escalopeMeal = findPStarts('وجبة اسكالوب');
  const sandwichCrispy = findP('ساندوتش كرسبي');
  const sandwichZinger = findP('ساندوتش زنجر');
  const friesBig = findP('طبق بطاطس كبير');
  const friesSmall = findP('طبق بطاطس صغير');
  const cola = findP('في كولا');

  if (crispyMeal) {
    await db.productVariant.createMany({
      data: [
        { productId: crispyMeal.id, label: '3 قطع', labelAr: '3 قطع', price: 200, sortOrder: 1 },
        { productId: crispyMeal.id, label: '5 قطع', labelAr: '5 قطع', price: 245, sortOrder: 2 },
        { productId: crispyMeal.id, label: '10 قطع', labelAr: '10 قطع', price: 460, sortOrder: 3 },
      ],
    });
  }
  if (zingerMeal) {
    await db.productVariant.createMany({
      data: [
        { productId: zingerMeal.id, label: '3 قطع', labelAr: '3 قطع', price: 215, sortOrder: 1 },
        { productId: zingerMeal.id, label: '5 قطع', labelAr: '5 قطع', price: 260, sortOrder: 2 },
      ],
    });
  }
  if (escalopeMeal) {
    await db.productVariant.createMany({
      data: [
        { productId: escalopeMeal.id, label: '3 قطع', labelAr: '3 قطع', price: 200, sortOrder: 1 },
        { productId: escalopeMeal.id, label: '5 قطع', labelAr: '5 قطع', price: 245, sortOrder: 2 },
      ],
    });
  }
  if (cola) {
    await db.productVariant.createMany({
      data: [
        { productId: cola.id, label: 'وسط', labelAr: 'وسط', price: 25, sortOrder: 1 },
        { productId: cola.id, label: 'كبير', labelAr: 'كبير', price: 35, sortOrder: 2 },
      ],
    });
  }

  // ============== Modifier Groups (per-product optional addons) ==============
  const shawarmaDobl = findP('شاورما فراخ عربي دبل');
  if (shawarmaDobl) {
    const breadGroup = await db.productModifierGroup.create({
      data: {
        productId: shawarmaDobl.id,
        name: 'Bread Type', nameAr: 'نوع العيش',
        type: 'SINGLE', required: true, minSelect: 1, maxSelect: 1, sortOrder: 1,
      },
    });
    await db.modifierOption.createMany({
      data: [
        { groupId: breadGroup.id, label: 'عيش بلدي', labelAr: 'عيش بلدي', priceDelta: 0, isDefault: true, sortOrder: 1 },
        { groupId: breadGroup.id, label: 'عيش صامولي', labelAr: 'عيش صامولي', priceDelta: 0, sortOrder: 2 },
        { groupId: breadGroup.id, label: 'بدون عيش', labelAr: 'بدون عيش', priceDelta: -10, sortOrder: 3 },
      ],
    });

    const saucesGroup = await db.productModifierGroup.create({
      data: {
        productId: shawarmaDobl.id,
        name: 'Sauces', nameAr: 'الصوصات',
        type: 'MULTI', required: false, minSelect: 0, maxSelect: 3, sortOrder: 2,
      },
    });
    await db.modifierOption.createMany({
      data: [
        { groupId: saucesGroup.id, label: 'ثومية', labelAr: 'ثومية', priceDelta: 0, sortOrder: 1 },
        { groupId: saucesGroup.id, label: 'طحينة', labelAr: 'طحينة', priceDelta: 0, sortOrder: 2 },
        { groupId: saucesGroup.id, label: 'شطة', labelAr: 'شطة', priceDelta: 0, sortOrder: 3 },
        { groupId: saucesGroup.id, label: 'كاتشب', labelAr: 'كاتشب', priceDelta: 0, sortOrder: 4 },
        { groupId: saucesGroup.id, label: 'جبنة زائدة', labelAr: 'جبنة زائدة', priceDelta: 15, sortOrder: 5 },
      ],
    });
  }

  // Add bread/sauce modifiers to all shawarma sandwhiches too
  const shawarmaSandwiches = [
    'ساندوتش شاورما فراخ صاج',
    'ساندوتش شاورما فراخ صاروخ',
    'ساندوتش شاورما فرنساوي',
    'ساندوتش شاورما كايزر',
  ];
  for (const sn of shawarmaSandwiches) {
    const prod = findP(sn);
    if (!prod) continue;
    const saucesGroup = await db.productModifierGroup.create({
      data: {
        productId: prod.id, name: 'Sauces', nameAr: 'الصوصات',
        type: 'MULTI', required: false, minSelect: 0, maxSelect: 3, sortOrder: 1,
      },
    });
    await db.modifierOption.createMany({
      data: [
        { groupId: saucesGroup.id, label: 'ثومية', labelAr: 'ثومية', priceDelta: 0, sortOrder: 1 },
        { groupId: saucesGroup.id, label: 'طحينة', labelAr: 'طحينة', priceDelta: 0, sortOrder: 2 },
        { groupId: saucesGroup.id, label: 'شطة', labelAr: 'شطة', priceDelta: 0, sortOrder: 3 },
        { groupId: saucesGroup.id, label: 'جبنة زائدة', labelAr: 'جبنة زائدة', priceDelta: 10, sortOrder: 4 },
      ],
    });
  }

  // ============== (Combos removed) ==============

  console.log('✅ Full seed complete!');
  console.log('   - 1 branch, 4 users, 5 categories');
  console.log('   - ' + products.length + ' products with ' + recipes.length + ' recipes');
  console.log('   - 13 ingredients, 3 suppliers, 2 invoices');
  console.log('   - 3 delivery options, 4 tables');
  console.log('   - variants and modifier groups added');
  console.log('');
  console.log('Login:');
  console.log('   👑 admin@abo-zoelf.com / admin123');
  console.log('   📋 manager@abo-zoelf.com / admin123');
  console.log('   💰 cashier@abo-zoelf.com / cashier123');
  console.log('   🍳 kitchen@abo-zoelf.com / kitchen123');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
