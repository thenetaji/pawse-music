# Install Pawse

Every release is built by the **Apps** workflow: pushing a `v1.2.3` tag builds both platforms, attaches `Pawse-1.2.3.ipa` (unsigned) and `Pawse-1.2.3.apk` (release-signed) to a GitHub Release, and adds the IPA to the SideStore source. `Pawse.ipa` and `Pawse.apk` are attached too, so these links always point at the newest release:

- https://github.com/thenetaji/pawse-music/releases/latest/download/Pawse.ipa
- https://github.com/thenetaji/pawse-music/releases/latest/download/Pawse.apk

## iPhone (SideStore, free Apple ID)
1. Install SideStore once with its guide: https://docs.sidestore.io/docs/installation/prerequisites (a computer and a cable, one time).
2. Install **LocalDevVPN** from the App Store and keep it connected while SideStore installs or refreshes apps.
3. In SideStore open **Sources**, tap **+**, and add:
   `https://raw.githubusercontent.com/thenetaji/pawse-music/main/sources/sidestore.json`
4. Install **Pawse** from that source. New releases appear there as updates, and Pawse also offers them itself (Settings → About → Check for updates).
5. Turn on **Background Refresh** in SideStore: free-account apps expire after 7 days unless re-signed.

## Android
- Download `Pawse.apk` from the link above and open it; Pawse offers later updates itself.
- Or use **Obtainium** with the URL `https://github.com/thenetaji/pawse-music`.

Release APKs share one signing key, so updates install over the old app. A debug-signed APK (built without the keystore secrets) cannot update a release-signed install: uninstall it first.

## Moving from the old studio repository
Pawse 0.3.0 and earlier were released from `thenetaji/studio`. Version 0.3.1 is published there too and points the in-app updater here, so updating once is enough. In SideStore, add the new source above and remove the old one.
