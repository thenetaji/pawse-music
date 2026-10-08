# Install Flow

Releases come from the **Apps** workflow: pushing a `flow-v1.2.3` tag builds both platforms, attaches `Flow-1.2.3.ipa` (unsigned) and `Flow-1.2.3.apk` (release-signed) to a GitHub Release, and adds the IPA to the SideStore source.

## iPhone (SideStore, free Apple ID)
1. Install SideStore once with its guide: https://docs.sidestore.io/docs/installation/prerequisites (a computer and a cable, one time).
2. Install **LocalDevVPN** from the App Store and keep it connected while SideStore installs or refreshes apps; it replaces the old WireGuard setup.
3. In SideStore open **Sources**, tap **+**, and add:
   `https://raw.githubusercontent.com/thenetaji/studio/main/sources/sidestore.json`
4. Install **Flow** from that source. New releases appear there as updates.
5. Turn on **Background Refresh** in SideStore: free-account apps expire after 7 days unless re-signed.

A one-off IPA from a manual workflow run (the run's **ipa** artifact) installs with **My Apps → +**.

## Android
- **Obtainium** (updates itself): add the app with the URL `https://github.com/thenetaji/studio`, and set the APK filter to `Flow-.*\.apk` so Finance releases are skipped.
- Or download `Flow-<version>.apk` from the repo's Releases page and open it.

Release APKs share one signing key, so updates install over the old app. A debug-signed APK (built without the keystore secrets) cannot update a release-signed install: uninstall first.
