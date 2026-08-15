# Customer Test Setup — Foodics Clone (أبو الزلف)

Everything you need to share the running app with a customer for testing.

---

## 1. What I did to prep the app for customer test

| # | What | Why |
|---|------|-----|
| 1 | Reset the database to clean seed state | Customer starts with 5 categories, 90 products, 4 tables, no leftover test data |
| 2 | Added a red **TEST DEMO** banner to every page | Customer knows instantly that this is a sandbox, not a live system |
| 3 | Frontend rebuilt with the banner | `npm run build` is done — just run `start-demo.ps1` |
| 4 | Created `start-demo.ps1` / `stop-demo.ps1` / `status-demo.ps1` | One command to manage everything, survives closing the terminal |
| 5 | Fixed the broken `foodics-demo.bat` (replaced its broken Unicode header) | `foodics-demo.bat start` now works |
| 6 | Created `customer-share.txt` with login + what-to-try | Copy/paste this to the customer over WhatsApp |

The demo banner is **toggleable**. When you go to production:
- Edit `frontend/.env.local` → set `NEXT_PUBLIC_DEMO_MODE=false`
- Run `.\start-demo.ps1` (it will rebuild automatically because layout changed)

---

## 2. Current public URL (live right now)

```
https://freely-prisoner-testament-maintenance.trycloudflare.com
```

⚠️ **This URL is a Cloudflare "Quick Tunnel" — it will change every time the
server restarts.** Tell the customer that if the link stops working, they
should ping you and you'll send a new one.

---

## 3. Sharing with the customer

**Option A — paste them the text** (recommended):
- Open `customer-share.txt` in this folder
- Copy/paste the whole content into WhatsApp / email

**Option B — just send the URL** with a one-liner:
> "Try the POS at this link: https://freely-prisoner-testament-maintenance.trycloudflare.com — login as admin@abo-zoelf.com / admin123. Let me know what you think."

---

## 4. Login credentials

| Role    | Email                    | Password    |
|---------|--------------------------|-------------|
| Admin   | admin@abo-zoelf.com      | admin123    |
| Manager | manager@abo-zoelf.com    | admin123    |
| Cashier | cashier@abo-zoelf.com    | cashier123  |
| Kitchen | kitchen@abo-zoelf.com    | kitchen123  |

These are also visible on the login page so the customer can self-serve.

---

## 5. Daily operation commands

```powershell
# Start the demo (backend + frontend + tunnel)
cd "E:\project 1\foodics-clone 2\foodics-clone"
.\foodics-demo.bat start

# Check what's running
.\foodics-demo.bat status

# Stop everything
.\foodics-demo.bat stop
```

Or the .bat is just a wrapper for the PowerShell scripts — use them directly if you prefer.

---

## 6. If the URL stops working

The URL is regenerated on every server start. If the customer says "the link
doesn't open", do this:

```powershell
.\foodics-demo.bat status     # see if backend/frontend/tunnel are still up
.\foodics-demo.bat start      # restart everything - new URL appears
```

The new URL will be printed and also saved to:
`%USERPROFILE%\.minimax\state\foodics-demo\url.txt`

Send the new URL to the customer.

---

## 7. ⚠️ The "stable subdomain" problem (important)

You asked about giving the customer a "subdomain" to test. Here's the honest
state of play:

| Approach                          | Stable URL? | Free?   | Setup effort |
|-----------------------------------|-------------|---------|--------------|
| Cloudflare Quick Tunnel (current) | ❌ changes on restart | yes | 30 seconds |
| ngrok free                        | ❌ random each session | yes | 5 min + signup |
| **Buy a real domain** ($1-2/yr for `.online`, $8-10 for `.com`) + Cloudflare Named Tunnel | ✅ stable forever | cheap | ~30 min |

**There is no free way to get a permanent "subdomain-style" URL** for an
app running on a home/office PC. The closest you can get for free is the
current trycloudflare.com URL, which is good enough for a few days of
testing but not for the long term.

**My recommendation for the customer test phase:**
1. Use the trycloudflare URL you have right now — works perfectly for a 1-2 day test
2. After the customer approves the demo, buy a cheap `.online` domain (~$1.50/yr on Namecheap)
3. Add it to Cloudflare, set up a Named Tunnel (15 min), and you'll have
   `pos.abo-zoelf.online` (or whatever) working forever

I can walk you through steps 2 and 3 whenever you're ready.

---

## 8. What you DO NOT need to edit for the customer test

The project is ready as-is. Specifically:
- ❌ Don't touch `backend/.env` — current settings (mock printer, default tax rate, JWT secret) are fine for a demo
- ❌ Don't touch the seed data — it gives the customer realistic products to test
- ❌ Don't change the database password — there isn't one (SQLite is local)

Things you MIGHT want to edit later (after customer feedback):
- Add the customer's real restaurant name in the header (search for `أبو الزلف` in `frontend/src/`)
- Replace the receipt logo
- Add/modify menu items to match the customer's actual menu
- Connect a real thermal printer (settings in `backend/.env`)

---

## 9. State directory (for reference)

Everything the demo uses is in:
```
%USERPROFILE%\.minimax\state\foodics-demo\
├── url.txt           # current public URL
├── logs/             # stdout/stderr for backend, frontend, tunnel
├── backend.pid       # backend process id (if running)
├── frontend.pid      # frontend process id (if running)
└── tunnel.pid        # tunnel process id (if running)
```

The SQLite database itself is in:
```
E:\project 1\foodics-clone 2\foodics-clone\backend\prisma\prisma\dev.db
```

To reset the database to fresh demo data:
```powershell
cd "E:\project 1\foodics-clone 2\foodics-clone\backend"
# Stop the backend first (it locks the DB)
cmd /c "npx prisma db push"      # recreates schema
cmd /c "npx tsx prisma/seed.ts"  # re-seeds demo data
```

---

## 10. TL;DR — what to do right now

1. Open `customer-share.txt`, copy the contents
2. Send it to the customer via WhatsApp or email
3. The customer opens the URL, logs in, pokes around
4. When the customer gives feedback → talk to me about fixes or about getting a real domain
