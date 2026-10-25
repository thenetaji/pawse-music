# Pawse on iPhone

Pawse isn't on the App Store, and neither is SideStore, the app that installs it. You set SideStore up once with a computer; after that, Pawse installs and updates from your phone.

You need iOS 16.4 or newer (iOS 17 for the Dynamic Island and the Lock Screen card), a free Apple Account, Wi-Fi, and a Mac, Windows or Linux computer for the first step.

## 1. Install SideStore (once)

1. On the iPhone, get **[LocalDevVPN](https://apps.apple.com/app/id6755608044)** from the App Store, open it and tap **Connect**. This is the only App Store app you need.
2. On the computer, download **[iloader](https://iloader.app)**.
   - Windows: install **iTunes** first (Microsoft Store or apple.com).
   - Linux: install `usbmuxd` first (`sudo dnf install usbmuxd` or `sudo apt install usbmuxd`).
3. Plug the iPhone in with a cable. On the phone, tap **Trust** and enter your passcode.
4. In iloader, sign in with your Apple Account, pick your iPhone and choose **Install SideStore (Stable)**.
5. On the iPhone, trust the app: see [Untrusted Developer](#untrusted-developer) below.
6. Open **LocalDevVPN** → **Connect**, then open **SideStore** and sign in with the same Apple Account.

SideStore's own [installation guide](https://docs.sidestore.io/docs/installation/prerequisites) has every step with pictures.

## 2. Install Pawse

1. In SideStore, open **Sources** → tap **+** → paste:
   ```
   https://raw.githubusercontent.com/thenetaji/pawse-music/main/sources/sidestore.json
   ```
2. Tap **Pawse** → **Install**.
3. In SideStore's settings, turn on **Background Refresh**, so Pawse keeps working past 7 days.

**Without SideStore.** Download **[Pawse.ipa](https://github.com/thenetaji/pawse-music/releases/latest/download/Pawse.ipa)** and install it from your computer with **AltStore** or **Sideloadly**. You'll refresh it from the computer every 7 days.

## Keep it working

- **LocalDevVPN must be on** whenever SideStore installs or refreshes an app.
- **The 7-day limit.** A free Apple Account signs apps for 7 days. Open SideStore now and then (or keep Background Refresh on) and it renews them. If Pawse stops opening, open SideStore → **My Apps** → tap **7 DAYS** next to Pawse. Your library stays.
- **Turn off Offload Unused Apps:** **Settings → Apps → App Store → Offload Unused Apps** (on older iOS, **Settings → App Store**). Otherwise iPhone may remove SideStore when storage runs low.

## Fixing problems

### Untrusted Developer

iPhone shows this the first time, and after SideStore is reinstalled.

1. Open **Settings → General → VPN & Device Management**.
2. Under **Developer App**, tap your Apple Account email.
3. Tap **Trust "Apple Development: …"** → **Trust**. The phone needs internet for this.
4. If iPhone asks for **Developer Mode**, turn it on in **Settings → Privacy & Security → Developer Mode**. The phone restarts.
5. Open **LocalDevVPN** → **Connect**, open **SideStore**, and in **My Apps** tap **7 DAYS** next to SideStore. Confirm if it asks about a certificate.

If your email isn't listed under Developer App, or Trust fails, Apple has cancelled that certificate. Install SideStore again with iloader (step 1 above), then trust it.

### SideStore has a cloud icon, or says "not available on the App Store"

iPhone offloaded it: **Offload Unused Apps** removes apps you don't open often and keeps their data. iPhone can't download SideStore back because it never came from the App Store.

Install SideStore again with iloader. It goes over the offloaded copy, so your sources and apps come back. Then turn off **Offload Unused Apps** (see [Keep it working](#keep-it-working)).

### The app won't open after 7 days

The signing ran out. Open **LocalDevVPN** → **Connect**, then SideStore → **My Apps** → tap **7 DAYS** next to the app. If SideStore itself won't open, install it again with iloader.

### Sign-in fails with error -80045

Apple began turning down sign-ins from SideStore's default Anisette server in October 2026. In SideStore's settings, pick a different **Anisette server** (or reset it) and sign in again. The same fix works in iloader.

### Still stuck

Open an [issue](https://github.com/thenetaji/pawse-music/issues/new/choose) and say which step fails and what the screen says. For SideStore or iloader themselves, their [docs](https://docs.sidestore.io) and Discord help faster.

## The Dynamic Island

The cat lives in the Dynamic Island on iPhones that have one (iPhone 14 Pro and newer). Other iPhones get the Lock Screen card. Pick its look in **Settings → Cat → Dynamic Island style**: the cat with sound bars, sound bars only, or the time left.
