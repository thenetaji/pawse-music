// Page-side BotGuard runner, sent into the sandbox before the first run. Ported from BgUtils by LuanRT
// (MIT, BotGuardClient + WebPoMinter) and Metrolist's po_token.html (GPL-3.0, minter built once, awaited getMinter).

/**
 * Defines `window.__pawseBg` (once per page) with promise-returning `start(challenge)` (BotGuard snapshot),
 * `unlock(integrityToken)` (builds the minter once) and `mint(binding)` (web-safe base64 token).
 */
export const BOTGUARD_PAGE_JS = `(function () {
  if (window.__pawseBg) return;
  var noop = function () {};
  var st = { out: null, mint: null };
  function timed(p, ms, what) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error(what + " timed out")); }, ms);
      p.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }
  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = url;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error("BotGuard interpreter did not load")); };
      (document.head || document.documentElement).appendChild(s);
    });
  }
  function fromB64(t) {
    var bin = atob(t.split("-").join("+").split("_").join("/").split(".").join("="));
    var u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }
  function toB64(u) {
    var bin = "";
    for (var i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]);
    return btoa(bin).split("+").join("-").split("/").join("_");
  }
  window.__pawseBg = {
    start: function (ch) {
      var out = [];
      st = { out: out, mint: null };
      if (ch.ytcfg) { window.yt = window.yt || {}; window.yt.config_ = ch.ytcfg; }
      var load = ch.interpreterJs
        ? Promise.resolve().then(function () { new Function(ch.interpreterJs)(); })
        : loadScript(ch.interpreterUrl);
      var run = load.then(function () {
        var vm = window[ch.globalName];
        if (!vm || typeof vm.a !== "function") throw new Error("BotGuard VM unavailable");
        return new Promise(function (resolve) {
          // Same arguments as BgUtils' BotGuardClient#load: telemetry callback, experiment lists, loggers.
          vm.a(ch.program, function (snapshot) { resolve(snapshot); }, true, undefined, noop,
            [[], []], undefined, false, [noop, noop, noop, noop, noop]);
        });
      }).then(function (snapshot) {
        return new Promise(function (resolve) { snapshot(resolve, [undefined, undefined, out, undefined]); });
      });
      return timed(run, ch.timeoutMs || 10000, "BotGuard").then(function (response) {
        if (typeof out[0] !== "function") throw new Error("PMD:Undefined");
        if (typeof response !== "string" || !response) throw new Error("BotGuard gave no response");
        return response;
      });
    },
    unlock: function (token) {
      var getMinter = st.out && st.out[0];
      if (typeof getMinter !== "function") return Promise.reject(new Error("PMD:Undefined"));
      return Promise.resolve(getMinter(fromB64(token))).then(function (m) {
        if (typeof m !== "function") throw new Error("APF:Failed");
        st.mint = m;
        return true;
      });
    },
    mint: function (binding) {
      if (!st.mint) return Promise.reject(new Error("BotGuard minter not ready"));
      return Promise.resolve(st.mint(new TextEncoder().encode(binding))).then(function (r) {
        if (!(r instanceof Uint8Array)) throw new Error("ODM:Invalid");
        return toB64(r);
      });
    }
  };
})();`;
