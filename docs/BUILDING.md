# Building Pawse

## What you need
- Node 24 and pnpm 10 (`corepack enable` gives you the right pnpm)
- For iPhone: a Mac with Xcode 27
- For Android: JDK 17 and the Android SDK (platform 36, NDK 27.1)

Pawse uses native code (the player, the Dynamic Island, the Android pill), so it runs in a development build, not in Expo Go.

## First run
1. Clone and install:
   ```sh
   git clone https://github.com/thenetaji/pawse-music.git
   cd pawse-music
   pnpm install
   ```
2. Start it on a phone or simulator:
   ```sh
   pnpm --filter pawse exec expo run:ios       # iPhone
   pnpm --filter pawse exec expo run:android   # Android
   ```
3. After the first build, `pnpm dev` starts the JavaScript server and reloads as you edit.

## Checks
Run these before you open a pull request:
```sh
pnpm verify      # types, lint and tests for every package
pnpm format      # format with Biome
```

## Working on screens in a browser
Audio only plays on a phone, but screens render in a browser:
1. `pnpm --filter pawse bundle:web`
2. `node apps/pawse/scripts/preview-server.mjs apps/pawse/.export-web 8733`
3. Open http://localhost:8733. The server also passes YouTube requests through, which browsers would block.

## Where things live
- `apps/pawse/src/app`: screens (Expo Router)
- `apps/pawse/src/features`: Now Playing, the cat, pages, the island
- `apps/pawse/targets/live-activity`: the Dynamic Island and lock screen (Swift)
- `apps/pawse/modules`: native modules for the Live Activity and the Android pill
- `packages/*`: the engine. Keep it free of app imports so it stays reusable.
