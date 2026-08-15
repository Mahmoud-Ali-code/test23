# 🚀 foodics-clone: Windows + Domain Setup

This is the **step-by-step guide** to run the POS in your restaurant with a
Windows machine + a thermal receipt printer + a public domain.

---

## 1. What you need (hardware)

| Item | Why | Approx cost (EGP) |
|---|---|---|
| Windows PC or laptop (always on) | runs the server | already have |
| Thermal printer 80mm (Epson TM-T20, Xprinter XP-Q200, Star TSP143) | receipts | 800-2000 |
| USB A-B cable (printer to PC) | data | 50-100 |
| Cash drawer + RJ11 cable | opens on cash payment | 600-1500 |
| Your existing tablet/phone | cashier terminal | already have |
| Router (already in the restaurant) | LAN | already have |

---

## 2. First-time install on Windows (one-time)

Open **PowerShell as Administrator** and run:

```powershell
# 1) Install Node.js 20 LTS (skip if already installed)
winget install OpenJS.NodeJS.LTS

# 2) Install Git (skip if already installed)
winget install Git.Git

# 3) Clone or copy the project to C:\foodics-clone
cd C:\
git clone <your-repo-url> foodics-clone
cd C:\foodics-clone

# 4) Install backend deps
cd backend
npm install
cd ..

# 5) Install frontend deps + build
cd frontend
npm install
npm run build
cd ..

# 6) Download cloudflared.exe (for the public tunnel/domain)
mkdir $env:USERPROFILE\.minimax\bin
Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile "$env:USERPROFILE\.minimax\bin\cloudflared.exe"

# 7) Make sure the SQLite db exists (it does, from your Mac)
#    Copy backend/prisma/prisma/dev.db from your Mac to the same path on Windows
```

---

## 3. Configure the printer in `backend\.env`

Open `C:\foodics-clone\backend\.env` in Notepad and edit:

```ini
# Connection type
PRINTER_TYPE=usb

# USB vendor + product ID (find via Zadig — see step 4)
PRINTER_USB_VENDOR_ID=0x04b8   # Epson default; change if different brand
PRINTER_USB_PRODUCT_ID=0x0202

# Receipt width
PRINTER_WIDTH=80
PRINTER_CHARSET=PC850_MULTILINGUAL

# Auto-cut + open cash drawer
PRINTER_CUT=true
PRINTER_OPEN_DRAWER=true
```

---

## 4. Install the printer USB driver (Zadig, one-time)

Windows doesn't have a built-in `libusb` driver, so we need Zadig to install one
for the thermal printer:

1. Download **Zadig** from https://zadig.akeo.ie (portable, no install)
2. Plug the printer into a USB port and turn it on
3. Open Zadig → **Options → List All Devices** (check the box)
4. From the dropdown, select your printer (e.g. "EPSON TM-T20")
5. Make sure the driver on the right says **WinUSB** or **libusb-win32**
6. Click **Install Driver** (or **Replace Driver**)
7. Repeat for any other USB devices you want (cash drawer is usually automatic)

**Find your VID:PID** (if not in the dropdown):
- Open **Device Manager** → **Universal Serial Bus controllers**
- Right-click your printer → Properties → Details tab → Property: **Hardware Ids**
- You'll see `USB\VID_04B8&PID_0202` — the hex values are what you put in `.env`

---

## 5. Start the server

Open PowerShell in `C:\foodics-clone` and run:

```powershell
.\foodics-demo.bat start
```

This will:
1. Start the backend (`tsx watch`) on port 4000
2. Start the frontend (Next.js production) on port 3000
3. Start a Cloudflare Quick Tunnel and give you a public URL
4. Save the URL to `%USERPROFILE%\.minimax\state\foodics-demo\url.txt`

The URL is also printed to the terminal. Bookmark it — that's the address
your cashier's tablet and your phone will use.

Other useful commands:
```powershell
.\foodics-demo.bat status   # show running PIDs + URL
.\foodics-demo.bat stop     # stop everything cleanly
.\foodics-demo.bat dev      # dev mode with HMR (live reload as you edit)
```

---

## 6. Get a stable domain (recommended)

The Quick Tunnel URL changes every time you restart. To get a **fixed
subdomain** (e.g. `abu-zoelf.example.com`), use a **named tunnel**:

### Option A: Your own domain (1 hour setup)

1. Buy a domain (Namecheap / Cloudflare Registrar / GoDaddy)
2. Add it to Cloudflare (free plan) and change the nameservers at your registrar
3. In Cloudflare dashboard → **Zero Trust** → **Networks** → **Tunnels**
4. Create a tunnel, name it `foodics-demo`, copy the token
5. On Windows, run as Administrator:
   ```powershell
   & "$env:USERPROFILE\.minimax\bin\cloudflared.exe" service install <TOKEN>
   ```
6. In Cloudflare, add a public hostname: `abu-zoelf.example.com` → `http://localhost:3000`

Now your app is live at `https://abu-zoelf.example.com` with auto-SSL, and the
URL never changes.

### Option B: Just use the Quick Tunnel URL

If you don't have a domain yet, the Quick Tunnel URL is fine for trying things
out. Just re-share the new URL when you restart the server.

---

## 7. Verify it all works

1. On the Windows PC, open Chrome and visit `http://localhost:3000`
2. Login as `admin@abo-zoelf.com` / `admin123`
3. Go to **Settings → الطابعة الحرارية**
4. Click **🖨️ اطبع صفحة اختبار** — the printer should print a test page
5. On any other device, open the public URL, login, and place a test order
6. After paying, click **🖨️ طباعة الإيصال** in the success modal
7. The receipt should come out of the printer

If the test page doesn't print:
- Check `backend.log` in the logs dir for the actual error
- Open Zadig again and verify the driver is installed
- Try `PRINTER_TYPE=mock` first to confirm the receipt layout

---

## 8. Day-to-day

- **Morning**: Power on the PC + printer. Double-click `foodics-demo.bat` → `start`.
- **Evening**: Close the browser tabs. Optionally `foodics-demo.bat stop`.
- **Backup**: The `backend/scripts/backup-sqlite.sh` (Mac) becomes
  `backup-sqlite.bat` on Windows — see below.

For the daily DB backup on Windows, save this as `backup-sqlite.bat`:

```bat
@echo off
set BACKUP_DIR=%USERPROFILE%\.minimax\backups\foodics-db
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"
set TS=%date:~-4%%date:~3,2%%date:~0,2%-%time:~0,2%%time:~3,2%%time:~6,2%
set TS=%TS: =0%
copy /Y "C:\foodics-clone\backend\prisma\prisma\dev.db" "%BACKUP_DIR%\backup-%TS%.db"
echo backed up to %BACKUP_DIR%\backup-%TS%.db
```

Schedule it via Task Scheduler (Win+R → `taskschd.msc`) at 2am daily.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "no cloudflared" at startup | Download from step 1.6 |
| Printer doesn't react | Check USB cable; re-run Zadig; check Device Manager |
| "libusb" error in backend.log | Vendor/Product ID wrong; re-check with Device Manager |
| Arabic text shows as garbage on the receipt | Set `PRINTER_CHARSET=CP864` (or WPC1256) in `.env`, restart |
| Cash drawer doesn't open | RJ11 cable plugged into printer's **DK** port (not the PC) |
| "address in use" on port 3000/4000 | Another program is holding it. `foodics-demo.bat stop` first, then `start` |
| Public URL keeps changing | Set up a named tunnel (step 6, Option A) |
