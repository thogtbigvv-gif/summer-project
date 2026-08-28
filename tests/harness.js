// ===================== ТЕСТИЙН ТУЛГУУР =====================
// Апп бол vanilla <script> файлууд — build ч, хамаарал ч байхгүй. Тестийг
// ажиллуулахын тулд ХӨТЧИЙГ бүтнээр нь дуурайх шаардлагагүй: нотолгооноос
// тоо гаргах давхарга (status.js) болон хадгалалт (bridge.js) нь DOM-д
// ХҮРДЭГГҮЙ, тиймээс жижиг stub хангалттай.
//
// БҮХ файлыг НЭГ script болгон нийлүүлнэ: vm дотор top-level const/let нь
// context объект дээр гарч ирдэггүй тул салангид ачаалбал тестээс хүрэх
// аргагүй болно. Төгсгөлд нь __api дамжуулагч тавьж, хэрэгтэй нэрсийг гаргана.

// Хөтчийн орчныг дуурайлган апп-ын скриптүүдийг Node дээр ажиллуулна.
// БҮХ файлыг НЭГ script болгон нийлүүлнэ — эс тэгвээс top-level const/let нь
// vm-ийн context объект дээр гарч ирдэггүй тул тестээс хүрэх аргагүй болно.
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");

function stubNode() {
  const n = {
    _h: "", _t: "", children: [],
    style: { setProperty(){}, cssText: "" },
    classList: { _s: new Set(),
      add(...c){ c.forEach(x => n.classList._s.add(x)); },
      remove(...c){ c.forEach(x => n.classList._s.delete(x)); },
      toggle(c, on){ on ? n.classList._s.add(c) : n.classList._s.delete(c); },
      contains(c){ return n.classList._s.has(c); } },
    dataset: {},
    appendChild(c){ n.children.push(c); return c; },
    addEventListener(){}, setAttribute(){}, removeAttribute(){},
    querySelectorAll(){ return []; }, querySelector(){ return null; },
    closest(){ return null; }, focus(){}, remove(){}, value: ""
  };
  Object.defineProperty(n, "innerHTML", { get(){ return n._h; }, set(v){ n._h = String(v); } });
  Object.defineProperty(n, "textContent", {
    get(){ return n._t; },
    set(v){ n._t = String(v);
            n._h = String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  });
  return n;
}

function makeCtx(opts = {}) {
  const store = {};
  const localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
  const nodes = opts.nodes || {};
  const document = {
    createElement: () => stubNode(),
    getElementById: id => (id in nodes ? nodes[id] : null),
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener: () => {},
    hidden: false
  };
  const ctx = {
    console, localStorage, document, JSON, Math, Date, Number, String, Boolean,
    Object, Array, Set, Map, Promise, Error, RegExp,
    isFinite, isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval,
    requestAnimationFrame: fn => fn(), confirm: () => true, alert: () => {}
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  ctx.window.addEventListener = () => {};
  ctx.__store = store;
  ctx.__nodes = nodes;
  vm.createContext(ctx);
  return ctx;
}

// Экспортлох нэрсийг НЭГ script-ийн төгсгөлд globalThis дээр гаргана.
const EXPORTS = [
  "defaultWebData", "METRIC_DEFS", "METRICS", "Status", "BRIDGE_SOURCES",
  "cloneDefault", "todayStr", "escapeHTML", "formatDelta", "tierForPct",
  "loadWebData", "saveWebData", "STORAGE_KEY",
  "rollUpEvidence", "pruneEvidence", "getIntegrationState", "syncAll",
  "renderCategories", "renderQuests", "renderSkills", "renderMissionTasks",
  "renderConnectedApps", "AnalyticsEngine", "questProgress", "SKILL_CAT",
  "questsWithProgress", "connectedEvidenceHtml", "provenanceHtml",
  "missionTaskState", "missionTasksWithState", "toggleMissionTask",
  "recordSelfCheckin", "removeSelfCheckin", "selfCheckinId", "selfCheckinIds",
  "SELF_APP", "ATTR_HEX", "verifiableMetricIds",
  "evidenceRecordCount", "importWebData", "storageWarning", "isQuotaError",
  "addMissionTask", "deleteMissionTask", "todaysEvidenceText",
  "getFilteredSortedQuests", "buildIntegrityRows", "renderWebUI"
];

function load(ctx, files) {
  const src = files.map(f => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n;\n");
  const footer = `
;globalThis.__api = {
  get webData(){ return webData; },
  set webData(v){ webData = v; },
${EXPORTS.map(n => `  get ${n}(){ return typeof ${n} === "undefined" ? undefined : ${n}; }`).join(",\n")}
};`;
  vm.runInContext(src + footer, ctx, { filename: files.join("+") });
  return ctx.__api;
}

// Тестүүдэд байнга хэрэгтэй: "N хоногийн өмнөх" орон нутгийн цаг.
function ago(days, hour = 12) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

module.exports = { makeCtx, load, stubNode, ago, ROOT };
