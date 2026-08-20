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
