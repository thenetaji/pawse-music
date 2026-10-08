#!/usr/bin/env node
// CI helpers for .github/workflows/apps.yml. Usage: node tooling/ci/apps.mjs <meta|stamp|sign-android|sidestore> [...]
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const env = process.env;
const appJson = (app) => path.join(root, "apps", app, "app.json");
const readExpo = (app) =>
  JSON.parse(fs.readFileSync(appJson(app), "utf8")).expo;
const fail = (msg) => {
  console.error(`::error::${msg}`);
  process.exit(1);
};

function output(values) {
  const lines = Object.entries(values).map(([k, v]) => `${k}=${v}`);
  if (env.GITHUB_OUTPUT)
    fs.appendFileSync(env.GITHUB_OUTPUT, lines.join("\n") + "\n");
  console.log(lines.join("\n"));
}

// Tag `<app>-v1.2.3` builds both platforms and releases; manual runs take the inputs.
function meta() {
  const tag = env.GITHUB_REF_TYPE === "tag" ? env.GITHUB_REF_NAME : "";
  let app = env.INPUT_APP;
  let platforms = env.INPUT_PLATFORMS || "both";
  let version;
  let versionCode;
  if (tag) {
    const m = /^([a-z0-9-]+)-v(\d+)\.(\d+)\.(\d+)$/.exec(tag);
    if (!m) fail(`Tag ${tag} is not <app>-v<major>.<minor>.<patch>`);
    const [, a, major, minor, patch] = m;
    if (+minor > 99 || +patch > 99)
      fail(
        "minor and patch must be below 100 (versionCode = major*10000+minor*100+patch)",
      );
    app = a;
    platforms = "both";
    version = `${+major}.${+minor}.${+patch}`;
    versionCode = +major * 10000 + +minor * 100 + +patch;
  }
  if (!app || !fs.existsSync(appJson(app))) fail(`Unknown app "${app}"`);
  const expo = readExpo(app);
  version ??= expo.version;
  versionCode ??= Number(env.GITHUB_RUN_NUMBER || 1);
  const deps =
    JSON.parse(
      fs.readFileSync(path.join(root, "apps", app, "package.json"), "utf8"),
    ).dependencies ?? {};
  output({
    app,
    name: expo.name,
    version,
    version_code: versionCode,
    bundle_id: expo.ios?.bundleIdentifier ?? "",
    skia: String("@shopify/react-native-skia" in deps),
    ios: String(platforms !== "android"),
    android: String(platforms !== "ios"),
    release: String(Boolean(tag)),
  });
}

// Writes the build's version into app.json (CI checkout only) before prebuild.
function stamp() {
  const file = appJson(env.APP);
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  json.expo.version = env.VERSION;
  json.expo.ios = { ...json.expo.ios, buildNumber: String(env.VERSION_CODE) };
  json.expo.android = {
    ...json.expo.android,
    versionCode: Number(env.VERSION_CODE),
  };
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
}

// Adds a release signingConfig fed by env vars and points the release build type at it.
function signAndroid(gradleFile) {
  let src = fs.readFileSync(gradleFile, "utf8");
  const release = `        release {
            storeFile file(System.getenv('ANDROID_KEYSTORE_PATH'))
            storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')
            keyAlias System.getenv('ANDROID_KEY_ALIAS')
            keyPassword System.getenv('ANDROID_KEY_PASSWORD')
        }
`;
  const configs = src.indexOf("signingConfigs {");
  const types = src.indexOf("buildTypes {");
  if (configs < 0 || types < 0)
    fail(`No signingConfigs/buildTypes in ${gradleFile}`);
  const at = src.indexOf("\n", configs) + 1;
  src = src.slice(0, at) + release + src.slice(at);
  const typesAt = src.indexOf("buildTypes {");
  const releaseType = src.indexOf("release {", typesAt);
  const debugRef = src.indexOf(
    "signingConfig signingConfigs.debug",
    releaseType,
  );
  if (releaseType < 0 || debugRef < 0)
    fail("Release build type has no debug signingConfig to replace");
  src =
    src.slice(0, debugRef) +
    "signingConfig signingConfigs.release" +
    src.slice(debugRef + "signingConfig signingConfigs.debug".length);
  fs.writeFileSync(gradleFile, src);
  console.log(`Release signing configured in ${gradleFile}`);
}

// Adds this release to the AltStore/SideStore source (newest version first).
function sidestore(ipaPath) {
  const file = path.join(root, "sources", "sidestore.json");
  const expo = readExpo(env.APP);
  const repo = env.GITHUB_REPOSITORY;
  const [owner] = repo.split("/");
  const source = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, "utf8"))
    : {
        name: "Studio",
        identifier: `com.${owner}.studio`,
        subtitle: `Apps by ${owner}`,
        apps: [],
        news: [],
      };
  let entry = source.apps.find(
    (a) => a.bundleIdentifier === expo.ios.bundleIdentifier,
  );
  if (!entry) {
    entry = {
      name: expo.name,
      bundleIdentifier: expo.ios.bundleIdentifier,
      developerName: owner,
      localizedDescription: expo.name,
      iconURL: `https://raw.githubusercontent.com/${repo}/${env.DEFAULT_BRANCH || "main"}/apps/${env.APP}/assets/images/icon.png`,
      versions: [],
    };
    source.apps.push(entry);
  }
  entry.versions = entry.versions.filter((v) => v.version !== env.VERSION);
  entry.versions.unshift({
    version: env.VERSION,
    buildVersion: String(env.VERSION_CODE),
    date: new Date().toISOString().slice(0, 10),
    downloadURL: `https://github.com/${repo}/releases/download/${env.TAG}/${path.basename(ipaPath)}`,
    size: fs.statSync(ipaPath).size,
    minOSVersion: "16.4",
  });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(source, null, 2) + "\n");
  console.log(`sources/sidestore.json: ${expo.name} ${env.VERSION}`);
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === "meta") meta();
else if (cmd === "stamp") stamp();
else if (cmd === "sign-android") signAndroid(arg);
else if (cmd === "sidestore") sidestore(arg);
else fail(`Unknown command ${cmd}`);
