const puppeteer = require('puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--lang=ar-EG'],
  });
  const loginRes = await fetch('http://localhost:4000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@abo-zoelf.com', password: 'admin123' }),
  });
  const loginData = await loginRes.json();
  const { token, user } = loginData;
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluateOnNewDocument((auth) => {
    localStorage.setItem('token', auth.token);
    localStorage.setItem('foodics-auth', JSON.stringify({
      state: { token: auth.token, user: auth.user, _hydrated: true }, version: 0,
    }));
  }, { token, user });

  await page.goto('http://localhost:3000/settings', { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 1500));
  const tabClicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const target = btns.find(b => b.textContent && b.textContent.includes('الطابعة الحرارية'));
    if (target) { target.click(); return true; }
    return false;
  });
  console.log('Printer tab clicked:', tabClicked);
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: '/tmp/snap-printer-settings.png' });
  console.log('Saved: /tmp/snap-printer-settings.png');

  const testClicked = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const target = btns.find(b => b.textContent && b.textContent.includes('صفحة اختبار'));
    if (target) { target.click(); return true; }
    return false;
  });
  console.log('Test print clicked:', testClicked);
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: '/tmp/snap-printer-test.png' });
  console.log('Saved: /tmp/snap-printer-test.png');

  await browser.close();
})();
