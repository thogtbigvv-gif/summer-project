"use strict";

// ===================== GENERIC APP BRIDGE (READ-ONLY) =====================
// Холбогдсон аппууд (Bigu, Дасгал, ирээдүйд бусад нь) ижил GitHub Pages origin
// дээр байрладаг тул localStorage-оо энэ апптай хуваалцдаг. Тэд тус бүр өөрийн
// түлхүүрт НЭГ ЧИГЛЭЛТ фийд бичдэг. Энд бид түүнийг ЗӨВХӨН УНШИЖ XP болгон хөрвүүлнэ.
// Аль ч гүүрийн түлхүүр рүү ХЭЗЭЭ Ч бичихгүй.
//
// Нийтлэг гэрээ (JSON) — апп бүр адилхан:
//   { v: 1, updatedAt: <ms>,
//     status: { ... апп юу ч хүсвэл — бид бүтнээр нь хадгална, тайлбарлахгүй },
//     events: [ { id, at, type, value, detail } ... ] }
//
// Түлхүүр байхгүй, гэмтсэн, эсвэл v !== 1 бол тэр эх сурвалжийг чимээгүй алгасна —
// апп өнөөдрийнхтэй яг адилхан ажиллана.
//
// ШИНЭ АПП НЭМЭХ: BRIDGE_SOURCES-д НЭГ мөр + XP_RULES-д дүрмүүдээ нэмнэ. Өөр код бичихгүй.

const BRIDGE_SOURCES = [
    { app: "bigu", key: "bigu:bridge", label: "Bigu", skillId: 101,          categoryId: "learning" },
    { app: "gym",  key: "gym:bridge",  label: "Gym",  skillId: GYM_SKILL_ID, categoryId: "fitness"  }
];

// XP-ийн БҮХ шийдвэр энэ хүснэгтэд байна, өөр хаана ч биш.
// Түлхүүр: `${app}:${event.type}` — утга: event-ээс XP тооцох функц.
const XP_RULES = {
    "bigu:review.session": e => 5 + Math.round(e.value * 0.5),
    "bigu:lesson.quiz":    e => 5,
    "gym:workout.completed": e => 25,
    "gym:workout.partial":   e => 10
};

const BRIDGE_SYNCED_ID_CAP = 200;  // integrations[app].syncedIds-д үлдээх ID-ийн тоо
const BRIDGE_LOG_CAP       = 50;   // integrations[app].log-д үлдээх бичлэгийн тоо
const BRIDGE_MAX_EVENTS    = 500;  // нэг эх сурвалжаас нэг удаад боловсруулах дээд хязгаар

// ===================== ФИЙД УНШИХ =====================

function bridgeText(value) {
    return typeof value === "string" ? value.trim() : "";
}

function bridgeNum(value) {
    const n = Number(value);
    return isFinite(n) ? n : 0;
}

// Event-ийг цэвэрлэж найдвартай хэлбэрт хөрвүүлнэ. id байхгүй бол null
// (id нь давхардлын хамгаалалтын үндэс — түүнгүйгээр XP дахин дахин олгогдоно).
function normalizeBridgeEvent(raw) {
    if (!raw || typeof raw !== "object") return null;

    const id = bridgeText(raw.id);
    if (!id) return null;

    return {
        id,
        at:     bridgeNum(raw.at),
        type:   bridgeText(raw.type),
        value:  bridgeNum(raw.value),   // XP_RULES-д e.value ашиглагдана — үргэлж тоо байх ёстой
        detail: bridgeText(raw.detail)
    };
}

// Хамгаалалттай унших + parse. Хүлээгдсэнээс өөр юм ирвэл null.
function readBridgeFeed(key) {
    try {
        if (typeof localStorage === "undefined") return null;

        const raw = localStorage.getItem(key);
        if (!raw || typeof raw !== "string") return null;

        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
        if (parsed.v !== 1) return null;

        // Хуучнаас нь шинэ рүү эрэмбэлнэ — ингэснээр syncedIds-ийн таслалт
        // ХАМГИЙН СҮҮЛИЙН event-үүдийг үлдээнэ.
        let events = Array.isArray(parsed.events)
            ? parsed.events.map(normalizeBridgeEvent).filter(Boolean).sort((a, b) => a.at - b.at)
            : [];
        if (events.length > BRIDGE_MAX_EVENTS) events = events.slice(-BRIDGE_MAX_EVENTS);

        // status-ыг БҮТНЭЭР нь дамжуулна. Дотор нь юу байгааг энэ давхарга мэдэхгүй.
        const status = (parsed.status && typeof parsed.status === "object" && !Array.isArray(parsed.status))
            ? parsed.status
            : null;

        return { status, updatedAt: bridgeNum(parsed.updatedAt), events };
    } catch (err) {
        console.warn(`readBridgeFeed: "${key}" уншиж чадсангүй —`, err);
        return null;
    }
}

// ===================== ТӨЛӨВ =====================

// webData.integrations[app]-г шаардлагатай бол үүсгээд буцаана.
function getIntegrationState(app) {
    if (!webData.integrations || typeof webData.integrations !== "object") webData.integrations = {};

    let state = webData.integrations[app];
    if (!state || typeof state !== "object" || Array.isArray(state)) {
        state = webData.integrations[app] = { status: null, updatedAt: 0, syncedIds: [], log: [], lastSyncedAt: null };
    }
    if (!Array.isArray(state.syncedIds)) state.syncedIds = [];
    if (!Array.isArray(state.log))       state.log       = [];
    return state;
}

// Event-ийн XP-г дүрмийн хүснэгтээс тооцно. Дүрэм байхгүй / гэмтэлтэй бол 0.
function bridgeXpFor(app, event) {
    const rule = XP_RULES[`${app}:${event.type}`];
    if (typeof rule !== "function") return 0;
    try {
        const xp = Math.floor(Number(rule(event)));
        return isFinite(xp) && xp > 0 ? xp : 0;
    } catch (err) {
        console.warn(`XP_RULES["${app}:${event.type}"] алдаа —`, err);
        return 0;
    }
}

// ===================== SYNC =====================

// Бүх эх сурвалжийг уншиж, шинэ event бүрийг XP болгоно.
// Юу ч байхгүй бол чимээгүй. Буцаах утга: { awarded, events }
async function syncAll() {
    const result = { awarded: 0, events: 0 };

    try {
        if (!webData || !Array.isArray(webData.skills)) return result;

        let touched = false;
        const parts = [];

        for (const source of BRIDGE_SOURCES) {
            const feed = readBridgeFeed(source.key);
            if (!feed) continue;   // байхгүй / гэмтсэн / v !== 1 — чимээгүй алгасна

            const state = getIntegrationState(source.app);

            // status-г бүтнээр нь хадгална — фийд уншигдсан л бол шинэчилнэ.
            state.status    = feed.status;
            state.updatedAt = feed.updatedAt;
            touched = true;

            const synced = new Set(state.syncedIds);
            let appAwarded = 0;
            let appEvents  = 0;

            for (const event of feed.events) {
                if (synced.has(event.id)) continue;

                // Дүрэм байхгүй event-ийг ч бүртгэнэ — зүгээр л 0 XP-тэй.
                const xp = bridgeXpFor(source.app, event);
                let awarded = 0;

                if (xp > 0) {
                    // awardSkillXp өөрөө logDailyActivity-г дуудна, тиймээс энд дахин лог
                    // бичихгүй. defer → хадгалалтыг төгсгөлд НЭГ УДАА хийнэ.
                    const res = awardSkillXp(source.skillId, xp, {
                        silent:     true,
                        defer:      true,
                        categoryId: source.categoryId
                    });
                    if (res) {
                        addGlobalXp(xp);
                        awarded = xp;
                    }
                }

                state.log.push({ id: event.id, at: event.at, type: event.type, detail: event.detail, xp: awarded });
                state.syncedIds.push(event.id);
                synced.add(event.id);

                appAwarded += awarded;
                appEvents  += 1;
            }

            if (state.syncedIds.length > BRIDGE_SYNCED_ID_CAP) {
                state.syncedIds = state.syncedIds.slice(-BRIDGE_SYNCED_ID_CAP);
            }
            if (state.log.length > BRIDGE_LOG_CAP) {
                state.log = state.log.slice(-BRIDGE_LOG_CAP);
            }
            state.lastSyncedAt = Date.now();

            result.awarded += appAwarded;
            result.events  += appEvents;
            if (appEvents > 0) parts.push(`${source.label} +${appAwarded}XP/${appEvents}`);
        }

        // Хадгалалт: event тус бүрд биш, БҮХ эх сурвалжийг дуусгасны дараа НЭГ УДАА.
        if (touched) await saveWebData();

        if (result.events > 0) {
            console.log(`[bridge] +${result.awarded} XP, ${result.events} event — ${parts.join(", ")}`);
            // UI биш — зүгээр л дэлгэц дээрх тоог төлөвтэй нь тэнцүүлэх (boot-оос хойш
            // ирсэн XP-г focus/storage үед хуучин хэвээр үлдээхгүйн тулд).
            if (typeof renderWebUI === "function") renderWebUI();
        }
    } catch (err) {
        console.error("syncAll error:", err);
        return { awarded: 0, events: 0 };
    }

    return result;
}

// ===================== ХӨДӨЛГӨГЧ =====================
// Boot-ыг script.js-ийн init() дуудна (loadWebData дууссаны дараа байх ёстой).
// Focus/storage-г энд бүртгэнэ — ингэснээр шинэ апп нэмэхэд script.js хөндөгдөхгүй.

window.addEventListener("focus", () => { syncAll(); });

window.addEventListener("storage", (e) => {
    // Өөрсдийн хадгалалт болон хамаагүй түлхүүрүүдээс болж синк ажиллуулахгүй.
    if (e && e.key && !BRIDGE_SOURCES.some(s => s.key === e.key)) return;
    syncAll();
});

// ===================== UI: "CONNECTED" САМБАР =====================
// Апп бүрд НЭГ карт — бүгдийг нь webData.integrations[app]-аас барина. Энэ рендер
// нь ямар ч аппын талбарын нэрийг МЭДЭХГҮЙ: status дотор юу ирснийг тэр чигээр нь
// key/value болгон харуулна. Тиймээс шинэ апп нэмэхэд энд ч юу ч засах шаардлагагүй.

const CONNECTED_STALE_MS     = 3 * 24 * 60 * 60 * 1000;  // үүнээс хуучин бол бүдгэрүүлнэ
const CONNECTED_LOG_SHOWN    = 5;    // хөлд харуулах сүүлийн бичлэгийн тоо
const CONNECTED_STATUS_ROWS  = 12;   // нэг картад харуулах status мөрийн дээд тоо
const CONNECTED_STATUS_DEPTH = 3;    // status-ыг задлах гүн
const CONNECTED_STATUS_NODES = 200;  // гэмтэлтэй/асар том status-аас хамгаалах хязгаар

// "2 hours ago" маягийн харьцангуй хугацаа. Хугацаа байхгүй/буруу бол null.
function relativeTime(ms) {
    const t = Number(ms);
    if (!isFinite(t) || t <= 0) return null;

    // Үйлдвэрлэгч аппын цаг урдуур явж байвал сөрөг зөрүү гарна — "just now" гэе.
    const diff = Math.max(0, Date.now() - t);
    const plural = (n, unit) => `${n} ${unit}${n === 1 ? "" : "s"} ago`;

    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return plural(minutes, "minute");

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return plural(hours, "hour");

    const days = Math.floor(hours / 24);
    if (days < 30) return plural(days, "day");

    const months = Math.floor(days / 30);
    if (months < 12) return plural(months, "month");

    return plural(Math.floor(days / 365), "year");
}

// status объектыг [түлхүүрийн зам, утга] хосуудын жагсаалт болгон задална.
// Ямар ч бүтэц ирж болно — үүрлэсэн объект, массив, энгийн утга бүгд ажиллана.
function flattenStatus(value, prefix, out, depth) {
    if (out.length >= CONNECTED_STATUS_NODES) return out;

    if (value === null || value === undefined) {
        out.push([prefix, "—"]);
        return out;
    }

    const type = typeof value;
    if (type === "string" || type === "number" || type === "boolean") {
        out.push([prefix, String(value)]);
        return out;
    }

    if (Array.isArray(value)) {
        if (value.length === 0) { out.push([prefix, "—"]); return out; }
        // Энгийн утгын массивыг нэг мөрөнд нийлүүлнэ; объектын массивыг индексээр задална.
        const allPrimitive = value.every(v => v === null || typeof v !== "object");
        if (allPrimitive || depth >= CONNECTED_STATUS_DEPTH) {
            out.push([prefix, value.map(v => (v === null || v === undefined) ? "—" : String(v)).join(", ")]);
            return out;
        }
        value.forEach((v, i) => flattenStatus(v, `${prefix}[${i}]`, out, depth + 1));
        return out;
    }

    if (type !== "object") { out.push([prefix, String(value)]); return out; }

    const keys = Object.keys(value);
    if (keys.length === 0) { out.push([prefix, "—"]); return out; }
    if (depth >= CONNECTED_STATUS_DEPTH) { out.push([prefix, `{${keys.length} fields}`]); return out; }

    keys.forEach(k => flattenStatus(value[k], prefix ? `${prefix}.${k}` : k, out, depth + 1));
    return out;
}

// status-ын мөрүүд. Хэт олон бол таслаад "+N more" гэж илэн далангүй хэлнэ.
function connectedStatusHtml(status) {
    const rows = flattenStatus(status, "", [], 0);
    if (rows.length === 0) return `<div class="connected-empty">no status published</div>`;

    const shown = rows.slice(0, CONNECTED_STATUS_ROWS);
    const hidden = rows.length - shown.length;

    let html = shown
        .map(([k, v]) => `<div class="xp-row"><span>${escapeHTML(k)}</span><span>${escapeHTML(v)}</span></div>`)
        .join("");
    if (hidden > 0) html += `<div class="xp-row"><span>…</span><span>+${hidden} more</span></div>`;
    return html;
}

// Сүүлийн CONNECTED_LOG_SHOWN бичлэг, шинийг нь дээр нь.
function connectedLogHtml(log) {
    const entries = Array.isArray(log) ? log : [];
    if (entries.length === 0) return `<div class="connected-empty">no activity yet</div>`;

    return entries.slice(-CONNECTED_LOG_SHOWN).reverse().map(entry => {
        const when   = relativeTime(entry && entry.at) || "unknown time";
        // detail байхгүй бол event-ийн төрлөөр орлуулна — хоосон цэгүүд үлдээхгүй.
        const detail = (entry && (entry.detail || entry.type)) || "—";
        const xp     = Math.max(0, Math.floor(Number(entry && entry.xp)) || 0);
        return `<div class="connected-log-entry">${escapeHTML(when)} · ${escapeHTML(detail)} · <strong>+${xp} XP</strong></div>`;
    }).join("");
}

function renderConnectedApps() {
    const container = document.getElementById("connected-container");
    if (!container) return;

    container.innerHTML = "";
    const integrations = (webData && webData.integrations && typeof webData.integrations === "object")
        ? webData.integrations
        : {};

    BRIDGE_SOURCES.forEach(source => {
        const entry = integrations[source.app];

        const card = document.createElement("div");
        card.className = "category-card connected-card";
        card.dataset.app = source.app;

        // Картын өнцгийн туяаг эх сурвалжийн ур чадварын ангиллаас авна
        // (.category-card::before --tier-color-г ашигладаг).
        const skill = Array.isArray(webData.skills) ? webData.skills.find(s => s && s.id === source.skillId) : null;
        const hex = (SKILL_CAT[skill && skill.category] || {}).hex;
        if (hex) card.style.setProperty("--tier-color", hex);

        // lastSyncedAt тавигдсан гэдэг нь фийдийг нь наад зах нь нэг удаа
        // амжилттай уншсан гэсэн үг. Хэзээ ч нийтлээгүй бол — алдаа биш, чимээгүй мөр.
        if (!entry || !entry.lastSyncedAt) {
            card.innerHTML = `
                <div class="card-head">
                    <h3>${escapeHTML(source.label)}</h3>
                </div>
                <div class="connected-empty">not connected yet</div>`;
            container.appendChild(card);
            return;
        }

        const updatedAt = Number(entry.updatedAt);
        const age = isFinite(updatedAt) && updatedAt > 0 ? Date.now() - updatedAt : Infinity;
        if (age > CONNECTED_STALE_MS) card.classList.add("stale");

        card.innerHTML = `
            <div class="card-head">
                <h3>${escapeHTML(source.label)}</h3>
                <div class="connected-time">${escapeHTML(relativeTime(updatedAt) || "no updates yet")}</div>
            </div>
            <div class="connected-status">${connectedStatusHtml(entry.status)}</div>
            <div class="connected-log">${connectedLogHtml(entry.log)}</div>`;

        container.appendChild(card);
    });
}
