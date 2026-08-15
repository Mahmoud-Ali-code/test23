// Quick fix script to set branchId on all users
const { db } = require('./src/config/prisma');

(async () => {
  const branch = await db.branch.findFirst();
  console.log('Branch:', branch?.id, branch?.nameAr);

  const result = await db.user.updateMany({
    data: { branchId: branch.id },
  });
  console.log('Users updated:', result.count);

  const users = await db.user.findMany({ select: { email: true, branchId: true, role: true } });
  console.log(JSON.stringify(users, null, 2));

  process.exit(0);
})();
