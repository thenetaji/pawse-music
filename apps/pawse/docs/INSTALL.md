# Install Pawse

The steps for every device, the list of release files and what each one is for are in the [README](../../../README.md#install). Backups and moving to a new app are in [Keep your library safe](../../../README.md#keep-your-library-safe) and [Moving to the new Pawse app](../../../README.md#moving-to-the-new-pawse-app-iphone-and-android).

This page only holds the extra notes for sideloading.

## How releases are made

Pushing a `v1.2.3` tag runs the **Apps** workflow. It builds the iPhone, Android, Mac, Windows and Linux apps and attaches them to a GitHub Release. It also adds the IPA to the SideStore source.

Every file is attached twice, with the version (`Pawse-1.2.3.apk`) and without it (`Pawse.apk`), so these links always point at the newest release:

- https://github.com/thenetaji/pawse-music/releases/latest/download/Pawse.ipa
- https://github.com/thenetaji/pawse-music/releases/latest/download/Pawse.apk

The IPA is unsigned (SideStore signs it on the phone). The APK is release-signed.

## iPhone (SideStore)
- Install **LocalDevVPN** from the App Store and keep it connected while SideStore installs or refreshes apps.
- New releases show up in the SideStore source as updates. Pawse also offers them itself (**Settings → About → Check for updates**).
- Free Apple ID apps stop opening after 7 days. Open SideStore and refresh Pawse, or turn on **Background Refresh**.

## Android
- Or use **Obtainium** with the URL `https://github.com/thenetaji/pawse-music`.
- Release APKs share one signing key, so updates install over the old app. A debug-signed APK (built without the keystore secrets) cannot update a release-signed install: uninstall it first.

## Moving from the old studio repository
Pawse 0.3.0 and earlier were released from `thenetaji/studio`. Version 0.3.1 is published there too and points the in-app updater here, so updating once is enough. In SideStore, add the new source from the README and remove the old one.
