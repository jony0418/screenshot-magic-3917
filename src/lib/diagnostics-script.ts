// Vanilla script injected in <head>. It must work even when the React bundle
// fails to load, so it cannot depend on any app module.
export const DIAGNOSTICS_SCRIPT = `(() => {
  var KEY = "coimbec-diag";
  var MAX = 30;
  var panel = null;
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { return []; } }
  function write(list) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX))); } catch (e) {} }
  function assets() {
    var out = [];
    document.querySelectorAll('script[src],link[rel="stylesheet"],link[rel="modulepreload"]').forEach(function (el) {
      var u = el.getAttribute("src") || el.getAttribute("href");
      if (u && u.indexOf("fonts.googleapis") === -1) out.push(u);
    });
    return out;
  }
  function version() {
    var a = assets();
    var hashes = a.map(function (u) {
      var m = u.match(/[-.]([A-Za-z0-9_]{8,})\\.(js|css)/) || u.match(/[?&]v=([^&]+)/) || u.match(/[?&]t=([^&]+)/);
      return m ? m[1] : null;
    }).filter(Boolean);
    return hashes.length ? hashes.slice(0, 4).join(",") : "dev";
  }
  function log(type, message, extra) {
    var entry = {
      at: new Date().toISOString(),
      type: type,
      route: location.pathname + location.search,
      version: version(),
      message: String(message || "").slice(0, 500),
      extra: extra ? String(extra).slice(0, 800) : undefined
    };
    var list = read(); list.push(entry); write(list);
    if (panel) render();
    return entry;
  }
  function isModuleError(msg) {
    return /Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError|Loading chunk/i.test(msg || "");
  }
  window.addEventListener("error", function (ev) {
    var t = ev.target;
    if (t && t !== window && (t.tagName === "SCRIPT" || t.tagName === "LINK")) {
      log("resource", "No se pudo cargar " + t.tagName.toLowerCase(), t.src || t.href);
      show();
      return;
    }
    var msg = ev.message || (ev.error && ev.error.message);
    log(isModuleError(msg) ? "module" : "error", msg, ev.error && ev.error.stack);
    if (isModuleError(msg)) show();
  }, true);
  window.addEventListener("unhandledrejection", function (ev) {
    var r = ev.reason; var msg = (r && r.message) || String(r);
    log(isModuleError(msg) ? "module" : "rejection", msg, r && r.stack);
    if (isModuleError(msg)) show();
  });
  window.addEventListener("vite:preloadError", function (ev) {
    var p = ev.payload; log("module", "Error al precargar módulo", p && (p.message || p));
    show();
  });
  function isBlank() {
    var b = document.body; if (!b) return true;
    var text = (b.innerText || "").replace(/\\s+/g, "");
    return text.length < 3 && !b.querySelector("img,svg,canvas,input,button");
  }
  function check(label) {
    if (isBlank()) { log("blank", "Pantalla en blanco detectada (" + label + ")", assets().join("\\n")); show(); }
  }
  window.addEventListener("load", function () { setTimeout(function () { check("carga inicial"); }, 5000); });
  var lastPath = location.pathname;
  setInterval(function () {
    if (location.pathname !== lastPath) { lastPath = location.pathname; setTimeout(function () { check("navegación"); }, 4000); }
  }, 1000);
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey && e.shiftKey && (e.key === "D" || e.key === "d")) { e.preventDefault(); panel ? hide() : show(); }
  });
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>]/g, function (c) { return {"&":"&amp;","<":"&lt;",">":"&gt;"}[c]; }); }
  function render() {
    var list = read().slice().reverse();
    var rows = list.length ? list.map(function (e) {
      return '<div style="border-top:1px solid #333;padding:6px 0"><div style="color:#7dd3c0">' + esc(e.at.replace("T"," ").slice(0,19)) + ' · ' + esc(e.type) + ' · ' + esc(e.route) + '</div><div>' + esc(e.message) + '</div><div style="color:#999">versión: ' + esc(e.version) + '</div>' + (e.extra ? '<pre style="white-space:pre-wrap;color:#aaa;margin:2px 0 0;font-size:10px;max-height:80px;overflow:auto">' + esc(e.extra) + '</pre>' : '') + '</div>';
    }).join("") : '<div style="color:#999;padding:6px 0">Sin eventos registrados.</div>';
    panel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px"><strong>Diagnóstico · Coimbec</strong><span style="display:flex;gap:4px">' +
      '<button data-a="reload">Recargar</button><button data-a="copy">Copiar</button><button data-a="clear">Limpiar</button><button data-a="close">✕</button></span></div>' +
      '<div style="color:#bbb">Ruta actual: ' + esc(location.pathname) + '<br>Versión de recursos: ' + esc(version()) + '<br>Navegador: ' + esc(navigator.userAgent.slice(0, 90)) + '</div>' + rows;
    panel.querySelectorAll("button").forEach(function (b) {
      b.style.cssText = "background:#222;color:#eee;border:1px solid #444;border-radius:4px;padding:2px 8px;font:inherit;cursor:pointer";
      b.onclick = function () {
        var a = b.getAttribute("data-a");
        if (a === "reload") location.reload();
        if (a === "clear") { write([]); render(); }
        if (a === "close") hide();
        if (a === "copy") { var t = JSON.stringify({ route: location.pathname, version: version(), assets: assets(), events: read() }, null, 2); navigator.clipboard && navigator.clipboard.writeText(t); b.textContent = "Copiado"; }
      };
    });
  }
  function show() {
    if (!document.body) { document.addEventListener("DOMContentLoaded", show); return; }
    if (!panel) {
      panel = document.createElement("div");
      panel.setAttribute("data-diagnostics", "");
      panel.className = "no-print";
      panel.style.cssText = "position:fixed;right:12px;bottom:12px;z-index:2147483647;width:min(460px,calc(100vw - 24px));max-height:60vh;overflow:auto;background:#111;color:#eee;font:12px/1.4 ui-monospace,monospace;border:1px solid #444;border-radius:8px;padding:10px;box-shadow:0 8px 30px rgba(0,0,0,.4)";
      document.body.appendChild(panel);
    }
    render();
  }
  function hide() { if (panel) { panel.remove(); panel = null; } }
  window.__coimbecDiag = { log: log, show: show, hide: hide, read: read };
})();`;
