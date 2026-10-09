#!/usr/bin/env node
// CI helpers for .github/workflows/apps.yml. Usage: node tooling/ci/apps.mjs <meta|stamp|sign-android|codesign-ios|sidestore> [...]
import { spawnSync } from "node:child_process";
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
  // Pushes to main build Flow (no release) to warm the shared caches.
  let app =
    env.INPUT_APP || (env.GITHUB_REF === "refs/heads/main" ? "flow" : "");
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
            storeType 'pkcs12'
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

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  if (r.status !== 0 && !opts.soft)
    fail(`${cmd} ${args.join(" ")} failed: ${r.stderr || r.stdout || ""}`);
  return r;
};

function walk(dir, skip, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, skip, out);
    else out.push(p);
  }
  return out;
}

// Writes a copy of an entitlements plist with build-setting variables resolved (ad-hoc has no team prefix).
function resolveEntitlements(file, bundleDir, tag) {
  let src = fs.readFileSync(file, "utf8");
  if (src.includes("$(")) {
    const id = run(
      "plutil",
      [
        "-extract",
        "CFBundleIdentifier",
        "raw",
        "-o",
        "-",
        path.join(bundleDir, "Info.plist"),
      ],
      { soft: true },
    ).stdout?.trim();
    src = src.replace(
      /\$\((?:AppIdentifierPrefix|TeamIdentifierPrefix)\)/g,
      "",
    );
    if (id)
      src = src.replace(
        /\$\((?:PRODUCT_BUNDLE_IDENTIFIER|CFBundleIdentifier)\)/g,
        id,
      );
    if (src.includes("$(")) {
      console.log(`::warning::Dropping unresolved variables in ${file}`);
      src = src
        .split("\n")
        .filter((l) => !l.includes("$("))
        .join("\n");
    }
  }
  const out = path.join(env.RUNNER_TEMP || "/tmp", `${tag}.entitlements`);
  fs.writeFileSync(out, src);
  run("plutil", ["-lint", out]);
  return out;
}

// Ad-hoc signs the archived .app inside-out (frameworks, extensions, app) so SideStore can read the App Group.
function codesignIos() {
  const appsDir = "build/App.xcarchive/Products/Applications";
  const apps = fs.existsSync(appsDir)
    ? fs.readdirSync(appsDir).filter((n) => n.endsWith(".app"))
    : [];
  if (!apps.length) fail("No .app in the archive");
  const app = path.join(appsDir, apps[0]);
  const sign = (target, ent) => {
    const args = ["--force", "--sign", "-", "--timestamp=none"];
    if (ent) args.push("--entitlements", ent);
    console.log(`codesign ${args.join(" ")} ${target}`);
    run("codesign", [...args, target]);
  };
  const signFrameworks = (bundle) => {
    const dir = path.join(bundle, "Frameworks");
    if (!fs.existsSync(dir)) return;
    for (const n of fs.readdirSync(dir)) sign(path.join(dir, n));
  };
  const skip = new Set(["Pods", "build", "node_modules"]);
  const mainEnt = path.join(
    "ios",
    env.APP_NAME,
    `${env.APP_NAME}.entitlements`,
  );
  const others = walk("ios", skip).filter(
    (f) => f.endsWith(".entitlements") && f !== mainEnt,
  );

  signFrameworks(app);
  const plugDir = path.join(app, "PlugIns");
  const appexes = fs.existsSync(plugDir)
    ? fs.readdirSync(plugDir).filter((n) => n.endsWith(".appex"))
    : [];
  for (const n of appexes) {
    const appex = path.join(plugDir, n);
    const name = n.slice(0, -".appex".length);
    const found =
      others.find((f) => f.split(path.sep).includes(name)) ??
      others.find((f) => f.toLowerCase().includes(name.toLowerCase())) ??
      (others.length === 1 && appexes.length === 1 ? others[0] : undefined);
    signFrameworks(appex);
    if (found) sign(appex, resolveEntitlements(found, appex, name));
    else {
      console.log(`::warning::No entitlements file for ${n}; signing without`);
      sign(appex);
    }
  }
  if (fs.existsSync(mainEnt))
    sign(app, resolveEntitlements(mainEnt, app, "app"));
  else {
    console.log(
      `::warning::${mainEnt} is missing; signing the app without entitlements`,
    );
    sign(app);
  }

  for (const t of [app, ...appexes.map((n) => path.join(plugDir, n))]) {
    console.log(`::group::Entitlements of ${t}`);
    const r = run("codesign", ["-d", "--entitlements", ":-", t], {
      soft: true,
    });
    console.log(r.stdout, r.stderr);
    console.log("::endgroup::");
  }
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
else if (cmd === "codesign-ios") codesignIos();
else if (cmd === "sidestore") sidestore(arg);
else fail(`Unknown command ${cmd}`);
