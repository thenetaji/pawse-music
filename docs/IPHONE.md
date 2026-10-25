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

## Updates

When a new version is out, Pawse tells you and offers to open SideStore. In SideStore, open **My Apps**, pull down to refresh, then tap **Update** next to Pawse. Your library stays.

Updates only show up for a copy installed from the source (step 2). In **My Apps**, Pawse should say **thenetaji** under its name. If it says **Sideloaded**, see [No Update button](#no-update-button-pawse-says-sideloaded).

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

## Advanced troubleshooting

### No Update button: Pawse says "Sideloaded"

SideStore checks for updates only on apps it installed from a source. If you installed Pawse from a downloaded `.ipa` (with **+** in My Apps, or from the Files app), SideStore doesn't know it came from the Pawse source. **My Apps** then says **Sideloaded** and **No Updates Available**, and the source page shows **FREE** instead of **OPEN**.

Link it to the source once:

1. In Pawse, back up your library: **Settings → Library → Back up library**.
2. In SideStore, open **Sources → Pawse** and tap **FREE**. It installs the newest version over your copy and keeps your library.
3. **My Apps** now shows **thenetaji** under Pawse, and every later version comes with an **Update** button.

### Install or update keeps spinning

SideStore downloads the app, then needs **LocalDevVPN** to install it. When it can't reach the phone, the circle spins forever.

1. Open **LocalDevVPN** and check it says connected; tap **Connect** if not.
2. Close SideStore fully (swipe it away in the app switcher), open it again and tap the button again.
3. Turn off any other VPN, ad blocker or DNS filter for a minute; they can block the download.
4. Restart the iPhone, connect LocalDevVPN, and try once more.

Still spinning? Download **[Pawse.ipa](https://github.com/thenetaji/pawse-music/releases/latest/download/Pawse.ipa)** in Safari and install it from **My Apps → +**. It works, but says **Sideloaded** and won't get updates until you install from the source again (see [No Update button](#no-update-button-pawse-says-sideloaded)).

### SideStore says you've reached the app limit

A free Apple Account allows **3 apps** installed this way at a time, and SideStore counts as one. It also allows **10 App IDs** every 7 days. Pawse uses two: one for the app and one for the Dynamic Island. **My Apps → View App IDs** shows how many are left; each frees up 7 days after it was made.

Updating Pawse or installing it over itself doesn't use a new slot or new App IDs. Installing a third app beside SideStore and Pawse does, so remove one you don't need first.

### Background Refresh doesn't renew the apps

Background Refresh only works while **LocalDevVPN** is connected and iPhone allows SideStore to refresh in the background:

- **Settings → General → Background App Refresh** is on, and on for SideStore.
- **Low Power Mode** is off. It stops background refreshes.
- Open SideStore once every few days anyway. If the time left in **My Apps** keeps going down, tap it to renew by hand.

### Go back to an older version

Every version stays on the [releases page](https://github.com/thenetaji/pawse-music/releases). Download that release's `Pawse.ipa` and install it from SideStore's **My Apps → +**. It installs over the current copy and keeps your library.

A copy installed this way says **Sideloaded** and won't get updates. To go back to updates, install from the source again (see [No Update button](#no-update-button-pawse-says-sideloaded)).

### Start over with a clean install

Only when nothing else works. Deleting Pawse deletes your library with it.

1. Back up your library: **Settings → Library → Back up library**, and save the file in Files or iCloud Drive.
2. Delete Pawse from the Home Screen.
3. Install it again from **SideStore → Sources → Pawse**.
4. Restore: **Settings → Library → Restore backup**, then sign in to YouTube again if you used it.

### Send a useful bug report

Open **Settings → About → Diagnostics** and copy the log. Put it in an [issue](https://github.com/thenetaji/pawse-music/issues/new/choose) with your iPhone model, iOS version, Pawse version (**Settings → About**) and what you tapped before it went wrong.

## Still stuck

Open an [issue](https://github.com/thenetaji/pawse-music/issues/new/choose) and say which step fails and what the screen says. For SideStore or iloader themselves, their [docs](https://docs.sidestore.io) and Discord help faster.

## The Dynamic Island

The cat lives in the Dynamic Island on iPhones that have one (iPhone 14 Pro and newer). Other iPhones get the Lock Screen card. Pick its look in **Settings → Cat → Dynamic Island style**: the cat with sound bars, sound bars only, or the time left.
