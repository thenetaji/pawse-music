# Releasing Pawse

GitHub Actions builds every release: an unsigned IPA for SideStore and a signed APK.

## Make a release
1. Add your changes to `apps/pawse/CHANGELOG.md` under a new heading, e.g. `## [0.4.1] - 2026-10-20`.
2. Commit and push to `main`.
3. Tag and push:
   ```sh
   git tag v0.4.1
   git push origin v0.4.1
   ```
4. Wait about 15 minutes. The **Apps** workflow:
   - builds the iPhone and Android apps,
   - publishes a GitHub Release with the changelog notes,
   - attaches `Pawse-0.4.1.ipa`, `Pawse-0.4.1.apk`, `Pawse.ipa` and `Pawse.apk`,
   - adds the new version to `sources/sidestore.json`.

Installed apps see the new version within a day, or right away from **Settings → About → Check for updates**.

## Version numbers
- `v1.2.3`: major, minor, patch. New features bump the minor, fixes bump the patch.
- Minor and patch must stay below 100 (Android needs a single build number: major×10000 + minor×100 + patch).

## Signing the Android app
The APK is signed with one fixed key, so updates install over the old app. The key lives in four repository secrets (**Settings → Secrets and variables → Actions**):

| Secret | What |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | The keystore file, base64 encoded |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias |
| `ANDROID_KEY_PASSWORD` | Key password |

To make a new key (only for a fork; a new key can't update installs signed with the old one):
```sh
keytool -genkeypair -v -storetype PKCS12 -keystore release.p12 \
  -alias pawse -keyalg RSA -keysize 4096 -validity 10000
base64 -w0 release.p12 | gh secret set ANDROID_KEYSTORE_BASE64
gh secret set ANDROID_KEYSTORE_PASSWORD
gh secret set ANDROID_KEY_ALIAS
gh secret set ANDROID_KEY_PASSWORD
```
Without these secrets the workflow still builds, but the APK is debug-signed.

## iPhone builds
The IPA is unsigned on purpose: SideStore signs it with each person's own Apple ID. No Apple secrets are needed.

## Test build without a release
**Actions → Apps → Run workflow** builds either platform and keeps the files as workflow artifacts.
